"""Chuyển (retarget) các clip Mixamo trong Xbot.glb (kho mrdoob/three.js) sang bộ xương MPFB của bộ người,
xuất assets/people/anims.glb chỉ gồm armature + hoạt hoạ.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/make_anims.py -- \
        [--source .tools/dl/threejs/Xbot.glb] [--character assets/people/m_white.glb] [--out assets/people/anims.glb]

Cách làm: với mỗi khung hình lấy phép quay thế giới của từng xương nguồn so với tư thế nghỉ của nó (D),
nhân với phép hiệu chỉnh C đưa hướng xương đích lúc nghỉ (tư thế A) về hướng xương nguồn lúc nghỉ (tư thế T),
rồi đổi về phép quay cục bộ của xương đích. Hông: lấy thêm độ dời, co theo tỉ lệ chiều cao hông, bỏ trôi ngang.
"""
import argparse
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Quaternion, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FPS = 30
# tên xuất -> tên clip nguồn, hoặc (tên clip nguồn, "nod" | "shake") = clip nền cộng chuyển động đầu tự tạo
CLIP_SETS = {
    "xbot": {"idle": "idle", "walk": "walk", "run": "run", "agree": "agree", "headShake": "headShake"},
    "cc0": {
            "sprint": "Sprint_Loop", "walk_formal": "Walk_Formal_Loop", "talk": "Idle_Talking_Loop",
            "sit_idle": "Sitting_Idle_Loop", "sit_talk": "Sitting_Talking_Loop", "sit_down": "Sitting_Enter",
            "stand_up": "Sitting_Exit", "interact": "Interact", "pick_up": "PickUp_Table"},
}
SOURCES = {"xbot": os.path.join(ROOT, ".tools", "dl", "threejs", "Xbot.glb"),
           "cc0": os.path.join(ROOT, ".tools", "dl", "ual", "x", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")}
ONE_SHOT = {"sit_down": 0, "interact": 0, "pick_up": 0, "stand_up": -1}   # clip không lặp: giữ độ dời ngang so với khung này
HEAD_MOTION = {"nod": ((1.0, 0.0, 0.0), 12.0, 3.0, True), "shake": ((0.0, 0.0, 1.0), 16.0, 3.0, False)}   # trục, độ, số nhịp, một chiều
UAL_BONES = {"pelvis": "Hips", "spine_01": "Spine", "spine_02": "Spine1", "spine_03": "Spine2", "neck_01": "Neck", "Head": "Head"}
UAL_LIMBS = {"clavicle": "Shoulder", "upperarm": "Arm", "lowerarm": "ForeArm", "hand": "Hand", "thigh": "UpLeg", "calf": "Leg",
             "foot": "Foot", "ball": "ToeBase"}
HIPS = "mixamorigHips"
TRUNK = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "Shoulder")
MAX_DRIFT = 0.05  # m: hông lệch ngang quá mức này giữa khung đầu và cuối thì khử trôi tuyến tính


def canonical(name):
    """Tên xương chuẩn (mixamorigXxx) cho cả bộ xương Mixamo lẫn bộ xương kiểu Unreal của Universal Animation Library."""
    if name in UAL_BONES:
        return "mixamorig" + UAL_BONES[name]
    if name.endswith(("_l", "_r")):
        side, stem = ("Left" if name.endswith("_l") else "Right"), name[:-2]
        if stem in UAL_LIMBS:
            return "mixamorig" + side + UAL_LIMBS[stem]
        parts = stem.split("_")
        if len(parts) == 2 and parts[1].isdigit() and parts[0] in ("thumb", "index", "middle", "ring", "pinky"):
            return "mixamorig%sHand%s%d" % (side, parts[0].capitalize(), int(parts[1]))
    return name.replace("mixamorig:", "mixamorig").replace("mixamorig_", "mixamorig")


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    created = [o for o in bpy.data.objects if o not in before]
    rigs = [o for o in created if o.type == "ARMATURE"]
    if len(rigs) != 1:
        raise RuntimeError("%s: cần đúng 1 armature, thấy %d" % (path, len(rigs)))
    return rigs[0], created


def rotation_of(matrix):
    """Phần quay của ma trận (bỏ tỉ lệ: armature của Xbot có scale 0.01)."""
    return matrix.to_3x3().normalized().to_quaternion()


def rest_world_rotation(rig, bone):
    return rotation_of(rig.matrix_world @ bone.matrix_local)


def rest_world_head(rig, bone):
    return rig.matrix_world @ bone.head_local


def chain_direction(rig, bone, by_name):
    """Hướng xương lúc nghỉ trong hệ thế giới: từ gốc xương tới gốc xương con cùng chuỗi (nếu có)."""
    children = [c for c in bone.children if canonical(c.name) in by_name]
    if len(children) == 1 or (children and canonical(bone.name).endswith(("Arm", "Leg", "Foot", "Shoulder"))):
        target = rest_world_head(rig, children[0])
        direction = target - rest_world_head(rig, bone)
        if direction.length > 1e-5:
            return direction.normalized()
    return None


def build_corrections(source, target, shared):
    """C[b]: phép quay thế giới đưa hướng nghỉ của xương đích về hướng nghỉ của xương nguồn."""
    source_bones = {canonical(b.name): b for b in source.data.bones}
    target_bones = {canonical(b.name): b for b in target.data.bones}
    corrections = {}
    for name in shared:
        src_dir = chain_direction(source, source_bones[name], shared)
        dst_dir = chain_direction(target, target_bones[name], shared)
        if name.replace("mixamorig", "").replace("Left", "").replace("Right", "") in TRUNK:
            corrections[name] = Quaternion()   # các khớp thân nằm so le trong lồng ngực: ép theo hướng nguồn sẽ bẻ gù lưng
        elif src_dir is None or dst_dir is None or name == HIPS:
            parent = target_bones[name].parent
            corrections[name] = corrections.get(canonical(parent.name), Quaternion()) if parent and name != HIPS else Quaternion()
        else:
            corrections[name] = dst_dir.rotation_difference(src_dir)
    return corrections


def ordered_shared_bones(source, target):
    source_names = {canonical(b.name) for b in source.data.bones}
    return [canonical(b.name) for b in target.data.bones if canonical(b.name) in source_names]  # cha trước con


def set_source_action(source, action):
    animation = source.animation_data
    for track in animation.nla_tracks:
        track.mute = True
    animation.action = action
    if hasattr(animation, "action_slot") and action.slots:
        animation.action_slot = action.slots[0]


def sample_clip(source, action, shared):
    """Trả về danh sách khung: ({tên: phép quay thế giới}, vị trí thế giới của hông)."""
    scene = bpy.context.scene
    set_source_action(source, action)
    start, end = (int(round(v)) for v in action.frame_range)
    pose_bones = {canonical(p.name): p for p in source.pose.bones}
    frames = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        rotations = {name: rotation_of(source.matrix_world @ pose_bones[name].matrix) for name in shared}
        hips = (source.matrix_world @ pose_bones[HIPS].matrix).to_translation()
        frames.append((rotations, hips))
    return frames


def hips_offsets(frames, source_rest_hips, scale, anchor=None):
    """Độ dời hông (thế giới) so với tư thế nghỉ, đã co theo tỉ lệ và khử trôi ngang để clip chạy tại chỗ."""
    offsets = [(hips - source_rest_hips) * scale for _rot, hips in frames]
    if anchor is not None:   # clip không lặp (ngồi xuống, đứng lên...): chỉ đặt gốc ngang tại khung neo, không khử trôi
        origin = offsets[anchor]
        return [Vector((o.x - origin.x, o.y - origin.y, o.z)) for o in offsets]
    drift = offsets[-1] - offsets[0]
    drift.z = 0.0
    last = max(len(offsets) - 1, 1)
    if drift.length > MAX_DRIFT:
        offsets = [o - drift * (i / last) for i, o in enumerate(offsets)]
    mean = sum(offsets, Vector()) / len(offsets)
    return [Vector((o.x - mean.x, o.y - mean.y, o.z)) for o in offsets]


FINGER_CURL = {"Index": (12.0, 18.0, 10.0), "Middle": (17.0, 24.0, 13.0), "Ring": (23.0, 30.0, 17.0),
               "Pinky": (28.0, 35.0, 20.0)}   # độ gập đốt gốc, giữa, cuối: tăng dần từ ngón trỏ tới ngón út
FINGER_CLOSE = 0.85          # khép các ngón về song song với ngón giữa (1 = song song hẳn)
THUMB_TO_INDEX, THUMB_TO_PALM, THUMB_CURL = 0.6, 0.2, 8.0   # ngón cái ngả về ngón trỏ, hơi gập vào lòng bàn tay
FINGER_SWAY = 2.0            # độ: dao động chậm một chu kỳ mỗi clip cho đỡ cứng
HAND_FOLLOW = 0.0            # cổ tay giữ thẳng theo cẳng tay (0 = không theo chuyển động cổ tay của nguồn)


def finger_curls(target):
    """{tên xương ngón: (phép quay nghỉ, phép khép, trục gập, độ gập, pha)} cho bàn tay buông thả lỏng.
    Mọi thứ tính trong hệ armature từ hình học lúc nghỉ, nên hai tay đối xứng và không phụ thuộc trục cục bộ của xương."""
    bones = {canonical(b.name): b for b in target.data.bones}

    def direction(name):
        return (bones[name].tail_local - bones[name].head_local).normalized()

    poses = {}
    for side in ("Left", "Right"):
        p = "mixamorig%sHand" % side
        middle = direction(p + "Middle1")
        lateral = (bones[p + "Index1"].head_local - bones[p + "Pinky1"].head_local).normalized()
        palm = middle.cross(lateral).normalized()
        if palm.z > 0:            # ở tư thế chữ A lòng bàn tay úp xuống
            palm.negate()
        for order, (finger, angles) in enumerate(FINGER_CURL.items()):
            first = direction(p + finger + "1")
            close = first.rotation_difference(first.lerp(middle, FINGER_CLOSE).normalized())
            for joint, degrees in enumerate(angles, start=1):
                name = "%s%s%d" % (p, finger, joint)
                bend = direction(name)
                axis = lateral if ((Quaternion(lateral, 0.3) @ bend) - bend).dot(palm) > 0 else -lateral
                poses[name] = (bones[name].matrix_local.to_quaternion(), close if joint == 1 else Quaternion(), axis, degrees, order * 0.9)
        index_dir, thumb = direction(p + "Index1"), direction(p + "Thumb1")
        goal = (thumb.lerp(index_dir, THUMB_TO_INDEX) + palm * THUMB_TO_PALM).normalized()
        poses[p + "Thumb1"] = (bones[p + "Thumb1"].matrix_local.to_quaternion(), thumb.rotation_difference(goal), lateral, 0.0, 2.0)
        for joint in (2, 3):
            name = "%sThumb%d" % (p, joint)
            axis = direction(name).cross(index_dir)
            axis = axis.normalized() if axis.length > 1e-4 else lateral
            poses[name] = (bones[name].matrix_local.to_quaternion(), Quaternion(), axis, THUMB_CURL, 2.0)
    return poses


def finger_pose(entry, index, count):
    """Phép quay cục bộ (so với tư thế nghỉ) của một đốt ngón ở khung `index` trong clip dài `count` khung."""
    rest, close, axis, degrees, phase = entry
    angle = degrees + FINGER_SWAY * math.sin(2 * math.pi * index / max(count - 1, 1) + phase)
    world = Quaternion(axis, math.radians(angle)) @ close
    return rest.inverted() @ world @ rest


MOCAP_DIR = os.path.join(ROOT, ".tools", "dl", "cmu")
MOCAP = {"walk": ("07_01",), "run": ("35_17", "09_01", "02_03", "16_35"), "walk_f": ("07_04",)}   # tên xuất -> các mã clip CMU thử lần lượt
CMU_BONES = {"Hips": "Hips", "LowerBack": "Spine", "Spine": "Spine1", "Spine1": "Spine2", "Neck1": "Neck", "Head": "Head"}
CMU_LIMBS = ("Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase")
MOCAP_FPS = 120
HIPS_TOP_WALK, HIPS_TOP_RUN = -0.008, 0.02   # m so với hipsRestHeight


def yaw_between(a, b):
    """Phép quay quanh trục đứng đưa hướng ngang a về hướng ngang b."""
    return Quaternion((0.0, 0.0, 1.0), math.atan2(b.y, b.x) - math.atan2(a.y, a.x))


def import_mocap(path):
    """Nhập một tệp BVH của CMU và đổi tên xương về tên chuẩn (xương không dùng mang tiền tố cmu_)."""
    import addon_utils
    addon_utils.enable("io_anim_bvh")
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, axis_forward="-Z", axis_up="Y", update_scene_fps=False, update_scene_duration=False)
    rig = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
    for bone in list(rig.data.bones):
        name = bone.name
        side = "Left" if name.startswith("Left") else "Right" if name.startswith("Right") else ""
        if name in CMU_BONES:
            bone.name = "mixamorig" + CMU_BONES[name]
        elif side and name[len(side):] in CMU_LIMBS:
            bone.name = "mixamorig" + name
        else:
            bone.name = "cmu_" + name
    return rig


def mocap_clip(target, out_name, code):
    """Cắt đúng một chu kỳ bước từ clip ghi hình người thật, khâu kín đầu-cuối, bỏ dịch chuyển ngang, chuyển sang `target`.
    Trả về (số khung, tốc độ gốc m/s đã quy về cỡ của target)."""
    scene, up = bpy.context.scene, Vector((0.0, 0.0, 1.0))
    rig = import_mocap(os.path.join(MOCAP_DIR, code + ".bvh"))
    start, end = (int(round(v)) for v in rig.animation_data.action.frame_range)
    bones = {b.name: b for b in rig.data.bones}
    left = bones["mixamorigLeftArm"].head_local - bones["mixamorigRightArm"].head_local
    facing = Vector((left.x, left.y, 0.0)).cross(up).normalized()          # hướng mặt của tư thế nghỉ (chữ T)
    to_front = yaw_between(facing, Vector((0.0, -1.0, 0.0)))

    def pose_point(name):
        return (rig.matrix_world @ rig.pose.bones[name].matrix).to_translation()

    scene.frame_set(start)
    first = rig.pose.bones[HIPS].matrix.to_translation().copy()
    scene.frame_set(end)
    travel = rig.pose.bones[HIPS].matrix.to_translation() - first
    to_facing = yaw_between(Vector((travel.x, travel.y, 0.0)), facing)     # quay hướng đi về hướng mặt lúc nghỉ

    rig.matrix_world = to_front.to_matrix().to_4x4()
    bpy.context.view_layer.update()
    shared = ordered_shared_bones(rig, target)
    source_rest = {n: rest_world_rotation(rig, bones[n]) for n in shared}
    corrections = build_corrections(rig, target, set(shared))
    rig.matrix_world = (to_front @ to_facing).to_matrix().to_4x4()
    bpy.context.view_layer.update()

    lead = []                                                               # chân trái vươn ra trước bao nhiêu so với hông
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        lead.append(-(pose_point("mixamorigLeftFoot").y - pose_point(HIPS).y))
    smooth = [sum(lead[max(i - 6, 0):i + 7]) / len(lead[max(i - 6, 0):i + 7]) for i in range(len(lead))]
    peaks = [i for i in range(8, len(smooth) - 8) if smooth[i] == max(smooth[i - 8:i + 9])]
    pairs = [(a, b) for a, b in zip(peaks, peaks[1:]) if b - a > 0.45 * MOCAP_FPS]
    if not pairs:
        bpy.data.objects.remove(rig)
        raise RuntimeError("Không tìm được một chu kỳ bước trọn vẹn trong " + code)
    middle = len(smooth) / 2
    begin, finish = min(pairs, key=lambda p: abs((p[0] + p[1]) / 2 - middle))
    count = max(int(round((finish - begin) / (MOCAP_FPS / FPS))), 8)

    frames, ankles = [], []
    for i in range(count + 1):
        moment = start + begin + (finish - begin) * i / count
        scene.frame_set(int(moment), subframe=moment - int(moment))
        rotations = {n: rotation_of(rig.matrix_world @ rig.pose.bones[n].matrix) for n in shared}
        frames.append((rotations, pose_point(HIPS).copy()))
        ankles.append(min(pose_point("mixamorigLeftFoot").z, pose_point("mixamorigRightFoot").z))
    last = frames[-1][0]
    for i, (rotations, _hips) in enumerate(frames):                         # khâu kín: khung cuối trùng khung đầu
        for name in shared:
            fix = last[name].inverted() @ frames[0][0][name] if i < count else None
            rotations[name] = frames[0][0][name].copy() if i == count else rotations[name] @ Quaternion().slerp(fix, i / count)

    target_bones = {canonical(b.name): b for b in target.data.bones}

    def leg_length(armature_bones):
        hip, knee, ankle = (armature_bones["mixamorigLeft" + part].head_local for part in ("UpLeg", "Leg", "Foot"))
        return (knee - hip).length + (ankle - knee).length

    scale = leg_length(target_bones) / leg_length(bones)
    ground = min(ankles) - rest_world_head(target, target_bones["mixamorigLeftFoot"]).z / scale
    rest_height = rest_world_head(target, target_bones[HIPS]).z
    path = [hips for _rot, hips in frames]
    stride = path[-1] - path[0]
    offsets = []
    for i, hips in enumerate(path):
        flat = hips - path[0] - stride * (i / count)                        # bỏ quãng đi tới và độ lệch đầu-cuối
        offsets.append(Vector((flat.x * scale, flat.y * scale, (path[0].z + flat.z - ground) * scale - rest_height)))
    centre = sum(offsets, Vector()) / len(offsets)
    speed = Vector((stride.x, stride.y, 0.0)).length * scale / (count / FPS)
    # Cao độ hông: tỉ lệ thân người nguồn khác ta nên ước lượng mặt đất lệch vài cm; neo điểm hông cao nhất của chu kỳ
    # sát tư thế nghỉ (đi: chân trụ gần thẳng; chạy: có pha bay nên cho cao hơn một chút) để bàn chân không lơ lửng.
    lift = max(o.z for o in offsets) - (HIPS_TOP_RUN if speed > 2.0 else HIPS_TOP_WALK)
    offsets = [Vector((o.x - centre.x, o.y - centre.y, o.z - lift)) for o in offsets]
    for name in ("mixamorigNeck", "mixamorigHead"):          # đầu và cổ: lấy dáng trung bình của chu kỳ làm mốc thẳng
        if name in shared:
            total = Quaternion((0.0, 0.0, 0.0, 0.0))
            for rotations, _hips in frames:
                q = rotations[name]
                total += q if q.dot(frames[0][0][name]) >= 0 else -q
            source_rest = dict(source_rest, **{name: total.normalized()})
    bake_clip(target, out_name, frames, source_rest, corrections, shared, offsets)
    bpy.data.objects.remove(rig)
    print("CLIP %s (CMU %s): chu kỳ %d khung = %.3f s, tốc độ gốc %.2f m/s" % (out_name, code, count + 1, count / FPS, speed))
    return count + 1, speed


def bake_clip(target, name, frames, source_rest, corrections, shared, hip_offsets, head_motion=None):
    action = bpy.data.actions.new(name)
    target.animation_data_create()
    target.animation_data.action = action
    bones = {canonical(b.name): b for b in target.data.bones}
    pose_bones = {canonical(p.name): p for p in target.pose.bones}
    rest = {n: rest_world_rotation(target, bones[n]) for n in shared}
    curls = finger_curls(target)
    previous = {}
    for index, (rotations, _hips) in enumerate(frames):
        world = {}
        for bone_name in shared:
            delta = rotations[bone_name] @ source_rest[bone_name].inverted()
            world[bone_name] = delta @ corrections[bone_name] @ rest[bone_name]
            parent = bones[bone_name].parent
            if parent is None:
                local = rest[bone_name].inverted() @ world[bone_name]
            else:
                parent_name = canonical(parent.name)
                parent_world = world.get(parent_name, rest_world_rotation(target, parent))
                parent_rest = rest.get(parent_name, rest_world_rotation(target, parent))
                local = (parent_rest.inverted() @ rest[bone_name]).inverted() @ (parent_world.inverted() @ world[bone_name])
            if head_motion and bone_name == "mixamorigHead":
                axis, degrees, beats, one_way = HEAD_MOTION[head_motion]
                t = index / max(len(frames) - 1, 1)
                wave = 0.5 * (1.0 - math.cos(2 * math.pi * beats * t)) if one_way else math.sin(2 * math.pi * beats * t)
                swing = Quaternion(rest[bone_name].inverted() @ Vector(axis), math.radians(degrees) * wave * math.sin(math.pi * t))
                local = local @ swing
            if bone_name in curls:
                local = finger_pose(curls[bone_name], index, len(frames))   # ngón tay: thả lỏng, không theo nguồn
            elif bone_name.endswith("Hand"):
                local = Quaternion().slerp(local, HAND_FOLLOW)
                world[bone_name] = parent_world @ (parent_rest.inverted() @ rest[bone_name]) @ local
            if bone_name in previous and previous[bone_name].dot(local) < 0:
                local.negate()  # giữ cùng bán cầu để nội suy không quay vòng xa
            previous[bone_name] = local
            pose_bone = pose_bones[bone_name]
            pose_bone.rotation_mode = "QUATERNION"
            pose_bone.rotation_quaternion = local
            pose_bone.keyframe_insert("rotation_quaternion", frame=index)
        hips = pose_bones[HIPS]
        hips.location = rest[HIPS].inverted() @ hip_offsets[index]
        hips.keyframe_insert("location", frame=index)
    track = target.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    target.animation_data.action = None
    return action


def keep_rotation_and_hips_only(path):
    """Bỏ kênh translation/scale (trừ translation của hông) khỏi GLB: bộ xuất Blender luôn ghi đủ ba loại kênh,
    mà vị trí xương của nhân vật gốc sẽ làm méo tỉ lệ các nhân vật khác. Dữ liệu nhị phân giữ nguyên."""
    with open(path, "rb") as f:
        header = f.read(12)
        json_length, _json_type = struct.unpack("<I4s", f.read(8))
        gltf = json.loads(f.read(json_length))
        rest = f.read()
    for animation in gltf["animations"]:
        channels = [c for c in animation["channels"] if c["target"]["path"] == "rotation" or (
            c["target"]["path"] == "translation" and gltf["nodes"][c["target"]["node"]]["name"] == HIPS)]
        used = sorted({c["sampler"] for c in channels})
        remap = {old: new for new, old in enumerate(used)}
        animation["samplers"] = [animation["samplers"][i] for i in used]
        animation["channels"] = [dict(c, sampler=remap[c["sampler"]]) for c in channels]
    blob = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    blob += b" " * (-len(blob) % 4)
    total = 12 + 8 + len(blob) + len(rest)
    with open(path, "wb") as f:
        f.write(header[:8] + struct.pack("<I", total))
        f.write(struct.pack("<I4s", len(blob), b"JSON") + blob + rest)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--set", default="cc0", choices=sorted(CLIP_SETS), help="cc0 = Universal Animation Library (CC0); xbot = Mixamo")
    parser.add_argument("--source", default=None)
    parser.add_argument("--character", default=os.path.join(ROOT, "assets", "people", "m_white.glb"))
    parser.add_argument("--out", default=os.path.join(ROOT, "assets", "people", "anims.glb"))
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"  # để glTF xuất LINEAR, không cần lấy mẫu lại
    source, _source_objects = import_glb(os.path.abspath(args.source or SOURCES[args.set]))
    source_actions = {a.name: a for a in bpy.data.actions}
    target, target_objects = import_glb(os.path.abspath(args.character))
    for obj in [o for o in target_objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj)

    bpy.context.view_layer.update()
    shared = ordered_shared_bones(source, target)
    if HIPS not in shared:
        raise RuntimeError("Không khớp được xương hông giữa hai bộ xương")
    source_bones = {canonical(b.name): b for b in source.data.bones}
    target_bones = {canonical(b.name): b for b in target.data.bones}
    source_rest = {n: rest_world_rotation(source, source_bones[n]) for n in shared}
    corrections = build_corrections(source, target, set(shared))
    if args.set == "cc0":
        # Dáng đứng của nguồn hơi khom (ngực và đầu chúi ra trước 12-16 độ so với tư thế bind). Lấy dáng trung bình của
        # clip Idle_Loop làm mốc "thẳng" cho các khớp thân: idle đứng thẳng theo tư thế nghỉ của ta, clip khác lệch theo idle.
        idle_frames = sample_clip(source, source_actions["Idle_Loop"], shared)
        for name in shared:
            if name.replace("mixamorig", "").replace("Left", "").replace("Right", "") in TRUNK:
                first = idle_frames[0][0][name]
                total = Quaternion((0.0, 0.0, 0.0, 0.0))
                for rotations, _hips in idle_frames:
                    q = rotations[name]
                    total += q if q.dot(first) >= 0 else -q
                source_rest[name] = total.normalized()
    source_rest_hips = rest_world_head(source, source_bones[HIPS])
    scale = rest_world_head(target, target_bones[HIPS]).z / source_rest_hips.z

    lengths = {}
    for out_name, source_name in CLIP_SETS[args.set].items():
        source_name, head_motion = source_name if isinstance(source_name, tuple) else (source_name, None)
        matches = [a for n, a in source_actions.items() if n == source_name] or [
            a for n, a in source_actions.items() if n.startswith(source_name + "_")]
        if not matches:
            raise RuntimeError("Nguồn không có clip " + source_name)
        frames = sample_clip(source, matches[0], shared)
        offsets = hips_offsets(frames, source_rest_hips, scale, ONE_SHOT.get(out_name))
        bake_clip(target, out_name, frames, source_rest, corrections, shared, offsets, head_motion)
        if out_name in ONE_SHOT:
            end = offsets[-1] - offsets[0]
            print("CLIP %s: hông dời từ đầu tới cuối (x, y trước-sau, z) = %.3f %.3f %.3f m" % (out_name, end.x, end.y, end.z))
        lengths[out_name] = len(frames)
        print("CLIP %s: %d khung @ %d fps" % (out_name, len(frames), FPS))

    speeds = {}
    if args.set == "cc0":      # đứng yên, gật, lắc đầu: tự tạo bằng bộ giải dáng của make_poses (dáng idle của nguồn là dáng thủ thế)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import make_poses
        standing = make_poses.Rig(target)
        for out_name, head in (("idle", None), ("agree", "nod"), ("headShake", "shake")):
            make_poses.bake(target, out_name, standing, 1.0, frames=76, base="idle", head=head)
            lengths[out_name] = 76
    if args.set == "cc0":      # đi/chạy lấy từ ghi hình người thật (CMU), các clip khác từ Universal Animation Library
        for out_name, codes in MOCAP.items():
            for code in codes:
                try:
                    lengths[out_name], speeds[out_name] = mocap_clip(target, out_name, code)
                    break
                except RuntimeError as error:
                    print("BO QUA %s: %s" % (code, error))
            else:
                raise RuntimeError("Không clip CMU nào dùng được cho " + out_name)
    for obj in list(bpy.data.objects):
        if obj is not target:
            bpy.data.objects.remove(obj)
    staged = os.path.abspath(args.out)[:-4] + ".staging.glb"
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.export_scene.gltf(
        filepath=staged, export_format="GLB", export_yup=True, use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=False,  # chỉ xuất kênh có khoá: quay + vị trí hông
        export_frame_range=False, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
        export_skins=True, export_cameras=False, export_lights=False, export_def_bones=False)
    keep_rotation_and_hips_only(staged)
    os.replace(staged, os.path.abspath(args.out))   # đổi tên một lần: trình duyệt đang chạy không đọc phải tệp dở
    manifest_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), "manifest.json")
    manifest = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    key = "animations" if os.path.basename(args.out) == "anims.glb" else "animations_" + os.path.basename(args.out)[:-4]
    manifest[key] = {
        "source": args.set,
        "file": os.path.basename(args.out), "bytes": os.path.getsize(args.out), "fps": FPS,
        "retargetedOn": os.path.basename(args.character),
        "hipsRestHeight": round(rest_world_head(target, target_bones[HIPS]).z, 4),
        "tracks": "quaternion cho mọi xương + position chỉ cho " + HIPS,
        "clips": {name: dict({"frames": count, "duration": round((count - 1) / FPS, 4)},
                             **({"rootSpeed": round(speeds[name], 3)} if name in speeds else {})) for name, count in lengths.items()},
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("XONG anims -> %s (%.2f MB), tỉ lệ hông %.3f, %d xương khớp" % (args.out, os.path.getsize(args.out) / 1e6, scale, len(shared)))


if __name__ == "__main__":
    main()
