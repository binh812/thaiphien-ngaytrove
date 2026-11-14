"""Chuyển tài nguyên MakeHuman đã biên dịch (.mhpxy + .npz) về dạng văn bản (.mhclo + .obj)
để MPFB đọc được. Gói MakeHuman 1.3.0 trên PPA chỉ phát hành dạng đã biên dịch.

Dùng: <python của Blender> -I tools/blender/mhpxy_to_mhclo.py <thư mục data nguồn> <thư mục data đích>
Mọi tệp khác (mhmat, png, thumb, mhw) được chép nguyên sang đích.
"""
import os
import shutil
import sys

import numpy as np


def _text(arr):
    return arr.tobytes().decode("utf-8", errors="replace")


def _split(str_arr, idx_arr):
    """Tách mảng chuỗi dồn (kiểu MakeHuman: chuỗi nối + mảng vị trí bắt đầu) thành danh sách."""
    data = str_arr.tobytes()
    starts = idx_arr.tolist() + [len(data)]
    return [data[a:b].decode("utf-8", errors="replace") for a, b in zip(starts, starts[1:])]


def _ranges(indices):
    """Gộp danh sách chỉ số tăng dần thành các đoạn 'a - b' theo cú pháp delete_verts."""
    parts, start, prev = [], None, None
    for i in indices:
        if start is None:
            start = prev = i
        elif i == prev + 1:
            prev = i
        else:
            parts.append(str(start) if start == prev else "%d - %d" % (start, prev))
            start = prev = i
    if start is not None:
        parts.append(str(start) if start == prev else "%d - %d" % (start, prev))
    return parts


def write_obj(npz_path, obj_path):
    mesh = np.load(npz_path, allow_pickle=False)
    coord, texco, fvert = mesh["coord"], mesh["texco"], mesh["fvert"]
    fuvs = mesh["fuvs"] if "fuvs" in mesh.files else None
    lines = ["# Chuyển từ %s (MakeHuman, CC0)" % os.path.basename(npz_path)]
    lines += ["v %.6f %.6f %.6f" % tuple(c) for c in coord.tolist()]
    lines += ["vt %.6f %.6f" % tuple(t) for t in texco.tolist()]
    has_uv = fuvs is not None and len(texco) > 0
    for fi, face in enumerate(fvert.tolist()):
        count = 3 if face[3] == face[0] or face[3] == face[2] else 4
        if has_uv:
            uv = fuvs[fi].tolist()
            lines.append("f " + " ".join("%d/%d" % (face[k] + 1, uv[k] + 1) for k in range(count)))
        else:
            lines.append("f " + " ".join(str(face[k] + 1) for k in range(count)))
    with open(obj_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return len(coord)


def write_mhclo(mhpxy_path, mhclo_path, vertex_count):
    pxy = np.load(mhpxy_path, allow_pickle=False)
    name = _text(pxy["name"])
    out = ["# MHCLO chuyển từ %s (MakeHuman 1.3.0)" % os.path.basename(mhpxy_path),
           "# license: CC0",
           "# author: MakeHuman_Team",
           "basemesh hm08",
           "name " + name.replace(" ", "_"),
           "uuid " + _text(pxy["uuid"]),
           "obj_file " + os.path.splitext(os.path.basename(mhclo_path))[0] + ".obj"]
    for tag in _split(pxy["tags_str"], pxy["tags_idx"]):
        out.append("tag " + tag)
    scale, idx = pxy["tmat_scale"].tolist(), pxy["tmat_scale_idx"].tolist()
    for axis, k in (("x", 0), ("z", 2), ("y", 1)):
        out.append("%s_scale %d %d %.4f" % (axis, idx[2 * k], idx[2 * k + 1], scale[k]))
    out.append("z_depth %d" % int(pxy["z_depth"]))
    if "max_pole" in pxy.files:
        out.append("max_pole %d" % int(pxy["max_pole"]))
    if "material_file" in pxy.files and pxy["material_file"].size:
        out.append("material " + _text(pxy["material_file"]))
    if "vertexBoneWeights_file" in pxy.files and pxy["vertexBoneWeights_file"].size:
        out.append("vertexboneweights_file " + _text(pxy["vertexBoneWeights_file"]))

    refs = pxy["ref_vIdxs"]
    if len(refs) != vertex_count:
        raise ValueError("%s: số đỉnh proxy (%d) khác số đỉnh lưới (%d)" % (mhpxy_path, len(refs), vertex_count))
    out.append("verts 0")
    if int(pxy["num_refverts"]) == 3:
        weights, offsets = pxy["weights"].tolist(), pxy["offsets"].tolist()
        for r, w, o in zip(refs.tolist(), weights, offsets):
            out.append("%d %d %d %.6f %.6f %.6f %.6f %.6f %.6f" % (r[0], r[1], r[2], w[0], w[1], w[2], o[0], o[1], o[2]))
    else:
        flat = refs.reshape(len(refs), -1)[:, 0]
        out += [str(v) for v in flat.tolist()]

    if "deleteVerts" in pxy.files:
        doomed = np.nonzero(pxy["deleteVerts"])[0].tolist()
        if doomed:
            out.append("")
            out.append("delete_verts")
            parts = _ranges(doomed)
            for i in range(0, len(parts), 8):
                out.append(" ".join(parts[i:i + 8]))
    with open(mhclo_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


def main():
    src, dst = sys.argv[1], sys.argv[2]
    converted = 0
    for root, _dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        target = os.path.join(dst, rel)
        os.makedirs(target, exist_ok=True)
        for name in files:
            path = os.path.join(root, name)
            base, ext = os.path.splitext(name)
            if ext == ".mhpxy":
                npz = os.path.join(root, base + ".npz")
                if not os.path.exists(npz):
                    raise FileNotFoundError(npz)
                count = write_obj(npz, os.path.join(target, base + ".obj"))
                write_mhclo(path, os.path.join(target, base + ".mhclo"), count)
                converted += 1
            elif ext != ".npz":
                shutil.copy2(path, os.path.join(target, name))
    print("Đã chuyển %d tài nguyên vào %s" % (converted, dst))


if __name__ == "__main__":
    main()
