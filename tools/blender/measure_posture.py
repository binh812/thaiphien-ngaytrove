"""Đo dáng lưng: độ nghiêng ra trước (độ, dương = chúi ra trước) của từng xương cột sống so với phương thẳng đứng,
ở tư thế nghỉ và trung bình trong clip idle / walk (áp clip như three.js); kèm vị trí trước-sau của tai, vai, hông so với mắt cá.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/measure_posture.py -- [--dir assets/people] [--characters m_white,f_white,f_aodai_teacher] [--anims anims.glb]
"""
import argparse
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

CHAIN = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head")
CHILD = {"Hips": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Spine2": "Neck", "Neck": "Head"}


def lean(character, name):
    """Độ nghiêng ra trước của đoạn từ gốc xương `name` tới gốc xương kế (Head: theo trục xương)."""
    bones = character.pose.bones
    start = character.matrix_world @ bones["mixamorig" + name].head
    if name in CHILD:
        end = character.matrix_world @ bones["mixamorig" + CHILD[name]].head
    else:
        end = character.matrix_world @ bones["mixamorig" + name].tail
    direction = end - start
    return math.degrees(math.atan2(-direction.y, direction.z))   # mặt trước là -Y của Blender


def measure(name, directory, anims):
    scene, _camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    bpy.context.view_layer.update()
    rest = {b: lean(character, b) for b in CHAIN}
    world = lambda bone: character.matrix_world @ character.pose.bones["mixamorig" + bone].head  # noqa: E731
    ankle_y = world("LeftFoot").y
    offsets = {label: round((ankle_y - world(bone).y) * 100, 1) for label, bone in
               (("hông", "Hips"), ("vai", "LeftArm"), ("đầu", "Head"))}   # cm, dương = nằm trước mắt cá
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, anims), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z
    clips = {}
    for clip in ("idle", "walk"):
        start, end = pa.set_clip(driver, clip)
        totals = {b: 0.0 for b in CHAIN}
        frames = list(range(start, end + 1, 3))
        for frame in frames:
            scene.frame_set(frame)
            pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
            bpy.context.view_layer.update()
            for b in CHAIN:
                totals[b] += lean(character, b)
        clips[clip] = {b: totals[b] / len(frames) for b in CHAIN}
    print("DANG %s | vị trí trước mắt cá (cm): %s" % (name, offsets))
    for b in CHAIN:
        print("DANG %s %-7s nghỉ %6.1f | idle %6.1f | walk %6.1f" % (name, b, rest[b], clips["idle"][b], clips["walk"][b]))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="m_white,f_white,f_aodai_teacher")
    parser.add_argument("--anims", default="anims.glb")
    args = parser.parse_args(argv)
    for name in args.characters.split(","):
        measure(name, os.path.abspath(args.dir), args.anims)


if __name__ == "__main__":
    main()
