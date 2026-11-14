"""Chỉnh tóc sau khi đã gắn shape key: thêm thẻ tóc mái thưa / tóc con, ép tóc ôm má, uốn gợn sóng, thu đuôi ngựa thành búi.

Mọi biến dạng được áp lên TẤT CẢ shape key của lưới tóc nên morph khuôn mặt vẫn khớp. Thẻ tóc mới là lưới riêng,
lấy shape key theo đỉnh lưới gốc gần nhất (people_faces.apply) rồi gộp vào lưới tóc; UV của chúng trỏ vào ô sợi tóc
do people_textures.hair_image vẽ thêm vào chỗ trống của kết cấu tóc.
"""
import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import bmesh
import people_aodai as cut
import people_faces as faces

HEAD_BONE = cut.P + "Head"
STRAND_LIFT = 0.006                 # m: thẻ tóc cách da trán
FRINGE_X = (0.012, 0.024, 0.036, 0.048, 0.06)      # m: vị trí các lọn mái mỗi bên (hở ngôi giữa)
FRINGE_WIDTH, FRINGE_SEGMENTS = 0.022, 6
WAVE_AMPLITUDE, WAVE_LENGTH = 0.013, 0.15   # m: tóc gợn sóng
PRESS = 0.12                        # tỉ lệ ép tóc hai bên vào má
BUN_SCALE = 0.38


def _all_blocks(obj):
    return [b.data for b in obj.data.shape_keys.key_blocks] if obj.data.shape_keys else [obj.data.vertices]


def _deform(obj, displacement_of):
    """Cộng cùng một độ dời (tính từ toạ độ gốc) vào mọi shape key."""
    count = len(obj.data.vertices)
    base = np.empty(count * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", base)
    shift = displacement_of(base.reshape(-1, 3).astype(np.float64)).astype(np.float32)
    for data in _all_blocks(obj):
        co = np.empty(count * 3, dtype=np.float32)
        data.foreach_get("co", co)
        data.foreach_set("co", (co.reshape(-1, 3) + shift).ravel())
    obj.data.update()


class Head:
    """Mốc đo trên đầu (lấy từ lưới thân cuối và lưới lông mày)."""

    def __init__(self, body, eyebrows):
        co = cut._coords(body)
        self.top_z = float(co[:, 2].max())
        brow = cut._coords(eyebrows)
        self.brow_z = float(brow[:, 2].mean())
        self.face_y = float(brow[:, 1].min())
        self.centre_y = float(co[co[:, 2] > self.brow_z, 1].mean())
        bm = bmesh.new()
        bm.from_mesh(body.data)
        self.skin = BVHTree.FromBMesh(bm)
        bm.free()
        self.hairline_z = self.brow_z + (self.top_z - self.brow_z) * 0.52
        self.ear_z = self.brow_z - 0.03

    def forehead(self, x, z):
        hit, normal, _index, _dist = self.skin.ray_cast(Vector((x, self.face_y - 0.5, z)), Vector((0, 1, 0)))
        if hit is None:
            hit, normal, _index, _dist = self.skin.find_nearest(Vector((x, self.face_y, z)))
        return hit, normal


def _strand_object(name, hair, strands, rect):
    """Lưới các thẻ tóc: mỗi thẻ là dải cong (danh sách điểm tâm, bề rộng), UV dọc theo một cột của ô sợi tóc."""
    verts, faces_, uvs = [], [], []
    x0, y0, x1, y1 = rect
    for index, (points, width) in enumerate(strands):
        base = len(verts)
        column = (index % 6) / 6.0
        for k, point in enumerate(points):
            f = k / (len(points) - 1)
            taper = width * (1.0 - 0.45 * f)
            for j, offset in enumerate((-0.5, 0.5)):
                verts.append(point + Vector((offset * taper, 0.0, 0.0)))
                uvs.append((x0 + (x1 - x0) * (column + j / 6.0), y1 - (y1 - y0) * f))
        for k in range(len(points) - 1):
            faces_.append((base + k * 2, base + k * 2 + 1, base + k * 2 + 3, base + k * 2 + 2))
    obj = cut._new_object(name, hair, verts, faces_, [{HEAD_BONE: 1.0} for _ in verts])
    layer = obj.data.uv_layers[0]
    for loop in obj.data.loops:
        layer.data[loop.index].uv = uvs[loop.vertex_index]
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.materials.append(hair.data.materials[0])
    return obj


def add_fringe(hair, head, rig, face_base, face_deltas, rect, length=1.0, extra=()):
    """Mái thưa: các lọn mảnh từ chân tóc rủ xuống ngang lông mày (length = 1), hở ngôi giữa. extra: lọn thêm (x)."""
    strands = []
    bottom = head.brow_z + 0.004 + (1.0 - length) * (head.hairline_z - head.brow_z)
    for side in (1.0, -1.0):
        for i, x in enumerate(tuple(FRINGE_X) + tuple(extra)):
            points = []
            for k in range(FRINGE_SEGMENTS + 1):
                f = k / FRINGE_SEGMENTS
                z = head.hairline_z + 0.012 - (head.hairline_z + 0.012 - bottom) * f * (0.9 + 0.1 * math.cos(i * 2.1))
                hit, normal = head.forehead(side * (x + 0.012 * f), z)
                points.append(hit + normal * (STRAND_LIFT + 0.003 * math.sin(math.pi * f)))
            strands.append((points, FRINGE_WIDTH))
    fringe = _strand_object(hair.name + "_fringe", hair, strands, rect)
    fringe.parent = rig
    faces.apply(fringe, face_base, face_deltas)
    return cut._join(hair, [fringe])


def press_to_cheeks(hair, head):
    """Ép phần tóc hai bên mặt (từ thái dương xuống cằm, nửa trước) vào gần má hơn."""
    def shift(co):
        beside = cut._smooth(0.05, 0.08, np.abs(co[:, 0])) * (co[:, 2] < head.brow_z + 0.02) * (co[:, 2] > head.brow_z - 0.2)
        front = 1.0 - cut._smooth(head.centre_y - 0.02, head.centre_y + 0.04, co[:, 1])
        out = np.zeros_like(co)
        out[:, 0] = -co[:, 0] * PRESS * beside * front
        return out
    _deform(hair, shift)


def wave(hair, head):
    """Gợn sóng nhẹ theo chiều dài cho phần tóc dưới tai."""
    def shift(co):
        depth = np.clip((head.ear_z - co[:, 2]) / 0.15, 0.0, 1.0)
        angle = np.arctan2(co[:, 1] - head.centre_y, co[:, 0])
        phase = 2 * math.pi * co[:, 2] / WAVE_LENGTH + 2.0 * angle
        radial = np.stack([np.cos(angle), np.sin(angle), np.zeros(len(co))], axis=1)
        return radial * (WAVE_AMPLITUDE * depth * (1.0 + np.sin(phase)))[:, None]   # chỉ gợn ra ngoài, không chìm vào lưng áo
    _deform(hair, shift)


def bun(hair, head):
    """Thu đuôi ngựa thành búi thấp sau gáy: các đỉnh nằm xa hộp sọ phía sau được co về tâm búi."""
    def shift(co):
        behind = co[:, 1] > head.centre_y + 0.085
        low = co[:, 2] < head.ear_z + 0.03
        tail = behind & (low | (co[:, 1] > head.centre_y + 0.11))
        if not tail.any():
            return np.zeros_like(co)
        centre = np.array([0.0, head.centre_y + 0.105, head.ear_z - 0.035])
        out = np.zeros_like(co)
        out[tail] = (centre + (co[tail] - co[tail].mean(axis=0)) * BUN_SCALE) - co[tail]
        return out
    _deform(hair, shift)


def trim_fringe(hair, head, lift=0.014):
    """Mái dài che mắt: thu ngắn phần tóc rủ trước mặt lên trên lông mày (nén theo chiều dọc), hai bên má giữ nguyên."""
    limit = head.brow_z + lift

    def shift(co):
        front = 1.0 - cut._smooth(head.face_y + 0.035, head.face_y + 0.06, co[:, 1])
        middle = 1.0 - cut._smooth(0.05, 0.066, np.abs(co[:, 0]))
        out = np.zeros_like(co)
        out[:, 2] = np.maximum(limit - co[:, 2], 0.0) * 0.9 * front * middle
        out[:, 1] = -0.004 * front * middle * (co[:, 2] < limit)
        return out
    _deform(hair, shift)


def slim(hair, head, amount=0.3):
    """Thu khối tóc cho ôm đầu hơn: kéo các đỉnh về phía trục đầu theo phương ngang, bớt `amount` phần phồng ngoài hộp sọ."""
    def shift(co):
        dx, dy = co[:, 0], co[:, 1] - head.centre_y
        reach = np.hypot(dx, dy)
        excess = np.maximum(reach - 0.075, 0.0) * amount * (co[:, 2] < head.top_z - 0.03)
        out = np.zeros_like(co)
        out[:, 0] = -dx / np.maximum(reach, 1e-6) * excess
        out[:, 1] = -dy / np.maximum(reach, 1e-6) * excess
        return out
    _deform(hair, shift)


def cut_fringe(hair, head):
    """Cắt bỏ hẳn các mặt tóc mái rủ trước trán (giữa hai thái dương, dưới chân tóc): trán và hai mày lộ ra."""
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    doomed = [f for f in bm.faces if abs(f.calc_center_median().x) < 0.062 and f.calc_center_median().y < head.centre_y - 0.035
              and f.calc_center_median().z < head.hairline_z + 0.004]
    gone = set(doomed)
    rim = {v for f in doomed for v in f.verts if any(g not in gone for g in v.link_faces)}      # đỉnh nằm trên đường cắt
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    rim = [v for v in rim if v.is_valid]
    layers = list(bm.verts.layers.shape.values())
    for _ in range(12):                                   # làm trơn đường cắt: mỗi đỉnh mép về giữa hai đỉnh mép kề (dời cả mọi shape key)
        moves = {}
        chosen = set(rim)
        for vert in rim:
            near = [e.other_vert(vert) for e in vert.link_edges if len(e.link_faces) < 2 and e.other_vert(vert) in chosen]
            if len(near) >= 2:
                moves[vert] = (sum((n.co for n in near), Vector()) / len(near) - vert.co) * 0.5
        for vert, shift in moves.items():
            vert.co += shift
            for layer in layers:
                vert[layer] = vert[layer] + shift
    bm.to_mesh(hair.data)
    bm.free()
    hair.data.update()


def tidy(hair, head, smallest=30):
    """Bỏ các mảnh tóc rời rạc (cụm mặt liền nhau ít hơn `smallest` mặt): hết mảnh lởm chởm trên đỉnh đầu."""
    bm = bmesh.new()
    bm.from_mesh(hair.data)
    seen, doomed = set(), []
    for face in bm.faces:
        if face in seen:
            continue
        island, stack = [], [face]
        seen.add(face)
        while stack:
            current = stack.pop()
            island.append(current)
            for edge in current.edges:
                for other in edge.link_faces:
                    if other not in seen:
                        seen.add(other)
                        stack.append(other)
        if len(island) < smallest:
            doomed.extend(island)
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(hair.data)
    bm.free()
    hair.data.update()
    print("TOC %s: bỏ %d mặt rời" % (hair.name, len(doomed)))


STYLES = {
    "tidy": lambda hair, head, ctx: tidy(hair, head),
    "cut_fringe": lambda hair, head, ctx: cut_fringe(hair, head),
    "slim": lambda hair, head, ctx: slim(hair, head),
    "trim_high": lambda hair, head, ctx: trim_fringe(hair, head, 0.034),
    "trim": lambda hair, head, ctx: trim_fringe(hair, head),
    "fringe": lambda hair, head, ctx: add_fringe(hair, head, *ctx),
    "babyhair": lambda hair, head, ctx: add_fringe(hair, head, *ctx, length=0.55, extra=(0.072, 0.003)),
    "press": lambda hair, head, ctx: press_to_cheeks(hair, head),
    "wave": lambda hair, head, ctx: wave(hair, head),
    "bun": lambda hair, head, ctx: bun(hair, head),
}


def style(meshes, rig, recipe, face_data, strand_rects):
    """recipe: {tên lưới tóc: (tên kiểu, ...)}. strand_rects: {tên lưới tóc: ô sợi tóc trong kết cấu}."""
    if not recipe:
        return
    head = Head(meshes["body"], meshes["eyebrows"])
    base, deltas = face_data["body"]
    for mesh_name, steps in recipe.items():
        for step in steps:
            STYLES[step](meshes[mesh_name], head, (rig, base, deltas, strand_rects[mesh_name]))
        meshes[mesh_name].name = meshes[mesh_name].data.name = mesh_name
