"""Nạp lại từng tệp .glb đã xuất vào cảnh trống, đo số liệu, dựng ảnh xem trước và ghi manifest.json.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_people.py -- [--dir assets/people] [--only m_white]

Ảnh: _preview/<tên>_full.png (toàn thân, tóc hair_0), _face.png (cận mặt), _hair1.png, _hair2.png (hai kiểu tóc còn lại),
_pose.png (tư thế giơ tay, bước chân để soát lòi da và trọng số xương).
"""
import argparse
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HAIR_NAMES = ("hair_0", "hair_1", "hair_2")
BACKGROUND = (0.35, 0.35, 0.36, 1.0)
NAVY, WHITE, BLACK = (0.03, 0.05, 0.13), (0.9, 0.9, 0.9), (0.03, 0.03, 0.035)
TINTS = {  # màu nhân thử cho top/bottom khi dựng ảnh (trong game sẽ nhân màu lúc chạy); glb không bị đổi
    "m_white": (WHITE, NAVY), "f_white": (WHITE, NAVY), "m_jacket": (NAVY, NAVY), "f_jacket": (NAVY, NAVY),
    "m_pe": ((0.85, 0.87, 0.9), (0.05, 0.08, 0.2)), "f_pe": ((0.85, 0.87, 0.9), (0.05, 0.08, 0.2)),
    "m_teacher": ((0.62, 0.75, 0.9), BLACK), "f_teacher": ((0.9, 0.82, 0.86), BLACK),
    "m_class": ((1.0, 1.0, 1.0), BLACK), "f_class": ((1.0, 1.0, 1.0), (0.12, 0.2, 0.42)), "f_class_skirt": ((1.0, 1.0, 1.0), (0.12, 0.2, 0.42)),
    "f_aodai": (WHITE, WHITE), "f_aodai_teacher": ((0.8, 0.45, 0.4), (0.8, 0.45, 0.4)),
}
POSE = (  # (xương, trục thế giới, độ) — xoay quanh trục thế giới tại gốc xương, chỉ để soát biến dạng
    ("mixamorigSpine1", "Z", 20), ("mixamorigHead", "Z", -30),
    ("mixamorigRightArm", "Y", -70), ("mixamorigRightForeArm", "Y", -50),
    ("mixamorigLeftArm", "Z", 60), ("mixamorigLeftForeArm", "X", -60),
    ("mixamorigLeftUpLeg", "X", -55), ("mixamorigLeftLeg", "X", 75), ("mixamorigRightUpLeg", "X", 20),
)


def read_glb_json(path):
    with open(path, "rb") as f:
        magic, _version, _length = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            raise ValueError("Không phải GLB: " + path)
        chunk_length, chunk_type = struct.unpack("<I4s", f.read(8))
        if chunk_type != b"JSON":
            raise ValueError("Khối đầu không phải JSON: " + path)
        return json.loads(f.read(chunk_length))


def glb_summary(path):
    gltf = read_glb_json(path)
    views = gltf.get("bufferViews", [])
    images = [{"name": img.get("name"), "mimeType": img.get("mimeType"), "bytes": views[img["bufferView"]]["byteLength"]}
              for img in gltf.get("images", [])]
    materials = [{"name": m["name"], "alphaMode": m.get("alphaMode", "OPAQUE"), "alphaCutoff": m.get("alphaCutoff"),
                  "doubleSided": m.get("doubleSided", False),
                  "normalTexture": "normalTexture" in m} for m in gltf.get("materials", [])]
    morphs = {m["name"]: m["extras"]["targetNames"] for m in gltf.get("meshes", []) if m.get("extras", {}).get("targetNames")}
    return {"images": images, "materials": materials, "morphTargets": morphs,
            "morphNormals": any("NORMAL" in t for m in gltf.get("meshes", []) for p in m["primitives"] for t in p.get("targets", [])), "animations": [a.get("name") for a in gltf.get("animations", [])],
            "skins": len(gltf.get("skins", []))}


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 24
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = BACKGROUND
    background.inputs["Strength"].default_value = 0.45
    scene.world = world
    for name, location, energy, size in (("key", (-1.8, -3.0, 2.6), 130, 2.0), ("fill", (2.6, -2.2, 1.6), 45, 3.0),
                                         ("rim", (0.8, 3.0, 2.8), 90, 2.0)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size = energy, size
        obj = bpy.data.objects.new(name, light)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, 1.0)) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        scene.collection.objects.link(obj)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def aim(camera, location, target, lens):
    camera.location = location
    camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = lens


def render(scene, path, width, height):
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def measure(meshes, rig):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    stats, top = {}, 0.0
    low = 1e9
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        stats[obj.name] = len(mesh.loop_triangles)
        zs = [(evaluated.matrix_world @ v.co).z for v in mesh.vertices]
        top, low = max(top, max(zs)), min(low, min(zs))
        evaluated.to_mesh_clear()
    return stats, top, low


def arm_angle_below_horizontal(rig):
    bone = rig.data.bones["mixamorigLeftArm"]
    direction = (rig.matrix_world.to_3x3() @ (bone.tail_local - bone.head_local)).normalized()
    return math.degrees(math.asin(max(-1.0, min(1.0, -direction.z))))


def tint_material(material, rgb):
    """Nhân màu cơ bản của vật liệu (giống material.color trong three.js) để ảnh xem trước sát với game."""
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    socket = bsdf.inputs["Base Color"]
    if not socket.is_linked:
        socket.default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        return
    source = socket.links[0].from_socket
    mix = nodes.new("ShaderNodeMix")
    mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    links.new(source, mix.inputs["A"])
    links.new(mix.outputs["Result"], socket)


def show_only_hair(meshes, index, glasses=-1):
    for obj in meshes:
        if obj.name.startswith("hair_"):
            obj.hide_render = obj.name != "hair_%d" % index
        if obj.name.startswith("glasses_"):
            obj.hide_render = obj.name != "glasses_%d" % glasses


def preview_one(name, directory, preview_dir):
    scene, camera = setup_scene()
    path = os.path.join(directory, name + ".glb")
    bpy.ops.import_scene.gltf(filepath=path)
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)  # hình hiển thị xương do bộ nhập glTF tự thêm, không có trong glb
    meshes = [o for o in scene.objects if o.type == "MESH"]
    for mesh_name, rgb in zip(("top", "bottom"), TINTS.get(name, (WHITE, WHITE))):
        if mesh_name in bpy.data.objects:
            tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    rigs = [o for o in scene.objects if o.type == "ARMATURE"]
    if len(rigs) != 1:
        raise RuntimeError("%s: cần đúng 1 armature, thấy %d" % (name, len(rigs)))
    rig = rigs[0]
    triangles, top, low = measure(meshes, rig)
    head_z = (rig.matrix_world @ rig.data.bones["mixamorigHead"].head_local).z
    eye_z = head_z + (top - head_z) * 0.42

    show_only_hair(meshes, 0)
    aim(camera, (0.0, -3.4, top * 0.52), (0.0, 0.0, top * 0.5), 50)
    render(scene, os.path.join(preview_dir, name + "_full.png"), 640, 900)
    aim(camera, (0.25, -1.15, eye_z + 0.02), (0.0, 0.0, eye_z - 0.02), 70)
    render(scene, os.path.join(preview_dir, name + "_face.png"), 640, 640)
    for index in (1, 2):
        show_only_hair(meshes, index)
        aim(camera, (-0.75, -1.1, eye_z + 0.1), (0.0, 0.0, eye_z - 0.03), 60)
        render(scene, os.path.join(preview_dir, "%s_hair%d.png" % (name, index)), 480, 480)

    show_only_hair(meshes, 0)
    for bone_name, axis, degrees in POSE:
        pose_bone = rig.pose.bones[bone_name]
        pivot = rig.matrix_world @ pose_bone.matrix.to_translation()
        turn = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-pivot)
        pose_bone.matrix = rig.matrix_world.inverted() @ turn @ rig.matrix_world @ pose_bone.matrix
        bpy.context.view_layer.update()
    aim(camera, (1.5, -2.3, top * 0.6), (0.0, 0.0, top * 0.5), 50)
    render(scene, os.path.join(preview_dir, name + "_pose.png"), 640, 900)

    summary = glb_summary(path)
    bones = [{"name": b.name, "parent": b.parent.name if b.parent else None} for b in rig.data.bones]
    entry = {
        "file": name + ".glb", "bytes": os.path.getsize(path), "triangles": sum(triangles.values()),
        "trianglesByMesh": triangles, "height": round(top - low, 4), "minY": round(low, 4),
        "hipsRestHeight": round((rig.matrix_world @ rig.data.bones["mixamorigHips"].head_local).z, 4),
        "meshes": sorted(triangles), "materials": summary["materials"], "images": summary["images"],
        "morphTargets": summary["morphTargets"], "morphNormals": summary["morphNormals"],
        "previews": ["_preview/%s_%s.png" % (name, kind) for kind in ("full", "face", "hair1", "hair2", "pose")],
    }
    rest = {"type": "A", "upperArmDegreesBelowHorizontal": round(arm_angle_below_horizontal(rig), 1)}
    return entry, bones, rest


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(ROOT, "assets", "people"))
    parser.add_argument("--only", default="")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    preview_dir = os.path.join(directory, "_preview")
    os.makedirs(preview_dir, exist_ok=True)
    names = [n for n in args.only.split(",") if n] or sorted(
        f[:-4] for f in os.listdir(directory) if f.endswith(".glb") and f != "anims.glb")
    manifest_path = os.path.join(directory, "manifest.json")
    manifest = {"files": {}}
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
    for name in names:
        entry, bones, rest = preview_one(name, directory, preview_dir)
        entry.update({k: v for k, v in manifest["files"].get(name, {}).items() if k in ("hairStyles", "glasses", "bakedTop")})
        manifest["files"][name] = entry
        if not any(b["name"].startswith("aodai") for b in bones):   # bộ xương chung; xương tà riêng của f_aodai ở mục aodaiBones
            manifest["skeleton"] = {"armatureNode": "Armature", "root": bones[0]["name"], "bones": bones}
        manifest["restPose"] = rest
        print("SOAT %s: %d tam giác, cao %.3f m, %.2f MB" % (name, entry["triangles"], entry["height"], entry["bytes"] / 1e6))
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
