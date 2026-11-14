"""Xử lý kết cấu (co nhỏ, khử màu, nhuộm tóc) và dựng vật liệu Principled đơn giản để xuất glTF.

Ảnh đã xử lý được ghi vào .tools/build/tex/ (bộ đệm; xoá thư mục đó để làm lại từ đầu).
"""
import hashlib
import json
import math
import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE_DIR = os.path.join(ROOT, ".tools", "build", "tex")
CACHE_VERSION = "v25"
JPEG_QUALITY = 85
SKIN_SIZE = 2048
HAIR_SIZE = 768
NEUTRAL_GRAY = 0.88            # mức xám sáng của vải đã khử màu (nhân màu lúc chạy sẽ ra đúng màu)
HAIR_COLOR = (0.15, 0.125, 0.115)  # màu sợi sáng nhất của tóc đen-nâu
BROW_COLOR = (0.11, 0.085, 0.07)
SKIN_SATURATION, SKIN_GAIN = 0.72, (1.0, 1.0, 0.97)   # giữ lại bão hoà; hệ số R, G, B
IRIS_DARKEN = 0.5
BROW_STYLES = {"brow_m": (1.0, 0.75), "brow_f": (0.95, 1.0)}   # mode -> (độ đậm, gamma)
SILK_SIZE, SILK_TILE = 512, 0.25           # px, m
SILK_FOLD_HEIGHT, SILK_WEAVE_HEIGHT = 0.00018, 0.00001   # m
EMBROIDERY_SIZE, EMBROIDERY_GROUND, EMBROIDERY_BRIGHT, EMBROIDERY_RELIEF = 1024, 0.80, 0.95, 0.0004
HAIR_ALPHA_BLUR = 3                # px ở ảnh 1024
STRAND_COUNT = 14                 # số sợi vẽ trong ô sợi tóc
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
BACKGROUND_TOLERANCE = 0.04


def _load(path, size):
    image = bpy.data.images.load(path, check_existing=False)
    width, height = image.size
    if max(width, height) > size:
        scale = size / max(width, height)
        image.scale(max(1, round(width * scale)), max(1, round(height * scale)))
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)


def _save(pixels, path, with_alpha):
    height, width = pixels.shape[:2]
    image = bpy.data.images.new("tmp_save", width, height, alpha=True)
    out = np.clip(pixels, 0.0, 1.0).astype(np.float32)
    if not with_alpha:
        out[..., 3] = 1.0
    image.pixels.foreach_set(out.ravel())
    image.file_format = "PNG" if with_alpha else "JPEG"
    image.save(filepath=path, quality=JPEG_QUALITY)
    bpy.data.images.remove(image)


def _box_blur(values, radius):
    """Làm mờ hộp tách trục bằng tổng tích luỹ, lặp 3 lần cho gần Gauss."""
    out = values.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            padded = np.concatenate([np.repeat(np.take(out, [0], axis), radius + 1, axis), out,
                                     np.repeat(np.take(out, [-1], axis), radius, axis)], axis)
            csum = np.cumsum(padded, axis)
            n = out.shape[axis]
            hi = np.take(csum, np.arange(2 * radius + 1, 2 * radius + 1 + n), axis)
            lo = np.take(csum, np.arange(0, n), axis)
            out = (hi - lo) / (2 * radius + 1)
    return out.astype(np.float32)


def _island_mask(pixels):
    """Vùng có vải trong atlas: điểm khác màu nền (lấy ở góc ảnh)."""
    background = pixels[0, 0, :3]
    return (np.abs(pixels[..., :3] - background).max(axis=2) > BACKGROUND_TOLERANCE).astype(np.float32)


def _masked_blur(luma, mask, radius):
    return _box_blur(luma * mask, radius) / np.maximum(_box_blur(mask, radius), 1e-4)


def _neutral_flat(pixels):
    """Vải trơn xám sáng: bỏ hoạ tiết (sọc, logo), chỉ giữ chút đậm nhạt tần số thấp."""
    luma, mask = pixels[..., :3] @ LUMA, _island_mask(pixels)
    low = _masked_blur(luma, mask, max(4, pixels.shape[0] // 64))
    inside = low[mask > 0.5]
    low = np.clip(low / max(float(np.percentile(inside, 70)), 1e-3), 0.0, 1.1) if inside.size else np.ones_like(low)
    gray = NEUTRAL_GRAY * (0.85 + 0.15 * low)
    return np.where(mask > 0.5, gray, NEUTRAL_GRAY)


def _neutral_highpass(pixels):
    """Vải xám sáng giữ đường may/túi (tần số cao), bỏ mảng bạc màu lớn của vải bò."""
    luma, mask = pixels[..., :3] @ LUMA, _island_mask(pixels)
    low = _masked_blur(luma, mask, max(6, pixels.shape[0] // 28))
    detail = np.clip((luma + 0.03) / (low + 0.03), 0.55, 1.15)
    return np.where(mask > 0.5, NEUTRAL_GRAY * detail, NEUTRAL_GRAY)


def _hair(pixels):
    luma, alpha = pixels[..., :3] @ LUMA, pixels[..., 3]
    visible = luma[alpha > 0.5]
    top = max(float(np.percentile(visible, 95)), 1e-3) if visible.size else 1.0
    value = np.clip(luma / top, 0.0, 1.0) ** 1.2
    out = pixels.copy()
    if pixels.shape[0] >= HAIR_SIZE:   # chỉ ảnh tóc cỡ lớn; lông mi (512 px) giữ nét
        out[..., 3] = np.clip(_box_blur(alpha, HAIR_ALPHA_BLUR) * 1.35, 0.0, 1.0)   # mép tóc (cắt ngưỡng) bớt răng cưa
    out[..., :3] = value[..., None] * np.array(HAIR_COLOR, dtype=np.float32) + 0.015
    return out


def _skin(rgb):
    """Đưa da về tông Việt: vàng nhạt, bớt đỏ/cam, đều màu hơn (giảm bão hoà rồi cân lại kênh màu)."""
    luma = (rgb @ LUMA)[..., None]
    out = luma + (rgb - luma) * SKIN_SATURATION
    return out * np.array(SKIN_GAIN, dtype=np.float32)


def _dark_iris(rgb):
    """Mống mắt nâu đen: chỉ làm tối các điểm có màu (mống mắt), giữ nguyên lòng trắng và con ngươi."""
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    coloured = np.clip((spread - 0.08) / 0.12, 0.0, 1.0)[..., None]
    return rgb * (1.0 - coloured * (1.0 - IRIS_DARKEN))


def _brow(pixels, opacity, gamma):
    """Lông mày: màu sợi đồng nhất, alpha chuẩn hoá theo nét đậm nhất của từng ảnh (ảnh gốc mỗi kiểu đậm nhạt khác nhau)."""
    alpha = pixels[..., 3]
    drawn = alpha[alpha > 0.02]
    peak = max(float(np.percentile(drawn, 97)), 1e-3) if drawn.size else 1.0
    out = pixels.copy()
    out[..., :3] = np.array(BROW_COLOR, dtype=np.float32)
    out[..., 3] = opacity * np.clip(alpha / peak, 0.0, 1.0) ** gamma   # gamma > 1 làm nét mảnh hơn
    return out


def process(source, mode, size, keep_alpha=False, color=(1.0, 1.0, 1.0)):
    """Xử lý một ảnh nguồn theo mode và trả về bpy image đọc từ tệp trong bộ đệm.

    mode: copy | tint | skin | eye | flat | highpass | hair | lash | teeth | brow_m | brow_f | normal
    """
    key = hashlib.sha256(("|".join([CACHE_VERSION, source, mode, str(size), str(keep_alpha), str(color)])).encode()).hexdigest()[:12]
    stem = os.path.splitext(os.path.basename(source))[0]
    path = os.path.join(CACHE_DIR, "%s_%s_%s.%s" % (stem, mode, key, "png" if keep_alpha else "jpg"))
    if not os.path.isfile(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        pixels = _load(source, size)
        if mode == "tint":
            pixels[..., :3] *= np.array(color, dtype=np.float32)
        elif mode == "skin":
            pixels[..., :3] = _skin(pixels[..., :3] * np.array(color, dtype=np.float32))
        elif mode == "eye":
            pixels[..., :3] = _dark_iris(pixels[..., :3])
        elif mode == "flat":
            pixels[..., :3] = _neutral_flat(pixels)[..., None]
        elif mode == "highpass":
            pixels[..., :3] = _neutral_highpass(pixels)[..., None]
        elif mode == "hair":
            pixels = _hair(pixels)
        elif mode == "lash":
            pixels = _hair(pixels)
            pixels[..., 3] *= LASH_OPACITY
        elif mode == "teeth":       # trắng ngà, lợi bớt đỏ; ô đen ở góc dưới trái dành cho khoang miệng
            rgb = pixels[..., :3]
            luma = rgb @ LUMA
            tooth = _smoothstep(0.10, 0.04, rgb.max(axis=2) - rgb.min(axis=2)) * _smoothstep(0.08, 0.2, luma)   # điểm ít màu = men răng
            enamel = np.array(TEETH_TINT, dtype=np.float32) * (0.80 + 0.20 * np.clip(luma / 0.75, 0.0, 1.0))[..., None]
            gum = (luma[..., None] + (rgb - luma[..., None]) * 0.7) * np.array((0.9, 0.78, 0.78), dtype=np.float32)
            pixels[..., :3] = gum * (1 - tooth[..., None]) + enamel * tooth[..., None]
            corner = max(8, pixels.shape[0] // 24)
            pixels[:corner, :corner, :3] = 0.012
        elif mode in BROW_STYLES:
            pixels = _brow(pixels, *BROW_STYLES[mode])
        elif mode not in ("copy", "normal"):
            raise ValueError("mode lạ: " + mode)
        _save(pixels, path, keep_alpha)
    image = bpy.data.images.load(path, check_existing=True)
    if mode == "normal":
        image.colorspace_settings.name = "Non-Color"
    return image


EYE_SIZE = 512
SCLERA_COLOR = (0.90, 0.872, 0.845)
IRIS_INNER, IRIS_OUTER = (0.46, 0.27, 0.12), (0.17, 0.09, 0.045)   # nâu đậm: quanh đồng tử sáng hơn, ra viền tối dần
TEETH_TINT = (0.93, 0.885, 0.79)      # trắng ngà
LASH_OPACITY = 0.72                   # lông mi ngắn, thưa vừa


def _smoothstep(edge0, edge1, x):
    t = np.clip((np.asarray(x, dtype=np.float32) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def eye_image(source, layout):
    """Kết cấu mắt tự vẽ trên nền ảnh mắt MakeHuman (chỉ giữ lại vân mạch máu rất nhẹ): lòng trắng sáng, mống mắt nâu đậm có
    vân toả tia và viền limbus, đồng tử, bóng mi trên đổ lên nhãn cầu, một đốm sáng nhỏ.
    layout: danh sách (u, v, bán kính mống mắt, hướng lên, hướng ra thái dương) từ people_head.eye_layout."""
    key = hashlib.sha256(("|".join([CACHE_VERSION, source, "eye6", json.dumps(layout)])).encode()).hexdigest()[:12]
    path = os.path.join(CACHE_DIR, "eye_painted_%s.jpg" % key)
    if not os.path.isfile(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        pixels = _load(source, EYE_SIZE)
        rgb = pixels[..., :3]
        luma = rgb @ LUMA
        detail = np.clip(luma / np.maximum(_box_blur(luma, 10), 1e-3), 0.93, 1.04)
        chroma = rgb - luma[..., None]
        out = np.array(SCLERA_COLOR, dtype=np.float32) * detail[..., None] + 0.3 * chroma
        height, width = luma.shape
        ys, xs = np.mgrid[0:height, 0:width]
        u, v = (xs + 0.5) / width, (ys + 0.5) / height
        rng = np.random.default_rng(7)
        dark = luma < 0.12
        for cu, cv, radius, up, outward in layout:
            near = dark & (np.hypot(u - cu, v - cv) < radius * 1.2)
            if near.sum() > 20:
                cu, cv = float(u[near].mean()), float(v[near].mean())
            du, dv = (u - cu) / radius, (v - cv) / radius
            reach = np.hypot(du, dv)
            angle = np.arctan2(dv, du)
            rise, across = du * up[0] + dv * up[1], du * outward[0] + dv * outward[1]
            fibres = 0.5 + 0.5 * np.sin(angle * 52 + 2.5 * np.sin(angle * 9) + 6.0 * reach)
            fibres = 0.6 * fibres + 0.4 * (0.5 + 0.5 * np.sin(angle * 23 + 1.7))
            mix = _smoothstep(0.34, 1.0, reach)[..., None]
            iris = np.array(IRIS_INNER, dtype=np.float32) * (1 - mix) + np.array(IRIS_OUTER, dtype=np.float32) * mix
            iris = iris * (0.72 + 0.5 * fibres * _smoothstep(0.36, 0.6, reach) * (1.0 - _smoothstep(0.8, 1.0, reach)))[..., None]
            iris *= (1.0 - 0.75 * _smoothstep(0.84, 1.0, reach))[..., None]                 # viền limbus
            iris *= _smoothstep(0.30, 0.38, reach)[..., None]                               # đồng tử
            cover = (1.0 - _smoothstep(0.97, 1.07, reach))[..., None]
            out = out * (1 - cover) + iris * cover
            out *= (1.0 - 0.10 * (1.0 - _smoothstep(1.05, 1.5, reach)) * _smoothstep(0.97, 1.07, reach))[..., None]   # quầng tối sát mống mắt
            shade = 1.0 - 0.30 * _smoothstep(0.25, 1.9, rise) * (reach < 4.0)                # bóng mi trên
            out *= shade[..., None]
            glint = np.exp(-(((across + 0.30) ** 2 + (rise - 0.36) ** 2) / (2 * 0.085 ** 2)))  # đốm sáng (hướng 10–11 giờ)
            glint += 0.35 * np.exp(-(((across - 0.34) ** 2 + (rise + 0.40) ** 2) / (2 * 0.05 ** 2)))
            out = out + np.clip(glint, 0.0, 1.0)[..., None] * (1.0 - out) * 0.92
        out += rng.normal(0.0, 0.004, out.shape).astype(np.float32)
        pixels[..., :3] = out
        _save(pixels, path, False)
    return bpy.data.images.load(path, check_existing=True)


LIPSTICK, LIP_NATURAL = (0.66, 0.27, 0.245), (0.60, 0.34, 0.31)
BEARD_SHADOW = True
FACE_NORMAL_STRENGTH = 0.05


def _resample(image, width, height):
    """Co giãn song tuyến tính (ảnh H x W x C)."""
    rows = np.clip((np.arange(height) + 0.5) * image.shape[0] / height - 0.5, 0, image.shape[0] - 1)
    columns = np.clip((np.arange(width) + 0.5) * image.shape[1] / width - 0.5, 0, image.shape[1] - 1)
    r0, c0 = np.floor(rows).astype(int), np.floor(columns).astype(int)
    r1, c1 = np.minimum(r0 + 1, image.shape[0] - 1), np.minimum(c0 + 1, image.shape[1] - 1)
    fr, fc = (rows - r0)[:, None, None], (columns - c0)[None, :, None]
    top = image[r0][:, c0] * (1 - fc) + image[r0][:, c1] * fc
    bottom = image[r1][:, c0] * (1 - fc) + image[r1][:, c1] * fc
    return (top * (1 - fr) + bottom * fr).astype(np.float32)


def _rasterize(triangles, width, height):
    """Bản đồ vị trí 3D và độ phủ nhóm `lips` trong không gian UV của kết cấu mặt. Trả về (vị trí HxWx3, môi HxW, phủ HxW)."""
    position = np.zeros((height, width, 3), dtype=np.float32)
    lips = np.zeros((height, width), dtype=np.float32)
    covered = np.zeros((height, width), dtype=bool)
    for uv, co, lip in triangles:
        px, py = uv[:, 0] * width - 0.5, uv[:, 1] * height - 0.5
        x0, x1 = max(int(np.floor(px.min())), 0), min(int(np.ceil(px.max())), width - 1)
        y0, y1 = max(int(np.floor(py.min())), 0), min(int(np.ceil(py.max())), height - 1)
        if x1 < x0 or y1 < y0:
            continue
        area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0])
        if abs(area) < 1e-9:
            continue
        ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        w1 = ((xs - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (ys - py[0])) / area
        w2 = ((px[1] - px[0]) * (ys - py[0]) - (xs - px[0]) * (py[1] - py[0])) / area
        w0 = 1.0 - w1 - w2
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not inside.any():
            continue
        weights = np.stack([w0, w1, w2], axis=-1)[inside]
        position[ys[inside], xs[inside]] = weights @ co
        lips[ys[inside], xs[inside]] = weights @ lip
        covered[ys[inside], xs[inside]] = True
    return position, lips, covered


def _densify(points, parts=4):
    """Chèn thêm điểm giữa các điểm liền kề gần nhau (đường chân mi liền nét)."""
    points = np.asarray(points, dtype=np.float32)
    extra = [points]
    for a, b in zip(points[:-1], points[1:]):
        if np.linalg.norm(b - a) < 0.006:
            extra.append(np.array([a + (b - a) * k / parts for k in range(1, parts)], dtype=np.float32))
    return np.concatenate(extra)


def _nearest_distance(points, targets, limit):
    """Khoảng cách từ từng điểm tới điểm đích gần nhất (cắt ở limit)."""
    out = np.full(len(points), limit, dtype=np.float32)
    for start in range(0, len(points), 20000):
        chunk = points[start:start + 20000]
        out[start:start + 20000] = np.sqrt(((chunk[:, None, :] - targets[None, :, :]) ** 2).sum(axis=2)).min(axis=1)
    return np.minimum(out, limit)


def head_maps(name, body_image, info, female):
    """Ba kết cấu của vật liệu `head` (màu, normal, AO-nhám-kim loại) cho một nhân vật. Màu = đúng phần ảnh da của thân được
    cắt ra và phóng to (nên liền màu với thân ở mép), cộng các lớp tự vẽ theo vị trí 3D: má hồng, quầng mắt rất nhẹ, môi
    (nữ tô son), viền mi, bóng râu (nam), nếp mũi - má rất nhẹ, lỗ chân lông. Không dùng ảnh mặt người thật nào."""
    width, height = info["pixels"]
    stem = os.path.join(CACHE_DIR, "head_%s_%s" % (name, CACHE_VERSION))
    os.makedirs(CACHE_DIR, exist_ok=True)
    source = _load(bpy.path.abspath(body_image.filepath), SKIN_SIZE)[..., :3]
    x0, y0, x1, y1 = info["rect"]
    size = source.shape[0]
    crop = source[int(round(y0 * size)):int(round(y1 * size)), int(round(x0 * size)):int(round(x1 * size))]
    colour = _resample(crop, width, height)
    position, lips, covered = _rasterize(info["triangles"], width, height)
    lips = _box_blur(lips, 2)
    rng = np.random.default_rng(11)
    fine = rng.normal(0.0, 1.0, (height, width)).astype(np.float32)
    pores = fine - _box_blur(fine, 2)
    pores /= max(float(pores.std()), 1e-6)
    mottle = _box_blur(rng.normal(0.0, 1.0, (height, width)).astype(np.float32), 14)
    mottle /= max(float(mottle.std()), 1e-6)
    x, y, z = position[..., 0], position[..., 1], position[..., 2]
    eye_z, mouth_z, nose, chin_z = info["eye_z"], info["mouth_z"], info["nose"], info["chin_z"]
    front = _smoothstep(0.02, -0.03, y - (nose[1] + 0.075)) * covered          # 1 ở mặt trước, 0 về phía tai

    fade = _box_blur(covered.astype(np.float32), 40) ** 2          # mọi chi tiết tự thêm tắt dần ra mép vùng mặt (liền với da thân)
    edge_y, edge_x = np.mgrid[0:height, 0:width]
    border = np.minimum(np.minimum(edge_x, width - 1 - edge_x), np.minimum(edge_y, height - 1 - edge_y)).astype(np.float32)
    fade *= _smoothstep(4.0, 90.0, border)                          # và về 0 tại mép ô cắt: hết đường nối với vật liệu body

    def blend(mask, target, amount):
        nonlocal colour
        k = (np.clip(mask, 0.0, 1.0) * fade * amount)[..., None]
        colour = colour * (1 - k) + colour * np.array(target, dtype=np.float32) * k

    cheek = np.exp(-(((np.abs(x) - 0.043) ** 2) / (2 * 0.017 ** 2) + ((z - (eye_z - 0.038)) ** 2) / (2 * 0.014 ** 2))) * front
    blend(cheek, (1.07, 0.90, 0.90), 0.6 if female else 0.25)                                              # má hồng
    tip = np.exp(-((x ** 2 + (z - nose[2]) ** 2) / (2 * 0.011 ** 2))) * front
    blend(tip, (1.04, 0.95, 0.94), 0.5)
    under = np.exp(-(((np.abs(x) - 0.031) ** 2) / (2 * 0.013 ** 2) + ((z - (eye_z - 0.014)) ** 2) / (2 * 0.005 ** 2))) * front
    blend(under, (0.94, 0.93, 0.97), 0.55 if female else 0.9)                                                                 # quầng dưới mắt rất nhẹ
    for sign in (1.0, -1.0):                                                                               # nếp mũi - má rất nhẹ
        a = np.array([sign * 0.019, nose[2] - 0.004])
        b = np.array([sign * (info["mouth_half"] + 0.011), mouth_z - 0.006])
        ab = b - a
        t = np.clip(((x - a[0]) * ab[0] + (z - a[1]) * ab[1]) / (ab @ ab), 0.0, 1.0)
        distance = np.hypot(x - (a[0] + t * ab[0]), z - (a[1] + t * ab[1]))
        blend(np.exp(-(distance / 0.0028) ** 2) * front * np.sin(np.pi * np.clip(t, 0.02, 0.98)), (0.9, 0.87, 0.86), 0.5 if female else 0.85)
        for tilt in (-0.35, 0.0, 0.35):                                  # nếp đuôi mắt rất nhẹ
            ox, oz = sign * (float(np.abs(info["eyes"][:, 0]).mean()) + 0.017), eye_z
            along = (x - ox) * sign * math.cos(tilt) + (z - oz) * math.sin(tilt)
            across = -(x - ox) * sign * math.sin(tilt) + (z - oz) * math.cos(tilt)
            crow = np.exp(-(across / 0.0009) ** 2) * _smoothstep(0.0, 0.003, along) * _smoothstep(0.013, 0.006, along) * covered
            blend(crow, (0.9, 0.87, 0.86), 0.22 if female else 0.45)
    if not female and BEARD_SHADOW:                                                                        # bóng râu rất nhẹ (skin trung niên đã có sẵn: tắt)
        beard = _smoothstep(nose[2] - 0.006, nose[2] - 0.02, z) * _smoothstep(chin_z - 0.004, chin_z + 0.012, z) * covered
        beard *= _smoothstep(0.075, 0.05, np.abs(x)) * (1.0 - np.clip(lips * 2.0, 0.0, 1.0))
        blend(beard * (0.75 + 0.25 * np.clip(pores, -1, 1)), (0.80, 0.83, 0.90), 0.8)
    # Nhóm `lips` rộng hơn viền môi thật: chỉ lấy phần mà ảnh da gốc đã hồng hơn da quanh (môi vẽ sẵn của MakeHuman).
    redness = (colour[..., 0] - colour[..., 1]) / np.maximum(colour[..., 0] + colour[..., 1], 1e-3)
    around = float(np.median(redness[covered & (lips < 0.05) & (front > 0.5)]))
    lip_mask = _box_blur(np.clip(lips * 1.5, 0.0, 1.0) * _smoothstep(around + 0.018, around + 0.05, _box_blur(redness, 2)), 3) * covered
    lip_mask *= _smoothstep(0.016, 0.011, np.abs(z - mouth_z))          # không lem xuống dưới môi dưới
    shade = np.clip((colour @ LUMA) / np.maximum(_box_blur(colour @ LUMA, 12), 1e-3), 0.8, 1.15)
    lip_colour = np.array(LIPSTICK if female else LIP_NATURAL, dtype=np.float32) * shade[..., None]
    k = (lip_mask * (0.62 if female else 0.6))[..., None]
    colour = colour * (1 - k) + lip_colour * k
    near_eyes = covered & (np.abs(z - eye_z) < 0.03) & (y < nose[1] + 0.06)
    index = np.nonzero(near_eyes)
    points = position[index]
    upper = np.exp(-(_nearest_distance(points, _densify(info["upper_lash"]), 0.01) / 0.0018) ** 2)
    lower = np.exp(-(_nearest_distance(points, _densify(info["lower_lash"]), 0.01) / 0.0010) ** 2)
    liner = np.zeros((height, width), dtype=np.float32)
    liner[index] = np.clip(upper * (0.55 if female else 0.4) + lower * 0.18, 0.0, 1.0)
    colour = colour * (1 - liner[..., None]) + colour * np.array((0.22, 0.17, 0.16), dtype=np.float32) * liner[..., None]
    colour *= (1.0 + (0.008 * np.clip(pores, -2, 2) + 0.014 * np.clip(mottle, -2, 2)) * fade)[..., None]
    out = np.ones((height, width, 4), dtype=np.float32)
    out[..., :3] = colour
    _save(out, stem + "_color.jpg", False)

    # Normal: lỗ chân lông mịn + vân môi (kéo dài theo trục dọc khuôn mặt trong UV), tắt dần ra mép vùng phủ.
    up_axis = 0 if abs(float(np.corrcoef(z[covered], np.nonzero(covered)[1])[0, 1])) > 0.5 else 1    # trục ảnh chạy dọc khuôn mặt (0 = ngang ảnh)
    streak = rng.normal(0.0, 1.0, (height, width)).astype(np.float32)
    for _ in range(3):
        streak = (np.roll(streak, 2, axis=1 - up_axis) + streak + np.roll(streak, -2, axis=1 - up_axis)
                  + np.roll(streak, 4, axis=1 - up_axis) + np.roll(streak, -4, axis=1 - up_axis)) / 5.0
    streak /= max(float(streak.std()), 1e-6)
    relief = (pores * 0.45 * (1.0 - lip_mask) + streak * 2.2 * lip_mask) * fade
    dx = (np.roll(relief, -1, axis=1) - np.roll(relief, 1, axis=1)) * FACE_NORMAL_STRENGTH
    dy = (np.roll(relief, -1, axis=0) - np.roll(relief, 1, axis=0)) * FACE_NORMAL_STRENGTH
    length = np.sqrt(dx * dx + dy * dy + 1.0)
    out[..., 0], out[..., 1], out[..., 2] = 0.5 - 0.5 * dx / length, 0.5 - 0.5 * dy / length, 0.5 + 0.5 / length
    _save(out, stem + "_normal.jpg", False)

    # AO (R = 1), nhám (G): vùng chữ T và môi bóng hơn; kim loại (B = 0). Ra mép vùng phủ về đúng độ nhám của thân.
    zone = np.exp(-((x ** 2) / (2 * 0.022 ** 2))) * _smoothstep(chin_z - 0.01, chin_z + 0.02, z) * front
    zone = np.clip(zone + 0.8 * cheek, 0.0, 1.0)                    # chữ T + gò má bóng hơn, phần còn lại lì
    rough = 0.55 + 0.09 * fade - 0.27 * zone * fade      # tại mép ô cắt fade = 0 -> đúng độ nhám 0,55 của vật liệu body - (0.17 if female else 0.08) * lip_mask + 0.03 * np.clip(pores, -1, 1) * fade
    half = _resample(np.stack([np.ones_like(rough), rough, np.zeros_like(rough)], axis=-1), width // 2, height // 2)
    small = np.ones((height // 2, width // 2, 4), dtype=np.float32)
    small[..., :3] = half
    _save(small, stem + "_orm.jpg", False)
    images = []
    for suffix, linear in (("_color.jpg", False), ("_normal.jpg", True), ("_orm.jpg", True)):
        image = bpy.data.images.load(stem + suffix, check_existing=False)
        if linear:
            image.colorspace_settings.name = "Non-Color"
        images.append(image)
    return images


def add_head_material(obj, polygons, colour, normal, orm):
    """Thêm vật liệu `head` (ô thứ hai của lưới thân): màu + normal + nhám theo kết cấu."""
    material = bpy.data.materials.new("head")
    material.use_nodes = True
    material.use_backface_culling = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.0
    base = nodes.new("ShaderNodeTexImage")
    base.image = colour
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeTexImage")
    bump.image = normal
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(bump.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    packed = nodes.new("ShaderNodeTexImage")
    packed.image = orm
    split = nodes.new("ShaderNodeSeparateColor")
    links.new(packed.outputs["Color"], split.inputs["Color"])
    links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
    obj.data.materials.append(material)
    slot = len(obj.data.materials) - 1
    for index in polygons:
        obj.data.polygons[index].material_index = slot
    return material


HAIR_ATLAS = {"strands": (0.0, 0.0, 0.76, 1.0), "stubble": (0.80, 0.02, 0.98, 0.45)}   # vùng UV trong atlas sợi tóc dùng chung
HAIR_ATLAS_SIZE = 1024


def hair_atlas():
    """Atlas sợi tóc dùng chung cho mọi kiểu tóc (tự vẽ): (ảnh màu + alpha, ảnh normal).
    Vùng strands: sợi chạy dọc theo v; v 0–0,1 tóc mọc dần (chân tóc loang theo sợi), 0,1–0,8 đặc, 0,8–1 thưa dần (đuôi tóc).
    Vùng stubble: chấm chân tóc cho đầu cạo sát. Màu theo quy ước cũ (đen - nâu rất đậm, runtime nhân màu lên)."""
    colour_path = os.path.join(CACHE_DIR, "hair_atlas_%s.png" % CACHE_VERSION)
    normal_path = os.path.join(CACHE_DIR, "hair_atlas_normal_%s.jpg" % CACHE_VERSION)
    if not (os.path.isfile(colour_path) and os.path.isfile(normal_path)):
        os.makedirs(CACHE_DIR, exist_ok=True)
        size = HAIR_ATLAS_SIZE
        rng = np.random.default_rng(23)
        pixels = np.zeros((size, size, 4), dtype=np.float32)
        x0, y0, x1, y1 = (int(round(c * size)) for c in HAIR_ATLAS["strands"])
        width = x1 - x0

        def profile(scale):
            raw = rng.normal(0.0, 1.0, width + 4 * scale)
            kernel = np.ones(scale) / scale
            smooth = np.convolve(np.convolve(raw, kernel, mode="same"), kernel, mode="same")[2 * scale:2 * scale + width]
            return (smooth - smooth.min()) / max(float(np.ptp(smooth)), 1e-6)

        value = 0.5 * profile(2) + 0.3 * profile(7) + 0.2 * profile(25)            # độ sáng từng sợi
        root, tip = 0.6 * profile(3) + 0.4 * profile(11), 0.6 * profile(2) + 0.4 * profile(9)
        v = ((np.arange(y1 - y0) + 0.5) / (y1 - y0))[:, None]
        alpha = np.clip((v / 0.1 - root[None, :]) / 0.3 + 0.5, 0.0, 1.0) * np.clip((tip[None, :] - (v - 0.8) / 0.2) / 0.3 + 0.5, 0.0, 1.0)
        shine = 1.0 + 0.12 * np.sin(v * 9.0 + 6.0 * profile(40)[None, :])
        luminance = np.clip((0.45 + 0.55 * value[None, :]) * shine, 0.0, 1.0) ** 1.2
        pixels[y0:y1, x0:x1, :3] = luminance[..., None] * np.array(HAIR_COLOR, dtype=np.float32) + 0.015
        pixels[y0:y1, x0:x1, 3] = alpha
        pixels[:, x1:, :3] = np.array(HAIR_COLOR, dtype=np.float32) * 0.6
        sx0, sy0, sx1, sy1 = (int(round(c * size)) for c in HAIR_ATLAS["stubble"])
        # chân tóc cạo sát: lớp bóng sẫm phủ ĐỀU (alpha 0,62), nửa dưới của vùng (v < 0,5) mờ dần ra viền chân tóc
        rise = ((np.arange(sy1 - sy0) + 0.5) / (sy1 - sy0))[:, None]
        grain = _box_blur(rng.random((sy1 - sy0, sx1 - sx0)).astype(np.float32), 1)
        # đặc ở trong (alpha 1); sát chân tóc alpha giảm dần kèm nhiễu hạt để vật liệu MASK cho mép lấm tấm chứ không cắt cứng
        speckle = rng.random((sy1 - sy0, sx1 - sx0)).astype(np.float32)
        pixels[sy0:sy1, sx0:sx1, 3] = np.clip(_smoothstep(0.02, 0.5, rise) * 1.25 - 0.5 * speckle * (1.0 - _smoothstep(0.3, 0.5, rise)) * np.ones_like(speckle), 0.0, 1.0)
        stubble = np.array(HAIR_COLOR, dtype=np.float32) * 0.65 + np.array((0.30, 0.24, 0.20), dtype=np.float32) * 0.35     # chân tóc cạo: sẫm, hơi lẫn màu da
        pixels[sy0:sy1, sx0:sx1, :3] = stubble * (0.8 + 0.4 * grain[..., None])
        _save(pixels, colour_path, True)
        half = size // 2
        height = np.zeros((half, half), dtype=np.float32)
        hx0, hx1 = x0 // 2, x1 // 2
        height[:, hx0:hx1] = value[::2][None, :hx1 - hx0]
        dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 1.6
        length = np.sqrt(dx * dx + 1.0)
        normal = np.ones((half, half, 4), dtype=np.float32)
        normal[..., 0], normal[..., 1], normal[..., 2] = 0.5 - 0.5 * dx / length, 0.5, 0.5 + 0.5 / length
        _save(normal, normal_path, False)
    colour = bpy.data.images.load(colour_path, check_existing=True)
    normal = bpy.data.images.load(normal_path, check_existing=True)
    normal.colorspace_settings.name = "Non-Color"
    return colour, normal


def glasses_materials():
    """Hai vật liệu dùng chung cho mọi kính: `frame` (bảng màu gọng: đen, vàng kim, nâu đồi mồi) và `lens` (trong / nâu khói)."""
    frame_path = os.path.join(CACHE_DIR, "glasses_frame_%s.png" % CACHE_VERSION)
    lens_path = os.path.join(CACHE_DIR, "glasses_lens_%s.png" % CACHE_VERSION)
    if not (os.path.isfile(frame_path) and os.path.isfile(lens_path)):
        os.makedirs(CACHE_DIR, exist_ok=True)
        for path, cells in ((frame_path, ((0.03, 0.03, 0.035, 1.0), (0.62, 0.5, 0.3, 1.0), (0.2, 0.11, 0.06, 1.0), (0.03, 0.03, 0.035, 1.0))),
                            (lens_path, ((0.92, 0.96, 1.0, 0.12), (0.4, 0.3, 0.24, 0.42), (0.92, 0.96, 1.0, 0.12), (0.92, 0.96, 1.0, 0.12)))):
            pixels = np.zeros((8, 32, 4), dtype=np.float32)
            for index, cell in enumerate(cells):
                pixels[:, index * 8:(index + 1) * 8] = np.array(cell, dtype=np.float32)
            _save(pixels, path, True)
    out = []
    for name, path, blend, rough in (("frame", frame_path, None, 0.35), ("lens", lens_path, "BLEND", 0.05)):
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.use_backface_culling = False
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = rough
        node = nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(path, check_existing=True)
        node.interpolation = "Closest"
        links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
        if blend:
            links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
            material.surface_render_method = "BLENDED"
        out.append(material)
    return out


TEE_YELLOW = (0.80, 0.93, 0.16)       # vàng chanh neon (sRGB 0..1); màu nằm sẵn trong kết cấu, runtime không tô


def tee_atlas(logo_png, art_png):
    """Atlas áo phông lớp, cùng bố cục vùng với UNIFORM_ATLAS: nền vàng chanh, logo ở vùng badge, hình hoạt hoạ + chữ ở vùng
    sleeve, bo cổ (vùng lapel_plain) sẫm hơn một chút."""
    path = os.path.join(CACHE_DIR, "tee_atlas_%s.jpg" % CACHE_VERSION)
    if not os.path.isfile(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        pixels = np.ones((UNIFORM_SIZE, UNIFORM_SIZE, 4), dtype=np.float32)
        pixels[..., :3] = np.array(TEE_YELLOW, dtype=np.float32)
        rect = UNIFORM_ATLAS["lapel_plain"]
        pixels[_atlas_rows(rect, 0, 1), _atlas_columns(rect), :3] *= 0.9
        for key, source in (("badge", logo_png), ("sleeve", art_png)):
            rect = UNIFORM_ATLAS[key]
            rows, columns = _atlas_rows(rect, 0, 1), _atlas_columns(rect)
            image = bpy.data.images.load(source, check_existing=False)
            image.scale(columns.stop - columns.start, rows.stop - rows.start)
            data = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
            image.pixels.foreach_get(data)
            bpy.data.images.remove(image)
            pixels[rows, columns] = data.reshape(rows.stop - rows.start, columns.stop - columns.start, 4)
        _save(pixels, path, False)
    return bpy.data.images.load(path, check_existing=True)


def fabric_tile(kind):
    """Ô kết cấu vải lặp được (256 px, xám 0,88 để runtime nhân màu): "denim" = vân chéo rõ của vải bò, "plain" = vân dệt rất nhẹ."""
    path = os.path.join(CACHE_DIR, "fabric_%s_%s.jpg" % (kind, CACHE_VERSION))
    if not os.path.isfile(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        size = 256
        ys, xs = np.mgrid[0:size, 0:size]
        rng = np.random.default_rng(5)
        grain = _box_blur(rng.random((size, size)).astype(np.float32), 1) - 0.5
        if kind == "denim":
            twill = 0.5 + 0.5 * np.sin((xs + ys) * 2 * np.pi * 32 / size)
            value = NEUTRAL_GRAY * (0.80 + 0.16 * twill + 0.25 * grain)
        else:
            weave = 0.5 + 0.25 * np.sin(xs * 2 * np.pi * 64 / size) + 0.25 * np.sin(ys * 2 * np.pi * 64 / size)
            value = NEUTRAL_GRAY * (0.95 + 0.04 * weave + 0.06 * grain)
        pixels = np.ones((size, size, 4), dtype=np.float32)
        pixels[..., :3] = value[..., None]
        _save(pixels, path, False)
    return bpy.data.images.load(path, check_existing=True)


def silk_maps():
    """(ảnh màu xám sáng, normal map) của vải lụa lặp lại được: nếp dọc mềm + vân dệt mịn. Một ô = 0,25 m."""
    base_path = os.path.join(CACHE_DIR, "silk_base_%s.jpg" % CACHE_VERSION)
    normal_path = os.path.join(CACHE_DIR, "silk_normal_%s.jpg" % CACHE_VERSION)
    if not (os.path.isfile(base_path) and os.path.isfile(normal_path)):
        os.makedirs(CACHE_DIR, exist_ok=True)
        size = SILK_SIZE
        v, u = np.meshgrid(np.arange(size) / size, np.arange(size) / size, indexing="ij")
        tau = 2 * np.pi
        folds = 0.6 * np.sin(tau * 3 * u + 0.9 * np.sin(tau * v)) + 0.4 * np.sin(tau * 5 * u + 1.3 * np.sin(tau * 2 * v) + 1.0)
        weave = np.sin(tau * 96 * u) * np.sin(tau * 96 * v)
        height = SILK_FOLD_HEIGHT * folds + SILK_WEAVE_HEIGHT * weave            # mét
        pixel = SILK_TILE / size
        du = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * pixel)
        dv = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * pixel)
        normal = np.stack([-du, -dv, np.ones_like(du)], axis=2)
        normal /= np.linalg.norm(normal, axis=2, keepdims=True)
        pixels = np.ones((size, size, 4), dtype=np.float32)
        pixels[..., :3] = normal * 0.5 + 0.5
        _save(pixels, normal_path, False)
        pixels[..., :3] = (NEUTRAL_GRAY * (1.0 + 0.025 * folds))[..., None]
        _save(pixels[::2, ::2], base_path, False)
    base = bpy.data.images.load(base_path, check_existing=True)
    normal_image = bpy.data.images.load(normal_path, check_existing=True)
    normal_image.colorspace_settings.name = "Non-Color"
    return base, normal_image


def _wrapped_distance(u, v, centre):
    du = np.abs(u - centre[0])
    dv = np.abs(v - centre[1])
    du, dv = np.minimum(du, 1.0 - du), np.minimum(dv, 1.0 - dv)
    return np.hypot(du, dv), np.arctan2(v - centre[1], u - centre[0])


def embroidery_maps():
    """(ảnh màu, normal map) vải thêu hoa chìm lặp lại được: nền xám 0,80, hoa và dây leo sáng 0,95, nổi nhẹ.
    Một ô = 0,25 m; mỗi ô hai cụm hoa ~9 cm nối bằng cành mảnh."""
    base_path = os.path.join(CACHE_DIR, "embroidery_base_%s.jpg" % CACHE_VERSION)
    normal_path = os.path.join(CACHE_DIR, "embroidery_normal_%s.jpg" % CACHE_VERSION)
    if not (os.path.isfile(base_path) and os.path.isfile(normal_path)):
        os.makedirs(CACHE_DIR, exist_ok=True)
        size = EMBROIDERY_SIZE
        v, u = np.meshgrid(np.arange(size) / size, np.arange(size) / size, indexing="ij")
        pattern = np.zeros((size, size))
        for centre, petals, radius, turn in (((0.27, 0.3), 12, 0.19, 0.0), ((0.76, 0.78), 10, 0.15, 0.4), ((0.72, 0.2), 8, 0.07, 0.2), ((0.2, 0.74), 8, 0.06, 0.1)):
            distance, angle = _wrapped_distance(u, v, centre)
            outline = radius * (0.22 + 0.78 * np.abs(np.cos(petals * (angle + turn) / 2.0)) ** 2.5)   # cánh mảnh, nhọn
            petal = np.clip((outline - distance) / 0.012, 0.0, 1.0) * np.clip(distance / (radius * 0.35), 0.35, 1.0)
            heart = np.clip((radius * 0.16 - distance) / 0.008, 0.0, 1.0)
            pattern = np.maximum(pattern, np.maximum(petal, heart))
        for phase, lean in ((0.0, 1.0), (0.5, -1.0)):   # hai cành lượn nối các cụm hoa, có lá nhỏ
            curve = 0.5 + 0.21 * np.sin(2 * np.pi * (u + phase)) * lean
            gap = np.abs(v - curve)
            gap = np.minimum(gap, 1.0 - gap)
            pattern = np.maximum(pattern, np.clip((0.0045 - gap) / 0.003, 0.0, 1.0) * 0.9)
            leaves = np.clip((0.02 * np.abs(np.sin(2 * np.pi * 7 * u)) ** 3 - gap) / 0.005, 0.0, 1.0) * (gap > 0.003)
            pattern = np.maximum(pattern, leaves * 0.8)
        height = EMBROIDERY_RELIEF * _box_blur(pattern.astype(np.float32), 1).astype(np.float64)
        pixel = SILK_TILE / size
        du = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * pixel)
        dv = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * pixel)
        normal = np.stack([-du, -dv, np.ones_like(du)], axis=2)
        normal /= np.linalg.norm(normal, axis=2, keepdims=True)
        pixels = np.ones((size, size, 4), dtype=np.float32)
        pixels[..., :3] = normal * 0.5 + 0.5
        _save(pixels, normal_path, False)
        pixels[..., :3] = (EMBROIDERY_GROUND + (EMBROIDERY_BRIGHT - EMBROIDERY_GROUND) * pattern)[..., None]
        _save(pixels, base_path, False)
    base = bpy.data.images.load(base_path, check_existing=True)
    normal_image = bpy.data.images.load(normal_path, check_existing=True)
    normal_image.colorspace_settings.name = "Non-Color"
    return base, normal_image


UNIFORM_SIZE = 1024
UNIFORM_NAVY = (0.122, 0.165, 0.302)          # #1f2a4d (sRGB)
UNIFORM_WHITE = (0.872, 0.872, 0.888)         # trắng ánh tím rất nhẹ ở mức 0,88 để nhân màu lên trắng
# Vùng atlas của áo đồng phục, toạ độ UV (x0, y0, x1, y1), gốc ở góc dưới trái.
UNIFORM_ATLAS = {
    "badge": (0.0, 824 / 1024, 0.5, 1.0),
    "lapel": (0.0, 700 / 1024, 0.5, 820 / 1024),      # v = 0 là mép ngoài lá cổ
    "sleeve": (0.5, 700 / 1024, 1.0, 1.0),            # v = 0 là gấu tay
    "navy": (0.0, 600 / 1024, 0.25, 690 / 1024),
    "plain": (0.02, 0.02, 0.98, 0.56),
    "button": (0.27, 600 / 1024, 0.27 + 90 / 1024, 690 / 1024),
    "placket": (0.40, 600 / 1024, 0.48, 690 / 1024),     # u ngang nẹp: hai đường may sát mép
    "pocket": (0.52, 560 / 1024, 0.66, 690 / 1024),      # túi ngực: đường may quanh, đáy vát
    "lapel_plain": (0.68, 580 / 1024, 1.0, 630 / 1024),  # lá cổ trơn (áo nam): chỉ có bóng mép
    "sleeve_plain": (0.68, 640 / 1024, 1.0, 690 / 1024), # tay áo trơn (áo nam): đường gập gấu
    "sleeve_blank": (0.30, 0.10, 0.70, 0.40),            # tay áo trơn hẳn (polo): nằm giữa vùng trắng, không dính vùng khác khi thu nhỏ
}
LAPEL_STRIPE = (0.11, 0.21)                   # dải viền cổ, theo v của vùng lapel (cách mép ngoài ~1 cm, rộng ~1 cm)
SLEEVE_STRIPE = (0.10, 0.135)                 # đường viền tay, theo v của vùng sleeve (cách gấu ~3,5 cm, rộng ~3 mm)


def _atlas_rows(rect, v0, v1):
    y0, y1 = rect[1] * UNIFORM_SIZE, rect[3] * UNIFORM_SIZE
    return slice(int(round(y0 + (y1 - y0) * v0)), int(round(y0 + (y1 - y0) * v1)))


def _atlas_columns(rect):
    return slice(int(round(rect[0] * UNIFORM_SIZE)), int(round(rect[2] * UNIFORM_SIZE)))


def uniform_atlas(badge_png):
    """Ảnh atlas 1024 px của áo đồng phục: nền trắng 0,88, dải viền cổ, viền tay, vùng xanh than cho nơ, phù hiệu."""
    path = os.path.join(CACHE_DIR, "uniform_atlas_%s.jpg" % CACHE_VERSION)
    if not os.path.isfile(path):
        os.makedirs(CACHE_DIR, exist_ok=True)
        pixels = np.ones((UNIFORM_SIZE, UNIFORM_SIZE, 4), dtype=np.float32)
        pixels[..., :3] = np.array(UNIFORM_WHITE, dtype=np.float32)
        navy = np.array(UNIFORM_NAVY, dtype=np.float32)
        rect = UNIFORM_ATLAS["navy"]
        pixels[_atlas_rows(rect, 0, 1), _atlas_columns(rect), :3] = navy
        rect = UNIFORM_ATLAS["lapel"]
        pixels[_atlas_rows(rect, *LAPEL_STRIPE), _atlas_columns(rect), :3] = navy
        rect = UNIFORM_ATLAS["sleeve"]
        pixels[_atlas_rows(rect, *SLEEVE_STRIPE), _atlas_columns(rect), :3] = navy
        seam = np.array(UNIFORM_WHITE, dtype=np.float32) * 0.66   # màu đường may / bóng mép vải
        # Lá cổ không còn viền bóng vẽ tay: độ nổi đến từ hình khối (people_collar).
        rect = UNIFORM_ATLAS["sleeve_plain"]
        pixels[_atlas_rows(rect, 0.09, 0.15), _atlas_columns(rect), :3] = seam * 0.9  # đường gập gấu tay ~2,5 cm
        rect = UNIFORM_ATLAS["placket"]
        rows, columns = _atlas_rows(rect, 0, 1), _atlas_columns(rect)
        span = columns.stop - columns.start
        for edge in (0.10, 0.90):
            x = columns.start + int(span * edge)
            pixels[rows, x - 1:x + 2, :3] = seam
        rect = UNIFORM_ATLAS["pocket"]
        rows, columns = _atlas_rows(rect, 0, 1), _atlas_columns(rect)
        height, width = rows.stop - rows.start, columns.stop - columns.start
        ys, xs = np.mgrid[0:height, 0:width]
        u, v = xs / (width - 1), ys / (height - 1)
        floor = 0.18 * np.abs(u - 0.5) / 0.5 + 0.03                 # đáy vát nhọn ở giữa
        inside = (u > 0.03) & (u < 0.97) & (v > floor) & (v < 0.97)
        shrunk = (u > 0.055) & (u < 0.945) & (v > floor + 0.025) & (v < 0.95)
        hem = inside & (v > 0.80) & (v < 0.815)                     # nẹp miệng túi
        pixels[rows, columns, :3] = np.where((inside & ~shrunk | hem)[..., None], seam / 0.66 * 0.84, pixels[rows, columns, :3])
        rect = UNIFORM_ATLAS["button"]                      # cúc trắng ngà, viền sẫm nhẹ cho nổi trên nền áo
        rows, columns = _atlas_rows(rect, 0, 1), _atlas_columns(rect)
        ys, xs = np.mgrid[0:rows.stop - rows.start, 0:columns.stop - columns.start]
        reach = np.hypot(xs / (columns.stop - columns.start) - 0.5, ys / (rows.stop - rows.start) - 0.5) * 2.0
        shade = np.where(reach > 0.72, 0.62, 1.0)[..., None]
        pixels[rows, columns, :3] = np.array((0.84, 0.81, 0.72), dtype=np.float32) * shade
        rect = UNIFORM_ATLAS["badge"]
        rows, columns = _atlas_rows(rect, 0, 1), _atlas_columns(rect)
        badge = bpy.data.images.load(badge_png, check_existing=False)
        badge.scale(columns.stop - columns.start, rows.stop - rows.start)
        data = np.empty(badge.size[0] * badge.size[1] * 4, dtype=np.float32)
        badge.pixels.foreach_get(data)
        bpy.data.images.remove(badge)
        pixels[rows, columns] = data.reshape(rows.stop - rows.start, columns.stop - columns.start, 4)
        _save(pixels, path, False)
    return bpy.data.images.load(path, check_existing=True)


def _empty_rect(alpha, width, height, step=32):
    """Ô trống (alpha = 0) đầu tiên cỡ width x height trong ảnh, trả về (x, y) góc dưới trái hoặc None."""
    filled = np.cumsum(np.cumsum((alpha > 0.02).astype(np.int64), axis=0), axis=1)
    filled = np.pad(filled, ((1, 0), (1, 0)))
    rows, columns = alpha.shape
    for y in range(8, rows - height - 8, step):
        for x in range(8, columns - width - 8, step):
            inside = filled[y + height, x + width] - filled[y, x + width] - filled[y + height, x] + filled[y, x]
            if inside == 0:
                return x, y
    return None


def uv_occupancy(obj, size):
    """Mặt nạ size x size các điểm ảnh nằm trong hộp bao UV của một mặt nào đó của obj (để tìm chỗ kết cấu chưa dùng)."""
    used = np.zeros((size, size), dtype=bool)
    layer = obj.data.uv_layers[0].data
    for poly in obj.data.polygons:
        us = [layer[i].uv[0] for i in poly.loop_indices]
        vs = [layer[i].uv[1] for i in poly.loop_indices]
        x0, x1 = int(max(min(us), 0.0) * size), int(min(max(us), 1.0) * size) + 1
        y0, y1 = int(max(min(vs), 0.0) * size), int(min(max(vs), 1.0) * size) + 1
        used[y0:y1, x0:x1] = True
    return used


def hair_image(source, obj):
    """Kết cấu tóc đã nhuộm đen, vẽ thêm một ô sợi tóc mảnh (cho thẻ tóc mái/tóc con) vào chỗ trống.
    Trả về (ảnh, ô UV (x0, y0, x1, y1)); sợi đậm ở mép trên của ô và mảnh dần xuống dưới."""
    key = hashlib.sha256(("|".join([CACHE_VERSION, source, "strands"])).encode()).hexdigest()[:12]
    stem = os.path.splitext(os.path.basename(source))[0]
    path = os.path.join(CACHE_DIR, "%s_strands_%s.png" % (stem, key))
    rect_path = path[:-4] + ".json"
    if not (os.path.isfile(path) and os.path.isfile(rect_path)):
        os.makedirs(CACHE_DIR, exist_ok=True)
        pixels = _hair(_load(source, HAIR_SIZE))
        size = pixels.shape[0]
        spot = None
        unused = np.where(uv_occupancy(obj, size), 1.0, 0.0)     # chỗ không mặt nào của lưới tóc dùng tới
        for width, height in ((192, 256), (144, 192), (96, 160), (64, 128)):
            spot = _empty_rect(unused, width, height, step=16)
            if spot is not None:
                break
        if spot is None:
            raise RuntimeError("Kết cấu tóc %s không còn chỗ trống để vẽ ô sợi tóc" % source)
        x0, y0 = spot
        ys, xs = np.mgrid[0:height, 0:width]
        fade = np.clip(ys / (height * 0.75), 0.0, 1.0) ** 0.8             # 0 ở đáy (ngọn tóc), 1 ở trên (chân tóc)
        alpha = np.zeros((height, width))
        for strand in range(STRAND_COUNT):
            centre = (strand + 0.5) * width / STRAND_COUNT + 2.5 * np.sin(ys / 23.0 + strand * 1.7)
            thickness = 2.6 + 3.4 * fade * (0.6 + 0.4 * np.sin(strand * 2.3) ** 2)
            alpha = np.maximum(alpha, np.clip(1.5 - np.abs(xs - centre) / thickness, 0.0, 1.0) * np.clip(fade * 1.6, 0.0, 1.0))
        patch = pixels[y0:y0 + height, x0:x0 + width]
        patch[..., :3] = np.array(HAIR_COLOR, dtype=np.float32) * 0.85
        patch[..., 3] = alpha
        _save(pixels, path, True)
        with open(rect_path, "w", encoding="utf-8") as f:
            json.dump([x0 / size, y0 / size, (x0 + width) / size, (y0 + height) / size], f)
    with open(rect_path, encoding="utf-8") as f:
        rect = tuple(json.load(f))
    return bpy.data.images.load(path, check_existing=True), rect


def set_material(obj, name, image, alpha_mode=None, normal=None, roughness=0.7, double_sided=False,
                 color=(1.0, 1.0, 1.0, 1.0), alpha_cutoff=0.5, glow=0.0, append=False):
    """Gán cho obj một vật liệu Principled tên `name`. alpha_mode: None | 'MASK' | 'BLEND'."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = not double_sided
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Base Color"].default_value = color
    if image is not None:
        tex_node = nodes.new("ShaderNodeTexImage")
        tex_node.image = image
        links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
        if glow > 0.0:      # tự phát sáng rất nhẹ bằng chính kết cấu: lòng trắng mắt không chìm thành hốc đen dưới trời u ám / AO
            links.new(tex_node.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = glow
        if alpha_mode == "BLEND":
            links.new(tex_node.outputs["Alpha"], bsdf.inputs["Alpha"])
            material.surface_render_method = "BLENDED"
        elif alpha_mode == "MASK":
            less = nodes.new("ShaderNodeMath")
            less.operation = "LESS_THAN"
            less.inputs[1].default_value = alpha_cutoff
            invert = nodes.new("ShaderNodeMath")
            invert.operation = "SUBTRACT"
            invert.inputs[0].default_value = 1.0
            links.new(tex_node.outputs["Alpha"], less.inputs[0])
            links.new(less.outputs[0], invert.inputs[1])
            links.new(invert.outputs[0], bsdf.inputs["Alpha"])
    if normal is not None:
        normal_tex = nodes.new("ShaderNodeTexImage")
        normal_tex.image = normal
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    if not append:
        obj.data.materials.clear()
    obj.data.materials.append(material)
    return material
