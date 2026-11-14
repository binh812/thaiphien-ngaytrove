"""Dựng bộ người 3D có xương bằng MPFB2 + tài nguyên CC0 của MakeHuman, xuất .glb cho three.js.

Chạy lại:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/make_people.py -- [--only m_white,f_pe] [--out assets/people]

Cần: MPFB2 đã cài vào Blender portable và tài nguyên MakeHuman đã nằm trong thư mục dữ liệu người dùng
của MPFB (xem tools/blender/mhpxy_to_mhclo.py). Quy cách đầu ra: xem assets/people/manifest.json.
"""
import argparse
import json
import math
import os
import shutil
import subprocess
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, kdtree

from bl_ext.user_default.mpfb.services import HumanService, LocationService, TargetService

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import people_textures as tex  # noqa: E402  (cùng thư mục với tệp này)
import people_aodai as aodai  # noqa: E402
import people_faces as faces  # noqa: E402
import people_hair as hair_style  # noqa: E402
import people_glasses as glasses  # noqa: E402
import people_hairfit as hairfit  # noqa: E402
import people_collar as collar  # noqa: E402
import people_hairgen as hairgen  # noqa: E402
import people_skirt as skirt  # noqa: E402
import people_head as head  # noqa: E402
import people_uniform as uniform  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BONE_PREFIX_OLD, BONE_PREFIX_NEW = "mixamorig:", "mixamorig"
RIG_NAME = "mixamo"
TEETH_DECIMATE_RATIO = 0.6
TORSO_HALF_WIDTH = 0.12      # m: vùng thân dùng để tìm mép vạt áo (bỏ qua tay áo)
TUCK_START, TUCK_RAMP, TUCK_SHRINK = 0.015, 0.04, 0.10
LONG_PANTS_MAX_HEM = 0.25    # m: gấu quần thấp hơn mức này thì coi là quần dài
WAIST_SKIN_MARGIN, WAIST_SKIN_HALF_WIDTH = 0.03, 0.30  # m: dải da eo bị che bởi cả áo lẫn quần
TOP_TIGHTEN, TIGHTEN_MIN_GAP = 0.3, 0.006   # tỉ lệ kéo áo về phía da; khe hở tối thiểu (m)
SHOE_OVERLAP = 0.03          # m: phần cổ giày giữ lại bên trong ống quần
FACE_MESHES = ("body", "eyes", "eyebrows", "eyelashes", "teeth")      # lưới bám đầu của MakeHuman (tóc MakeHuman được thêm theo từng nhân vật)
MORPH_NORMALS = True
BROW_LIFT = 0.0015            # m
REFERENCE_CHARACTER = "m_white"   # anims.glb được chuyển trên nhân vật này
RIG_REFERENCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rig_reference.json")
STAGING_DIR = "_staging"       # tệp .glb được xuất vào đây trước, xong hết mới chuyển ra
BROW_LEVEL_DEGREES = 8.0       # hạ đuôi mày chừng này để ra mày ngang (mày gốc xếch lên phía đuôi)
ASIAN = {"asian": 1.0, "caucasian": 0.0, "african": 0.0}

# Kiểu tóc theo thứ tự hair_0, hair_1, ...: (mã cho runtime, lưới tóc MakeHuman CC0 hoặc None = vỏ chân tóc tự dựng, các bước chỉnh people_hair)
MALE_HAIR = (("side", "short01", ()), ("crew", None, ()), ("fringe", "short02", ()), ("shaved", None, ()))
FEMALE_HAIR = (("bob", "bob01", ("slim", "cut_fringe")), ("long", "long01", ("press",)), ("braid", "braid01", ()),
               ("pixie", "short03", ("trim",)), ("bob_bangs", "bob02", ("trim",)), ("pony", "ponytail01", ()))
GIRL_STYLE = {"hair_0": ("press", "fringe"), "hair_1": ("babyhair",)}     # mái thưa rẽ ngôi giữa; đuôi ngựa có tóc con
WOMAN_STYLE = {"hair_0": ("wave",), "hair_1": ("bun", "babyhair")}        # dài gợn sóng; búi thấp sau gáy

# top/bottom: (bộ quần áo MakeHuman, kiểu khử màu kết cấu). shoes: tên tài nguyên giày.
CHARACTERS = {
    "m_white": dict(gender=1.0, age=0.40, height=0.60, weight=0.37, muscle=0.35, build="student", skin="young_asian_male", hair=MALE_HAIR, eyebrows="eyebrow001",
                    top=("uniform", "nobow"), bottom=("male_elegantsuit01", "flat"), shoes="shoes03"),
    "m_jacket": dict(gender=1.0, age=0.40, height=0.60, weight=0.37, muscle=0.35, build="student", skin="young_asian_male", hair=MALE_HAIR, eyebrows="eyebrow001",
                     top=("male_casualsuit05", "highpass"), bottom=("male_casualsuit05", "highpass"), shoes="shoes06"),
    "m_pe": dict(gender=1.0, age=0.40, height=0.60, weight=0.37, muscle=0.35, build="student", skin="young_asian_male", hair=MALE_HAIR, eyebrows="eyebrow001",
                 top=("male_casualsuit04", "flat"), bottom=("male_casualsuit04", "flat"), shoes="shoes05"),
    "m_teacher": dict(gender=1.0, age=0.66, height=0.55, weight=0.50, muscle=0.40, build="adult", skin="middleage_asian_male", hair=MALE_HAIR, eyebrows="eyebrow002",
                      top=("male_casualsuit03", "flat"), bottom=("male_elegantsuit01", "flat"), shoes="shoes01"),
    "f_white": dict(gender=0.0, age=0.42, height=0.60, weight=0.36, muscle=0.33, cupsize=0.35, build="student", skin="young_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                    top=("uniform", "bow"), bottom=("male_elegantsuit01", "flat"), shoes="shoes03"),
    "f_jacket": dict(gender=0.0, age=0.42, height=0.60, weight=0.36, muscle=0.33, cupsize=0.35, build="student", skin="young_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                     top=("male_casualsuit05", "highpass"), bottom=("female_casualsuit01", "highpass"), shoes="shoes05"),
    "f_pe": dict(gender=0.0, age=0.42, height=0.60, weight=0.36, muscle=0.33, cupsize=0.35, build="student", skin="young_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                 top=("female_casualsuit01", "flat"), bottom=("female_casualsuit01", "flat"), shoes="shoes06"),
    "f_teacher": dict(gender=0.0, age=0.62, height=0.53, weight=0.47, muscle=0.37, cupsize=0.42, build="adult", skin="middleage_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                      top=("female_elegantsuit01", "flat"), bottom=("male_elegantsuit01", "flat"), shoes="shoes03"),
    "f_aodai": dict(gender=0.0, age=0.56, height=0.56, weight=0.41, muscle=0.35, cupsize=0.40, build="adult", skin="middleage_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                    top=("aodai", "student"), bottom=("aodai", ""), shoes="aodai"),
    "m_class": dict(gender=1.0, age=0.40, height=0.60, weight=0.37, muscle=0.35, build="student", skin="young_asian_male", hair=MALE_HAIR, eyebrows="eyebrow001",
                    top=("tee", ""), bottom=("male_elegantsuit01", "flat"), shoes="shoes05", baked_top=True),
    "f_class": dict(gender=0.0, age=0.42, height=0.60, weight=0.36, muscle=0.33, cupsize=0.35, build="student", skin="young_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                    top=("tee", ""), bottom=("female_casualsuit01", "highpass"), shoes="shoes06", baked_top=True),
    "f_class_skirt": dict(gender=0.0, age=0.42, height=0.60, weight=0.36, muscle=0.33, cupsize=0.35, build="student", skin="young_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                          top=("tee", ""), bottom=("skirt", ""), shoes="shoes06", baked_top=True),
    "f_aodai_teacher": dict(gender=0.0, age=0.60, height=0.54, weight=0.40, muscle=0.34, cupsize=0.20, build="adult",
                            skin="middleage_asian_female", hair=FEMALE_HAIR, eyebrows="eyebrow005",
                            top=("aodai", "teacher"), bottom=("aodai", ""), shoes="aodai"),
}


def user_data(*parts):
    return os.path.join(LocationService.get_user_data(), *parts)


def asset_path(kind, name):
    path = user_data(kind, name, name + ".mhclo")
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    return path


def mhmat_textures(mhclo_file):
    """Trả về (đường dẫn diffuse, đường dẫn normal hoặc None) đọc từ .mhmat mà .mhclo trỏ tới."""
    folder = os.path.dirname(mhclo_file)
    mhmat = None
    with open(mhclo_file, encoding="utf-8") as f:
        for line in f:
            words = line.split()
            if len(words) == 2 and words[0] == "material":
                for base in (folder, LocationService.get_user_data()):
                    candidate = os.path.normpath(os.path.join(base, words[1]))
                    if os.path.isfile(candidate):
                        mhmat = candidate
    if mhmat is None:
        raise FileNotFoundError("Không thấy .mhmat cho " + mhclo_file)
    return read_mhmat(mhmat)


def read_mhmat(mhmat):
    found = {}
    with open(mhmat, encoding="utf-8") as f:
        for line in f:
            words = line.split()
            if len(words) >= 2 and words[0] in ("diffuseTexture", "normalmapTexture", "diffuseColor"):
                found[words[0]] = words[1:]
    folder = os.path.dirname(mhmat)
    diffuse = os.path.normpath(os.path.join(folder, found["diffuseTexture"][0]))
    normal = found.get("normalmapTexture")
    normal = os.path.normpath(os.path.join(folder, normal[0])) if normal else None
    color = tuple(float(c) for c in found.get("diffuseColor", ("1", "1", "1")))
    return diffuse, normal, color


# ---------------------------------------------------------------- dựng người bằng MPFB

def create_body(cfg):
    macro = TargetService.get_default_macro_info_dict()
    for key in ("gender", "age", "height", "weight", "muscle", "cupsize"):
        macro[key] = cfg.get(key, macro[key])
    macro["race"] = dict(ASIAN)
    body = HumanService.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True,
                                     feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
    faces.shape_base(body, "m" if cfg["gender"] > 0.5 else "f", cfg["build"])
    rig = HumanService.add_builtin_rig(body, RIG_NAME, import_weights=True)
    if rig is None:
        raise RuntimeError("MPFB không tạo được rig " + RIG_NAME)
    return body, rig


def unify_bone_orientations(rig, name):
    """Cho mọi nhân vật cùng hướng nghỉ của từng xương (lấy theo REFERENCE_CHARACTER, ghi ở rig_reference.json).
    anims.glb ghi phép quay cục bộ TUYỆT ĐỐI của nhân vật tham chiếu; nếu hướng nghỉ khác nhau giữa các tệp thì clip
    áp lên tệp khác sẽ bẻ lệch cột sống (đo được tới 40 độ ở Spine2 của nhân vật nữ). Vị trí khớp không đổi."""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    bones = rig.data.edit_bones
    if name == REFERENCE_CHARACTER:
        table = {b.name: [list(b.y_axis), list(b.z_axis)] for b in bones}
        with open(RIG_REFERENCE, "w", encoding="utf-8") as f:
            json.dump(table, f, indent=1)
    else:
        if not os.path.isfile(RIG_REFERENCE):
            bpy.ops.object.mode_set(mode="OBJECT")
            raise RuntimeError("Thiếu %s: hãy dựng %s trước" % (RIG_REFERENCE, REFERENCE_CHARACTER))
        with open(RIG_REFERENCE, encoding="utf-8") as f:
            table = json.load(f)
        for bone in bones:
            bone.use_connect = False
        for bone in bones:
            if bone.name not in table:
                raise RuntimeError("rig_reference.json thiếu xương " + bone.name)
            along, up = table[bone.name]
            bone.tail = bone.head + Vector(along) * bone.length
            bone.align_roll(Vector(up))
    bpy.ops.object.mode_set(mode="OBJECT")


def add_asset(body, kind, name, asset_type):
    path = asset_path(kind, name)
    obj = HumanService.add_mhclo_asset(path, body, asset_type=asset_type, subdiv_levels=0, material_type="MAKESKIN",
                                       import_subrig=False)  # không nhận xương phụ: chín tệp phải chung một bộ xương
    return obj, path


def vertex_components(mesh):
    """Nhãn mảnh liên thông cho từng đỉnh (union-find theo cạnh)."""
    parent = list(range(len(mesh.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for edge in mesh.edges:
        a, b = find(edge.vertices[0]), find(edge.vertices[1])
        if a != b:
            parent[a] = b
    return np.array([find(i) for i in range(len(parent))])


def part_mask(obj, part, hips_z):
    """Mặt nạ đỉnh của phần 'top' hoặc 'bottom' trong một bộ đồ liền: mảnh có trọng tâm dưới hông là quần/váy."""
    mesh = obj.data
    labels = vertex_components(mesh)
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    z = co.reshape(-1, 3)[:, 2]
    mask = np.zeros(len(z), dtype=bool)
    for label in np.unique(labels):
        members = labels == label
        is_bottom = z[members].mean() < hips_z
        if is_bottom == (part == "bottom"):
            mask |= members
    if not mask.any():
        raise RuntimeError("%s không có phần %s" % (obj.name, part))
    return mask


def extract_part(obj, mask, name):
    """Bản sao của obj chỉ giữ các đỉnh trong mask."""
    new = obj.copy()
    new.data = obj.data.copy()
    bpy.context.scene.collection.objects.link(new)
    bm = bmesh.new()
    bm.from_mesh(new.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not mask[v.index]], context="VERTS")
    bm.to_mesh(new.data)
    bm.free()
    new.name = new.data.name = name
    return new


def group_members(obj, group_name):
    group = obj.vertex_groups.get(group_name)
    if group is None:
        return np.zeros(len(obj.data.vertices), dtype=bool)
    index = group.index
    return np.array([any(g.group == index for g in v.groups) for v in obj.data.vertices])


def doomed_by_garment(body, garment, kept_mask, delete_group):
    """Đỉnh thân bị món đồ che: lấy nhóm Delete của MPFB, giới hạn vào vùng gần phần đồ thực sự được giữ."""
    doomed = group_members(body, delete_group)
    if kept_mask.all() or not doomed.any():
        return doomed
    tree = kdtree.KDTree(len(garment.data.vertices))
    for v in garment.data.vertices:
        tree.insert(v.co, v.index)
    tree.balance()
    for i in np.nonzero(doomed)[0]:
        _co, nearest, _dist = tree.find(body.data.vertices[i].co)
        doomed[i] = kept_mask[nearest]
    return doomed


def delete_vertices(obj, doomed):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if doomed[v.index]], context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()


def push_along_normals(obj, distance):
    """Đẩy cả lưới (và mọi shape key) ra theo pháp tuyến đỉnh — lông mày gốc nằm sát da nên bị da che gần hết."""
    normals = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("normal", normals)
    blocks = obj.data.shape_keys.key_blocks if obj.data.shape_keys else [obj.data.vertices]
    for block in blocks:
        data = block.data if hasattr(block, "data") else block
        co = np.empty(len(normals), dtype=np.float32)
        data.foreach_get("co", co)
        data.foreach_set("co", co + normals * distance)
    obj.data.update()


def level_brows(obj, degrees):
    """Xoay nghiêng từng bên mày quanh tâm của nó (hạ đuôi, nâng đầu) trên mọi shape key, cho mày nằm ngang."""
    slope = math.tan(math.radians(degrees))
    count = len(obj.data.vertices)
    base = np.empty(count * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", base)
    outward = np.abs(base.reshape(-1, 3)[:, 0])
    drop = (outward - outward.mean()) * slope
    blocks = obj.data.shape_keys.key_blocks if obj.data.shape_keys else [obj.data.vertices]
    for block in blocks:
        data = block.data if hasattr(block, "data") else block
        co = np.empty(count * 3, dtype=np.float32)
        data.foreach_get("co", co)
        co = co.reshape(-1, 3)
        co[:, 2] -= drop
        data.foreach_set("co", co.ravel())
    obj.data.update()


def apply_decimate(obj, ratio):
    modifier = obj.modifiers.new("Decimate", "DECIMATE")
    modifier.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def mesh_coords(obj):
    co = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def tuck_bottom_under_top(top, bottom):
    """Thu nhỏ phần cạp quần/váy nằm dưới vạt áo để vải quần không đâm xuyên qua áo bỏ ngoài."""
    top_co, co = mesh_coords(top), mesh_coords(bottom)
    torso = top_co[np.abs(top_co[:, 0]) < TORSO_HALF_WIDTH]
    hem_z = float(torso[:, 2].min())
    depth = np.clip((co[:, 2] - hem_z - TUCK_START) / TUCK_RAMP, 0.0, 1.0)
    if not (depth > 0).any():
        return
    centre_y = float(co[depth > 0, 1].mean())
    scale = 1.0 - TUCK_SHRINK * depth
    co[:, 0] *= scale
    co[:, 1] = centre_y + (co[:, 1] - centre_y) * scale
    bottom.data.vertices.foreach_set("co", co.ravel())
    bottom.data.update()


def skin_between_garments(body, top, bottom):
    """Da vùng eo nằm dưới cả vạt áo lẫn cạp quần (không thuộc nhóm Delete nào khi ghép áo và quần khác bộ)."""
    co, top_co, bottom_co = mesh_coords(body), mesh_coords(top), mesh_coords(bottom)
    hem_z = float(top_co[np.abs(top_co[:, 0]) < TORSO_HALF_WIDTH][:, 2].min())
    waistband_z = float(bottom_co[:, 2].max())
    return (co[:, 2] > hem_z - WAIST_SKIN_MARGIN) & (co[:, 2] < waistband_z) & (np.abs(co[:, 0]) < WAIST_SKIN_HALF_WIDTH)


def tighten(garment, body, factor):
    """Kéo áo lại gần da một phần khoảng cách (áo MakeHuman may rộng), giữ khe hở tối thiểu."""
    skin = mesh_coords(body)[group_members(body, "body")]
    tree = kdtree.KDTree(len(skin))
    for i, co in enumerate(skin):
        tree.insert(co, i)
    tree.balance()
    co = mesh_coords(garment)
    hem_z = float(co[np.abs(co[:, 0]) < TORSO_HALF_WIDTH][:, 2].min())
    for i in range(len(co)):
        nearest, _index, distance = tree.find(co[i])
        if distance > TIGHTEN_MIN_GAP:
            fade = min(1.0, max(0.0, (co[i, 2] - hem_z - 0.03) / 0.08))   # không kéo mép vạt áo, kẻo vạt lượn sóng
            pull = min(factor * fade, 1.0 - TIGHTEN_MIN_GAP / distance)
            co[i] += (np.array(nearest) - co[i]) * pull
    garment.data.vertices.foreach_set("co", co.ravel())
    garment.data.update()


def trim_shoes_under_pants(shoes, bottom):
    """Cắt cổ tất/cổ giày nằm trong ống quần dài (nếu không sẽ lòi qua vải quần bó)."""
    hem_z = float(mesh_coords(bottom)[:, 2].min())
    if hem_z > LONG_PANTS_MAX_HEM:
        return
    delete_vertices(shoes, mesh_coords(shoes)[:, 2] > hem_z + SHOE_OVERLAP)


# ---------------------------------------------------------------- dọn dẹp, vật liệu, xuất

def finalize_mesh(obj, name, rig):
    """Đặt tên, bỏ modifier ngoài Armature, bỏ nhóm đỉnh không phải xương, bỏ vật liệu cũ."""
    obj.name = obj.data.name = name
    for modifier in list(obj.modifiers):
        if modifier.type != "ARMATURE":
            obj.modifiers.remove(modifier)
    if not any(m.type == "ARMATURE" for m in obj.modifiers):
        raise RuntimeError(name + " không có modifier Armature")
    bones = set(rig.data.bones.keys())
    for group in list(obj.vertex_groups):
        if group.name not in bones:
            obj.vertex_groups.remove(group)
    if obj.data.shape_keys:
        raise RuntimeError(name + " còn shape key")
    obj.data.materials.clear()
    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.parent = rig


def rename_bones(rig):
    for bone in rig.data.bones:
        if bone.name.startswith(BONE_PREFIX_OLD):
            bone.name = BONE_PREFIX_NEW + bone.name[len(BONE_PREFIX_OLD):]


def put_feet_on_ground(rig, meshes):
    lowest = min((obj.matrix_world @ v.co).z for obj in meshes for v in obj.data.vertices)
    shift = Matrix.Translation((0.0, 0.0, -lowest))
    for obj in meshes:
        obj.data.transform(shift, shape_keys=True)
    rig.data.transform(shift)
    return lowest


def write_panel_bone_info(rig, out_dir, name):
    """Ghi thông số xương tà áo dài vào manifest.json (hệ glTF: Y lên, mặt nhìn về +Z, mét)."""
    to_gltf = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]  # noqa: E731
    bones = []
    for bone in rig.data.bones:
        if not bone.name.startswith("aodai"):
            continue
        lateral = bone.matrix_local.to_3x3() @ Vector((0.0, 0.0, 1.0))        # trục Z cục bộ của xương, nằm ngang
        swung = Matrix.Rotation(0.1, 3, lateral) @ (bone.tail_local - bone.head_local)
        forward = 1 if swung.y < (bone.tail_local - bone.head_local).y else -1  # mặt trước là -Y của Blender
        bones.append({"name": bone.name, "parent": bone.parent.name, "head": to_gltf(bone.head_local),
                      "tail": to_gltf(bone.tail_local), "swingAxisLocal": "z", "forwardSign": forward})
    manifest_path = os.path.join(out_dir, "manifest.json")
    manifest = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    per_file = manifest.get("aodaiBones", {})
    if "bones" in per_file:   # dạng cũ (một mục chung) -> dạng mới theo tên tệp
        per_file = {}
    per_file[name] = {
        "file": name + ".glb", "bones": bones,
        "note": "Trục dọc xương là +Y cục bộ. Quay quanh trục Z cục bộ một góc (forwardSign × góc dương) thì tà hất ra "
                "phía trước (+Z của glTF). Trục X cục bộ vuông góc với mặt tà. anims.glb không có track cho các xương này.",
    }
    manifest["aodaiBones"] = per_file
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


def write_meta(out_dir, name, values):
    """Ghi thông tin riêng của một tệp (hairStyles, bakedTop...) vào manifest.json; preview_people.py giữ lại các khoá này."""
    manifest_path = os.path.join(out_dir, "manifest.json")
    manifest = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    manifest.setdefault("files", {}).setdefault(name, {}).update(values)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


def export_glb(path):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, export_apply=False, export_skins=True,
        export_cameras=False, export_lights=False, export_animations=False,
        export_morph=True, export_morph_normal=MORPH_NORMALS, export_morph_tangent=False, export_try_sparse_sk=True,
        export_image_format="AUTO", export_image_quality=tex.JPEG_QUALITY, export_tangents=False,
        export_all_influences=False, export_extras=False)


def build_character(name, cfg, out_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, rig = create_body(cfg)
    unify_bone_orientations(rig, name)
    hips_z = rig.data.bones[BONE_PREFIX_OLD + "Hips"].head_local.z

    parts = {}
    for kind, asset, mesh_name, asset_type in (("eyes", "low-poly", "eyes", "Eyes"), ("eyebrows", cfg["eyebrows"], "eyebrows", "Eyebrows"),
                                               ("eyelashes", "eyelashes01", "eyelashes", "Eyelashes"), ("teeth", "teeth_base", "teeth", "Teeth")):
        parts[mesh_name] = add_asset(body, kind, asset, asset_type)
    hair_meshes = []
    for i, (_code, asset, _steps) in enumerate(cfg["hair"]):
        if asset:
            parts["hair_%d" % i] = add_asset(body, "hair", asset, "Hair")
            hair_meshes.append("hair_%d" % i)
    face_meshes = FACE_MESHES + tuple(hair_meshes)
    is_aodai = cfg["top"][0] == "aodai"
    if not is_aodai:
        parts["shoes"] = add_asset(body, "clothes", cfg["shoes"], "Clothes")

    suits = {}
    for suit_name in {cfg["top"][0], cfg["bottom"][0]} - {"aodai", "uniform", "tee", "skirt"}:  # áo dài không dùng bộ đồ MakeHuman nào
        suits[suit_name] = add_asset(body, "clothes", suit_name, "Clothes")
    TargetService.bake_targets(body)
    neck_z = rig.data.bones[BONE_PREFIX_OLD + "Neck"].head_local.z
    face_data = faces.compute(body, neck_z, {n: parts[n] for n in face_meshes if n != "body"}, "m" if cfg["gender"] > 0.5 else "f")

    doomed = ~group_members(body, "body")
    if is_aodai:
        outfit = aodai.build(body, rig, cfg["top"][1])
        collar.tidy_stand(outfit["top"], body, aodai.Frame(body, rig), aodai.COLLAR_HEIGHT)
        doomed |= outfit.pop("covered")
        fabric = outfit.pop("fabric")
        parts.update({mesh_name: (obj, None) for mesh_name, obj in outfit.items()})
    else:
        doomed |= group_members(body, "Delete." + cfg["shoes"])
    garment_tex = {}
    for part in ("top", "bottom"):
        suit_name, mode = cfg[part]
        if is_aodai:
            continue
        if suit_name == "skirt":
            skirt_obj, skirt_centres = skirt.build(body, rig)
            aodai.add_panel_bones(rig, skirt_centres)
            parts[part] = (skirt_obj, None)
            continue
        if suit_name in ("uniform", "tee"):
            shirt = uniform.build(body, rig, "tee" if suit_name == "tee" else ("girl" if mode == "bow" else "boy"))
            doomed |= shirt["covered"]
            parts[part] = (shirt["top"], None)
            continue
        suit_obj, suit_path = suits[suit_name]
        mask = part_mask(suit_obj, part, hips_z)
        doomed |= doomed_by_garment(body, suit_obj, mask, "Delete." + suit_name)
        parts[part] = (extract_part(suit_obj, mask, part), suit_path)
        garment_tex[part] = (suit_path, mode)
    for suit_obj, _path in suits.values():
        bpy.data.objects.remove(suit_obj, do_unlink=True)

    if not is_aodai:
        if cfg["top"][0] not in ("uniform", "tee"):
            tighten(parts["top"][0], body, TOP_TIGHTEN)
        if cfg["bottom"][0] != "skirt":
            doomed |= skin_between_garments(body, parts["top"][0], parts["bottom"][0])
            tuck_bottom_under_top(parts["top"][0], parts["bottom"][0])
            trim_shoes_under_pants(parts["shoes"][0], parts["bottom"][0])
    delete_vertices(body, doomed)
    face_info = head.split_face(body, rig, parts["eyes"][0], parts["eyelashes"][0])
    extras = []                                          # tóc và kính: morph mặt lấy theo đỉnh da gần nhất
    for i, (code, asset, _steps) in enumerate(cfg["hair"]):
        if asset is None:
            parts["hair_%d" % i] = (hairgen.build("hair_%d" % i, code, body, rig, parts["eyebrows"][0]), None)
            extras.append("hair_%d" % i)
    marks = glasses.anchors(body, parts["eyes"][0])
    glasses_slots = {}
    for kind in range(len(glasses.KINDS)):
        obj, glasses_slots["glasses_%d" % kind] = glasses.build("glasses_%d" % kind, kind, body, marks)
        parts["glasses_%d" % kind] = (obj, None)
        extras.append("glasses_%d" % kind)
    apply_decimate(parts["teeth"][0], TEETH_DECIMATE_RATIO)
    head.add_mouth_cavity(parts["teeth"][0])
    meshes = {"body": body}
    meshes.update({mesh_name: obj for mesh_name, (obj, _path) in parts.items()})
    for mesh_name, obj in meshes.items():
        finalize_mesh(obj, mesh_name, rig)

    strand_rects = assign_materials(meshes, parts, garment_tex, cfg, fabric if is_aodai else None)
    tex.add_head_material(body, face_info["polygons"], *tex.head_maps(name, body.data.materials[0].node_tree.nodes["Image Texture"].image, face_info, cfg["gender"] < 0.5))
    for mesh_name in face_meshes:
        original, deltas = face_data[mesh_name]
        if mesh_name.startswith("hair_"):      # tóc chỉ theo sáu kiểu mặt; biểu cảm / tuổi không làm tóc đổi (tệp nhẹ hơn nhiều)
            deltas = {key: (delta if key.startswith("face_") else delta * 0.0) for key, delta in deltas.items()}
        error = faces.max_mapping_error(meshes[mesh_name], original)
        if mesh_name != "teeth" and error > faces.EXACT_MATCH:  # răng đã rút gọn nên chỉ khớp gần đúng
            raise RuntimeError("%s: đỉnh lệch %.4f m so với lưới gốc, không gắn shape key được" % (mesh_name, error))
        faces.apply(meshes[mesh_name], original, deltas, 0.002 if mesh_name.startswith("hair_") else faces.MOVED)
    frame_material, lens_material = tex.glasses_materials()
    for mesh_name in extras:
        faces.apply(meshes[mesh_name], *face_data["body"], 0.002 if mesh_name.startswith("hair_") else 0.0004)
        if mesh_name in glasses_slots:
            meshes[mesh_name].data.materials.append(frame_material)
            meshes[mesh_name].data.materials.append(lens_material)
            for polygon, slot in zip(meshes[mesh_name].data.polygons, glasses_slots[mesh_name]):
                polygon.material_index = slot
    push_along_normals(meshes["eyebrows"], BROW_LIFT)
    level_brows(meshes["eyebrows"], BROW_LEVEL_DEGREES)
    recipe = {"hair_%d" % i: steps for i, (_code, asset, steps) in enumerate(cfg["hair"]) if asset and steps}
    hair_style.style(meshes, rig, recipe, face_data, strand_rects)
    obstacles = [meshes[n] for n in ("top", "body", "bottom")]
    for i in range(len(cfg["hair"])):     # tóc nằm ngoài áo / cổ áo / thân; tóc không theo xương tay
        hair = meshes["hair_%d" % i]
        moved = hairfit.fit(hair, obstacles, rig)
        hairfit.settle_weights(hair, rig)
        print("TOC %s hair_%d: dời %d đỉnh ra ngoài áo" % (name, i, moved))
    rename_bones(rig)
    rig.name = rig.data.name = "Armature"
    put_feet_on_ground(rig, list(meshes.values()))
    if is_aodai or cfg["bottom"][0] == "skirt":
        write_panel_bone_info(rig, out_dir, name)
    write_meta(out_dir, name, {"hairStyles": [code for code, _asset, _steps in cfg["hair"]], "glasses": len(glasses.KINDS), "bakedTop": bool(cfg.get("baked_top"))})
    staging = os.path.join(out_dir, STAGING_DIR)
    os.makedirs(staging, exist_ok=True)
    path = os.path.join(staging, name + ".glb")
    export_glb(path)
    print("XONG %s -> %s (%.2f MB)" % (name, path, os.path.getsize(path) / 1e6))


def badge_image():
    """Đường dẫn ảnh phù hiệu; chưa có thì gọi Python hệ thống (có Pillow) chạy make_badge.py."""
    path = os.path.join(tex.CACHE_DIR, "badge_thaiphien_v2.png")
    if not os.path.isfile(path):
        python = shutil.which("python") or shutil.which("py")
        if python is None:
            raise RuntimeError("Không tìm thấy Python hệ thống để vẽ phù hiệu; hãy chạy tools/blender/make_badge.py " + path)
        os.makedirs(tex.CACHE_DIR, exist_ok=True)
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_badge.py")
        subprocess.run([python, "-I", script, path], check=True)
    return path


def tee_art_images():
    """Đường dẫn hai hình in áo lớp; chưa có thì gọi Python hệ thống (có Pillow) chạy make_tee_art.py."""
    logo = os.path.join(tex.CACHE_DIR, "tee_logo_v1.png")
    art = os.path.join(tex.CACHE_DIR, "tee_art_v1.png")
    if not (os.path.isfile(logo) and os.path.isfile(art)):
        python = shutil.which("python") or shutil.which("py")
        if python is None:
            raise RuntimeError("Không tìm thấy Python hệ thống để vẽ hình in áo lớp")
        os.makedirs(tex.CACHE_DIR, exist_ok=True)
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_tee_art.py")
        subprocess.run([python, "-I", script, logo, art] + [str(round(c * 255)) for c in tex.TEE_YELLOW], check=True)
    return logo, art


def assign_materials(meshes, parts, garment_tex, cfg, fabric):
    """Gán vật liệu cho mọi lưới; trả về {tên lưới tóc: ô sợi tóc trong kết cấu} cho people_hair."""
    strand_rects = {}
    skin_diffuse, _normal, skin_color = read_mhmat(user_data("skins", cfg["skin"], cfg["skin"] + ".mhmat"))
    tex.set_material(meshes["body"], "body", tex.process(skin_diffuse, "skin", tex.SKIN_SIZE, color=skin_color), roughness=0.55)
    eye_source = mhmat_textures(parts["eyes"][1])[0]
    tex.set_material(meshes["eyes"], "eyes", tex.eye_image(eye_source, head.eye_layout(meshes["eyes"])), roughness=0.12, glow=0.06)
    for mesh_name, mode, size, alpha, rough in (("teeth", "teeth", 512, None, 0.25),
                                                ("eyebrows", "brow_m" if cfg["gender"] > 0.5 else "brow_f", 512, "BLEND", 0.8), ("eyelashes", "lash", 512, "BLEND", 0.8),
                                                ("shoes", "flat" if cfg.get("baked_top") else "copy", 1024, None, 0.6)):
        if parts[mesh_name][1] is None:
            continue
        diffuse, normal, _color = mhmat_textures(parts[mesh_name][1])
        normal_img = tex.process(normal, "normal", 1024) if (normal and mesh_name == "shoes") else None
        tex.set_material(meshes[mesh_name], mesh_name, tex.process(diffuse, mode, size, keep_alpha=alpha is not None),
                         alpha_mode=alpha, normal=normal_img, roughness=rough, double_sided=alpha is not None,
                         glow=0.08 if mesh_name == "teeth" else 0.0)
    for i, (_code, asset, _steps) in enumerate(cfg["hair"]):
        mesh_name = "hair_%d" % i
        if asset is None:
            hair_colour, hair_normal = tex.hair_atlas()
            tex.set_material(meshes[mesh_name], mesh_name, hair_colour, alpha_mode="MASK", normal=hair_normal, roughness=0.7, double_sided=False)
            continue
        diffuse, _normal, _color = mhmat_textures(parts[mesh_name][1])
        image, strand_rects[mesh_name] = tex.hair_image(diffuse, meshes[mesh_name])
        tex.set_material(meshes[mesh_name], mesh_name, image, alpha_mode="MASK", roughness=0.75, double_sided=True)
    if cfg["top"][0] == "aodai":   # áo dài: lụa trơn xám sáng + normal map lụa dùng chung cho áo, quần; giày vải không normal
        silk_base, silk_normal = tex.silk_maps()
        top_base, top_normal = tex.embroidery_maps() if fabric == "embroidered" else (silk_base, silk_normal)
        tex.set_material(meshes["top"], "top", top_base, normal=top_normal, roughness=0.5, double_sided=True)
        tex.set_material(meshes["bottom"], "bottom", silk_base, normal=silk_normal, roughness=0.5, double_sided=True)
        tex.set_material(meshes["shoes"], "shoes", silk_base, roughness=0.8)
        return strand_rects
    for part in ("top", "bottom"):
        if cfg[part][0] == "skirt":   # chân váy: vải xám trơn có vân dệt (runtime tô màu bò)
            silk_base, silk_normal = tex.silk_maps()
            tex.set_material(meshes[part], part, silk_base, normal=silk_normal, roughness=0.85, double_sided=True)
            continue
        if cfg[part][0] == "tee":     # áo phông lớp: màu và hình in nằm sẵn trong kết cấu
            tex.set_material(meshes[part], part, tex.tee_atlas(*tee_art_images()), roughness=0.85, double_sided=True)
            continue
        if part not in garment_tex:   # áo đồng phục dựng theo thủ tục: atlas có viền cổ, viền tay, nơ, phù hiệu
            tex.set_material(meshes[part], part, tex.uniform_atlas(badge_image()), roughness=0.85, double_sided=True)
            continue
        suit_path, mode = garment_tex[part]
        diffuse, normal, _color = mhmat_textures(suit_path)
        normal_img = tex.process(normal, "normal", 1024) if normal else None
        tex.set_material(meshes[part], part, tex.process(diffuse, mode, 1024), normal=normal_img, roughness=0.85, double_sided=True)
    return strand_rects


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="", help="danh sách tên cách nhau dấu phẩy; bỏ trống = tất cả")
    parser.add_argument("--out", default=os.path.join(ROOT, "assets", "people"))
    args = parser.parse_args(argv)
    names = [n for n in args.only.split(",") if n] or list(CHARACTERS)
    os.makedirs(args.out, exist_ok=True)
    out_dir = os.path.abspath(args.out)
    for name in names:
        build_character(name, CHARACTERS[name], out_dir)
    for name in names:   # đổi tên một lần ở cuối để trình duyệt đang chạy không đọc phải tệp xuất dở
        os.replace(os.path.join(out_dir, STAGING_DIR, name + ".glb"), os.path.join(out_dir, name + ".glb"))
    if not os.listdir(os.path.join(out_dir, STAGING_DIR)):
        os.rmdir(os.path.join(out_dir, STAGING_DIR))


if __name__ == "__main__":
    main()
