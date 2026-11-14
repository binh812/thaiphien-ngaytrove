"""Soát từng kiểu tóc và từng kiểu kính sau khi nạp lại .glb: mỗi hàng một kiểu tóc (hàng cuối: ba kiểu kính trên hair_0),
cột = chính diện | 3/4 | nghiêng | sau lưng.

Chạy: blender -b -P tools/blender/preview_hair.py -- --name f_white [--dir assets/people] [--prefix v14_hair] [--cell 400]
      [--state "age_mid=0.85,smile=0.3"]
Ảnh: <dir>/_preview/<prefix>_<tên>.png
"""
import argparse
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_face as pface  # noqa: E402
import preview_faces as pf  # noqa: E402
import preview_people as pp  # noqa: E402

VIEWS = (((0.0, -0.95, 0.02), 85), ((0.62, -0.72, 0.03), 85), ((0.95, -0.02, 0.0), 85), ((0.0, 0.95, 0.04), 85))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="f_white")
    parser.add_argument("--prefix", default="v14_hair")
    parser.add_argument("--cell", type=int, default=400)
    parser.add_argument("--state", default="age_mid=0.85,smile=0.3")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    os.makedirs(os.path.join(directory, "_preview"), exist_ok=True)
    scene, camera = pp.setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if "top" in bpy.data.objects:
        for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(args.name, (pp.WHITE, pp.WHITE))):
            pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    else:                                  # tệp tủ đồ: mặc sơ mi đồng phục, ẩn da bị che
        for obj in meshes:
            if obj.name.startswith(("top_", "bottom_", "shoes_")) or obj.name in ("skin_torso", "skin_upperarm"):
                obj.hide_render = obj.name != "top_uniform"
        pp.tint_material(bpy.data.objects["top_uniform"].material_slots[0].material, (1.08, 1.08, 1.06))
    pf.set_state(meshes, pface.parse_states(args.state)[0])
    _triangles, top, _low = pp.measure([o for o in meshes if o.name in ("body", "skin_head")], character)
    head_z = (character.matrix_world @ character.data.bones["mixamorigHead"].head_local).z
    eye_z = head_z + (top - head_z) * 0.42
    hairs = sorted(o.name for o in meshes if o.name.startswith("hair_"))
    kinds = sorted(o.name for o in meshes if o.name.startswith("glasses_"))
    rows = [(int(h.split("_")[1]), -1) for h in hairs] + [(0, int(g.split("_")[1])) for g in kinds]
    cell = args.cell
    sheet = np.full((len(rows) * cell, len(VIEWS) * cell, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    tmp = os.path.join(bpy.app.tempdir, "hair_cell.png")
    for row, (hair, glasses) in enumerate(rows):
        pp.show_only_hair(meshes, hair, glasses)
        for column, (offset, lens) in enumerate(VIEWS):
            pp.aim(camera, (offset[0], offset[1], eye_z - 0.03 + offset[2]), (0.0, 0.0, eye_z - 0.05), lens)
            pp.render(scene, tmp, cell, cell)
            y0 = sheet.shape[0] - (row + 1) * cell
            sheet[y0:y0 + cell, column * cell:(column + 1) * cell] = pa.read_pixels(tmp)
    out = bpy.data.images.new("hair", sheet.shape[1], sheet.shape[0], alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (args.prefix, args.name))
    out.file_format = "PNG"
    out.save()
    print("SOAT tóc ->", out.filepath_raw)


if __name__ == "__main__":
    main()
