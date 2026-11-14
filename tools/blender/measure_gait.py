"""Đo dáng đi của clip walk / run trong một tệp hoạt hoạ, áp lên một nhân vật như three.js:
tốc độ gốc (m/s, từ quãng bàn chân trượt lùi khi đang chạm đất), độ dài chu kỳ, góc gối duỗi tối đa của chân trụ,
độ nghiêng thân (hông -> cổ) và độ cao hông trung bình so với tư thế nghỉ.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/measure_gait.py -- [--dir assets/people] [--name m_white] [--anims anims.glb] [--clips walk,run]
"""
import argparse
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

CONTACT = 0.02   # m: bàn chân coi là chạm đất khi khớp ngón chân cao hơn mức thấp nhất không quá chừng này


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="m_white")
    parser.add_argument("--anims", default="anims.glb")
    parser.add_argument("--clips", default="walk,run")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    scene, _camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    rest_hips = (character.matrix_world @ character.data.bones[pa.HIPS].head_local).z
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.anims), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    ratio = rest_hips / driver.data.bones[pa.HIPS].head_local.z
    joint = lambda name: character.matrix_world @ character.pose.bones["mixamorig" + name].head  # noqa: E731

    for clip in args.clips.split(","):
        start, end = pa.set_clip(driver, clip)
        samples = []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
            bpy.context.view_layer.update()
            row = {"hips": joint("Hips").z, "lean": None}
            spine = joint("Neck") - joint("Hips")
            row["lean"] = math.degrees(math.atan2(-spine.y, spine.z))
            for side in ("Left", "Right"):
                hip, knee, ankle, toe = (joint(side + part) for part in ("UpLeg", "Leg", "Foot", "ToeBase"))
                row[side] = (toe.z, toe.y, math.degrees((hip - knee).angle(ankle - knee)))
            samples.append(row)
        speeds, knees = [], []
        for side in ("Left", "Right"):
            floor = min(r[side][0] for r in samples)
            for previous, current in zip(samples, samples[1:]):
                if previous[side][0] < floor + CONTACT and current[side][0] < floor + CONTACT:
                    speeds.append((current[side][1] - previous[side][1]) * 30.0)   # chân trụ trượt về phía sau (+Y Blender)
                    knees.append(current[side][2])
        duration = (end - start) / 30.0
        speed = sum(speeds) / len(speeds) if speeds else float("nan")
        print("DANGDI %s: chu kỳ %.3f s | tốc độ gốc %.2f m/s | gối chân trụ duỗi tối đa %.0f độ (180 = thẳng) | "
              "thân nghiêng trước TB %.1f độ | hông TB %+.1f cm so với nghỉ (thấp nhất %+.1f, cao nhất %+.1f) | hipsRest %.4f"
              % (clip, duration, speed, max(knees) if knees else float("nan"),
                 sum(r["lean"] for r in samples) / len(samples),
                 (sum(r["hips"] for r in samples) / len(samples) - rest_hips) * 100,
                 (min(r["hips"] for r in samples) - rest_hips) * 100, (max(r["hips"] for r in samples) - rest_hips) * 100, rest_hips))


if __name__ == "__main__":
    main()
