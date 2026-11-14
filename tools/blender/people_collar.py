"""Cổ áo sơ mi có khối vải thật: chân cổ (dải đứng ôm quanh cổ, hở phía trước) + lá cổ gập xuống từ mép trên chân cổ.

Cách dựng (hệ Blender: mặt nhìn về -Y, bên trái người là +X, Z lên):
- NeckRing đo tiết diện cổ trên lưới da, cho ra vòng cổ áo (tiết diện cổ nới ra CLEARANCE), mặt phẳng nghiêng của
  đường chân cổ (gáy cao, hõm cổ thấp) và độ cao chân cổ / đường gập theo góc quanh cổ.
- Mỗi "hàng" của lưới là một lát cắt qua cổ áo: chân cổ đi lên, lượn tròn qua đường gập (bán kính ROLL), rồi lá cổ đi
  thẳng xuống tới mép ngoài. Hàng sau gáy và hai bên: lá cổ là tấm cứng xoay quanh đường gập cho tới khi chạm áo
  (cách áo EDGE_GAP). Hàng phía trước: mép ngoài đi theo đường cong tới mũi cổ đặt trên ngực.
- Lá cổ có mặt dưới (dày THICKNESS) và vành mép. UV lá cổ: v = khoảng cách thật tới mép hở gần nhất (mép ngoài hoặc mép
  trước) nên dải viền trong kết cấu luôn chạy song song mép, gặp nhau thành góc ở mũi cổ.
"""
import math

import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import people_aodai as cut
import people_textures as tex

RING_SAMPLES = 72
ROLL = 0.003                         # m: bán kính lượn của đường gập
THICKNESS = 0.0025                   # m: độ dày lá cổ
EDGE_GAP = 0.0045                    # m: mặt dưới lá cổ cách thân áo
ROW_STEP = 0.007                     # m: bước hàng dọc đường gập (phần gáy và hai bên)
FRONT_ROWS = 18                      # số hàng từ đầu chân cổ tới chỗ hết vùng mũi cổ
OUTER_OFFSETS = (0.0, 0.004, 0.00825, 0.012, 0.01575, 0.021)   # m: các cột tính từ mép ngoài (trùng hai mép dải viền)
INNER_COLUMNS = 3
ARC_STEPS = 3
STRIPE_REFERENCE = 0.075             # m ứng với v = 1 của vùng lapel (dải viền ở 0,11–0,21 -> cách mép 8–16 mm)
PLAIN_V = 0.93
ALPHA_RANGE = (20.0, 85.0)           # độ: lá cổ nghiêng xuống so với phương ngang
STAND_SPINE_SHARE = 0.4              # phần chân cổ theo thẳng xương Spine2 (không lắc theo cổ/đầu)


def skin_tree(body, frame):
    """BVH chỉ gồm các mặt da (bỏ lưới trợ giúp)."""
    polygons = [tuple(p.vertices) for p in body.data.polygons if all(frame.skin[i] for i in p.vertices)]
    return BVHTree.FromPolygons([tuple(c) for c in frame.co], polygons)


def _circular_smooth(values, passes=2):
    values = np.asarray(values, dtype=np.float64)
    for _ in range(passes):
        values = (np.roll(values, 1) + 2.0 * values + np.roll(values, -1)) / 4.0
    return (values + np.roll(values[::-1], 1)) / 2.0         # đối xứng trái - phải (mẫu k và mẫu N - k)


class NeckRing:
    """Vòng cổ áo đo trên da. Góc psi: 0 = chính giữa phía trước, 90 độ = bên trái người (+X), 180 độ = sau gáy."""

    def __init__(self, body, frame, spec):
        self.skin = skin_tree(body, frame)
        self.neck_z = frame.neck_z
        reference_z = frame.neck_z + 0.005
        axis = Vector((0.0, frame.neck_xy[1]))
        section = self._section(axis, reference_z)
        self.centre = Vector((0.0, float(np.mean([p.y for p in section]))))
        radii = [(p - self.centre).length for p in self._section(self.centre, reference_z)]
        self.radii = _circular_smooth(radii) + spec["CLEARANCE"]
        self.pit_z = self._pit(frame)
        back_y, front_y = self.centre.y + self.radius(math.pi), self.centre.y - self.radius(0.0)
        self.plane = (back_y, front_y, frame.neck_z + spec["BASE_BACK"], self.pit_z + spec["BASE_FRONT"])
        self.height = spec["STAND_HEIGHT"]
        base, top = [], []
        for k in range(RING_SAMPLES):
            psi = 2 * math.pi * k / RING_SAMPLES
            xy = self.xy(psi)
            plane_z = self.plane_z(xy.y)
            start = Vector((xy.x, xy.y, plane_z + self.height + 0.008))
            hit, _normal, _index, _dist = self.skin.ray_cast(start, Vector((0, 0, -1)), 0.2)
            surface = hit.z if hit is not None else -1e9
            base.append(max(plane_z, surface) - 0.004)
            top.append(max(plane_z + self.height, base[-1] + spec["STAND_MIN"]))
        self.base, self.top = _circular_smooth(base, 3), _circular_smooth(top, 3)

    def _section(self, centre, z):
        points = []
        for k in range(RING_SAMPLES):
            psi = 2 * math.pi * k / RING_SAMPLES
            direction = Vector((math.sin(psi), -math.cos(psi), 0.0))
            origin = Vector((centre.x, centre.y, z)) + direction * 0.3
            hit, _normal, _index, distance = self.skin.ray_cast(origin, -direction, 0.3)
            radius = 0.3 - distance if hit is not None else 0.055
            points.append(Vector((centre.x, centre.y)) + Vector((direction.x, direction.y)) * radius)
        return points

    def _pit(self, frame):
        """Độ cao hõm cổ: chỗ da mặt trước (x = 0) lõm vào sâu nhất giữa ngực và yết hầu."""
        best_y, best_z = -1e9, frame.neck_z - 0.03
        for step in range(21):
            z = frame.neck_z - 0.09 + step * 0.005
            hit, _normal, _index, _dist = self.skin.ray_cast(Vector((0.0, -1.0, z)), Vector((0, 1, 0)))
            if hit is not None and hit.y > best_y:
                best_y, best_z = hit.y, z
        return best_z

    def _lookup(self, values, psi):
        position = (psi % (2 * math.pi)) / (2 * math.pi) * RING_SAMPLES
        low = int(math.floor(position)) % RING_SAMPLES
        share = position - math.floor(position)
        return float(values[low] * (1 - share) + values[(low + 1) % RING_SAMPLES] * share)

    def radius(self, psi):
        return self._lookup(self.radii, psi)

    def xy(self, psi, extra=0.0):
        radius = self.radius(psi) + extra
        return Vector((self.centre.x + radius * math.sin(psi), self.centre.y - radius * math.cos(psi)))

    def point(self, psi, z, extra=0.0):
        xy = self.xy(psi, extra)
        return Vector((xy.x, xy.y, z))

    def outward(self, psi):
        return Vector((math.sin(psi), -math.cos(psi), 0.0))

    def plane_z(self, y):
        back_y, front_y, back_z, front_z = self.plane
        share = min(max((back_y - y) / (back_y - front_y), 0.0), 1.0)
        return back_z + (front_z - back_z) * share

    def front_cut(self, co):
        """Mặt nạ phần thân áo phía trước nằm trên đường chân cổ nghiêng (đường viền cổ áo hạ dần về hõm cổ)."""
        back_y, front_y, back_z, front_z = self.plane
        plane = back_z + (front_z - back_z) * np.clip((back_y - co[:, 1]) / (back_y - front_y), 0.0, 1.0)
        return (co[:, 1] < self.centre.y - 0.02) & (np.abs(co[:, 0]) < 0.09) & (co[:, 2] > plane + 0.012)

    def seat(self, co, edge_mask, front_x):
        """Đưa các đỉnh trên mép lỗ cổ của thân áo (edge_mask) về sát chân cổ, ngay ngoài vách chân cổ: kín khe giữa
        thân áo và chân cổ. Bỏ qua phần mép phía trước (khe chữ V)."""
        out = co.copy()
        dx, dy = co[:, 0] - self.centre.x, co[:, 1] - self.centre.y
        for i in np.nonzero(edge_mask)[0]:
            psi = math.atan2(dx[i], -dy[i]) % (2 * math.pi)
            reach = math.hypot(dx[i], dy[i])
            if abs(self.xy(psi).x) < front_x and dy[i] < 0 or reach > self.radius(psi) + 0.04 or co[i, 2] < self.plane_z(co[i, 1]) - 0.05:
                continue
            target = self.point(psi, self.base_z(psi) + 0.003, 0.0015)
            out[i] = (target.x, target.y, target.z)
        return out

    def base_z(self, psi):
        return self._lookup(self.base, psi)

    def top_z(self, psi):
        return self._lookup(self.top, psi)

    def angle_at_x(self, x):
        """Góc psi (phía trước) mà tại đó vòng cổ có hoành độ x."""
        for step in range(1, 900):
            psi = math.radians(step * 0.1)
            if self.xy(psi).x >= x:
                return psi
        return math.radians(45.0)

    def inside(self, co):
        """Mặt nạ các điểm nằm trong lòng cổ áo (để khoét lỗ cổ trên thân áo)."""
        dx, dy = co[:, 0] - self.centre.x, co[:, 1] - self.centre.y
        psi = np.arctan2(dx, -dy) % (2 * math.pi)
        position = psi / (2 * math.pi) * RING_SAMPLES
        low = np.floor(position).astype(int) % RING_SAMPLES
        share = position - np.floor(position)
        radius = self.radii[low] * (1 - share) + self.radii[(low + 1) % RING_SAMPLES] * share
        back_y, front_y, back_z, front_z = self.plane
        plane = back_z + (front_z - back_z) * np.clip((back_y - co[:, 1]) / (back_y - front_y), 0.0, 1.0)
        return (np.hypot(dx, dy) < radius + 0.004) & (co[:, 2] > plane - 0.004)


class _Gap:
    """Khoảng hở có dấu từ một điểm tới bề mặt gần nhất trong số các lưới (thân áo, da)."""

    def __init__(self, trees):
        self.trees = trees

    def __call__(self, point):
        best = (1e9, None)
        for tree in self.trees:
            hit, normal, _index, distance = tree.find_nearest(point, 0.08)
            if hit is None:
                continue
            offset = point - hit
            depth = offset.dot(normal)
            if (offset - normal * depth).length > 0.004:       # điểm nằm ngoài mép lưới: lấy khoảng cách thường
                depth, normal = distance, (offset.normalized() if distance > 1e-6 else normal)
            if depth < best[0]:
                best = (depth, normal)
        return best

    def lift(self, point, need, passes=2):
        for _ in range(passes):
            depth, normal = self(point)
            if normal is None or depth >= need:
                break
            point = point + normal * (need - depth)
        return point


def _segment_distance(point, polyline):
    best = 1e9
    for a, b in zip(polyline[:-1], polyline[1:]):
        ab = b - a
        t = min(max((point - a).dot(ab) / max(ab.length_squared, 1e-12), 0.0), 1.0)
        best = min(best, (point - (a + ab * t)).length)
    return best


def _row(ring, gap, psi, heading, alpha, edge, need):
    """Một lát cắt: [chân cổ đáy, chân cổ giữa, các điểm lượn qua đường gập ..., các điểm lá cổ ... mép ngoài].
    edge: điểm mép ngoài cho trước (hàng phía trước) hoặc None (lá cổ rơi tự do dài `alpha[1]`)."""
    top = ring.top_z(psi)
    base = ring.point(psi, ring.base_z(psi))
    start = ring.point(psi, top - ROLL)                      # hết phần đứng của chân cổ
    centre = start + heading * ROLL
    if edge is not None:
        reach = edge - (centre + Vector((0, 0, ROLL)))
        flat = Vector((reach.x, reach.y, 0.0))
        heading = flat.normalized()
        centre = start + heading * ROLL
        angle = math.atan2(-reach.z, flat.length)
    else:
        angle = alpha[0]
    sweep = math.pi / 2 + angle
    points = [base, base.lerp(start, 0.5)]
    for step in range(ARC_STEPS + 1):
        phi = sweep * step / ARC_STEPS
        points.append(centre + (-heading * math.cos(phi) + Vector((0, 0, 1)) * math.sin(phi)) * ROLL)
    fold_end = points[-1]
    if edge is None:
        edge = fold_end + (heading * math.cos(angle) - Vector((0, 0, 1)) * math.sin(angle)) * alpha[1]
    length = (edge - fold_end).length
    along = (fold_end - edge) / max(length, 1e-6)
    scale = min(1.0, 0.7 * length / OUTER_OFFSETS[-1])
    inner_end = OUTER_OFFSETS[-1] * scale
    leaf = [edge + along * (inner_end + (length - inner_end) * (1.0 - (k + 1) / (INNER_COLUMNS + 1))) for k in range(INNER_COLUMNS)]
    leaf += [edge + along * (offset * scale) for offset in reversed(OUTER_OFFSETS)]
    points += [gap.lift(p, need) for p in leaf]
    return points


def _free_angle(ring, gap, psi, width, need):
    """Góc nghiêng lớn nhất mà lá cổ (tấm thẳng dài `width`) chưa chạm áo."""
    heading = ring.outward(psi)
    start = ring.point(psi, ring.top_z(psi) - ROLL) + heading * ROLL
    for degrees in np.arange(ALPHA_RANGE[1], ALPHA_RANGE[0] - 0.1, -1.0):
        angle = math.radians(degrees)
        fold_end = start + (-heading * math.cos(math.pi / 2 + angle) + Vector((0, 0, 1)) * math.sin(math.pi / 2 + angle)) * ROLL
        direction = heading * math.cos(angle) - Vector((0, 0, 1)) * math.sin(angle)
        if all(gap(fold_end + direction * s)[0] >= need for s in np.arange(0.012, width + 1e-6, 0.005)):
            return angle
    return math.radians(ALPHA_RANGE[0])


def _side_rows(ring, gap, shirt_tree, spec):
    """Các lát cắt của nửa trái, từ đầu chân cổ phía trước (hàng 0 = mép trước lá cổ) vòng ra tới giữa gáy."""
    need = EDGE_GAP + THICKNESS
    psi_gap = ring.angle_at_x(spec["GAP_X"])
    psi_blend = math.radians(spec["BLEND_DEG"])
    count = max(int(math.ceil((math.pi - psi_blend) * ring.radius(math.pi * 0.75) / ROW_STEP)), 6)
    free_psi = [psi_blend + (math.pi - psi_blend) * k / count for k in range(count + 1)]
    widths = [spec["BACK_WIDTH"] + (spec["SIDE_WIDTH"] - spec["BACK_WIDTH"]) * (1.0 - cut._smooth(0.0, 1.0, k / count)) for k in range(count + 1)]
    angles = np.array([_free_angle(ring, gap, psi, width, need) for psi, width in zip(free_psi, widths)])
    smooth = angles.copy()
    for _ in range(3):
        padded = np.concatenate([[smooth[0]] * 2, smooth, [smooth[-1]] * 2])
        smooth = np.convolve(padded, np.ones(5) / 5.0, mode="valid")
    angles = smooth - max(float((smooth - angles).max()), 0.0)   # mượt, và không hàng nào nghiêng quá mức đã chạm áo
    free = [_row(ring, gap, psi, ring.outward(psi), (angle, width), None, need) for psi, angle, width in zip(free_psi, angles, widths)]

    fold_start = ring.point(psi_gap, ring.top_z(psi_gap))
    spread = math.radians(spec["SPREAD_DEG"])
    tip_x, tip_z = fold_start.x + spec["FRONT_EDGE"] * math.sin(spread), fold_start.z - spec["FRONT_EDGE"] * math.cos(spread)
    hit, normal, _index, _dist = shirt_tree.ray_cast(Vector((tip_x, -2.0, tip_z)), Vector((0, 1, 0)))
    if hit is None:
        raise RuntimeError("Không đặt được mũi cổ lên ngực áo tại x=%.3f z=%.3f" % (tip_x, tip_z))
    tip = hit + normal * need
    side = free[0][-1]
    control = side.lerp(tip, 0.45) + Vector((spec["BULGE"], -spec["BULGE"] * 0.3, 0.0))
    front = []
    for j in range(FRONT_ROWS):
        t = j / FRONT_ROWS
        g = 1.0 - t ** 1.5                                   # 1 ở mũi cổ, hàng dày dần về phía mũi
        psi = psi_gap + (psi_blend - psi_gap) * (1.0 - g)
        edge = (1 - g) * (1 - g) * side + 2 * g * (1 - g) * control + g * g * tip
        if j > 0:
            near, near_normal, _index, _dist = shirt_tree.find_nearest(edge)
            edge = near + near_normal * need
        front.append(_row(ring, gap, psi, ring.outward(psi), None, edge, need))
    return front + free


def build(shirt, body, frame, ring, spec):
    """Trả về (lưới cổ áo, {"edge": đường mép hở nửa trái, "tree": BVH cổ áo})."""
    shirt_tree = cut._bvh(shirt)
    rows = _side_rows(ring, _Gap((shirt_tree, ring.skin)), shirt_tree, spec)
    columns = len(rows[0])
    fold = 2 + ARC_STEPS                                     # cột của điểm cuối đường lượn = đầu phần lá cổ thẳng
    outer = [row[-1] for row in rows]
    front_edge = rows[0][fold:]
    rect = tex.UNIFORM_ATLAS[spec["LAPEL_KEY"]]

    def uv(distance):
        x0, y0, x1, y1 = rect
        return (x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * min(max(distance / STRIPE_REFERENCE, 0.02), PLAIN_V))

    plain_uv = uv(1.0)
    seam = len(rows) - 1
    verts, stand_share, faces, face_uvs = [], [], [], []
    index = {}

    def add(key, point, share):
        index[key] = len(verts)
        verts.append(point)
        stand_share.append(share)

    normals = {}
    for r, row in enumerate(rows):                           # pháp tuyến mặt trên lá cổ (để đặt mặt dưới)
        for c in range(fold, columns):
            across = row[min(c + 1, columns - 1)] - row[max(c - 1, fold)]
            along = rows[min(r + 1, seam)][c] - rows[max(r - 1, 0)][c]
            normal = across.cross(along)
            normals[(r, c)] = normal.normalized() if normal.length > 1e-9 else Vector((0, 0, 1))
    for side in (1.0, -1.0):
        flip = Vector((side, 1.0, 1.0))
        for r, row in enumerate(rows):
            for c, point in enumerate(row):
                if side < 0 and r == seam:                   # hàng giữa gáy dùng chung cho hai nửa
                    index[(side, "top", r, c)] = index[(1.0, "top", r, c)]
                    if c >= fold:
                        index[(side, "under", r, c)] = index[(1.0, "under", r, c)]
                    continue
                placed = Vector((0.0 if r == seam else point.x * side, point.y, point.z))
                add((side, "top", r, c), placed, 1.0 if c < 2 else (0.5 if c < fold else 0.0))
                if c >= fold:
                    normal = normals[(r, c)] * flip
                    if r == seam:
                        normal.x = 0.0
                    add((side, "under", r, c), placed - normal.normalized() * THICKNESS, 0.0)
        top_uv = {}
        for r, row in enumerate(rows):
            for c, point in enumerate(row):
                top_uv[(r, c)] = plain_uv if c < fold else uv(min(_segment_distance(point, outer), _segment_distance(point, front_edge)))

        def quad(keys, uvs):
            corners = [index[(side,) + key] for key in keys]
            if len(set(corners)) < 3:
                return
            if side > 0:                                  # mặt trên lá cổ hướng lên; mặt trong chân cổ hướng vào cổ (phía nhìn thấy)
                corners, uvs = corners[::-1], uvs[::-1]
            faces.append(tuple(corners))
            face_uvs.append(tuple(uvs))

        for r in range(seam):
            for c in range(columns - 1):
                cells = ((r, c), (r + 1, c), (r + 1, c + 1), (r, c + 1))
                quad([("top",) + cell for cell in cells], [top_uv[cell] for cell in cells])
                if c >= fold:
                    quad([("under",) + cell for cell in cells[::-1]], [plain_uv] * 4)
            last = columns - 1                                # vành mép ngoài
            quad([("top", r, last), ("top", r + 1, last), ("under", r + 1, last), ("under", r, last)], [plain_uv] * 4)
        for c in range(fold, columns - 1):                    # vành mép trước
            quad([("top", 0, c + 1), ("top", 0, c), ("under", 0, c), ("under", 0, c + 1)], [plain_uv] * 4)

    collar = cut._new_object("collar", shirt, verts, faces, [{} for _ in verts])
    layer = collar.data.uv_layers[0]
    for polygon, uvs in zip(collar.data.polygons, face_uvs):
        for loop_index, corner_uv in zip(polygon.loop_indices, uvs):
            layer.data[loop_index].uv = corner_uv
    _weights(collar, body, frame, stand_share)
    edge = front_edge + outer[1:]
    return collar, {"edge": edge, "tree": cut._bvh(collar), "ring": ring}


def _weights(collar, body, frame, stand_share):
    """Trọng số theo da bên dưới (làm mượt mạnh), bỏ hẳn xương Head (runtime xoay riêng xương này để nhìn theo máy ảnh),
    chân cổ theo thêm Spine2 cho đứng yên khi cổ nghiêng."""
    cut.reweight_from_skin(collar, body, frame, smooth_passes=8)
    names = {g.index: g.name for g in collar.vertex_groups}
    head, neck, spine = cut.P + "Head", cut.P + "Neck", cut.P + "Spine2"
    for vertex in collar.data.vertices:
        weights = {names[g.group]: g.weight for g in vertex.groups if names[g.group].startswith(cut.P)}
        if head in weights:
            weights[neck] = weights.get(neck, 0.0) + weights.pop(head)
        share = STAND_SPINE_SHARE * stand_share[vertex.index]
        if share > 0.0:
            weights = {name: weight * (1.0 - share) for name, weight in weights.items()}
            weights[spine] = weights.get(spine, 0.0) + share
        total = sum(weights.values())
        for group in collar.vertex_groups:
            if group.name.startswith(cut.P):
                group.remove([vertex.index])
        for name, weight in weights.items():
            if weight / total > 0.005:
                collar.vertex_groups[name].add([vertex.index], weight / total, "REPLACE")


def build_rib(shirt, body, frame, ring, uv, width=0.017):
    """Bo cổ tròn của áo phông: dải nằm trên vai áo quanh lỗ cổ (mép trong hơi nhô lên)."""
    tree = cut._bvh(shirt)
    count = RING_SAMPLES
    verts, faces = [], []
    for k in range(count):
        psi = 2 * math.pi * k / count
        base = ring.base_z(psi)
        inner = ring.point(psi, base + 0.007, -0.002)
        hit, normal, _index, _dist = tree.find_nearest(ring.point(psi, base, width))
        verts.extend([ring.point(psi, base - 0.004, -0.004), inner, hit + normal * 0.003])
    for k in range(count):
        a, b = k * 3, ((k + 1) % count) * 3
        faces.extend([(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2)])
    rib = cut._new_object("rib", shirt, verts, faces, [{} for _ in verts])
    layer = rib.data.uv_layers[0]
    for loop in rib.data.loops:
        layer.data[loop.index].uv = uv
    cut.reweight_from_skin(rib, body, frame, smooth_passes=6)
    return rib


def tidy_stand(top, body, frame, height):
    """Làm gọn cổ đứng (cổ tàu áo dài): đưa phần cổ áo về một vách trụ nhẵn cách da cổ vài mm, mép trên phẳng."""
    ring = NeckRing(body, frame, dict(CLEARANCE=0.006, BASE_BACK=0.0, BASE_FRONT=0.0, STAND_HEIGHT=height, STAND_MIN=0.01))
    co = cut._coords(top)
    top_z = frame.neck_z + height
    dx, dy = co[:, 0] - ring.centre.x, co[:, 1] - ring.centre.y
    reach = np.hypot(dx, dy)
    for i in np.nonzero((co[:, 2] > frame.neck_z + 0.002) & (reach < 0.11))[0]:
        psi = math.atan2(dx[i], -dy[i]) % (2 * math.pi)
        blend = float(cut._smooth(frame.neck_z + 0.002, frame.neck_z + 0.014, co[i, 2]))
        wanted = reach[i] + (ring.radius(psi) - reach[i]) * blend
        co[i, 0], co[i, 1] = ring.centre.x + dx[i] / max(reach[i], 1e-6) * wanted, ring.centre.y + dy[i] / max(reach[i], 1e-6) * wanted
        if co[i, 2] > top_z - 0.009:
            co[i, 2] = top_z
    cut._move(top, co)


def build_stand(top, body, frame, height=0.038):
    """Cổ đứng (cổ tàu) dựng bằng hình học cho thân áo đã cắt ở đường chân cổ (people_aodai.GEOMETRIC_COLLAR): kéo vùng quanh lỗ cổ
    của thân áo về sát vòng cổ (giảm dần xuống 3,5 cm bên dưới để không thành nếp nhún), rồi thêm dải đứng ôm quanh cổ, hở nhỏ phía
    trước, mép trên lượn tròn và gập vào trong 7 mm. Trả về lưới cổ (chưa gộp)."""
    ring = NeckRing(body, frame, dict(CLEARANCE=0.007, BASE_BACK=-0.004, BASE_FRONT=0.012, STAND_HEIGHT=height, STAND_MIN=height * 0.85))
    co = cut._coords(top)
    dx, dy = co[:, 0] - ring.centre.x, co[:, 1] - ring.centre.y
    reach = np.maximum(np.hypot(dx, dy), 1e-6)
    for i in np.nonzero((co[:, 2] > frame.neck_z - 0.035) & (reach < 0.13))[0]:
        psi = math.atan2(dx[i], -dy[i]) % (2 * math.pi)
        pull = float(cut._smooth(frame.neck_z - 0.035, frame.neck_z + 0.002, co[i, 2])) ** 2
        wanted = ring.radius(psi) + 0.002
        new_reach = reach[i] + (wanted - reach[i]) * pull
        co[i, 0], co[i, 1] = ring.centre.x + dx[i] / reach[i] * new_reach, ring.centre.y + dy[i] / reach[i] * new_reach
    cut._move(top, co)
    gap, count = math.radians(4.0), 56
    profile = ((0.0, 0.0), (0.0, 0.5), (0.0, 0.86), (-0.0012, 0.96), (-0.0035, 1.0), (-0.0058, 0.96), (-0.007, 0.8))   # (lệch vào trong, phần chiều cao)
    verts, faces = [], []
    for k in range(count + 1):
        psi = gap + (2 * math.pi - 2 * gap) * k / count
        base, top_z = min(ring.base_z(psi), frame.neck_z) - 0.012, ring.top_z(psi)
        for inward, share in profile:
            verts.append(ring.point(psi, base + (top_z - base) * share, inward))
    rows = len(profile)
    for k in range(count):
        for r in range(rows - 1):
            a = k * rows + r
            faces.append((a, a + rows, a + rows + 1, a + 1))
    stand = cut._new_object("stand", top, verts, faces, [{} for _ in verts])
    layer = stand.data.uv_layers[0]
    for loop in stand.data.loops:
        index = loop.vertex_index
        layer.data[loop.index].uv = ((index // rows) * 0.008 / cut.UV_TILE, verts[index].z / cut.UV_TILE)
    _weights(stand, body, frame, [1.0] * len(verts))
    return stand
