"""Soát tủ đồ: nạp <giới>_wardrobe.glb, bật từng tổ hợp (áo, quần/váy, giày, tóc) theo manifest.wardrobe, ẩn các lưới da bị che,
chụp toàn thân trước + sau; đồng thời đếm đỉnh quần/váy lòi ra ngoài áo ở vài tư thế.

Chạy: blender -b -P tools/blender/preview_wardrobe.py -- [--dir assets/people] [--gender f] [--prefix v16_wardrobe]
Ảnh: <dir>/_preview/<prefix>_<giới>.png (mỗi ô: trước | sau). Bảng xuyên: in ra và ghi <dir>/../../.tools/build/wardrobe_<giới>.json
"""
import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import measure_hair as mh  # noqa: E402
import preview_anims as pa  # noqa: E402
import preview_hang as ph  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = (300, 640)
COMBOS = {"f": [("class", "trousers", "sneakers", 0), ("class", "skirt_denim", "sneakers", 3), ("class", "aodai", "dress", 4), ("class", "skirt", "dress", 5),
                ("uniform", "trousers", "dress", 1), ("uniform", "skirt", "sneakers", 2), ("uniform", "skirt_denim", "dress", 0), ("uniform", "aodai", "dress", 3),
                ("aodai", "aodai", "dress", 1), ("class", "jeans", "sneakers", 5), ("aodai_modern", "aodai", "dress", 4), ("uniform", "jeans", "dress", 2),
                ("shirt", "trousers", "dress", 0), ("shirt", "skirt", "dress", 1), ("jacket", "trousers", "sneakers", 3), ("jacket", "skirt_denim", "sneakers", 4),
                ("pe", "pe", "sneakers", 5), ("pe", "jeans", "sneakers", 2), ("polo", "jeans", "sneakers", 5), ("polo", "skirt", "dress", 3), ("aodai_modern", "aodai", "heels", 0), ("shirt", "skirt", "heels", 1), ("polo", "skirt_denim", "sandals", 0),
                ("jacket", "skirt", "dress", 2), ("jacket", "skirt_denim", "sneakers", 3)],
          "m": [(t, b, s, h) for h, (t, b, s) in enumerate([("uniform", "trousers", "dress"), ("uniform", "jeans", "sneakers"), ("uniform", "khaki", "dress"),
                ("class", "trousers", "sneakers"), ("class", "jeans", "sneakers"), ("class", "khaki", "sneakers"), ("polo", "trousers", "dress"), ("polo", "jeans", "sneakers"),
                ("polo", "khaki", "dress"), ("shirt", "trousers", "dress"), ("shirt", "jeans", "sneakers"), ("shirt", "khaki", "dress"),
                ("jacket", "trousers", "sneakers"), ("jacket", "jeans", "sneakers"), ("pe", "pe", "sneakers"), ("pe", "khaki", "sandals")])]}
RAISE = (("LeftArm", "Y", -120), ("RightArm", "Y", 120))
STRIDE = (("LeftUpLeg", "X", -32), ("LeftLeg", "X", 18), ("RightUpLeg", "X", 24), ("RightLeg", "X", 30))


def hex_rgb(text):
    value = [int(text[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) / 0.88 for c in value)


def turn(character, steps):
    for bone_name, axis, degrees in steps:
        bone = character.pose.bones["mixamorig" + bone_name]
        pivot = character.matrix_world @ bone.matrix.to_translation()
        spin = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-pivot)
        bone.matrix = character.matrix_world.inverted() @ spin @ character.matrix_world @ bone.matrix
        bpy.context.view_layer.update()


def pose(character, state):
    for bone in character.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    if state == "buong":
        for side, sign in (("Left", 1.0), ("Right", -1.0)):
            ph.point_bone(character, "mixamorig%sArm" % side, ph.to_blender(ph.ARM, side))
            ph.point_bone(character, "mixamorig%sForeArm" % side, ph.to_blender(ph.FOREARM, side), ph.TWIST * sign)
    elif state == "gio":
        turn(character, RAISE)
    elif state == "buoc":
        turn(character, STRIDE)
    elif state == "dung":      # dáng đứng của runtime: buông tay + một chân chùng (đùi đưa ra trước 6 độ)
        pose(character, "buong")
        turn(character, (("LeftUpLeg", "X", -6), ("LeftLeg", "X", 8)))
    elif state == "khuyu":
        turn(character, (("LeftForeArm", "Y", 90), ("RightForeArm", "Y", -90)))


def poke(top, bottom, hem_z, rest_z):
    """Số đỉnh quần/váy (phần nằm trên gấu áo ở tư thế nghỉ) lòi ra ngoài bề mặt áo quá 1,5 mm."""
    tree = mh.tree_of(top)
    co, _polygons = mh.evaluated(bottom)
    chosen = np.nonzero(rest_z > hem_z + 0.015)[0]
    count = 0
    for i in chosen:
        hit, normal, _index, distance = tree.find_nearest(Vector(co[i]), 0.05)
        if hit is None:
            continue
        offset = Vector(co[i]) - hit
        depth = offset.dot(normal)
        if abs(hit.x) > 0.1 and normal.x * hit.x < -0.02 * abs(hit.x):      # mặt tay áo quay vào hông (tay buông): không phải thân áo, bỏ qua
            continue
        if (offset - normal * depth).length < 0.004 and depth > 0.0015:
            count += 1
    return count, len(chosen)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--gender", default="f")
    parser.add_argument("--prefix", default="v16_wardrobe")
    parser.add_argument("--zoom", action="store_true", help="chụp cận nửa thân trên")
    parser.add_argument("--feet", action="store_true", help="chụp cận chân, góc thấp")
    parser.add_argument("--state", default="nghi", help="tư thế khi chụp: nghi | buong | gio | buoc")
    parser.add_argument("--tops", default="", help="chỉ chụp các tổ hợp có áo này (cách nhau dấu phẩy)")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    with open(os.path.join(directory, "manifest.json"), encoding="utf-8") as f:
        wardrobe = json.load(f)["wardrobe"][args.gender]
    scene, camera = pp.setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, wardrobe["file"]), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = {o.name: o for o in scene.objects if o.type == "MESH"}
    items = {group: {item["id"]: item for item in wardrobe[group]} for group in ("tops", "bottoms", "shoes")}
    for group in items.values():
        for item in group.values():
            if not item.get("baked"):
                pp.tint_material(meshes[item["mesh"]].material_slots[0].material, hex_rgb(item["tint"]))
    combos = [c for c in COMBOS[args.gender] if not args.tops or c[0] in args.tops.split(",")]
    hair_count = len(wardrobe["hairStyles"])
    sheet = np.full((3 * CELL[1], len(combos) * CELL[0], 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    tmp = os.path.join(bpy.app.tempdir, "wardrobe_cell.png")
    table = {}
    for column, (top, bottom, shoes, hair) in enumerate(combos):
        worn = [items["tops"][top], items["bottoms"][bottom], items["shoes"][shoes]]
        hidden = {name for item in worn for name in item["hides"]}
        shown = {item["mesh"] for item in worn}
        for name, obj in meshes.items():
            if name.startswith("skin_"):
                obj.hide_render = name in hidden
            elif name.startswith(("top_", "bottom_", "shoes_")):
                obj.hide_render = name not in shown
            elif name.startswith("hair_"):
                obj.hide_render = name != "hair_%d" % (hair % hair_count)
            elif name.startswith("glasses_"):
                obj.hide_render = not (column % 4 == 1 and name == "glasses_%d" % (column % 3))
        pose(character, args.state)
        for row, (x, y) in enumerate(((0.0, -4.4), (0.0, 4.4), (3.1, -3.1))):
            if args.feet:
                pp.aim(camera, (x * 0.3, y * 0.3, 0.12), (0.0, 0.0, 0.13), 85)
            elif args.zoom:
                pp.aim(camera, (x * 0.5, y * 0.5, 1.3), (0.0, 0.0, 1.22), 85)
            else:
                pp.aim(camera, (x, y, 0.95), (0.0, 0.0, 0.82), 85)
            pp.render(scene, tmp, CELL[0], CELL[1])
            y0 = (2 - row) * CELL[1]
            sheet[y0:y0 + CELL[1], column * CELL[0]:(column + 1) * CELL[0]] = pa.read_pixels(tmp)
        top_obj, bottom_obj = meshes[items["tops"][top]["mesh"]], meshes[items["bottoms"][bottom]["mesh"]]
        top_co, _p = mh.evaluated(top_obj)
        torso = top_co[np.abs(top_co[:, 0]) < 0.12]
        hem_z = float(torso[:, 2].min()) if "aodai" not in top else float(np.percentile(torso[:, 2], 55))
        rest_z = mh.evaluated(bottom_obj)[0][:, 2]
        row = {}
        for state in ("nghi", "buong", "gio", "buoc"):
            pose(character, state)
            row[state] = poke(top_obj, bottom_obj, hem_z, rest_z)[0]
        table["%s + %s" % (top, bottom)] = row
        print("XUYEN %-28s %s" % ("%s + %s" % (top, bottom), row))
    out = bpy.data.images.new("wardrobe", sheet.shape[1], sheet.shape[0], alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (args.prefix, args.gender))
    out.file_format = "PNG"
    out.save()
    with open(os.path.join(pp.ROOT, ".tools", "build", "wardrobe_%s.json" % args.gender), "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, indent=1)
    print("SOAT tủ đồ ->", out.filepath_raw)


if __name__ == "__main__":
    main()
