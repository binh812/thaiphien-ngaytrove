"""Khuôn mặt đa dạng bằng shape key: mỗi biến thể là một tổ hợp target chi tiết của MakeHuman (CC0, kèm MPFB)
áp lên vùng đầu của lưới gốc; các lưới bám theo đầu (mắt, mày, mi, răng, tóc) được khớp lại bằng chính công thức
MHCLO nên luôn nằm đúng chỗ. Delta dưới cổ bằng 0 (mặt nạ theo chiều cao) để quần áo không lệch.

Tên target: "<thư mục>/<tên>"; "{s}" được nhân đôi thành l và r (hai bên mặt).
"""
import os

import numpy as np
from mathutils import kdtree

from bl_ext.user_default.mpfb.entities.clothes.mhclo import Mhclo
from bl_ext.user_default.mpfb.services import LocationService, TargetService

NECK_FADE_START, NECK_FADE_END = 0.02, 0.06   # m phía trên gốc xương cổ: delta tăng dần từ 0 lên 1
EXACT_MATCH = 1e-4                            # m: sai số cho phép khi dò lại đỉnh của lưới chưa bị rút gọn
FACE_STRENGTH, AGE_STRENGTH = 1.0, 0.85         # hệ số chung: công thức ở mức 1,0 ra mặt quá biếm hoạ
MOVED = 4e-5                                  # m: delta nhỏ hơn mức này coi như 0 (để glTF sparse gọn)

# Sáu kiểu mặt (vòng 14): đều là nét Đông Á, khác nhau ở khung mặt, gò má, mắt, mũi, môi; mức vừa phải để cộng với mặt gốc
# không thành biếm hoạ (không hốc mắt sâu, không sống mũi cao, không cằm chẻ).
_ROUND = {"head/head-round": 0.7, "cheek/{s}-cheek-volume-incr": 0.35, "chin/chin-height-decr": 0.3, "nose/nose-width2-incr": 0.3,
          "mouth/mouth-lowerlip-volume-incr": 0.3, "mouth/mouth-upperlip-volume-incr": 0.25, "forehead/forehead-scale-vert-decr": 0.2}
_LONG = {"head/head-oval": 0.6, "head/head-scale-vert-incr": 0.2, "chin/chin-height-incr": 0.35, "nose/nose-scale-vert-incr": 0.15,
         "mouth/mouth-lowerlip-volume-decr": 0.25, "mouth/mouth-upperlip-volume-decr": 0.2, "eyes/{s}-eye-corner2-up": 0.3}
_SQUARE = {"head/head-square": 0.7, "chin/chin-width-incr": 0.35, "chin/chin-bones-incr": 0.2, "nose/nose-nostrils-width-incr": 0.4,
           "mouth/mouth-scale-horiz-incr": 0.4, "eyes/{s}-eye-scale-decr": 0.25, "eyebrows/eyebrows-trans-down": 0.2}
_HEART = {"head/head-invertedtriangular": 0.6, "chin/chin-width-decr": 0.35, "cheek/{s}-cheek-bones-incr": 0.3,
          "eyes/{s}-eye-height2-incr": 0.25, "nose/nose-point-up": 0.3, "mouth/mouth-cupidsbow-incr": 0.3,
          "forehead/forehead-scale-vert-incr": 0.25}
_DIAMOND = {"head/head-diamond": 0.5, "cheek/{s}-cheek-bones-incr": 0.5, "eyes/{s}-eye-epicanthus-in": 0.5,
            "eyes/{s}-eye-eyefold-down": 0.4, "eyes/{s}-eye-corner2-up": 0.4, "nose/nose-flaring-incr": 0.4, "nose/nose-scale-depth-decr": 0.3}
_HEAVY = {"head/head-rectangular": 0.4, "head/head-fat-incr": 0.3, "chin/chin-jaw-drop-incr": 0.2, "nose/nose-volume-incr": 0.4,
          "nose/nose-scale-horiz-incr": 0.3, "eyes/{s}-eye-scale-decr": 0.2, "mouth/mouth-scale-horiz-incr": 0.3,
          "ears/{s}-ear-scale-incr": 0.4, "forehead/forehead-scale-vert-decr": 0.3}

FACE_LABELS = ("tròn bầu", "dài trái xoan", "vuông, hàm rộng", "tim, cằm thon", "gò má cao, mí lót", "đầy đặn, mũi to")
FACES = {"m": (_ROUND, _LONG, _SQUARE, _HEART, _DIAMOND, _HEAVY),
         # Nữ: cùng sáu dạng, bớt xương hàm ở dạng vuông.
         "f": (_ROUND, _LONG, dict(_SQUARE, **{"chin/chin-bones-incr": 0.0, "chin/chin-width-incr": 0.25}), _HEART, _DIAMOND, _HEAVY)}
AGE_MID = {"head/head-age-incr": 0.4, "head/head-fat-incr": 0.08, "cheek/{s}-cheek-volume-incr": 0.12, "cheek/{s}-cheek-trans-down": 0.2,
           "mouth/mouth-laugh-lines-in": 0.35, "eyes/{s}-eye-eyefold-down": 0.35, "eyes/{s}-eye-bag-incr": 0.25,
           "chin/chin-jaw-drop-incr": 0.2}      # 40–45 tuổi: má đầy, mí hơi trĩu, hàm mềm
AGES = {
    "age_teen": {"head/head-age-decr": 0.5,
                 "chin/chin-bones-decr": 0.6, "chin/chin-height-decr": 0.4, "chin/chin-width-decr": 0.3,
                 "eyes/{s}-eye-scale-incr": 0.5, "nose/nose-scale-vert-decr": 0.5, "nose/nose-scale-depth-decr": 0.4,
                 "nose/nose-volume-decr": 0.4, "forehead/forehead-scale-vert-incr": 0.3,
                 "expression/units/asian/eyebrows-{side}-inner-up": 0.2},
    "age_old": {"head/head-age-incr": 0.7, "cheek/{s}-cheek-volume-decr": 0.4, "cheek/{s}-cheek-inner-decr": 0.3,
                "mouth/mouth-laugh-lines-in": 0.9, "eyes/{s}-eye-bag-incr": 0.8, "eyes/{s}-eye-eyefold-down": 0.6,
                "eyes/{s}-eye-corner2-down": 0.4, "chin/chin-jaw-drop-incr": 0.5, "chin/chin-bones-incr": 0.3,
                "neck/neck-double-incr": 0.1, "nose/nose-point-down": 0.4, "mouth/mouth-angles-down": 0.5,
                "mouth/mouth-upperlip-volume-decr": 0.4},
}


_UNIT = "expression/units/asian/"   # đơn vị biểu cảm của MakeHuman (bản cho khuôn mặt Á)
EXPRESSIONS = {
    # khoé miệng kéo lên và ra sau, má nâng, mắt híp nhẹ (không chỉ dãn môi ngang)
    "smile": {_UNIT + "mouth-corner-puller": 0.5, "mouth/mouth-angles-up": 0.7, _UNIT + "mouth-elevation": 0.15,
              _UNIT + "eye-{side}-slit": 0.4, "cheek/{s}-cheek-trans-up": 0.6, "mouth/mouth-dimples-in": 0.3},
    "brow_up": {_UNIT + "eyebrows-{side}-up": 0.6, _UNIT + "eyebrows-{side}-inner-up": 0.3, _UNIT + "eye-{side}-opened-up": 0.15},
}
# Thêm ở vòng 14, xuất SAU 10 morph cũ để chỉ số cũ không đổi. smile_open cộng thêm lên smile (runtime bật cả hai).
LATE = {
    "age_mid": AGE_MID,
    "smile_open": {_UNIT + "mouth-upward-retraction": 0.85, _UNIT + "mouth-open": 0.05, _UNIT + "mouth-parling": 0.25,
                   _UNIT + "eye-{side}-slit": 0.3, "cheek/{s}-cheek-trans-up": 0.3, "mouth/mouth-angles-up": 0.25},
    "blink": {_UNIT + "eye-{side}-closure": 1.0},
}
# Áp thẳng vào lưới gốc (không phải shape key) trước khi gắn tài nguyên: nét mặt và vóc người Việt.
# Mặt: đầy và mềm, sống mũi thấp vừa, đầu mũi tròn, cánh mũi hơi rộng, môi đầy vừa, cằm tròn nhỏ,
# đầu mày nâng nhẹ để mặt nghỉ không cau.
BASE_FACE = {
    _UNIT + "eyebrows-{side}-inner-up": 0.3, _UNIT + "eyebrows-{side}-up": 0.3, _UNIT + "eye-{side}-opened-up": 0.25,
    _UNIT + "mouth-corner-puller": 0.12,   # khoé môi hơi nhếch: nét tươi sẵn
    # mắt người Việt: nếp mí thấp / mí lót, có nếp epicanthus nhẹ, đuôi mắt hơi xếch
    "eyes/{s}-eye-epicanthus-in": 0.3, "eyes/{s}-eye-eyefold-down": 0.2, "eyes/{s}-eye-corner2-up": 0.25,
    "head/head-oval": 0.5, "head/head-scale-horiz-decr": 0.3, "cheek/{s}-cheek-volume-decr": 0.15, "cheek/{s}-cheek-bones-incr": 0.15,
    "chin/chin-height-incr": 0.2, "eyes/{s}-eye-scale-decr": 0.15, _UNIT + "mouth-compression": 0.25,   # nét người lớn: mặt thon hơn, cằm rõ, môi khép
   
    "nose/nose-scale-depth-decr": 0.35, "nose/nose-hump-decr": 0.4, "nose/nose-point-width-incr": 0.2,
    "nose/nose-nostrils-width-incr": 0.15, "nose/nose-scale-vert-decr": 0.05,
    "mouth/mouth-lowerlip-volume-incr": 0.1, "mouth/mouth-upperlip-volume-incr": 0.1, "chin/chin-prominent-decr": 0.2,
}
BASE_JAW = {"m": {"chin/chin-bones-incr": 0.35, "chin/chin-width-incr": 0.25, "chin/chin-prominent-incr": 0.15, "head/head-square": 0.3,
                  "cheek/{s}-cheek-volume-decr": 0.4, "nose/nose-scale-depth-decr": 0.1, "nose/nose-greek-incr": 0.15,
                  "mouth/mouth-lowerlip-volume-decr": 0.45, "mouth/mouth-upperlip-volume-decr": 0.25,
                  "mouth/mouth-lowerlip-ext-up": 0.45, "mouth/mouth-upperlip-ext-down": 0.3, _UNIT + "mouth-compression": 0.45,
                  "eyes/{s}-eye-scale-decr": 0.3, "head/head-fat-decr": 0.45, "head/head-rectangular": 0.3, "nose/nose-scale-depth-incr": 0.45,
                  "nose/nose-volume-incr": 0.2, "mouth/mouth-philtrum-volume-incr": 0.4, "eyes/{s}-eye-push1-in": 0.35,
                  "eyes/{s}-eye-push2-in": 0.25, "mouth/mouth-scale-vert-decr": 0.35, "chin/chin-height-incr": 0.2},
            "f": {"chin/chin-bones-decr": 0.4, "chin/chin-width-decr": 0.3}}
# Vóc: vai hẹp vừa, tay thon, cổ thon, bàn tay bàn chân nhỏ. "student" mảnh hơn "adult".
BASE_BUILD = {
    "student": {"torso/measure-shoulder-dist-decr": 0.5, "arms/{s}-upperarm-muscle-decr": 0.5, "arms/{s}-lowerarm-muscle-decr": 0.4,
                "arms/{s}-upperarm-shoulder-muscle-decr": 0.5, "hands/{s}-hand-scale-decr": 0.4, "feet/{s}-foot-scale-decr": 0.35,
                "neck/neck-scale-horiz-decr": 0.3, "neck/neck-scale-depth-decr": 0.2},
    "adult": {"torso/measure-shoulder-dist-decr": 0.25, "arms/{s}-upperarm-shoulder-muscle-decr": 0.25,
              "hands/{s}-hand-scale-decr": 0.25, "feet/{s}-foot-scale-decr": 0.25, "neck/neck-scale-horiz-decr": 0.15},
}
BASE_BUILD_GENDER = {"m": {"torso/torso-vshape-decr": 0.3, "neck/neck-scale-horiz-incr": 0.45, "neck/neck-scale-depth-incr": 0.3},
                     "f": {"torso/measure-waist-circ-decr": 0.15, "hip/hip-scale-horiz-decr": 0.25}}
# Thân dưới (mọi nhân vật): mông phẳng tự nhiên, đùi và bắp chân thon, bụng phẳng.
BASE_LOWER = {"buttocks/buttocks-volume-decr": 0.85, "hip/hip-scale-depth-decr": 0.3,
              "legs/{s}-upperleg-muscle-decr": 0.5, "legs/{s}-upperleg-fat-decr": 0.3, "legs/{s}-lowerleg-muscle-decr": 0.5,
              "legs/measure-thigh-circ-decr": 0.3, "legs/measure-calf-circ-decr": 0.3, "stomach/stomach-tone-incr": 0.3}


AGE_MID_MALE = dict(AGE_MID, **{"head/head-age-incr": 0.8, "cheek/{s}-cheek-volume-decr": 0.3, "mouth/mouth-laugh-lines-in": 1.0, "eyes/{s}-eye-bag-incr": 0.4,
                               "cheek/{s}-cheek-volume-incr": 0.0, "cheek/{s}-cheek-inner-decr": 0.25, "eyes/{s}-eye-corner2-down": 0.15})


def variant_recipes(gender):
    """Tên shape key -> công thức target, theo thứ tự xuất."""
    recipes = {"face_%d" % (i + 1): recipe for i, recipe in enumerate(FACES[gender])}
    recipes.update(AGES)
    recipes.update(EXPRESSIONS)
    recipes.update(LATE)
    if gender == "m":
        recipes["age_mid"] = AGE_MID_MALE
    for unit in [u for u in os.environ.get("PEOPLE_DEBUG_UNITS", "").split(",") if u]:   # chỉ để soát từng đơn vị biểu cảm
        recipes["dbg_" + unit.split("/")[-1]] = {unit: 1.0}
    return recipes


# Mặt nam trưởng thành cho tệp tủ đồ (trên nền macro 42 tuổi): KHÔNG dùng các target làm tròn của BASE_FACE/BASE_JAW.
ADULT_MALE = False
ADULT_MALE_FACE = {
    "eyes/{s}-eye-epicanthus-in": 0.3, "eyes/{s}-eye-eyefold-down": 0.15, "eyes/{s}-eye-corner2-up": 0.2, "eyes/{s}-eye-scale-incr": 0.2,
    _UNIT + "eye-{side}-opened-up": 0.35, _UNIT + "eyebrows-{side}-inner-up": 0.15,
    "head/head-square": 0.45, "head/head-rectangular": 0.35, "head/head-fat-decr": 0.8, "cheek/{s}-cheek-volume-decr": 0.8,
    "cheek/{s}-cheek-bones-incr": 0.5, "cheek/{s}-cheek-inner-decr": 0.3, "chin/chin-bones-incr": 0.6, "chin/chin-width-incr": 0.35,
    "chin/chin-prominent-incr": 0.3, "chin/chin-height-incr": 0.2, "nose/nose-scale-depth-incr": 0.35, "nose/nose-hump-incr": 0.15,
    "nose/nose-nostrils-width-incr": 0.2, "forehead/forehead-nubian-decr": 0.3, "eyebrows/eyebrows-trans-forward": 0.5,
    "mouth/mouth-lowerlip-volume-decr": 0.55, "mouth/mouth-upperlip-volume-decr": 0.3, "mouth/mouth-lowerlip-ext-up": 0.35,
    "mouth/mouth-upperlip-ext-down": 0.25, _UNIT + "mouth-compression": 0.35, "mouth/mouth-philtrum-volume-incr": 0.4,
    "neck/neck-scale-horiz-incr": 0.3,
}


def shape_base(body, gender, build):
    """Nạp nét mặt và vóc người gốc thành shape key trên lưới gốc (gọi trước khi gắn tài nguyên và trước bake_targets)."""
    adult_male = ADULT_MALE and gender == "m"
    recipe = dict(ADULT_MALE_FACE if adult_male else BASE_FACE)
    for extra in ({} if adult_male else BASE_JAW[gender], BASE_BUILD[build], BASE_BUILD_GENDER[gender], BASE_LOWER):
        recipe.update(extra)
    for index, (name, weight) in enumerate(_expand(recipe).items()):
        path = os.path.join(LocationService.get_mpfb_data("targets"), *name.split("/")) + ".target.gz"
        if not os.path.isfile(path):
            raise FileNotFoundError(path)
        TargetService.load_target(body, path, weight=weight, name="base_relax_%d" % index)


def _expand(recipe):
    out = {}
    for name, weight in recipe.items():
        if "{side}" in name:
            sides = ("left", "right")
        else:
            sides = ("l", "r") if "{s}" in name else ("",)
        for side in sides:
            out[name.replace("{side}", side).replace("{s}", side)] = weight
    return out


def _coords(obj):
    co = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3).astype(np.float64)


class TargetLibrary:
    """Đọc delta của từng target (qua MPFB, đã đúng hệ trục và tỉ lệ của lưới) và nhớ lại."""

    def __init__(self, body):
        self._body, self._cache, self._base = body, {}, _coords(body)

    def delta(self, name):
        if name not in self._cache:
            path = os.path.join(LocationService.get_mpfb_data("targets"), *name.split("/")) + ".target.gz"
            if not os.path.isfile(path):
                raise FileNotFoundError(path)
            key = TargetService.load_target(self._body, path, weight=0.0, name="tmp_face_target")
            moved = np.empty(len(self._base) * 3, dtype=np.float32)
            key.data.foreach_get("co", moved)
            self._body.shape_key_clear()
            self._cache[name] = moved.reshape(-1, 3).astype(np.float64) - self._base
        return self._cache[name]

    def combine(self, recipe):
        total = np.zeros_like(self._base)
        for name, weight in _expand(recipe).items():
            total += weight * self.delta(name)
        return total


class ProxyFit:
    """Công thức khớp MHCLO (giống ClothesService.fit_clothes_to_human của MPFB) viết bằng numpy."""

    def __init__(self, mhclo_path, vertex_count, scale_factor):
        mhclo = Mhclo()
        mhclo.load(mhclo_path)
        if len(mhclo.verts) != vertex_count:
            raise ValueError("%s: %d đỉnh trong mhclo, lưới có %d" % (mhclo_path, len(mhclo.verts), vertex_count))
        entries = [mhclo.verts[i] for i in range(vertex_count)]
        self.refs = np.array([e["verts"] for e in entries])
        self.weights = np.array([e["weights"] for e in entries], dtype=np.float64)
        self.offsets = np.array([tuple(e["offsets"]) for e in entries], dtype=np.float64)
        self.scales, self.scale_factor = (mhclo.x_scale, mhclo.y_scale, mhclo.z_scale), scale_factor

    def fit(self, human):
        size = np.full(3, self.scale_factor)
        if self.scales[0]:
            (x0, x1, xd), (y0, y1, yd), (z0, z1, zd) = self.scales
            size = np.array([abs(human[x0, 0] - human[x1, 0]) / xd,      # ngang
                             abs(human[z0, 1] - human[z1, 1]) / zd,      # sâu (trục y của Blender)
                             abs(human[y0, 2] - human[y1, 2]) / yd])     # cao
        return (human[self.refs] * self.weights[:, :, None]).sum(axis=1) + self.offsets * size


def neck_mask(base, neck_z):
    t = np.clip((base[:, 2] - neck_z - NECK_FADE_START) / (NECK_FADE_END - NECK_FADE_START), 0.0, 1.0)
    return (t * t * (3 - 2 * t))[:, None]


def compute(body, neck_z, followers, gender, scale_factor=0.1, overrides=None):
    """Tính delta của mọi biến thể trên lưới gốc đầy đủ.

    followers: {tên lưới: (đối tượng, đường dẫn mhclo)} — các lưới bám theo đầu, CHƯA bị sửa đỉnh.
    Trả về {tên lưới: (toạ độ gốc, {tên shape key: delta})}, kể cả "body".
    """
    library = TargetLibrary(body)
    base = _coords(body)
    mask = neck_mask(base, neck_z)
    fits = {name: ProxyFit(path, len(obj.data.vertices), scale_factor) for name, (obj, path) in followers.items()}
    fitted_base = {name: fit.fit(base) for name, fit in fits.items()}
    result = {"body": (base, {})}
    result.update({name: (_coords(followers[name][0]), {}) for name in followers})
    for key_name, recipe in variant_recipes(gender).items():
        strength = 1.0 if key_name in EXPRESSIONS or key_name in LATE or key_name.startswith("dbg_") else (AGE_STRENGTH if key_name in AGES else FACE_STRENGTH)
        if overrides and key_name in overrides:       # delta toàn thân cho sẵn (vd. chênh lệch giữa hai lần dựng macro tuổi)
            delta = overrides[key_name] * mask
        else:
            delta = library.combine(recipe) * mask * strength
        result["body"][1][key_name] = delta
        for name, fit in fits.items():
            result[name][1][key_name] = fit.fit(base + delta) - fitted_base[name]
    return result


def apply(obj, original_coords, deltas, moved=MOVED):
    """Gắn shape key cho obj (lưới cuối, có thể đã xoá hoặc rút gọn đỉnh) bằng cách dò đỉnh gốc gần nhất."""
    tree = kdtree.KDTree(len(original_coords))
    for i, co in enumerate(original_coords):
        tree.insert(co, i)
    tree.balance()
    final = _coords(obj)
    nearest = np.array([tree.find(co)[1] for co in final])
    obj.shape_key_add(name="Basis", from_mix=False)
    moved_counts = {}
    for key_name, delta in deltas.items():
        picked = delta[nearest]
        picked[np.abs(picked).max(axis=1) < moved] = 0.0
        key = obj.shape_key_add(name=key_name, from_mix=False)
        key.data.foreach_set("co", (final + picked).astype(np.float32).ravel())
        key.value = 0.0
        moved_counts[key_name] = int((np.abs(picked).max(axis=1) > 0).sum())
    return moved_counts


def max_mapping_error(obj, original_coords):
    """Khoảng cách xa nhất từ một đỉnh của obj tới đỉnh gốc gần nhất (0 nếu lưới chỉ bị xoá bớt đỉnh)."""
    tree = kdtree.KDTree(len(original_coords))
    for i, co in enumerate(original_coords):
        tree.insert(co, i)
    tree.balance()
    return max(tree.find(co)[2] for co in _coords(obj))
