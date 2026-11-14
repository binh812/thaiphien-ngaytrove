"""Soát quần áo ở tư thế khó sau khi nạp lại .glb: idle, chắp tay trước bụng, giơ hai tay cao (xoay tay 120 độ).

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_poses.py -- [--dir assets/people] [--name f_aodai_teacher] [--prefix v9_poses] [--anims anims.glb]

Ảnh <dir>/_preview/<prefix>_<tên>.png: idle chính diện | idle nghiêng | idle sau | chắp tay chính diện | chắp tay chéo |
giơ tay chính diện | giơ tay sau.
"""
import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = (400, 640)
CLASP = (("LeftArm", "X", -22), ("RightArm", "X", -22), ("LeftForeArm", "Y", 62), ("RightForeArm", "Y", -62),
         ("LeftForeArm", "X", -25), ("RightForeArm", "X", -25))
RAISE = (("LeftArm", "Y", -120), ("RightArm", "Y", 120))


def turn(character, steps):
    """Xoay từng xương quanh một trục thế giới đặt tại gốc xương (theo thứ tự cho trước)."""
    for bone_name, axis, degrees in steps:
        pose_bone = character.pose.bones["mixamorig" + bone_name]
        pivot = character.matrix_world @ pose_bone.matrix.to_translation()
        spin = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-pivot)
        pose_bone.matrix = character.matrix_world.inverted() @ spin @ character.matrix_world @ pose_bone.matrix
        bpy.context.view_layer.update()


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="f_aodai_teacher")
    parser.add_argument("--prefix", default="v9_poses")
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
    pp.show_only_hair(meshes, 1)
    for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(args.name, (pp.WHITE, pp.WHITE))):
        pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.anims), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o not in before and o.type == "MESH"]:
        obj.hide_render = True
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z

    def idle():
        start, end = pa.set_clip(driver, "idle")
        scene.frame_set(start + round((end - start) * 0.3))
        pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
        bpy.context.view_layer.update()

    sheet = np.full((CELL[1], 7 * CELL[0], 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    tmp = os.path.join(bpy.app.tempdir, "poses_cell.png")
    front, side, back, diagonal = (0.0, -4.4, 0.95), (4.4, 0.0, 0.95), (0.0, 4.4, 0.95), (2.6, -3.5, 1.05)

    def shoot(column, location):
        pp.aim(camera, location, (0.0, 0.0, 0.88), 85)
        pp.render(scene, tmp, CELL[0], CELL[1])
        sheet[:, column * CELL[0]:(column + 1) * CELL[0]] = pa.read_pixels(tmp)

    idle()
    for column, location in enumerate((front, side, back)):
        shoot(column, location)
    turn(character, CLASP)
    shoot(3, front)
    shoot(4, diagonal)
    idle()
    turn(character, RAISE)
    shoot(5, front)
    shoot(6, back)
    out = bpy.data.images.new("poses", 7 * CELL[0], CELL[1], alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (args.prefix, args.name))
    out.file_format = "PNG"
    out.save()
    print("SOAT tư thế ->", out.filepath_raw)


if __name__ == "__main__":
    main()
