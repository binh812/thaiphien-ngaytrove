"""Chân váy dài (quá bắp chân) dựng theo thủ tục: một ống ôm hông rồi xoè nhẹ chữ A.

Dùng lại hai chuỗi xương tà của áo dài (aodaiFront1..4, aodaiBack1..4, con của xương hông) để runtime lái theo bước chân:
nửa trước váy theo chuỗi trước, nửa sau theo chuỗi sau, hai bên sườn pha trộn; phần cạp váy theo xương thân.
"""
import math

import bpy
from mathutils import Vector

import people_aodai as cut

COLUMNS = 48
HEM_ABOVE_ANKLE = 0.20               # m: gấu váy trên mắt cá
EASE, FLARE = 0.014, 0.16            # m: nới ở hông; độ xoè (m bán kính trên mỗi m chiều dài)
WAIST_ABOVE = 0.015                  # m: cạp váy trên khớp eo (nằm dưới vạt áo)


def _mix(a, b, share):
    out = {name: weight * (1.0 - share) for name, weight in a.items()}
    for name, weight in b.items():
        out[name] = out.get(name, 0.0) + weight * share
    return out


def build(body, rig):
    """Trả về (lưới váy tên `bottom`, [(tên xương, cột giữa), ...] cho people_aodai.add_panel_bones)."""
    frame = cut.Frame(body, rig)
    shell = cut._bvh(cut._shell(body, frame))
    top_z, hem_z = frame.waist_z + WAIST_ABOVE, frame.ankle_z + HEM_ABOVE_ANKLE
    rows = cut.PANEL_ROWS
    verts, weights = [], []
    reach = [0.0] * COLUMNS
    for row in range(rows + 1):
        t = row / rows
        z = top_z + (hem_z - top_z) * t
        for column in range(COLUMNS):
            angle = 2 * math.pi * column / COLUMNS                         # 0 = chính diện, tăng dần về bên trái người
            direction = Vector((math.sin(angle), -math.cos(angle), 0.0))
            axis = Vector((0.0, frame.centre_y, z))
            hit, _normal, _index, _dist = shell.ray_cast(axis + direction * 1.5, -direction)
            ease = -0.005 + (EASE + 0.005) * float(cut._smooth(frame.hips_z - 0.11, frame.hips_z - 0.26, z))   # trên hông ôm sát để nằm trong vạt áo
            radius = (hit - axis).length + ease if hit is not None else 0.0
            below_hips = max(frame.hips_z - 0.06 - z, 0.0)
            if hit is not None and z > frame.hips_z - 0.25:
                reach[column] = max(reach[column], radius)
            point = axis + direction * (reach[column] + FLARE * below_hips)
            verts.append(point)
            front_share = float(cut._smooth(-0.35, 0.35, math.cos(angle)))
            weights.append(_mix(cut._panel_weights(frame, body, point, t, cut.BACK_BONES),
                                cut._panel_weights(frame, body, point, t, cut.FRONT_BONES), front_share))
    faces = []
    for row in range(rows):
        for column in range(COLUMNS):
            a, b = row * COLUMNS + column, row * COLUMNS + (column + 1) % COLUMNS
            faces.append((a, b, b + COLUMNS, a + COLUMNS))
    skirt = cut._new_object("bottom", body, verts, faces, weights)
    layer = skirt.data.uv_layers[0]
    for loop in skirt.data.loops:
        index = loop.vertex_index
        column = index % COLUMNS
        wave = column / (COLUMNS / 2.0)
        u = (wave if wave <= 1.0 else 2.0 - wave) * 0.55                    # sóng tam giác: không có đường nối
        layer.data[loop.index].uv = (u / cut.UV_TILE, verts[index].z / cut.UV_TILE)
    centres = []
    for names, column in ((cut.FRONT_BONES, 0), (cut.BACK_BONES, COLUMNS // 2)):
        centres.append((names, [verts[row * COLUMNS + column].copy() for row in range(rows + 1)]))
    bpy.data.objects.remove(cut._SHELL_CACHE.pop(body.name), do_unlink=True)
    return skirt, centres
