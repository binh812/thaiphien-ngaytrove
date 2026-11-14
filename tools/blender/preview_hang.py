"""Soát áo ở dáng đứng buông tay của runtime (không phải rest/idle của clip): cánh tay trên gần thẳng đứng hơi ra sau,
cẳng tay hơi ra trước, cẳng tay xoắn ~57 độ. Chụp trước, 3/4, sau lưng, cận tay áo nhìn từ sau.

Chạy: .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_hang.py -- [--dir assets/people] [--name m_white] [--prefix v12b_hang]
"""
import argparse
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = (480, 640)
# Hướng xương trong hệ nhân vật của glTF (x sang trái nhân vật, y lên, z ra trước), viết cho bên trái; bên phải lật x.
ARM, FOREARM, TWIST = (0.085, -1.0, -0.03), (0.03, -1.0, 0.10), 57.0


def to_blender(gltf_vector, side):
    x, y, z = gltf_vector
    return Vector((x if side == "Left" else -x, -z, y)).normalized()


def point_bone(character, name, direction, twist=0.0):
    bone = character.pose.bones[name]
    world = character.matrix_world @ bone.matrix
    pivot = world.to_translation()
    current = (world.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
    swing = current.rotation_difference(direction).to_matrix().to_4x4()
    spin = Matrix.Rotation(math.radians(twist), 4, direction)
    turn = Matrix.Translation(pivot) @ spin @ swing @ Matrix.Translation(-pivot)
    bone.matrix = character.matrix_world.inverted() @ turn @ world
    bpy.context.view_layer.update()


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="m_white")
    parser.add_argument("--prefix", default="v12b_hang")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    scene, camera = pp.setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 1)
    pp.tint_material(bpy.data.objects["bottom"].material_slots[0].material, pp.NAVY)
    for side, sign in (("Left", 1.0), ("Right", -1.0)):
        point_bone(character, "mixamorig%sArm" % side, to_blender(ARM, side))
        point_bone(character, "mixamorig%sForeArm" % side, to_blender(FOREARM, side), TWIST * sign)
    sheet = np.full((CELL[1], 4 * CELL[0], 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    tmp = os.path.join(bpy.app.tempdir, "hang_cell.png")
    elbow = character.matrix_world @ character.pose.bones["mixamorigLeftForeArm"].head
    views = (((0.0, -2.6, 1.25), (0.0, 0.0, 1.15), 70), ((1.7, -2.0, 1.3), (0.0, 0.0, 1.15), 70),
             ((0.0, 2.6, 1.25), (0.0, 0.0, 1.15), 70), ((elbow.x + 0.15, 1.0, elbow.z + 0.12), (elbow.x, elbow.y, elbow.z + 0.08), 80))
    for column, (location, target, lens) in enumerate(views):
        pp.aim(camera, location, target, lens)
        pp.render(scene, tmp, CELL[0], CELL[1])
        sheet[:, column * CELL[0]:(column + 1) * CELL[0]] = pa.read_pixels(tmp)
    out = bpy.data.images.new("hang", 4 * CELL[0], CELL[1], alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (args.prefix, args.name))
    out.file_format = "PNG"
    out.save()
    print("SOAT buông tay ->", out.filepath_raw)


if __name__ == "__main__":
    main()
