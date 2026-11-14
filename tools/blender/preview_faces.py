"""Soát shape key khuôn mặt sau khi nạp lại .glb: dựng lưới ảnh cận mặt cho từng trạng thái.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_faces.py -- [--dir assets/people] [--characters m_white,f_white]

Ảnh <dir>/_preview/faces_<tên>.png, 6 cột x 4 hàng. Hàng 1 (chính diện) và hàng 2 (góc 3/4):
gốc, face_1, face_2, face_3, face_4, face_5. Hàng 3 (chính diện) và hàng 4 (góc 3/4): face_6, age_teen, age_old,
trộn face_1 0,6 + face_4 0,4 + age_teen 1, trộn face_3 0,5 + face_5 0,5 + age_old 1, và ô cuối là một khung `walk`
toàn thân với face_3 = 1 (hàng 3: nhìn chéo; hàng 4: cận mặt cùng khung đó) để chắc morph và skinning cùng chạy.
"""
import argparse
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_anims as pa  # noqa: E402
import preview_people as pp  # noqa: E402

CELL = 320
STATES = (
    {}, {"face_1": 1}, {"face_2": 1}, {"face_3": 1}, {"face_4": 1}, {"face_5": 1},
    {"face_6": 1}, {"age_teen": 1}, {"age_old": 1},
    {"face_1": 0.6, "face_4": 0.4, "age_teen": 1}, {"face_3": 0.5, "face_5": 0.5, "age_old": 1},
)
WALK_STATE = {"face_3": 1}


def set_state(meshes, state):
    for obj in meshes:
        if obj.data.shape_keys:
            for key in obj.data.shape_keys.key_blocks[1:]:
                key.value = state.get(key.name, 0.0)


def shot(scene, camera, sheet, row, column, location, target, lens):
    pp.aim(camera, location, target, lens)
    tmp = os.path.join(bpy.app.tempdir, "face_cell.png")
    pp.render(scene, tmp, CELL, CELL)
    y0 = sheet.shape[0] - (row + 1) * CELL
    sheet[y0:y0 + CELL, column * CELL:(column + 1) * CELL] = pa.read_pixels(tmp)


def preview_character(name, directory):
    scene, camera = pp.setup_scene()
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, name + ".glb"), bone_heuristic="BLENDER")
    character = next(o for o in scene.objects if o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o.type == "MESH" and o.parent is None]:
        bpy.data.objects.remove(obj)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    pp.show_only_hair(meshes, 0)
    for mesh_name, rgb in zip(("top", "bottom"), pp.TINTS.get(name, (pp.WHITE, pp.WHITE))):
        pp.tint_material(bpy.data.objects[mesh_name].material_slots[0].material, rgb)
    _triangles, top, _low = pp.measure(meshes, character)
    head_z = (character.matrix_world @ character.data.bones["mixamorigHead"].head_local).z
    eye_z = head_z + (top - head_z) * 0.42

    sheet = np.full((4 * CELL, 6 * CELL, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    for index, state in enumerate(STATES):
        set_state(meshes, state)
        block, column = divmod(index, 6)
        shot(scene, camera, sheet, block * 2, column, (0.0, -1.0, eye_z), (0.0, 0.0, eye_z - 0.03), 80)
        shot(scene, camera, sheet, block * 2 + 1, column, (0.62, -0.8, eye_z + 0.02), (0.0, 0.0, eye_z - 0.03), 80)

    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, "anims.glb"), bone_heuristic="BLENDER")
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o not in before and o.type == "MESH"]:
        obj.hide_render = True
    ratio = character.data.bones[pa.HIPS].head_local.z / driver.data.bones[pa.HIPS].head_local.z
    start, end = pa.set_clip(driver, "walk")
    scene.frame_set(start + (end - start) // 3)
    pa.copy_pose_like_threejs(driver, character, ratio, skip_missing=True)
    set_state(meshes, WALK_STATE)
    bpy.context.view_layer.update()
    head = character.matrix_world @ character.pose.bones["mixamorigHead"].head
    shot(scene, camera, sheet, 2, 5, (2.4, -2.8, 1.0), (0.0, 0.0, 0.85), 50)
    shot(scene, camera, sheet, 3, 5, (head.x + 0.5, head.y - 0.85, head.z + 0.1), (head.x, head.y, head.z + 0.07), 80)

    out = bpy.data.images.new("faces", 6 * CELL, 4 * CELL, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "faces_%s.png" % name)
    out.file_format = "PNG"
    out.save()
    print("SOAT khuôn mặt %s -> %s" % (name, out.filepath_raw))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="m_white,f_white")
    args = parser.parse_args(argv)
    os.makedirs(os.path.join(os.path.abspath(args.dir), "_preview"), exist_ok=True)
    for name in args.characters.split(","):
        preview_character(name, os.path.abspath(args.dir))


if __name__ == "__main__":
    main()
