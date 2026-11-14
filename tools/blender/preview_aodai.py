"""Soát một tệp áo dài sau khi nạp lại .glb: dáng áo, mức đâm xuyên khi đi/chạy, tà bay khi quay xương tà.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_aodai.py -- [--dir assets/people] [--name f_aodai] [--prefix aodai2] [--tints e8b7ae,a3172a,f1ece2]

Ảnh trong <dir>/_preview/:
  <prefix>_rest.png    trước / nghiêng / sau / cận thân áo
  <prefix>_motion.png  4 khung walk + 2 khung run nhìn nghiêng, xương tà đứng yên
  <prefix>_swing.png   3 khung walk nhìn chéo 3/4 trước, tà trước hất ra trước 20 độ và tà sau ra sau 8 độ
  <prefix>_tints.png   (nếu có --tints) toàn thân chính diện, áo và quần nhân với từng màu
"""
import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Quaternion

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = (420, 640)
SWING = (("aodaiFront1", 20.0, 1), ("aodaiBack1", 8.0, -1))   # (xương, độ, +1 = ra trước / -1 = ra sau)
SIDE, FRONT, BACK, DIAGONAL = (3.6, 0.0, 0.9), (0.0, -3.6, 0.9), (0.0, 3.6, 0.9), (2.0, -3.0, 1.0)


class Sheet:
    def __init__(self, columns):
        self.columns, self.index = columns, 0
        self.pixels = np.full((CELL[1], columns * CELL[0], 4), 0.35, dtype=np.float32)
        self.pixels[..., 3] = 1.0

    def shoot(self, scene, camera, location, target=(0.0, 0.0, 0.8), lens=50):
        pp.aim(camera, location, target, lens)
        tmp = os.path.join(bpy.app.tempdir, "aodai_cell.png")
        pp.render(scene, tmp, CELL[0], CELL[1])
        x0 = self.index * CELL[0]
        self.pixels[:, x0:x0 + CELL[0]] = pa.read_pixels(tmp)
        self.index += 1

    def save(self, path):
        image = bpy.data.images.new("sheet", self.columns * CELL[0], CELL[1], alpha=False)
        image.pixels.foreach_set(self.pixels.ravel())
        image.filepath_raw, image.file_format = path, "PNG"
        image.save()
        print("SOAT áo dài ->", path)


def swing_panels(character, signs):
    for bone_name, degrees, direction in SWING:
        pose_bone = character.pose.bones[bone_name]
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = Quaternion((0.0, 0.0, 1.0), math.radians(degrees) * signs[bone_name] * direction)


def set_tint(material, rgb):
    """Đặt lại màu nhân của vật liệu đã qua pp.tint_material (nút Mix nhân màu)."""
    for node in material.node_tree.nodes:
        if node.type == "MIX" and node.blend_type == "MULTIPLY":
            node.inputs["B"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)


def srgb_hex(text):
    channels = [int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="f_aodai")
    parser.add_argument("--prefix", default="aodai2")
    parser.add_argument("--tints", default="")
    args = parser.parse_args(argv)
    directory, name = os.path.abspath(args.dir), args.name
    with open(os.path.join(directory, "manifest.json"), encoding="utf-8") as f:
        signs = {b["name"]: b["forwardSign"] for b in json.load(f)["aodaiBones"][name]["bones"]}

    scene, camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 0)
    tints = pp.TINTS.get(name, (pp.WHITE, pp.WHITE))
    for mesh_name, rgb in zip(("top", "bottom"), tints):
        pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    preview = os.path.join(directory, "_preview")

    rest = Sheet(4)
    for location in (FRONT, SIDE, BACK):
        rest.shoot(scene, camera, location)
    rest.shoot(scene, camera, (-0.35, -1.25, 1.25), target=(0.0, 0.0, 1.17), lens=60)
    rest.save(os.path.join(preview, args.prefix + "_rest.png"))

    if args.tints:
        colours = [srgb_hex(t) for t in args.tints.split(",")]
        sheet = Sheet(len(colours))
        for rgb in colours:
            for mesh_name in ("top", "bottom"):
                set_tint(bpy.data.objects[mesh_name].material_slots[0].material, [c / 0.88 for c in rgb])
            sheet.shoot(scene, camera, (0.9, -3.5, 0.95))
        sheet.save(os.path.join(preview, args.prefix + "_tints.png"))
        for mesh_name, rgb in zip(("top", "bottom"), tints):
            set_tint(bpy.data.objects[mesh_name].material_slots[0].material, rgb)

    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, "anims.glb"), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z

    def pose(clip, fraction):
        start, end = pa.set_clip(driver, clip)
        scene.frame_set(start + round((end - start) * fraction))
        pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)

    motion = Sheet(6)
    for clip, fraction in (("walk", 0.0), ("walk", 0.25), ("walk", 0.5), ("walk", 0.75), ("run", 0.2), ("run", 0.7)):
        pose(clip, fraction)
        motion.shoot(scene, camera, SIDE)
    motion.save(os.path.join(preview, args.prefix + "_motion.png"))

    swing = Sheet(3)
    for fraction in (0.1, 0.4, 0.7):
        pose("walk", fraction)
        swing_panels(character, signs)
        swing.shoot(scene, camera, DIAGONAL)
    swing.save(os.path.join(preview, args.prefix + "_swing.png"))


if __name__ == "__main__":
    main()
