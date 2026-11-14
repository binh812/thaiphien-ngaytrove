"""Soát áo đồng phục sau khi nạp lại .glb: bán thân chính diện (từ hông lên), góc 3/4, toàn thân, cận phù hiệu.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_uniform.py -- [--dir assets/people] [--characters f_white,m_white]

Ảnh <dir>/_preview/uniform_<tên>.png. Áo được nhân màu trắng như trong game (màu / 0,88), quần xanh than.
"""
import argparse
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_faces as pf  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = 600
GAME_WHITE = (1.08, 1.08, 1.06)   # 0xf4f3ee / 0,88 (tuyến tính), như rigged.js nhân màu áo


def preview_character(name, directory, prefix="uniform"):
    scene, camera = pp.setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 0)
    pp.tint_material(bpy.data.objects["top"].material_slots[0].material, GAME_WHITE)
    pp.tint_material(bpy.data.objects["bottom"].material_slots[0].material, pp.NAVY)
    _triangles, top, _low = pp.measure(meshes, character)
    chest_z = top * 0.78
    pf.CELL = CELL
    sheet = np.full((CELL, 4 * CELL, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    pf.set_state(meshes, {"age_teen": 0.5, "smile": 0.3})
    pf.shot(scene, camera, sheet, 0, 0, (0.0, -2.6, chest_z + 0.05), (0.0, 0.0, chest_z), 85)
    pf.shot(scene, camera, sheet, 0, 1, (1.5, -2.1, chest_z + 0.1), (0.0, 0.0, chest_z), 85)
    pf.shot(scene, camera, sheet, 0, 2, (0.8, -4.6, top * 0.55), (0.0, 0.0, top * 0.5), 85)
    pf.shot(scene, camera, sheet, 0, 3, (0.1, -1.0, top * 0.76), (0.07, 0.0, top * 0.745), 100)
    out = bpy.data.images.new("uniform", 4 * CELL, CELL, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (prefix, name))
    out.file_format = "PNG"
    out.save()
    print("SOAT đồng phục %s -> %s" % (name, out.filepath_raw))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="f_white,m_white")
    parser.add_argument("--prefix", default="uniform")
    args = parser.parse_args(argv)
    for name in args.characters.split(","):
        preview_character(name, os.path.abspath(args.dir), args.prefix)


if __name__ == "__main__":
    main()
