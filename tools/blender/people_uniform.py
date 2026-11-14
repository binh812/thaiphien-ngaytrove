"""Áo đồng phục hè (sơ mi trắng tay lỡ, cổ bẻ to có viền xanh than, nơ ruy băng cho nữ, phù hiệu ngực trái),
dựng theo thủ tục trên lưới trợ giúp "helper-tights" của lưới gốc MakeHuman, giống cách dựng áo dài.

Toàn bộ thuộc một lưới `top` với một kết cấu atlas (xem people_textures.UNIFORM_ATLAS): thân áo dùng vùng trắng,
lá cổ dùng vùng có dải viền, tay áo dùng vùng có đường viền gấu, nơ dùng vùng xanh than, phù hiệu dùng vùng phù hiệu.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import people_aodai as cut
import people_collar as collar
import people_textures as tex

HEM_BELOW_HIPS = 0.07                 # m: vạt áo dài qua hông
SLEEVE_END = 0.46                     # theo chiều dài tay (0 = vai, 1 = cổ tay): gấu tay ngay trên khuỷu
SLEEVE_FLARE = (1.1, 1.6)            # tay rộng: hệ số bán kính ở vai và ở gấu tay
BODY_INFLATE, BOXY_EASE = 0.007, 0.004
V_DEPTH, V_HALF_WIDTH = 0.075, 0.034  # m: khe cổ chữ V nông
COLLAR = {}                           # thông số cổ áo (people_collar), lấy theo kiểu cắt
PLACKET_HALF_WIDTH, BUTTONS, PLACKET_LENGTH = 0.015, 5, None      # PLACKET_LENGTH: m, None = chạy tới gấu
BADGE_SIZE, BADGE_CENTRE_X, BADGE_TILT = (0.078, 0.0305), 0.08, math.radians(4)
HEM_FLATTEN = 0.04                    # m: dải vạt áo và gấu tay được ép cho mép thẳng
BOW_LIFT = 0.012

BADGE_DROP = 0.075
SLEEVE_KEY = "sleeve"
EDGE_FOLD, HEM_HIPS_SHARE, SIDE_SLIT = 0.0035, 0.75, None
SLEEVE_TUBE = None                    # (bán kính ống tay ở nách, ở cổ tay) cho tay dài: ống thon đều, không phồng theo cẳng tay
FOLD_HEMS = True                      # gập mép gấu vào trong; polo tắt (mặt gập có pháp tuyến lệch -> viền sáng/tối ở gấu tay)
STIFF_CUFF = True                     # gấu tay cộc chỉ theo xương cánh tay trên; tay dài thì tắt
POCKET_SIZE, POCKET_DROP = (0.10, 0.11), 0.085
# Kiểu cắt theo giới: nữ (cổ bẻ to + nơ, tay lỡ rộng) và nam (cổ sơ mi thường, tay cộc tới giữa bắp tay, có túi ngực).
CUTS = {
    # Nữ: lá cổ to bản, nhọn, mũi cổ tới gần ngang nách, có dải viền xanh than song song mép; chân cổ thấp.
    "girl": dict(SLEEVE_END=0.46, SLEEVE_FLARE=(1.1, 1.6), HEM_BELOW_HIPS=0.07, BADGE_DROP=0.075, BADGE_CENTRE_X=0.08,
                 BADGE_SIZE=(0.078, 0.0305), V_DEPTH=0.075, V_HALF_WIDTH=0.034, SIDE_SLIT=None, POCKET_DROP=0.085, SLEEVE_KEY="sleeve",
                 COLLAR=dict(CLEARANCE=0.007, BASE_BACK=-0.010, BASE_FRONT=-0.005, STAND_HEIGHT=0.020, STAND_MIN=0.012, GAP_X=0.030,
                             BLEND_DEG=85.0, BACK_WIDTH=0.055, SIDE_WIDTH=0.065, FRONT_EDGE=0.13, SPREAD_DEG=25.0, BULGE=0.03,
                             LAPEL_KEY="lapel")),
    # Nam: sơ mi trắng trơn (không viền), tay rộng tới ngay trên khuỷu có đường gập gấu, túi ngực trái, tem ngay trên miệng túi.
    "boy": dict(SLEEVE_END=0.44, SLEEVE_FLARE=(1.12, 1.5), HEM_BELOW_HIPS=0.10, BADGE_DROP=0.028, BADGE_CENTRE_X=0.078,
                BADGE_SIZE=(0.09, 0.034), V_DEPTH=0.095, V_HALF_WIDTH=0.05, SIDE_SLIT=(0.05, 0.012), POCKET_DROP=0.11, SLEEVE_KEY="sleeve_plain",
                COLLAR=dict(CLEARANCE=0.008, BASE_BACK=-0.008, BASE_FRONT=0.0, STAND_HEIGHT=0.030, STAND_MIN=0.016, GAP_X=0.034,
                            BLEND_DEG=80.0, BACK_WIDTH=0.042, SIDE_WIDTH=0.046, FRONT_EDGE=0.075, SPREAD_DEG=40.0, BULGE=0.008,
                            LAPEL_KEY="lapel_plain")),
    # Polo: như sơ mi nam nhưng không túi, không tem; cổ bẻ + nẹp.
    "polo": dict(SLEEVE_END=0.46, SLEEVE_FLARE=(1.1, 1.13), HEM_BELOW_HIPS=0.09, BADGE_DROP=0.028, BADGE_CENTRE_X=0.078,
                 BADGE_SIZE=(0.09, 0.034), V_DEPTH=0.085, V_HALF_WIDTH=0.04, SIDE_SLIT=(0.04, 0.012), POCKET_DROP=0.11, SLEEVE_KEY="sleeve_blank", PLACKET_LENGTH=0.12, BUTTONS=3, FOLD_HEMS=False,
                 COLLAR=dict(CLEARANCE=0.008, BASE_BACK=-0.008, BASE_FRONT=0.0, STAND_HEIGHT=0.026, STAND_MIN=0.014, GAP_X=0.03,
                             BLEND_DEG=80.0, BACK_WIDTH=0.04, SIDE_WIDTH=0.044, FRONT_EDGE=0.07, SPREAD_DEG=35.0, BULGE=0.008,
                             LAPEL_KEY="lapel_plain")),
    # Sơ mi dài tay: như sơ mi nam, tay tới cổ tay, không tem.
    "shirt": dict(SLEEVE_END=0.95, SLEEVE_FLARE=(1.1, 1.3), HEM_BELOW_HIPS=0.10, BADGE_DROP=0.028, BADGE_CENTRE_X=0.078,
                  BADGE_SIZE=(0.09, 0.034), V_DEPTH=0.095, V_HALF_WIDTH=0.05, SIDE_SLIT=(0.05, 0.012), POCKET_DROP=0.11, SLEEVE_KEY="sleeve_blank",
                  STIFF_CUFF=False, SLEEVE_TUBE=(0.057, 0.041),
                  COLLAR=dict(CLEARANCE=0.008, BASE_BACK=-0.008, BASE_FRONT=0.0, STAND_HEIGHT=0.030, STAND_MIN=0.016, GAP_X=0.034,
                              BLEND_DEG=80.0, BACK_WIDTH=0.042, SIDE_WIDTH=0.046, FRONT_EDGE=0.075, SPREAD_DEG=40.0, BULGE=0.008,
                              LAPEL_KEY="lapel_plain")),
    # Áo phông lớp: cổ tròn có bo, tay lỡ rộng, không nẹp/cổ bẻ; hình in là các miếng lưới áp trên thân áo.
    "tee": dict(SLEEVE_END=0.44, SLEEVE_FLARE=(1.15, 1.55), HEM_BELOW_HIPS=0.09, BADGE_DROP=0.075, BADGE_CENTRE_X=0.08,
                BADGE_SIZE=(0.078, 0.0305), V_DEPTH=0.0, V_HALF_WIDTH=0.034, SIDE_SLIT=None, POCKET_DROP=0.085, SLEEVE_KEY="sleeve_plain",
                COLLAR=dict(CLEARANCE=0.016, BASE_BACK=-0.014, BASE_FRONT=-0.012, STAND_HEIGHT=0.0, STAND_MIN=0.0, GAP_X=0.03,
                            LAPEL_KEY="lapel_plain")),
}

# Sơ mi dài tay nữ: thân và gấu theo kiểu cắt nữ (gấu phẳng, không xẻ sườn), cổ và nẹp như sơ mi nam, ống tay thon.
CUTS["shirt_f"] = dict(CUTS["girl"], SLEEVE_END=0.95, STIFF_CUFF=False, SLEEVE_TUBE=(0.050, 0.036), SLEEVE_KEY="sleeve_blank",
                       V_DEPTH=0.085, V_HALF_WIDTH=0.042, BADGE_DROP=0.028, POCKET_DROP=0.11, COLLAR=CUTS["shirt"]["COLLAR"])


def _rect_uv(rect, u, v):
    """Điểm (u, v) trong [0,1]^2 của một vùng atlas -> toạ độ UV."""
    x0, y0, x1, y1 = rect
    return (x0 + (x1 - x0) * u, y0 + (y1 - y0) * v)


def _set_loop_uv(obj, uv_of_vertex):
    layer = obj.data.uv_layers[0]
    for loop in obj.data.loops:
        layer.data[loop.index].uv = uv_of_vertex[loop.vertex_index]


def _piece(name, like, verts, faces, uvs, body, frame, smooth=0):
    obj = cut._new_object(name, like, verts, faces, [{} for _ in verts])
    _set_loop_uv(obj, uvs)
    cut.reweight_from_skin(obj, body, frame, smooth_passes=smooth)
    return obj


def _front_hit(bvh, x, z):
    hit, normal, _index, _dist = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)))
    if hit is None:
        raise RuntimeError("Không dò được mặt trước áo tại x=%.3f z=%.3f" % (x, z))
    return hit, normal


def straighten_edges(shirt, frame, hem_z):
    """Đưa các đỉnh trên mép vạt áo về cùng một độ cao và các đỉnh trên mép gấu tay về cùng một mặt cắt: hết răng cưa."""
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    edge = np.zeros(len(bm.verts), dtype=bool)
    for vert in bm.verts:
        edge[vert.index] = any(len(e.link_faces) < 2 for e in vert.link_edges)
    bm.free()
    co = cut._coords(shirt)
    a, distance, _radial, axis, _is_arm = cut.arm_parameter(frame, co)
    cuff = edge & (distance < 0.14) & (a > SLEEVE_END - 0.15) & (np.abs(co[:, 0]) > frame.shoulder.x)
    hem = edge & ~cuff & (co[:, 2] < hem_z + 0.06)
    if cuff.any():
        length = (frame.hand - frame.shoulder).length
        co[cuff] += axis[cuff] * ((a[cuff].mean() - a[cuff]) * length)[:, None]
    if hem.any():
        co[hem, 2] = co[hem, 2].mean()
    cut._move(shirt, co)


def stiffen(shirt, frame, hem_z):
    """Gấu tay áo chỉ theo xương cánh tay trên, gấu thân áo chủ yếu theo xương hông: các đỉnh trên cùng một mép có trọng số
    giống nhau thì mép không bị kéo lệch thành răng cưa khi tay/chân cử động."""
    co = cut._coords(shirt)
    a, _distance, _radial, _axis, is_arm = cut.arm_parameter(frame, co)
    cuff = cut._smooth(0.20, 0.34, a) * is_arm * (1.0 if STIFF_CUFF else 0.0)
    hem = (1.0 - cut._smooth(hem_z + 0.01, hem_z + 0.07, co[:, 2])) * ~is_arm * HEM_HIPS_SHARE
    names = {g.index: g.name for g in shirt.vertex_groups}
    for vertex in shirt.data.vertices:
        index = vertex.index
        share, anchor = (float(cuff[index]), cut.P + ("Left" if vertex.co.x >= 0 else "Right") + "Arm") if cuff[index] > 0 else (float(hem[index]), cut.P + "Hips")
        if share <= 0.0:
            continue
        weights = {names[g.group]: g.weight * (1.0 - share) for g in vertex.groups if names[g.group].startswith(cut.P)}
        weights[anchor] = weights.get(anchor, 0.0) + share
        for name, weight in weights.items():
            if weight > 0.004:
                shirt.vertex_groups[name].add([index], weight, "REPLACE")
            else:
                shirt.vertex_groups[name].remove([index])


def tube_sleeve_weights(shirt, frame):
    """Tay áo dài: trọng số gán thẳng theo tham số dọc tay, KHÔNG lấy theo da. Từ a = 0,2 trở ra chỉ còn xương Arm và ForeArm của
    chính tay đó, pha mượt quanh khuỷu trong ~8 cm; từ nách (a < 0,08) giữ trọng số theo da để nối liền với thân áo."""
    co = cut._coords(shirt)
    a, _distance, _radial, _axis, is_arm = cut.arm_parameter(frame, co)
    upper, lower = (frame.elbow - frame.shoulder).length, (frame.hand - frame.elbow).length
    elbow, half = upper / (upper + lower), 0.04 / (upper + lower)
    fore = cut._smooth(elbow - half, elbow + half, a)
    own = cut._smooth(0.08, 0.2, a) * is_arm
    names = {g.index: g.name for g in shirt.vertex_groups}
    for vertex in shirt.data.vertices:
        share = float(own[vertex.index])
        if share <= 0.0:
            continue
        side = "Left" if vertex.co.x >= 0 else "Right"
        weights = {names[g.group]: g.weight * (1.0 - share) for g in vertex.groups if names[g.group].startswith(cut.P)}
        for bone, part in (("Arm", 1.0 - float(fore[vertex.index])), ("ForeArm", float(fore[vertex.index]))):
            weights[cut.P + side + bone] = weights.get(cut.P + side + bone, 0.0) + share * part
        for name, weight in weights.items():
            if weight > 0.004:
                shirt.vertex_groups[name].add([vertex.index], weight, "REPLACE")
            else:
                shirt.vertex_groups[name].remove([vertex.index])


def open_side_slits(shirt, frame, hem_z):
    """Xẻ sườn nhỏ ở gấu hai bên."""
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    doomed = [f for f in bm.faces if f.calc_center_median().z < hem_z + SIDE_SLIT[0]
              and abs(f.calc_center_median().y - frame.centre_y) < SIDE_SLIT[1] and abs(f.calc_center_median().x) > 0.08]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(shirt.data)
    bm.free()


def fold_edges(obj, depth=EDGE_FOLD):
    """Gập mọi mép hở vào trong vài mm cho mép vải có độ dày nhìn thấy được."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    edges = [e for e in bm.edges if len(e.link_faces) < 2]
    inward = {v: v.normal.copy() for e in edges for v in e.verts}
    old = set(bm.verts)
    bmesh.ops.extrude_edge_only(bm, edges=edges)
    lookup = {tuple(round(c, 6) for c in v.co): n for v, n in inward.items()}
    for vert in bm.verts:
        if vert not in old:
            normal = lookup.get(tuple(round(c, 6) for c in vert.co))
            if normal is not None:
                vert.co -= normal * depth
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()


def smooth_edge_weights(shirt, above_z, passes=10):
    """Làm mượt trọng số dọc theo mép hở vùng cổ (khe chữ V, lỗ cổ): các đỉnh trên mép lấy trung bình với hai đỉnh kề trên
    cùng mép, để mép không thành răng cưa khi vai và tay cử động."""
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    chain = {}
    for edge in bm.edges:
        if len(edge.link_faces) < 2 and all(v.co.z > above_z for v in edge.verts):
            a, b = edge.verts[0].index, edge.verts[1].index
            chain.setdefault(a, []).append(b)
            chain.setdefault(b, []).append(a)
    bm.free()
    names = {g.index: g.name for g in shirt.vertex_groups}
    weights = {i: {names[g.group]: g.weight for g in shirt.data.vertices[i].groups if names[g.group].startswith(cut.P)} for i in chain}
    for _ in range(passes):
        smoothed = {}
        for i, near in chain.items():
            mixed = {name: weight * 0.5 for name, weight in weights[i].items()}
            for other in near:
                for name, weight in weights[other].items():
                    mixed[name] = mixed.get(name, 0.0) + weight * 0.5 / len(near)
            smoothed[i] = mixed
        weights = smoothed
    for i, mixed in weights.items():
        total = sum(mixed.values())
        for group in shirt.vertex_groups:
            if group.name.startswith(cut.P):
                group.remove([i])
        for name, weight in mixed.items():
            if weight / total > 0.01:
                shirt.vertex_groups[name].add([i], weight / total, "REPLACE")


def build_shirt(body, frame, ring):
    """Thân áo suông + tay lỡ rộng, khoét cổ chữ V. UV: thân vào vùng trắng, tay vào vùng tay áo (gấu ở v = 0)."""
    co = frame.co
    hem_z = frame.hips_z - HEM_BELOW_HIPS
    a, _distance, _radial, _axis, is_arm = cut.arm_parameter(frame, co)
    mask = frame.tights & (co[:, 2] < frame.neck_z + 0.004) & (co[:, 2] > hem_z) & ~(is_arm & (a > SLEEVE_END))
    mask &= is_arm | (np.abs(co[:, 0]) < cut.ARM_MIN_X)
    mask &= ~ring.inside(co) & ~ring.front_cut(co)             # lỗ cổ: chân cổ mọc lên từ đây; viền cổ trước hạ về hõm cổ
    shirt = cut._submesh(body, mask, "top")
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=1.0)
    v_bottom = frame.neck_z - V_DEPTH
    opening = [f for f in bm.faces if V_DEPTH > 0 and f.calc_center_median().y < frame.centre_y
               and f.calc_center_median().z > v_bottom
               and abs(f.calc_center_median().x) < V_HALF_WIDTH * (f.calc_center_median().z - v_bottom) / V_DEPTH]
    bmesh.ops.delete(bm, geom=opening, context="FACES")
    for vert in bm.verts:   # đưa mép khe cổ về đúng đường chữ V cho hết răng cưa
        on_edge = any(len(e.link_faces) < 2 for e in vert.link_edges)
        if V_DEPTH > 0 and on_edge and vert.co.y < frame.centre_y and v_bottom - 0.01 < vert.co.z < frame.neck_z - 0.004 and abs(vert.co.x) < V_HALF_WIDTH + 0.03:
            wanted = V_HALF_WIDTH * max(vert.co.z - v_bottom, 0.0) / V_DEPTH
            vert.co.x = math.copysign(wanted, vert.co.x) if abs(vert.co.x) > 1e-4 else 0.0
    bm.to_mesh(shirt.data)
    bm.free()
    cut.reweight_from_skin(shirt, body, frame)
    cut.keep_sleeves_on_arm(shirt, frame)
    stiffen(shirt, frame, hem_z)
    smooth_edge_weights(shirt, v_bottom - 0.02)
    if SLEEVE_TUBE:
        tube_sleeve_weights(shirt, frame)

    now = cut._coords(shirt)
    a, _distance, radial, axis, is_arm = cut.arm_parameter(frame, now)
    arm_length = (frame.hand - frame.shoulder).length
    flare = 1.0 + (SLEEVE_FLARE[0] - 1.0) * cut._smooth(0.10, 0.40, a) + (SLEEVE_FLARE[1] - SLEEVE_FLARE[0]) * cut._smooth(0.16, SLEEVE_END, a)
    if SLEEVE_TUBE:
        reach = np.maximum(np.linalg.norm(radial, axis=1), 1e-5)
        wanted = SLEEVE_TUBE[0] + (SLEEVE_TUBE[1] - SLEEVE_TUBE[0]) * cut._smooth(0.2, SLEEVE_END, a)
        blend = cut._smooth(0.1, 0.3, a) * is_arm
        now += radial / reach[:, None] * ((wanted - reach) * blend)[:, None]
    else:
        now[is_arm] += radial[is_arm] * (flare[is_arm] - 1.0)[:, None]
    torso = ~is_arm
    ease = BOXY_EASE * cut._smooth(hem_z, frame.hips_z + 0.05, now[:, 2]) * (1.0 - cut._smooth(frame.waist_z + 0.08, frame.bust_z + 0.03, now[:, 2]))
    ease += 0.02 * (1.0 - cut._smooth(hem_z, frame.hips_z + 0.05, now[:, 2]))          # vạt áo hơi xoè, không ôm hông
    outward = np.stack([now[:, 0], now[:, 1] - frame.centre_y], axis=1)
    outward /= np.maximum(np.linalg.norm(outward, axis=1), 1e-5)[:, None]
    now[:, 0] += outward[:, 0] * ease * torso
    now[:, 1] += outward[:, 1] * ease * torso
    now[:, 2] = np.where(torso & (now[:, 2] < hem_z + HEM_FLATTEN), hem_z + (now[:, 2] - hem_z) * 0.15, now[:, 2])
    # Gấu áo tròn đều: bán kính quanh trục thân của dải gấu được thay bằng đường cong trơn theo góc (chuỗi Fourier bậc 3),
    # vì lưới trợ giúp ở dưới hông lõm vào giữa hai chân và hai bên mông làm gấu lượn sóng.
    band = torso & (now[:, 2] < hem_z + 0.07)
    if band.sum() > 20:
        rel_x, rel_y = now[band, 0], now[band, 1] - frame.centre_y
        theta, reach = np.arctan2(rel_x, -rel_y), np.maximum(np.hypot(rel_x, rel_y), 1e-5)
        basis = np.stack([np.ones_like(theta)] + [f(k * theta) for k in (1, 2, 3) for f in (np.cos, np.sin)], axis=1)
        fitted = basis @ np.linalg.lstsq(basis, reach, rcond=None)[0]
        share = 1.0 - cut._smooth(hem_z + 0.02, hem_z + 0.07, now[band, 2])
        new_reach = reach + (np.maximum(fitted, reach * 0.97) - reach) * share
        now[band, 0], now[band, 1] = rel_x / reach * new_reach, frame.centre_y + rel_y / reach * new_reach
    past = is_arm & (a > SLEEVE_END - (0.02 if SLEEVE_TUBE else 0.08))   # gấu tay: dồn các đỉnh cuối về một mặt cắt phẳng
    now[past] -= (axis[past] * ((a[past] - (SLEEVE_END - (0.02 if SLEEVE_TUBE else 0.08))) * 0.85 * arm_length)[:, None])
    cut._move(shirt, now)
    cut._inflate(shirt, np.full(len(now), BODY_INFLATE))
    straighten_edges(shirt, frame, hem_z)
    seated = cut._coords(shirt)
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    on_edge = np.array([any(len(e.link_faces) < 2 for e in v.link_edges) for v in bm.verts])
    bm.free()
    cut._move(shirt, ring.seat(seated, on_edge, COLLAR["GAP_X"] + 0.004))
    if SIDE_SLIT:
        open_side_slits(shirt, frame, hem_z)
    if FOLD_HEMS:
        fold_edges(shirt)

    final = cut._coords(shirt)
    a, _distance, radial, axis, is_arm = cut.arm_parameter(frame, final)
    plain, sleeve = tex.UNIFORM_ATLAS["plain"], tex.UNIFORM_ATLAS[SLEEVE_KEY]
    sleeve_uv, body_uv = [], []
    for index in range(len(final)):
        first = Vector(axis[index]).cross(Vector((0.0, 0.0, 1.0))).normalized()
        second = Vector(axis[index]).cross(first)
        around = math.atan2(Vector(radial[index]).dot(second), Vector(radial[index]).dot(first))
        sleeve_uv.append(_rect_uv(sleeve, around / (2 * math.pi) + 0.5, 1.0 - min(max(a[index] / SLEEVE_END, 0.0), 1.0)))
        around = math.atan2(final[index, 0], -(final[index, 1] - frame.centre_y))
        body_uv.append(_rect_uv(plain, around / (2 * math.pi) + 0.5, min(max((final[index, 2] - hem_z) / 0.8, 0.0), 1.0)))
    layer = shirt.data.uv_layers[0]
    for polygon in shirt.data.polygons:   # mặt nào có đỉnh thuộc thân thì cả mặt lấy UV thân: không mặt nào vắt qua hai vùng atlas
        source = sleeve_uv if all(is_arm[i] for i in polygon.vertices) else body_uv
        for loop_index in polygon.loop_indices:
            layer.data[loop_index].uv = source[shirt.data.loops[loop_index].vertex_index]
    return shirt


def _ribbon(points, half_width, uv_rect):
    """Dải phẳng theo một dãy (điểm, pháp tuyến): trả về (đỉnh, mặt, uv)."""
    verts, faces, uvs = [], [], []
    for k, (point, normal) in enumerate(points):
        tangent = (points[min(k + 1, len(points) - 1)][0] - points[max(k - 1, 0)][0]).normalized()
        across = normal.cross(tangent).normalized()
        for j, offset in enumerate((-half_width, half_width)):
            verts.append(point + across * offset)
            uvs.append(_rect_uv(uv_rect, j, k / max(len(points) - 1, 1)))
    for k in range(len(points) - 1):
        faces.append((k * 2, k * 2 + 1, k * 2 + 3, k * 2 + 2))
    return verts, faces, uvs


def build_placket(shirt, body, frame):
    """Nẹp áo giữa thân trước với hàng cúc nhỏ (hình học nổi, cùng màu vải)."""
    bvh = cut._bvh(shirt)
    top_z, bottom_z = frame.neck_z - V_DEPTH - 0.01, frame.hips_z - HEM_BELOW_HIPS + 0.015
    if PLACKET_LENGTH:
        bottom_z = top_z - PLACKET_LENGTH
    points = []
    for i in range(21):
        hit, normal = _front_hit(bvh, 0.0, top_z + (bottom_z - top_z) * i / 20)
        points.append((hit + normal * 0.002, normal))
    plain = tex.UNIFORM_ATLAS["plain"]
    verts, faces, uvs = _ribbon(points, PLACKET_HALF_WIDTH, tex.UNIFORM_ATLAS["placket"])
    for b in range(BUTTONS):
        point, normal = points[2 + b * (12 if PLACKET_LENGTH else 16) // (BUTTONS - 1)]
        start = len(verts)
        side = Vector((1, 0, 0))
        up = normal.cross(side).normalized()
        for t in range(6):
            verts.append(point + (side * math.cos(t * math.pi / 3) + up * math.sin(t * math.pi / 3)) * 0.005 + normal * 0.001)
        verts.append(point + normal * 0.004)
        button = tex.UNIFORM_ATLAS["button"]
        uvs.extend([_rect_uv(button, 0.5 + 0.48 * math.cos(t * math.pi / 3), 0.5 + 0.48 * math.sin(t * math.pi / 3)) for t in range(6)])
        uvs.append(_rect_uv(button, 0.5, 0.5))
        faces.extend((start + t, start + (t + 1) % 6, start + 6) for t in range(6))
    return _piece("placket", shirt, verts, faces, uvs, body, frame)


def build_badge(shirt, body, frame):
    """Phù hiệu vải trên ngực trái của người mặc (+X), hơi nghiêng."""
    bvh = cut._bvh(shirt)
    width, height = BADGE_SIZE
    centre_z = frame.bust_z - BADGE_DROP
    rect = tex.UNIFORM_ATLAS["badge"]
    verts, uvs, faces = [], [], []
    columns, rows = 4, 2
    for r in range(rows + 1):
        for c in range(columns + 1):
            u, v = c / columns, r / rows
            dx, dz = (u - 0.5) * width, (v - 0.5) * height
            x = BADGE_CENTRE_X + dx * math.cos(BADGE_TILT) - dz * math.sin(BADGE_TILT)
            z = centre_z + dx * math.sin(BADGE_TILT) + dz * math.cos(BADGE_TILT)
            hit, normal = _front_hit(bvh, x, z)
            verts.append(hit + normal * 0.003)
            uvs.append(_rect_uv(rect, u, v))
    for r in range(rows):
        for c in range(columns):
            i = r * (columns + 1) + c
            faces.append((i, i + columns + 1, i + columns + 2, i + 1))
    return _piece("badge", shirt, verts, faces, uvs, body, frame)


def _loft(sections, close_end):
    """Nối các tiết diện (mỗi tiết diện là một vòng điểm cùng số lượng) thành ống; close_end: bịt đầu cuối bằng quạt."""
    verts, faces = [], []
    count = len(sections[0])
    for section in sections:
        verts.extend(section)
    for k in range(len(sections) - 1):
        for j in range(count):
            a, b = k * count + j, k * count + (j + 1) % count
            faces.append((a, b, b + count, a + count))
    if close_end:
        centre = sum(sections[-1], Vector()) / count
        verts.append(centre)
        base = (len(sections) - 1) * count
        faces.extend((base + j, base + (j + 1) % count, len(verts) - 1) for j in range(count))
    return verts, faces


def build_bow(shirt, body, frame):
    """Nơ ruy băng xanh than có khối, ngay dưới đáy khe cổ: nút nơ, hai cánh nơ phồng, hai dải rủ có độ dày."""
    bvh = cut._bvh(shirt)
    knot_z = frame.neck_z - V_DEPTH - 0.012
    rect = tex.UNIFORM_ATLAS["navy"]
    verts, faces = [], []
    forward, up = Vector((0.0, -1.0, 0.0)), Vector((0.0, 0.0, 1.0))

    def add(part):
        base = len(verts)
        verts.extend(part[0])
        faces.extend(tuple(base + i for i in face) for face in part[1])

    def at(x, z, lift):
        hit, normal = _front_hit(bvh, x, z)
        return hit + normal * lift

    def ring(centre, half_depth, half_height, count=10):
        return [centre + forward * (half_depth * math.cos(2 * math.pi * j / count)) + up * (half_height * math.sin(2 * math.pi * j / count))
                for j in range(count)]

    anchor = at(0.0, knot_z, BOW_LIFT)
    add(_loft([ring(anchor + Vector((x, 0.0, 0.0)) + forward * 0.003, 0.0075 * shape, 0.0125 * shape)
               for x, shape in ((-0.011, 0.7), (-0.008, 0.95), (0.0, 1.0), (0.008, 0.95), (0.011, 0.7))], False))   # nút nơ
    for sign in (1.0, -1.0):
        sections = []
        for k in range(8):                                     # cánh nơ: hẹp ở nút, cao và phồng dần, đầu bo tròn
            t = k / 7
            centre = at(sign * (0.007 + 0.052 * t), knot_z + 0.005 * t, BOW_LIFT + 0.002 * math.sin(math.pi * t))
            height = 0.007 + 0.015 * cut._smooth(0.0, 0.75, t) - 0.006 * cut._smooth(0.85, 1.0, t)
            depth = 0.0035 + 0.0045 * math.sin(math.pi * min(t * 1.1, 1.0))
            sections.append(ring(centre, depth, height))
        add(_loft(sections, True))
        sections = []
        for k in range(8):                                     # dải rủ: dải dẹt dày 2 mm, hơi choãi, đầu cắt vát
            f = k / 7
            x, z = sign * (0.005 + 0.019 * f), knot_z - 0.006 - 0.115 * f
            half = 0.011 + 0.003 * f
            lift = 0.008 * (1.0 - f) + 0.004 + 0.0015 * math.sin(3 * math.pi * f)
            slant = 0.008 * f * (1.0 if k == 7 else 0.0)
            inner, outer = at(x - sign * half, z + slant, lift), at(x + sign * half, z - slant, lift)
            normal = _front_hit(bvh, x, z)[1]
            sections.append([inner, outer, outer - normal * 0.002, inner - normal * 0.002])
        add(_loft(sections, True))
    uvs = [_rect_uv(rect, 0.3 + 0.4 * ((i * 7) % 5) / 4.0, 0.3 + 0.4 * ((i * 3) % 4) / 3.0) for i in range(len(verts))]
    return _piece("bow", shirt, verts, faces, uvs, body, frame, smooth=2)


def build_pocket(shirt, body, frame):
    """Túi ngực bên trái người mặc (+X): miếng lưới áp trên thân áo, đường may và đáy vát vẽ trong kết cấu."""
    bvh = cut._bvh(shirt)
    width, height = POCKET_SIZE
    centre_z = frame.bust_z - POCKET_DROP
    rect = tex.UNIFORM_ATLAS["pocket"]
    verts, uvs, faces = [], [], []
    columns, rows = 4, 4
    for r in range(rows + 1):
        for c in range(columns + 1):
            u, v = c / columns, r / rows
            hit, normal = _front_hit(bvh, BADGE_CENTRE_X + (u - 0.5) * width, centre_z + (v - 0.5) * height)
            verts.append(hit + normal * 0.0022)
            uvs.append(_rect_uv(rect, u, v))
    for r in range(rows):
        for c in range(columns):
            i = r * (columns + 1) + c
            faces.append((i, i + columns + 1, i + columns + 2, i + 1))
    return _piece("pocket", shirt, verts, faces, uvs, body, frame)


def covered_skin(frame):
    """Da thân bị áo che: thân dưới đáy khe cổ chữ V và trên vạt áo; da tay để nguyên (tay áo rộng, nhìn vào thấy tay)."""
    co = frame.co
    _a, _distance, _radial, _axis, is_arm = cut.arm_parameter(frame, co)
    hem_z = frame.hips_z - HEM_BELOW_HIPS
    return frame.skin & ~is_arm & (co[:, 2] < frame.neck_z - max(V_DEPTH, 0.055) - 0.02) & (co[:, 2] > hem_z + 0.02) & (np.abs(co[:, 0]) < cut.ARM_MIN_X)


def build_decal(shirt, body, frame, rect, centre_x, centre_z, size):
    """Miếng hình in áp trên mặt trước thân áo (UV phủ trọn vùng `rect` của atlas)."""
    bvh = cut._bvh(shirt)
    verts, uvs, faces = [], [], []
    columns, rows = 10, 10
    for r in range(rows + 1):
        for c in range(columns + 1):
            u, v = c / columns, r / rows
            x, z = centre_x + (u - 0.5) * size[0], centre_z + (v - 0.5) * size[1]   # u tăng về +X = bên phải người nhìn: chữ đọc xuôi
            hit, normal, _index, _dist = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)))
            if hit is None:                                  # sát sườn: lấy điểm áo gần nhất
                hit, normal, _index, _dist = bvh.find_nearest(Vector((x, frame.centre_y - 0.15, z)))
            verts.append(hit + normal * 0.0025)
            uvs.append(_rect_uv(rect, u, v))
    for r in range(rows):
        for c in range(columns):
            i = r * (columns + 1) + c
            faces.append((i, i + 1, i + columns + 2, i + columns + 1))
    return _piece("decal", shirt, verts, faces, uvs, body, frame)


def build(body, rig, cut_name):
    """cut_name: "girl" | "boy" | "tee". Trả về {"top": đối tượng lưới, "covered": mặt nạ đỉnh thân bị che}."""
    with_bow = cut_name == "girl"
    globals().update(PLACKET_LENGTH=None, BUTTONS=5, STIFF_CUFF=True, SLEEVE_TUBE=None, FOLD_HEMS=True)
    globals().update(CUTS[cut_name])
    frame = cut.Frame(body, rig)
    ring = collar.NeckRing(body, frame, COLLAR)
    shirt = build_shirt(body, frame, ring)
    if cut_name == "tee":
        grow = frame.shoulder.x / 0.138                     # hình in to theo khổ người (nam to hơn)
        pieces = [collar.build_rib(shirt, body, frame, ring, _rect_uv(tex.UNIFORM_ATLAS["lapel_plain"], 0.5, 0.5)),
                  build_decal(shirt, body, frame, tex.UNIFORM_ATLAS["badge"], 0.075 * grow, frame.bust_z - 0.015, (0.085 * grow, 0.085 * grow)),
                  build_decal(shirt, body, frame, tex.UNIFORM_ATLAS["sleeve"], -0.042, frame.waist_z + 0.075, (0.168 * grow, 0.21 * grow))]
        return {"top": cut._join(shirt, pieces), "covered": covered_skin(frame)}
    collar_piece, _collar_info = collar.build(shirt, body, frame, ring, COLLAR)
    pieces = [collar_piece, build_placket(shirt, body, frame), build_badge(shirt, body, frame)]
    if cut_name in ("polo", "shirt", "shirt_f"):
        bpy.data.objects.remove(pieces.pop(), do_unlink=True)      # không tem
    elif with_bow:
        pieces.append(build_bow(shirt, body, frame))
    else:
        pieces.append(build_pocket(shirt, body, frame))
    # (sơ mi nữ không có túi ngực: nhánh trên đã không thêm túi)
    top = cut._join(shirt, pieces)
    return {"top": top, "covered": covered_skin(frame)}
