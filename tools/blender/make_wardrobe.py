"""Tủ đồ: MỘT tệp .glb cho mỗi giới, chứa thân (da tách thành các lưới vùng `skin_*` để runtime ẩn phần bị che), tóc, kính và
mọi món quần áo dưới dạng lưới riêng `top_<mã>`, `bottom_<mã>`, `shoes_<mã>` (mỗi lưới một vật liệu trùng tên).

Chạy: blender -b -P tools/blender/make_wardrobe.py -- [--only f,m] [--out assets/people]
Kết quả: <out>/f_wardrobe.glb (ghi qua _staging rồi đổi tên một lần) và mục manifest.wardrobe.<giới>.

Dùng lại các bộ dựng của make_people.py (người, mặt, tóc, kính) và các bộ dựng quần áo theo thủ tục.
"""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_people as mp  # noqa: E402
import people_aodai as aodai  # noqa: E402
import people_collar as collar  # noqa: E402
import people_faces as faces  # noqa: E402
import people_glasses as glasses  # noqa: E402
import people_hair as hair_style  # noqa: E402
import people_hairfit as hairfit  # noqa: E402
import people_hairgen as hairgen  # noqa: E402
import people_head as head  # noqa: E402
import people_skirt as skirt  # noqa: E402
import people_textures as tex  # noqa: E402
import people_uniform as uniform  # noqa: E402
from bl_ext.user_default.mpfb.services import TargetService  # noqa: E402

SKIN_REGIONS = ("skin_head", "skin_torso", "skin_upperarm", "skin_forearm", "skin_hand", "skin_hip", "skin_knee", "skin_shin", "skin_foot")
UPPERARM_END, FOREARM_END = 0.30, 0.93      # theo chiều dài tay (0 = vai, 1 = cổ tay)
BODIES = {
    # Người lớn ~42 tuổi (thang tuổi MakeHuman: 0,1875 = 10 tuổi, 0,5 = 25 tuổi, 1,0 = 90 tuổi), chủng Á, vóc trung bình.
    "f": dict(gender=0.0, age=0.63, height=0.56, weight=0.50, muscle=0.40, cupsize=0.40, build="adult", skin="middleage_asian_female",
              hair=mp.FEMALE_HAIR, eyebrows="eyebrow005"),
    "m": dict(gender=1.0, age=0.63, height=0.58, weight=0.55, muscle=0.50, build="adult", skin="middleage_asian_male",
              hair=mp.MALE_HAIR, eyebrows="eyebrow002"),
}
AGE_MACROS = {"age_teen": 0.333, "age_old": 0.78}       # 17 tuổi và ~62 tuổi: morph tuổi = (dựng ở tuổi đó) - (gốc 42 tuổi)
AODAI_TINTS = ["#f4f3ee", "#f2c6cf", "#8e1b2c", "#f1e6cf", "#3fa7a0", "#b79ad6"]
TROUSER_TINTS = ["#1c1c22", "#1f2a4d", "#6b6f78", "#c9b79a"]
SKIRT_TINTS = ["#3f5f9a", "#1c1c22", "#c9b79a", "#7a2d3a"]
# Bảng món đồ: (loại, id, nhãn, các lưới da bị che hoàn toàn, thông tin thêm cho manifest)
ITEMS = {
    "f": [
        ("tops", "uniform", "Sơ mi đồng phục", ["skin_torso", "skin_upperarm"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee"])),
        ("tops", "class", "Áo lớp", ["skin_torso", "skin_upperarm"], dict(baked=True)),
        ("tops", "polo", "Áo polo", ["skin_torso", "skin_upperarm"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee", "#1f2a4d", "#7a2d3a", "#2f6b4f", "#f2c6cf"])),
        ("tops", "aodai", "Áo dài cổ tàu", ["skin_torso", "skin_upperarm", "skin_forearm"],
         dict(baked=False, tint="#f4f3ee", tints=AODAI_TINTS, flaps=True, bottoms=["aodai"])),
        ("tops", "aodai_modern", "Áo dài cách tân", ["skin_torso", "skin_upperarm"],
         dict(baked=False, tint="#f2c6cf", tints=AODAI_TINTS, flaps=True, bottoms=["aodai"])),
        ("tops", "shirt", "Sơ mi dài tay", ["skin_torso", "skin_upperarm", "skin_forearm"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee", "#cfe0f2", "#f2d5dc"])),
        ("tops", "jacket", "Áo khoác đồng phục", ["skin_torso", "skin_upperarm", "skin_forearm"], dict(baked=False, tint="#1f2a4d", tints=["#1f2a4d", "#1c1c22"])),
        ("tops", "pe", "Áo thể dục", ["skin_torso"], dict(baked=False, tint="#d9dde6", tints=["#d9dde6", "#f4f3ee", "#1f2a4d"])),
        ("bottoms", "pe", "Quần thể dục", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#1f2a4d", tints=["#1f2a4d", "#1c1c22", "#6b6f78"])),
        ("bottoms", "aodai", "Quần lụa", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee", "#1c1c22", "#f1e6cf"])),
        ("bottoms", "trousers", "Quần âu", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#1c1c22", tints=TROUSER_TINTS)),
        ("bottoms", "jeans", "Quần bò ống rộng", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#3f5f9a", tints=["#3f5f9a", "#1c1c22", "#6b7f9a"])),
        ("bottoms", "skirt_denim", "Chân váy bò", ["skin_hip", "skin_knee"], dict(baked=False, tint="#3f5f9a", tints=SKIRT_TINTS, flaps=True)),
        ("bottoms", "skirt", "Chân váy dài", ["skin_hip", "skin_knee"], dict(baked=False, tint="#1c1c22", tints=SKIRT_TINTS, flaps=True)),
        ("shoes", "sneakers", "Giày thể thao", ["skin_foot"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee", "#1c1c22", "#c9ccd4"])),
        ("shoes", "dress", "Giày bệt", ["skin_foot"], dict(baked=False, tint="#1c1c22", tints=["#1c1c22", "#f4f3ee", "#7a2d3a"])),
        ("shoes", "heels", "Cao gót", ["skin_foot"], dict(baked=False, tint="#1c1c22", tints=["#1c1c22", "#c9b79a", "#7a2d3a", "#f4f3ee"])),
        ("shoes", "sandals", "Dép quai hậu", [], dict(baked=False, tint="#4a2f22", tints=["#4a2f22", "#1c1c22", "#c9b79a", "#f4f3ee"])),
    ],
    "m": [
        ("tops", "uniform", "Sơ mi đồng phục", ["skin_torso", "skin_upperarm"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee", "#cfe0f2"])),
        ("tops", "class", "Áo lớp", ["skin_torso", "skin_upperarm"], dict(baked=True)),
        ("tops", "polo", "Áo polo", ["skin_torso", "skin_upperarm"], dict(baked=False, tint="#1f2a4d", tints=["#1f2a4d", "#f4f3ee", "#7a2d3a", "#2f6b4f", "#6b6f78"])),
        ("tops", "shirt", "Sơ mi dài tay", ["skin_torso", "skin_upperarm", "skin_forearm"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee", "#cfe0f2", "#f2d5dc"])),
        ("tops", "jacket", "Áo khoác đồng phục", ["skin_torso", "skin_upperarm", "skin_forearm"], dict(baked=False, tint="#1f2a4d", tints=["#1f2a4d", "#1c1c22"])),
        ("tops", "pe", "Áo thể dục", ["skin_torso"], dict(baked=False, tint="#d9dde6", tints=["#d9dde6", "#f4f3ee", "#1f2a4d"])),
        ("bottoms", "pe", "Quần thể dục", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#1f2a4d", tints=["#1f2a4d", "#1c1c22", "#6b6f78"])),
        ("bottoms", "trousers", "Quần âu", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#1c1c22", tints=TROUSER_TINTS)),
        ("bottoms", "jeans", "Quần bò", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#3f5f9a", tints=["#3f5f9a", "#1c1c22", "#6b7f9a"])),
        ("bottoms", "khaki", "Quần kaki", ["skin_hip", "skin_knee", "skin_shin"], dict(baked=False, tint="#c9b79a", tints=["#c9b79a", "#6b6f78", "#4a4f3a"])),
        ("shoes", "dress", "Giày da", ["skin_foot"], dict(baked=False, tint="#1c1c22", tints=["#1c1c22", "#4a2f22"])),
        ("shoes", "sneakers", "Giày thể thao", ["skin_foot"], dict(baked=False, tint="#f4f3ee", tints=["#f4f3ee", "#1c1c22", "#c9ccd4"])),
        ("shoes", "sandals", "Dép quai hậu", [], dict(baked=False, tint="#4a2f22", tints=["#4a2f22", "#1c1c22", "#c9b79a"])),
    ],
}
ASSETS = {  # tài nguyên MakeHuman cần nạp trước khi nướng target: giày {tên lưới: tài nguyên}, các bộ đồ
    "f": ({"shoes_sneakers": "shoes06"}, ("male_casualsuit05", "female_casualsuit01")),
    "m": ({"shoes_sneakers": "shoes05", "shoes_dress": "shoes03"}, ("male_casualsuit05", "male_casualsuit04")),
}


def split_skin(body, frame):
    """Tách lưới da thành các lưới vùng (mỗi mặt thuộc đúng một vùng theo tâm mặt); mép cắt dùng chung vị trí đỉnh nên khít nhau."""
    mesh = body.data
    co = aodai._coords(body)
    centres = np.array([co[list(p.vertices)].mean(axis=0) for p in mesh.polygons])
    a, _distance, _radial, _axis, is_arm = aodai.arm_parameter(frame, centres)
    arm_side = is_arm | (np.abs(centres[:, 0]) > aodai.ARM_MIN_X)
    z = centres[:, 2]
    mid_thigh, mid_calf = (frame.hip_joint.z + frame.knee.z) / 2.0, frame.knee.z - 0.07      # ranh gối/ống chân ngay dưới gối: nằm khuất trong chân váy dài
    region = np.full(len(centres), "skin_torso", dtype=object)
    region[z < frame.hips_z + 0.03] = "skin_hip"
    region[z < mid_thigh] = "skin_knee"
    region[z < mid_calf] = "skin_shin"
    region[z < frame.ankle_z + 0.004] = "skin_foot"      # cắt ngay trên khớp cổ chân: miệng giày (cao hơn khớp 1,2 cm) luôn phủ kín mép cắt
    head_part = ~arm_side & ((z > frame.neck_z + 0.005) | ((z > frame.neck_z - 0.10) & (np.abs(centres[:, 0]) < 0.085) & (centres[:, 1] < frame.neck_xy[1] + 0.02)))
    region[head_part] = "skin_head"
    region[arm_side] = "skin_upperarm"
    region[arm_side & (a > UPPERARM_END)] = "skin_forearm"
    region[arm_side & ((a > FOREARM_END) | ~is_arm)] = "skin_hand"
    pieces = {}
    for name in SKIN_REGIONS:
        obj = body.copy()
        obj.data = body.data.copy()
        bpy.context.scene.collection.objects.link(obj)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if region[f.index] != name], context="FACES")
        bm.to_mesh(obj.data)
        bm.free()
        obj.name = obj.data.name = name
        pieces[name] = obj
        print("DA %s: %d mặt" % (name, len(obj.data.polygons)))
    bpy.data.objects.remove(body, do_unlink=True)
    return pieces


def procedural_trousers(body, rig, radius, hem):
    """Quần dài thủ tục dùng chung (ống suông / ống rộng): radius = (bán kính ống ở đùi, ở gấu), hem = độ cao gấu (m)."""
    return aodai.build_trousers(body, aodai.Frame(body, rig), dict(trouser_radius=radius, trouser_hem=hem))


def suit_tops(body, rig, suits, hips_z, out, jacket, pe, shirt_cut):
    """Áo khoác và áo thể dục lấy từ bộ đồ MakeHuman (CC0), kéo sát thân như ở make_people; quần thể dục là quần thủ tục."""
    sources = {}
    for mesh_name, suit_name in (("top_jacket", jacket), ("top_pe", pe)):
        suit_obj, sources[mesh_name] = suits[suit_name]
        top = mp.extract_part(suit_obj, mp.part_mask(suit_obj, "top", hips_z), mesh_name)
        waist_z = rig.data.bones[mp.BONE_PREFIX_OLD + "Spine"].head_local.z
        low = aodai._smooth(waist_z + 0.06, waist_z - 0.04, aodai._coords(top)[:, 2])      # dưới eo nới thêm: quần/váy không lòi khi tay ép vào hông
        aodai._inflate(top, 0.004 + (0.002 if mesh_name == "top_jacket" else 0.0) * low)
        out[mesh_name] = top
    out["top_shirt"] = uniform.build(body, rig, shirt_cut)["top"]
    return sources


def _hull(points):
    """Bao lồi 2D (chuỗi đơn điệu), trả về danh sách điểm theo vòng."""
    points = sorted(set((round(float(p[0]), 5), round(float(p[1]), 5)) for p in points))
    if len(points) < 3:
        return points

    def half(sequence):
        out = []
        for p in sequence:
            while len(out) >= 2 and (out[-1][0] - out[-2][0]) * (p[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (p[0] - out[-2][0]) <= 0:
                out.pop()
            out.append(p)
        return out[:-1]
    return half(points) + half(points[::-1])


def build_sandals(body, rig):
    """Dép quai hậu hở ngón dựng theo thủ tục quanh bàn chân da: đế dày 1,2 cm theo hình bàn chân, quai ngang mu bàn chân, quai chéo
    cổ bàn chân và quai hậu. Đế nằm DƯỚI mặt đất của bàn chân trần nên runtime phải nâng mô hình theo `lift` (như giày cao gót)."""
    frame = aodai.Frame(body, rig)
    co = frame.co[frame.skin]
    verts, faces, weights = [], [], []
    sole, strap = 0.012, 0.014
    for sign in (1.0, -1.0):
        foot = co[(co[:, 0] * sign > 0) & (co[:, 2] < frame.ankle_z - 0.005)]
        toe_y, heel_y, floor = float(foot[:, 1].min()), float(foot[:, 1].max()), float(foot[:, 2].min())
        length = heel_y - toe_y
        outline = _hull(foot[foot[:, 2] < floor + 0.03][:, :2])
        centre = np.mean(outline, axis=0)
        base = len(verts)
        for z in (floor - 0.001, floor - sole):
            for x, y in outline:
                verts.append(Vector((centre[0] + (x - centre[0]) * 1.04, centre[1] + (y - centre[1]) * 1.03, z)))
                weights.append({aodai.P + ("Left" if sign > 0 else "Right") + ("ToeBase" if y < toe_y + 0.3 * length else "Foot"): 1.0})
        n = len(outline)
        for k in range(n):
            faces.append((base + k, base + (k + 1) % n, base + n + (k + 1) % n, base + n + k))
        for ring, order in ((range(n), 1), (range(n, 2 * n), -1)):               # mặt trên và mặt dưới đế (quạt)
            ring = [base + i for i in ring]
            verts.append(sum((verts[i] for i in ring), Vector()) / n)
            weights.append({aodai.P + ("Left" if sign > 0 else "Right") + "Foot": 1.0})
            hub = len(verts) - 1
            faces.extend((ring[k], ring[(k + 1) % n], hub)[::order] for k in range(n))
        for share, bone in ((0.30, "ToeBase"), (0.55, "Foot"), (0.86, "Foot")):          # ba quai: ngang ngón, cổ bàn chân, quai hậu
            y0 = toe_y + share * length
            band = foot[np.abs(foot[:, 1] - y0) < 0.012]
            if len(band) < 6:
                continue
            loop = _hull(np.stack([band[:, 0], band[:, 2]], axis=1))
            middle = np.mean(loop, axis=0)
            start = len(verts)
            for dy in (-strap / 2, strap / 2):
                for x, z in loop:
                    out = np.array([x - middle[0], z - middle[1]])
                    out = out / max(float(np.linalg.norm(out)), 1e-6) * 0.003
                    verts.append(Vector((x + out[0], y0 + dy, max(z + out[1], floor - 0.004))))
                    weights.append({aodai.P + ("Left" if sign > 0 else "Right") + bone: 1.0})
            m = len(loop)
            for k in range(m):
                faces.append((start + k, start + (k + 1) % m, start + m + (k + 1) % m, start + m + k))
    sandals = aodai._new_object("shoes_sandals", body, verts, faces, weights)
    layer = sandals.data.uv_layers[0]
    for loop in sandals.data.loops:
        layer.data[loop.index].uv = (0.5, 0.5)
    return sandals


PITCH = {}
UNDERCOAT = ()                        # (thử lót lớp chân tóc cho side/bob ở vòng 31: ra mảng trắng bậc thang -> tắt)


def build_pumps(body, rig, heel=0.05):
    """Giày cao gót dáng pump (hở mu): lưới gồm (1) BẢN SAO da bàn chân đã bẻ dốc theo gót cao (vật liệu `body`, các mặt đầu tiên) và
    (2) vỏ giày ôm đế, mũi và gót + khối gót thon (vật liệu shoes_heels). Xương không đổi; runtime ẩn skin_foot và nâng mô hình theo lift."""
    frame = aodai.Frame(body, rig)
    mask = frame.skin & (frame.co[:, 2] < frame.ankle_z + 0.012)
    shoes = aodai._submesh(body, mask, "shoes_heels")
    co = aodai._coords(shoes)
    toe_y, heel_y, floor = float(co[:, 1].min()), float(co[:, 1].max()), float(co[:, 2].min())
    length = heel_y - toe_y
    ball_y = toe_y + 0.32 * length
    angle = math.asin(min(heel / (heel_y - ball_y), 0.7))
    cos_a, sin_a = math.cos(angle), math.sin(angle)

    def turn(points, pivot_y, pivot_z, cos_t, sin_t):
        y, z = points[:, 1] - pivot_y, points[:, 2] - pivot_z
        points[:, 1], points[:, 2] = pivot_y + y * cos_t - z * sin_t, pivot_z + y * sin_t + z * cos_t

    pitched = co.copy()
    turn(pitched, frame.ankle.y, frame.ankle.z, cos_a, sin_a)
    ball = np.array([[0.0, ball_y, floor]])
    turn(ball, frame.ankle.y, frame.ankle.z, cos_a, sin_a)
    flat = aodai._smooth(ball_y + 0.02, ball_y - 0.02, co[:, 1])
    toes = pitched.copy()
    turn(toes, ball[0, 1], ball[0, 2], cos_a, -sin_a)
    pitched = pitched * (1 - flat[:, None]) + toes * flat[:, None]
    keep = aodai._smooth(frame.ankle_z - 0.035, frame.ankle_z + 0.004, co[:, 2])[:, None]      # sát cổ chân giữ nguyên: liền với skin_shin
    aodai._move(shoes, co * keep + pitched * (1 - keep))
    rest = {i: tuple(c) for i, c in enumerate(co)}
    skin_faces = len(shoes.data.polygons)
    bm = bmesh.new()
    bm.from_mesh(shoes.data)
    bm.verts.ensure_lookup_table()
    deform = bm.verts.layers.deform.verify()

    def covered(face):
        y = sum(rest[v.index][1] for v in face.verts) / len(face.verts)
        z = sum(rest[v.index][2] for v in face.verts) / len(face.verts)
        return z < floor + 0.016 or y < toe_y + 0.27 * length or (y > heel_y - 0.30 * length and z < frame.ankle_z - 0.04)

    shell = bmesh.ops.duplicate(bm, geom=[f for f in bm.faces if covered(f)])
    new_verts = [g for g in shell["geom"] if isinstance(g, bmesh.types.BMVert)]
    bm.normal_update()
    for vert in new_verts:
        vert.co += vert.normal * 0.0035
    for _ in range(3):
        bmesh.ops.smooth_vert(bm, verts=new_verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    toe_cap = [v for v in new_verts if v.co.y < toe_y + 0.3 * length]      # mũi giày: xoá hình từng ngón, phồng thành mũi trơn
    for _ in range(40):
        bmesh.ops.smooth_vert(bm, verts=toe_cap, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for vert in toe_cap:
        vert.co += vert.normal * 0.007
    ground = min(v.co.z for v in new_verts)
    for sign in (1.0, -1.0):                                              # gót thon
        side = [v for v in new_verts if v.co.x * sign > 0]
        rear = max(side, key=lambda v: v.co.y)
        under = min((v for v in side if v.co.y > rear.co.y - 0.03), key=lambda v: v.co.z)
        centre_x = sum(v.co.x for v in side if v.co.y > rear.co.y - 0.03) / max(len([v for v in side if v.co.y > rear.co.y - 0.03]), 1)
        rings = []
        for half, z in ((0.013, under.co.z + 0.006), (0.0045, ground)):
            rings.append([bm.verts.new((centre_x + dx * half, rear.co.y - 0.018 + dy * half, z)) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        for vert in rings[0] + rings[1]:
            for group, weight in rear[deform].items():
                vert[deform][group] = weight
        for i in range(4):
            bm.faces.new((rings[0][i], rings[0][(i + 1) % 4], rings[1][(i + 1) % 4], rings[1][i]))
        bm.faces.new(rings[1][::-1])
    bm.normal_update()
    bm.to_mesh(shoes.data)
    bm.free()
    shoes["skin_faces"] = skin_faces
    return shoes, round(math.degrees(angle), 1)


def finish_aodai(top, body, rig):
    """Áo dài trong tủ đồ: cổ tàu dựng bằng hình học + tay áo gán trọng số kiểu ống (Arm/ForeArm theo chiều dài tay) như sơ mi dài tay."""
    frame = aodai.Frame(body, rig)
    uniform.tube_sleeve_weights(top, frame)
    stand = collar.build_stand(top, body, frame)
    for name in aodai.FRONT_BONES + aodai.BACK_BONES:
        if name not in stand.vertex_groups:
            stand.vertex_groups.new(name=name)
    aodai._join(top, [stand])


def build_garments_f(body, rig, suits, hips_z):
    """Các món nữ, tất cả dựng theo thủ tục. Trả về ({tên lưới: đối tượng}, nguồn kết cấu MakeHuman)."""
    out = {}
    aodai.GEOMETRIC_COLLAR = True
    aodai.STYLES["teacher"] = dict(aodai.STYLES["teacher"], tube=0.0, ease=0.014)      # áo dài cách tân: bỏ dáng ống (bao tải), thân theo người, nới ~1,4 cm ở eo
    student = aodai.build(body, rig, "student")
    finish_aodai(student["top"], body, rig)
    out["top_aodai"], out["bottom_aodai"], out["shoes_dress"] = student["top"], student["bottom"], student["shoes"]
    add_bones = aodai.add_panel_bones
    aodai.add_panel_bones = lambda rig_, centres: None        # một vị trí chuẩn cho 8 xương tà: lấy của áo dài cổ tàu
    try:
        teacher = aodai.build(body, rig, "teacher")
        skirt_obj, _centres = skirt.build(body, rig)
    finally:
        aodai.add_panel_bones = add_bones
    finish_aodai(teacher["top"], body, rig)
    out["top_aodai_modern"] = teacher["top"]
    bpy.data.objects.remove(teacher["bottom"], do_unlink=True)
    out["shoes_heels"] = teacher["shoes"]            # giày cao gót 5 cm (people_aodai.raise_heels); build_pumps (dáng pump) chưa đạt nên chưa dùng
    out["shoes_sandals"] = build_sandals(body, rig)
    out["bottom_skirt_denim"] = skirt_obj
    plain = skirt_obj.copy()
    plain.data = skirt_obj.data.copy()
    bpy.context.scene.collection.objects.link(plain)
    out["bottom_skirt"] = plain
    out["top_uniform"] = uniform.build(body, rig, "girl")["top"]
    out["top_class"] = uniform.build(body, rig, "tee")["top"]
    out["top_polo"] = uniform.build(body, rig, "polo")["top"]
    out["bottom_trousers"] = procedural_trousers(body, rig, (0.084, 0.064), 0.035)
    out["bottom_jeans"] = procedural_trousers(body, rig, (0.09, 0.10), 0.03)      # ống rộng
    out["bottom_pe"] = procedural_trousers(body, rig, (0.086, 0.07), 0.035)
    return out, suit_tops(body, rig, suits, hips_z, out, "male_casualsuit05", "female_casualsuit01", "shirt_f")


def build_garments_m(body, rig, suits, hips_z):
    """Các món nam: ba áo dựng theo thủ tục (bỏ ngoài quần) + quần dài thủ tục ống suông."""
    out = {"top_uniform": uniform.build(body, rig, "boy")["top"], "top_polo": uniform.build(body, rig, "polo")["top"],
           "top_class": uniform.build(body, rig, "tee")["top"]}
    out["bottom_trousers"] = procedural_trousers(body, rig, (0.092, 0.07), 0.035)
    out["bottom_khaki"] = procedural_trousers(body, rig, (0.092, 0.07), 0.035)
    out["bottom_jeans"] = procedural_trousers(body, rig, (0.09, 0.066), 0.035)
    out["bottom_pe"] = procedural_trousers(body, rig, (0.094, 0.076), 0.035)
    out["shoes_sandals"] = build_sandals(body, rig)
    return out, suit_tops(body, rig, suits, hips_z, out, "male_casualsuit05", "male_casualsuit04", "shirt")


def cloth(meshes, name, source, mode, rough=0.85, double_sided=True):
    diffuse, normal, _color = mp.mhmat_textures(source)
    tex.set_material(meshes[name], name, tex.process(diffuse, mode, 1024), normal=tex.process(normal, "normal", 1024) if normal else None,
                     roughness=rough, double_sided=double_sided)


def materials_extra(meshes, sources):
    cloth(meshes, "top_jacket", sources["top_jacket"], "highpass")
    cloth(meshes, "top_pe", sources["top_pe"], "flat")
    tex.set_material(meshes["top_shirt"], "top_shirt", tex.uniform_atlas(mp.badge_image()), roughness=0.85, double_sided=True)
    tex.set_material(meshes["bottom_pe"], "bottom_pe", tex.fabric_tile("plain"), roughness=0.85, double_sided=True)


def materials_m(meshes, sources):
    materials_extra(meshes, sources)
    for name in ("top_uniform", "top_polo"):
        tex.set_material(meshes[name], name, tex.uniform_atlas(mp.badge_image()), roughness=0.85, double_sided=True)
    tex.set_material(meshes["top_class"], "top_class", tex.tee_atlas(*mp.tee_art_images()), roughness=0.85, double_sided=True)
    for name in ("bottom_trousers", "bottom_khaki"):
        tex.set_material(meshes[name], name, tex.fabric_tile("plain"), roughness=0.85, double_sided=True)
    tex.set_material(meshes["bottom_jeans"], "bottom_jeans", tex.fabric_tile("denim"), roughness=0.9, double_sided=True)
    cloth(meshes, "shoes_dress", sources["shoes_dress"], "flat", 0.5, False)
    cloth(meshes, "shoes_sneakers", sources["shoes_sneakers"], "flat", 0.6, False)
    tex.set_material(meshes["shoes_sandals"], "shoes_sandals", tex.fabric_tile("plain"), roughness=0.6, double_sided=True)


def materials_f(meshes, sources):
    materials_extra(meshes, sources)
    silk_base, silk_normal = tex.silk_maps()
    embroidery_base, embroidery_normal = tex.embroidery_maps()
    tex.set_material(meshes["top_aodai"], "top_aodai", silk_base, normal=silk_normal, roughness=0.5, double_sided=True)
    tex.set_material(meshes["top_aodai_modern"], "top_aodai_modern", embroidery_base, normal=embroidery_normal, roughness=0.5, double_sided=True)
    tex.set_material(meshes["bottom_aodai"], "bottom_aodai", silk_base, normal=silk_normal, roughness=0.5, double_sided=True)
    tex.set_material(meshes["bottom_skirt"], "bottom_skirt", silk_base, normal=silk_normal, roughness=0.85, double_sided=True)
    for name in ("bottom_skirt_denim", "bottom_jeans"):
        tex.set_material(meshes[name], name, tex.fabric_tile("denim"), roughness=0.9, double_sided=True)
    tex.set_material(meshes["shoes_dress"], "shoes_dress", silk_base, roughness=0.8)
    tex.set_material(meshes["shoes_heels"], "shoes_heels", silk_base, roughness=0.4)
    tex.set_material(meshes["shoes_sandals"], "shoes_sandals", tex.fabric_tile("plain"), roughness=0.6, double_sided=True)
    tex.set_material(meshes["top_uniform"], "top_uniform", tex.uniform_atlas(mp.badge_image()), roughness=0.85, double_sided=True)
    tex.set_material(meshes["top_polo"], "top_polo", tex.uniform_atlas(mp.badge_image()), roughness=0.85, double_sided=True)
    tex.set_material(meshes["top_class"], "top_class", tex.tee_atlas(*mp.tee_art_images()), roughness=0.85, double_sided=True)
    tex.set_material(meshes["bottom_trousers"], "bottom_trousers", tex.fabric_tile("plain"), roughness=0.85, double_sided=True)
    diffuse, normal, _color = mp.mhmat_textures(sources["shoes_sneakers"])
    tex.set_material(meshes["shoes_sneakers"], "shoes_sneakers", tex.process(diffuse, "flat", 1024), roughness=0.6)


def macro_coords(cfg, gender):
    """Toạ độ lưới gốc (đủ lưới trợ giúp) và độ cao khớp cổ của một lần dựng macro."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, rig = mp.create_body(cfg)
    TargetService.bake_targets(body)
    return aodai._coords(body), rig.data.bones[mp.BONE_PREFIX_OLD + "Neck"].head_local.z


def age_overrides(cfg, gender, base, neck_z):
    """Morph tuổi lấy từ chênh lệch giữa các lần dựng macro; canh lại theo vòng cổ để đầu không trôi khỏi cổ khi chiều cao đổi."""
    out = {"age_mid": np.zeros_like(base)}                 # gốc đã là 42 tuổi: age_mid không còn tác dụng (giữ tên cho runtime)
    ring = np.abs(base[:, 2] - neck_z) < 0.02
    for key, age in AGE_MACROS.items():
        other, other_neck = macro_coords(dict(cfg, age=age), gender)
        other_ring = np.abs(other[:, 2] - other_neck) < 0.02
        delta = other - base
        delta -= other[other_ring].mean(axis=0) - base[ring].mean(axis=0)
        out[key] = delta
    return out


def build(gender, out_dir):
    name = gender + "_wardrobe"
    cfg = BODIES[gender]
    faces.ADULT_MALE, faces.FACE_STRENGTH, tex.BEARD_SHADOW = True, 1.6, False      # mặt người lớn; sáu kiểu mặt mạnh hơn; skin đã có bóng râu
    base, base_neck = macro_coords(cfg, gender)
    overrides = age_overrides(cfg, gender, base, base_neck)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, rig = mp.create_body(cfg)
    mp.unify_bone_orientations(rig, name)
    hips_z = rig.data.bones[mp.BONE_PREFIX_OLD + "Hips"].head_local.z
    parts = {}
    for kind, asset, mesh_name, asset_type in (("eyes", "low-poly", "eyes", "Eyes"), ("eyebrows", cfg["eyebrows"], "eyebrows", "Eyebrows"),
                                               ("eyelashes", "eyelashes01", "eyelashes", "Eyelashes"), ("teeth", "teeth_base", "teeth", "Teeth")):
        parts[mesh_name] = mp.add_asset(body, kind, asset, asset_type)
    hair_meshes = []
    for i, (_code, asset, _steps) in enumerate(cfg["hair"]):
        if asset:
            parts["hair_%d" % i] = mp.add_asset(body, "hair", asset, "Hair")
            hair_meshes.append("hair_%d" % i)
    face_meshes = mp.FACE_MESHES + tuple(hair_meshes)
    shoe_assets, suit_names = ASSETS[gender]
    for mesh_name, asset in shoe_assets.items():
        parts[mesh_name] = mp.add_asset(body, "clothes", asset, "Clothes")
    suits = {suit_name: mp.add_asset(body, "clothes", suit_name, "Clothes") for suit_name in suit_names}
    TargetService.bake_targets(body)
    neck_z = rig.data.bones[mp.BONE_PREFIX_OLD + "Neck"].head_local.z
    face_data = faces.compute(body, neck_z, {n: parts[n] for n in face_meshes if n != "body"}, gender, overrides=overrides)
    frame = aodai.Frame(body, rig)

    garments, sources = (build_garments_f if gender == "f" else build_garments_m)(body, rig, suits, hips_z)
    sources.update({mesh_name: parts[mesh_name][1] for mesh_name in shoe_assets})
    for suit_obj, _path in suits.values():
        bpy.data.objects.remove(suit_obj, do_unlink=True)
    parts.update({mesh_name: (obj, None) for mesh_name, obj in garments.items()})

    mp.delete_vertices(body, ~mp.group_members(body, "body"))            # chỉ bỏ lưới trợ giúp; da giữ nguyên, runtime ẩn theo vùng
    face_info = head.split_face(body, rig, parts["eyes"][0], parts["eyelashes"][0])
    extras = []
    for i, (code, asset, _steps) in enumerate(cfg["hair"]):
        if asset is None:
            parts["hair_%d" % i] = (hairgen.build("hair_%d" % i, code, body, rig, parts["eyebrows"][0]), None)
            extras.append("hair_%d" % i)
    for i, (code, asset, _steps) in enumerate(cfg["hair"]):
        if asset and code in UNDERCOAT:
            parts["hair_%d_under" % i] = (hairgen.build("hair_%d_under" % i, "undercoat", body, rig, parts["eyebrows"][0]), None)
            extras.append("hair_%d_under" % i)
    marks = glasses.anchors(body, parts["eyes"][0])
    glasses_slots = {}
    for kind in range(len(glasses.KINDS)):
        obj, glasses_slots["glasses_%d" % kind] = glasses.build("glasses_%d" % kind, kind, body, marks)
        parts["glasses_%d" % kind] = (obj, None)
        extras.append("glasses_%d" % kind)
    mp.apply_decimate(parts["teeth"][0], mp.TEETH_DECIMATE_RATIO)
    head.add_mouth_cavity(parts["teeth"][0])
    meshes = {"body": body}
    meshes.update({mesh_name: obj for mesh_name, (obj, _path) in parts.items()})
    for mesh_name, obj in meshes.items():
        mp.finalize_mesh(obj, mesh_name, rig)

    # vật liệu: da + mặt, các lưới bám đầu, tóc, quần áo
    skin_diffuse, _normal, skin_color = mp.read_mhmat(mp.user_data("skins", cfg["skin"], cfg["skin"] + ".mhmat"))
    tex.set_material(body, "body", tex.process(skin_diffuse, "skin", tex.SKIN_SIZE, color=skin_color), roughness=0.55)
    tex.add_head_material(body, face_info["polygons"], *tex.head_maps(name, body.data.materials[0].node_tree.nodes["Image Texture"].image, face_info, gender == "f"))
    eye_source = mp.mhmat_textures(parts["eyes"][1])[0]
    tex.set_material(meshes["eyes"], "eyes", tex.eye_image(eye_source, head.eye_layout(meshes["eyes"])), roughness=0.12, glow=0.06)
    for mesh_name, mode, alpha, rough in (("teeth", "teeth", None, 0.25), ("eyebrows", "brow_m" if gender == "m" else "brow_f", "BLEND", 0.8),
                                          ("eyelashes", "lash", "BLEND", 0.8)):
        diffuse, _normal, _color = mp.mhmat_textures(parts[mesh_name][1])
        tex.set_material(meshes[mesh_name], mesh_name, tex.process(diffuse, mode, 512, keep_alpha=alpha is not None), alpha_mode=alpha,
                         roughness=rough, double_sided=alpha is not None, glow=0.08 if mesh_name == "teeth" else 0.0)
    strand_rects = {}
    for i, (_code, asset, _steps) in enumerate(cfg["hair"]):
        mesh_name = "hair_%d" % i
        if asset is None:
            hair_colour, hair_normal = tex.hair_atlas()
            tex.set_material(meshes[mesh_name], mesh_name, hair_colour, alpha_mode="MASK", normal=hair_normal, roughness=0.7)
            continue
        diffuse, _normal, _color = mp.mhmat_textures(parts[mesh_name][1])
        image, strand_rects[mesh_name] = tex.hair_image(diffuse, meshes[mesh_name])
        tex.set_material(meshes[mesh_name], mesh_name, image, alpha_mode="MASK", roughness=0.75, double_sided=True)
    (materials_f if gender == "f" else materials_m)(meshes, sources)

    skins = split_skin(meshes.pop("body"), frame)
    meshes.update(skins)
    for skin_obj in skins.values():
        faces.apply(skin_obj, *face_data["body"])
    for mesh_name in face_meshes:
        if mesh_name == "body":
            continue
        original, deltas = face_data[mesh_name]
        if mesh_name.startswith("hair_"):
            deltas = {key: (delta if key.startswith("face_") else delta * 0.0) for key, delta in deltas.items()}
        faces.apply(meshes[mesh_name], original, deltas, 0.002 if mesh_name.startswith("hair_") else faces.MOVED)
    frame_material, lens_material = tex.glasses_materials()
    for mesh_name in extras:
        faces.apply(meshes[mesh_name], *face_data["body"], 0.002 if mesh_name.startswith("hair_") else 0.0004)
        if mesh_name in glasses_slots:
            meshes[mesh_name].data.materials.append(frame_material)
            meshes[mesh_name].data.materials.append(lens_material)
            for polygon, slot in zip(meshes[mesh_name].data.polygons, glasses_slots[mesh_name]):
                polygon.material_index = slot
    for mesh_name in [n for n in meshes if n.endswith("_under")]:      # gộp lớp lót vào lưới tóc; UV đưa vào ô sợi tóc của kết cấu tóc đó
        under, target = meshes.pop(mesh_name), mesh_name[:-6]
        x0, y0, x1, y1 = strand_rects[target]
        for item in under.data.uv_layers[0].data:
            item.uv = (x0 + (x1 - x0) * item.uv[0], y0 + (y1 - y0) * item.uv[1])
        aodai._join(meshes[target], [under])
        meshes[target].name = meshes[target].data.name = target
    mp.push_along_normals(meshes["eyebrows"], mp.BROW_LIFT)
    mp.level_brows(meshes["eyebrows"], mp.BROW_LEVEL_DEGREES)
    recipe = {"hair_%d" % i: steps for i, (_code, asset, steps) in enumerate(cfg["hair"]) if asset and steps}
    hair_style.style(dict(meshes, body=skins["skin_head"]), rig, recipe, face_data, strand_rects)
    obstacles = [obj for mesh_name, obj in meshes.items() if mesh_name.startswith("top_")] + [skins["skin_head"], skins["skin_torso"]]
    for i in range(len(cfg["hair"])):
        hairfit.fit(meshes["hair_%d" % i], obstacles, rig)
        hairfit.settle_weights(meshes["hair_%d" % i], rig)
    mp.rename_bones(rig)
    rig.name = rig.data.name = "Armature"
    grounded = [obj for mesh_name, obj in meshes.items() if mesh_name not in ("shoes_heels", "shoes_sandals")]      # giày cao gót chúc mũi xuống dưới mặt đất: runtime nâng cả mô hình theo `lift`
    lowest = min((obj.matrix_world @ v.co).z for obj in grounded for v in obj.data.vertices)
    for obj in meshes.values():
        obj.data.transform(mp.Matrix.Translation((0.0, 0.0, -lowest)), shape_keys=True)
    rig.data.transform(mp.Matrix.Translation((0.0, 0.0, -lowest)))
    heel_lift = None
    if "shoes_heels" in meshes:
        heel_co = aodai._coords(meshes["shoes_heels"])
        heel_lift = round(float(-heel_co[:, 2].min()), 4)
        length = float(heel_co[:, 1].max() - heel_co[:, 1].min())
    mp.write_panel_bone_info(rig, out_dir, name)
    staging = os.path.join(out_dir, mp.STAGING_DIR)
    os.makedirs(staging, exist_ok=True)
    path = os.path.join(staging, name + ".glb")
    mp.export_glb(path)
    top = max((obj.matrix_world @ v.co).z for obj in skins.values() for v in obj.data.vertices)
    entry = {"file": name + ".glb", "height": round(top, 4), "hipsRestHeight": round(rig.data.bones["mixamorigHips"].head_local.z, 4),
             "hairStyles": [code for code, _asset, _steps in cfg["hair"]], "glasses": len(glasses.KINDS), "skin": list(SKIN_REGIONS),
             "tops": [], "bottoms": [], "shoes": []}
    prefix = {"tops": "top_", "bottoms": "bottom_", "shoes": "shoes_"}
    for group, item, label, hides, more in ITEMS[gender]:
        entry[group].append(dict({"id": item, "mesh": prefix[group] + item, "label": label, "hides": hides}, **more))
        if group == "shoes" and item == "sandals":
            entry[group][-1].update(lift=round(float(-aodai._coords(meshes["shoes_sandals"])[:, 2].min()), 4))
        if group == "shoes" and item == "heels":
            entry[group][-1].update(lift=heel_lift, footPitch=round(math.degrees(math.asin(min(0.05 / (0.68 * length), 0.7))), 1))
    print("XONG %s -> %s (%.2f MB)" % (name, path, os.path.getsize(path) / 1e6))
    return entry


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="f")
    parser.add_argument("--out", default=os.path.join(mp.ROOT, "assets", "people"))
    args = parser.parse_args(argv)
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)
    entries = {gender: build(gender, out_dir) for gender in args.only.split(",")}
    manifest_path = os.path.join(out_dir, "manifest.json")
    manifest = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    for gender, entry in entries.items():
        name = gender + "_wardrobe"
        os.replace(os.path.join(out_dir, mp.STAGING_DIR, name + ".glb"), os.path.join(out_dir, name + ".glb"))
        entry["bytes"] = os.path.getsize(os.path.join(out_dir, name + ".glb"))
        if name in manifest.get("aodaiBones", {}):
            entry["aodaiBones"] = manifest["aodaiBones"][name]["bones"]
        manifest.setdefault("wardrobe", {})[gender] = entry
    if not os.listdir(os.path.join(out_dir, mp.STAGING_DIR)):
        os.rmdir(os.path.join(out_dir, mp.STAGING_DIR))
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
