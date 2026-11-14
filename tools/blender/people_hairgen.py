"""Tóc dựng theo thủ tục (thay tóc MakeHuman): lớp vỏ ôm da đầu + rèm tóc rủ + thẻ tóc mái + đuôi/búi dạng ống.

- Vỏ: lưới (góc quanh đầu) x (góc ngẩng) bắn tia từ tâm đầu ra da; chỉ phủ nơi da thuộc nhóm đỉnh `scalp` của MakeHuman nên
  đường chân tóc (trán, thái dương, gáy) đi đúng theo da đầu. Sát chân tóc UV vào vùng "mọc dần" của atlas (alpha loang theo
  sợi) nên chân tóc không phải đường cắt thẳng.
- Rèm: từ một vòng của vỏ (ngang tai) thả các hàng xuống tới độ dài của kiểu tóc; cuối rèm UV vào vùng "thưa dần" (đuôi tóc mềm).
- Mọi lưới dùng chung một atlas sợi tóc (people_textures.hair_atlas). Morph mặt lấy theo đỉnh da gần nhất (people_faces.apply).

Hệ Blender: mặt nhìn về -Y, bên trái người là +X. Góc quanh đầu a: 0 = chính diện, +90 độ = bên trái người, 180 = sau gáy.
"""
import math

import numpy as np
from mathutils import Vector, kdtree

import people_aodai as cut
import people_textures as tex

COLUMNS, ROWS = 84, 36
TOP_DEG, BOTTOM_DEG = 86.0, -72.0
ROOT_FADE = 0.014                    # m: bề rộng dải chân tóc mọc dần
STYLES_FEMALE = ("bob", "long", "wavy_half", "pixie", "bob_bangs", "pony")
STYLES_MALE = ("side", "crew", "fringe", "shaved")
# top/side: độ dày tóc trên đỉnh / hai bên (m); asym: phồng lệch về bên trái (ngôi lệch); recede: lùi chân tóc trán (ô lưới)
# curtain: (nửa góc hở mặt (độ), độ cao đuôi tóc so với khớp cổ (m), thu vào ở đuôi (m), biên độ gợn sóng (m))
# fringe: (số thẻ mỗi bên, độ dài 0..1 từ chân tóc tới lông mày, lệch ngang ở đuôi thẻ (m), bề rộng thẻ (m))
STYLES = {
    "bob": dict(top=0.016, side=0.012, asym=0.004, curtain=(60.0, -0.005, 0.022, 0.0), fringe=(3, 0.3, 0.03, 0.03)),
    "long": dict(top=0.013, side=0.011, asym=0.0, curtain=(57.0, -0.25, 0.02, 0.0), fringe=(5, 0.72, 0.004, 0.016)),
    "wavy_half": dict(top=0.011, side=0.012, asym=0.0, curtain=(60.0, -0.22, 0.01, 0.011), fringe=(2, 0.25, 0.03, 0.022), tail=("half", 0.13)),
    "pixie": dict(top=0.022, side=0.009, asym=0.006, fringe=(5, 0.5, 0.022, 0.024)),
    "bob_bangs": dict(top=0.015, side=0.013, asym=0.0, curtain=(58.0, 0.045, 0.02, 0.0), fringe=(7, 0.9, 0.0, 0.017)),
    "pony": dict(top=0.008, side=0.007, asym=0.0, fringe=(3, 0.28, 0.012, 0.014), tail=("pony", 0.24)),
    "side": dict(top=0.021, side=0.005, asym=0.008, fringe=(4, 0.2, 0.02, 0.024)),
    "crew": dict(top=0.009, side=0.006, asym=0.0),
    "fringe": dict(top=0.017, side=0.006, asym=0.0, fringe=(6, 0.52, 0.006, 0.02)),
    # lớp lót chân tóc mềm nằm dưới lưới tóc MakeHuman (UV trong ô đơn vị, make_wardrobe đưa vào ô sợi tóc của kết cấu tóc đó)
    "undercoat": dict(top=0.004, side=0.003, asym=0.0, undercoat=True),
    "shaved": dict(top=0.0012, side=0.0012, asym=0.0, stubble=True),
}


def _triangle(x):
    """Sóng tam giác 0..1: dùng cho toạ độ u quanh đầu (liền mạch, không có đường nối)."""
    x = x % 2.0
    return x if x <= 1.0 else 2.0 - x


class Scalp:
    """Da đầu của một nhân vật: tâm bắn tia, phép dò da, mốc độ cao."""

    def __init__(self, body, rig, eyebrows):
        co = cut._coords(body)
        self.is_scalp = cut._members(body, "scalp")
        self.tree = cut._bvh(body)
        self.lookup = kdtree.KDTree(len(co))
        for i, c in enumerate(co):
            self.lookup.insert(c, i)
        self.lookup.balance()
        scalp = co[self.is_scalp]
        self.top_z = float(co[:, 2].max())
        self.centre = Vector((0.0, float(scalp[:, 1].mean()), self.top_z - 0.105))
        self.neck_z = rig.data.bones[cut.P + "Neck"].head_local.z
        self.head_z = rig.data.bones[cut.P + "Head"].head_local.z
        self.brow_z = float(cut._coords(eyebrows)[:, 2].mean())

    def direction(self, a, e):
        return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))

    def hit(self, a, e):
        """(điểm trên da, có phải da đầu không) theo hướng (a, e) từ tâm đầu."""
        d = self.direction(a, e)
        point, _normal, _index, _dist = self.tree.ray_cast(self.centre + d * 0.4, -d, 0.4)
        if point is None:
            return self.centre + d * 0.09, False
        return point, bool(self.is_scalp[self.lookup.find(point)[1]])

    def forehead(self, x, z):
        point, normal, _index, _dist = self.tree.ray_cast(Vector((x, self.centre.y - 0.5, z)), Vector((0, 1, 0)))
        if point is None:
            point, normal, _index, _dist = self.tree.find_nearest(Vector((x, self.centre.y - 0.1, z)))
        return point, normal

    def hairline_z(self, x):
        """Độ cao chân tóc trên trán tại hoành độ x."""
        for step in range(60):
            z = self.brow_z + 0.01 + step * 0.003
            point, _normal = self.forehead(x, z)
            if self.is_scalp[self.lookup.find(point)[1]]:
                return z
        return self.brow_z + 0.06


class _Builder:
    def __init__(self, stubble):
        self.verts, self.faces, self.uvs = [], [], []
        x0, y0, x1, y1 = tex.HAIR_ATLAS["stubble" if stubble else "strands"] if stubble is not None else (0.0, 0.0, 1.0, 1.0)
        self.rect, self.stubble = (x0, y0, x1, y1), stubble

    def add(self, point, u, v):
        x0, y0, x1, y1 = self.rect
        u = u % 1.0 if u > 1.0 else u
        self.verts.append(point)
        self.uvs.append((x0 + (x1 - x0) * min(max(u, 0.01), 0.99), y0 + (y1 - y0) * min(max(v, 0.005), 0.995)))
        return len(self.verts) - 1


def _thickness(spec, a, e):
    rise = float(cut._smooth(math.radians(0.0), math.radians(55.0), e))
    return spec["side"] + (spec["top"] - spec["side"]) * rise + spec["asym"] * rise * max(math.sin(a), 0.0)


def _shell(scalp, spec, out):
    """Lớp vỏ ôm da đầu. Trả về lưới chỉ số đỉnh [cột][hàng] (None nếu không có tóc), các góc quanh đầu và góc ngẩng."""
    angles = [2 * math.pi * (i + 0.5) / COLUMNS for i in range(COLUMNS)]     # lệch nửa bước: không tia nào đi đúng mặt phẳng đối xứng (tia trượt cạnh lưới -> khấc giữa trán)
    elevations = [math.radians(TOP_DEG + (BOTTOM_DEG - TOP_DEG) * j / (ROWS - 1)) for j in range(ROWS)]
    skin = [[scalp.hit(a, e) for e in elevations] for a in angles]
    cover = np.array([[1.0 if s else 0.0 for _p, s in column] for column in skin])
    for _ in range(2):                                       # làm mềm ranh giới da đầu: chân tóc mọc dần, không thành bậc thang
        cover = (np.roll(cover, 1, 0) + cover + np.roll(cover, -1, 0)) / 3.0
        padded = np.pad(cover, ((0, 0), (1, 1)), mode="edge")
        cover = (padded[:, :-2] + cover + padded[:, 2:]) / 3.0
    index = [[None] * ROWS for _ in range(COLUMNS)]
    stubble = spec.get("stubble", False)
    for i, a in enumerate(angles):
        for j, e in enumerate(elevations):
            if cover[i, j] < 0.06 or (skin[i][j][0] - scalp.centre).length > 0.17:      # tia trượt xuống cổ/vai: không phải da đầu
                continue
            root = float(cut._smooth(0.15, 0.8, cover[i, j]))
            position = skin[i][j][0] + scalp.direction(a, e) * (_thickness(spec, a, e) * (1.0 if stubble else 0.2 + 0.8 * root))
            if spec.get("undercoat"):
                u, v = _triangle(i * 8.0 / COLUMNS + 0.07 * j), 0.05 + 0.85 * root
            elif stubble:
                u, v = _triangle(i * 2.0 / COLUMNS + 0.031 * j), (0.5 * cover[i, j] if cover[i, j] < 0.999 else 0.5 + 0.45 * j / ROWS)
            else:
                u, v = _triangle(i * 6.0 / COLUMNS + 0.13 * j), (0.1 * root if root < 0.999 else 0.2 + 0.5 * j / ROWS)
            index[i][j] = out.add(position, u, v)
    for i in range(COLUMNS):
        k = (i + 1) % COLUMNS
        for j in range(ROWS - 1):
            quad = (index[i][j + 1], index[k][j + 1], index[k][j], index[i][j])      # mặt hướng ra ngoài
            if all(q is not None for q in quad):
                out.faces.append(quad)
    return index, angles, elevations


def _curtain(scalp, spec, out, index, angles, elevations, layer):
    """Rèm tóc rủ từ vòng ngang tai của vỏ xuống tới độ dài của kiểu tóc; layer 1 là lớp ngoài, ngắn hơn và lệch sợi."""
    face_half, end_above_neck, taper, wave = spec["curtain"]
    drop = min(range(ROWS), key=lambda j: abs(elevations[j] - math.radians(2.0)))
    end_z = scalp.neck_z + end_above_neck + 0.015 * layer
    previous, first = None, None
    for i in range(COLUMNS + 1):
        c = i % COLUMNS
        a = math.atan2(math.sin(angles[c]), math.cos(angles[c]))
        if abs(a) < math.radians(face_half) or index[c][drop] is None:
            previous = None
            continue
        start = out.verts[index[c][drop]].copy()
        outward = Vector((start.x - scalp.centre.x, start.y - scalp.centre.y, 0.0)).normalized()
        # tóc dài chỉ rủ qua vai ở phía sau lưng; hai bên dừng trên vai (kẻo cắm xuyên vai áo)
        side_end = max(end_z, scalp.neck_z + 0.035)
        length = start.z - (side_end + (end_z - side_end) * float(cut._smooth(math.radians(105.0), math.radians(135.0), abs(a))))
        rows = max(int(math.ceil(length / 0.015)), 2)
        column = [index[c][drop]]
        for k in range(1, rows + 1):
            f = k / rows
            swell = wave * math.sin(2 * math.pi * (f * length / 0.11) + 1.7 * a + 2.0 * layer) * f
            lift = 0.005 * layer * float(cut._smooth(0.0, 0.25, f))          # lớp ngoài tách dần khỏi lớp trong
            point = start + Vector((0, 0, -length * f)) + outward * (swell + lift + 0.004 * math.sin(math.pi * f) - taper * f * f)
            column.append(out.add(point, _triangle(c * 6.0 / COLUMNS + 0.37 * layer), 0.45 if f < 0.72 else 0.8 + 0.2 * (f - 0.72) / 0.28))
        if previous is not None and len(previous) == len(column):
            for k in range(len(column) - 1):
                out.faces.append((previous[k], column[k], column[k + 1], previous[k + 1]))
        previous = column


def _fringe(scalp, spec, out):
    """Thẻ tóc mái: dải cong từ trên chân tóc rủ xuống trán, lệch ngang dần (mái lệch) hoặc thẳng (mái bằng)."""
    count, length, sweep, width = spec["fringe"]
    for side in (1.0, -1.0):
        for n in range(count):
            x = side * (0.006 + (0.058 - 0.006) * (n + 0.5) / count)
            top = scalp.hairline_z(x) + 0.014
            bottom = scalp.brow_z + 0.004 + (1.0 - length) * (top - 0.014 - scalp.brow_z)
            column = _triangle(0.17 * n + (0.5 if side < 0 else 0.0))
            previous = None
            for k in range(7):
                f = k / 6
                shift = sweep * f * f * (1.0 if spec["asym"] else side)
                point, normal = scalp.forehead(x + shift, top + (bottom - top) * f)
                centre = point + normal * (0.007 + 0.004 * math.sin(math.pi * f))
                half = width * (1.0 - 0.5 * f) / 2.0
                pair = (out.add(centre + Vector((-half, 0, 0)), column, 0.12 + 0.88 * f), out.add(centre + Vector((half, 0, 0)), column + 0.04, 0.12 + 0.88 * f))
                if previous is not None:
                    out.faces.append((previous[0], previous[1], pair[1], pair[0]))
                previous = pair


def _tail(scalp, spec, out):
    """Đuôi ngựa thấp ("pony") hoặc túm tóc buộc nửa đầu ("half"): ống dẹt thuôn dần, rủ sau gáy."""
    kind, length = spec["tail"]
    start, _is_scalp = scalp.hit(math.pi, math.radians(-22.0 if kind == "pony" else 28.0))
    start = start + Vector((0, 0.012, 0))
    radius = 0.024 if kind == "pony" else 0.017
    segments, around = 9, 10
    rings = []
    for k in range(segments + 1):
        f = k / segments
        centre = start + Vector((0.0, 0.018 * math.sin(math.pi * min(f * 1.4, 1.0)) + 0.01 * f, -length * f))
        size = radius * (0.75 + 0.5 * math.sin(math.pi * min(f * 2.0, 1.0))) * (1.0 - 0.75 * f * f)
        ring = [out.add(centre + Vector((math.cos(2 * math.pi * t / around) * size * 1.25, math.sin(2 * math.pi * t / around) * size * 0.8, 0.0)),
                        _triangle(2.0 * t / around + 0.3), 0.3 + 0.7 * f) for t in range(around)]
        rings.append(ring)
    for k in range(segments):
        for t in range(around):
            out.faces.append((rings[k][t], rings[k][(t + 1) % around], rings[k + 1][(t + 1) % around], rings[k + 1][t]))


def build(name, style, body, rig, eyebrows):
    """Dựng lưới tóc `name` theo kiểu `style` (mọi đỉnh theo xương Head; people_hairfit sẽ chỉnh phần rủ xuống thân)."""
    spec = STYLES[style]
    scalp = Scalp(body, rig, eyebrows)
    out = _Builder(None if spec.get("undercoat") else spec.get("stubble", False))
    index, angles, elevations = _shell(scalp, spec, out)
    if "curtain" in spec:
        _curtain(scalp, spec, out, index, angles, elevations, 0)
        _curtain(scalp, spec, out, index, angles, elevations, 1)
    if "fringe" in spec:
        _fringe(scalp, spec, out)
    if "tail" in spec:
        _tail(scalp, spec, out)
    hair = cut._new_object(name, body, out.verts, out.faces, [{cut.P + "Head": 1.0} for _ in out.verts])
    layer = hair.data.uv_layers[0]
    for loop in hair.data.loops:
        layer.data[loop.index].uv = out.uvs[loop.vertex_index]
    return hair
