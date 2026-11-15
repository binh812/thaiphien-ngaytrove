"""Bộ clip bổ sung từ Universal Animation Library 1 + 2 (Quaternius, CC0) và bộ clip "starter man" của Patch (CC0),
chuyển sang bộ xương MPFB của bộ người → assets/people/anims_ual.glb (nạp kèm anims.glb; anims.glb không bị đụng tới).

Chạy (lặp lại được, không cần tệp tạm nào ngoài .tools/dl):
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/make_anims_ual.py -- \
        [--character assets/people/m_white.glb] [--out assets/people/anims_ual.glb] [--only jog,idle_am]

Nguồn (đều CC0, xem assets/people/LICENSE.md):
    u1 = .tools/dl/ual/x/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb (+ _RM để lấy tốc độ gốc)
    u2 = .tools/dl/ual2/x/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb (+ _RM)
    pm = .tools/dl/patch-starter-man/starter-man-clips.glb (patch.gg/blendi/coloured-pencil, public/figure/; tệp chỉ có nút xương,
         không có skin → script tự thêm một skin vào bản sao tạm để Blender dựng được armature)

Cách chuyển xương dùng lại nguyên của make_anims.py (phép quay thế giới so với tư thế nghỉ + hiệu chỉnh hướng xương; hông co theo
chiều cao hông; clip lặp chạy tại chỗ, tốc độ gốc ghi vào manifest: rootSpeed, m/s ở cỡ m_white). Sau khi xuất, tệp được
viết lại gọn: kênh đứng yên chỉ giữ 2 khoá, clip chậm giữ 15 khoá/giây, các kênh dùng chung một mảng thời gian.
"""
import argparse
import json
import os
import struct
import sys
import tempfile

import bpy
from mathutils import Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_anims as ma  # noqa: E402

DL = os.path.join(ma.ROOT, ".tools", "dl")
UAL1 = os.path.join(DL, "ual", "x", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard%s.glb")
UAL2 = os.path.join(DL, "ual2", "x", "Universal Animation Library 2[Standard]", "Unreal-Godot", "UAL2_Standard%s.glb")
SOURCES = {"u1": UAL1 % "", "u2": UAL2 % "", "pm": os.path.join(DL, "patch-starter-man", "starter-man-clips.glb")}
ROOT_MOTION = {"u1": UAL1 % "_RM", "u2": UAL2 % "_RM", "pm": SOURCES["pm"]}   # tệp có kênh dịch chuyển của xương root
IDLE_OF = {"u1": "Idle_Loop", "u2": None, "pm": "Idle"}   # clip làm mốc "đứng thẳng" cho các khớp thân (u2 dùng mốc của u1: cùng bộ xương)

# tên xuất: (nguồn, clip nguồn, tuỳ chọn). upright: xem nhóm đứng nghỉ · loop: clip lặp (khử trôi, chạy tại chỗ) · half: giữ 15 khoá/giây · hand: cổ tay theo nguồn
# bao nhiêu (0..1) · air: clip trên không (hông giữ ở độ cao nghỉ, gốc nhân vật do vật lý nâng) · anchor: khung neo ngang của clip một lượt · cut: chỉ lấy phần đầu clip
CLIPS = {
    # Đã thử rồi bỏ (15/11/2026): Jog_Fwd_Loop (u1) pha vào clip chạy CMU làm chân trụ trượt 0,4 m/s vì pha chạm đất khác nhau; Walk_Loop (u1, 0,99 m/s) và
    # Run (pm, 5,6 m/s) không hợp tốc độ đi 1,5 / chạy 4,2 m/s bằng clip CMU đang dùng; Idle_Loop (u1) là dáng thủ thế chân trước chân sau.
    # đứng nghỉ (upright: lấy dáng trung bình của chính clip làm mốc đứng thẳng cho các khớp thân — không thì ngả người ra sau so với Idle_Loop)
    "idle_am": ("pm", "AM_Idle", dict(loop=True, half=True, upright=True)),
    # "idle_look": ("pm", "Idle_LookAround", dict(loop=True, half=True, upright=True, cut=0.56)) — đã thử: dáng choãi chân trước chân sau, mỗi lần đổi dáng bàn chân trượt → bỏ
    "idle_fold": ("u2", "Idle_FoldArms_Loop", dict(loop=True, half=True, hand=0.8)),
    # nhảy
    "jump_start": ("u1", "Jump_Start", dict(air=True)),
    "jump_loop": ("u1", "Jump_Loop", dict(loop=True, air=True, half=True)),
    "jump_land": ("u1", "Jump_Land", dict(anchor=-1)),
    # Chuyển thử được nhưng trò chơi chưa có chỗ dùng (15/11/2026) — thêm lại dòng tương ứng khi cần:
    #   "idle_phone": ("u2", "Idle_TalkingPhone_Loop", dict(loop=True, half=True, hand=0.8)), "idle_rail": ("u2", "Idle_Rail_Loop", dict(loop=True, half=True, hand=0.6)),
    #   "rail_call": ("u2", "Idle_Rail_Call", ...), "yes": ("u2", "Yes", ...), "no": ("u2", "Idle_No_Loop", ...), "throw": ("u2", "OverhandThrow", dict(anchor=0, hand=0.7)),
    #   "consume": ("u2", "Consume", dict(anchor=0, hand=0.8)), "carry": ("u2", "Walk_Carry_Loop", dict(loop=True, hand=0.6)), "push": ("u1", "Push_Loop", dict(loop=True, hand=0.6)),
    #   "dance": ("u1", "Dance_Loop", dict(loop=True)), "watering": ("u2", "Farm_Watering", ...), "chest_open": ("u2", "Chest_Open", dict(anchor=0, hand=0.5)),
}


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    json_length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    return gltf, data[20 + json_length + 8:]


def write_glb(path, gltf, binary):
    blob = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    blob += b" " * (-len(blob) % 4)
    binary += b"\0" * (-len(binary) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(blob) + 8 + len(binary)))
        f.write(struct.pack("<I4s", len(blob), b"JSON") + blob)
        f.write(struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def accessor_floats(gltf, binary, index):
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    if accessor["componentType"] != 5126 or view.get("byteStride", width * 4) != width * 4:
        raise RuntimeError("Chỉ đọc được accessor float32 xếp liền")
    return list(struct.unpack_from("<%df" % (accessor["count"] * width), binary, start)), width


def root_speeds(path):
    """{tên clip: tốc độ gốc m/s (ở cỡ của nguồn)} đọc từ kênh translation của xương root."""
    gltf, binary = read_glb(path)
    speeds = {}
    for animation in gltf.get("animations", []):
        for channel in animation["channels"]:
            if channel["target"]["path"] != "translation" or gltf["nodes"][channel["target"]["node"]]["name"] != "root":
                continue
            sampler = animation["samplers"][channel["sampler"]]
            times, _ = accessor_floats(gltf, binary, sampler["input"])
            values, _ = accessor_floats(gltf, binary, sampler["output"])
            travel = Vector((values[-3] - values[0], 0.0, values[-1] - values[2])).length
            if times[-1] > times[0]:
                speeds[animation["name"]] = travel / (times[-1] - times[0])
    return speeds


def with_skin(path):
    """Tệp chỉ có nút xương (không skin) thì Blender nhập thành các empty: ghi một bản sao tạm có thêm skin gồm mọi nút dưới 'root'."""
    gltf, binary = read_glb(path)
    if gltf.get("skins"):
        return path
    nodes = gltf["nodes"]
    root = next(i for i, n in enumerate(nodes) if n.get("name") == "root")
    joints, stack = [], [root]
    while stack:
        index = stack.pop()
        joints.append(index)
        stack.extend(nodes[index].get("children", []))
    gltf["skins"] = [{"joints": joints, "skeleton": root, "name": "Armature"}]
    out = os.path.join(tempfile.mkdtemp(prefix="ual_skin_"), os.path.basename(path))
    write_glb(out, gltf, binary)
    return out


def find_action(actions, name):
    exact = [a for n, a in actions.items() if n == name]
    if exact:
        return exact[0]
    loose = sorted((a for n, a in actions.items() if n.startswith(name + "_") and n[len(name) + 1:].split(".")[0] in ("Armature", "Mannequin", "root")),
                   key=lambda a: len(a.name))
    if not loose:
        raise RuntimeError("Nguồn không có clip " + name)
    return loose[0]


def trunk_names(shared):
    return [n for n in shared if n.replace("mixamorig", "").replace("Left", "").replace("Right", "") in ma.TRUNK]


def mean_rotations(frames, names):
    out = {}
    for name in names:
        first, total = frames[0][0][name], Quaternion((0.0, 0.0, 0.0, 0.0))
        for rotations, _hips in frames:
            q = rotations[name]
            total += q if q.dot(first) >= 0 else -q
        out[name] = total.normalized()
    return out


class Source:
    """Một tệp nguồn đã nhập: armature, các action, tư thế nghỉ, phép hiệu chỉnh sang bộ xương đích."""

    def __init__(self, key, target):
        before = set(bpy.data.actions)
        self.key = key
        self.rig, _objects = ma.import_glb(with_skin(SOURCES[key]))
        self.actions = {a.name: a for a in bpy.data.actions if a not in before}
        bpy.context.view_layer.update()
        self.shared = ma.ordered_shared_bones(self.rig, target)
        if ma.HIPS not in self.shared:
            raise RuntimeError("Không khớp được xương hông với nguồn " + key)
        bones = {ma.canonical(b.name): b for b in self.rig.data.bones}
        self.rest = {n: ma.rest_world_rotation(self.rig, bones[n]) for n in self.shared}
        self.corrections = ma.build_corrections(self.rig, target, set(self.shared))
        self.rest_hips = ma.rest_world_head(self.rig, bones[ma.HIPS])
        target_bones = {ma.canonical(b.name): b for b in target.data.bones}
        self.scale = ma.rest_world_head(target, target_bones[ma.HIPS]).z / self.rest_hips.z
        self.speeds = root_speeds(ROOT_MOTION[key])

    def sample(self, name):
        return ma.sample_clip(self.rig, find_action(self.actions, name), self.shared)

    def lead_phase(self, name):
        """Phần của chu kỳ (0..1) mà bàn chân trái vươn ra trước hông xa nhất — mốc pha chung để trộn các clip đi/chạy."""
        action = find_action(self.actions, name)
        ma.set_source_action(self.rig, action)
        start, end = (int(round(v)) for v in action.frame_range)
        pose = {ma.canonical(p.name): p for p in self.rig.pose.bones}
        leads = []
        for frame in range(start, end):      # khung cuối trùng khung đầu
            bpy.context.scene.frame_set(frame)
            foot = (self.rig.matrix_world @ pose["mixamorigLeftFoot"].matrix).to_translation()
            hips = (self.rig.matrix_world @ pose[ma.HIPS].matrix).to_translation()
            leads.append(-(foot.y - hips.y))      # mặt nhân vật nhìn về -Y của Blender
        return leads.index(max(leads)) / max(end - start, 1)


def bake(target, out_name, source, source_name, options):
    frames = source.sample(source_name)
    if options.get("cut"):      # chỉ lấy phần đầu của clip (phần của độ dài)
        frames = frames[:max(2, int(round(len(frames) * options["cut"])))]
    if options.get("loop") or options.get("air"):
        offsets = ma.hips_offsets(frames, source.rest_hips, source.scale)
    else:
        anchor = options.get("anchor", 0)
        offsets = ma.hips_offsets(frames, source.rest_hips, source.scale, anchor if anchor >= 0 else len(frames) - 1)
    if options.get("air"):      # trên không: hông ở độ cao nghỉ, chỉ giữ dáng (gốc nhân vật do vật lý của trò chơi nâng lên)
        offsets = [Vector((o.x, o.y, 0.0)) for o in offsets]
    ma.HAND_FOLLOW = options.get("hand", 0.0)
    rest = source.rest
    if options.get("upright"):
        rest = dict(rest, **mean_rotations(frames, trunk_names(source.shared)))
    ma.bake_clip(target, out_name, frames, rest, source.corrections, source.shared, offsets)
    ma.HAND_FOLLOW = 0.0
    info = {"frames": len(frames), "duration": round((len(frames) - 1) / ma.FPS, 4), "from": "%s:%s" % (source.key, source_name)}
    speed = source.speeds.get(source_name, 0.0) * source.scale
    if options.get("loop") and speed > 0.05:
        info["rootSpeed"] = round(speed, 3)
        info["leadPhase"] = round(source.lead_phase(source_name), 4)
    print("CLIP %-12s <- %s:%-24s %3d khung%s" % (out_name, source.key, source_name, len(frames),
                                                  "  gốc %.2f m/s" % speed if "rootSpeed" in info else ""))
    return info


CONSTANT_EPS = 2e-4


def compact(path, half):
    """Viết lại tệp cho gọn: kênh không đổi giữ 2 khoá, clip trong `half` giữ mỗi khoá thứ hai, mảng thời gian dùng chung trong từng clip."""
    gltf, binary = read_glb(path)
    out, views, accessors = bytearray(), [], []

    def add(values, kind):
        offset = len(out)
        out.extend(struct.pack("<%df" % len(values), *values))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(values) * 4})
        width = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[kind]
        accessor = {"bufferView": len(views) - 1, "componentType": 5126, "count": len(values) // width, "type": kind}
        if kind == "SCALAR":
            accessor["min"], accessor["max"] = [min(values)], [max(values)]
        accessors.append(accessor)
        return len(accessors) - 1

    kept = {}

    def keep(index):      # accessor ngoài phần hoạt hoạ (ma trận của skin): chép nguyên
        if index not in kept:
            values, _width = accessor_floats(gltf, binary, index)
            kept[index] = add(values, gltf["accessors"][index]["type"])
        return kept[index]

    for skin in gltf.get("skins", []):
        if "inverseBindMatrices" in skin:
            accessor = gltf["accessors"][skin["inverseBindMatrices"]]
            view = gltf["bufferViews"][accessor["bufferView"]]
            start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            offset = len(out)
            out.extend(binary[start:start + accessor["count"] * 64])
            views.append({"buffer": 0, "byteOffset": offset, "byteLength": accessor["count"] * 64})
            accessors.append(dict(accessor, bufferView=len(views) - 1, byteOffset=0))
            skin["inverseBindMatrices"] = len(accessors) - 1
    if gltf.get("meshes"):
        raise RuntimeError("Tệp hoạt hoạ không được có lưới")
    for animation in gltf["animations"]:
        step, time_cache = (2 if animation["name"] in half else 1), {}
        for sampler in animation["samplers"]:
            times, _ = accessor_floats(gltf, binary, sampler["input"])
            values, width = accessor_floats(gltf, binary, sampler["output"])
            count = len(times)
            keys = [values[i * width:(i + 1) * width] for i in range(count)]
            if all(max(abs(a - b) for a, b in zip(k, keys[0])) < CONSTANT_EPS for k in keys):
                picked = [0, count - 1]
            else:
                picked = sorted(set(list(range(0, count, step)) + [count - 1]))
            stamp = tuple(round(times[i], 5) for i in picked)
            if stamp not in time_cache:
                time_cache[stamp] = add([times[i] for i in picked], "SCALAR")
            sampler["input"] = time_cache[stamp]
            sampler["output"] = add([v for i in picked for v in keys[i]], "VEC4" if width == 4 else "VEC3")
            sampler["interpolation"] = "LINEAR"
    gltf["accessors"], gltf["bufferViews"] = accessors, views
    gltf["buffers"] = [{"byteLength": len(out) + (-len(out) % 4)}]
    write_glb(path, gltf, bytes(out))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--character", default=os.path.join(ma.ROOT, "assets", "people", "m_white.glb"))
    parser.add_argument("--out", default=os.path.join(ma.ROOT, "assets", "people", "anims_ual.glb"))
    parser.add_argument("--only", default="", help="chỉ xuất các clip này (tên xuất, cách nhau dấu phẩy) — để thử nhanh")
    args = parser.parse_args(argv)
    wanted = {k: v for k, v in CLIPS.items() if not args.only or k in args.only.split(",")}

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = ma.FPS
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    target, target_objects = ma.import_glb(os.path.abspath(args.character))
    for obj in [o for o in target_objects if o.type == "MESH"]:
        bpy.data.objects.remove(obj)
    bpy.context.view_layer.update()

    sources = {}
    for key in ["u1"] + sorted({v[0] for v in wanted.values()} - {"u1"}):      # u1 luôn nạp: mốc đứng thẳng của nó dùng cho cả u2
        sources[key] = source = Source(key, target)
        trunk = trunk_names(source.shared)
        if IDLE_OF[key]:
            source.rest.update(mean_rotations(source.sample(IDLE_OF[key]), trunk))
        else:
            source.rest.update({n: sources["u1"].rest[n] for n in trunk})

    clips = {name: bake(target, name, sources[key], source_name, options) for name, (key, source_name, options) in wanted.items()}

    for obj in list(bpy.data.objects):
        if obj is not target:
            bpy.data.objects.remove(obj)
    staged = os.path.abspath(args.out)[:-4] + ".staging.glb"
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.export_scene.gltf(
        filepath=staged, export_format="GLB", export_yup=True, use_selection=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=False,
        export_frame_range=False, export_anim_slide_to_zero=True, export_optimize_animation_size=False,
        export_skins=True, export_cameras=False, export_lights=False, export_def_bones=False)
    ma.keep_rotation_and_hips_only(staged)
    compact(staged, {name for name, (_k, _s, options) in wanted.items() if options.get("half")})
    os.replace(staged, os.path.abspath(args.out))

    if not args.only:
        manifest_path = os.path.join(os.path.dirname(os.path.abspath(args.out)), "manifest.json")
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
        target_bones = {ma.canonical(b.name): b for b in target.data.bones}
        manifest["animations_ual"] = {
            "source": "Universal Animation Library 1 + 2 (Quaternius, CC0) và clip starter man của Patch (CC0)",
            "file": os.path.basename(args.out), "bytes": os.path.getsize(args.out), "fps": ma.FPS,
            "retargetedOn": os.path.basename(args.character),
            "hipsRestHeight": round(ma.rest_world_head(target, target_bones[ma.HIPS]).z, 4),
            "tracks": "quaternion cho mọi xương + position chỉ cho " + ma.HIPS,
            "clips": clips,
        }
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("XONG anims_ual -> %s (%.2f MB), %d clip" % (args.out, os.path.getsize(args.out) / 1e6, len(clips)))


if __name__ == "__main__":
    main()
