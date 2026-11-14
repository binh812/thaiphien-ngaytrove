"""Dựng bộ áo dài Việt Nam theo thủ tục (không dùng tài nguyên ngoài) trên lưới gốc MakeHuman:

- thân áo + tay dài + cổ đứng: lưới trợ giúp "helper-tights" phần trên eo, nới ra khỏi da; nẹp khuy chéo
  từ cổ sang nách phải và đường ráp tay raglan bên trái là dải nổi, kèm năm khuy vải;
- hai tà trước/sau: lưới ô dựng mới, xẻ từ eo, ôm theo thân tới hông rồi rủ phẳng và xoè dần tới mắt cá;
  mỗi tà có chuỗi 4 xương riêng (aodaiFront1..4, aodaiBack1..4, con của xương hông), không ăn trọng số xương chân;
- quần ống rộng suông: phần chân của "helper-tights" nong thành ống tròn;
- giày vải bệt: phần bàn chân của "helper-tights".
Mọi mảnh có UV theo mét (ô 0,25 m) để dùng normal map lụa lặp lại.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

P = "mixamorig:"                      # tiền tố xương lúc dựng (đổi tên sau cùng trong make_people)
ARM_MIN_X = 0.28                      # m: xa trục giữa hơn mức này là tay
UV_TILE = 0.25                        # m cho một lần lặp kết cấu
WAIST_OVERLAP = 0.04                  # m: thân áo phủ xuống dưới đường eo
COLLAR_HEIGHT = 0.038                 # m: cổ đứng tính từ gốc xương cổ
BODICE_INFLATE, COLLAR_STANDOFF = 0.004, 0.007
PANEL_ROWS, PANEL_COLUMNS = 20, 16
PANEL_HALF_ANGLE = math.radians(78)   # tà ôm quanh thân tới góc này ở eo (phần còn lại là khe xẻ)
PANEL_CLEARANCE = 0.012               # m: tà cách vải quần
PANEL_BONES = 4
PANEL_BODY_BLEND = (0.02, 0.2)        # theo t (0 = eo, 1 = gấu): đoạn chuyển từ xương thân sang xương tà
SHOE_TOP_ABOVE_ANKLE = 0.012
SHOE_INFLATE = 0.003
SHOE_POINT_LENGTH = 0.075              # m: đoạn mũi giày được thu nhọn
RIDGE_HALF_WIDTH, RIDGE_LIFT = 0.004, 0.0025
BUTTON_RADIUS, BUTTON_HEIGHT = 0.006, 0.004
COVER_DISTANCE, BOUNDARY_RINGS = 0.03, 2
COLLAR_SKIN_KEPT = 0.03
WEIGHT_SMOOTH_PASSES = 4
BACK_EASE_CUT = 0.7
HEM_FLATTEN = 0.05                    # m: dải gấu quần được ép phẳng
FRONT_BONES = ["aodaiFront%d" % (i + 1) for i in range(PANEL_BONES)]
BACK_BONES = ["aodaiBack%d" % (i + 1) for i in range(PANEL_BONES)]
BODY_BONES = (P + "Hips", P + "Spine", P + "Spine1")
PANEL_FOLDS = 3                       # số nếp dọc trên mỗi tà
SLEEVE_BELL_START = 0.35              # theo chiều dài tay (0 = vai, 1 = cổ tay): tay loe bắt đầu từ đây

# Thông số theo kiểu áo. "student": áo dài trắng nữ sinh, ôm, tà dài xoè chấm đất. "teacher": cách tân dáng suông,
# tay loe, tà ngắn hơn và thẳng, vải thêu hoa.
STYLES = {
    "student": dict(ease=0.0, hem_height=0.03, flare=0.9, fold_depth=0.022, edge_curl=0.05, sleeve_end=1.0, bell=1.0,
                    darts=True, collar_knot=False, trouser_radius=(0.088, 0.125), trouser_hem=0.012, fabric="silk"),
    "teacher": dict(ease=0.0, tube=0.012, smooth_passes=10, waist_overlap=0.05, uv_tile=0.15, cuff_rim=True, heel=0.05, hem_height=0.075, flare=0.08, fold_depth=0.006, edge_curl=0.0, sleeve_end=0.76, bell=2.0,
                    darts=False, collar_knot=True, trouser_radius=(0.088, 0.118), trouser_hem=0.02, fabric="embroidered"),
}


def _coords(obj):
    co = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3).astype(np.float64)


def _members(obj, group_name):
    index = obj.vertex_groups[group_name].index
    return np.array([any(g.group == index for g in v.groups) for v in obj.data.vertices])


def _smooth(edge0, edge1, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _submesh(body, mask, name):
    obj = body.copy()
    obj.data = body.data.copy()
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not mask[v.index]], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.name = obj.data.name = name
    for modifier in list(obj.modifiers):
        if modifier.type != "ARMATURE":
            obj.modifiers.remove(modifier)
    return obj


def _bvh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def _move(obj, new_coords):
    obj.data.vertices.foreach_set("co", np.asarray(new_coords, dtype=np.float32).ravel())
    obj.data.update()


def _inflate(obj, distances):
    normals = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("normal", normals)
    _move(obj, _coords(obj) + normals.reshape(-1, 3) * np.asarray(distances)[:, None])


def _new_object(name, like, verts, faces, weights):
    """Lưới mới có cùng danh sách nhóm đỉnh với `like`; weights: danh sách {tên nhóm: trọng số} theo đỉnh."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for group in like.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    for index, vertex_weights in enumerate(weights):
        for group_name, weight in vertex_weights.items():
            if weight > 1e-4:
                group = obj.vertex_groups.get(group_name) or obj.vertex_groups.new(name=group_name)
                group.add([index], weight, "REPLACE")
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = like.find_armature()
    mesh.uv_layers.new(name=like.data.uv_layers[0].name)
    return obj


def _set_uv(obj, loop_uv):
    """loop_uv(face, loop_index_in_face, vertex) -> (u, v), tính theo mét rồi chia UV_TILE."""
    layer = obj.data.uv_layers[0]
    for poly in obj.data.polygons:
        for k, loop_index in enumerate(poly.loop_indices):
            u, v = loop_uv(poly, k, obj.data.vertices[obj.data.loops[loop_index].vertex_index])
            layer.data[loop_index].uv = (u / UV_TILE, v / UV_TILE)


def _cylinder_uv(obj, axis_point, axis_dir, radius, selector=None):
    """UV trụ quanh một trục; góc được nối liền trong từng mặt để không có mặt vắt qua đường nối."""
    axis_dir = Vector(axis_dir).normalized()
    side = axis_dir.orthogonal().normalized()
    other = axis_dir.cross(side)
    layer = obj.data.uv_layers[0]
    for poly in obj.data.polygons:
        if selector is not None and not selector(poly.center):
            continue
        first = None
        for loop_index in poly.loop_indices:
            rel = obj.data.vertices[obj.data.loops[loop_index].vertex_index].co - Vector(axis_point)
            angle = math.atan2(rel.dot(other), rel.dot(side))
            if first is None:
                first = angle
            angle = first + (angle - first + math.pi) % (2 * math.pi) - math.pi
            layer.data[loop_index].uv = (angle * radius / UV_TILE, rel.dot(axis_dir) / UV_TILE)


def _join(target, others):
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=[target] + others,
                                   selected_editable_objects=[target] + others):
        bpy.ops.object.join()
    return target


def _copy_weights(source, tree, source_indices, point, allowed=None):
    """Trọng số xương của đỉnh nguồn gần `point` nhất (chuẩn hoá); allowed giới hạn tên nhóm."""
    _co, index, _dist = tree.find(point)
    vertex = source.data.vertices[int(source_indices[index])]
    out = {}
    for g in vertex.groups:
        name = source.vertex_groups[g.group].name
        if name.startswith(P) and (allowed is None or name in allowed):
            out[name] = g.weight
    total = sum(out.values())
    return {k: v / total for k, v in out.items()} if total > 1e-6 else {BODY_BONES[0]: 1.0}


def _face_weights(obj, face_index, point):
    """Trọng số xương nội suy theo toạ độ trọng tâm trên mặt bị tia chạm (để dải nổi bám đúng mặt vải bên dưới)."""
    polygon = obj.data.polygons[face_index]
    corners = [obj.data.vertices[i] for i in polygon.vertices]
    shares = poly_3d_calc([v.co for v in corners], point)
    out = {}
    for vertex, share in zip(corners, shares):
        for g in vertex.groups:
            name = obj.vertex_groups[g.group].name
            if name.startswith(P):
                out[name] = out.get(name, 0.0) + g.weight * share
    total = sum(out.values())
    return {k: v / total for k, v in out.items()} if total > 1e-6 else {BODY_BONES[0]: 1.0}


class Frame:
    """Các mốc đo trên người (m, hệ Blender: mặt nhìn về -Y, bên trái là +X)."""

    def __init__(self, body, rig):
        head = lambda name: rig.data.bones[P + name].head_local.copy()  # noqa: E731
        self.co = _coords(body)
        self.tights = _members(body, "helper-tights")
        self.skin = _members(body, "body")
        self.waist_z, self.hips_z, self.neck_z = head("Spine").z, head("Hips").z, head("Neck").z
        self.ankle_z = head("LeftFoot").z
        self.hip_joint, self.knee, self.ankle = head("LeftUpLeg"), head("LeftLeg"), head("LeftFoot")
        self.shoulder, self.hand = head("LeftArm"), head("LeftHand")
        self.elbow = head("LeftForeArm")
        neck = head("Neck")
        self.neck_xy = (neck.x, neck.y)
        ring = self.skin & (np.abs(self.co[:, 2] - (neck.z + 0.02)) < 0.012)
        self.neck_radius = float(np.hypot(self.co[ring, 0] - neck.x, self.co[ring, 1] - neck.y).mean()) if ring.any() else 0.055
        self.bust_z = head("Spine2").z + 0.03
        torso = self.tights & (np.abs(self.co[:, 0]) < ARM_MIN_X)
        self.centre_y = float(self.co[torso & (np.abs(self.co[:, 2] - self.hips_z) < 0.05), 1].mean())
        self.torso_indices = np.nonzero(torso)[0]
        self.torso_tree = kdtree.KDTree(len(self.torso_indices))
        for i, index in enumerate(self.torso_indices):
            self.torso_tree.insert(self.co[index], i)
        self.torso_tree.balance()
        self.skin_indices = np.nonzero(self.skin)[0]
        self.skin_tree = kdtree.KDTree(len(self.skin_indices))
        for i, index in enumerate(self.skin_indices):
            self.skin_tree.insert(self.co[index], i)
        self.skin_tree.balance()


def reweight_from_skin(obj, body, frame, smooth_passes=WEIGHT_SMOOTH_PASSES):
    """Thay trọng số xương của obj bằng trọng số da gần nhất (nội suy 3 đỉnh) rồi làm mượt theo lưới: trọng số sẵn có
    của lưới trợ giúp để xương tay ăn sâu vào ngực nên thân áo sụp khi hạ tay; không làm mượt thì vải lồi lõm."""
    bone_groups = [g for g in obj.vertex_groups if g.name.startswith(P)]
    all_indices = list(range(len(obj.data.vertices)))
    for group in bone_groups:
        group.remove(all_indices)
    weights = []
    for vertex in obj.data.vertices:
        mixed = {}
        for _co, index, distance in frame.skin_tree.find_n(vertex.co, 3):
            share = 1.0 / (distance + 1e-4)
            for g in body.data.vertices[int(frame.skin_indices[index])].groups:
                name = body.vertex_groups[g.group].name
                if name.startswith(P):
                    mixed[name] = mixed.get(name, 0.0) + g.weight * share
        total = sum(mixed.values())
        weights.append({name: weight / total for name, weight in mixed.items()})
    neighbours = [[] for _ in all_indices]
    for edge in obj.data.edges:
        neighbours[edge.vertices[0]].append(edge.vertices[1])
        neighbours[edge.vertices[1]].append(edge.vertices[0])
    for _ in range(smooth_passes):
        smoothed = []
        for index, own in enumerate(weights):
            mixed = {name: weight * 0.5 for name, weight in own.items()}
            share = 0.5 / max(len(neighbours[index]), 1)
            for other in neighbours[index]:
                for name, weight in weights[other].items():
                    mixed[name] = mixed.get(name, 0.0) + weight * share
            smoothed.append(mixed)
        weights = smoothed
    for index, mixed in enumerate(weights):
        total = sum(mixed.values())
        for name, weight in mixed.items():
            if weight / total > 0.01:
                obj.vertex_groups[name].add([index], weight / total, "REPLACE")


def keep_sleeves_on_arm(obj, frame):
    """Tay áo chỉ theo xương của chính cánh tay đó: bỏ dần trọng số xương thân/xương khác ở các đỉnh tay áo, kẻo mặt
    trong tay áo bị giữ lại theo sườn khi hạ tay (rách khe, lộ da)."""
    co = _coords(obj)
    a, _distance, _radial, _axis, is_arm = arm_parameter(frame, co)
    blend = _smooth(0.15, 0.32, a) * is_arm
    names = {g.index: g.name for g in obj.vertex_groups}
    for vertex in obj.data.vertices:
        share = float(blend[vertex.index])
        if share <= 0.0:
            continue
        side = "Left" if vertex.co.x >= 0 else "Right"
        allowed = tuple(P + side + part for part in ("Shoulder", "Arm", "ForeArm", "Hand"))
        weights = {names[g.group]: g.weight for g in vertex.groups if names[g.group].startswith(P)}
        for name in weights:
            if name not in allowed:
                weights[name] *= 1.0 - share
        if sum(w for n, w in weights.items() if n in allowed) < 1e-4:
            weights[P + side + "Arm"] = share
        total = sum(weights.values())
        for name, weight in weights.items():
            if weight / total > 0.005:
                obj.vertex_groups[name].add([vertex.index], weight / total, "REPLACE")
            else:
                obj.vertex_groups[name].remove([vertex.index])


def build_trousers(body, frame, style):
    """Quần ống rộng suông: chân của helper-tights nong thành ống tròn bán kính tăng dần tới gấu."""
    radius_top, radius_hem = style["trouser_radius"]
    hem_z = style["trouser_hem"]
    top_z = frame.waist_z + 0.02
    mask = frame.tights & (np.abs(frame.co[:, 0]) < ARM_MIN_X) & (frame.co[:, 2] < top_z) & (frame.co[:, 2] > frame.ankle_z - 0.03)
    trousers = _submesh(body, mask, "bottom")
    co = _coords(trousers)
    low = float(co[:, 2].min())
    stretch = _smooth(frame.knee.z, low, co[:, 2])                      # kéo gấu quần xuống sát đất
    co[:, 2] -= stretch * (low - hem_z)
    crotch_z = frame.hip_joint.z - 0.08
    side = np.where(co[:, 0] >= 0, 1.0, -1.0)
    drop = np.clip((frame.hip_joint.z - co[:, 2]) / (frame.hip_joint.z - frame.ankle_z), 0.0, 1.0)
    axis_x = side * (frame.hip_joint.x + (frame.ankle.x - frame.hip_joint.x) * drop)
    axis_y = frame.hip_joint.y + (frame.ankle.y - frame.hip_joint.y) * drop
    rel = np.stack([co[:, 0] - axis_x, co[:, 1] - axis_y], axis=1)
    radius = np.maximum(np.hypot(rel[:, 0], rel[:, 1]), 1e-5)
    wanted = radius_top + (radius_hem - radius_top) * _smooth(crotch_z, hem_z, co[:, 2])
    blend = _smooth(crotch_z + 0.06, crotch_z - 0.14, co[:, 2])
    new_radius = radius * (1 - blend) + np.maximum(wanted, radius * 1.05) * blend
    new = co.copy()
    new[:, 0] = axis_x + rel[:, 0] / radius * new_radius
    new[:, 1] = axis_y + rel[:, 1] / radius * new_radius
    below = co[:, 2] < crotch_z
    new[below, 0] = side[below] * np.maximum(side[below] * new[below, 0], 0.004)   # hai ống không lấn qua đường giữa
    new[:, 2] = np.where(new[:, 2] < hem_z + HEM_FLATTEN, hem_z + (new[:, 2] - hem_z) * 0.15, new[:, 2])   # gấu quần phẳng
    _move(trousers, new)
    _inflate(trousers, np.where(new[:, 2] > frame.hips_z, -0.003, 0.0))  # lưng quần nằm trong thân áo
    for sign in (1.0, -1.0):
        point = (sign * frame.hip_joint.x, frame.hip_joint.y, 0.0)
        _cylinder_uv(trousers, point, (0, 0, 1), radius_top, selector=lambda c, s=sign: c.x * s >= 0)
    return trousers


def build_shoes(body, frame, heel=0.0):
    """Giày vải bệt: bàn chân của helper-tights, nới nhẹ, đế phẳng."""
    top_z = frame.ankle_z + SHOE_TOP_ABOVE_ANKLE
    mask = frame.tights & (np.abs(frame.co[:, 0]) < ARM_MIN_X) & (frame.co[:, 2] < top_z)
    shoes = _submesh(body, mask, "shoes")
    _inflate(shoes, np.full(len(shoes.data.vertices), SHOE_INFLATE))
    co = _coords(shoes)
    co[:, 2] = np.maximum(co[:, 2], float(co[:, 2].min()) + 0.004) - 0.004
    toe_y, heel_y = float(co[:, 1].min()), float(co[:, 1].max())
    reach = np.clip((toe_y + SHOE_POINT_LENGTH - co[:, 1]) / SHOE_POINT_LENGTH, 0.0, 1.0)   # 1 ở mũi giày
    side = np.where(co[:, 0] >= 0, 1.0, -1.0)
    middle = side * frame.ankle.x * 1.04
    co[:, 0] = middle + (co[:, 0] - middle) * (1.0 - 0.7 * reach ** 1.5)                 # thu mũi lại thành nhọn
    co[:, 1] -= 0.018 * reach ** 2                                                        # và kéo dài mũi ra trước
    co[:, 2] *= 1.0 - 0.35 * reach * (co[:, 2] > 0.012)
    _move(shoes, co)
    if heel > 0:
        raise_heels(shoes, frame, heel)
    _set_uv(shoes, lambda poly, k, vertex: (vertex.co.x, vertex.co.y))
    return shoes


def raise_heels(shoes, frame, heel):
    """Giày cao gót: xoay lưới giày quanh khớp cổ chân cho mũi chúc xuống (gót cao hơn ức bàn chân `heel` mét),
    bẻ phần mũi nằm ngang trở lại và thêm khối gót. Xương Foot/ToeBase KHÔNG đổi tư thế nghỉ; cả người được nâng lên
    sau đó bởi bước đặt chân chạm đất (phần mũi giày là điểm thấp nhất)."""
    co = _coords(shoes)
    toe_y, heel_y = float(co[:, 1].min()), float(co[:, 1].max())
    ball_y = toe_y + 0.32 * (heel_y - toe_y)
    angle = math.asin(min(heel / (heel_y - ball_y), 0.7))
    cos_a, sin_a = math.cos(angle), math.sin(angle)

    def turn(points, pivot_y, pivot_z, cos_t, sin_t):
        y, z = points[:, 1] - pivot_y, points[:, 2] - pivot_z
        points[:, 1], points[:, 2] = pivot_y + y * cos_t - z * sin_t, pivot_z + y * sin_t + z * cos_t

    original_y = co[:, 1].copy()
    turn(co, frame.ankle.y, frame.ankle.z, cos_a, sin_a)
    ball = np.array([[0.0, ball_y, 0.0]])
    turn(ball, frame.ankle.y, frame.ankle.z, cos_a, sin_a)
    flat = _smooth(ball_y + 0.02, ball_y - 0.02, original_y)             # 1 ở phần mũi (trước ức bàn chân)
    toes = co.copy()
    turn(toes, ball[0, 1], ball[0, 2], cos_a, -sin_a)
    co = co * (1 - flat[:, None]) + toes * flat[:, None]
    _move(shoes, co)
    ground = float(co[:, 2].min())
    bm = bmesh.new()
    bm.from_mesh(shoes.data)
    deform = bm.verts.layers.deform.verify()
    bm.verts.ensure_lookup_table()
    for sign in (1.0, -1.0):                                              # khối gót thon dần xuống đất
        side = [v for v in bm.verts if v.co.x * sign > 0]
        rear = max(side, key=lambda v: v.co.y)
        under = min((v for v in side if v.co.y > rear.co.y - 0.035), key=lambda v: v.co.z)
        centre_x, top_y, top_z = sign * frame.ankle.x * 1.02, rear.co.y - 0.022, under.co.z + 0.004
        rings = []
        for half, z in ((0.02, top_z), (0.011, ground)):
            rings.append([bm.verts.new((centre_x + dx * half, top_y + dy * half, z)) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        for vert in rings[0] + rings[1]:
            for group, weight in rear[deform].items():
                vert[deform][group] = weight
        for i in range(4):
            bm.faces.new((rings[0][i], rings[0][(i + 1) % 4], rings[1][(i + 1) % 4], rings[1][i]))
        bm.faces.new(rings[1][::-1])
    bm.normal_update()
    bm.to_mesh(shoes.data)
    bm.free()


def waist_ease(frame, z, amount):
    """Độ nới thêm (m) theo chiều cao để thân áo rơi thẳng từ ngực xuống hông thay vì ôm eo.
    amount âm nghĩa là kiểu "rơi thẳng": nới |amount| đều từ dưới ngực trở xuống (áo suông)."""
    z = np.asarray(z, dtype=np.float64)
    if amount < 0:
        return -amount * (1.0 - _smooth(frame.bust_z - 0.03, frame.bust_z + 0.05, z))
    return amount * _smooth(frame.hips_z - 0.12, frame.waist_z, z) * (1.0 - _smooth(frame.waist_z + 0.06, frame.bust_z + 0.02, z))


def arm_parameter(frame, co):
    """(a, khoảng cách tới trục tay, vector từ trục tới điểm, hướng trục, là đỉnh tay) với a = 0 ở vai, 1 ở cổ tay.
    Trục tay là đường gấp khúc vai -> khuỷu -> cổ tay (tay ở tư thế nghỉ hơi gập khuỷu; dùng đường thẳng vai -> cổ tay
    thì mặt sau bắp tay nằm xa trục quá ngưỡng, bị coi là thân và không được cắt/gán trọng số như tay áo)."""
    co = np.asarray(co, dtype=np.float64)
    side = np.where(co[:, 0] >= 0, 1.0, -1.0)

    def joint(v):
        return np.stack([side * v.x, np.full(len(co), v.y), np.full(len(co), v.z)], axis=1)

    shoulder, elbow, hand = joint(frame.shoulder), joint(frame.elbow), joint(frame.hand)
    upper, lower = float(np.linalg.norm(elbow[0] - shoulder[0])), float(np.linalg.norm(hand[0] - elbow[0]))

    def segment(start, finish, length):
        direction = (finish - start) / length
        along = ((co - start) * direction).sum(axis=1)
        nearest = start + direction * np.clip(along, 0.0, length)[:, None]
        return along, co - nearest, direction

    along1, radial1, axis1 = segment(shoulder, elbow, upper)
    along2, radial2, axis2 = segment(elbow, hand, lower)
    second = np.linalg.norm(radial2, axis=1) < np.linalg.norm(radial1, axis=1)
    a = np.where(second, upper + np.maximum(along2, 0.0), np.minimum(along1, upper)) / (upper + lower)
    radial = np.where(second[:, None], radial2, radial1)
    axis = np.where(second[:, None], axis2, axis1)
    distance = np.linalg.norm(radial, axis=1)
    return a, distance, radial, axis, (distance < 0.09) & (a > 0.08)


TUBE_BINS = 48


def _band_profile(frame, low, high):
    """Bán kính bao ngoài của thân theo từng hướng quanh trục dọc (0 = chính diện) trong dải độ cao [low, high]."""
    co = frame.co
    torso = frame.tights & (np.abs(co[:, 0]) < ARM_MIN_X) & (co[:, 2] > low) & (co[:, 2] < high)
    _a, _d, _r, _ax, is_arm = arm_parameter(frame, co)
    torso &= ~is_arm
    angle = np.arctan2(co[torso, 0], -(co[torso, 1] - frame.centre_y))
    radius = np.hypot(co[torso, 0], co[torso, 1] - frame.centre_y)
    bins = ((angle + np.pi) / (2 * np.pi) * TUBE_BINS).astype(int) % TUBE_BINS
    profile = np.zeros(TUBE_BINS)
    np.maximum.at(profile, bins, radius)
    profile[profile == 0] = profile[profile > 0].mean()
    for _ in range(8):   # làm tròn đường bao (xoá rãnh giữa ngực)
        profile = 0.5 * profile + 0.25 * (np.roll(profile, 1) + np.roll(profile, -1))
    return profile


def tube_profile(frame):
    """(đường bao ngang ngực, đường bao ngang hông): thân áo suông đi thẳng từ đường này xuống đường kia, không ôm eo."""
    return (_band_profile(frame, frame.bust_z - 0.05, frame.bust_z + 0.03),
            _band_profile(frame, frame.hips_z - 0.07, frame.hips_z + 0.04))


def _lookup(profile, x, y_rel):
    angle = np.arctan2(x, -y_rel)
    position = (angle + np.pi) / (2 * np.pi) * TUBE_BINS - 0.5
    low = np.floor(position).astype(int)
    f = position - low
    return profile[low % TUBE_BINS] * (1 - f) + profile[(low + 1) % TUBE_BINS] * f


def tube_radius(frame, profile, x, y_rel, z):
    down = np.clip((frame.bust_z - np.asarray(z, dtype=np.float64)) / (frame.bust_z - frame.hips_z), 0.0, 1.0)
    return _lookup(profile[0], x, y_rel) * (1 - down) + _lookup(profile[1], x, y_rel) * down


def is_arm_vertex(frame, co):
    return bool(arm_parameter(frame, np.array([co[:]]))[4][0])


GEOMETRIC_COLLAR = False               # True: thân áo cắt ở đúng đường chân cổ, cổ đứng do people_collar.build_stand dựng riêng


def build_bodice(body, frame, style):
    """Thân áo, tay dài (ôm hoặc loe), cổ đứng có khe chữ V nhỏ phía trước."""
    co = frame.co
    collar_top = frame.neck_z + (0.004 if GEOMETRIC_COLLAR else COLLAR_HEIGHT)
    overlap = style.get("waist_overlap", WAIST_OVERLAP)
    mask = frame.tights & (co[:, 2] < collar_top) & ((co[:, 2] > frame.waist_z - overlap) | (np.abs(co[:, 0]) > ARM_MIN_X))
    a, _distance, _radial, _axis, is_arm = arm_parameter(frame, co)
    mask &= ~(is_arm & (a > style["sleeve_end"]))
    bodice = _submesh(body, mask, "top")
    bm = bmesh.new()
    bm.from_mesh(bodice.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=1.0)   # vòng cổ, vai tròn đều hơn
    notch = [f for f in bm.faces if not GEOMETRIC_COLLAR and f.calc_center_median().y < frame.centre_y - 0.02
             and f.calc_center_median().z > collar_top - 0.03
             and abs(f.calc_center_median().x) < 0.002 + 0.37 * (f.calc_center_median().z - (collar_top - 0.03))]
    bmesh.ops.delete(bm, geom=notch, context="FACES")
    notch_bottom = collar_top - 0.03
    for vert in bm.verts:
        if GEOMETRIC_COLLAR or not any(len(e.link_faces) < 2 for e in vert.link_edges) or vert.co.z < notch_bottom - 0.006 or abs(vert.co.x) > ARM_MIN_X:
            continue
        front = vert.co.y < frame.centre_y - 0.02 and abs(vert.co.x) < 0.03
        if front and vert.co.z < collar_top - 0.004:            # đỉnh trên mép khe: đưa về đường chữ V
            vert.co.x = math.copysign(0.011 * max(vert.co.z - notch_bottom, 0.0) / 0.03, vert.co.x) if abs(vert.co.x) > 1e-4 else 0.0
    if style.get("cuff_rim"):                                    # viền gấu tay: lật mép gấu ra ngoài thành gờ mảnh
        a_now, _d, radial_now, _ax, arm_now = arm_parameter(frame, np.array([v.co[:] for v in bm.verts]))
        rim = [e for e in bm.edges if len(e.link_faces) < 2 and all(arm_now[v.index] and a_now[v.index] > style["sleeve_end"] - 0.12 for v in e.verts)]
        if rim:
            grown = bmesh.ops.extrude_edge_only(bm, edges=rim)
            for vert in (g for g in grown["geom"] if isinstance(g, bmesh.types.BMVert)):
                side = 1.0 if vert.co.x >= 0 else -1.0
                axis = Vector((side * (frame.hand.x - frame.shoulder.x), frame.hand.y - frame.shoulder.y, frame.hand.z - frame.shoulder.z)).normalized()
                rel = vert.co - Vector((side * frame.shoulder.x, frame.shoulder.y, frame.shoulder.z))
                outward = (rel - axis * rel.dot(axis)).normalized()
                vert.co += outward * 0.012 - axis * 0.004
    bm.to_mesh(bodice.data)
    bm.free()
    reweight_from_skin(bodice, body, frame, smooth_passes=style.get("smooth_passes", WEIGHT_SMOOTH_PASSES))
    keep_sleeves_on_arm(bodice, frame)

    now = _coords(bodice)
    a, _distance, radial, _axis, is_arm = arm_parameter(frame, now)
    bell = 1.0 + (style["bell"] - 1.0) * _smooth(SLEEVE_BELL_START, style["sleeve_end"], a)
    now[is_arm] += radial[is_arm] * (bell[is_arm] - 1.0)[:, None]
    torso = ~is_arm & (np.abs(now[:, 0]) < ARM_MIN_X)
    if style.get("tube"):
        profile = tube_profile(frame)
        rel_y = now[:, 1] - frame.centre_y
        radius = np.maximum(np.hypot(now[:, 0], rel_y), 1e-5)
        wanted = tube_radius(frame, profile, now[:, 0], rel_y, now[:, 2]) + style["tube"]
        drop = 1.0 - _smooth(frame.bust_z + 0.03, frame.bust_z + 0.10, now[:, 2])      # 1 từ trên ngực trở xuống: mặt trước phẳng
        grow = np.maximum(wanted - radius, 0.0) * drop * torso
        now[:, 0] += now[:, 0] / radius * grow
        now[:, 1] += rel_y / radius * grow
    ease = waist_ease(frame, now[:, 2], style["ease"]) * torso
    ease *= 1.0 - BACK_EASE_CUT * _smooth(frame.centre_y, frame.centre_y + 0.06, now[:, 1])   # lưng nới ít hơn để tóc dài không chìm vào áo
    outward = np.stack([now[:, 0], now[:, 1] - frame.centre_y], axis=1)
    outward /= np.maximum(np.linalg.norm(outward, axis=1), 1e-5)[:, None]
    now[:, 0] += outward[:, 0] * ease
    now[:, 1] += outward[:, 1] * ease
    _move(bodice, now)
    fit = BODICE_INFLATE + abs(style["ease"]) * 0.25
    hem_taper = 0.0015 * (1.0 - _smooth(frame.waist_z - overlap, frame.waist_z, now[:, 2])) * torso   # mép dưới áp sát tà
    _inflate(bodice, fit - hem_taper + COLLAR_STANDOFF * _smooth(frame.neck_z - 0.005, frame.neck_z + 0.01, now[:, 2]) * torso)
    shoulder_x = frame.shoulder.x
    _cylinder_uv(bodice, (0, frame.centre_y, 0), (0, 0, 1), 0.15, selector=lambda c: abs(c.x) <= shoulder_x)
    for sign in (1.0, -1.0):
        start = Vector((sign * frame.shoulder.x, frame.shoulder.y, frame.shoulder.z))
        end = Vector((sign * frame.hand.x, frame.hand.y, frame.hand.z))
        _cylinder_uv(bodice, start, end - start, 0.045, selector=lambda c, s=sign: c.x * s > shoulder_x)
    return bodice


def _surface_path(bvh, start_xz, end_xz, steps):
    """Các điểm (vị trí, pháp tuyến) trên mặt trước thân áo dọc đoạn thẳng trong mặt phẳng XZ."""
    points = []
    for i in range(steps + 1):
        f = i / steps
        x = start_xz[0] + (end_xz[0] - start_xz[0]) * f
        z = start_xz[1] + (end_xz[1] - start_xz[1]) * f
        hit, normal, index, _dist = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)))
        if hit is not None:
            points.append((hit, normal, index))
    return points


def build_ridges(bodice, frame, style):
    """Các đường nổi trên mặt trước thân áo: hai đường ráp raglan (cổ -> nách), hai đường chiết ngực -> eo (áo ôm),
    khuy tết cài ngang ở chân cổ (áo cách tân)."""
    bvh = _bvh(bodice)
    armpit_z = frame.shoulder.z - 0.085
    paths = []   # (điểm đầu xz, điểm cuối xz, số khuy)
    for sign in (-1.0, 1.0):
        paths.append(((sign * (0.05 if GEOMETRIC_COLLAR else 0.014), frame.neck_z + (-0.02 if GEOMETRIC_COLLAR else 0.004)), (sign * frame.shoulder.x * 0.9, armpit_z), 0))
        if style["darts"]:
            paths.append(((sign * 0.075, frame.bust_z - 0.03), (sign * 0.062, frame.waist_z - 0.01), 0))
    if style["collar_knot"] and not GEOMETRIC_COLLAR:
        paths.append(((-0.022, frame.neck_z + 0.006), (0.022, frame.neck_z + 0.006), 1))
    verts, faces, weights, uvs = [], [], [], []
    for start_xz, end_xz, buttons in paths:
        path = _surface_path(bvh, start_xz, end_xz, 14)
        if len(path) < 3:
            continue
        base = len(verts)
        for k, (hit, normal, face) in enumerate(path):
            tangent = (path[min(k + 1, len(path) - 1)][0] - path[max(k - 1, 0)][0]).normalized()
            across = normal.cross(tangent).normalized()
            for offset in (-RIDGE_HALF_WIDTH, 0.0, RIDGE_HALF_WIDTH):
                lift = RIDGE_LIFT if offset == 0.0 else 0.0005
                verts.append(hit + across * offset + normal * lift)
                weights.append(_face_weights(bodice, face, hit))
                uvs.append((hit.x, hit.z))
        for k in range(len(path) - 1):
            for j in range(2):
                a = base + k * 3 + j
                faces.append((a, a + 1, a + 4, a + 3))
        for _b in range(buttons):
            hit, normal, face = path[len(path) // 2]
            tangent = (path[2][0] - path[0][0]).normalized()
            across = normal.cross(tangent).normalized()
            start = len(verts)
            ring = [hit + (tangent * math.cos(t) + across * math.sin(t)) * BUTTON_RADIUS + normal * RIDGE_LIFT
                    for t in (i * math.pi / 3 for i in range(6))]
            for point in ring + [hit + normal * (RIDGE_LIFT + BUTTON_HEIGHT)]:
                verts.append(point)
                weights.append(_face_weights(bodice, face, hit))
                uvs.append((point.x, point.z))
            faces.extend((start + i, start + (i + 1) % 6, start + 6) for i in range(6))
    ridges = _new_object("ridges", bodice, verts, faces, weights)
    _set_uv(ridges, lambda poly, k, vertex: uvs[vertex.index])
    return ridges


def _hull_point(bvh, frame, z, angle, front):
    """Điểm ngoài cùng của thân ở độ cao z theo hướng lệch `angle` so với chính diện (trước hoặc sau)."""
    direction = Vector((math.sin(angle), -math.cos(angle) if front else math.cos(angle), 0.0))
    origin = Vector((0.0, frame.centre_y, z)) + direction * 1.5
    hit, _normal, _index, _dist = bvh.ray_cast(origin, -direction)
    return hit


def _panel_weights(frame, body, point, t, bones):
    blend = float(_smooth(PANEL_BODY_BLEND[0], PANEL_BODY_BLEND[1], t))
    weights = {k: v * (1 - blend) for k, v in _copy_weights(body, frame.torso_tree, frame.torso_indices, point, BODY_BONES).items()}
    position = min(max(t * PANEL_BONES - 0.5, 0.0), PANEL_BONES - 1.0)   # tâm đốt k nằm ở (k + 0,5) / số đốt
    low = int(math.floor(position))
    high = min(low + 1, PANEL_BONES - 1)
    weights[bones[low]] = weights.get(bones[low], 0.0) + blend * (1 - (position - low))
    if high != low:
        weights[bones[high]] = weights.get(bones[high], 0.0) + blend * (position - low)
    return weights


def build_panel(body, frame, trousers, front, like, style):
    """Một tà áo: lưới ô từ eo tới gấu, ôm thân tới hông rồi rủ, xoè dần và có nếp dọc. Trả về (đối tượng, cột giữa)."""
    shell = _bvh(_shell(body, frame))
    trouser_co = _coords(trousers)
    hem_z = style["hem_height"]
    hip_half_width = float(np.abs(trouser_co[np.abs(trouser_co[:, 2] - frame.hips_z) < 0.04, 0]).max())
    bones = FRONT_BONES if front else BACK_BONES
    sign = -1.0 if front else 1.0
    verts, weights, last_hull = [], [], {}
    profile = tube_profile(frame) if style.get("tube") else None
    for row in range(PANEL_ROWS + 1):
        t = row / PANEL_ROWS
        z = frame.waist_z + (hem_z - frame.waist_z) * t
        flat = float(_smooth(frame.hips_z + 0.02, frame.hips_z - 0.18, z))
        hang = float(_smooth(frame.hips_z, hem_z, z))                 # 0 ở hông, 1 ở gấu
        near = trouser_co[trouser_co[:, 2] > z - 0.04]   # mọi phần quần từ đây trở lên: tà rủ thẳng từ chỗ nhô nhất
        reach = (near[:, 1].min() if front else near[:, 1].max()) if len(near) else frame.centre_y
        sheet_y = reach + sign * (PANEL_CLEARANCE + style["fold_depth"] * hang)
        ease = float(waist_ease(frame, z, style["ease"])) * (1.0 if front else 1.0 - BACK_EASE_CUT) + BODICE_INFLATE + 0.001 + abs(style["ease"]) * 0.25
        for column in range(PANEL_COLUMNS + 1):
            s = column / PANEL_COLUMNS * 2 - 1
            hull = _hull_point(shell, frame, z, s * PANEL_HALF_ANGLE, front) if flat < 1.0 else None
            hull = last_hull.get(column) if hull is None else hull + (hull - Vector((0, frame.centre_y, z))).normalized() * ease
            if hull is not None and profile is not None:      # tà nối liền với thân ống: không hẹp hơn đường bao của thân
                outward = Vector((hull.x, hull.y - frame.centre_y, 0.0))
                wanted = float(tube_radius(frame, profile, np.array([hull.x]), np.array([hull.y - frame.centre_y]), np.array([z]))[0]) + style["tube"] + BODICE_INFLATE + 0.001
                if outward.length < wanted:
                    hull = Vector((0.0, frame.centre_y, hull.z)) + outward.normalized() * wanted
            last_hull[column] = hull
            width = hip_half_width * (1.0 + style["flare"] * hang)
            fold = style["fold_depth"] * hang * math.sin(math.pi * PANEL_FOLDS * (s + 1.0) + (0.0 if front else 1.3))
            curl = style["edge_curl"] * hang * s * s                    # mép tà cong về phía tà bên kia để chồng mép
            sheet = Vector((s * width, sheet_y + sign * fold - sign * curl, z + 0.5 * style["fold_depth"] * hang * math.cos(math.pi * PANEL_FOLDS * (s + 1.0))))
            point = sheet if hull is None else Vector((hull.x, hull.y, z)).lerp(sheet, flat)
            verts.append(point)
            weights.append(_panel_weights(frame, body, point, t, bones))
    stride = PANEL_COLUMNS + 1
    faces = []
    for row in range(PANEL_ROWS):
        for column in range(PANEL_COLUMNS):
            a = row * stride + column
            quad = (a, a + 1, a + stride + 1, a + stride)
            faces.append(quad if front else quad[::-1])
    panel = _new_object("panel_front" if front else "panel_back", like, verts, faces, weights)
    _set_uv(panel, lambda poly, k, vertex: (vertex.co.x, vertex.co.z))
    centre = [verts[row * stride + PANEL_COLUMNS // 2].copy() for row in range(PANEL_ROWS + 1)]
    return panel, centre


_SHELL_CACHE = {}


def _shell(body, frame):
    """Vỏ thân (helper-tights không kể tay) để dò đường bao; dựng một lần cho mỗi nhân vật."""
    if body.name not in _SHELL_CACHE:
        mask = frame.tights & (np.abs(frame.co[:, 0]) < ARM_MIN_X)
        shell = _submesh(body, mask, "aodai_shell")
        shell.modifiers.clear()
        _SHELL_CACHE.clear()
        _SHELL_CACHE[body.name] = shell
    return _SHELL_CACHE[body.name]


def add_panel_bones(rig, centres):
    """Thêm hai chuỗi xương tà (con của xương hông). centres: {danh sách tên xương: toạ độ cột giữa theo hàng}."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for names, centre in centres:
        joints = [centre[round(i * PANEL_ROWS / PANEL_BONES)] for i in range(PANEL_BONES + 1)]
        parent = rig.data.edit_bones[P + "Hips"]
        for i, name in enumerate(names):
            bone = rig.data.edit_bones.new(name)
            bone.head, bone.tail = joints[i], joints[i + 1]
            bone.parent, bone.use_connect, bone.use_deform = parent, i > 0, True
            bone.align_roll(Vector((1.0, 0.0, 0.0)))   # trục Z của xương nằm ngang -> quay quanh Z là hất tà ra trước/sau
            parent = bone
    bpy.ops.object.mode_set(mode="OBJECT")


def covered_skin(frame, bodice, sleeve_skin_from=2.0):
    """Da bị bộ áo dài che: toàn bộ phần dưới eo (quần + giày) và phần nằm trong thân áo (trừ sát mép cổ, cổ tay)."""
    bm = bmesh.new()
    bm.from_mesh(bodice.data)
    edge = {v.index for e in bm.edges if len(e.link_faces) < 2 for v in e.verts}
    for _ in range(BOUNDARY_RINGS - 1):
        edge |= {o.index for v in bm.verts if v.index in edge for e in v.link_edges for o in e.verts}
    interior = [v.co.copy() for v in bm.verts if v.index not in edge]
    bm.free()
    tree = kdtree.KDTree(len(interior))
    for i, co in enumerate(interior):
        tree.insert(co, i)
    tree.balance()
    co = frame.co
    covered = frame.skin & (co[:, 2] < frame.waist_z + 0.05) & (np.abs(co[:, 0]) < ARM_MIN_X)
    neck_limit = frame.neck_z + COLLAR_HEIGHT - COLLAR_SKIN_KEPT   # giữ da cổ trong phần trên của cổ áo, kẻo hở khi quay đầu
    for i in np.nonzero(frame.skin & ~covered & (co[:, 2] < neck_limit))[0]:
        covered[i] = tree.find(co[i])[2] < COVER_DISTANCE
    a, _distance, _radial, _axis, is_arm = arm_parameter(frame, co)
    covered &= ~(is_arm & (a > sleeve_skin_from))   # da tay từ chỗ tay áo bắt đầu loe trở xuống được giữ lại
    return covered


def build(body, rig, style_name):
    """Trả về {"top", "bottom", "shoes"} (đối tượng lưới), "covered" (mặt nạ đỉnh thân bị che) và "fabric"."""
    global UV_TILE
    style = STYLES[style_name]
    UV_TILE = style.get("uv_tile", 0.25)   # ô kết cấu nhỏ hơn thì hoa văn nhỏ hơn
    frame = Frame(body, rig)
    trousers = build_trousers(body, frame, style)
    shoes = build_shoes(body, frame, style.get("heel", 0.0))
    bodice = build_bodice(body, frame, style)
    covered = covered_skin(frame, bodice, style["sleeve_end"] - 0.07 if style["bell"] > 1.0 else 2.0)   # da tay chỉ còn sát miệng tay áo: không chọc qua ống tay
    ridges = build_ridges(bodice, frame, style)
    front, front_centre = build_panel(body, frame, trousers, True, bodice, style)
    back, back_centre = build_panel(body, frame, trousers, False, bodice, style)
    add_panel_bones(rig, ((FRONT_BONES, front_centre), (BACK_BONES, back_centre)))
    top = _join(bodice, [ridges, front, back])
    for obj in (top, trousers, shoes):
        for name in FRONT_BONES + BACK_BONES:
            if name not in obj.vertex_groups:
                obj.vertex_groups.new(name=name)
    bpy.data.objects.remove(_SHELL_CACHE.pop(body.name), do_unlink=True)
    return {"top": top, "bottom": trousers, "shoes": shoes, "covered": covered, "fabric": style["fabric"]}
