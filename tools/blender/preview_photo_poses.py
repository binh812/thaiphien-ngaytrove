"""Soát poses.glb: mỗi dáng một ô chính diện + một ô nghiêng 3/4 trên một nhân vật (clip áp như three.js;
nhân vật nữ dùng biến thể _f nếu có).

Chạy: .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_photo_poses.py -- [--dir assets/people] [--characters m_white,f_white,f_aodai_teacher] [--prefix v10_poses] [--poses poses.glb]
Ảnh <dir>/_preview/<prefix>_<tên>.png: 4 hàng x 6 ô; mỗi dáng chiếm 2 ô liền nhau (chính diện, 3/4), theo thứ tự trong manifest.
"""
import argparse
import json
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = (300, 480)
PER_ROW = 3


def preview_character(name, directory, prefix, poses_file):
    with open(os.path.join(directory, "manifest.json"), encoding="utf-8") as f:
        clips = json.load(f)["poses"]["clips"]
    base = [c for c in clips if not c.endswith("_f")]
    scene, camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 0)
    for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(name, (pp.WHITE, pp.WHITE))):
        pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, poses_file), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o not in before and o.type == "MESH"]:
        obj.hide_render = True
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z
    rows = (len(base) + PER_ROW - 1) // PER_ROW
    sheet = np.full((rows * CELL[1], PER_ROW * 2 * CELL[0], 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    tmp = os.path.join(bpy.app.tempdir, "photo_pose.png")
    female = name.startswith("f_")
    for index, clip in enumerate(base):
        chosen = clip + "_f" if female and clip + "_f" in clips else clip
        start, _end = pa.set_clip(driver, chosen)
        scene.frame_set(start + 15)
        pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
        row, column = divmod(index, PER_ROW)
        for view, location in enumerate(((0.0, -4.6, 1.0), (2.7, -3.7, 1.1))):
            pp.aim(camera, location, (0.0, 0.0, 0.86), 85)
            pp.render(scene, tmp, CELL[0], CELL[1])
            y0 = (rows - 1 - row) * CELL[1]
            x0 = (column * 2 + view) * CELL[0]
            sheet[y0:y0 + CELL[1], x0:x0 + CELL[0]] = pa.read_pixels(tmp)
    out = bpy.data.images.new("poses", sheet.shape[1], sheet.shape[0], alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (prefix, name))
    out.file_format = "PNG"
    out.save()
    print("SOAT dáng chụp ảnh ->", out.filepath_raw)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="m_white,f_white,f_aodai_teacher")
    parser.add_argument("--prefix", default="v10_poses")
    parser.add_argument("--poses", default="poses.glb")
    args = parser.parse_args(argv)
    for name in args.characters.split(","):
        preview_character(name, os.path.abspath(args.dir), args.prefix, args.poses)


if __name__ == "__main__":
    main()
