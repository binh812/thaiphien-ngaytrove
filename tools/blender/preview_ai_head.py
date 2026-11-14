"""Soát đầu nhân vật: nạp một tệp tủ đồ .glb, chụp cận mặt dưới ánh sáng ĐỀU (trời u ám, không đèn studio).

Chạy: blender -b -P tools/blender/preview_ai_head.py -- --glb assets/people/m_wardrobe_ai.glb --out .tools/build/ai_head/r1
        [--shots "front:0:0,q_left:40:0,..."] [--morphs "smile=1;blink=1"] [--ortho] [--size 960]
Mỗi cảnh: tên:góc quay quanh trục đứng (độ; 0 = chính diện, 90 = nhìn vào bên TRÁI của nhân vật, 180 = sau gáy):kiểu tóc (-1 = không tóc).
`--ortho`: máy quay trực giao, khung cao ORTHO_SPAN mét quanh ORTHO_CENTRE (dùng để đo mốc trên lưới).
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

DEFAULT_SHOTS = "front:0:0,q_left:40:0,q_right:-40:0,side:90:0,back:180:0,front_bald:0:-1,q_left_bald:40:-1,side_bald:90:-1,side_r_bald:-90:-1,back_bald:180:-1"
ORTHO_SPAN = 0.42                      # m: chiều cao khung trực giao
ORTHO_CENTRE = (0.0, 0.0, 1.58)        # hệ Blender (Z lên): tâm khung
HEAD_CENTRE = (0.0, -0.03, 1.61)       # tâm ngắm của ảnh phối cảnh
SHOWN = ("skin_head", "skin_torso", "skin_upperarm", "eyes", "eyebrows", "eyelashes", "teeth")


def setup_scene(size: int) -> bpy.types.Scene:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 32
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("Overcast")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.80, 0.82, 0.85, 1.0)
    background.inputs["Strength"].default_value = 1.0
    scene.world = world
    sun = bpy.data.lights.new("SoftSun", "SUN")       # nắng rất yếu xuyên mây: chỉ đủ gợi khối, không tạo bóng gắt
    sun.energy, sun.angle = 0.6, math.radians(60.0)
    sun_obj = bpy.data.objects.new("SoftSun", sun)
    sun_obj.rotation_euler = (math.radians(50.0), 0.0, math.radians(25.0))
    scene.collection.objects.link(sun_obj)
    return scene


def place_camera(scene: bpy.types.Scene, azimuth: float, ortho: bool, centre_y: float) -> None:
    camera = scene.camera
    if camera is None:
        camera = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
        scene.collection.objects.link(camera)
        scene.camera = camera
    angle = math.radians(azimuth)
    direction = Vector((math.sin(angle), -math.cos(angle), 0.0))      # mặt nhìn về -Y; bên trái nhân vật là +X
    centre = Vector((0.0, 0.0, centre_y) if ortho else (HEAD_CENTRE[0], HEAD_CENTRE[1], centre_y + 0.03))
    if ortho:
        camera.data.type, camera.data.ortho_scale = "ORTHO", ORTHO_SPAN
        camera.location = centre + direction * 2.0
    else:
        camera.data.type, camera.data.lens = "PERSP", 85.0
        camera.location = centre + direction * 1.05
    camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()


def _source_image_node(socket):
    """Nút Image Texture cấp màu cho một ổ cắm (đi ngược qua nút Normal Map / Separate nếu có)."""
    node = socket.links[0].from_node if socket.links else None
    while node is not None and node.type != "TEX_IMAGE":
        linked = [i for i in node.inputs if i.links]
        node = linked[-1].links[0].from_node if linked else None
    return node


def swap_head_textures(folder: str) -> None:
    for material_name, socket_name, file_name, colour_space in (("head", "Base Color", "head.jpg", "sRGB"), ("body", "Base Color", "body.jpg", "sRGB"),
                                                                ("head", "Normal", "head_n.jpg", "Non-Color")):
        material = bpy.data.materials[material_name]
        shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        node = _source_image_node(shader.inputs[socket_name])
        if node is None:
            raise SystemExit("Không tìm thấy kết cấu %s của vật liệu %s" % (socket_name, material_name))
        node.image = bpy.data.images.load(os.path.join(folder, file_name))
        node.image.colorspace_settings.name = colour_space
        print("KẾT CẤU", material_name, socket_name, "<-", file_name)


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--shots", default=DEFAULT_SHOTS)
    parser.add_argument("--morphs", default="")
    parser.add_argument("--sets", default="", help='nhiều bộ morph trong một lần chạy: "ten|smile=1;blink=1,ten2|face_1=0.7"; ảnh ra <out>_<ten>_<cảnh>.png')
    parser.add_argument("--ortho", action="store_true")
    parser.add_argument("--size", type=int, default=960)
    parser.add_argument("--centre-y", type=float, default=ORTHO_CENTRE[2], help="độ cao tâm khung trực giao (m); ảnh phối cảnh ngắm cao hơn 3 cm. Nam 1.58, nữ 1.43")
    parser.add_argument("--show", default="", help="tên lưới hiện thêm, cách nhau dấu phẩy (ví dụ glasses_0,top_uniform)")
    parser.add_argument("--head-textures", default="", help="thư mục gói mặt thêm (head.jpg, body.jpg, head_n.jpg): thay kết cấu như runtime sẽ làm")
    parser.add_argument("--hide", default="")            # tên lưới ẩn thêm, cách nhau dấu phẩy (ví dụ eyebrows)
    args = parser.parse_args(argv)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    scene = setup_scene(args.size)
    if args.head_textures:
        swap_head_textures(os.path.abspath(args.head_textures))
    hidden = set(filter(None, args.hide.split(",")))
    extra = set(filter(None, args.show.split(",")))
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    sets = [("", args.morphs)] if not args.sets else [tuple(item.split("|")) for item in args.sets.split(",")]
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    for tag, spec in sets:
        morphs = dict((pair.split("=")[0], float(pair.split("=")[1])) for pair in spec.split(";") if pair)
        known = {block.name for obj in meshes if obj.data.shape_keys for block in obj.data.shape_keys.key_blocks}
        if set(morphs) - known:
            raise SystemExit("Không có morph: %s" % sorted(set(morphs) - known))
        for obj in meshes:
            keys = obj.data.shape_keys
            for block in (keys.key_blocks if keys else []):
                if block.name != "Basis":
                    block.value = morphs.get(block.name, 0.0)
        for shot in args.shots.split(","):
            name, azimuth, hair = shot.split(":")
            for obj in meshes:
                visible = (obj.name in SHOWN or obj.name in extra or obj.name == "hair_%s" % hair) and obj.name not in hidden
                obj.hide_render = not visible
            place_camera(scene, float(azimuth), args.ortho, args.centre_y)
            scene.render.filepath = "%s_%s%s.png" % (os.path.abspath(args.out), tag + "_" if tag else "", name)
            bpy.ops.render.render(write_still=True)
            print("ANH", scene.render.filepath)


if __name__ == "__main__":
    main()
