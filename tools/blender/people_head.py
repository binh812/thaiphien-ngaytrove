"""Chi tiết vùng đầu: bố cục mống mắt trên UV của lưới mắt, lớp giác mạc, khoang miệng tối sau hàm răng.

Hệ Blender: mặt nhìn về -Y, bên trái người là +X, Z lên. Mọi kết cấu ở đây là tự vẽ (people_textures) trên nền tài nguyên
CC0 của MakeHuman.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import people_aodai as cut

IRIS_RADIUS = 0.0054                 # m: bán kính mống mắt
CORNEA_REACH, CORNEA_BULGE, CORNEA_LIFT = 1.35, 0.0007, 0.00025   # theo bán kính mống mắt; m; m
CAVITY_RADII = (0.021, 0.024, 0.013)  # m: bán trục ngang, sâu, cao của khoang miệng
CAVITY_BACK = 0.027                  # m: tâm khoang lùi sau mặt trước hàm răng
CAVITY_UV = (0.008, 0.008)           # góc đen của kết cấu răng (people_textures vẽ ô đen ở đây)


def _uv_of_vertices(obj):
    uv = np.zeros((len(obj.data.vertices), 2))
    layer = obj.data.uv_layers[0].data
    for loop in obj.data.loops:
        uv[loop.vertex_index] = layer[loop.index].uv
    return uv


def eye_layout(eyes):
    """Mỗi mắt: (u, v tâm mống mắt, bán kính mống mắt theo UV, hướng "lên" trong UV, hướng "ra phía thái dương" trong UV).
    Tâm = đỉnh nhô ra trước nhất; hai hướng lấy bằng bình phương tối thiểu từ độ lệch 3D sang độ lệch UV quanh cực trước."""
    co, uv = cut._coords(eyes), _uv_of_vertices(eyes)
    out = []
    for sign in (1.0, -1.0):
        side = np.nonzero(co[:, 0] * sign > 0)[0]
        pole = side[np.argmin(co[side, 1])]
        near = side[np.linalg.norm(co[side] - co[pole], axis=1) < 0.008]
        offsets = np.stack([co[near, 0] - co[pole, 0], co[near, 2] - co[pole, 2]], axis=1)
        solution, _residual, _rank, _values = np.linalg.lstsq(offsets, uv[near] - uv[pole], rcond=None)   # (dx, dz) -> (du, dv)
        along_x, along_z = solution[0], solution[1]
        scale = (np.linalg.norm(along_x) + np.linalg.norm(along_z)) / 2.0
        up = along_z / max(np.linalg.norm(along_z), 1e-9)
        outward = along_x / max(np.linalg.norm(along_x), 1e-9)      # cùng một phía (+X) cho cả hai mắt: đốm sáng không làm mắt trông lác
        out.append((float(uv[pole, 0]), float(uv[pole, 1]), float(IRIS_RADIUS * scale), (float(up[0]), float(up[1])),
                    (float(outward[0]), float(outward[1]))))
    return out


def add_cornea(eyes, material):
    """Nhân đôi các mặt quanh mống mắt thành lớp giác mạc lồi nhẹ (vật liệu `cornea`, trong suốt, bóng) để bắt đốm sáng.
    Gọi SAU khi lưới mắt đã có shape key: lớp mới thừa hưởng shape key, độ lồi được cộng vào mọi key."""
    base = cut._coords(eyes)
    eyes.data.materials.append(material)
    slot = len(eyes.data.materials) - 1
    bm = bmesh.new()
    bm.from_mesh(eyes.data)
    bm.verts.ensure_lookup_table()
    reach = IRIS_RADIUS * CORNEA_REACH
    poles = []
    for sign in (1.0, -1.0):
        side = [v for v in bm.verts if v.co.x * sign > 0]
        poles.append(min(side, key=lambda v: v.co.y).co.copy())
    faces = [f for f in bm.faces if any(all((v.co - pole).length < reach for v in f.verts) for pole in poles)]
    result = bmesh.ops.duplicate(bm, geom=faces)
    new_faces = [g for g in result["geom"] if isinstance(g, bmesh.types.BMFace)]
    new_verts = [g for g in result["geom"] if isinstance(g, bmesh.types.BMVert)]
    for face in new_faces:
        face.material_index = slot
    shifts = {}
    for vert in new_verts:
        pole = min(poles, key=lambda p: (vert.co - p).length)
        distance = (vert.co - pole).length / reach
        shifts[vert] = Vector((0.0, -1.0, 0.0)) * (CORNEA_LIFT + CORNEA_BULGE * max(0.0, 1.0 - distance * distance))
    layers = list(bm.verts.layers.shape.values())
    for vert, shift in shifts.items():
        vert.co += shift
        for layer in layers:
            vert[layer] = vert[layer] + shift
    bm.to_mesh(eyes.data)
    bm.free()
    eyes.data.update()
    return len(new_faces), len(base)


def add_mouth_cavity(teeth):
    """Thêm một khoang tối (nửa ê-líp-xô-ít hở phía trước) sau hàm răng: khi cười hở miệng không nhìn xuyên ra sau đầu.
    Mọi đỉnh của khoang dùng chung một điểm UV nằm trong ô đen của kết cấu răng."""
    co = cut._coords(teeth)
    front_y = float(co[:, 1].min())
    centre = Vector((0.0, front_y + CAVITY_BACK, float((co[:, 2].max() + co[:, 2].min()) / 2.0)))
    rings, segments = 6, 14
    verts, faces = [], []
    for ring in range(rings + 1):                          # từ miệng khoang (hơi sau răng cửa) vòng ra đáy khoang phía sau
        polar = math.radians(55.0) + (math.pi - math.radians(55.0)) * ring / rings
        for segment in range(segments):
            around = 2 * math.pi * segment / segments
            verts.append(centre + Vector((CAVITY_RADII[0] * math.sin(polar) * math.cos(around),
                                          -CAVITY_RADII[1] * math.cos(polar),
                                          CAVITY_RADII[2] * math.sin(polar) * math.sin(around))))
    for ring in range(rings):
        for segment in range(segments):
            a, b = ring * segments + segment, ring * segments + (segment + 1) % segments
            faces.append((a, a + segments, b + segments, b))     # mặt quay vào trong (nhìn từ cửa miệng)
    cavity = cut._new_object("mouth_cavity", teeth, verts, faces, [{cut.P + "Head": 1.0} for _ in verts])
    layer = cavity.data.uv_layers[0]
    for loop in cavity.data.loops:
        layer.data[loop.index].uv = CAVITY_UV
    cut._join(teeth, [cavity])
    return len(faces)


FACE_TEXTURE_LONG, FACE_TEXTURE_SHORT = 1536, 1024   # px: kết cấu riêng của vùng mặt (vật liệu `head`)


def _uv_islands(mesh, loop_uv):
    """Nhãn đảo UV cho từng mặt (hai mặt cùng đảo nếu chung một đỉnh có cùng UV)."""
    parent = list(range(len(mesh.polygons)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    owner = {}
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            key = (mesh.loops[loop_index].vertex_index, round(float(loop_uv[loop_index, 0]), 5), round(float(loop_uv[loop_index, 1]), 5))
            if key in owner:
                a, b = find(owner[key]), find(polygon.index)
                if a != b:
                    parent[a] = b
            else:
                owner[key] = polygon.index
    return np.array([find(i) for i in range(len(mesh.polygons))])


def split_face(body, rig, eyes, eyelashes):
    """Tách các mặt vùng mặt (trán tới dưới cằm, cả hai tai) của lưới thân sang ô vật liệu thứ hai (`head`) và đổi UV của
    chúng sang hệ của kết cấu mặt riêng (một hình chữ nhật cắt thẳng từ atlas da, phóng to). Gọi khi lưới thân còn các nhóm
    đỉnh `lips`, `ears`, `scalp`. Trả về dữ liệu cho people_textures.head_maps (tam giác, mốc khuôn mặt)."""
    mesh = body.data
    co = cut._coords(body)
    head_z = rig.data.bones[cut.P + "Head"].head_local.z
    lips, ears, scalp = (cut._members(body, name) for name in ("lips", "ears", "scalp"))
    loop_uv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers[0].data.foreach_get("uv", loop_uv)
    loop_uv = loop_uv.reshape(-1, 2).astype(np.float64)
    loop_vertex = np.array([loop.vertex_index for loop in mesh.loops])
    face_vertex = (co[:, 2] > head_z - 0.02) & ~scalp & (co[:, 1] < co[ears, 1].max() + 0.012)
    islands = _uv_islands(mesh, loop_uv)
    votes = {}
    for polygon in mesh.polygons:
        if all(face_vertex[i] and not lips[i] for i in polygon.vertices):
            votes[islands[polygon.index]] = votes.get(islands[polygon.index], 0) + 1
    island = max(votes, key=votes.get)
    in_island = np.array([islands[p.index] == island for p in mesh.polygons])
    chosen = [loop_index for p in mesh.polygons if in_island[p.index] and all(face_vertex[i] for i in p.vertices) for loop_index in p.loop_indices]
    low, high = loop_uv[chosen].min(axis=0) - 0.004, loop_uv[chosen].max(axis=0) + 0.004
    size = high - low
    long_axis = int(size[1] > size[0])
    ratio = FACE_TEXTURE_LONG / FACE_TEXTURE_SHORT
    centre = (low + high) / 2.0
    if size[long_axis] / size[1 - long_axis] > ratio:
        size[1 - long_axis] = size[long_axis] / ratio
    else:
        size[long_axis] = size[1 - long_axis] * ratio
    low = np.clip(centre - size / 2.0, 0.0, 1.0 - size)       # giữ ô cắt nằm trọn trong atlas
    high = low + size
    pixels = (FACE_TEXTURE_LONG, FACE_TEXTURE_SHORT) if long_axis == 0 else (FACE_TEXTURE_SHORT, FACE_TEXTURE_LONG)   # (rộng, cao)
    triangles, moved = [], []
    layer = mesh.uv_layers[0].data
    count = 0
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        uvs = loop_uv[loops]
        if not in_island[polygon.index] or (uvs < low).any() or (uvs > high).any():
            continue
        moved.append(polygon.index)
        count += 1
        new_uv = (uvs - low) / size
        for loop_index, uv in zip(loops, new_uv):
            layer[loop_index].uv = uv
        for k in range(1, len(loops) - 1):
            corners = (0, k, k + 1)
            triangles.append((new_uv[list(corners)], co[loop_vertex[[loops[c] for c in corners]]],
                              lips[loop_vertex[[loops[c] for c in corners]]].astype(np.float64)))
    eye_co, lash_co = cut._coords(eyes), cut._coords(eyelashes)
    poles, upper_roots, lower_roots = [], [], []
    for sign in (1.0, -1.0):
        side = eye_co[eye_co[:, 0] * sign > 0]
        pole = side[np.argmin(side[:, 1])]
        poles.append(pole)
        lashes = lash_co[lash_co[:, 0] * sign > 0]
        reach = np.linalg.norm(lashes - (pole + np.array([0.0, 0.012, 0.0])), axis=1)
        roots = lashes[reach < np.percentile(reach, 40)]
        roots = roots[np.argsort(roots[:, 0])]
        upper_roots.append(roots[roots[:, 2] > pole[2]])
        lower_roots.append(roots[roots[:, 2] <= pole[2]])
    lip_co = co[lips & face_vertex]
    eye_z, mouth_z = float(np.mean([p[2] for p in poles])), float(lip_co[:, 2].mean())
    middle = co[face_vertex & (np.abs(co[:, 0]) < 0.008) & (co[:, 2] > mouth_z + 0.012) & (co[:, 2] < eye_z - 0.005)]
    nose = middle[np.argmin(middle[:, 1])]
    below = co[face_vertex & (np.abs(co[:, 0]) < 0.01) & (co[:, 2] < mouth_z - 0.012)]
    chin_z = float(below[np.argmin(below[:, 1]), 2]) - 0.018      # dưới điểm nhô nhất của cằm
    print("MAT %s: %d mặt sang vật liệu head, ô UV %s..%s, kết cấu %dx%d" % (body.name, count, np.round(low, 3), np.round(high, 3), pixels[0], pixels[1]))
    return {"polygons": moved, "rect": (float(low[0]), float(low[1]), float(high[0]), float(high[1])), "pixels": pixels, "triangles": triangles,
            "eyes": np.array(poles), "upper_lash": np.concatenate(upper_roots), "lower_lash": np.concatenate(lower_roots),
            "mouth_z": mouth_z, "mouth_half": float(np.abs(lip_co[:, 0]).max()), "nose": nose, "eye_z": eye_z,
            "chin_z": chin_z}
