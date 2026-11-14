"""Đếm đỉnh tóc nằm trong áo / trong thân ở các tư thế mà runtime tạo ra (đầu quay ±57°, cúi/ngửa ±26°, dáng chụp ảnh).

Với mỗi tệp × kiểu tóc × tư thế: lấy toạ độ đỉnh tóc sau skinning, tìm điểm gần nhất trên lưới `top` và lưới `body`
(cũng sau skinning), khoảng cách có dấu theo pháp tuyến mặt. "Trong" = sâu hơn DEPTH dưới bề mặt (và không quá REACH,
để không tính nhầm mặt bên kia thân). Với `body` chỉ xét các đỉnh tóc ở tư thế nghỉ nằm dưới khớp đầu + 3 cm (bỏ vùng
da đầu, tai). Cột "sát" là số đỉnh ở ngoài nhưng cách bề mặt áo dưới NEAR.

Chạy: blender -b -P tools/blender/measure_hair.py -- [--dir assets/people] [--only a,b] [--tag before]
Kết quả: bảng in ra và .tools/build/hair_measure_<tag>.json
"""
import argparse
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

DEPTH, REACH, NEAR = 0.0015, 0.05, 0.004
HEAD = "mixamorigHead"
HEAD_POSES = {"nghi": (), "quay_trai57": (("Z", 57),), "quay_phai57": (("Z", -57),), "cui26": (("X", 26),), "ngua26": (("X", -26),)}
CLIPS = ("pose_peace_f", "pose_bigheart_f", "pose_chin_f")


def evaluated(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    source = obj.evaluated_get(depsgraph)
    mesh = source.to_mesh()
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get("co", co)
    polygons = [tuple(p.vertices) for p in mesh.polygons]
    source.to_mesh_clear()
    world = np.array(obj.matrix_world)
    co = co.reshape(-1, 3) @ world[:3, :3].T + world[:3, 3]
    return co, polygons


def tree_of(obj):
    co, polygons = evaluated(obj)
    return BVHTree.FromPolygons([tuple(c) for c in co], polygons)


def signed(tree, points, axis_y=0.0):
    out = np.full(len(points), np.inf)
    for i, point in enumerate(points):
        hit, normal, _index, distance = tree.find_nearest(Vector(point), REACH)
        if hit is not None:
            offset = Vector(point) - hit
            depth = offset.dot(normal)
            # điểm lệch ra ngoài mép lưới hở (trên mép cổ áo, dưới gấu áo...) không phải là "nằm trong": lấy khoảng cách thường
            # mặt gần thẳng đứng mà pháp tuyến quay vào trục thân (tà sau áo dài dựng mặt lộn trong) thì lật dấu
            if abs(normal.z) < 0.6 and normal.x * hit.x + normal.y * (hit.y - axis_y) < 0:
                depth = -depth
            out[i] = distance if (offset - normal * depth).length > 0.004 else depth
    return out


def reset(character):
    for bone in character.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def turn_head(character, steps):
    bone = character.pose.bones[HEAD]
    for axis, degrees in steps:
        pivot = character.matrix_world @ bone.matrix.to_translation()
        spin = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-pivot)
        bone.matrix = character.matrix_world.inverted() @ spin @ character.matrix_world @ bone.matrix
        bpy.context.view_layer.update()


def count(character, hairs, rest_low):
    objects = bpy.data.objects        # tệp tủ đồ: đo với sơ mi đồng phục và lưới da đầu - cổ
    top, body = tree_of(objects.get("top") or objects["top_uniform"]), tree_of(objects.get("body") or objects["skin_head"])
    row = {}
    for hair in hairs:
        co, _polygons = evaluated(hair)
        d_top = signed(top, co)
        d_body = signed(body, co[rest_low[hair.name]])
        row[hair.name] = {"ao": int(((d_top < -DEPTH) & (d_top > -REACH)).sum()), "than": int(((d_body < -DEPTH) & (d_body > -REACH)).sum()),
                          "sat": int(((d_top >= -DEPTH) & (d_top < NEAR)).sum())}
    return row


def measure(name, directory, poses_file):
    scene, _camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    hairs = sorted((o for o in scene.objects if o.type == "MESH" and o.name.startswith("hair_")), key=lambda o: o.name)
    head_z = (character.matrix_world @ character.data.bones[HEAD].head_local).z
    rest_low = {hair.name: evaluated(hair)[0][:, 2] < head_z + 0.03 for hair in hairs}
    result = {}
    for pose, steps in HEAD_POSES.items():
        reset(character)
        turn_head(character, steps)
        result[pose] = count(character, hairs, rest_low)
    if name.startswith("f_"):
        before = set(scene.objects)
        bpy.ops.import_scene.gltf(filepath=poses_file, bone_heuristic="BLENDER")
        driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
        ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z
        for clip in CLIPS:
            reset(character)
            start, end = pa.set_clip(driver, clip)
            scene.frame_set(start + round((end - start) * 0.6))
            pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
            bpy.context.view_layer.update()
            result[clip] = count(character, hairs, rest_low)
    return result


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--poses", default=os.path.join(pp.ROOT, "assets", "people", "poses.glb"))
    parser.add_argument("--only", default="")
    parser.add_argument("--tag", default="now")
    args = parser.parse_args(argv)
    directory = os.path.abspath(args.dir)
    names = [n for n in args.only.split(",") if n] or ["m_white", "f_white", "m_jacket", "f_jacket", "m_pe", "f_pe", "m_teacher", "f_teacher",
                                                       "f_aodai", "f_aodai_teacher"]
    out_path = os.path.join(pp.ROOT, ".tools", "build", "hair_measure_%s.json" % args.tag)
    table = {}
    if os.path.isfile(out_path):
        with open(out_path, encoding="utf-8") as f:
            table = json.load(f)
    for name in names:
        table[name] = measure(name, directory, args.poses)
        for pose, row in table[name].items():
            print("TOC %-16s %-16s %s" % (name, pose, "  ".join("%s ao=%d than=%d sat=%d" % (h, v["ao"], v["than"], v["sat"]) for h, v in row.items())))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(table, f, ensure_ascii=False, indent=1)
    print("DO TOC ->", out_path)


if __name__ == "__main__":
    main()
