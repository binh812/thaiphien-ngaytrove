"""Soát anims.glb: áp clip lên một nhân vật theo đúng cách three.js làm (ghi đè phép quay cục bộ tuyệt đối của
từng xương theo tên, vị trí hông co theo tỉ lệ chiều cao hông) rồi dựng vài khung hình thành một tấm ảnh.

Chạy:
    .tools/blender/blender-4.5.16-windows-x64/blender.exe -b -P tools/blender/preview_anims.py -- \
        [--dir assets/people] [--characters m_white,f_aodai]
Ảnh: <dir>/_preview/anims_<nhân vật>.png — mỗi hàng một clip, các cột là các khung cách đều.
"""
import argparse
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preview_people as pp  # noqa: E402

HIPS = "mixamorigHips"
ANIMS = {"file": "anims.glb", "prefix": "anims"}
SHOTS = (("idle", 4), ("walk", 6), ("run", 6), ("agree", 4), ("headShake", 4))
COLUMNS = 6
CELL = (300, 480)


def local_rest_rotation(bone):
    matrix = bone.matrix_local if bone.parent is None else bone.parent.matrix_local.inverted() @ bone.matrix_local
    return matrix.to_quaternion()


def copy_pose_like_threejs(driver, character, hips_ratio, skip_missing=False):
    """Đặt tư thế của character bằng phép quay cục bộ tuyệt đối đọc từ driver (armature của anims.glb).
    skip_missing: xương không có trong anims.glb (xương tà áo dài) được để nguyên, như three.js."""
    for pose_bone in character.pose.bones:
        source = driver.pose.bones.get(pose_bone.name)
        if source is None:
            if skip_missing:
                continue
            raise RuntimeError("anims.glb thiếu xương " + pose_bone.name)
        absolute = source.matrix if source.parent is None else source.parent.matrix.inverted() @ source.matrix
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = local_rest_rotation(pose_bone.bone).inverted() @ absolute.to_quaternion()
        if pose_bone.name == HIPS:
            wanted = source.matrix.to_translation() * hips_ratio
            rest = pose_bone.bone.matrix_local
            pose_bone.location = rest.to_quaternion().inverted() @ (wanted - rest.to_translation())


def set_clip(driver, name):
    animation = driver.animation_data
    for track in animation.nla_tracks:
        track.mute = track.name != name
        track.is_solo = False
    animation.action = None
    strips = [s for t in animation.nla_tracks if t.name == name for s in t.strips]
    if not strips:
        raise RuntimeError("anims.glb không có clip " + name)
    return int(strips[0].frame_start), int(strips[0].frame_end)


def read_pixels(path):
    image = bpy.data.images.load(path)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)


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
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(directory, ANIMS["file"]), bone_heuristic="BLENDER")  # giữ nguyên trục xương của glTF
    driver = next(o for o in scene.objects if o not in before and o.type == "ARMATURE")
    for obj in [o for o in scene.objects if o not in before and o.type == "MESH"]:
        obj.hide_render = True
    hips_ratio = character.data.bones[HIPS].head_local.z / driver.data.bones[HIPS].head_local.z

    width, height = CELL
    sheet = np.full((len(SHOTS) * height, COLUMNS * width, 4), 0.35, dtype=np.float32)
    sheet[..., 3] = 1.0
    pp.aim(camera, (2.6, -3.0, 1.0), (0.0, 0.0, 0.85), 50)
    tmp = os.path.join(bpy.app.tempdir, "anim_frame.png")
    for row, (clip, count) in enumerate(SHOTS):
        start, end = set_clip(driver, clip)
        for column in range(count):
            scene.frame_set(start + round((end - start) * column / count))
            copy_pose_like_threejs(driver, character, hips_ratio, skip_missing=True)
            pp.render(scene, tmp, width, height)
            y0 = (len(SHOTS) - 1 - row) * height
            sheet[y0:y0 + height, column * width:(column + 1) * width] = read_pixels(tmp)
    out = bpy.data.images.new("sheet", COLUMNS * width, len(SHOTS) * height, alpha=False)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = os.path.join(directory, "_preview", "%s_%s.png" % (ANIMS["prefix"], name))
    out.file_format = "PNG"
    out.save()
    print("SOAT hoạt hoạ %s -> %s (tỉ lệ hông %.3f)" % (name, out.filepath_raw, hips_ratio))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=os.path.join(pp.ROOT, "assets", "people"))
    parser.add_argument("--characters", default="m_white,f_aodai")
    parser.add_argument("--anims", default="anims.glb")
    parser.add_argument("--prefix", default="anims")
    parser.add_argument("--clips", default="", help="vd: idle:4,walk:6")
    args = parser.parse_args(argv)
    global SHOTS
    ANIMS.update(file=args.anims, prefix=args.prefix)
    if args.clips:
        SHOTS = tuple((item.split(":")[0], int(item.split(":")[1])) for item in args.clips.split(","))
    for name in args.characters.split(","):
        preview_character(name, os.path.abspath(args.dir))


if __name__ == "__main__":
    main()
