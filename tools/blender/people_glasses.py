"""Kính mắt dựng theo thủ tục: lưới `glasses_0..2`, mỗi lưới hai vật liệu dùng chung `frame` (gọng) và `lens` (tròng).

Vị trí lấy theo mặt gốc: tâm tròng trước nhãn cầu, cầu kính tựa sống mũi, càng kính chạy tới trên vành tai. Mọi đỉnh theo
xương Head; morph mặt lấy theo đỉnh da gần nhất (people_faces.apply) nên kính co giãn theo sáu kiểu mặt.
Màu gọng / tròng lấy từ hai bảng màu nhỏ (people_textures.glasses_palettes): UV của mỗi kiểu kính trỏ vào một ô màu.
"""
import math

import numpy as np
from mathutils import Vector

import people_aodai as cut

# (nửa rộng, nửa cao tròng (m), số mũ siêu ê-líp, bán kính gọng (m), ô màu gọng, ô màu tròng)
KINDS = (
    dict(half=(0.025, 0.0165), power=4.0, rim=0.0017, frame=0, lens=0),      # gọng nhựa đen chữ nhật bo góc
    dict(half=(0.0225, 0.019), power=2.0, rim=0.0008, frame=1, lens=0),      # gọng kim loại mảnh, oval
    dict(half=(0.0275, 0.023), power=2.6, rim=0.0021, frame=2, lens=1),      # gọng to, tròng nâu khói nhạt
)
RIM_POINTS, RIM_SIDES = 28, 6
EYE_RELIEF = 0.013                   # m: tròng kính cách nhãn cầu


def _palette_uv(cell):
    return ((cell + 0.5) / 4.0, 0.5)


class _Mesh:
    def __init__(self):
        self.verts, self.faces, self.uvs, self.slots = [], [], [], []

    def tube(self, path, radius, uv, slot, sides=RIM_SIDES, closed=False):
        """Ống quanh một đường gấp khúc (closed: vòng kín)."""
        rings = []
        count = len(path)
        for k, point in enumerate(path):
            a = path[(k - 1) % count] if closed or k > 0 else point
            b = path[(k + 1) % count] if closed or k < count - 1 else point
            tangent = (b - a).normalized()
            side = tangent.cross(Vector((0.0, 0.0, 1.0)))
            side = side.normalized() if side.length > 1e-6 else Vector((1.0, 0.0, 0.0))
            up = side.cross(tangent).normalized()
            ring = []
            for t in range(sides):
                angle = 2 * math.pi * t / sides
                ring.append(len(self.verts))
                self.verts.append(point + (side * math.cos(angle) + up * math.sin(angle)) * radius)
                self.uvs.append(uv)
            rings.append(ring)
        for k in range(count if closed else count - 1):
            a, b = rings[k], rings[(k + 1) % count]
            for t in range(sides):
                self.faces.append((a[t], a[(t + 1) % sides], b[(t + 1) % sides], b[t]))
                self.slots.append(slot)

    def fan(self, centre, loop, uv, slot):
        base = len(self.verts)
        self.verts.append(centre)
        self.verts.extend(loop)
        self.uvs.extend([uv] * (len(loop) + 1))
        for k in range(len(loop)):
            self.faces.append((base, base + 1 + k, base + 1 + (k + 1) % len(loop)))
            self.slots.append(slot)


def anchors(body, eyes):
    """Mốc đặt kính trên mặt gốc (gọi khi lưới thân còn nhóm đỉnh `ears`)."""
    co, eye_co = cut._coords(body), cut._coords(eyes)
    ears = cut._members(body, "ears")
    tree = cut._bvh(body)
    poles, ear_tops = {}, {}
    for sign in (1.0, -1.0):
        side = eye_co[eye_co[:, 0] * sign > 0]
        poles[sign] = Vector(side[np.argmin(side[:, 1])])
        ear = co[ears & (co[:, 0] * sign > 0)]
        ear_tops[sign] = Vector(ear[np.argmax(ear[:, 2] - 0.5 * ear[:, 1])])       # chỗ cao và lùi sau của vành tai
    eye_z = (poles[1.0].z + poles[-1.0].z) / 2.0
    bridge, _normal, _index, _dist = tree.ray_cast(Vector((0.0, -1.0, eye_z - 0.002)), Vector((0, 1, 0)))
    return {"poles": poles, "ears": ear_tops, "bridge": bridge, "eye_z": eye_z, "tree": tree}


def build(name, kind, like, marks):
    """Một lưới kính. Trả về đối tượng lưới có hai ô vật liệu (0 = frame, 1 = lens) chưa gán vật liệu."""
    spec = KINDS[kind]
    mesh = _Mesh()
    half_w, half_h = spec["half"]
    frame_uv, lens_uv = _palette_uv(spec["frame"]), _palette_uv(spec["lens"])
    plane_y = min(marks["poles"][1.0].y, marks["poles"][-1.0].y) - EYE_RELIEF
    plane_y = min(plane_y, marks["bridge"].y - 0.004)        # không cắm vào sống mũi
    centre_z = marks["eye_z"] - 0.002
    spread = max(abs(marks["poles"][1.0].x), half_w + 0.007)   # nửa khoảng cách hai tâm tròng (hai tròng không chạm nhau)
    for sign in (1.0, -1.0):
        centre = Vector((sign * spread, plane_y, centre_z))
        rim = []
        for k in range(RIM_POINTS):
            angle = 2 * math.pi * k / RIM_POINTS
            c, s = math.cos(angle), math.sin(angle)
            x = half_w * math.copysign(abs(c) ** (2.0 / spec["power"]), c)
            z = half_h * math.copysign(abs(s) ** (2.0 / spec["power"]), s)
            wrap = 0.002 * (x * sign / half_w + 1.0) ** 2            # mép ngoài hơi ôm ra sau theo mặt
            rim.append(centre + Vector((x, wrap, z)))
        mesh.tube(rim, spec["rim"], frame_uv, 0, closed=True)
        mesh.fan(centre + Vector((0.0, 0.002, 0.0)), rim, lens_uv, 1)
        hinge = centre + Vector((sign * (half_w + 0.002), 0.012, half_h * 0.45))
        ear = marks["ears"][sign] + Vector((sign * 0.004, 0.0, 0.004))
        tip = ear + Vector((0.0, 0.022, -0.016))
        mesh.tube([centre + Vector((sign * half_w, 0.008, half_h * 0.45)), hinge, hinge.lerp(ear, 0.5) + Vector((sign * 0.003, 0, 0)), ear, tip],
                  max(spec["rim"] * 0.8, 0.0009), frame_uv, 0, sides=5)
    inner = spread - half_w
    arc = [Vector((x, plane_y - 0.001 + 0.004 * (1 - (x / max(inner, 1e-4)) ** 2), centre_z + half_h * 0.35 + 0.003 * (1 - (x / max(inner, 1e-4)) ** 2)))
           for x in np.linspace(-inner, inner, 7)]
    mesh.tube(arc, max(spec["rim"] * 0.9, 0.0009), frame_uv, 0, sides=5)
    obj = cut._new_object(name, like, mesh.verts, mesh.faces, [{cut.P + "Head": 1.0} for _ in mesh.verts])
    layer = obj.data.uv_layers[0]
    for loop in obj.data.loops:
        layer.data[loop.index].uv = mesh.uvs[loop.vertex_index]
    return obj, mesh.slots
