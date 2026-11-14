"""Đóng gói một MẶT THÊM vào tệp tủ đồ _ai: thay vì nhân đôi tệp (11–14 MB mỗi mặt), hình khối của mặt thêm thành MỘT morph
target `head_<số>` trong chính tệp tủ đồ (độ lệch đỉnh so với mặt số 1, chỉ ở các lưới đầu), còn kết cấu xuất rời ra
assets/people/heads/<giới><số>/ để runtime đổi `map` của vật liệu `head`, `body` (và normal của `head`).

Quy trình cho mặt số N của giới g:
    python tools/blender/project_head.py tools/blender/ai_heads/<g>N_head.json --no-manifest     # ra .tools/build/ai_heads_var/<g>N.glb
    python tools/blender/pack_head.py --base assets/people/<g>_wardrobe_ai.glb --variant .tools/build/ai_heads_var/<g>N.glb
           --gender <g> --id N --label "Trẻ trung" --age 28
Chạy lại được nhiều lần (morph và mục manifest cùng số được thay thế). Dựng lại mặt số 1 bằng project_head.py thì phải chạy lại
pack_head.py cho mọi mặt thêm, vì tệp _ai được ghi mới.
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai_heads"))
from glbio import Glb  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEXTURES = (("head", "head", "baseColorTexture", "head.jpg"), ("body", "body", "baseColorTexture", "body.jpg"),
            ("headNormal", "head", "normalTexture", "head_n.jpg"))
MOVED = 2e-5          # m: lưới có đỉnh lệch hơn mức này mới nhận morph


def add_shape(base: Glb, variant: Glb, morph: str) -> list:
    """Thêm (hoặc thay) morph target `morph` = vị trí đỉnh của variant trừ của base, cho mọi lưới có đỉnh lệch. Trả về tên các lưới."""
    changed = []
    for mesh, other in zip(base.json["meshes"], variant.json["meshes"]):
        names = mesh.get("extras", {}).get("targetNames")
        if mesh["name"] != other["name"] or len(mesh["primitives"]) != len(other["primitives"]):
            raise ValueError("Hai tệp không cùng cấu trúc lưới: %s / %s" % (mesh["name"], other["name"]))
        if names is None:
            continue
        deltas = []
        for primitive, twin in zip(mesh["primitives"], other["primitives"]):
            here, there = base.accessor(primitive["attributes"]["POSITION"]), variant.accessor(twin["attributes"]["POSITION"])
            if here.shape != there.shape:
                raise ValueError("Số đỉnh khác nhau ở lưới %s" % mesh["name"])
            deltas.append(there.astype(np.float64) - here.astype(np.float64))
        if morph not in names and max(float(np.abs(d).max()) for d in deltas) < MOVED:
            continue
        for primitive, delta in zip(mesh["primitives"], deltas):
            if morph in names:
                base.make_dense(primitive["targets"][names.index(morph)]["POSITION"], delta)
            else:
                target = {"POSITION": base.add_accessor(delta)}
                if "NORMAL" in primitive["targets"][0]:
                    target["NORMAL"] = base.add_accessor(np.zeros_like(delta))
                primitive["targets"].append(target)
        if morph not in names:
            names.append(morph)
            if "weights" in mesh:
                mesh["weights"].append(0.0)
        changed.append("%s (%.1f mm)" % (mesh["name"], max(float(np.linalg.norm(d, axis=1).max()) for d in deltas) * 1000))
    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="tệp tủ đồ _ai (mặt số 1); được ghi lại tại chỗ")
    parser.add_argument("--variant", required=True, help="tệp tạm do project_head.py dựng cho mặt thêm")
    parser.add_argument("--gender", required=True, choices=("m", "f"))
    parser.add_argument("--id", type=int, required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--age", type=int, required=True)
    parser.add_argument("--base-label", default="Chín chắn")
    parser.add_argument("--base-age", type=int, default=42)
    parser.add_argument("--manifest", default="assets/people/manifest.json")
    parser.add_argument("--pristine", default="", help="bản sao tệp _ai CHƯA có morph mặt thêm: đọc từ đây rồi ghi ra --base (chạy lại nhiều lần không làm tệp phình)")
    args = parser.parse_args()
    if args.id < 2:
        raise ValueError("Mặt số 1 nằm sẵn trong tệp tủ đồ; chỉ đóng gói mặt số 2 trở lên")
    base_path = os.path.abspath(os.path.join(ROOT, args.base))
    if not os.path.basename(base_path).endswith("_ai.glb"):
        raise ValueError("Chỉ ghi vào tệp tủ đồ *_ai.glb: %s" % base_path)
    before = os.path.getsize(base_path)
    base, variant = Glb(os.path.join(ROOT, args.pristine) if args.pristine else base_path), Glb(os.path.join(ROOT, args.variant))
    morph, folder = "head_%d" % args.id, "heads/%s%d" % (args.gender, args.id)
    out_dir = os.path.join(os.path.dirname(base_path), folder)
    os.makedirs(out_dir, exist_ok=True)
    textures, total = {}, 0
    for key, material, slot, file_name in TEXTURES:
        data = variant.image_bytes(variant.material_image(material, slot))
        if not data.startswith(b"\xff\xd8"):
            raise ValueError("Kết cấu %s của tệp variant không phải JPEG" % key)
        with open(os.path.join(out_dir, file_name), "wb") as f:
            f.write(data)
        textures[key] = "%s/%s" % (folder, file_name)
        total += len(data)
    changed = add_shape(base, variant, morph)
    base.save(base_path + ".tmp")
    os.replace(base_path + ".tmp", base_path)
    size = os.path.getsize(base_path)
    manifest_path = os.path.join(ROOT, args.manifest)
    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    entry = manifest["wardrobe"][args.gender + "_ai"]
    heads = [h for h in entry.get("heads", [{"id": 1, "label": args.base_label, "age": args.base_age}]) if h["id"] != args.id]
    heads.append({"id": args.id, "label": args.label, "age": args.age, "morph": morph, "textures": textures})
    entry["heads"], entry["bytes"] = sorted(heads, key=lambda h: h["id"]), size
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("MORPH %s trên %d lưới: %s" % (morph, len(changed), ", ".join(changed)))
    print("TỆP %s: %.2f -> %.2f MB; kết cấu rời %s: %.2f MB" % (os.path.basename(base_path), before / 1e6, size / 1e6, folder, total / 1e6))


if __name__ == "__main__":
    main()
