"""Soát cận mặt sau khi nạp lại .glb: lưới ảnh (hàng = trạng thái morph, cột = góc nhìn).

Chạy: blender -b -P tools/blender/preview_face.py -- --name f_white [--dir assets/people] [--prefix v14_face] [--cell 512]
      [--views front,quarter,side] [--states "goc;smile=1;smile=1,smile_open=0.8;blink=1"] [--hair 0] [--overcast]
      [--tint 1.0,0.86,0.72]
--overcast: bỏ đèn, chỉ còn ánh trời đều (kiểm mắt có thành hốc đen không).
Ảnh: <dir>/_preview/<prefix>_<tên>.png
"""
import argparse
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_faces as pf  # noqa: E402
import preview_people as pp  # noqa: E402

VIEWS = {"front": ((0.0, -0.62, 0.0), 85), "quarter": ((0.42, -0.47, 0.01), 85), "side": ((0.62, -0.02, 0.0), 85),
         "low": ((0.12, -0.6, -0.16), 85), "eye": ((0.03, -0.3, 0.0), 110)}


def parse_states(text):
    states = []
    for item in text.split(";"):
        state = {}
        for pair in item.split(","):
            if "=" in pair:
                name, value = pair.split("=")
                state[name.strip()] = float(value)
        states.append(state)
    return states


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="f_white")
    parser.add_argument("--prefix", default="v14_face")
    parser.add_argument("--cell", type=int, default=512)
    parser.add_argument("--views", default="front,quarter,side")
    parser.add_argument("--states", default="goc")
    parser.add_argument("--hair", type=int, default=0)
    parser.add_argument("--glasses", type=int, default=-1)
    parser.add_argument("--overcast", action="store_true")
    parser.add_argument("--tint", default="")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    os.makedirs(os.path.join(directory, "_preview"), exist_ok=True)
    scene, camera = pp.setup_scene()
    if args.overcast:
        for obj in [o for o in scene.objects if o.type == "LIGHT"]:
            bpy.data.objects.remove(obj)
        scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.78, 0.82, 1.0)
        scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    for obj in meshes:
        if obj.name.startswith("hair_"):
            obj.hide_render = obj.name != "hair_%d" % args.hair
        if obj.name.startswith("glasses_"):
            obj.hide_render = obj.name != "glasses_%d" % args.glasses
    wardrobe = "top" not in bpy.data.objects          # tệp tủ đồ: mặc sơ mi đồng phục + quần âu, ẩn da bị che
    if wardrobe:
        for obj in meshes:
            if obj.name.startswith(("top_", "bottom_", "shoes_")):
                obj.hide_render = obj.name not in ("top_uniform", "bottom_trousers")
            if obj.name in ("skin_torso", "skin_upperarm", "skin_hip", "skin_knee", "skin_shin"):
                obj.hide_render = True
        pp.tint_material(bpy.data.objects["top_uniform"].material_slots[0].material, (1.08, 1.08, 1.06))
    else:
        for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(args.name, (pp.WHITE, pp.WHITE))):
            pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    if args.tint:
        rgb = tuple(float(c) for c in args.tint.split(","))
        for slot in bpy.data.objects["skin_head" if wardrobe else "body"].material_slots:
            pp.tint_material(slot.material, rgb)
    _triangles, top, _low = pp.measure([o for o in meshes if o.name in ("body", "skin_head")], character)
    head_z = (character.matrix_world @ character.data.bones["mixamorigHead"].head_local).z
    eye_z = head_z + (top - head_z) * 0.42
    states, views = parse_states(args.states), args.views.split(",")
    cell = args.cell
    sheet = np.full((len(states) * cell, len(views) * cell, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    tmp = os.path.join(bpy.app.tempdir, "face_cell.png")
    for row, state in enumerate(states):
        pf.set_state(meshes, state)
        for column, view in enumerate(views):
            offset, lens = VIEWS[view]
            pp.aim(camera, (offset[0], offset[1], eye_z - 0.02 + offset[2]), (0.0, 0.0, eye_z - (0.005 if view == "eye" else 0.03)), lens)
            pp.render(scene, tmp, cell, cell)
            y0 = sheet.shape[0] - (row + 1) * cell
            sheet[y0:y0 + cell, column * cell:(column + 1) * cell] = pa.read_pixels(tmp)
    out = bpy.data.images.new("face", sheet.shape[1], sheet.shape[0], alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (args.prefix, args.name))
    out.file_format = "PNG"
    out.save()
    print("SOAT mặt ->", out.filepath_raw)


if __name__ == "__main__":
    main()
