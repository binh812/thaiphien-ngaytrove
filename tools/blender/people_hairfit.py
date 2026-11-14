"""Cho tóc nằm NGOÀI áo, cổ áo và thân: đẩy các đỉnh tóc ra khỏi bề mặt và chỉnh trọng số xương của tóc.

fit(): chỉ xét các đỉnh tóc dưới mép trên cổ áo (khớp cổ + ACTIVE_ABOVE_NECK); phần tóc trên đầu để nguyên (các lớp tóc
lót nằm trong hộp sọ / trong cổ không bị lôi ra ngoài). Mỗi đỉnh được đẩy theo phương trước - sau (đỉnh ở nửa sau thân
đẩy ra sau, nửa trước đẩy ra trước) tới khi nằm ngoài lớp ngoài cùng của thân / áo / lá cổ trên đường thẳng đó một
khoảng CLEARANCE; tay và tay áo không tính là vật cản (kẻo tóc bị đẩy vòng ra ngoài cánh tay). Độ dời được lan sang
các đỉnh kề để mái tóc cong đều, rồi cộng vào mọi shape key (morph khuôn mặt vẫn khớp).

settle_weights(): tóc không theo xương tay; phần tóc dưới khớp cổ bớt dần trọng số Head (chuyển sang Neck rồi Spine2)
để khi runtime xoay riêng xương Head thì phần tóc nằm trên vai/lưng không quét qua áo; làm mượt theo lưới.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import people_aodai as cut
import people_hair as hair_style

CLEARANCE = 0.007
DRAPE_STEPS = (0.0, 0.0125, 0.025, 0.0375, 0.05)   # m: các độ cao phía trên đỉnh tóc được xét
DRAPE_SIDE, DRAPE_SLOPE = (-0.02, -0.01, 0.0, 0.01, 0.02), 0.35
ACTIVE_ABOVE_NECK = 0.03             # m: chỉ dời các đỉnh tóc thấp hơn khớp cổ + mức này
OBSTACLE_ABOVE_NECK = 0.045          # m: vật cản chỉ tính tới độ cao này (bỏ cằm, hàm)
MAX_SHIFT = (0.07, 0.03)             # m: dời tối đa ra sau / ra trước
SPREAD_PASSES = 6
HEAD_BAND = (-0.03, 0.02)            # m quanh khớp CỔ: dưới mức thấp không còn trọng số Head; tóc ngắn/bob trên mức cao giữ nguyên theo Head
SPINE_BONES = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head")


def _neighbours(obj):
    out = [[] for _ in obj.data.vertices]
    for edge in obj.data.edges:
        out[edge.vertices[0]].append(edge.vertices[1])
        out[edge.vertices[1]].append(edge.vertices[0])
    return out


def _torso_tree(obj, rig):
    """BVH của lưới, bỏ các mặt thuộc cánh tay buông (trọng số xương tay lớn, thấp hơn khớp vai) và các mặt trên cổ."""
    names = {g.index: g.name for g in obj.vertex_groups}
    arm = np.array([sum(g.weight for g in v.groups if any(part in names[g.group] for part in ("Arm", "Hand"))) for v in obj.data.vertices])
    co = cut._coords(obj)
    arm_z = rig.data.bones[cut.P + "LeftArm"].head_local.z
    top_z = rig.data.bones[cut.P + "Neck"].head_local.z + OBSTACLE_ABOVE_NECK
    polygons = []
    for polygon in obj.data.polygons:
        indices = list(polygon.vertices)
        if co[indices, 2].min() > top_z or (arm[indices].mean() > 0.8 and co[indices, 2].mean() < arm_z - 0.03):
            continue
        polygons.append(tuple(indices))
    return BVHTree.FromPolygons([tuple(c) for c in co], polygons)


def fit(hair, obstacles, rig):
    """Trả về số đỉnh đã dời."""
    trees = [_torso_tree(obj, rig) for obj in obstacles]
    joints = [rig.data.bones[cut.P + name].head_local for name in SPINE_BONES]
    heights, depths = [j.z for j in joints], [j.y for j in joints]
    neck_z = joints[4].z
    neighbours = _neighbours(hair)
    moved = [0]

    def shift(co):
        side = np.where(co[:, 1] >= np.interp(co[:, 2], heights, depths), 1.0, -1.0)       # +1: nửa sau thân
        need = np.zeros(len(co))
        for i in np.nonzero(co[:, 2] < neck_z + ACTIVE_ABOVE_NECK)[0]:
            point = Vector(co[i])
            direction = Vector((0.0, -side[i], 0.0))
            surface = None
            # Tóc rủ như tấm rèm: xét cả các điểm cao hơn (tới DRAPE_HEIGHT) và lệch ngang một chút, để tóc đi vòng ra
            # ngoài mép lá cổ rồi buông thẳng xuống chứ không chui lại vào dưới mép.
            for rise in DRAPE_STEPS:
                if point.z + rise > neck_z + OBSTACLE_ABOVE_NECK:
                    break
                for dx in DRAPE_SIDE:
                    origin = Vector((point.x + dx, point.y, point.z + rise)) - direction * 0.25
                    for tree in trees:
                        hit, _normal, _index, _distance = tree.ray_cast(origin, direction, 0.5)
                        if hit is not None:
                            reach = hit.y - side[i] * DRAPE_SLOPE * rise
                            if surface is None or (reach - surface) * side[i] > 0:
                                surface = reach
            if surface is None:
                continue
            wanted = (surface - point.y) * side[i] + CLEARANCE
            limit = MAX_SHIFT[0] if side[i] > 0 else MAX_SHIFT[1]
            if 0.0 < wanted <= limit:
                need[i] = wanted
        spread = need.copy()
        for _ in range(SPREAD_PASSES):                         # lan sang đỉnh kề cùng phía cho mái tóc cong đều
            mean = np.array([spread[near][side[near] == side[i]].mean() if len(near) and (side[near] == side[i]).any() else spread[i]
                             for i, near in enumerate(neighbours)])
            spread = np.maximum(need, 0.5 * spread + 0.5 * mean)
        moved[0] = int((spread > 1e-4).sum())
        delta = np.zeros_like(co)
        delta[:, 1] = spread * side
        return delta

    hair_style._deform(hair, shift)
    return moved[0]


def settle_weights(hair, rig, smooth_passes=3):
    head_z, neck_z = rig.data.bones[cut.P + "Head"].head_local.z, rig.data.bones[cut.P + "Neck"].head_local.z
    head, neck, spine = cut.P + "Head", cut.P + "Neck", cut.P + "Spine2"
    names = {g.index: g.name for g in hair.vertex_groups}
    weights = []
    for vertex in hair.data.vertices:
        own = {names[g.group]: g.weight for g in vertex.groups if names[g.group].startswith(cut.P) and g.weight > 0.0}
        for name in list(own):
            if any(part in name for part in ("Arm", "Hand")):                 # tóc không theo tay
                own[spine] = own.get(spine, 0.0) + own.pop(name)
            elif "Shoulder" in name:
                own[spine] = own.get(spine, 0.0) + 0.5 * own[name]
                own[name] *= 0.5
        cap = float(cut._smooth(neck_z + HEAD_BAND[0], neck_z + HEAD_BAND[1], vertex.co.z))
        if own.get(head, 0.0) > cap:
            target = neck if vertex.co.z > neck_z - 0.02 else spine
            own[target] = own.get(target, 0.0) + own[head] - cap
            own[head] = cap
        total = sum(own.values())
        weights.append({name: weight / total for name, weight in own.items()} if total > 1e-6 else {head: 1.0})
    neighbours = _neighbours(hair)
    for _ in range(smooth_passes):
        smoothed = []
        for index, own in enumerate(weights):
            near = neighbours[index]
            mixed = {name: weight * (0.5 if near else 1.0) for name, weight in own.items()}
            for other in near:
                for name, weight in weights[other].items():
                    mixed[name] = mixed.get(name, 0.0) + weight * 0.5 / len(near)
            smoothed.append(mixed)
        weights = smoothed
    for group in hair.vertex_groups:
        if group.name.startswith(cut.P):
            group.remove(list(range(len(hair.data.vertices))))
    for index, own in enumerate(weights):
        total = sum(own.values())
        for name, weight in own.items():
            if weight / total > 0.01:
                (hair.vertex_groups.get(name) or hair.vertex_groups.new(name=name)).add([index], weight / total, "REPLACE")
