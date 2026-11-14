"""Soát dáng đứng sau khi nạp lại .glb: chính diện và nhìn nghiêng ở tư thế nghỉ, nhìn nghiêng ở idle và một khung walk
(clip áp như three.js).

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_posture.py -- [--dir assets/people] [--characters f_aodai_teacher,f_white,m_white] [--prefix v7_posture]

Ảnh <dir>/_preview/<prefix>_<tên>.png: nghỉ chính diện | nghỉ nghiêng | idle chính diện | idle nghiêng | walk nghiêng.
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

CELL = (400, 640)


def preview_character(name, directory, prefix):
    scene, camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 1)   # tóc buộc để thấy rõ đường lưng
    for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(name, (pp.WHITE, pp.WHITE))):
        pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    sheet = np.full((CELL[1], 5 * CELL[0], 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    tmp = os.path.join(bpy.app.tempdir, "posture_cell.png")
    front, side = (0.0, -4.4, 0.9), (4.4, 0.0, 0.9)

    def shoot(column, location):
        pp.aim(camera, location, (0.0, 0.0, 0.82), 85)
        pp.render(scene, tmp, CELL[0], CELL[1])
        sheet[:, column * CELL[0]:(column + 1) * CELL[0]] = pa.read_pixels(tmp)

    shoot(0, front)
    shoot(1, side)
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, "anims.glb"), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z
    for column, clip, fraction, location in ((2, "idle", 0.3, front), (3, "idle", 0.3, side), (4, "walk", 0.25, side)):
        start, end = pa.set_clip(driver, clip)
        scene.frame_set(start + round((end - start) * fraction))
        pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
        shoot(column, location)
    out = bpy.data.images.new("posture", 5 * CELL[0], CELL[1], alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (prefix, name))
    out.file_format = "PNG"
    out.save()
    print("SOAT dáng đứng ->", out.filepath_raw)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="f_aodai_teacher,f_white,m_white")
    parser.add_argument("--prefix", default="v7_posture")
    args = parser.parse_args(argv)
    for name in args.characters.split(","):
        preview_character(name, os.path.abspath(args.dir), args.prefix)


if __name__ == "__main__":
    main()
