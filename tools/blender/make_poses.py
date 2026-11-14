"""Bộ dáng chụp ảnh (tự tạo bằng mã, CC0): xuất assets/people/poses.glb, cùng quy ước với anims.glb.

Mỗi dáng là một clip lặp 60 khung @30 fps (giữ tư thế + nhịp thở nhẹ; riêng pose_wave có vẫy tay). Dáng được mô tả bằng
đích của cổ tay / cổ chân trong hệ của nhân vật (mặt nhìn về -Y Blender = +Z glTF, tay phải ở -X) rồi giải IK hai đốt,
nên không phụ thuộc trục cục bộ của xương. Mỗi dáng được giải hai lần: trên bộ xương m_white (tên gốc) và f_white
(hậu tố _f, kênh vị trí hông đã quy về hipsRestHeight của m_white).

Chạy: .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/make_poses.py -- [--out assets/people/poses.glb]
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_anims as ma  # noqa: E402

FRAMES = 60
IDENTITY = Quaternion()
RELAXED = {"Index": (12, 18, 10), "Middle": (17, 24, 13), "Ring": (23, 30, 17), "Pinky": (28, 35, 20)}
FOLDED = (85, 95, 65)
FINGER_CLOSE = 0.85
SQUAT_HEEL = 24.0   # độ nhấc gót khi ngồi xổm
# Dáng bàn tay: độ gập ba đốt từng ngón, độ xoè (dương = về phía ngón trỏ), hướng ngón cái theo (dọc ngón, phía ngón trỏ, lòng bàn tay)
HANDS = {
    "relaxed": dict(curl=RELAXED, spread={}, thumb=(0.8, 0.45, 0.25)),
    "victory": dict(curl={"Index": (0, 2, 2), "Middle": (0, 2, 2), "Ring": FOLDED, "Pinky": FOLDED},
                    spread={"Index": 9, "Middle": -9}, thumb=(0.45, -0.35, 0.8)),
    "fist_thumb": dict(curl={f: FOLDED for f in RELAXED}, spread={}, thumb=(0.1, 1.0, -0.05)),
    "open": dict(curl={f: (4, 6, 4) for f in RELAXED}, spread={"Index": 10, "Ring": -8, "Pinky": -17}, thumb=(0.5, 0.85, 0.0)),
    "flat": dict(curl={f: (8, 10, 6) for f in RELAXED}, spread={}, thumb=(0.85, 0.4, 0.15)),
    "soft": dict(curl={f: (22, 28, 16) for f in RELAXED}, spread={}, thumb=(0.8, 0.4, 0.3)),
    "finger_heart": dict(curl={"Index": (25, 50, 35), "Middle": (95, 100, 70), "Ring": (95, 100, 70), "Pinky": (95, 100, 70)},
                         spread={"Index": 14}, thumb=(0.95, 0.3, 0.3)),
    "chin": dict(curl={"Index": (0, 4, 4), "Middle": (80, 95, 60), "Ring": FOLDED, "Pinky": FOLDED}, spread={"Index": 6},
                 thumb=(0.2, 0.6, 0.75)),
    "arch": dict(curl={f: (18, 22, 14) for f in RELAXED}, spread={}, thumb=(0.85, 0.35, 0.35)),
}


def sided(side, vector):
    """Vector viết cho tay/chân PHẢI (ở -X); lật X cho bên trái."""
    return Vector((vector[0] if side == "Right" else -vector[0], vector[1], vector[2]))


class Rig:
    """Hình học lúc nghỉ của một bộ xương (hệ armature)."""

    def __init__(self, armature):
        self.names = [b.name[len("mixamorig"):] for b in armature.data.bones]
        bones = {b.name[len("mixamorig"):]: b for b in armature.data.bones}
        self.parent = {n: (b.parent.name[len("mixamorig"):] if b.parent else None) for n, b in bones.items()}
        self.head = {n: b.head_local.copy() for n, b in bones.items()}
        self.rest = {n: b.matrix_local.to_quaternion() for n, b in bones.items()}
        self.top = bones["Head"].tail_local.z
        self.hips_z = self.head["Hips"].z
        self.k = self.hips_z / 0.9311
        self.hand, self.hand_length, self.female = {}, {}, False
        for side in ("Left", "Right"):
            p = side + "Hand"
            along = (self.head[p + "Middle1"] - self.head[p]).normalized()
            lateral = (self.head[p + "Index1"] - self.head[p + "Pinky1"])
            lateral = (lateral - along * lateral.dot(along)).normalized()
            palm = along.cross(lateral).normalized()
            sign = 1.0
            if palm.z > 0:            # ở tư thế chữ A lòng bàn tay úp xuống
                palm.negate()
                sign = -1.0
            self.hand[side] = (along, lateral, palm, sign)
            chain = [self.head[p]] + [self.head["%sMiddle%d" % (p, j)] for j in (1, 2, 3)]
            self.hand_length[side] = sum((b - a).length for a, b in zip(chain, chain[1:])) + 0.03 * self.k

    def direction(self, name, child):
        return (self.head[child] - self.head[name]).normalized()


class Pose:
    """Tư thế = phép quay tuyệt đối (so với nghỉ, hệ armature) của từng xương; xương không đặt thì theo xương cha."""

    def __init__(self, rig):
        self.rig, self.explicit, self.offset = rig, {}, Vector()
        self.solve()

    def solve(self):
        rig, self.delta, self.pos = self.rig, {}, {}
        for name in rig.names:
            parent = rig.parent[name]
            if parent is None:
                self.delta[name] = self.explicit.get(name, IDENTITY)
                self.pos[name] = rig.head[name] + self.offset
            else:
                self.delta[name] = self.explicit.get(name, self.delta[parent])
                self.pos[name] = self.pos[parent] + self.delta[parent] @ (rig.head[name] - rig.head[parent])

    def rotate(self, name, axis, degrees):
        self.solve()
        self.explicit[name] = Quaternion(Vector(axis), math.radians(degrees)) @ self.delta[name]
        self.solve()

    def limb(self, upper, lower, end, target, pole):
        """IK hai đốt: đưa gốc xương `end` tới `target`, khuỷu/gối lệch về phía `pole`."""
        self.solve()
        rig, start = self.rig, self.pos[upper]
        first, second = (rig.head[lower] - rig.head[upper]).length, (rig.head[end] - rig.head[lower]).length
        reach = target - start
        distance = min(max(reach.length, abs(first - second) + 1e-4), (first + second) * 0.999)
        along = reach.normalized()
        a = (first * first - second * second + distance * distance) / (2 * distance)
        height = math.sqrt(max(first * first - a * a, 0.0))
        side = Vector(pole) - along * Vector(pole).dot(along)
        side = side.normalized() if side.length > 1e-5 else along.orthogonal().normalized()
        joint = start + along * a + side * height
        tip = start + along * distance
        base = self.delta[rig.parent[upper]]
        swing = (base @ rig.direction(upper, lower)).rotation_difference(joint - start) @ base
        self.explicit[upper] = swing
        self.explicit[lower] = (swing @ rig.direction(lower, end)).rotation_difference(tip - joint) @ swing
        self.solve()

    def arm(self, side, wrist, pole, fingers_to=None, palm_to=None, thumb_side_to=None, hand="relaxed"):
        """wrist, pole và các hướng viết cho tay phải (tự lật cho tay trái). Đích cổ tay trong hệ armature."""
        rig = self.rig
        self.solve()
        shoulder = self.pos[side + "Arm"]
        if wrist.z > shoulder.z + 0.05:      # tay giơ cao: nâng xương đòn một chút
            rest_dir = self.delta[side + "Shoulder"] @ rig.direction(side + "Shoulder", side + "Arm")
            lifted = (rest_dir + Vector((0, 0, 0.3))).normalized()
            self.explicit[side + "Shoulder"] = rest_dir.rotation_difference(lifted) @ self.delta[side + "Shoulder"]
        self.limb(side + "Arm", side + "ForeArm", side + "Hand", wrist, sided(side, pole))
        along, lateral, palm, sign = rig.hand[side]
        if fingers_to is not None:
            forward = sided(side, fingers_to).normalized()
            if thumb_side_to is not None:
                index_side = sided(side, thumb_side_to)
            else:
                index_side = sign * sided(side, palm_to).cross(forward)
            index_side = (index_side - forward * index_side.dot(forward)).normalized()
            first = along.rotation_difference(forward)
            moved = first @ lateral
            angle = moved.angle(index_side)
            if moved.cross(index_side).dot(forward) < 0:
                angle = -angle
            turn = Quaternion(forward, angle) @ first
            fore = self.explicit[side + "ForeArm"]
            axis = (self.pos[side + "Hand"] - self.pos[side + "ForeArm"]).normalized()
            relative = turn @ fore.inverted()
            twist = Quaternion((relative.w, *(axis * Vector((relative.x, relative.y, relative.z)).dot(axis))))
            if twist.magnitude > 1e-6:       # chia 60% độ vặn cổ tay cho cẳng tay để cổ tay không xoắn như kẹo
                twist.normalize()
                self.explicit[side + "ForeArm"] = IDENTITY.slerp(twist, 0.6) @ fore
            self.explicit[side + "Hand"] = turn
        self.solve()
        self.fingers(side, hand)

    def fingers(self, side, preset):
        rig, spec = self.rig, HANDS[preset]
        along, lateral, palm, _sign = rig.hand[side]
        base = self.delta[side + "Hand"]
        p = side + "Hand"
        for finger, angles in spec["curl"].items():
            direction = rig.direction(p + finger + "1", p + finger + "2")
            bend_axis = lateral if ((Quaternion(lateral, 0.3) @ direction) - direction).dot(palm) > 0 else -lateral
            spread_axis = palm if ((Quaternion(palm, 0.3) @ direction) - direction).dot(lateral) > 0 else -palm
            spread = Quaternion(spread_axis, math.radians(spec["spread"].get(finger, 0.0)))
            if finger not in spec["spread"]:
                middle = rig.direction(p + "Middle1", p + "Middle2")
                spread = direction.rotation_difference(direction.lerp(middle, FINGER_CLOSE).normalized())
            total = 0.0
            for joint, degrees in enumerate(angles, start=1):
                total += degrees
                self.explicit["%s%s%d" % (p, finger, joint)] = base @ spread @ Quaternion(bend_axis, math.radians(total))
        a, b, c = spec["thumb"]
        goal = (along * a + lateral * b + palm * c).normalized()
        thumb = rig.direction(p + "Thumb1", p + "Thumb2")
        self.explicit[p + "Thumb1"] = base @ thumb.rotation_difference(goal)
        for joint in (2, 3):
            self.explicit["%sThumb%d" % (p, joint)] = self.explicit[p + "Thumb1"]
        self.solve()

    def hang(self, side, hand="relaxed", out=0.07, forward=0.03):
        """Tay buông tự nhiên dọc thân."""
        rig = self.rig
        self.solve()
        length = (rig.head[side + "ForeArm"] - rig.head[side + "Arm"]).length + (rig.head[side + "Hand"] - rig.head[side + "ForeArm"]).length
        wrist = self.pos[side + "Arm"] + sided(side, (-out * rig.k, -forward * rig.k, -length * 0.985))
        self.arm(side, wrist, (0.0, 1.0, 0.0), hand=hand)

    def legs(self, foot_shift=None, heel=0.0, knee_out=0.25):
        """Giữ hai bàn chân trên đất tại vị trí nghỉ (+ độ dời theo từng bên); heel > 0 thì nhấc gót chừng ấy độ."""
        rig = self.rig
        for side in ("Left", "Right"):
            shift = Vector((foot_shift or {}).get(side, (0.0, 0.0, 0.0))) * rig.k
            reach = (rig.head[side + "ToeBase"] - rig.head[side + "Foot"]).length
            shift += Vector((0.0, -reach * (1.0 - math.cos(math.radians(heel))) , reach * math.sin(math.radians(heel)) * 0.85))
            self.limb(side + "UpLeg", side + "Leg", side + "Foot", rig.head[side + "Foot"] + shift, sided(side, (-knee_out, -1.0, 0.0)))
            self.explicit[side + "Foot"] = Quaternion((1.0, 0.0, 0.0), math.radians(heel))
            self.explicit[side + "ToeBase"] = IDENTITY
        self.solve()

    def at(self, bone, right_offset, side="Right"):
        """Điểm cách gốc xương `bone` một khoảng (viết cho bên phải), co theo cỡ người."""
        return self.pos[bone] + sided(side, right_offset) * self.rig.k


# ---------------------------------------------------------------- mười hai dáng
# Mỗi hàm nhận (pose, t) với t trong [0, 1] và đặt tay; thân/chân/thở do build_pose lo qua bảng BODY.

def peace(p, t):
    p.arm("Right", p.at("Head", (-0.165, -0.10, -0.015)), (-0.5, -0.1, -1.0), fingers_to=(-0.12, 0.0, 1.0), palm_to=(0, -1, 0), hand="victory")
    p.hang("Left")


def peace2(p, t):
    for side in ("Right", "Left"):
        p.arm(side, p.at("Head", (-0.16, -0.10, -0.03), side), (-0.25, -0.15, -1.0), fingers_to=(-0.15, 0.0, 1.0), palm_to=(0, -1, 0), hand="victory")


def heart(p, t):
    # Bàn tay đưa ra trước, ngang má-vai, lệch ngoài vai; lòng bàn tay hướng máy ảnh; ngón cái bắt chéo ngón trỏ.
    p.arm("Right", p.at("Head", (-0.255, -0.20, -0.06)), (-0.45, 0.1, -1.0), fingers_to=(-0.05, -0.1, 1.0), palm_to=(0.1, -1.0, 0.0), hand="finger_heart")
    if p.rig.female:      # nữ: tay trái chống nhẹ hông
        p.arm("Left", p.at("Hips", (-0.185, -0.02, 0.085), "Left"), (-1.0, 0.55, 0.0), fingers_to=(0.25, -0.75, -0.6), palm_to=(1.0, 0.1, 0.0), hand="soft")
    else:
        p.hang("Left")


def bigheart(p, t):
    # Hai khuỷu mở ngang trên vai, cẳng tay cong vào, bàn tay úp, đầu ngón chạm đỉnh đầu.
    top = p.rig.top + p.offset.z
    for side in ("Right", "Left"):
        reach = p.rig.hand_length[side]
        fingers = Vector((0.80, 0.0, -0.60))
        tip = Vector((-0.012 * p.rig.k, p.pos["Head"].y - 0.005, top + 0.012 * p.rig.k))
        wrist = sided(side, tip - fingers * reach)
        p.arm(side, wrist, (-1.0, 0.1, 0.45), fingers_to=fingers, palm_to=(0.0, 0.0, -1.0), hand="arch")


def wave(p, t):
    sway = math.sin(4 * math.pi * t)
    p.arm("Right", p.at("Head", (-0.30 - 0.07 * sway, -0.06, 0.20)), (-1.0, 0.1, -0.6), fingers_to=(-0.25 * sway - 0.05, 0.0, 1.0), palm_to=(0, -1, 0), hand="open")
    p.hang("Left")


def thumb(p, t):
    p.arm("Right", p.at("Spine2", (-0.13, -0.29, 0.07)), (-0.6, 0.0, -1.0), fingers_to=(0.35, -0.9, 0.05), thumb_side_to=(0.0, 0.0, 1.0), hand="fist_thumb")
    p.hang("Left")


def hips(p, t):
    for side in ("Right", "Left"):
        p.arm(side, p.at("Hips", (-0.185, -0.02, 0.085), side), (-1.0, 0.55, 0.0), fingers_to=(0.25, -0.75, -0.6), palm_to=(1.0, 0.1, 0.0), hand="soft")


def cross(p, t):
    p.arm("Left", p.at("Spine2", (-0.115, -0.165, -0.075), "Left"), (-0.7, -0.1, -1.0), fingers_to=(0.9, -0.1, 0.35), palm_to=(0.0, 1.0, 0.0), hand="flat")
    p.arm("Right", p.at("Spine2", (0.105, -0.215, -0.03)), (-0.7, -0.15, -1.0), fingers_to=(0.9, 0.15, 0.3), palm_to=(0.0, 1.0, 0.0), hand="flat")


def chin(p, t):
    # Tay phải đỡ cằm: ngón cái dưới cằm, ngón trỏ dọc má; khuỷu phải tựa lên mu bàn tay trái vắt ngang bụng trên.
    wrist = p.at("Head", (-0.05, -0.105, -0.115))
    tip = p.at("Head", (-0.082, -0.055, 0.06))
    p.arm("Right", wrist, (-0.2, -0.4, -1.0), fingers_to=tuple(tip - wrist), palm_to=(0.65, 0.75, 0.0), hand="chin")
    elbow = p.pos["RightForeArm"]
    p.arm("Left", elbow + Vector((0.035, -0.005, -0.04)) * p.rig.k, (-0.6, -0.1, -1.0), fingers_to=(0.95, -0.2, 0.0), palm_to=(0.0, 0.0, -1.0), hand="flat")


def grace(p, t):
    if p.rig.female:      # hai tay chắp nhẹ trước bụng dưới, tay phải úp lên mu tay trái, các ngón khép
        p.arm("Left", p.at("Hips", (-0.02, -0.15, 0.065), "Left"), (-1.0, 0.35, -0.2), fingers_to=(0.8, -0.2, -0.55), palm_to=(0.0, 1.0, 0.3), hand="flat")
        p.arm("Right", p.at("Hips", (-0.015, -0.172, 0.085)), (-1.0, 0.35, -0.2), fingers_to=(0.8, -0.15, -0.55), palm_to=(0.0, 1.0, 0.3), hand="flat")
    else:                 # nam: hai tay chắp sau lưng
        p.arm("Left", p.at("Hips", (-0.02, 0.125, 0.02), "Left"), (-1.0, 0.5, 0.1), fingers_to=(0.85, 0.1, -0.5), palm_to=(0.0, 1.0, 0.0), hand="soft")
        p.arm("Right", p.at("Hips", (-0.015, 0.145, 0.045)), (-1.0, 0.5, 0.1), fingers_to=(0.85, 0.1, -0.5), palm_to=(0.0, 1.0, 0.0), hand="soft")


def cheer(p, t):
    for side in ("Right", "Left"):
        p.arm(side, p.at("Head", (-0.40, -0.03, 0.40), side), (-1.0, 0.2, -0.3), fingers_to=(-0.55, 0.0, 0.85), palm_to=(0, -1, 0), hand="open")


def squat(p, t):
    p.arm("Right", p.at("Head", (-0.17, -0.11, -0.02)), (-0.5, -0.1, -1.0), fingers_to=(-0.12, 0.0, 1.0), palm_to=(0, -1, 0), hand="victory")
    knee = p.pos["LeftLeg"]
    p.arm("Left", knee + Vector((0.0, -0.035, 0.055)) * p.rig.k, (-1.0, 0.3, 0.2), fingers_to=(0.0, -0.75, -0.65), palm_to=(0.0, -0.4, -1.0), hand="soft")


# tên -> (hàm đặt tay, độ dời hông (x sang phải của nhân vật là -X, y, z) m, nghiêng hông quanh trục trước-sau (độ),
#         ngả thân quanh trục ngang (độ, dương = cúi), dời bàn chân theo bên)
POSES = {
    "pose_peace": (peace, (0.025, 0.0, -0.006), 4.0, 0.0, None),
    "pose_peace2": (peace2, (0.0, 0.0, -0.003), 0.0, 0.0, None),
    "pose_heart": (heart, (0.015, 0.0, -0.004), 2.5, 0.0, None),
    "pose_bigheart": (bigheart, (0.0, 0.0, -0.003), 0.0, 0.0, None),
    "pose_wave": (wave, (0.01, 0.0, -0.003), 2.0, 0.0, None),
    "pose_thumb": (thumb, (0.01, 0.0, -0.003), 1.5, 0.0, None),
    "pose_hips": (hips, (0.035, 0.0, -0.01), 5.0, 0.0, None),
    "pose_cross": (cross, (0.0, 0.0, -0.003), 0.0, -2.0, None),
    "pose_chin": (chin, (0.015, 0.0, -0.004), 2.5, 0.0, None),
    "pose_grace": (grace, (0.012, 0.0, -0.012), 2.5, 0.0, {"Left": (-0.07, -0.11, 0.0)}),
    "pose_cheer": (cheer, (0.0, 0.0, -0.003), 0.0, -5.0, None),
    "pose_squat": (squat, (0.0, 0.05, -0.40), 0.0, 12.0, {"Left": (-0.05, 0.0, 0.0), "Right": (0.05, 0.0, 0.0)}),
}


def stand(p, t):
    p.hang("Right")
    p.hang("Left")


# Dáng đứng thường (không thuộc poses.glb): make_anims dùng làm clip idle / agree / headShake của anims.glb.
STANDING = {"idle": (stand, (0.012, 0.0, -0.004), 2.0, 0.0, None)}


def build_pose(rig, name, t, head=None):
    arms, shift, sway, lean, feet = POSES[name] if name in POSES else STANDING[name]
    pose = Pose(rig)
    breath = math.sin(2 * math.pi * t)
    pose.offset = Vector((shift[0], shift[1], shift[2] + 0.0015 * breath)) * rig.k
    pose.explicit["Hips"] = Quaternion((0.0, 1.0, 0.0), math.radians(sway)) @ Quaternion((1.0, 0.0, 0.0), math.radians(lean * 0.6))
    pose.solve()
    pose.explicit["Spine"] = Quaternion((1.0, 0.0, 0.0), math.radians(lean)) @ Quaternion((0.0, 1.0, 0.0), math.radians(-sway * 0.35))
    pose.explicit["Spine2"] = Quaternion((1.0, 0.0, 0.0), math.radians(-0.9 * breath)) @ pose.explicit["Spine"]
    pose.solve()
    if name == "pose_squat":
        pose.legs(feet, heel=SQUAT_HEEL, knee_out=0.05)
    else:
        pose.legs(feet)
    arms(pose, t)
    pose.explicit["Head"] = IDENTITY      # đầu giữ hướng nghỉ; runtime tự xoay đầu nhìn máy ảnh
    if head is not None:                  # gật / lắc đầu (cho clip agree, headShake)
        axis, degrees, beats, one_way = ma.HEAD_MOTION[head]
        wave = 0.5 * (1.0 - math.cos(2 * math.pi * beats * t)) if one_way else math.sin(2 * math.pi * beats * t)
        pose.explicit["Head"] = Quaternion(Vector(axis), math.radians(degrees) * wave * math.sin(math.pi * t))
    pose.solve()
    return pose


def bake(target, name, rig, hips_scale, frames=FRAMES, base=None, head=None):
    """Ghi một dáng (giải trên `rig`) thành action trên armature `target`."""
    action = bpy.data.actions.new(name)
    target.animation_data_create()
    target.animation_data.action = action
    pose_bones = {b.name[len("mixamorig"):]: b for b in target.pose.bones}
    previous = {}
    for frame in range(frames):
        pose = build_pose(rig, base or (name[:-2] if name.endswith("_f") else name), frame / (frames - 1), head)
        world = {n: pose.delta[n] @ rig.rest[n] for n in rig.names}
        for bone_name in rig.names:
            parent = rig.parent[bone_name]
            if parent is None:
                local = rig.rest[bone_name].inverted() @ world[bone_name]
            else:
                local = (rig.rest[parent].inverted() @ rig.rest[bone_name]).inverted() @ (world[parent].inverted() @ world[bone_name])
            if bone_name in previous and previous[bone_name].dot(local) < 0:
                local.negate()
            previous[bone_name] = local
            bone = pose_bones[bone_name]
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = local
            bone.keyframe_insert("rotation_quaternion", frame=frame)
        hips = pose_bones["Hips"]
        hips.location = rig.rest["Hips"].inverted() @ (pose.offset * hips_scale)
        hips.keyframe_insert("location", frame=frame)
    track = target.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    target.animation_data.action = None


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    people = os.path.join(ma.ROOT, "assets", "people")
    parser.add_argument("--male", default=os.path.join(people, "m_white.glb"))
    parser.add_argument("--female", default=os.path.join(people, "f_white.glb"))
    parser.add_argument("--out", default=os.path.join(people, "poses.glb"))
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = ma.FPS
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    female, _objects = ma.import_glb(os.path.abspath(args.female))
    female_rig = Rig(female)
    female_rig.female = True
    target, _objects = ma.import_glb(os.path.abspath(args.male))
    male_rig = Rig(target)
    names = []
    for name in POSES:
        bake(target, name, male_rig, 1.0)
        bake(target, name + "_f", female_rig, male_rig.hips_z / female_rig.hips_z)
        names += [name, name + "_f"]
        print("DANG %s: hông hạ %.3f m (nam), %.3f m (nữ, trước khi quy đổi)" % (name, -POSES[name][1][2] * male_rig.k, -POSES[name][1][2] * female_rig.k))
    for obj in list(bpy.data.objects):
        if obj is not target:
            bpy.data.objects.remove(obj)
    out = os.path.abspath(args.out)
    staged = out[:-4] + ".staging.glb"
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.export_scene.gltf(
        filepath=staged, export_format="GLB", export_yup=True, use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=False,
        export_frame_range=False, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
        export_skins=True, export_cameras=False, export_lights=False, export_def_bones=False)
    ma.keep_rotation_and_hips_only(staged)
    os.replace(staged, out)
    manifest_path = os.path.join(os.path.dirname(out), "manifest.json")
    manifest = {}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    manifest["poses"] = {"file": os.path.basename(out), "bytes": os.path.getsize(out), "fps": ma.FPS, "frames": FRAMES,
                         "hipsRestHeight": round(male_rig.hips_z, 4), "clips": names,
                         "note": "Clip hậu tố _f giải trên bộ xương nữ (f_white); kênh vị trí hông đã quy về hipsRestHeight này."}
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("XONG poses -> %s (%.2f MB), %d clip" % (out, os.path.getsize(out) / 1e6, len(names)))


if __name__ == "__main__":
    main()
