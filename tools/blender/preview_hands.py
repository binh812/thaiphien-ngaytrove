"""Soát bàn tay sau khi nạp lại .glb: cận hai bàn tay ở một khung của clip idle và một khung walk (như three.js áp clip).

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_hands.py -- [--dir assets/people] [--name m_white] [--prefix v6_hand] [--anims anims.glb]

Ảnh <dir>/_preview/<prefix>_<tên>.png: tay trái idle (chính diện, nghiêng), tay trái walk (chính diện, nghiêng), toàn thân idle.
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

CELL = 480


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="m_white")
    parser.add_argument("--prefix", default="v6_hand")
    parser.add_argument("--anims", default="anims.glb")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)

    scene, camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 0)
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.anims), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z

    def pose(clip, fraction):
        start, end = pa.set_clip(driver, clip)
        scene.frame_set(start + round((end - start) * fraction))
        pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
        bpy.context.view_layer.update()

    def hand(side):
        return character.matrix_world @ character.pose.bones["mixamorig%sHandMiddle1" % side].head

    pf.CELL = CELL
    sheet = np.full((CELL, 5 * CELL, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    pose("idle", 0.3)
    left = hand("Left")
    pf.shot(scene, camera, sheet, 0, 0, (left.x, left.y - 0.75, left.z + 0.03), tuple(left), 85)        # chính diện
    pf.shot(scene, camera, sheet, 0, 1, (left.x + 0.75, left.y, left.z + 0.03), tuple(left), 85)        # nghiêng
    pf.shot(scene, camera, sheet, 0, 4, (0.0, -4.2, 0.95), (0.0, 0.0, 0.85), 85)
    pose("walk", 0.25)
    left = hand("Left")
    pf.shot(scene, camera, sheet, 0, 2, (left.x, left.y - 0.75, left.z + 0.03), tuple(left), 85)
    pf.shot(scene, camera, sheet, 0, 3, (left.x + 0.75, left.y, left.z + 0.03), tuple(left), 85)
    out = bpy.data.images.new("hands", 5 * CELL, CELL, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (args.prefix, args.name))
    out.file_format = "PNG"
    out.save()
    print("SOAT bàn tay ->", out.filepath_raw)


if __name__ == "__main__":
    main()
