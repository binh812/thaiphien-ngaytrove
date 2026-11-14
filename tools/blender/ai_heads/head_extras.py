"""Các bước phụ của project_head.py (lượt 2): khép môi, tóc theo morph tuổi, bóng mi trên lòng trắng mắt, cân màu tai,
giảm mảng râu của bản vẽ, pha màu hai bên ranh vật liệu head/body. Mỗi bước chỉ chạy khi cấu hình có khoá tương ứng."""
import io

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import cKDTree

from glbio import Glb


def smooth(low: float, high: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def close_lips(glb: Glb, cfg: dict) -> None:
    """Khép khe miệng lúc nghỉ: môi trên dịch xuống, môi dưới dịch lên mỗi bên `overlap_mm` quanh đường khép (chồng nhẹ lên nhau).
    Môi trên/dưới phân biệt bằng pháp tuyến ở mép môi (mép môi trên quay xuống, mép môi dưới quay lên); ở khoé miệng pháp tuyến nằm
    ngang nên độ dịch tự tắt. Vùng miệng nhận ra nhờ morph `smile_open` (chỗ khác morph này bằng 0). Morph là độ lệch tương đối
    nên `smile_open` vẫn hở răng (hở ít hơn đúng bằng phần chồng)."""
    spec = cfg.get("lip_close")
    if not spec:
        return
    mesh = glb.mesh("skin_head")
    parts = []
    for primitive in mesh["primitives"]:
        accessor = primitive["attributes"]["POSITION"]
        parts.append((accessor, glb.accessor(accessor).astype(np.float64), glb.accessor(primitive["attributes"]["NORMAL"])[:, 1].astype(np.float64),
                      np.abs(glb.accessor(glb.morph_accessor(mesh, primitive, "smile_open"))).max(axis=1)))
    everything = np.concatenate([p[1] for p in parts])
    normal_y, active = np.concatenate([p[2] for p in parts]), np.concatenate([p[3] for p in parts]) > 0.0003
    upper, lower = everything[active & (normal_y < -0.5)], everything[active & (normal_y > 0.5)]
    if len(upper) < 10 or len(lower) < 10:
        raise ValueError("Không nhận ra mép môi trên/dưới")
    gap, _ = cKDTree(lower).query(upper)
    crease = upper[gap < 0.0025]                              # mép dưới của môi trên: nằm sát mép môi dưới
    if len(crease) < 6:
        raise ValueError("Không tìm thấy đường khép môi")
    tree, overlap, moved = cKDTree(crease), spec["overlap_mm"] / 1000.0, 0.0
    for accessor, position, ny, _active in parts:
        distance, _ = tree.query(position)
        weight = 1.0 - smooth(0.0015, spec["reach_mm"] / 1000.0, distance)
        shift = overlap * weight * (2.0 * smooth(-0.25, 0.25, ny) - 1.0)      # mép quay lên (môi dưới) +, mép quay xuống (môi trên) -
        position[:, 1] += shift
        moved = max(moved, float(np.abs(shift).max()))
        glb.write_accessor(accessor, position)
    narrow = spec.get("teeth_narrow", 1.0)
    if narrow != 1.0:                                           # hàm răng thu hẹp bề ngang: răng hàm không còn ló ở hai khoé miệng
        accessor = glb.mesh("teeth")["primitives"][0]["attributes"]["POSITION"]
        teeth = glb.accessor(accessor).astype(np.float64)
        teeth[:, 0] *= narrow
        glb.write_accessor(accessor, teeth)
    print("KHÉP MÔI: %d đỉnh đường khép, dịch lớn nhất %.2f mm mỗi môi, răng thu ngang %.2f" % (len(crease), moved * 1000, narrow))


def hair_follow_morphs(glb: Glb, cfg: dict) -> None:
    """Cho lưới tóc theo morph tuổi của da đầu (trước đây độ lệch của tóc bị đặt 0 nên chân tóc vẽ lộ ra khi đầu đổi hình):
    mỗi đỉnh tóc nhận trung bình có trọng số độ lệch của các đỉnh skin_head gần nhất."""
    names = cfg.get("hair_follow_morphs", [])
    if not names:
        return
    skin = glb.mesh("skin_head")
    skin_position = np.concatenate([glb.accessor(p["attributes"]["POSITION"]).astype(np.float64) for p in skin["primitives"]])
    tree = cKDTree(skin_position)
    for mesh in glb.json["meshes"]:
        if not mesh["name"].startswith("hair_"):
            continue
        for primitive in mesh["primitives"]:
            position = glb.accessor(primitive["attributes"]["POSITION"]).astype(np.float64)
            distance, nearest = tree.query(position, k=6)
            weight = 1.0 / (distance + 0.002) ** 2
            weight /= weight.sum(axis=1, keepdims=True)
            for name in names:
                skin_delta = np.concatenate([glb.accessor(glb.morph_accessor(skin, p, name)).astype(np.float64) for p in skin["primitives"]])
                delta = (skin_delta[nearest] * weight[:, :, None]).sum(axis=1)
                glb.make_dense(glb.morph_accessor(mesh, primitive, name), delta)
    print("TÓC THEO MORPH: %s" % ", ".join(names))


def shade_eyes(glb: Glb, cfg: dict) -> None:
    """Vẽ thêm vào kết cấu `eyes`: bóng mi trên (tối dần lên phía trên mống mắt) và lòng trắng tối dần về hai khoé."""
    spec = cfg.get("eye_shade")
    if not spec:
        return
    primitive = glb.mesh(cfg["mesh_warp"]["eyes"])["primitives"][0]
    position = glb.accessor(primitive["attributes"]["POSITION"]).astype(np.float64)
    uv = glb.accessor(primitive["attributes"]["TEXCOORD_0"]).astype(np.float64)
    index = glb.material_image("eyes")
    image = np.asarray(Image.open(io.BytesIO(glb.image_bytes(index))).convert("RGB"), dtype=np.float64).copy()
    height, width = image.shape[:2]
    vs, us = np.meshgrid((np.arange(height) + 0.5) / height, (np.arange(width) + 0.5) / width, indexing="ij")
    for sign in (1.0, -1.0):
        side = np.nonzero(position[:, 0] * sign > 0)[0]
        pole = side[np.argmax(position[side, 2])]
        near = side[np.linalg.norm(position[side] - position[pole], axis=1) < 0.009]
        offsets = np.stack([position[near, 0] - position[pole, 0], position[near, 1] - position[pole, 1]], axis=1)
        to_uv, *_ = np.linalg.lstsq(offsets, uv[near] - uv[pole], rcond=None)      # (dx, dy) m -> (du, dv)
        to_metres = np.linalg.inv(to_uv)
        local = np.stack([us - uv[pole, 0], vs - uv[pole, 1]], axis=2) @ to_metres   # toạ độ quanh cực trước của nhãn cầu (m)
        reach = np.linalg.norm(local, axis=2) < 0.016
        lid = spec["top"] * smooth(0.0012, 0.0055, local[:, :, 1])
        corner = spec["corner"] * smooth(0.0055, 0.012, np.abs(local[:, :, 0]))
        factor = (1.0 - lid) * (1.0 - corner)
        image[reach] *= factor[reach][:, None]
    stream = io.BytesIO()
    Image.fromarray(np.clip(np.round(image), 0, 255).astype(np.uint8)).save(stream, "JPEG", quality=92)
    glb.replace_image(index, stream.getvalue())
    print("MẮT: thêm bóng mi %.2f, tối khoé %.2f" % (spec["top"], spec["corner"]))


def soften_beard(cfg: dict, view: str, colour: np.ndarray, skin: np.ndarray, refs: dict) -> np.ndarray:
    """Giảm mảng râu xám của bản vẽ quanh miệng–cằm: thay màu tần số thấp bằng tông da lân cận (má, trên cằm), chỉ giữ lại một
    phần chi tiết nhỏ (chấm râu). Môi được chừa ra."""
    spec = cfg.get("debeard")
    if not spec or view == "back":
        return colour
    height, width = colour.shape[:2]
    area, lips = Image.new("L", (width, height), 0), Image.new("L", (width, height), 0)
    draw, draw_lips = ImageDraw.Draw(area), ImageDraw.Draw(lips)

    def ellipse(pen, cx, cy, rx, ry):
        pen.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)

    if view == "front":
        mid = cfg["ref_midline_front"]
        top, bottom = refs["subnasale"]["f"][1], refs["chin_bottom"]["f"][1]
        half = max(refs["jaw_mouth"]["f"][0] - mid, mid - refs["jaw_mouth"]["fm"][0])
        ellipse(draw, mid, (top + bottom) / 2 + 4, half * 0.92, (bottom - top) / 2 + 14)
        mouth = (refs["mouth_corner"]["f"][0] - refs["mouth_corner"]["fm"][0]) / 2
        ellipse(draw_lips, mid, (refs["lip_top"]["f"][1] + refs["lip_bottom"]["f"][1]) / 2, mouth + 2, (refs["lip_bottom"]["f"][1] - refs["lip_top"]["f"][1]) / 2 + 1)
        limit = bottom + 6
    else:
        top, bottom = refs["subnasale"]["s"][1], refs["chin_bottom"]["s"][1]
        front, back = refs["lip_top"]["s"][0], refs["jaw_angle"]["s"][0]
        ellipse(draw, (front + back) / 2 - 10, (top + bottom) / 2 + 4, (back - front) / 2 + 22, (bottom - top) / 2 + 16)
        ellipse(draw_lips, (refs["lip_line"]["s"][0] + refs["mouth_corner"]["s"][0]) / 2, (refs["lip_top"]["s"][1] + refs["lip_bottom"]["s"][1]) / 2,
                (refs["mouth_corner"]["s"][0] - refs["lip_line"]["s"][0]) / 2 + 6, (refs["lip_bottom"]["s"][1] - refs["lip_top"]["s"][1]) / 2 + 1)
        limit = bottom + 6
    core = (np.asarray(area) > 0) & ~(np.asarray(lips) > 0)
    soft = ndimage.gaussian_filter(core.astype(np.float32), 5.0) * (1.0 - ndimage.gaussian_filter((np.asarray(lips) > 0).astype(np.float32), 1.5))
    donor = skin & ~ndimage.binary_dilation(np.asarray(area) > 0, iterations=3) & ~(np.asarray(lips) > 0)
    donor[int(limit):] = False                                 # không lấy tông cổ (tối hơn) làm chuẩn
    sigma = spec["donor_sigma_px"]                             # một cỡ làm mờ duy nhất, đủ rộng để phủ kín vùng râu: tông da lân cận liền mạch
    weight = ndimage.gaussian_filter(donor.astype(np.float32), sigma, truncate=6.0)
    tone = ndimage.gaussian_filter(colour * donor[:, :, None], sigma=(sigma, sigma, 0), truncate=6.0) / np.maximum(weight, 1e-6)[:, :, None]
    found = weight > 1e-5
    low = ndimage.gaussian_filter(colour, sigma=(spec["detail_sigma_px"], spec["detail_sigma_px"], 0))
    cleaned = tone + (colour - low) * spec["detail"]
    mix = (soft * spec["strength"] * found)[:, :, None]
    return colour * (1.0 - mix) + cleaned * mix


def balance_ears(cfg: dict, baked: dict, marks: dict, cheek_colour: np.ndarray, gain: np.ndarray = None) -> np.ndarray:
    """Đưa tông trung bình của tai về gần tông má (bản vẽ góc nghiêng thường cho tai đỏ sẫm hơn mặt)."""
    spec = cfg.get("ear_balance")
    if not spec:
        return None
    centre = np.mean([marks[name] for name in ("ear_top", "ear_back", "ear_lobe", "tragus")], axis=0)
    points = baked["points"] * np.array([1.0, 1.0, 1.0])
    folded = points.copy()
    folded[:, 0] = np.abs(folded[:, 0])
    radius = spec["radius_mm"] / 1000.0
    weight = 1.0 - smooth(radius, radius * 1.5, np.linalg.norm(folded - centre, axis=1))
    if gain is None:                                          # đo trên kết cấu head; phần atlas body quanh tai dùng lại đúng hệ số đó
        chosen = (weight > 0.9) & (baked["cover"] > 0.9) & (baked["hair"] < 0.1)
        if chosen.sum() < 200:
            raise ValueError("Không đủ điểm vùng tai để cân màu (kiểm mốc tai)")
        if spec.get("robust", False):                           # bỏ điểm tối (tóc mai, khe tai) khỏi phép đo rồi lấy trung vị, và chặn hệ số: tai không bị tẩy trắng
            luma = baked["colour"] @ np.array([0.299, 0.587, 0.114])
            chosen &= luma > 0.7 * float(cheek_colour @ np.array([0.299, 0.587, 0.114]))
            ear_colour = np.median(baked["colour"][chosen], axis=0)
            gain = np.clip(1.0 + (cheek_colour * spec["brightness"] / ear_colour - 1.0) * spec["amount"], 0.85, 1.15)
        else:
            ear_colour = baked["colour"][chosen].mean(axis=0)
            gain = 1.0 + (cheek_colour * spec["brightness"] / ear_colour - 1.0) * spec["amount"]
        print("CÂN TAI: tai %s, má %s, hệ số %s" % (np.round(ear_colour, 1), np.round(cheek_colour, 1), np.round(gain, 3)))
    baked["colour"] = baked["colour"] * (1.0 + (gain - 1.0) * (weight * (1.0 - np.clip(baked["hair"], 0, 1)))[:, None])
    return gain


def _bilinear(image: np.ndarray, uv: np.ndarray) -> np.ndarray:
    x, y = uv[:, 0] * image.shape[1] - 0.5, uv[:, 1] * image.shape[0] - 0.5
    return np.stack([ndimage.map_coordinates(image[:, :, c], [y, x], order=1, mode="nearest") for c in range(3)], axis=1)


def match_surface_at_seam(glb: Glb, cfg: dict, weight_image: np.ndarray) -> None:
    """Sát ranh với vật liệu body (không có normal/ORM, độ nhám là hằng số), đưa normal của head về phẳng và AO/nhám về đúng hằng số
    của body: hết đường bóng sáng chạy dọc bờ hàm do hai vật liệu phản xạ khác nhau."""
    body = next(m for m in glb.json["materials"] if m["name"] == "body")["pbrMetallicRoughness"]
    targets = {"normalTexture": (128.0, 128.0, 255.0),
               "metallicRoughnessTexture": (255.0, body.get("roughnessFactor", 1.0) * 255.0, body.get("metallicFactor", 1.0) * 255.0)}
    for slot, flat in targets.items():
        index = glb.material_image("head", slot)
        image = np.asarray(Image.open(io.BytesIO(glb.image_bytes(index))).convert("RGB"), dtype=np.float64)
        weight = np.asarray(Image.fromarray((weight_image * 255).astype(np.uint8)).resize((image.shape[1], image.shape[0]), Image.BILINEAR), dtype=np.float64)[:, :, None] / 255.0
        image = image * (1.0 - weight) + np.array(flat) * weight
        stream = io.BytesIO()
        Image.fromarray(np.clip(np.round(image), 0, 255).astype(np.uint8)).save(stream, "JPEG", quality=92)
        glb.replace_image(index, stream.getvalue())


def blend_material_seam(glb: Glb, cfg: dict, head_prim, body_prim, head_image: np.ndarray, head_baked: dict, body_image: np.ndarray, body_baked: dict) -> None:
    """Pha màu hai bên ranh vật liệu head/body: tại ranh, mỗi kết cấu được cộng nửa độ chênh so với kết cấu bên kia, tắt dần trong
    `seam_blend_mm`. Bỏ qua chỗ chênh quá lớn (vành hốc mắt nối vào túi mắt đỏ của atlas)."""
    reach = cfg.get("seam_blend_mm", 0.0) / 1000.0
    if reach <= 0:
        return
    distance, partner = cKDTree(body_prim.position).query(head_prim.position)
    shared = distance < 1e-6
    points, uv_head, uv_body = [], [], []
    for triangle in head_prim.index:
        for a, b in ((0, 1), (1, 2), (2, 0)):
            i, j = triangle[a], triangle[b]
            if shared[i] and shared[j]:
                steps = max(2, int(np.linalg.norm(head_prim.position[i] - head_prim.position[j]) / 0.0004))
                t = np.linspace(0.0, 1.0, steps)[:, None]
                points.append(head_prim.position[i] * (1 - t) + head_prim.position[j] * t)
                uv_head.append(head_prim.uv[i] * (1 - t) + head_prim.uv[j] * t)
                uv_body.append(body_prim.uv[partner[i]] * (1 - t) + body_prim.uv[partner[j]] * t)
    points, uv_head, uv_body = np.concatenate(points), np.concatenate(uv_head), np.concatenate(uv_body)
    on_head, on_body = _bilinear(head_image, uv_head), _bilinear(body_image, uv_body)
    fair = np.abs(on_head - on_body).max(axis=1) < 45.0
    if fair.sum() < 50:
        print("PHA RANH: không đủ điểm ranh hợp lệ, bỏ qua")
        return
    points, on_head, on_body = points[fair], on_head[fair], on_body[fair]
    middle, tree = (on_head + on_body) / 2.0, cKDTree(points)
    print("PHA RANH head/body: %d điểm ranh, chênh trung bình %.1f mức" % (len(points), float(np.abs(on_head - on_body).mean())))
    wide, _which = tree.query(head_baked["points"], distance_upper_bound=reach * 2.0)      # normal/ORM: dải rộng gấp đôi
    surface = np.zeros(head_baked["mask"].shape, dtype=np.float32)
    surface[head_baked["mask"]] = np.where(np.isfinite(wide), 1.0 - smooth(reach * 0.5, reach * 2.0, np.where(np.isfinite(wide), wide, reach * 2.0)), 0.0)
    _distance, nearest = ndimage.distance_transform_edt(~head_baked["mask"], return_indices=True)
    match_surface_at_seam(glb, cfg, surface[nearest[0], nearest[1]])
    for image, baked, own in ((head_image, head_baked, on_head), (body_image, body_baked, on_body)):
        near, which = tree.query(baked["points"], distance_upper_bound=reach)
        inside = np.isfinite(near)
        weight = (1.0 - smooth(0.0, reach, near[inside]))[:, None]
        values = image[baked["mask"]]
        values[inside] = values[inside] + (middle[which[inside]] - own[which[inside]]) * weight
        image[baked["mask"]] = values


def narrow_eyes(glb: Glb, cfg: dict) -> None:
    """Thu khe mắt lúc nghỉ: cộng một phần morph `blink` vào hình gốc của mọi lưới có morph này (da, lông mi) và giảm morph đi đúng
    phần đó, nên `blink`=1 vẫn nhắm khít như cũ."""
    share = cfg.get("eye_rest_blink", 0.0)
    if share <= 0:
        return
    done = set()
    for mesh in glb.json["meshes"]:
        names = mesh.get("extras", {}).get("targetNames", [])
        if "blink" not in names:
            continue
        for primitive in mesh["primitives"]:
            accessor, target = primitive["attributes"]["POSITION"], glb.morph_accessor(mesh, primitive, "blink")
            if accessor in done:
                continue
            done.add(accessor)
            delta = glb.accessor(target).astype(np.float64)
            if np.abs(delta).max() < 1e-6:
                continue
            glb.write_accessor(accessor, glb.accessor(accessor).astype(np.float64) + delta * share)
            glb.make_dense(target, delta * (1.0 - share))
    print("KHE MẮT: hình gốc nhận %.0f%% morph blink" % (share * 100))


HEAD_MESH_PREFIXES = ("skin_head", "eyes", "eyebrows", "eyelashes", "teeth", "hair_", "glasses_")


def apply_rest_morphs(glb: Glb, cfg: dict):
    """Nướng một phần morph có sẵn (vd `age_teen` 0,4 cho mặt trẻ) vào hình nghỉ của các lưới ĐẦU; tắt dần về 0 ở cổ để mép nối với
    thân không hở. Lưới không có độ lệch riêng cho morph đó (tóc, kính) lấy theo đỉnh da đầu gần nhất. Morph target giữ nguyên.
    Trả về hàm chuyển một tập điểm trên da đầu cũ sang vị trí mới (để dời mốc)."""
    spec = cfg.get("rest_morphs", {})
    if not spec:
        return lambda points: points
    warp = cfg["mesh_warp"]
    skin = glb.mesh("skin_head")
    skin_position = np.concatenate([glb.accessor(p["attributes"]["POSITION"]).astype(np.float64) for p in skin["primitives"]])
    skin_shift = np.zeros_like(skin_position)
    for name, amount in spec.items():
        skin_shift += amount * np.concatenate([glb.accessor(glb.morph_accessor(skin, p, name)).astype(np.float64) for p in skin["primitives"]])
    tree = cKDTree(skin_position)

    def fade(points: np.ndarray) -> np.ndarray:
        return smooth(warp["zero_below_y"], warp["full_above_y"], points[:, 1])[:, None]

    def from_skin(points: np.ndarray) -> np.ndarray:
        distance, nearest = tree.query(points, k=6)
        weight = 1.0 / (distance + 0.002) ** 2
        weight /= weight.sum(axis=1, keepdims=True)
        return (skin_shift[nearest] * weight[:, :, None]).sum(axis=1)

    done = set()
    for mesh in glb.json["meshes"]:
        if not mesh["name"].startswith(HEAD_MESH_PREFIXES) or "targetNames" not in mesh.get("extras", {}):
            continue
        for primitive in mesh["primitives"]:
            accessor = primitive["attributes"]["POSITION"]
            if accessor in done:
                continue
            done.add(accessor)
            position = glb.accessor(accessor).astype(np.float64)
            own = sum(amount * glb.accessor(glb.morph_accessor(mesh, primitive, name)).astype(np.float64) for name, amount in spec.items())
            shift = own if np.abs(own).max() > 1e-6 else from_skin(position)
            glb.write_accessor(accessor, position + shift * fade(position))
    print("HÌNH NGHỈ: nướng %s vào %d bộ đỉnh đầu" % (spec, len(done)))
    return lambda points: points + from_skin(points) * fade(points)


def flatten_head_normal(glb: Glb, cfg: dict) -> None:
    """Mặt trẻ: kéo normal map của `head` về phẳng một phần (bớt nếp mũi–má, đuôi mắt, nếp trán nướng sẵn cho người 42 tuổi)."""
    amount = cfg.get("normal_flatten", 0.0)
    if amount <= 0:
        return
    index = glb.material_image("head", "normalTexture")
    image = np.asarray(Image.open(io.BytesIO(glb.image_bytes(index))).convert("RGB"), dtype=np.float64)
    image = image * (1.0 - amount) + np.array([128.0, 128.0, 255.0]) * amount
    stream = io.BytesIO()
    Image.fromarray(np.clip(np.round(image), 0, 255).astype(np.uint8)).save(stream, "JPEG", quality=92)
    glb.replace_image(index, stream.getvalue())
    print("NORMAL head: làm phẳng %.0f%%" % (amount * 100))
