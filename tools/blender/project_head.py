"""Chiếu bản vẽ ba góc (trước, nghiêng, sau) do AI vẽ lên DA ĐẦU của một tệp tủ đồ .glb có sẵn, không dựng lại lưới.

Giữ nguyên lưới/xương/morph/tên vật liệu; chỉ (1) nắn nhẹ đỉnh vùng mặt theo mốc, (2) nướng lại kết cấu màu của vật liệu `head`
và phần atlas `body` thuộc lưới `skin_head`, (3) làm nhạt kết cấu lưới `eyebrows` (lông mày đã có trong bản vẽ).

Chạy bằng Python hệ thống (cần numpy, scipy, Pillow; Python đi kèm Blender không có scipy/Pillow):
    python tools/blender/project_head.py tools/blender/ai_heads/m_head.json [--debug .tools/build/ai_head] [--no-band]
Soát bằng Blender: blender -b -P tools/blender/preview_ai_head.py -- --glb <tệp ra> --out <tiền tố ảnh>

Hệ toạ độ glTF: x = bên TRÁI nhân vật, y = lên, z = phía trước mặt. Ba góc nhìn trực giao:
    front: ngang = x,  gần máy = z lớn      side: ngang = -z, gần máy = |x| lớn (bên phải dùng ảnh lật gương)      back: ngang = -x, gần máy = z nhỏ
"""
import argparse
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai_heads"))
import head_extras as extras  # noqa: E402
from glbio import Glb  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VIEWS = ("front", "side", "back")
REF_KEYS = {"front": ("f", "fm"), "side": ("s", None), "back": ("b", "bm")}
BUFFER_H, BUFFER_V, BUFFER_RES = (-0.20, 0.20), (1.34, 1.78), 2000.0      # cửa sổ (m) và độ phân giải (px/m) của bộ đệm độ sâu
DEPTH_TOLERANCE, DEPTH_FADE = 0.003, 0.014                                 # m: sau bề mặt tới mức này vẫn coi là thấy / hết thấy
GRID_STEP = 0.002                                                          # m: lưới tính phép nắn ảnh


def smooth(low: float, high: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def view_coords(view: str, points: np.ndarray) -> tuple:
    """(ngang, cao, khoá độ sâu: lớn = gần máy) của các điểm 3D trong một góc nhìn. Góc nghiêng gập bên phải sang bên trái."""
    x, y, z = points[..., 0], points[..., 1], points[..., 2]
    if view == "front":
        return x, y, z
    if view == "side":
        return -z, y, np.abs(x)
    return -x, y, -z


def raster(xy: np.ndarray, attrs: np.ndarray, width: int, height: int, depth: np.ndarray = None) -> tuple:
    """Tô tam giác (T,3,2 toạ độ điểm ảnh) mang thuộc tính (T,3,K) vào ảnh; có `depth` (T,3) thì giữ điểm có khoá lớn nhất."""
    out = np.zeros((height, width, attrs.shape[2]), dtype=np.float32)
    mask = np.zeros((height, width), dtype=bool)
    zbuf = np.full((height, width), -np.inf, dtype=np.float32)
    for t in range(len(xy)):
        (x0, y0), (x1, y1), (x2, y2) = xy[t]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(area) < 1e-12:
            continue
        left, right = max(int(np.floor(min(x0, x1, x2))), 0), min(int(np.ceil(max(x0, x1, x2))), width - 1)
        top, bottom = max(int(np.floor(min(y0, y1, y2))), 0), min(int(np.ceil(max(y0, y1, y2))), height - 1)
        if left > right or top > bottom:
            continue
        px, py = np.meshgrid(np.arange(left, right + 1, dtype=np.float64), np.arange(top, bottom + 1, dtype=np.float64))
        w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area
        w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
        if not inside.any():
            continue
        window = (slice(top, bottom + 1), slice(left, right + 1))
        if depth is not None:
            key = w0 * depth[t, 0] + w1 * depth[t, 1] + w2 * depth[t, 2]
            inside &= key > zbuf[window]
            zbuf[window][inside] = key[inside]
        weights = np.stack([w0[inside], w1[inside], w2[inside]], axis=1).astype(np.float32)
        out[window][inside] = weights @ attrs[t]
        mask[window][inside] = True
    return out, mask, zbuf


class Primitive:
    def __init__(self, glb: Glb, mesh_name: str, primitive: dict):
        self.mesh, self.material = mesh_name, glb.material_name(primitive)
        self.position_accessor = primitive["attributes"]["POSITION"]
        self.position = glb.accessor(self.position_accessor).astype(np.float64)
        self.normal = glb.accessor(primitive["attributes"]["NORMAL"]).astype(np.float64)
        self.uv = glb.accessor(primitive["attributes"]["TEXCOORD_0"]).astype(np.float64)
        self.index = glb.accessor(primitive["indices"]).reshape(-1, 3).astype(np.int64)


def primitives(glb: Glb, mesh_name: str) -> list:
    return [Primitive(glb, mesh_name, p) for p in glb.mesh(mesh_name)["primitives"]]


class DepthBuffers:
    """Bộ đệm độ sâu + toạ độ 3D của bề mặt gần máy nhất, cho từng góc nhìn."""

    def __init__(self, triangles: np.ndarray):
        self.width = int(round((BUFFER_H[1] - BUFFER_H[0]) * BUFFER_RES))
        self.height = int(round((BUFFER_V[1] - BUFFER_V[0]) * BUFFER_RES))
        self.key, self.point, self.hit = {}, {}, {}
        for view in VIEWS:
            tris = triangles if view != "side" else triangles[(triangles[:, :, 0] > -0.002).all(axis=1)]
            h, v, key = view_coords(view, tris)
            xy = np.stack([(h - BUFFER_H[0]) * BUFFER_RES, (BUFFER_V[1] - v) * BUFFER_RES], axis=2)
            self.point[view], self.hit[view], self.key[view] = raster(xy, tris.astype(np.float32), self.width, self.height, depth=key)

    def pixel(self, h: np.ndarray, v: np.ndarray) -> tuple:
        bx = np.clip(np.round((h - BUFFER_H[0]) * BUFFER_RES).astype(np.int64), 0, self.width - 1)
        by = np.clip(np.round((BUFFER_V[1] - v) * BUFFER_RES).astype(np.int64), 0, self.height - 1)
        return by, bx

    def pick(self, view: str, h: float, v: float) -> np.ndarray:
        by, bx = self.pixel(np.array([h]), np.array([v]))
        if not self.hit[view][by[0], bx[0]]:
            raise ValueError("Mốc không chạm lưới: %s h=%.4f v=%.4f" % (view, h, v))
        return self.point[view][by[0], bx[0]].astype(np.float64)

    def visible(self, view: str, points: np.ndarray) -> np.ndarray:
        h, v, key = view_coords(view, points)
        by, bx = self.pixel(h, v)
        behind = self.key[view][by, bx] - key                 # m: điểm nằm sau bề mặt gần máy nhất bao xa
        return 1.0 - smooth(DEPTH_TOLERANCE, DEPTH_FADE, behind)  # mờ dần chứ không cắt cứng: mép che khuất không thành đường kẻ


def pick_landmarks(cfg: dict, buffers: DepthBuffers) -> dict:
    ortho = cfg["ortho"]
    scale = ortho["size"] / ortho["span"]
    out = {}
    for mark in cfg["landmarks"]:
        view, px, py = mark["pick"]
        point = buffers.pick(view, (px - ortho["size"] / 2) / scale, ortho["centre_y"] - (py - ortho["size"] / 2) / scale)
        if not any(key in mark["ref"] for key in ("fm", "bm")) and abs(point[0]) < 0.004:
            point[0] = 0.0                                   # mốc giữa mặt
        out[mark["name"]] = point
    return out


def mirror(points: np.ndarray) -> np.ndarray:
    return points * np.array([-1.0, 1.0, 1.0])


def mesh_warp_field(cfg: dict, marks: dict, skin_points: np.ndarray):
    """Trường dịch chuyển 3D mượt (thin-plate) đưa các mốc `move` về gần vị trí bản vẽ (sau khi khớp tỉ lệ đồng dạng ở góc trước).
    Chỉ dịch theo x, y (bề ngang và chiều cao); bản vẽ đối xứng hoá trái/phải để lưới vẫn đối xứng."""
    warp, refs = cfg["mesh_warp"], {m["name"]: m["ref"] for m in cfg["landmarks"]}
    mid = cfg["ref_midline_front"]

    def symmetric(name: str) -> tuple:
        ref = refs[name]
        if "fm" in ref:
            return ((ref["f"][0] - mid) + (mid - ref["fm"][0])) / 2.0, (ref["f"][1] + ref["fm"][1]) / 2.0
        return 0.0, ref["f"][1]

    rows, values = [], []
    for name in warp["fit"]:
        rx, ry = symmetric(name)
        if rx:
            rows.append([rx, 0.0])
            values.append(marks[name][0])
        rows.append([-ry, 1.0])
        values.append(marks[name][1])
    (scale, v0), *_ = np.linalg.lstsq(np.array(rows), np.array(values), rcond=None)
    print("KHỚP ĐỒNG DẠNG: %.3f điểm ảnh/mm, v0=%.4f" % (0.001 / scale, v0))
    sources, shifts, report = [], [], []
    cap = warp["cap_mm"] / 1000.0
    for name in warp["move"]:
        rx, ry = symmetric(name)
        shift = warp["gain"] * (np.array([scale * rx, v0 - scale * ry]) - marks[name][:2])
        if name in warp.get("x_only", []):
            shift[1] = 0.0
        length = float(np.linalg.norm(shift))
        if length > cap:
            shift *= cap / length
        report.append("%s (%.1f, %.1f)" % (name, shift[0] * 1000, shift[1] * 1000))
        sources.append(marks[name])
        shifts.append([shift[0], shift[1], 0.0])
        if "fm" in refs[name]:
            sources.append(mirror(marks[name]))
            shifts.append([-shift[0], shift[1], 0.0])
        else:
            shifts[-1][0] = 0.0
    print("NẮN LƯỚI (mm, x y): " + ", ".join(report))
    moved_tree = cKDTree(np.array(sources))
    distance, _ = moved_tree.query(skin_points)
    anchors = skin_points[distance > warp["anchor_distance_m"]][::6]
    centres = np.concatenate([np.array(sources), anchors])
    values = np.concatenate([np.array(shifts), np.zeros_like(anchors)])
    rbf = RBFInterpolator(centres * 1000.0, values, kernel="thin_plate_spline", smoothing=0.5)

    def field(points: np.ndarray) -> np.ndarray:
        shift = rbf(points * 1000.0)
        length = np.linalg.norm(shift, axis=1, keepdims=True)
        shift *= np.minimum(1.0, cap / np.maximum(length, 1e-9))
        puff = warp.get("cheek_puff")                         # má đầy: đẩy da quanh mốc `jaw_mouth` ra ngoài (ngang + hơi ra trước), tắt dần theo khoảng cách
        if puff:
            centre = marks["jaw_mouth"] + np.array(puff.get("offset_mm", [0.0, 0.0, 0.0])) / 1000.0
            folded = points * np.array([1.0, 1.0, 1.0])
            folded[:, 0] = np.abs(folded[:, 0])
            weight = np.exp(-(np.linalg.norm(folded - centre, axis=1) / (puff["radius_mm"] / 1000.0)) ** 2) * smooth(0.004, 0.02, folded[:, 0])
            shift[:, 0] += np.sign(points[:, 0]) * weight * puff["out_mm"] / 1000.0
            shift[:, 2] += weight * puff.get("forward_mm", 0.0) / 1000.0
        return shift * smooth(warp["zero_below_y"], warp["full_above_y"], points[:, 1])[:, None]

    return field, {name: np.array(shift) for name, shift in zip(warp["move"], [s for s, src in zip(shifts, sources) if src[0] >= 0])}


def apply_mesh_warp(glb: Glb, cfg: dict, field, marks: dict, marks_new: dict) -> np.ndarray:
    """Dịch đỉnh mọi lưới bám đầu theo trường; nhãn cầu chỉ tịnh tiến + phóng đều (để mống mắt vẫn tròn). Trả về tam giác nhãn cầu."""
    warp, written, largest = cfg["mesh_warp"], set(), 0.0
    for mesh_name in warp["follow"]:
        for primitive in glb.mesh(mesh_name)["primitives"]:
            accessor = primitive["attributes"]["POSITION"]
            if accessor in written:
                continue
            written.add(accessor)
            position = glb.accessor(accessor).astype(np.float64)
            shift = field(position)
            largest = max(largest, float(np.linalg.norm(shift, axis=1).max()))
            glb.write_accessor(accessor, position + shift)
    print("NẮN LƯỚI: dịch lớn nhất %.2f mm trên %d bộ đỉnh" % (largest * 1000, len(written)))
    eye = primitives(glb, warp["eyes"])[0]
    position = eye.position.copy()
    old_width = marks["eye_out"][0] - marks["eye_in"][0]
    new_width = marks_new["eye_out"][0] - marks_new["eye_in"][0]
    scale = float(np.clip(new_width / old_width, 1.0, warp["eye_scale_max"]))
    shift = marks_new["pupil"] - marks["pupil"]
    for sign in (1.0, -1.0):
        side = position[:, 0] * sign > 0
        centre, front = position[side].mean(axis=0), position[side][:, 2].max()
        position[side] = centre + (position[side] - centre) * scale + shift * np.array([sign, 1.0, 1.0])
        position[side, 2] -= position[side][:, 2].max() - front      # cực trước giữ nguyên độ nhô: nhãn cầu phóng to không đâm xuyên mí khi nhắm
    glb.write_accessor(eye.position_accessor, position)
    print("NHÃN CẦU: tịnh tiến (%.1f, %.1f) mm, phóng %.3f (khe mắt %.1f -> %.1f mm)" % (shift[0] * 1000, shift[1] * 1000, scale, old_width * 1000, new_width * 1000))
    return position[eye.index]


def eye_polygon(inner, upper, outer, lower) -> list:
    """Đa giác khe mắt qua bốn mốc (hai cung parabol)."""
    points = []
    for a, b, c in ((inner, upper, outer), (outer, lower, inner)):
        for t in np.linspace(0.0, 1.0, 12, endpoint=False):
            points.append(tuple(a_ * (1 - t) * (1 - 2 * t) + b_ * 4 * t * (1 - t) + c_ * t * (2 * t - 1) for a_, b_, c_ in zip(a, b, c)))
    return points


def symmetric_light_gain(colour: np.ndarray, skin: np.ndarray, midline: float, sigma: float) -> np.ndarray:
    """Hệ số (theo từng kênh màu) khử lệch sáng trái/phải của góc trước: màu tần số thấp của da được đưa về trung bình nhân với
    ảnh lật qua trục giữa (bản vẽ chiếu sáng lệch một bên thì ranh trước/nghiêng lộ thành vệt và hai nửa mặt khác màu)."""
    weight = ndimage.gaussian_filter(skin.astype(np.float32), sigma)
    low = ndimage.gaussian_filter(colour * skin[:, :, None], sigma=(sigma, sigma, 0)) / np.maximum(weight, 1e-3)[:, :, None]
    columns = np.clip(int(round(2 * midline)) - np.arange(colour.shape[1]), 0, colour.shape[1] - 1)
    gain = np.clip(np.sqrt(np.maximum(low[:, columns], 1.0) / np.maximum(low, 1.0)), 0.75, 1.4)
    trust = np.clip(np.minimum(weight, weight[:, columns]) * 2.0, 0.0, 1.0)[:, :, None]
    return 1.0 + (gain - 1.0) * trust


def prepare_sheet(cfg: dict, sheet_path: str, debug: str) -> dict:
    """Mỗi góc nhìn: ảnh màu đã khử nền (gọt viền rồi tô lan), mặt nạ tóc mềm, khoảng cách từ điểm tóc tới da gần nhất (mm)."""
    rgb = np.asarray(Image.open(sheet_path).convert("RGB"), dtype=np.float32)
    raw = rgb.copy()
    rgb[:, :, 1] = np.minimum(rgb[:, :, 1], np.maximum(rgb[:, :, 0], rgb[:, :, 2]) + 2.0)      # khử ám xanh của nền trên sợi tóc mảnh
    height, width = rgb.shape[:2]
    refs = {m["name"]: m["ref"] for m in cfg["landmarks"]}
    green = raw[:, :, 1] - np.maximum(raw[:, :, 0], raw[:, :, 2]) > cfg["key"]["green_margin"]
    labels, _count = ndimage.label(green)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, border[border > 0])            # lỗ thủng bên trong hình (không nối ra mép) giữ lại làm nhân vật
    foreground = ~background
    for x0, y0, x1, y1 in cfg["exclude_rects"] + cfg["inpaint_rects"]:
        foreground[y0:y1, x0:x1] = False
    out = {}
    for view in VIEWS:
        spec = cfg["views"][view]
        valid = foreground.copy()
        valid[:, :spec["columns"][0]] = False
        valid[:, spec["columns"][1]:] = False
        valid = ndimage.binary_erosion(valid, iterations=cfg["key"]["erode_px"])
        colour = rgb.copy()
        eyes = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(eyes)
        for key in REF_KEYS[view]:
            if key and all(key in refs[n] for n in ("eye_in", "lid_up", "eye_out", "lid_low")):
                draw.polygon(eye_polygon(*(refs[n][key] for n in ("eye_in", "lid_up", "eye_out", "lid_low"))), fill=255)
        eye_mask = np.asarray(eyes) > 0
        if cfg["eye_shrink_px"] > 0:                           # thu vào: giữ lại đường mi vẽ ở mép khe mắt
            eye_mask = ndimage.binary_erosion(eye_mask, iterations=cfg["eye_shrink_px"])
        wide = ndimage.binary_dilation(eye_mask, iterations=cfg.get("eye_clean_px", 3))      # khe mắt + đường mi: xoá hẳn nét vẽ
        far = ndimage.binary_dilation(eye_mask, iterations=cfg.get("eye_far_px", 3))         # màu da lấy từ ngoài cả vùng nếp mí sẫm
        known = valid & ~far
        _distance, nearest = ndimage.distance_transform_edt(~known, return_indices=True)
        original = colour.copy()
        colour = colour[nearest[0], nearest[1]]
        for _ in range(200):                                    # khuếch tán màu da quanh mắt vào trong (xoá mắt vẽ)
            blurred = ndimage.gaussian_filter(colour, sigma=(1.5, 1.5, 0))
            colour[far] = blurred[far]
        ring = far & ~wide & valid                              # vành nếp mí: giữ lại một phần nét vẽ (khi `blink` vùng này bị kéo giãn trên mí)
        keep = cfg.get("eye_ring_keep", 0.0)
        colour[ring] = original[ring] * keep + colour[ring] * (1.0 - keep)
        amount = cfg.get("sharpen", 0.0)
        if amount:                                              # bù độ nhoè khi phóng bản vẽ nhỏ lên kết cấu
            colour = np.clip(colour + (colour - ndimage.gaussian_filter(colour, sigma=(1.2, 1.2, 0))) * amount, 0, 255)
        soft = ndimage.gaussian_filter(colour, sigma=(2.5, 2.5, 0))
        outside = ~valid
        colour[outside] = soft[outside]
        luma = colour @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        dark = ndimage.binary_opening((luma < cfg["hair"]["max_luma"]) & valid, iterations=1)
        hair_labels, _count = ndimage.label(dark)
        seed = hair_labels[spec["hair_seed"][1], spec["hair_seed"][0]]
        if seed == 0:
            raise ValueError("Điểm gieo tóc của góc %s không nằm trên tóc" % view)
        hair = ndimage.binary_fill_holes(hair_labels == seed)
        skin = valid & ~hair & ~ndimage.binary_dilation(hair, iterations=2)
        distance = ndimage.distance_transform_edt(~skin) / cfg["hair"]["px_per_mm"]
        hair_soft = ndimage.gaussian_filter(hair[nearest[0], nearest[1]].astype(np.float32), 1.2)
        if view in cfg["hair"].get("clean_views", []):           # chân tóc vẽ không trùng lưới tóc: thay tóc vẽ bằng màu da lân cận (da sạch)
            painted = ndimage.binary_dilation(hair, iterations=5)
            _d, from_skin = ndimage.distance_transform_edt(~(valid & ~painted), return_indices=True)
            clean = colour[from_skin[0], from_skin[1]]
            clean = ndimage.gaussian_filter(clean, sigma=(9.0, 9.0, 0))
            soft_mask = ndimage.gaussian_filter(painted.astype(np.float32), 2.0)[:, :, None]
            colour = colour * (1.0 - soft_mask) + clean * soft_mask
        colour = extras.soften_beard(cfg, view, colour, skin, refs)
        if view == "front" and cfg.get("relight", {}).get("symmetrise_front", False):
            colour *= symmetric_light_gain(colour, skin, cfg["ref_midline_front"], cfg["relight"]["sigma_px"])
            if cfg["relight"].get("sigma_fine_px"):              # lượt hai, cỡ nhỏ: bóng mũi/hốc mắt lệch một bên
                colour *= symmetric_light_gain(colour, skin, cfg["ref_midline_front"], cfg["relight"]["sigma_fine_px"])
        inside = ndimage.distance_transform_edt(valid).astype(np.float32)      # px từ mép hình vào trong: sát mép là dải sáng viền, kém tin cậy
        out[view] = {"colour": colour, "hair": hair_soft, "distance": distance.astype(np.float32), "valid": valid, "inside": inside}
        if debug:
            Image.fromarray(np.clip(colour, 0, 255).astype(np.uint8)).save(os.path.join(debug, "sheet_%s_filled.jpg" % view), quality=88)
            Image.fromarray((hair_soft * 255).astype(np.uint8)).save(os.path.join(debug, "sheet_%s_hair.png" % view))
    return out


def image_warps(cfg: dict, marks: dict) -> dict:
    """Mỗi góc nhìn: lưới (ngang, cao) -> toạ độ điểm ảnh bản vẽ, nội suy thin-plate qua các mốc đã nắn."""
    hs = np.arange(BUFFER_H[0], BUFFER_H[1] + 1e-9, GRID_STEP)
    vs = np.arange(BUFFER_V[0], BUFFER_V[1] + 1e-9, GRID_STEP)
    grid = np.stack(np.meshgrid(hs, vs), axis=2).reshape(-1, 2)
    out = {}
    for view in VIEWS:
        key, key_mirror = REF_KEYS[view]
        source, target = [], []
        for mark in cfg["landmarks"]:
            for ref_key, point in ((key, marks[mark["name"]]), (key_mirror, mirror(marks[mark["name"]]))):
                if ref_key and ref_key in mark["ref"]:
                    h, v, _key = view_coords(view, point)
                    source.append([float(h), float(v)])
                    target.append(mark["ref"][ref_key])
        rbf = RBFInterpolator(np.array(source) * 1000.0, np.array(target, dtype=np.float64), kernel="thin_plate_spline", smoothing=1.0)
        out[view] = rbf(grid * 1000.0).reshape(len(vs), len(hs), 2).astype(np.float32)
        residual = np.abs(rbf(np.array(source) * 1000.0) - np.array(target)).max()
        print("NẮN ẢNH %s: %d mốc, sai số lớn nhất tại mốc %.1f điểm ảnh" % (view, len(source), residual))
        if residual > 6.0:
            raise ValueError("Mốc góc %s mâu thuẫn nhau (lệch %.1f điểm ảnh): kiểm lại toạ độ trong cấu hình" % (view, residual))
    return out


def sample_view(view: str, warps: dict, sheet: dict, points: np.ndarray) -> tuple:
    h, v, _key = view_coords(view, points)
    gx, gy = (h - BUFFER_H[0]) / GRID_STEP, (v - BUFFER_V[0]) / GRID_STEP
    px = ndimage.map_coordinates(warps[view][:, :, 0], [gy, gx], order=1, mode="nearest")
    py = ndimage.map_coordinates(warps[view][:, :, 1], [gy, gx], order=1, mode="nearest")
    data = sheet[view]
    colour = np.stack([ndimage.map_coordinates(data["colour"][:, :, c], [py, px], order=1, mode="nearest") for c in range(3)], axis=1)
    hair = ndimage.map_coordinates(data["hair"], [py, px], order=1, mode="nearest")
    distance = ndimage.map_coordinates(data["distance"], [py, px], order=1, mode="nearest")
    return colour, hair, distance


def edge_trust(cfg: dict, view: str, warps: dict, sheet: dict, points: np.ndarray) -> np.ndarray:
    """0..1: điểm lấy mẫu nằm sâu trong hình bóng của bản vẽ tới đâu (0 = ngay mép, dễ dính dải sáng viền và nét bị kéo giãn)."""
    h, v, _key = view_coords(view, points)
    gx, gy = (h - BUFFER_H[0]) / GRID_STEP, (v - BUFFER_V[0]) / GRID_STEP
    px = ndimage.map_coordinates(warps[view][:, :, 0], [gy, gx], order=1, mode="nearest")
    py = ndimage.map_coordinates(warps[view][:, :, 1], [gy, gx], order=1, mode="nearest")
    inside = ndimage.map_coordinates(sheet[view]["inside"], [py, px], order=1, mode="nearest")
    return smooth(cfg["edge"]["start_px"], cfg["edge"]["end_px"], inside)


def dump_warped_views(buffers: DepthBuffers, warps: dict, sheet: dict, debug: str) -> None:
    """Ảnh soát: bản vẽ sau khi nắn, đặt trong khung trực giao của lưới (chỗ không có lưới làm tối đi)."""
    for view in VIEWS:
        points = buffers.point[view].reshape(-1, 3).astype(np.float64)
        hs = BUFFER_H[0] + (np.arange(buffers.width) + 0.5) / BUFFER_RES
        vs = BUFFER_V[1] - (np.arange(buffers.height) + 0.5) / BUFFER_RES
        hh, vv = np.meshgrid(hs, vs)
        fake = np.zeros_like(points)                       # điểm giả có đúng (ngang, cao) của từng ô bộ đệm
        if view == "front":
            fake[:, 0], fake[:, 1] = hh.ravel(), vv.ravel()
        elif view == "side":
            fake[:, 2], fake[:, 1], fake[:, 0] = -hh.ravel(), vv.ravel(), 1.0
        else:
            fake[:, 0], fake[:, 1] = -hh.ravel(), vv.ravel()
        colour, _hair, _distance = sample_view(view, warps, sheet, fake)
        image = colour.reshape(buffers.height, buffers.width, 3)
        image[~buffers.hit[view]] *= 0.45
        Image.fromarray(np.clip(image, 0, 255).astype(np.uint8)).save(os.path.join(debug, "warped_%s.jpg" % view), quality=88)


def match_views(cfg: dict, points: np.ndarray, normals: np.ndarray, buffers: DepthBuffers, warps: dict, sheet: dict) -> None:
    """Cân màu góc nghiêng theo góc trước, rồi góc sau theo góc nghiêng, đo trên vùng da mà cả hai góc cùng thấy rõ quanh ranh."""
    angles = cfg["angles"]
    azimuth = np.degrees(np.arctan2(np.abs(points[:, 0]), points[:, 2] - angles["axis_z"]))
    facing = {"front": normals[:, 2], "side": normals[:, 0] * np.sign(points[:, 0]), "back": -normals[:, 2]}
    samples = {view: sample_view(view, warps, sheet, points) for view in VIEWS}
    good = {view: (buffers.visible(view, points) > 0.99) & (facing[view] > 0.3) & (samples[view][1] < 0.05) & (samples[view][2] < 1.0) for view in VIEWS}
    side_of = {1.0: points[:, 0] >= 0, -1.0: points[:, 0] < 0}
    for view, other, centre in (("side", "front", angles["front_side"]), ("back", "side", angles["side_back"])):
        gains = {}
        for sign, half in side_of.items():                      # cân riêng nửa trái và nửa phải: bản vẽ góc trước sáng lệch một bên
            both = good[view] & good[other] & (np.abs(azimuth - centre) < angles["blend"]) & half
            if both.sum() < 300:
                print("CÂN GÓC %s theo %s (bên %+d): chỉ %d điểm chung, bỏ qua" % (view, other, sign, both.sum()))
                gains[sign] = np.ones(3)
                continue
            reference = samples[other][0][both].mean(axis=0) * sheet[other].get("gains", {}).get(sign, 1.0)
            gains[sign] = np.clip(reference / samples[view][0][both].mean(axis=0), 0.85, 1.2)
            print("CÂN GÓC %s theo %s (bên %+d): %d điểm, hệ số %s" % (view, other, sign, both.sum(), np.round(gains[sign], 3)))
        sheet[view]["gains"] = gains


def project(cfg: dict, points: np.ndarray, normals: np.ndarray, buffers: DepthBuffers, warps: dict, sheet: dict) -> tuple:
    """Màu chiếu, độ phủ (0 = không góc nào thấy), độ-là-tóc và khoảng cách tới chân tóc cho từng điểm bề mặt."""
    angles = cfg["angles"]
    azimuth = np.degrees(np.arctan2(np.abs(points[:, 0]), points[:, 2] - angles["axis_z"]))
    half = angles["blend"] / 2.0
    w_front = 1.0 - smooth(angles["front_side"] - half, angles["front_side"] + half, azimuth)
    w_back = smooth(angles["side_back"] - half, angles["side_back"] + half, azimuth)
    sector = {"front": w_front, "side": 1.0 - w_front - w_back, "back": w_back}
    facing = {"front": normals[:, 2], "side": normals[:, 0] * np.sign(points[:, 0]), "back": -normals[:, 2]}
    mixed, cover = np.zeros((len(points), 5)), np.zeros(len(points))
    for view in VIEWS:
        colour, hair, distance = sample_view(view, warps, sheet, points)
        if "gains" in sheet[view]:
            left = smooth(-0.03, 0.03, points[:, 0])[:, None]
            colour = colour * (sheet[view]["gains"][1.0] * left + sheet[view]["gains"][-1.0] * (1.0 - left))
        channels = np.concatenate([colour, hair[:, None], distance[:, None]], axis=1)
        seen = buffers.visible(view, points) * edge_trust(cfg, view, warps, sheet, points)
        if view not in cfg.get("only_views", VIEWS):             # chỉ để soát: xem riêng phần đóng góp của từng góc
            seen = seen * 0.0
        quality = seen * smooth(0.02, 0.22, facing[view])
        mixed += channels * (sector[view] * quality)[:, None]
        cover += sector[view] * quality
        if view == "front":                                      # nếp mí gập, lỗ mũi, gầm cằm phía trước: mặt quay đi nhưng nằm ngay sau da nhìn thấy
            folded, folded_weight = channels, sector[view] * seen
    share = (1.0 - cover) * np.minimum(1.0, folded_weight / 0.5)   # -> lấy thẳng màu bản vẽ góc trước tại đó (khe mắt đã tô màu da mí)
    mixed = (mixed + folded * share[:, None]) / np.maximum(cover + share, 1e-6)[:, None]
    cover = cover + share                                        # chỗ còn lại không góc nào thấy: fill_uncovered lấy màu lân cận
    return mixed[:, :3], cover, mixed[:, 3], mixed[:, 4]


def bake(cfg: dict, prims: list, size: tuple, seam_distance: dict, buffers, warps, sheet) -> dict:
    """Nướng trong không gian UV: mỗi điểm ảnh kết cấu -> điểm 3D trên lưới -> màu chiếu."""
    width, height = size
    xy, attrs = [], []
    for prim in prims:
        uv = prim.uv[prim.index] * np.array([width, height]) - 0.5
        data = np.concatenate([prim.position, prim.normal, seam_distance[id(prim)][:, None]], axis=1)
        xy.append(uv)
        attrs.append(data[prim.index])
    buffer, mask, _z = raster(np.concatenate(xy), np.concatenate(attrs).astype(np.float32), width, height)
    texels = buffer[mask].astype(np.float64)
    normals = texels[:, 3:6] / np.maximum(np.linalg.norm(texels[:, 3:6], axis=1, keepdims=True), 1e-9)
    return {"mask": mask, "points": texels[:, :3], "normals": normals, "seam": texels[:, 6]}


def shade(cfg: dict, baked: dict, buffers, warps, sheet) -> None:
    baked["colour"], baked["cover"], baked["hair"], baked["distance"] = project(cfg, baked["points"], baked["normals"], buffers, warps, sheet)
    fill_uncovered(cfg, baked)


def fill_uncovered(cfg: dict, baked: dict) -> None:
    """Điểm không góc nào thấy rõ (khe tai, sau tai, dưới cằm, lỗ mũi) lấy màu trung bình mượt của các điểm đã phủ lân cận trong
    không gian UV (làm mờ chuẩn hoá nhiều cỡ, cỡ nhỏ trước); xa quá `fill_px` (hốc mắt, khoang miệng) thì để kết cấu cũ."""
    mask, scale = baked["mask"], mask_scale(baked)
    cover = np.zeros(mask.shape, dtype=np.float32)
    cover[mask] = np.clip(baked["cover"], 0.0, 1.0) ** 2         # điểm phủ yếu góp ít
    stack = np.zeros(mask.shape + (5,), dtype=np.float32)
    stack[mask] = np.concatenate([baked["colour"], baked["hair"][:, None], baked["distance"][:, None]], axis=1) * cover[mask][:, None]
    filled, found = np.zeros_like(stack), np.zeros(mask.shape, dtype=bool)
    for sigma in (2.0, 5.0, 12.0, float(cfg["texture"]["fill_px"])):
        weight = ndimage.gaussian_filter(cover, sigma * scale)
        blurred = ndimage.gaussian_filter(stack, sigma=(sigma * scale, sigma * scale, 0))
        use = (weight > 0.04) & ~found
        filled[use] = blurred[use] / weight[use][:, None]
        found |= use
    lack = np.where(found[mask], 1.0 - baked["cover"], 0.0)
    fill = filled[mask].astype(np.float64)
    for channel, columns in (("colour", slice(0, 3)), ("hair", 3), ("distance", 4)):
        value = baked[channel]
        weight, cover_now = (lack, baked["cover"]) if value.ndim == 1 else (lack[:, None], baked["cover"][:, None])
        baked[channel] = (value * cover_now + fill[:, columns] * weight) / np.maximum(cover_now + weight, 1e-6)
    baked["cover"] = baked["cover"] + lack


def mask_scale(baked: dict) -> float:
    return baked["mask"].shape[1] / 1024.0


def compose(cfg: dict, baked: dict, old: np.ndarray, gain: np.ndarray, band: bool) -> np.ndarray:
    """Trộn màu chiếu với kết cấu cũ: chỗ không góc nào thấy, tóc vẽ nằm sâu hơn dải chân tóc, và dải chuyển về thân."""
    hair_cfg, seam = cfg["hair"], cfg["seam"]
    base = old[baked["mask"]].astype(np.float64)
    keep = baked["cover"].copy()
    hair = np.clip(baked["hair"], 0.0, 1.0)
    in_band = 1.0 - smooth(hair_cfg["band_start_mm"], hair_cfg["band_end_mm"], baked["distance"]) if band else 0.0
    keep *= (1.0 - hair) + hair * in_band
    keep *= smooth(seam["start_m"], seam["end_m"], baked["seam"]) * smooth(seam["low_y"], seam["high_y"], baked["points"][:, 1])
    baked["keep"] = keep
    colour = baked["colour"] * gain
    knee = cfg["highlight_knee"]                                # nén vùng bóng sáng của bản vẽ (sau khi nhân hệ số dễ cháy trắng)
    peak = np.maximum(colour.max(axis=1), 1.0)                  # nén theo kênh lớn nhất và giữ tỉ lệ ba kênh: không làm đổi sắc da
    colour = np.clip(colour * (np.where(peak > knee, knee + (peak - knee) * 0.45, peak) / peak)[:, None], 0, 255)
    colour[:, 1] = np.minimum(colour[:, 1], np.maximum(colour[:, 0], colour[:, 2]) + 3.0)      # hệ số cân màu không được đẩy tóc sẫm sang ám xanh
    out = old.astype(np.float64).copy()
    out[baked["mask"]] = base + (colour - base) * keep[:, None]
    return out


def pad(image: np.ndarray, mask: np.ndarray, reach: int, protect: np.ndarray = None) -> np.ndarray:
    """Tô lan màu ra ngoài đảo UV `reach` điểm ảnh (không đụng vùng `protect`): chống viền khi lọc mip."""
    distance, nearest = ndimage.distance_transform_edt(~mask, return_indices=True)
    ring = ~mask & (distance <= reach)
    if protect is not None:
        ring &= ~protect
    out = image.copy()
    out[ring] = image[nearest[0][ring], nearest[1][ring]]
    return out


def encode_jpeg(image: np.ndarray, quality: int) -> bytes:
    stream = io.BytesIO()
    Image.fromarray(np.clip(np.round(image), 0, 255).astype(np.uint8)).save(stream, "JPEG", quality=quality, optimize=True)
    return stream.getvalue()


def green_pixels(image: np.ndarray) -> int:
    return int(((image[:, :, 1] - np.maximum(image[:, :, 0], image[:, :, 2])) > 6).sum())


def fade_eyebrows(glb: Glb, alpha: float) -> None:
    index = glb.material_image("eyebrows")
    image = np.asarray(Image.open(io.BytesIO(glb.image_bytes(index))).convert("RGBA")).copy()
    image[:, :, 3] = np.round(image[:, :, 3] * alpha).astype(np.uint8)
    stream = io.BytesIO()
    Image.fromarray(image).save(stream, "PNG", optimize=True)
    glb.replace_image(index, stream.getvalue(), "image/png")


def seam_distances(glb: Glb, head_prims: list) -> dict:
    """Khoảng cách (m) từ mỗi đỉnh skin_head tới mép nối với các lưới da khác (đỉnh trùng vị trí)."""
    others = np.concatenate([p.position for name in ("skin_torso", "skin_upperarm") for p in primitives(glb, name)])
    all_head = np.concatenate([p.position for p in head_prims])
    near, _ = cKDTree(others).query(all_head)
    edge = all_head[near < 1e-5]
    print("MÉP NỐI: %d đỉnh skin_head trùng skin_torso/skin_upperarm" % len(edge))
    if len(edge) < 8:
        raise ValueError("Không tìm thấy mép nối skin_head với thân: dải chuyển màu về atlas cũ sẽ không hoạt động")
    tree = cKDTree(edge)
    return {id(p): tree.query(p.position)[0] for p in head_prims}


def body_users(glb: Glb, size: tuple) -> np.ndarray:
    """Vùng atlas `body` mà các lưới KHÁC skin_head đang dùng (không được tô lan đè lên)."""
    xy = []
    for mesh in glb.json["meshes"]:
        if mesh["name"] == "skin_head":
            continue
        for primitive in mesh["primitives"]:
            if glb.material_name(primitive) == "body":
                prim = Primitive(glb, mesh["name"], primitive)
                xy.append(prim.uv[prim.index] * np.array(size) - 0.5)
    tris = np.concatenate(xy)
    _out, mask, _z = raster(tris, np.zeros((len(tris), 3, 1), dtype=np.float32), size[0], size[1])
    return ndimage.binary_dilation(mask, iterations=3)


def update_manifest(cfg: dict, size: int) -> None:
    path = os.path.join(ROOT, cfg["manifest"])
    with open(path, encoding="utf-8") as f:
        manifest = json.load(f)
    entry = dict(manifest["wardrobe"][cfg["manifest_from"]])
    entry["file"], entry["bytes"] = os.path.basename(cfg["output_glb"]), size
    previous = manifest["wardrobe"].get(cfg["manifest_key"], {})
    if "heads" in previous:                                     # danh sách mặt do pack_head.py ghi: giữ lại (nhớ chạy lại pack_head sau khi dựng lại mặt số 1)
        entry["heads"] = previous["heads"]
    manifest["wardrobe"][cfg["manifest_key"]] = entry
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("config")
    parser.add_argument("--debug", default="")
    parser.add_argument("--no-band", action="store_true", help="không vẽ dải chân tóc: da đầu sạch (kết cấu cũ) dưới mọi kiểu tóc")
    parser.add_argument("--no-manifest", action="store_true")
    parser.add_argument("--only-views", default="", help="soát lỗi: chỉ dùng các góc này (vd front,side); chỗ khác giữ kết cấu cũ")
    parser.add_argument("--output", default="", help="ghi ra tệp khác với cấu hình (dùng khi soát lỗi)")
    args = parser.parse_args()
    with open(args.config, encoding="utf-8") as f:
        cfg = json.load(f)
    if args.only_views:
        cfg["only_views"] = tuple(args.only_views.split(","))
    if args.output:
        cfg["output_glb"] = args.output
    if args.debug:
        os.makedirs(args.debug, exist_ok=True)
    source, output = os.path.join(ROOT, cfg["source_glb"]), os.path.abspath(os.path.join(ROOT, cfg["output_glb"]))
    same = os.path.normcase(os.path.abspath(source)) == os.path.normcase(output) or (os.path.exists(output) and os.path.samefile(source, output))
    if same or not output.lower().endswith(".glb"):
        raise ValueError("Tệp ra phải là một tệp .glb khác tệp nguồn: %s" % output)
    is_trial = bool(args.only_views or args.output)             # chạy soát lỗi: không bao giờ đụng manifest
    glb = Glb(source)
    global BUFFER_V                                             # cửa sổ bộ đệm bám theo độ cao đầu của nhân vật (nam/nữ cao khác nhau)
    BUFFER_V = (cfg["ortho"]["centre_y"] - 0.24, cfg["ortho"]["centre_y"] + 0.20)

    # 1. mốc trên lưới gốc, nắn lưới
    head_prims = primitives(glb, "skin_head")
    skin_tris = np.concatenate([p.position[p.index] for p in head_prims])
    eye_prim = primitives(glb, cfg["mesh_warp"]["eyes"])[0]
    marks = pick_landmarks(cfg, DepthBuffers(np.concatenate([skin_tris, eye_prim.position[eye_prim.index]])))      # nhãn cầu chặn tia: mốc mắt không rơi vào đáy hốc mắt
    carry = extras.apply_rest_morphs(glb, cfg)                  # mặt trẻ: hình nghỉ nhận một phần morph tuổi; mốc dời theo
    if cfg.get("rest_morphs"):
        marks = dict(zip(marks, carry(np.array(list(marks.values())))))
        head_prims = primitives(glb, "skin_head")
    field, _shifts = mesh_warp_field(cfg, marks, np.concatenate([p.position for p in head_prims]))
    names = list(marks)
    moved = np.array([marks[n] for n in names])
    marks_new = dict(zip(names, moved + field(moved)))
    apply_mesh_warp(glb, cfg, field, marks, marks_new)
    extras.close_lips(glb, cfg)
    extras.narrow_eyes(glb, cfg)

    # 2. lưới đã nắn: bộ đệm độ sâu (da đầu + nhãn cầu che hốc mắt), phép nắn ảnh
    head_prims = primitives(glb, "skin_head")
    eye_prim = primitives(glb, cfg["mesh_warp"]["eyes"])[0]
    buffers = DepthBuffers(np.concatenate([p.position[p.index] for p in head_prims] + [eye_prim.position[eye_prim.index]]))
    warps = image_warps(cfg, marks_new)
    sheet = prepare_sheet(cfg, os.path.join(os.path.dirname(os.path.abspath(args.config)), cfg["sheet"]), args.debug)
    seam = seam_distances(glb, head_prims)
    if args.debug:
        dump_warped_views(buffers, warps, sheet, args.debug)

    # 3. nướng vật liệu head (phóng to) rồi phần skin_head trong atlas body
    head_index, body_index = glb.material_image("head"), glb.material_image("body")
    head_size = tuple(cfg["texture"]["head_size"])
    head_old_small = Image.open(io.BytesIO(glb.image_bytes(head_index))).convert("RGB")
    head_old = np.asarray(head_old_small.resize(head_size, Image.BICUBIC), dtype=np.float64)
    body_old = np.asarray(Image.open(io.BytesIO(glb.image_bytes(body_index))).convert("RGB"), dtype=np.float64)
    head_baked = bake(cfg, [p for p in head_prims if p.material == "head"], head_size, seam, buffers, warps, sheet)
    body_size = (body_old.shape[1], body_old.shape[0])
    body_baked = bake(cfg, [p for p in head_prims if p.material == "body"], body_size, seam, buffers, warps, sheet)
    match_views(cfg, np.concatenate([head_baked["points"][::9], body_baked["points"][::3]]),
                np.concatenate([head_baked["normals"][::9], body_baked["normals"][::3]]), buffers, warps, sheet)
    shade(cfg, head_baked, buffers, warps, sheet)
    shade(cfg, body_baked, buffers, warps, sheet)
    box, points = cfg["cheek_box"], head_baked["points"]
    cheek = ((np.abs(points[:, 0]) > box["x"][0]) & (np.abs(points[:, 0]) < box["x"][1]) & (points[:, 1] > box["y"][0]) & (points[:, 1] < box["y"][1])
             & (points[:, 2] > box["z_min"]) & (head_baked["cover"] > 0.95))
    if cheek.sum() < 100:
        raise ValueError("Vùng má dùng để cân màu không được góc nào phủ (kiểm cheek_box / only-views)")
    old_cheek = head_old[head_baked["mask"]][cheek].mean(axis=0)
    cheek_colour = head_baked["colour"][cheek].mean(axis=0)
    gain = old_cheek / cheek_colour
    ear_gain = extras.balance_ears(cfg, head_baked, marks_new, cheek_colour)
    extras.balance_ears(cfg, body_baked, marks_new, cheek_colour, ear_gain)
    print("CÂN MÀU: má cũ %s, má chiếu %s, hệ số %s" % (np.round(old_cheek, 1), np.round(cheek_colour, 1), np.round(gain, 3)))
    band = not args.no_band
    head_new, body_new = compose(cfg, head_baked, head_old, gain, band), compose(cfg, body_baked, body_old, gain, band)
    extras.blend_material_seam(glb, cfg, next(p for p in head_prims if p.material == "head"), next(p for p in head_prims if p.material == "body"),
                               head_new, head_baked, body_new, body_baked)
    head_new = pad(head_new, head_baked["mask"], 4096)
    luma = np.array([0.299, 0.587, 0.114])
    ratio = float(head_new[head_baked["mask"]][cheek].mean(axis=0) @ luma / (old_cheek @ luma))
    print("ĐỘ SÁNG MÁ mới/cũ = %.3f (yêu cầu 0,95..1,05)" % ratio)
    if not 0.95 <= ratio <= 1.05:
        raise ValueError("Độ sáng vùng má lệch khỏi kết cấu cũ quá 5%%: %.3f" % ratio)
    body_new = pad(body_new, body_baked["mask"], 6, protect=body_users(glb, body_size))

    # 4. kiểm màu nền, ghi tệp
    for name, image, before in (("head", head_new, head_old), ("body", body_new, body_old)):
        count, was = green_pixels(image), green_pixels(before)
        print("ĐIỂM ẢNH SẮC XANH LÁ trong %s: %d (kết cấu cũ có sẵn %d)" % (name, count, was))
        if count > was:
            raise ValueError("Màu nền lọt vào kết cấu %s" % name)
    glb.replace_image(head_index, encode_jpeg(head_new, cfg["texture"]["jpeg_quality"]))
    glb.replace_image(body_index, encode_jpeg(body_new, cfg["texture"]["body_jpeg_quality"]))
    fade_eyebrows(glb, cfg["eyebrow_alpha"])
    extras.shade_eyes(glb, cfg)
    extras.flatten_head_normal(glb, cfg)
    extras.hair_follow_morphs(glb, cfg)
    glb.save(output + ".tmp")                                   # ghi tạm rồi đổi tên: hỏng giữa chừng không để lại tệp cụt
    os.replace(output + ".tmp", output)
    size = os.path.getsize(output)
    print("XONG %s: %.2f MB (gốc %.2f MB)" % (output, size / 1e6, os.path.getsize(source) / 1e6))
    if not args.no_manifest and not is_trial:
        update_manifest(cfg, size)
    if args.debug:
        suffix = "" if band else "_noband"
        for name, baked in (("head", head_baked), ("body", body_baked)):
            for channel in ("keep", "cover", "hair"):
                image = np.zeros(baked["mask"].shape, dtype=np.uint8)
                image[baked["mask"]] = np.clip(baked[channel] * 255, 0, 255)
                Image.fromarray(image).resize((image.shape[1] // 2, image.shape[0] // 2)).save(os.path.join(args.debug, "dbg_%s_%s.png" % (name, channel)))
        Image.fromarray(np.clip(head_new, 0, 255).astype(np.uint8)).save(os.path.join(args.debug, "head_color%s.jpg" % suffix), quality=90)
        Image.fromarray(np.clip(body_new, 0, 255).astype(np.uint8)).save(os.path.join(args.debug, "body_color%s.jpg" % suffix), quality=90)


if __name__ == "__main__":
    main()
