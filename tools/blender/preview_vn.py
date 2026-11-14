"""Soát tạo hình ở khoảng cách chân dung sau khi nạp lại .glb: chính diện, góc 3/4, toàn thân chéo, toàn thân nhìn nghiêng.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_vn.py -- [--dir assets/people] [--characters m_white,f_white,f_aodai,m_teacher] [--state age_teen=1,smile=0.3]

Ảnh <dir>/_preview/vn_<tên>.png. Hàng trên: mặt gốc (mọi trọng số 0). Hàng dưới: cùng ba góc với trạng thái --state
(mặc định: học sinh age_teen 1 + smile 0,3; thầy cô smile 0,3); ô nghiêng của hàng dưới là một khung walk.
"""
import argparse
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_faces as pf  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = 480
ADULTS = ("m_teacher", "f_teacher", "f_aodai", "f_aodai_teacher")


def pose_walk(scene, character, directory):
    """Đặt nhân vật vào một khung của clip walk (xương không có trong anims.glb để nguyên)."""
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, "anims.glb"), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o not in before and o.type == "MESH"]:
        obj.hide_render = True
    scene.render.fps = 30
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z
    start, end = pa.set_clip(driver, "walk")
    scene.frame_set(start + (end - start) // 4)
    pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)


def preview_character(name, directory, state, prefix="vn", hair=0):
    scene, camera = pp.setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, hair)
    for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(name, (pp.WHITE, pp.WHITE))):
        pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    _triangles, top, _low = pp.measure(meshes, character)
    head_z = (character.matrix_world @ character.data.bones["mixamorigHead"].head_local).z
    eye_z = head_z + (top - head_z) * 0.42
    pf.CELL = CELL
    sheet = np.full((2 * CELL, 4 * CELL, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    for row, values in enumerate(({}, state)):
        pf.set_state(meshes, values)
        pf.shot(scene, camera, sheet, row, 0, (0.0, -2.2, eye_z), (0.0, 0.0, eye_z - 0.04), 135)
        pf.shot(scene, camera, sheet, row, 1, (1.35, -1.75, eye_z + 0.03), (0.0, 0.0, eye_z - 0.04), 135)
        pf.shot(scene, camera, sheet, row, 2, (1.2, -4.4, top * 0.55), (0.0, 0.0, top * 0.5), 85)
        if row == 1:
            pose_walk(scene, character, directory)
        pf.shot(scene, camera, sheet, row, 3, (4.6, 0.0, top * 0.52), (0.0, 0.0, top * 0.5), 85)   # nghiêng toàn thân
    out = bpy.data.images.new("vn", 4 * CELL, 2 * CELL, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (prefix, name))
    out.file_format = "PNG"
    out.save()
    print("SOAT tạo hình %s -> %s" % (name, out.filepath_raw))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="m_white,f_white,f_aodai,m_teacher")
    parser.add_argument("--state", default=None, help="vd: age_teen=1,smile=0.4")
    parser.add_argument("--prefix", default="vn")
    parser.add_argument("--hair", type=int, default=0, help="kiểu tóc hiển thị: 0, 1 hoặc 2")
    args = parser.parse_args(argv)
    for name in args.characters.split(","):
        if args.state is not None:
            state = {k: float(v) for k, v in (item.split("=") for item in args.state.split(",") if item)}
        else:
            state = {"smile": 0.3} if name in ADULTS else {"age_teen": 1.0, "smile": 0.3}
        preview_character(name, os.path.abspath(args.dir), state, args.prefix, args.hair)


if __name__ == "__main__":
    main()
