"""Soát mặt gốc và shape key biểu cảm sau khi nạp lại .glb: một hàng ảnh cận mặt chính diện.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_expr.py -- [--dir assets/people] [--characters m_white,f_white,f_aodai]

Ảnh <dir>/_preview/expr_<tên>.png, từ trái sang: mặt gốc, smile 0,5, smile 1, brow_up 1, face_2 + smile 0,5,
face_5 + age_old + smile 0,4.
"""
import argparse
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_faces as pf  # noqa: E402
import preview_people as pp  # noqa: E402

STATES = ({}, {"smile": 0.5}, {"smile": 1.0}, {"brow_up": 1.0}, {"face_2": 1.0, "smile": 0.5},
          {"face_5": 1.0, "age_old": 1.0, "smile": 0.4})
CELL = 420


def preview_character(name, directory):
    scene, camera = pp.setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 0)
    for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(name, (pp.WHITE, pp.WHITE))):
        pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    _triangles, top, _low = pp.measure(meshes, character)
    head_z = (character.matrix_world @ character.data.bones["mixamorigHead"].head_local).z
    eye_z = head_z + (top - head_z) * 0.42
    pf.CELL = CELL
    sheet = np.full((CELL, len(STATES) * CELL, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    for column, state in enumerate(STATES):
        pf.set_state(meshes, state)
        pf.shot(scene, camera, sheet, 0, column, (0.0, -0.8, eye_z - 0.01), (0.0, 0.0, eye_z - 0.035), 85)
    out = bpy.data.images.new("expr", sheet.shape[1], CELL, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "expr_%s.png" % name)
    out.file_format = "PNG"
    out.save()
    print("SOAT biểu cảm %s -> %s" % (name, out.filepath_raw))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="m_white,f_white,f_aodai")
    args = parser.parse_args(argv)
    for name in args.characters.split(","):
        preview_character(name, os.path.abspath(args.dir))


if __name__ == "__main__":
    main()
