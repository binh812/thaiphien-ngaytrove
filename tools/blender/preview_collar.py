"""Soát cận cổ áo (và tóc quanh cổ áo) sau khi nạp lại .glb, ở các tư thế mà runtime tạo ra.

Mỗi tư thế một tấm ảnh 5 ô (mỗi ô 600 x 900): chính diện cận | 3/4 cận | nghiêng 90 độ | sau gáy cận | từ trên xuống 45 độ.
Tư thế: nghi (rest), buong (dáng buông tay của runtime), quaytrai / quayphai (đầu quay 57 độ), cui (đầu cúi 26 độ),
ngua (đầu ngửa 26 độ), gio (hai tay giơ 120 độ).

Chạy: blender -b -P tools/blender/preview_collar.py -- --name m_white [--dir assets/people] [--prefix v13_collar] [--hair 0]
      [--states nghi,buong,quaytrai,quayphai,cui,gio]
Ảnh: <dir>/_preview/<prefix>_<tên>_<tư thế>.png
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
import preview_hang as ph  # noqa: E402
import preview_people as pp  # noqa: E402
import preview_uniform as pu  # noqa: E402

CELL = (600, 900)
HEAD_TURNS = {"quaytrai": (("Z", 57),), "quayphai": (("Z", -57),), "cui": (("X", 26),), "ngua": (("X", -26),)}
RAISE = (("LeftArm", "Y", -120), ("RightArm", "Y", 120))


def turn(character, steps):
    for bone_name, axis, degrees in steps:
        bone = character.pose.bones["mixamorig" + bone_name]
        pivot = character.matrix_world @ bone.matrix.to_translation()
        spin = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-pivot)
        bone.matrix = character.matrix_world.inverted() @ spin @ character.matrix_world @ bone.matrix
        bpy.context.view_layer.update()


def set_state(character, state):
    for bone in character.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    if state == "buong":
        for side, sign in (("Left", 1.0), ("Right", -1.0)):
            ph.point_bone(character, "mixamorig%sArm" % side, ph.to_blender(ph.ARM, side))
            ph.point_bone(character, "mixamorig%sForeArm" % side, ph.to_blender(ph.FOREARM, side), ph.TWIST * sign)
    elif state == "gio":
        turn(character, RAISE)
    elif state in HEAD_TURNS:
        turn(character, [("Head",) + step for step in HEAD_TURNS[state]])


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--name", default="m_white")
    parser.add_argument("--prefix", default="v13_collar")
    parser.add_argument("--hair", type=int, default=0)
    parser.add_argument("--states", default="nghi,buong,quaytrai,quayphai,cui,gio")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    os.makedirs(os.path.join(directory, "_preview"), exist_ok=True)
    scene, camera = pp.setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, args.name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, args.hair)
    tints = pp.TINTS.get(args.name, (pp.WHITE, pp.WHITE))
    top_tint = pu.GAME_WHITE if tints[0] == pp.WHITE else tints[0]
    pp.tint_material(bpy.data.objects["top"].material_slots[0].material, top_tint)
    pp.tint_material(bpy.data.objects["bottom"].material_slots[0].material, tints[1])
    neck = character.matrix_world @ character.data.bones["mixamorigNeck"].head_local
    aim_at = (0.0, neck.y - 0.01, neck.z - 0.03)
    views = (((0.0, -1.15, neck.z + 0.05), aim_at, 85), ((0.75, -0.9, neck.z + 0.1), aim_at, 85), ((1.2, neck.y, neck.z + 0.03), aim_at, 85),
             ((0.0, 1.15, neck.z + 0.12), aim_at, 85), ((0.0, -0.8, neck.z + 0.8), (0.0, neck.y, neck.z - 0.02), 85))
    tmp = os.path.join(bpy.app.tempdir, "collar_cell.png")
    for state in args.states.split(","):
        set_state(character, state)
        sheet = np.full((CELL[1], len(views) * CELL[0], 4), 0.35, dtype=np.float32)
        sheet[..., 3] = 1.0
        for column, (location, target, lens) in enumerate(views):
            pp.aim(camera, location, target, lens)
            pp.render(scene, tmp, CELL[0], CELL[1])
            sheet[:, column * CELL[0]:(column + 1) * CELL[0]] = pa.read_pixels(tmp)
        out = bpy.data.images.new("collar", len(views) * CELL[0], CELL[1], alpha=False)
        out.pixels.foreach_set(sheet.ravel())
        out.filepath_raw = os.path.join(directory, "_preview", "%s_%s_%s.png" % (args.prefix, args.name, state))
        out.file_format = "PNG"
        out.save()
        bpy.data.images.remove(out)
        print("SOAT cổ áo ->", os.path.join(directory, "_preview", "%s_%s_%s.png" % (args.prefix, args.name, state)))


if __name__ == "__main__":
    main()
