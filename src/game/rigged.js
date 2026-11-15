// Người 3D có xương (MakeHuman/MPFB, xem assets/people/LICENSE.md): nạp .glb, nhuộm màu theo lựa chọn, trộn hoạt hoạ đứng/đi/chạy.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Q, param } from '../engine/util.js';
import { PENCIL_ON } from '../engine/pencil/style.js';
import { pencilPerson } from '../engine/pencil/pencil.js';

const DIR = 'assets/people/';
const CLIP_HIPS = 0.9311;                // độ cao hông của nhân vật mà clip được chuyển sang (m_white)
const STRIDE = 1;                             // thu biên độ đùi khi đi (1 = giữ nguyên; clip ghi hình người thật đã có sải tự nhiên)
const WALK_SPEED = 1.36 * STRIDE, RUN_SPEED = 3.0; // tốc độ (m/s) ứng với clip ở nhịp gốc (CMU 07_01 và 35_17, đo ở cỡ m_white)
const GRAY = 0.88;                       // độ sáng nền của kết cấu quần áo đã khử màu
const OUTFIT_COLORS = {
  white:   { top: 0xf4f3ee, bottom: 0x131a30, shoes: null },      // quần xanh than rất đậm, gần đen (theo ảnh đồng phục thật)
  jacket:  { top: 0x1d3263, bottom: 0x1b2440, shoes: null },
  pe:      { top: 0xeef1f5, bottom: 0x1f2c52, shoes: null },
  teacher: { top: 0xc9d8ee, bottom: 0x26262c, shoes: null },
  aodai:   { top: 0xf6f4ef, bottom: 0xf3f1ec, shoes: 0xd9d4c8 },
  // áo dài cô giáo (dáng suông, tay loe, thêu hoa): ba kiểu màu trên cùng một mô hình
  aodaiT:  { top: 0xe8b7ae, bottom: 0xedc4bd, shoes: 0xece4d4 },      // hồng phấn
  aodaiR:  { top: 0xa3172a, bottom: 0x9a1728, shoes: 0x8a5a3a },      // đỏ đô
  aodaiL:  { top: 0xf1ece2, bottom: 0xf3f1ec, shoes: 0xece4d4 },      // trắng ngà
  // áo lớp vàng chanh của cựu học sinh: màu áo và hình in nằm sẵn trong kết cấu (bakedTop trong manifest), chỉ tô quần/váy
  class:   { top: 0xffffff, bottom: 0x17181c, shoes: null },          // quần đen
  classJ:  { top: 0xffffff, bottom: 0x5b7ea8, shoes: null },          // quần bò xanh
  classS:  { top: 0xffffff, bottom: 0x4f729c, shoes: null },          // chân váy bò dài
};
const SKIN_TINT = [[1.07, 1.1, 1.14], [1, 1, 1], [0.86, 0.8, 0.74], [0.7, 0.6, 0.52]];
const HAIR_TINT = [[1, 1, 1], [1.7, 1.25, 1.0], [2.6, 1.7, 1.2], [4.2, 4.2, 4.3], [4.6, 2.3, 1.2]];      // đen, nâu đậm, nâu, hoa râm, nâu đồng
const HAIR_INDEX = { short: 0, crop: 1, side: 2, long: 0, pony: 1, bob: 2 };
const HAIR_ALIAS = { short: 'side', crop: 'crew', wavy_half: 'braid' };      // mã kiểu tóc đời trước → kiểu gần nhất hiện có

const loader = new GLTFLoader(), models = new Map(), missingWarned = new Set();
let manifest = null, animsP = null, disabled = param('people', '1') === '0';
const load = (file) => { if (!models.has(file)) { const p = loader.loadAsync(DIR + file); p.catch(() => { models.delete(file); if (file === 'anims.glb') animsP = null; }); models.set(file, p); } return models.get(file); };
async function getManifest() { if (!manifest) { const r = await fetch(DIR + 'manifest.json'); if (!r.ok) throw new Error('HTTP ' + r.status); manifest = await r.json(); } return manifest; }
const clipCache = new Map();
const ONE_SHOT = /^(sit_down|stand_up)(_f)?$/;      // động tác phát một lượt rồi giữ khung cuối (phát lặp thì lúc đang mờ dần sẽ nhảy về khung đầu)
/**
 * Clip ngồi xuống / đứng dậy ghi sẵn độ dời trước–sau của hông (ngồi lùi ra sau ~25 cm) trong khi dáng ngồi (sit_idle) lại nằm ngay trên gốc
 * nhân vật → lúc đổi clip cả người trượt đi 25 cm. Tách phần dời đó khỏi clip: hông ở yên trên gốc, còn độ dời so với lúc đã ngồi
 * (mét của mô hình, + là ra trước) cất vào cl.rootZ để nơi điều khiển gốc nhân vật tự dời gốc (rig.rootShift) — bàn chân nhờ vậy đứng yên trên nền.
 */
function splitRootZ(cl) {
  const tr = cl.tracks.find(t => /Hips.position$/.test(t.name)); if (!tr) return;
  const v = tr.values, n = tr.times.length, seated = /^stand_up/.test(cl.name) ? 0 : n - 1, zSeat = v[seated * 3 + 2], zStand = v[(n - 1 - seated) * 3 + 2], z = new Float32Array(n);
  for (let i = 0; i < n; i++) { z[i] = v[i * 3 + 2] - zSeat; v[i * 3 + 2] = zStand; }
  cl.rootZ = { times: tr.times, z };
}
/** độ dời gốc (mét của mô hình) ở giây t của một clip đã tách bằng splitRootZ; clip khác trả 0 */
function rootZAt(cl, t) {
  const rz = cl && cl.rootZ; if (!rz) return 0;
  const T = rz.times, n = T.length; if (t <= T[0]) return rz.z[0]; if (t >= T[n - 1]) return rz.z[n - 1];
  let i = 1; while (T[i] < t) i++;
  return rz.z[i - 1] + (rz.z[i] - rz.z[i - 1]) * (t - T[i - 1]) / (T[i] - T[i - 1]);
}
/** clip cho một tệp nhân vật: kênh vị trí hông co theo độ cao hông của nhân vật đó */
let posesP = null;
/** các dáng chụp ảnh (tệp poses.glb, không bắt buộc): thiếu tệp thì trò chơi vẫn chạy, chỉ không có dáng — có báo một lần ở console */
function getPoses(man) {
  if (!posesP) posesP = man.poses ? load('poses.glb').then((g) => g.animations, (e) => { console.warn('[người] không nạp được poses.glb, chế độ chụp ảnh sẽ không có dáng tạo sẵn:', e && e.message ? e.message : e); return []; }) : Promise.resolve([]);
  return posesP;
}
async function clipsFor(key, hips, man) {
  if (clipCache.has(key)) return clipCache.get(key);
  if (!animsP) animsP = load('anims.glb');
  const out = {}, add = (src, base) => {
    const k = hips / base;
    for (const c of src) {
      const cl = c.clone();
      for (const t of cl.tracks) if (t.name.endsWith('.position')) { t.values = t.values.map(v => v * k); }
      if (ONE_SHOT.test(cl.name)) splitRootZ(cl);
      out[c.name] = cl;
    }
  };
  add((await animsP).animations, CLIP_HIPS); add(await getPoses(man), (man.poses && man.poses.hipsRestHeight) || CLIP_HIPS);
  clipCache.set(key, out); return out;
}
/** kiểu tóc có trong mô hình, theo giới: { m: [...mã], f: [...mã] } — null nếu manifest chưa khai (dùng bảng cũ) */
export async function hairStyles() {
  if (disabled) return null;
  try { const man = await getManifest(), out = {}; for (const g of ['m', 'f']) { const f = man.files[g + '_white']; if (f && f.hairStyles) out[g] = f.hairStyles; } return out.m || out.f ? out : null; }
  catch (e) { console.warn('[người] không đọc được danh sách kiểu tóc:', e && e.message ? e.message : e); return null; }
}
/** các tệp mô hình hiện có (để giao diện chỉ hiện trang phục dùng được) */
export async function modelFiles() {
  if (disabled) return [];
  try { return Object.keys((await getManifest()).files); } catch (e) { console.warn('[người] không đọc được manifest:', e && e.message ? e.message : e); return []; }
}
/** tên các dáng chụp ảnh có trong tệp (bỏ tiền tố pose_ và biến thể _f) — để giao diện chỉ hiện dáng dùng được */
export async function poseNames() {
  if (disabled) return [];
  try { const man = await getManifest(); return [...new Set((await getPoses(man)).map(c => c.name).filter(nm => nm.startsWith('pose_')).map(nm => nm.slice(5).replace(/_f$/, '')))]; }
  catch (e) { console.warn('[người] không đọc được danh sách dáng:', e && e.message ? e.message : e); return []; }
}

// dòng cộng phản chiếu trực tiếp trong RE_Direct_Physical của three r187: chèn phần khuếch tán "ôm" của da ngay sau nó.
// Không được sửa biến irradiance: nó còn nhân với BRDF phản chiếu, vốn phóng đại rất lớn ở góc sát → đốm chói ở tai, khoé mắt.
const SKIN_FROM = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;';
let skinWarned = false;
/** giả tán xạ dưới da cho vật liệu da: sửa hàm chiếu sáng trực tiếp của three (lights_physical_pars_fragment) */
function skinPatch(m) {
  if (param('skin', '1') === '0') return;          // ?skin=0 tắt để so sánh
  m.onBeforeCompile = (sh) => {
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    if (!chunk.includes(SKIN_FROM)) { if (!skinWarned) { skinWarned = true; console.warn('[người] bản three này đổi mã chiếu sáng, bỏ qua hiệu ứng da'); } return; }
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', chunk.replace(SKIN_FROM, SKIN_FROM +
      ' float tpWrap = saturate( ( dot( geometryNormal, directLight.direction ) + 0.4 ) / 1.4 ); reflectedLight.directDiffuse += vec3( 0.42, 0.16, 0.09 ) * max( tpWrap - dotNL, 0.0 ) * directLight.color * BRDF_Lambert( material.diffuseColor );'));
  };
  m.customProgramCacheKey = () => 'tp-skin';
}

/**
 * Các bộ gợi ý cũ (look.outfit) quy ra món trong tủ đồ. Người chơi có thể chọn từng món: look.top / look.bottom / look.shoes
 * (mã món) và look.topColor / look.bottomColor / look.shoesColor ('#rrggbb'); món không khai thì lấy theo bộ gợi ý.
 */
export const OUTFIT_PRESETS = {
  white:   { top: 'uniform', bottom: 'trousers', shoes: 'dress', bottomColor: '#131a30' },
  jacket:  { top: 'jacket', bottom: 'trousers', shoes: 'dress', topColor: '#1d3263', bottomColor: '#131a30' },
  pe:      { top: 'pe', bottom: 'pe', shoes: 'sneakers' },
  teacher: { top: 'shirt', bottom: 'trousers', shoes: 'dress', topColor: '#c9d8ee', bottomColor: '#26262c' },
  aodai:   { top: 'aodai', bottom: 'aodai', shoes: 'dress', topColor: '#f6f4ef', bottomColor: '#f3f1ec', shoesColor: '#d9d4c8' },
  aodaiT:  { top: 'aodai_modern', bottom: 'aodai', shoes: 'heels', topColor: '#e8b7ae', bottomColor: '#edc4bd', shoesColor: '#ece4d4' },
  aodaiR:  { top: 'aodai_modern', bottom: 'aodai', shoes: 'heels', topColor: '#a3172a', bottomColor: '#9a1728', shoesColor: '#8a5a3a' },
  aodaiL:  { top: 'aodai_modern', bottom: 'aodai', shoes: 'heels', topColor: '#f1ece2', bottomColor: '#f3f1ec', shoesColor: '#ece4d4' },
  class:   { top: 'class', bottom: 'trousers', shoes: 'sneakers', bottomColor: '#17181c' },
  classJ:  { top: 'class', bottom: 'jeans', shoes: 'sneakers', bottomColor: '#5b7ea8' },
  classS:  { top: 'class', bottom: 'skirt_denim', shoes: 'sneakers', bottomColor: '#3f5f9a' },
};
/** tủ đồ trong manifest ({ m, f }) hoặc null nếu chưa có / tắt bằng ?wardrobe=0 */
export async function wardrobe() {
  if (disabled || param('wardrobe', '1') === '0') return null;
  try { const man = await getManifest(); return man.wardrobe || null; } catch (e) { console.warn('[người] không đọc được tủ đồ:', e && e.message ? e.message : e); return null; }
}
/** chọn món cho một ngoại hình: trả về { w, top, bottom, shoes, hide (tên lưới da bị che), colors } hoặc null nếu giới này chưa có tủ đồ */
export function pickWardrobe(man, look) {
  const gk = look.gender === 'f' ? 'f' : 'm', w = man.wardrobe && (param('ai', '1') !== '0' && man.wardrobe[gk + '_ai'] || man.wardrobe[gk]);      // mặc định dùng bản có da đầu chiếu từ bản vẽ; ?ai=0 để so với bản cũ
  if (!w || param('wardrobe', '1') === '0') return null;
  const P = OUTFIT_PRESETS[look.outfit] || {}, pick = (list, id) => (list || []).find(x => x.id === id) || null, first = (list) => (list && list[0]) || null;
  // bộ gợi ý cần một kiểu áo mà tủ đồ chưa có (áo khoác, thể dục…) → dùng tệp mỗi-bộ-một-tệp kiểu cũ thay vì mặc nhầm áo khác
  if (look.top === undefined && P.top && !(w.tops || []).some(x => x.id === P.top)) return null;
  const top = pick(w.tops, look.top ?? P.top) || first(w.tops);
  let bottom = pick(w.bottoms, look.bottom ?? P.bottom) || pick(w.bottoms, 'trousers') || first(w.bottoms);
  if (top && top.bottoms && bottom && !top.bottoms.includes(bottom.id)) bottom = pick(w.bottoms, top.bottoms[0]) || bottom;      // áo chỉ đi được với vài kiểu quần
  const shoes = pick(w.shoes, look.shoes ?? P.shoes) || pick(w.shoes, 'dress') || first(w.shoes);
  const hide = new Set(); for (const x of [top, bottom, shoes]) if (x) for (const h of x.hides || []) hide.add(h);
  // màu của bộ gợi ý chỉ áp khi món đang mặc đúng là món của bộ đó (đổi sang món khác thì về màu mặc định của món)
  const col = (slot, x) => look[slot + 'Color'] ?? (x && (look[slot] === undefined || P[slot] === x.id) ? P[slot + 'Color'] : undefined) ?? (x ? x.tint : undefined);
  return { w, top, bottom, shoes, hide, colors: { top: col('top', top), bottom: col('bottom', bottom), shoes: col('shoes', shoes) } };
}
const texLoader = new THREE.TextureLoader(), headTex = new Map();
/** kết cấu rời của một gương mặt (assets/people/heads/…): nạp một lần, dùng chung; cùng quy ước với ảnh trong glb (không lật, sRGB cho ảnh màu) */
function headTexture(path, srgb) {
  if (!headTex.has(path)) headTex.set(path, texLoader.loadAsync(DIR + path).then((t) => { t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }, (e) => { headTex.delete(path); throw e; }));
  return headTex.get(path);
}
/** gương mặt dùng cho một ngoại hình: look.head (id) nếu có; không thì người 'teen'/'adult' lấy mặt trẻ nhất, còn lại lấy mặt đầu */
export function pickHead(w, look) {
  const hs = w && w.heads; if (!hs || !hs.length) return null;
  const byId = hs.find(h => h.id === look.head); if (byId) return byId;
  const young = look.age === 'teen' || look.age === 'adult';
  return young ? hs.reduce((a, b) => (b.age ?? 99) < (a.age ?? 99) ? b : a) : hs[0];
}
/** tên lưới tủ đồ của một mesh (mesh nhiều vật liệu bị tách thành nhóm → lấy tên tổ tiên ngoài cùng khớp) */
/** Tệp mô hình xuất mỗi lưới một Skeleton riêng (cùng xương, cùng ma trận nghịch đảo): ~12 lưới mỗi người = ~12 lần tính xương + 12 lần đẩy ảnh xương lên GPU mỗi khung.
 *  Lưới nào có đúng cùng xương và cùng boneInverses với lưới đầu tiên thì dùng chung Skeleton đó; khác thì để nguyên. */
function shareSkeletons(model) {
  let ref = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const s = o.skeleton;
    if (!ref) { ref = s; return; }
    if (s === ref || s.bones.length !== ref.bones.length) return;
    for (let i = 0; i < s.bones.length; i++) { if (s.bones[i] !== ref.bones[i]) return; const a = s.boneInverses[i].elements, b = ref.boneInverses[i].elements; for (let k = 0; k < 16; k++) if (Math.abs(a[k] - b[k]) > 1e-5) return; }
    o.skeleton = ref;
  });
}

function wardrobeName(o) {
  let nm = null; for (let p = o; p && !p.isBone; p = p.parent) if (/^(skin|top|bottom|shoes)_/.test(p.name)) nm = p.name;
  return nm;
}

/** trọng số morph của khuôn mặt: face (1..6, 0 = mặt gốc), faceB + faceMix để pha hai mặt, age: 'teen' | 'adult' | 'old' */
export function faceWeights(look) {
  const w = {}, mix = look.faceB ? Math.min(1, Math.max(0, look.faceMix ?? 0.35)) : 0;
  // tổng trọng số mặt giữ ở 0,7: cộng đủ 1 rồi thêm tuổi + biểu cảm thì mặt bị biến dạng quá tay
  if (look.face) w['face_' + look.face] = (1 - mix) * 0.7;
  if (look.faceB) w['face_' + look.faceB] = (w['face_' + look.faceB] || 0) + mix * 0.7;
  const age = look.age || (look.outfit === 'teacher' || TEACHER_AODAI.has(look.outfit) ? 'adult' : 'teen');
  if (age === 'teen') w.age_teen = 0.4; else if (age === 'old') w.age_old = look.ageK ?? 0.7; else if (age === 'mid') w.age_mid = look.ageK ?? 0.85; else if (age === 'adult') w.age_adult = 1;      // mid = cựu học sinh ngoài 40; adult chỉ dùng ở tệp tủ đồ (xem applyAge)
  w.smile = look.smile ?? 0.3; w.brow_up = look.brow ?? 0; w.smile_open = Math.max(0, (w.smile - 0.5) * 1.6);
  return w;
}
function applyMorphs(o, w) {
  const d = o.morphTargetDictionary, inf = o.morphTargetInfluences; if (!d || !inf) return;
  inf.fill(0); for (const k in w) if (d[k] !== undefined) inf[d[k]] = w[k];
}

const TEACHER_AODAI = new Set(['aodaiT', 'aodaiR', 'aodaiL']), CLASS_FILE = { class: 'class', classJ: 'class', classS: 'class_skirt' };
export const fileFor = (look) => `${look.gender === 'f' ? 'f' : 'm'}_${CLASS_FILE[look.outfit] ? (look.gender === 'f' ? CLASS_FILE[look.outfit] : 'class') : TEACHER_AODAI.has(look.outfit) ? (look.gender === 'f' ? 'aodai_teacher' : 'teacher') : look.outfit === 'aodai' && look.gender !== 'f' ? 'white' : look.outfit}`;

/**
 * Dựng người có xương theo look. Trả về null nếu tắt (?people=0); ném lỗi nếu thiếu tệp.
 * Kết quả: { g, mixer, act, bones, dispose, rootShift(tên clip, giây) = quãng (m) phải dời gốc nhân vật ra trước mặt ở giây đó của clip ngồi xuống/đứng dậy }
 */
export async function buildRigged(look) {
  if (disabled) return null;
  const man = await getManifest(), W = pickWardrobe(man, look);
  if (W) return buildFrom(look, man, 'wardrobe_' + (look.gender === 'f' ? 'f' : 'm'), W.w, W);
  const want = fileFor(look), g0 = look.gender === 'f' ? 'f' : 'm';
  const key = man.files[want] ? want : want === 'f_aodai_teacher' ? 'f_aodai' : /_class/.test(want) && man.files[want.replace('_skirt', '')] ? want.replace('_skirt', '') : /_class/.test(want) ? g0 + '_white' : want, info = man.files[key];
  if (key !== want && !missingWarned.has(want)) { missingWarned.add(want); console.warn('[người] chưa có mô hình ' + want + ', tạm dùng ' + key); }   // chưa có mẫu áo dài giáo viên thì dùng áo dài trắng nhuộm màu
  if (!info) throw new Error('Không có mô hình người ' + key);
  return buildFrom(look, man, key, info, null);
}
/** dựng từ một tệp: info = mục của tệp trong manifest; W = lựa chọn tủ đồ (null với tệp mỗi-bộ-một-tệp kiểu cũ) */
async function buildFrom(look, man, key, info, W) {
  const [gltf, clips] = await Promise.all([load(info.file), clipsFor(key, info.hipsRestHeight, man)]);
  const model = cloneSkinned(gltf.scene), mats = [], styles = info.hairStyles, hair = styles ? Math.max(0, styles.indexOf(HAIR_ALIAS[look.hair] && !styles.includes(look.hair) ? HAIR_ALIAS[look.hair] : look.hair)) : HAIR_INDEX[look.hair] ?? 0, oc = OUTFIT_COLORS[look.outfit] || OUTFIT_COLORS.white, glasses = (look.glasses | 0) - 1;
  const st = SKIN_TINT[look.skin] || SKIN_TINT[1], ht = HAIR_TINT[look.hairColor] || HAIR_TINT[0], c = new THREE.Color();
  const smileMeshes = [], blinkMeshes = [];
  const morph = faceWeights(look), silk = look.outfit === 'aodai' || TEACHER_AODAI.has(look.outfit);
  // tệp tủ đồ: mặt gốc đã là người ~42 tuổi (age_mid không còn tác dụng) → người trẻ hơn thì pha age_teen; tệp kiểu cũ: mặt gốc trẻ
  const head = W ? pickHead(W.w, look) : null, hmaps = {};
  if (head && head.textures) {
    // nạp xong mới dựng, để nhân vật không chớp từ mặt này sang mặt khác; thiếu ảnh thì giữ mặt có sẵn trong tệp và báo một lần
    try { const ks = Object.keys(head.textures), ts = await Promise.all(ks.map(k => headTexture(head.textures[k], k !== 'headNormal'))); ks.forEach((k, i) => { hmaps[k] = ts[i]; }); }
    catch (e) { if (!missingWarned.has('head' + head.id)) { missingWarned.add('head' + head.id); console.warn('[người] không nạp được gương mặt ' + head.id + ', dùng mặt mặc định:', e && e.message ? e.message : e); } for (const k in hmaps) delete hmaps[k]; }
  }
  if (head && head.morph && Object.keys(hmaps).length) {
    let has = false; gltf.scene.traverse((o) => { if (o.morphTargetDictionary && o.morphTargetDictionary[head.morph] !== undefined) has = true; });
    if (!has) { if (!missingWarned.has('morph' + head.morph)) { missingWarned.add('morph' + head.morph); console.warn('[người] mô hình thiếu hình khối ' + head.morph + ', dùng mặt mặc định'); } for (const k in hmaps) delete hmaps[k]; }
  }
  if (W) {
    // mặt trẻ đã trẻ sẵn trong hình khối và da → chỉ pha thêm chút nét trẻ cho 'teen'; mặt 42 tuổi thì pha age_teen như cũ
    const youngHead = head && (head.age ?? 42) < 35, young = morph.age_adult ? (youngHead ? 0 : 0.55) : morph.age_teen ? (youngHead ? 0.45 : 1) : 0;
    morph.age_teen = young; delete morph.age_mid; if (head && head.morph && Object.keys(hmaps).length) morph[head.morph] = 1;
  }
  delete morph.age_adult;
  model.traverse((o) => {
    if (!o.isMesh) return;
    applyMorphs(o, morph); if (o.morphTargetDictionary && o.morphTargetDictionary.smile !== undefined) smileMeshes.push(o);
    if (o.morphTargetDictionary && o.morphTargetDictionary.blink !== undefined) blinkMeshes.push(o);
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const name = o.material.name || o.name, m = o.material.clone(); mats.push(m); o.material = m;
    if (PENCIL_ON) pencilPerson(m, name);      // kiểu chì màu (bản thử): da, tóc, mắt mày có cách vẽ riêng
    if (m.side === THREE.DoubleSide) m.shadowSide = THREE.BackSide;      // vải hai mặt: chỉ mặt khuất nắng ghi vào bản đồ bóng, nếu không mặt được chiếu sáng tự đổ bóng lốm đốm lên chính nó
    const gl = /glasses_(\d+)/.exec(o.name + '/' + (o.parent ? o.parent.name : ''));                // kính: lưới glasses_N, vật liệu lens/frame
    if (gl) { o.visible = +gl[1] === glasses; o.castShadow = false; if (name === 'lens') { m.transparent = true; m.opacity = Math.min(m.opacity, 0.35); m.roughness = 0.05; m.depthWrite = false; m.forceSinglePass = true; } return; }
    const wn = W ? wardrobeName(o) : null;
    if (wn && wn.startsWith('skin_')) o.visible = !W.hide.has(wn);                       // da bị quần áo che thì ẩn (vật liệu da xử lý ở nhánh body/head bên dưới)
    else if (wn) {                                                                        // một món trong tủ đồ
      const slot = wn.slice(0, wn.indexOf('_')), it = W[slot]; o.visible = !!it && it.mesh === wn; o.castShadow = o.visible; if (!o.visible) return;
      const hex = it.baked ? '#ffffff' : W.colors[slot];
      if (it.baked) m.color.setRGB(1, 1, 1); else if (hex !== undefined) { c.set(hex); m.color.setRGB(c.r / GRAY, c.g / GRAY, c.b / GRAY); }
      if (slot !== 'shoes') m.roughness = /^aodai/.test(it.id) ? 0.46 : Math.max(m.roughness, 0.8);
      return;
    }
    if (name.startsWith('hair_')) { o.visible = name === 'hair_' + hair; m.color.setRGB(ht[0], ht[1], ht[2]); m.alphaToCoverage = Q.msaa > 0 && !m.transparent; m.roughness = 0.5; m.shadowSide = THREE.DoubleSide; o.castShadow = o.visible && !m.transparent; }
    else if (name === 'body' || name === 'head') { if (hmaps[name]) m.map = hmaps[name]; if (name === 'head' && hmaps.headNormal) m.normalMap = hmaps.headNormal; m.color.setRGB(st[0], st[1], st[2]); if (!m.roughnessMap) m.roughness = 0.52; skinPatch(m); }
    else if (name === 'cornea') { m.transparent = true; m.opacity = 0.12; m.roughness = 0.03; m.envMapIntensity = 1.6; m.depthWrite = false; o.castShadow = false; }
    else if (name === 'top' && info.bakedTop) { m.color.setRGB(1, 1, 1); m.roughness = Math.max(m.roughness, 0.8); }
    else if (name === 'top' || name === 'bottom') { c.setHex(oc[name]); m.color.setRGB(c.r / GRAY, c.g / GRAY, c.b / GRAY); m.roughness = silk ? 0.46 : Math.max(m.roughness, 0.8); }
    else if (name === 'shoes' && oc.shoes) m.color.setHex(oc.shoes);
    else if (name === 'eyes') { m.roughness = 0.08; m.envMapIntensity = 1.5; }
    else if (name === 'eyebrows' || name === 'eyelashes') { o.castShadow = false; m.forceSinglePass = true; /* thẻ mỏng dán trên mặt: three vẽ hai lượt (mặt sau rồi mặt trước) và đặt needsUpdate mỗi lượt, tính lại chương trình mỗi khung */ m.color.setRGB(ht[0] * 0.6, ht[1] * 0.6, ht[2] * 0.6); }
  });
  shareSkeletons(model);
  const s = (look.height || info.height) / info.height, b = 0.93 + 0.07 * (look.build ?? 1);
  const g = new THREE.Group(); g.add(model); g.scale.set(s * b, s, s * b);
  const mixer = new THREE.AnimationMixer(model), act = {};
  for (const n of ['idle', 'walk', 'run']) { if (!clips[n]) continue; act[n] = mixer.clipAction(clips[n]); act[n].play(); act[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
  if (act.idle) act.idle.time = Math.random() * act.idle.getClip().duration;
  const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name.replace('mixamorig', '')] = o; });
  // xương tà áo dài (nếu tệp có): nhớ tư thế nghỉ để quay quanh trục ngang của thân
  if (W && W.shoes && W.shoes.lift) model.position.y += W.shoes.lift;                    // giày cao gót: nâng cả người (cao độ nghỉ của bàn chân đo sau dòng này nên tự khớp)
  const useFlaps = !W || !!((W.top && W.top.flaps) || (W.bottom && W.bottom.flaps));
  model.updateMatrixWorld(true);
  const flaps = ['Front', 'Back'].map((side) => {
    const chain = [1, 2, 3, 4].map(i => bones['aodai' + side + i]).filter(Boolean); if (!chain.length || !useFlaps) return null;
    return { sign: side === 'Front' ? 1 : -1, ang: 0, vel: 0, chain: chain.map(bn => ({ bn, rest: bn.quaternion.clone(), world: bn.getWorldQuaternion(new THREE.Quaternion()) })) };
  }).filter(Boolean);
  const restQ = {}; for (const k of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftShoulder', 'RightShoulder']) if (bones[k]) restQ[k] = bones[k].quaternion.clone();
  const headRel = bones.Head ? bones.Head.getWorldQuaternion(new THREE.Quaternion()) : null;   // hướng đầu ở tư thế nghỉ, trong hệ nhân vật
  const neckDir = bones.Neck && bones.Head ? bones.Head.getWorldPosition(new THREE.Vector3()).sub(bones.Neck.getWorldPosition(new THREE.Vector3())).normalize() : null;   // hướng cổ ở tư thế nghỉ
  // cao độ nghỉ của mũi chân/cổ chân theo mét của mô hình (chưa nhân tỉ lệ chiều cao s): groundFeet, plantFoot chia tỉ lệ rồi mới so — để nguyên giá trị đã nhân thì người cao bị hở, người thấp bị chìm
  const toeY = bones.LeftToeBase ? bones.LeftToeBase.getWorldPosition(new THREE.Vector3()).y / s : undefined;
  const footY = bones.LeftFoot ? bones.LeftFoot.getWorldPosition(new THREE.Vector3()).y / s : undefined;
  // điểm gót ở mặt đế (ngay dưới và lùi sau cổ chân 5 cm), trong hệ của xương bàn chân — để biết gót có chìm dưới nền không khi bàn chân ngửa mũi
  // footLat: trục ngang của bàn chân (lúc nghỉ nằm ngang, vuông góc hướng mặt) trong hệ của xương bàn chân — để đo bàn chân đang lật nghiêng bao nhiêu
  // armFlex: hướng khuỷu gập (ra trước mặt lúc nghỉ) trong hệ của xương cánh tay trên
  const armFlex = {}; for (const S of ['Left', 'Right']) { const am = bones[S + 'Arm']; if (am) armFlex[S] = new THREE.Vector3(0, 0, 1).applyQuaternion(am.getWorldQuaternion(new THREE.Quaternion()).invert()); }
  // curl: phép quay gập từng đốt ngón (trỏ, giữa, nhẫn, út) về phía lòng bàn tay ở mức khép hờ khi đi — trục gập = hướng ngón × pháp tuyến lòng bàn tay (như palmTo), đổi sang hệ của đốt
  const curl = [];
  for (const [S, sg] of [['Left', 1], ['Right', -1]]) {
    const hd = bones[S + 'Hand'], mid = bones[S + 'HandMiddle1'], idx = bones[S + 'HandIndex1'], pky = bones[S + 'HandPinky1']; if (!hd || !mid || !idx || !pky) continue;
    const P = (o) => o.getWorldPosition(new THREE.Vector3()), d = P(mid).sub(P(hd)), n = new THREE.Vector3().crossVectors(d, P(idx).sub(P(pky))).multiplyScalar(sg), axis = new THREE.Vector3().crossVectors(d, n).normalize();
    for (const [fn, more] of [['Index', 0.85], ['Middle', 1], ['Ring', 1.1], ['Pinky', 1.2]]) for (let j = 1; j <= 3; j++) {
      const bn = bones[S + 'Hand' + fn + j]; if (!bn) continue;
      curl.push({ bn, rest: bn.quaternion.clone(), q: new THREE.Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(bn.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize(), FINGER_CURL[j - 1] * more) });
    }
  }
  const heel = {}, footLat = {}, toeUp = {}; for (const S of ['Left', 'Right']) { const ft = bones[S + 'Foot']; if (ft) { const p = ft.getWorldPosition(new THREE.Vector3()); p.y = 0; p.z -= HEEL_BACK * s * b; heel[S] = ft.worldToLocal(p); footLat[S] = new THREE.Vector3(1, 0, 0).applyQuaternion(ft.getWorldQuaternion(new THREE.Quaternion()).invert()); } const tb = bones[S + 'ToeBase']; if (tb) toeUp[S] = new THREE.Vector3(0, 1, 0).applyQuaternion(tb.getWorldQuaternion(new THREE.Quaternion()).invert()); }      // toeUp: phương thẳng đứng lúc nghỉ trong hệ của xương ngón chân
  mixer.update(0);
  return { g, mixer, act, clips, poses: new Map(), pose: null, pw: 0, lookAt: null, lookPos: new THREE.Vector3(), lk: 0, smileMeshes, smile0: morph.smile, smileV: morph.smile, smileT: null, gfc: 0, flapDead: W && W.bottom && W.bottom.flaps && !(W.top && W.top.flaps) ? 0.16 : 0, twistMax: W && W.top && (W.top.hides || []).includes('skin_forearm') ? 0.3 : undefined, blinkMeshes, blinkIn: 1 + Math.random() * 4, blinkV: 0, bones, flaps, footY, toeY, heel, footLat, toeUp, armFlex, curl, stride: info.hipsRestHeight > 0 ? info.hipsRestHeight / CLIP_HIPS : 1, legOut: { Left: 0, Right: 0 }, curlAmt: 0, airT: 0, airK: 0, airV: 0, land: 0, landK: 1, jumpKind: null, jumpLead: 'Left', kickPrev: 0, windK: 0, kickWind: 0, npc: false, kickT: -1, kickC: 0.15, kickStyle: 'drive', kickKind: null, kickLead: null, kickAt: null, kickHas: false, kickP: new THREE.Vector3(), aim: null, hold: null, holdAt: null, holdR: 0, shotFrom: new THREE.Vector3(), shotR: 0.12, shotSet: false, fine: true, fineAlways: false, rootP: new THREE.Vector3(), rootSeen: false, rootYaw: 0, carry: false, anchor: { Left: { on: false, p: new THREE.Vector3(), t: new THREE.Vector3(), near: 0, d: new THREE.Vector3(), rel: false, ik: false, near: 0, lag: 0, lift: 0, e: 0, v: 0 }, Right: { on: false, p: new THREE.Vector3(), t: new THREE.Vector3(), d: new THREE.Vector3(), rel: false, ik: false, near: 0, lag: 0, lift: 0, e: 0, v: 0 }, busy: false }, restQ, headRel, neckDir, female: look.gender === 'f', stance: look.stance || 'side', t: 0, seed: Math.random() * 6.28, w: { idle: 1, walk: 0, run: 0 }, rootShift: (name, t) => rootZAt(clips[name], t) * g.scale.z, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); for (const m of mats) m.dispose(); model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); } };
}

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
/** xoay xương sao cho đoạn xương→con chĩa theo hướng dir (toạ độ thế giới), mức k */
function aim(bone, child, dir, k, lazy) {      // lazy: không dựng lại ma trận của cả nhánh xương con ngay (cánh tay kéo theo 15 đốt ngón) — chỉ dùng khi mọi phép đọc sau đó đi qua getWorldPosition/getWorldQuaternion (tự dựng lại chuỗi cha)
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _d.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(_d, dir); bone.parent.getWorldQuaternion(_pq);
  const world = bone.getWorldQuaternion(_aw).premultiply(_q);
  bone.quaternion.slerp(_pq.invert().multiply(world), k); if (!lazy) bone.updateMatrixWorld(true);
}
const _aw = new THREE.Quaternion();

const _f = new THREE.Vector3(), _rq = new THREE.Quaternion(), _lq = new THREE.Quaternion(), _iq = new THREE.Quaternion(), _X = new THREE.Vector3(1, 0, 0);
const FLAP_SHARE = [1, 0.1, -0.38, -0.2];      // đốt trên theo đùi tới gối, đốt dưới rủ thẳng xuống lại
/** góc đùi ra trước (rad, + là ra trước) trong hệ của nhân vật */
function thighAngle(up, leg, rootInv) {
  if (!up || !leg) return 0;
  up.getWorldPosition(_a); leg.getWorldPosition(_b); _d.subVectors(_b, _a).applyQuaternion(rootInv);
  return Math.atan2(_d.z, -_d.y);
}
function driveFlaps(r, dt, speed, root) {
  root.getWorldQuaternion(_iq).invert();
  // chân váy mặc dưới áo: đùi chỉ hơi đưa ra (dáng đứng chùng gối) thì chưa đẩy váy, nếu không cạp váy sẽ trồi qua gấu áo
  const dz = r.flapDead || 0, dead = (a) => a > dz ? a - dz : a < -dz ? a + dz : 0;
  const aL = dead(thighAngle(r.bones.LeftUpLeg, r.bones.LeftLeg, _iq)), aR = dead(thighAngle(r.bones.RightUpLeg, r.bones.RightLeg, _iq));
  const drag = Math.min(0.35, speed * 0.06);      // đi nhanh thì gió tạt cả hai tà về sau
  for (const f of r.flaps) {
    const push = f.sign > 0 ? Math.max(0, aL, aR) * 0.95 : Math.min(0, aL, aR) * 0.22;
    const target = push - drag * (f.sign > 0 ? 0.15 : 0.45);
    // lò xo giảm chấn; chân đẩy thì tà phải theo ngay (không được xuyên), buông thì rơi chậm
    const stiff = Math.abs(target) > Math.abs(f.ang) ? 140 : 26, h = Math.min(dt, 0.033);
    f.vel += ((target - f.ang) * stiff - f.vel * (stiff > 100 ? 20 : 5)) * h; f.ang += f.vel * h;
    if (f.sign > 0) f.ang = Math.max(f.ang, push * 0.9); else f.ang = Math.min(f.ang, push * 0.9);
    f.chain.forEach((c, i) => {
      _rq.setFromAxisAngle(_X, -f.ang * FLAP_SHARE[i]);                       // quay quanh trục ngang (hệ nhân vật)
      _lq.copy(c.world).invert().multiply(_rq).multiply(c.world);                 // đổi sang hệ cục bộ của xương ở tư thế nghỉ
      c.bn.quaternion.copy(c.rest).multiply(_lq);
    });
  }
}
const _wq = new THREE.Quaternion(), _dir = new THREE.Vector3();
const dirW = (x, y, z) => _dir.set(x, y, z).normalize().applyQuaternion(_wq).clone();
/** đứng thẳng tự nhiên: chân khép, tay buông sát thân, khuỷu hơi gập; k = mức áp (trọng số idle) */
// hướng (hệ nhân vật, bên trái; bên phải lấy đối xứng x) của cánh tay trên và cẳng tay cho từng kiểu đứng
const ARMS = {
  side:  [[0.12, -1, -0.03], [0.0, -1, 0.22]],      // buông thả lỏng: cánh tay dạng khỏi thân ~8° (nữ thêm ~3° vì hông rộng hơn vai), khuỷu gập ~10°, bàn tay ngay cạnh đường chỉ quần — đưa ra trước nhiều hơn thì nhìn ngang như sắp rút súng
  front: [[0.16, -1, 0.10], [-0.62, -0.72, 0.34]],      // hai tay chắp trước bụng dưới
  back:  [[0.15, -1, -0.10], [-0.55, -0.78, -0.30]],    // hai tay chắp sau lưng
};
const PALM = [-1, 0, -0.08], TWIST_MAX = 1.0;      // lòng bàn tay quay vào đùi và chếch ra sau (tay buông tự nhiên hơi úp); xoắn cẳng tay tối đa ~57° (quá nữa thì tay áo bị vặn)
const _pn = new THREE.Vector3(), _pt = new THREE.Vector3(), _px = new THREE.Vector3(), _hd = new THREE.Vector3(), _tq = new THREE.Quaternion();
/**
 * Xoay cẳng tay quanh trục của nó để lòng bàn tay quay về hướng dir (hệ nhân vật, viết cho tay trái; tay phải lấy đối xứng x).
 * aim() chỉ lo hướng của đoạn xương, còn độ xoắn quanh trục thì bỏ mặc → bàn tay hay bị ngửa ra trước hoặc úp ra sau.
 * Pháp tuyến lòng bàn tay tính từ hình học: (gốc ngón giữa − cổ tay) × (gốc ngón trỏ − gốc ngón út), đổi dấu theo bên.
 */
function palmTo(r, S, s, dir, k, lazy) {
  const B = r.bones, fore = B[S + 'ForeArm'], hand = B[S + 'Hand'], mid = B[S + 'HandMiddle1'], idx = B[S + 'HandIndex1'], pky = B[S + 'HandPinky1'];
  if (!fore || !hand || !mid || !idx || !pky) return;
  hand.getWorldPosition(_a); fore.getWorldPosition(_b); _px.subVectors(_a, _b).normalize();          // trục cẳng tay
  mid.getWorldPosition(_hd).sub(_a); idx.getWorldPosition(_pt); pky.getWorldPosition(_pn); _pt.sub(_pn);
  _pn.crossVectors(_hd, _pt).multiplyScalar(s); _pn.addScaledVector(_px, -_pn.dot(_px));              // pháp tuyến lòng bàn tay, chiếu vuông góc trục
  _pt.set(s * dir[0], dir[1], dir[2]).applyQuaternion(_wq); _pt.addScaledVector(_px, -_pt.dot(_px));
  if (_pn.lengthSq() < 1e-10 || _pt.lengthSq() < 1e-6) return;
  _pn.normalize(); _pt.normalize();
  const ang = THREE.MathUtils.clamp(Math.atan2(_hd.crossVectors(_pn, _pt).dot(_px), _pn.dot(_pt)), -(r.twistMax ?? TWIST_MAX), r.twistMax ?? TWIST_MAX);
  _tq.setFromAxisAngle(_px, ang); fore.parent.getWorldQuaternion(_pq);
  const world = fore.getWorldQuaternion(_q).premultiply(_tq);
  fore.quaternion.slerp(_pq.invert().multiply(world), k); if (!lazy) fore.updateMatrixWorld(true);
}
/** khép ngón cái về phía ngón trỏ (tư thế gốc của mô hình để ngón cái choãi ~50°: tay buông mà ngón cái chĩa ngang vào đùi, nhìn như móc câu) */
function thumbIn(r, S, k) {
  const B = r.bones, t1 = B[S + 'HandThumb1'], t2 = B[S + 'HandThumb2'], i1 = B[S + 'HandIndex1'], i2 = B[S + 'HandIndex2']; if (!t1 || !t2 || !i1 || !i2 || k < 0.01) return;
  i1.getWorldPosition(_pn); i2.getWorldPosition(_pt).sub(_pn).normalize(); t1.getWorldPosition(_pn); t2.getWorldPosition(_hd).sub(_pn).normalize();
  _hd.lerp(_pt, 0.8).normalize(); _hs.copy(_hd); aim(t1, t2, _hs, k, true); const t3 = B[S + 'HandThumb3']; if (t3) aim(t2, t3, _hs, k * 0.7, true);
}
const FIDGETS = {      // cử chỉ nhỏ lúc đứng lâu / dáng nghỉ cơ sở của NPC: [tay, cánh tay, cẳng tay ([ra ngoài, lên, ra trước]), mức cúi đầu]
  hip: ['Right', [0.6, -0.72, -0.3], [-0.72, -0.5, 0.42], 0],            // chống một tay vào hông
  watch: ['Left', [0.18, -0.9, 0.36], [-0.78, 0.18, 0.58], 0.28],        // xem đồng hồ
  scratch: ['Right', [0.5, 0.3, 0.45], [-0.55, 0.8, -0.12], 0.1],        // gãi đầu / sửa kính
  cross: ['both', [0.06, -0.86, 0.5], [-1, 0.02, 0.1], 0],               // khoanh tay: khuỷu đưa ra trước sườn, cẳng tay nằm ngang trước bụng trên, bàn tay tới khuỷu bên kia
};
const FIDGET_KEYS = Object.keys(FIDGETS), STAND = ['side', 'side', 'hip', 'side', 'cross', 'side', 'side'], frac = (x) => x - Math.floor(x);
function fidget(r, type, w) {
  const F = FIDGETS[type]; if (!F || w < 0.01) return;
  if (F[0] === 'both') {      // đang vào/ra dáng: cẳng tay đưa ra trước rồi mới khép ngang (trộn thẳng từ tay buông sang tay khoanh thì cổ tay quét xuyên qua bụng)
    const u = 1 - w, f2 = [F[2][0] * (1 - u * 0.9), F[2][1] - u * 0.5, F[2][2] + u * 0.9]; armTo(r, 'Left', F[1], f2, w); armTo(r, 'Right', F[1], [f2[0], f2[1] + 0.2, f2[2] + 0.06], w); palmTo(r, 'Left', 1, [0, 0, -1], w); palmTo(r, 'Right', -1, [0, 0, -1], w); }      // tay phải gác trên tay trái, lòng bàn tay áp vào người
  else if (type === 'scratch' && r.bones.Head) armIK(r, 'Right', around(r.bones.Head.getWorldPosition(_ht), -0.105, 0.075, -0.035, _hs), w, [0.75, 0.1, 0.35]);      // bàn tay chạm đúng đầu (sau tai phải) chứ không giơ lơ lửng
  else armTo(r, F[0], F[1], F[2], w);
  if (F[3]) bend(r.bones.Head, 1, 0, 0, F[3] * w);
}
/**
 * Đứng nghỉ thả lỏng (không phải đứng nghiêm): trọng tâm dồn một chân 7–11 giây rồi đổi (hông lệch ngang, xương chậu nghiêng, cột sống cong ngược lại, chân kia
 * chùng gối và xoay bàn chân ra ngoài), hai chân rộng bằng hông, tay buông ra trước đường hông với khuỷu gập ~25°, hai bên lệch nhau, đầu nghiêng và nhìn quanh nhẹ.
 * Thỉnh thoảng một cử chỉ nhỏ (FIDGETS); NPC (r.npc) mỗi người một dáng cơ sở theo seed. k = trọng số idle nên bước đi là mọi thứ tan ngay.
 */
function relaxPose(r, k, root, fine) {
  const B = r.bones, f = r.female ? 1 : 0, t = r.t, sd = r.seed, br = Math.sin(t * 1.5 + sd) * 0.009 + Math.sin(t * 0.37 + sd * 1.7) * 0.012;      // thở + đung đưa chậm
  const side = THREE.MathUtils.clamp(Math.sin((t / (7 + frac(sd) * 4) + sd) * Math.PI) * 3.2, -1, 1);      // +1: trụ chân trái, −1: trụ chân phải
  // hông, lưng, cổ, bàn tay, bàn chân về tư thế nghỉ (clip đứng gốc ưỡn hông, xoè tay, chân chữ bát)
  for (const kq in r.restQ) B[kq].quaternion.slerp(r.restQ[kq], (kq === 'Head' || kq === 'Neck' ? 0.55 : 0.8) * k);
  // Mọi bước xoay trong hàm này để 'lazy' (không dựng lại ma trận cả nhánh xương sau từng bước — trước đây ~7 lần dựng lại cả bộ xương mỗi khung, chiếm phần lớn thời gian
  // của dáng đứng): các phép đọc ở đây đều qua getWorld*, tự dựng lại chuỗi cha; groundFeet ở cuối dựng lại cả bộ xương MỘT lần cho các bước sau.
  if (B.Hips) B.Hips.position.x += side * 0.026 * k;
  root.getWorldQuaternion(_wq);
  straighten(r, 0.85 * k, 0.012, true);                     // lưng thẳng, cổ không rướn ra trước
  bend(B.Hips, 0, 0, 1, side * 0.035 * k, true); bend(B.Spine, 0, 0, 1, -side * 0.055 * k, true); bend(B.Spine, 1, 0, 0, (0.015 + Math.sin(t * 1.5 + sd) * 0.008) * k, true);
  if (fine) { bend(B.Head, 0, 0, 1, (side * 0.03 + Math.sin(sd * 7) * 0.035) * k, true); bend(B.Head, 0, 1, 0, Math.sin(t * 0.31 + sd * 3) * 0.13 * k, true); }      // người ngoài tầm chỉnh kỹ: bỏ nghiêng/quay đầu, xoay bàn tay, ngón cái, cử chỉ nhỏ
  const arms = ARMS[r.stance] || ARMS.side;
  for (const [S, s] of [['Left', 1], ['Right', -1]]) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], foot = B[S + 'Foot'], arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand'];
    const free = Math.max(0, -side * s);                 // chân không chịu lực: gối chùng ra trước, bàn chân hơi lùi và xoay ra ngoài
    if (up && leg && foot) { aim(up, leg, dirW(s * (0.07 - f * 0.025) - side * 0.03, -1, 0.012 + free * 0.11), k, true); aim(leg, foot, dirW(s * 0.01 - side * 0.02, -1, -0.02 - free * 0.14), k, true); bend(up, 0, 1, 0, s * (0.07 + free * 0.2) * k, true); }
    if (arm && fore && hand) {
      const a0 = arms[0], a1 = arms[1], w = r.stance === 'side' ? -f * 0.05 : 0;
      const as = r.stance === 'side' ? Math.sin(sd * 3.1 + s) * 0.05 : 0, ax = r.stance === 'side' ? Math.sin(sd * 5.3 + s * 2) * 0.025 : 0;        // hai tay không buông giống hệt nhau
      aim(arm, fore, dirW(s * (a0[0] - w + ax), a0[1], a0[2] + br * 0.6 + as), k, true); aim(fore, hand, dirW(s * (a1[0] + ax), a1[1], a1[2] + br + as * 1.5), k, true);
      if (r.stance === 'side' && fine) { palmTo(r, S, s, PALM, k, true); thumbIn(r, S, 0.9 * k); }       // chắp tay trước/sau: giữ độ xoắn của tư thế, không ép
    }
  }
  if (r.stance === 'side' && (fine || r.npc)) {      // dáng cơ sở của NPC (chống hông, khoanh tay) giữ cả khi ở xa, kẻo lại gần 12 m thì tay đổi dáng đột ngột
    const T = 16 + frac(sd * 2.1) * 12, c = t % T, e = THREE.MathUtils.smoothstep(c, T - 4.6, T - 3.9) * (1 - THREE.MathUtils.smoothstep(c, T - 0.8, T - 0.1));
    const base = r.npc ? STAND[Math.floor(frac(sd * 1.37) * STAND.length)] : 'side';
    if (base !== 'side') fidget(r, base, k);
    if (fine && e > 0.01) fidget(r, FIDGET_KEYS[(Math.floor(t / T) + Math.floor(sd * 3)) % FIDGET_KEYS.length], e * k);
  }
  groundFeet(r, k, root);
  r.openAmt = (r.openAmt || 0) + FINGER_OPEN * k; r.curlAmt += FINGER_IDLE * k;      // bàn tay khép hờ nhẹ lúc đứng nghỉ (dáng chụp ảnh, clip khác: k giảm theo trọng số của chúng); đặt một lần ở applyCurl
}
/** dịch hông theo phương đứng để bàn chân thấp hơn chạm đúng mặt đất (sau khi đã đổi hướng chân) */
function groundFeet(r, k, root, maxStep) {
  const B = r.bones; if (!B.Hips || !B.LeftFoot || !B.RightFoot || r.footY === undefined) return;
  // độ lệch của điểm thấp nhất so với cao độ nghỉ của nó; xét cả cổ chân lẫn mũi chân để dáng nhấc gót (ngồi xổm) không bị ấn mũi chân xuống đất
  root.getWorldPosition(_d); const sc = r.g.scale.y || 1; let low = Infinity;
  for (const S of ['Left', 'Right']) {
    let e = (B[S + 'Foot'].getWorldPosition(_a).y - _d.y) / sc - r.footY;
    const toe = B[S + 'ToeBase']; if (toe && r.toeY !== undefined) e = Math.min(e, (toe.getWorldPosition(_a).y - _d.y) / sc - r.toeY);
    low = Math.min(low, e);
  }
  let corr = -low * k;
  if (maxStep !== undefined) { corr = r.gfc += THREE.MathUtils.clamp(corr - r.gfc, -maxStep, maxStep); }      // maxStep: mức đổi tối đa mỗi khung của phần bù
  B.Hips.position.y += corr; B.Hips.updateMatrixWorld(true);
}
/**
 * Chân cho các dáng chụp ảnh đứng: clip dáng dựng từ tư thế nghỉ chữ A nên hai chân dạng rộng → khép chân lại như dáng đứng
 * thường; nữ chùng nhẹ gối phải cho mềm. Không dùng cho dáng ngồi xổm và dáng bước chéo chân.
 */
function poseLegs(r, k, root) {
  const B = r.bones, f = r.female ? 1 : 0; root.getWorldQuaternion(_wq);
  for (const kq of ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']) if (B[kq] && r.restQ[kq]) B[kq].quaternion.slerp(r.restQ[kq], 0.8 * k);
  for (const [S, s] of [['Left', 1], ['Right', -1]]) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], foot = B[S + 'Foot']; if (!up || !leg || !foot) continue;
    const soft = s < 0 ? f : 0;
    aim(up, leg, dirW(s * (0.04 - f * 0.018), -1, 0.012 + soft * 0.07), k); aim(leg, foot, dirW(s * 0.004, -1, -0.02 - soft * 0.09), k);
  }
  groundFeet(r, k, root);
}

const _cq = new THREE.Quaternion(), _cd = new THREE.Vector3();
/** kéo đoạn xương→con về gần thân: thu thành phần ngang (kx) và trước–sau (kz) của hướng hiện tại, trong hệ nhân vật */
function tuck(bone, child, s, minX, kx, kz, k) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _cd.subVectors(_b, _a).normalize().applyQuaternion(_cq);   // _cq = nghịch đảo hướng nhân vật
  _cd.x = s * Math.max(minX, Math.abs(_cd.x) * kx); _cd.z *= kz;
  aim(bone, child, _cd.normalize().applyQuaternion(_wq).clone(), k);
}
/**
 * Dựng thẳng cột sống: đoạn hông→cổ về gần thẳng đứng (lean = độ ngả ra trước cho phép), cổ thẳng trên vai,
 * đầu về đúng hướng nghỉ so với thân người (mắt nhìn ngang). Gọi sau khi _wq đã là hướng nhân vật.
 */
function straighten(r, k, lean, lazy) {
  const B = r.bones; if (!B.Spine || !B.Neck || !B.Head) return;
  aim(B.Spine, B.Neck, dirW(0, 1, lean), k, lazy);
  const nd = r.neckDir; aim(B.Neck, B.Head, dirW(0, nd ? nd.y : 1, (nd ? nd.z * 0.8 : 0.06) + lean * 0.5), k, lazy);
  if (r.headRel) { _fq.copy(_wq).multiply(r.headRel); B.Head.parent.getWorldQuaternion(_fp); B.Head.quaternion.slerp(_fp.invert().multiply(_fq), k); if (!lazy) B.Head.updateMatrixWorld(true); }
}
// Đọc vị trí / hướng thế giới thẳng từ matrixWorld: CHỈ dùng khi ma trận của xương đó chắc chắn đã mới (vừa getWorldPosition chính nó, hoặc tổ tiên của nó
// vừa updateMatrixWorld(true)). getWorldPosition/getWorldQuaternion của three dựng lại ma trận của cả chuỗi xương cha ở mỗi lần gọi (~10 cấp với bàn chân).
const _ws = new THREE.Vector3(), _wp = new THREE.Vector3();
const posNow = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld), quatNow = (bone, out) => { bone.matrixWorld.decompose(_wp, out, _ws); return out; };
/** như aim() nhưng đọc ma trận sẵn có: xương, xương con và xương cha phải đang có ma trận mới */
function aimNow(bone, child, dir, k) {
  posNow(bone, _a); posNow(child, _b); _d.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(_d, dir); quatNow(bone.parent, _pq);
  bone.quaternion.slerp(_pq.invert().multiply(quatNow(bone, _aq).premultiply(_q)), k); bone.updateMatrixWorld(true);
}
const _aq = new THREE.Quaternion();
const FINGER_CURL = [0.42, 0.5, 0.33], FINGER_RUN = 1.6, FINGER_IDLE = 0.3, FINGER_OPEN = 0.85;      // FINGER_OPEN: lúc đứng nghỉ, ngón tay của clip (co ~90° ở gốc ngón, nhìn như vuốt) được duỗi về tư thế gốc chừng này rồi mới khép hờ FINGER_IDLE      // góc gập (rad) của ba đốt ngón khi đi; khi chạy nhân thêm chừng này (nắm hờ)
/**
 * Đặt độ khép ngón của khung này (r.curlAmt, gom từ relaxPose và refineGait) lên từng đốt, tính từ tư thế GỐC của đốt chứ không nhân tiếp lên kết quả khung trước:
 * bộ trộn của three chỉ ghi lại một xương khi giá trị trộn ra đổi so với lần ghi trước, nên đốt ngón nào có kênh đứng yên thì không được đặt lại mỗi khung — nhân dồn
 * sẽ cuộn ngón mãi. c.out = giá trị mình ghi lần trước; xương còn đúng giá trị đó nghĩa là bộ trộn chưa ghi gì mới, gốc vẫn là c.base.
 */
function applyCurl(r) {
  const amt = r.curlAmt, open = Math.min(1, r.openAmt || 0); r.curlAmt = 0; r.openAmt = 0;
  for (const c of r.curl) {
    const q = c.bn.quaternion;
    if (!c.base) { c.base = q.clone(); c.out = q.clone(); } else if (q.x !== c.out.x || q.y !== c.out.y || q.z !== c.out.z || q.w !== c.out.w) c.base.copy(q);
    q.copy(c.base); if (open > 0.005) q.slerp(c.rest, open); if (amt > 0.005) q.multiply(_aq.identity().slerp(c.q, amt));
    c.out.copy(q);
  }
}
const ELBOW_MIN = 18;      // độ: khi đi, khuỷu duỗi thẳng thì được gập thêm chừng này; khuỷu đã gập càng nhiều thì thêm càng ít (gập sẵn 18° thêm ~7°, 40° thêm ~2°)
/**
 * Khi đi, clip (và bước thu cẳng tay vào thân) có lúc để khuỷu duỗi thẳng đơ 3–5° — tay trông cứng như que. Gập thêm cẳng tay trong chính mặt phẳng nó đang gập;
 * lúc khuỷu gần thẳng (chưa có mặt phẳng gập rõ) thì gập về phía trước mặt. Gọi ngay sau tuck(fore, hand): ma trận tay đang mới.
 */
function flexElbow(arm, fore, hand, root, k) {
  posNow(arm, _a); posNow(fore, _b); _ax.subVectors(_b, _a).normalize(); posNow(hand, _T).sub(_b).normalize();
  const bend = Math.acos(THREE.MathUtils.clamp(_T.dot(_ax), -1, 1)) * THREE.MathUtils.RAD2DEG, add = ELBOW_MIN * Math.exp(-bend / ELBOW_MIN) * k; if (add < 0.3) return;
  root.getWorldDirection(_K); _K.addScaledVector(_ax, -_K.dot(_ax)).normalize();      // hướng trước mặt, vuông góc cánh tay trên
  _T.addScaledVector(_ax, -_T.dot(_ax)); if (_T.lengthSq() > 1e-8) _K.lerp(_T.normalize(), THREE.MathUtils.smoothstep(bend, 4, 14)).normalize();
  const b = (bend + add) * THREE.MathUtils.DEG2RAD;
  aimNow(fore, hand, _g2.copy(_ax).multiplyScalar(Math.cos(b)).addScaledVector(_K, Math.sin(b)), 1);
}
const ELBOW_BEND = [8, 25];      // độ: khuỷu gập dưới 8° thì mặt phẳng gập chưa rõ (không sửa), từ 25° thì sửa hết mức
/**
 * Khuỷu là khớp bản lề: cẳng tay chỉ gập trong mặt phẳng do độ xoắn của cánh tay trên quyết định. Clip đi/chạy (và các bước chỉnh hướng tay ở
 * refineGait, vốn chỉ lo hướng của từng đoạn xương) để cẳng tay gập lệch trục đó tới 30–60° → da khuỷu bị vặn. Xoắn cánh tay trên quanh trục
 * của chính nó cho hướng gập khớp với cẳng tay, rồi trả cẳng tay về đúng hướng cũ trong thế giới: vị trí khuỷu, cổ tay và bàn tay không đổi.
 */
function hingeElbow(r, S, arm, fore, hand, k) {
  const flex = r.armFlex[S]; if (!flex) return;
  posNow(arm, _a); posNow(fore, _b); _ax.subVectors(_b, _a).normalize(); posNow(hand, _T).sub(_b).normalize();      // _ax: trục cánh tay trên, _T: hướng cẳng tay (ma trận tay vừa được tuck/palmTo cập nhật)
  const w = k * THREE.MathUtils.smoothstep(Math.acos(THREE.MathUtils.clamp(_T.dot(_ax), -1, 1)) * THREE.MathUtils.RAD2DEG, ELBOW_BEND[0], ELBOW_BEND[1]); if (w < 0.01) return;
  _T.addScaledVector(_ax, -_T.dot(_ax)).normalize(); quatNow(arm, _fq); _K.copy(flex).applyQuaternion(_fq); _K.addScaledVector(_ax, -_K.dot(_ax)); if (_K.lengthSq() < 1e-6) return; _K.normalize();
  const ang = Math.atan2(_pole.crossVectors(_K, _T).dot(_ax), _K.dot(_T)); quatNow(fore, _rq);
  _tq.setFromAxisAngle(_ax, ang * w).multiply(_fq); quatNow(arm.parent, _fp); arm.quaternion.copy(_fp.invert().multiply(_tq));      // _tq = hướng mới của cánh tay trên trong thế giới
  fore.quaternion.copy(_fp.copy(_tq).invert().multiply(_rq)); arm.updateMatrixWorld(true);
}
const STEP_REACH = 0.4, HIP_FOLLOW = 0.6;      // nền dưới bàn chân lệch quá 0,4 m so với nền dưới gốc thì bỏ qua (mép vực, mặt bàn); phần độ thấp của bàn chân thấp nhất mà hông hạ theo
const COARSE_UP = 0.014;      // m của mô hình: người ở ngoài tầm chỉnh kỹ được nâng hông chừng này khi đi/chạy (clip để mũi bàn chân trụ chìm 2–3 cm)
const KNEE_FWD = 0.03;      // IK chân: độ lệch gối (m) coi như luôn có sẵn về phía trước mặt khi chân duỗi gần thẳng
const KNEE_REACH = [0.93, 0.985, 0.997];      // phần chiều dài chân (hông → cổ chân): dưới mức đầu gối cong rõ, giữ nguyên hướng gập; tới mức giữa thì pha đủ hướng trước mặt; mức cuối là độ duỗi tối đa cho phép
const ROLL_MAX = 0.5;       // gỡ lật bàn chân tối đa (rad) — quá mức này là dáng cố ý, không phải sai số của clip
const HEEL_BACK = 0.05, LEG_NEAR = [0.03, 0.08];      // gót lùi sau cổ chân (m của mô hình); bàn chân cao hơn mức nghỉ từ 3 cm thì bắt đầu coi là đang nhấc, tới 8 cm là đang vung hẳn
/**
 * Đùi khi đi/chạy: clip gốc đặt bàn chân sát, có lúc chéo qua đường giữa; thu thành phần ngang của đùi về sát ngoài đường giữa (như tuck).
 * Riêng lúc bàn chân đang chạm đất thì giữ nguyên độ dời đã có lúc đặt chân (r.legOut) thay vì tính lại từng khung: tính lại thì bàn chân trụ
 * bị kéo ngang theo nhịp lắc hông (đo được 0,2–0,3 m/s khi chạy). Gọi khi _wq/_cq đã là hướng nhân vật.
 */
function trackLeg(r, S, s, up, leg, foot, toe, root, kz, k) {
  up.getWorldPosition(_a); leg.getWorldPosition(_b); _cd.subVectors(_b, _a).normalize().applyQuaternion(_cq);
  const x = _cd.x * s, want = Math.max(0.02, Math.abs(x) * 0.45) - x;      // độ dời ra ngoài mà cách thu cũ sẽ cho ở khung này
  let near = 0;      // 1 = bàn chân đang ở trên nền, 0 = đang vung trên không
  if (foot && r.footY !== undefined) {
    const sc = r.g.scale.y || 1, y0 = root.getWorldPosition(_d).y; let e = (foot.getWorldPosition(_d).y - y0) / sc - r.footY;
    if (toe && r.toeY !== undefined) e = Math.min(e, (toe.getWorldPosition(_d).y - y0) / sc - r.toeY);
    near = 1 - THREE.MathUtils.smoothstep(e, LEG_NEAR[0], LEG_NEAR[1]);
  }
  const out = r.legOut[S] += (want - r.legOut[S]) * (1 - near);
  _cd.x = s * (x + out); _cd.z *= kz;
  aim(up, leg, _cd.normalize().applyQuaternion(_wq).clone(), k);
}
function refineGait(r, k, root, fine) {
  const B = r.bones, f = r.female ? 1 : 0;
  if (B.Hips && r.restQ.Hips) { B.Hips.quaternion.slerp(r.restQ.Hips, 0.2 * k); B.Hips.updateMatrixWorld(true); }   // bớt chúi người, ưỡn hông
  for (const kq of ['LeftShoulder', 'RightShoulder']) if (B[kq] && r.restQ[kq]) B[kq].quaternion.slerp(r.restQ[kq], 0.6 * k);
  root.getWorldQuaternion(_wq); _cq.copy(_wq).invert();
  straighten(r, 0.85 * k, 0.035 + 0.14 * r.w.run);
  const walkK = k * r.w.walk / Math.max(1e-3, r.w.walk + r.w.run), curlK = Math.min(1, k * (r.w.walk + FINGER_RUN * r.w.run) / Math.max(1e-3, r.w.walk + r.w.run) / FINGER_RUN);
  // bàn tay khép hờ (clip đi/chạy để năm ngón duỗi thẳng, xoè): gập thêm từng đốt ngón; chạy khép nhiều hơn đi. Đặt một lần ở applyCurl.
  r.curlAmt += curlK * FINGER_RUN;
  for (const [S, s] of [['Left', 1], ['Right', -1]]) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand'];
    if (up && leg) trackLeg(r, S, s, up, leg, B[S + 'Foot'], B[S + 'ToeBase'], root, 1 - (1 - STRIDE) * r.w.walk, k);      // bước chân không chéo qua đường giữa, cũng không đi chữ bát
    if (arm && fore) tuck(arm, fore, s, 0.11 - f * 0.02, 0.4, 0.8 - f * 0.2, k);          // khuỷu tay khép vào sườn
    if (fore && hand) { tuck(fore, hand, s, 0.03, 0.5, 0.9 - f * 0.15, k); if (arm && walkK > 0.01) flexElbow(arm, fore, hand, root, walkK); palmTo(r, S, s, PALM, 0.8 * k); if (r.restQ[S + 'Hand']) { hand.quaternion.slerp(r.restQ[S + 'Hand'], 0.6 * k); } }
    if (fine && arm && fore && hand) hingeElbow(r, S, arm, fore, hand, k);
  }
}

const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _T = new THREE.Vector3(), _ax = new THREE.Vector3(), _pole = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fp = new THREE.Quaternion();
/**
 * Bàn chân không được chìm dưới nền khi đi/chạy (nền = cao độ gốc nhân vật). Clip đi/chạy sau khi chuyển sang bộ xương này hay chúc mũi chân
 * xuống 1–2 cm và lật nghiêng bàn chân lúc đang đặt bẹt → gỡ độ lật khi bàn chân ở trên nền; mũi chân thấp hơn mức nghỉ thì ngửa bàn chân quanh
 * cổ chân cho mũi về đúng mức nghỉ.
 * Trả về quãng (mét thế giới) còn phải nâng cổ chân để cổ chân, gót và mũi chân đều không thấp hơn mức nghỉ — liftHips giải lại chân theo đó.
 * k = mức áp (0..1).
 */
function plantFoot(r, S, foot, toe, y0, k, dToe = 0) {
  if (r.footY === undefined) return 0;
  const sc = r.g.scale.y || 1, yT = y0 + dToe; let low = 0;      // yT: mặt nền dưới mũi chân (trên dốc/cầu thang cao hoặc thấp hơn nền dưới cổ chân dToe mét)
  foot.getWorldPosition(_a); if (toe) toe.getWorldPosition(_b);      // dựng ma trận của cả chuỗi chân một lần; từ đây trong hàm chỉ đọc thẳng (posNow/quatNow)
  if (toe && r.toeY !== undefined && Math.min((_a.y - y0) / sc - r.footY, (_b.y - yT) / sc - r.toeY) > LEG_NEAR[1] + HEEL_BACK) return 0;      // bàn chân đang vung cao: không có gì để ép (gót thấp hơn cổ chân nhiều nhất chừng HEEL_BACK)
  if (toe && r.toeY !== undefined && r.footLat[S]) {      // bàn chân đang ở trên nền mà lật nghiêng (mép trong/ngoài cắm xuống đất): xoay quanh trục dọc bàn chân cho đế nằm ngang lại
    const e = Math.min((_a.y - y0) / sc - r.footY, (_b.y - yT) / sc - r.toeY), w = k * (1 - THREE.MathUtils.smoothstep(e, LEG_NEAR[0], LEG_NEAR[1]));
    if (w > 0.01) {
      quatNow(foot, _fq); _T.copy(r.footLat[S]).applyQuaternion(_fq); _ax.subVectors(_b, _a).normalize(); _K.crossVectors(_ax, _T);
      _tq.setFromAxisAngle(_ax, THREE.MathUtils.clamp(Math.atan2(-_T.y, _K.y), -ROLL_MAX, ROLL_MAX) * w); quatNow(foot.parent, _fp);
      foot.quaternion.copy(_fp.invert().multiply(_tq.multiply(_fq))); foot.updateMatrixWorld(true);
    }
  }
  if (toe && r.toeY !== undefined) {
    const e = (posNow(toe, _b).y - yT) / sc - r.toeY;
    if (e < 0) { posNow(foot, _a); _b.y -= e * sc; aimNow(foot, toe, _g2.copy(_b).sub(_a).normalize(), k); low = Math.min(low, (posNow(toe, _b).y - yT) / sc - r.toeY); }
  }
  if (toe && r.toeY !== undefined && r.toeUp[S] && Math.abs(dToe) < 0.015) {      // mũi chân đang ở trên nền (phẳng): đốt ngón chân nằm bẹt như lúc nghỉ (clip để ngón vểnh ~10° → phần đế ngay sau khớp ngón bị ấn xuống đất)
    const w = k * (1 - THREE.MathUtils.smoothstep((posNow(toe, _b).y - yT) / sc - r.toeY, LEG_NEAR[0], LEG_NEAR[1]));
    if (w > 0.01) { quatNow(toe, _fq); _tq.setFromUnitVectors(_T.copy(r.toeUp[S]).applyQuaternion(_fq).normalize(), _K.set(0, 1, 0)); quatNow(toe.parent, _fp); toe.quaternion.slerp(_fp.invert().multiply(_tq.multiply(_fq)), w); toe.updateMatrixWorld(true); }
  }
  low = Math.min(low, (posNow(foot, _a).y - y0) / sc - r.footY);
  if (r.heel[S]) low = Math.min(low, (_b.copy(r.heel[S]).applyMatrix4(foot.matrixWorld).y - y0) / sc);
  return -low * sc * k;
}
/**
 * Clip đi gốc luôn khuỵu gối (gối duỗi tối đa ~158°). Nâng hông lên `lift` (mét trong thế giới) rồi giải lại hai đốt chân (IK giải tích)
 * sao cho bàn chân vẫn ở đúng chỗ cũ → chân trụ duỗi gần thẳng, dáng đi cao và nhẹ hơn.
 * plant > 0: kèm ép bàn chân không chìm dưới nền (plantFoot), mức 0..1.
 */
function liftHips(r, lift, root, plant = 0) {
  const B = r.bones; if (!B.Hips || (lift < 1e-4 && !(plant > 0))) return;
  const legs = [], y0 = plant > 0 ? root.getWorldPosition(_H).y : 0; let low = 0;
  for (const S of ['Left', 'Right']) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], foot = B[S + 'Foot']; if (!up || !leg || !foot) return;
    // r.groundAt (chỉ người chơi có, player.js gắn): cao độ mặt nền thật dưới một điểm. Trên cầu thang/dốc, nền dưới bàn chân trước cao hơn nền dưới gốc nhân vật tới
    // 15–20 cm, dưới bàn chân sau thấp hơn chừng ấy → dời từng bàn chân theo nền của nó (shift), mũi chân theo nền dưới mũi (dToe), hông hạ theo bàn chân thấp
    let shift = 0, dToe = 0;
    if (plant > 0 && r.groundAt) {
      const toe = B[S + 'ToeBase'], gA = r.groundAt(foot.getWorldPosition(_g1)), gT = toe ? r.groundAt(toe.getWorldPosition(_g2)) : null;
      const reach = r.stepReach || STEP_REACH;      // r.stepReach: người đi theo chỉ bám bậc/vỉa hè thấp (≤ 0,2 m) — chân họ có lúc lọt vào mép ghế đá, bồn cây (đường đi không tránh hết) thì không được "trèo" lên đó
      if (gA !== null && Math.abs(gA - y0) < reach) shift = (gA - y0) * plant; if (gT !== null && Math.abs(gT - y0) < reach) dToe = (gT - y0) * plant - shift;
      if (Math.abs(shift) < 0.004) shift = 0; if (Math.abs(dToe) < 0.004) dToe = 0; if (shift < low) low = shift;
    }
    const raise = plant > 0 ? plantFoot(r, S, foot, B[S + 'ToeBase'], y0, plant, dToe) : 0;      // có thể xoay bàn chân → lấy vị trí/hướng bàn chân sau dòng này
    const T = foot.getWorldPosition(new THREE.Vector3()); T.y += raise + shift;
    legs.push({ up, leg, foot, T, raise: raise + Math.abs(shift), fq: foot.getWorldQuaternion(new THREE.Quaternion()) });
  }
  lift += low * HIP_FOLLOW;      // bàn chân thấp nhất nằm dưới mặt phẳng của gốc: hạ hông theo một phần để chân đó với tới
  if (Math.abs(lift) >= 1e-4) { B.Hips.position.y += lift / (r.g.scale.y || 1); B.Hips.updateMatrixWorld(true); }
  // giải lại cả chân không cần nâng nếu nó duỗi quá 93 % chiều dài: quá 99,7 % thì gập gối nhẹ ra trước → hết gối gập ngược, bớt cú bật gối lúc nhấc chân của clip đi
  // (chỉ giải những khung có nâng thì gối nhấp nháy giữa hai vị trí)
  for (const L of legs) legIK(r, L.up, L.leg, L.foot, L.T, L.fq, root, Math.abs(lift) < 1e-4 && L.raise < 1e-5);
}
/**
 * IK giải tích hai đốt: đặt cổ chân tới T (thế giới), bàn chân giữ hướng fq; lazy = chân đang cong rõ thì coi như đã đúng chỗ, khỏi tính.
 * soft: đích càng gần chỗ cổ chân đang đứng thì càng giữ nguyên vị trí gối sẵn có (đích trùng chỗ cũ = không đổi gì) — dùng cho neo chân lúc đứng/tạo dáng, nơi
 * việc gập gối nhẹ ra trước của lời giải đầy đủ sẽ làm lệch dáng đứng thẳng và làm gối bật khi bật/tắt IK.
 */
function legIK(r, up, leg, foot, T, fq, root, lazy, soft, kneeFwd = 0) {      // kneeFwd (m): kéo thêm hướng gối ra trước mặt — dùng khi khuỵu gối từ thế chân gần thẳng (hướng gập cũ chỉ là nhiễu → gối bè ra hai bên)
  const L = { up, leg, foot, T, fq };
  {
    L.up.getWorldPosition(_H); L.leg.getWorldPosition(_K); _T.copy(L.T);
    const l1 = _K.distanceTo(_H), l2 = L.foot.getWorldPosition(_b).distanceTo(_K);
    _ax.subVectors(_T, _H); const reach = _ax.length() / (l1 + l2), d = Math.min(_ax.length(), (l1 + l2) * KNEE_REACH[2]); _ax.normalize();
    if (lazy && reach < KNEE_REACH[0]) return;      // không nâng, gối đang cong rõ: lời giải trùng tư thế sẵn có, khỏi tính
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _pole.subVectors(_K, _H); _pole.addScaledVector(_ax, -_pole.dot(_ax));                 // gối giữ hướng gập cũ
    // chân gần duỗi thẳng thì hướng gập cũ chỉ còn là nhiễu (gối có thể bật ngược ra sau): pha thêm hướng trước mặt, gối cong rõ thì gần như không đổi
    root.getWorldDirection(_f); _f.addScaledVector(_ax, -_f.dot(_ax)).normalize();      // hướng trước mặt, vuông góc trục hông → cổ chân
    // gối không bao giờ gập ra sau: khi cổ chân bị dời ra trước/lên cao (bậc thang), vị trí gối cũ có thể nằm sau trục mới → thay phần chĩa ra sau bằng đúng chừng ấy chĩa ra
    // trước (chỉ bỏ đi thì còn lại phần lệch ngang, gối bẻ sang bên)
    { const back = _pole.dot(_f); if (back < 0) _pole.addScaledVector(_f, -2 * back); }
    _pole.addScaledVector(_f, kneeFwd + KNEE_FWD * (r.g.scale.y || 1) * Math.max(soft ? 0.35 : 0, THREE.MathUtils.smoothstep(reach, KNEE_REACH[0], KNEE_REACH[1]))); if (_pole.lengthSq() < 1e-8) _pole.copy(_f); _pole.normalize();
    _K.copy(_H).addScaledVector(_ax, a).addScaledVector(_pole, h);
    if (soft) _K.lerp(posNow(L.leg, _g1), 1 - THREE.MathUtils.smoothstep(_b.distanceTo(L.T), 0.003, 0.09));      // _b = cổ chân hiện tại
    aimNow(L.up, L.leg, _g2.subVectors(_K, _H).normalize(), 1);      // ma trận chân đang mới: vừa getWorldPosition ở trên, aimNow tự cập nhật phần dưới nó
    posNow(L.leg, _K); aimNow(L.leg, L.foot, _g2.subVectors(L.T, _K).normalize(), 1);
    // bàn chân giữ nguyên hướng trong thế giới
    quatNow(L.foot.parent, _fp); L.foot.quaternion.copy(_fp.invert().multiply(L.fq)); L.foot.updateMatrixWorld(true);
  }
}

const UNEVEN_MAX = 0.22;      // m: lệch quá mức này (mặt ghế băng, bồn cây ngay cạnh chân) thì không phải bậc/vỉa hè để đặt chân lên
const UNEVEN = 0.012;      // m: nền dưới cổ chân lệch nền dưới gốc quá mức này mới coi là đứng trên chỗ không phẳng
/** có bàn chân nào đang đứng trên nền cao/thấp hơn nền dưới gốc không (r.groundAt: dò nền thật) */
function unevenFeet(r, root) {
  const B = r.bones, y0 = root.getWorldPosition(_g2).y;
  for (const S of ['Left', 'Right']) { const foot = B[S + 'Foot']; if (!foot) continue; const g = r.groundAt(foot.getWorldPosition(_g1)); if (g !== null && Math.abs(g - y0) > UNEVEN && Math.abs(g - y0) < UNEVEN_MAX) return true; }
  return false;
}
const SETTLE = [0.04, 0.08];      // bàn chân hở nền dưới 4 cm thì hạ hẳn xuống, trên 8 cm coi là nhấc chân có chủ ý, để nguyên
const _sf = new THREE.Vector3();
/**
 * Dáng ngồi và động tác ngồi xuống/đứng dậy: groundFeet chỉ dịch hông cho bàn chân THẤP hơn chạm nền, bàn chân kia thường hở 3–4 cm (clip chuyển sang bộ xương
 * này không giữ đúng cao độ từng chân). Hạ riêng bàn chân còn hở xuống nền bằng IK chân; chân đang nhấc cao có chủ ý thì không đụng. k = mức áp.
 */
function settleFeet(r, root, k) {
  const B = r.bones, sc = r.g.scale.y || 1; if (r.footY === undefined) return; const y0 = root.getWorldPosition(_sf).y;
  for (const S of ['Left', 'Right']) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], foot = B[S + 'Foot'], toe = B[S + 'ToeBase']; if (!up || !leg || !foot) continue;
    foot.getWorldPosition(_sf); let e = (_sf.y - y0) / sc - r.footY; if (toe && r.toeY !== undefined) e = Math.min(e, (toe.getWorldPosition(_an).y - y0) / sc - r.toeY);
    const drop = e > 0.003 ? e * (1 - THREE.MathUtils.smoothstep(e, SETTLE[0], SETTLE[1])) * k * sc : 0; if (drop < 0.002) continue;
    _sf.y -= drop; legIK(r, up, leg, foot, _sf, foot.getWorldQuaternion(_fqa), root, false);
  }
}
// ----- neo bàn chân lúc chuyển dáng -----
// ANCHOR_V: bàn chân đang đặt trên nền chỉ được xê ngang tối đa chừng này (m/s) theo tư thế mới; lệch quá ANCHOR_LAG (m) thì chân nhấc lên (cao bằng ANCHOR_LIFT lần
// độ lệch, tối đa ANCHOR_UP) và đuổi theo nhanh dần (thêm ANCHOR_K m/s cho mỗi mét lệch) — thành một bước chân thật thay vì lết trên nền. ANCHOR_SNAP: lệch quá mức
// này là bị dịch chuyển tức thời, bỏ neo. ANCHOR_GAIT: từ mức trọng số đi/chạy này trở lên thì thôi neo dần (clip đi/chạy tự giữ chân trụ).
const ANCHOR_V = 0.4, ANCHOR_LAG = 0.025, ANCHOR_K = 14, ANCHOR_LIFT = 1.3, ANCHOR_UP = 0.06, ANCHOR_SNAP = 0.7, ANCHOR_GAIT = [0.75, 1], ANCHOR_ACC = 45, ANCHOR_OUT = 22;      // ANCHOR_OUT: nhịp tan (1/s) của phần lệch còn lại khi thả neo      // ANCHOR_ACC: gia tốc tối đa của bàn chân đang đuổi theo (m/s²)
const _an = new THREE.Vector3(), _fqa = new THREE.Quaternion();
/**
 * Khi dáng đổi nhanh (đang đi thì dừng: relaxPose kéo hai chân về dưới thân trong ~0,1 s; bắt đầu đi; ngồi xuống/đứng dậy; đổi dáng chụp ảnh; xoay người tại chỗ)
 * bàn chân đang đặt trên nền bị kéo lết 2–5 m/s. Giữ lại vị trí thế giới của từng cổ chân (r.anchor) và chỉ cho nó đuổi theo tư thế mới với tốc độ có hạn; chân nào
 * lệch nhiều hơn thì nhấc lên bước trước, chân kia đứng làm trụ. Gọi sau khi mọi bước chỉnh chân khác đã xong. w = mức neo (0 = đang đi/chạy đều, không neo).
 */
function anchorFeet(r, dt, root, w) {
  const B = r.bones, A = r.anchor, sc = r.g.scale.y || 1; if (!B.LeftFoot || !B.RightFoot || !B.LeftUpLeg || !B.LeftLeg || !B.RightUpLeg || !B.RightLeg || r.footY === undefined) return;
  const y0 = root.getWorldPosition(_an).y; let step = null, worst = ANCHOR_LAG, busy = false;
  for (const S of ['Left', 'Right']) {
    const a = A[S], foot = B[S + 'Foot'], toe = B[S + 'ToeBase']; foot.getWorldPosition(a.t);
    let e = (a.t.y - y0) / sc - r.footY; if (toe && r.toeY !== undefined) e = Math.min(e, (toe.getWorldPosition(_an).y - y0) / sc - r.toeY);
    const near = (1 - THREE.MathUtils.smoothstep(e, LEG_NEAR[0], LEG_NEAR[1])) * w; a.e = e; a.ik = false;      // near = 1: tư thế mới muốn bàn chân này đặt trên nền (và đang trong lúc chuyển dáng)
    if (!a.on) { a.p.copy(a.t); a.on = true; a.rel = false; a.lift = 0; a.v = 0; a.near = near; a.lag = 0; continue; }
    if (near < 0.01 || a.rel) {
      // thả neo: hết lý do neo (bàn chân đang vung, hoặc đã vào nhịp đi/chạy đều) mà còn lệch thì phần lệch tan dần, tính theo chính bàn chân đang chuyển động — không nhảy về
      if (!a.rel) { a.rel = true; a.d.subVectors(a.p, a.t); }
      a.d.multiplyScalar(Math.exp(-dt * ANCHOR_OUT)); a.near = 0; a.lag = 0; a.v = 0;
      if (a.d.lengthSq() < 1.6e-5 * sc * sc) { a.rel = false; a.p.copy(a.t); a.lift = 0; } else { a.p.addVectors(a.t, a.d); a.lift = Math.max(0, a.d.y); a.ik = true; busy = true; }
      continue;
    }
    a.near = near; a.lag = Math.hypot(a.t.x - a.p.x, a.t.z - a.p.z);
    if (a.lag > ANCHOR_SNAP * sc) { a.p.copy(a.t); a.lag = 0; a.lift = 0; a.v = 0; continue; }      // bị dịch chuyển tức thời: bỏ neo
    if (a.lag > worst) { worst = a.lag; step = S; }
  }
  // chân đang bước thì bước cho xong (tới khi gần hết lệch) rồi mới tới lượt chân kia: chọn lại mỗi khung thì hai chân thay nhau nhấc từng khung, gối rung
  { const c = A.step && A[A.step]; if (c && c.near >= 0.01 && c.lag > ANCHOR_LAG * 0.5) step = A.step; A.step = step; }
  for (const S of ['Left', 'Right']) {
    const a = A[S], o = A[S === 'Left' ? 'Right' : 'Left'];
    if (a.near >= 0.01) {
      const prop = o.e < 0.02 && o.lift < 0.005 * sc;      // chân kia đang đặt trên nền làm trụ thì chân này mới được nhấc (không thì cả hai cùng hẫng)
      const stepping = (S === step || a.lag > 0.25 * sc) && prop, want = Math.min(ANCHOR_VMAX, ANCHOR_V + (stepping ? ANCHOR_K * Math.max(0, a.lag - ANCHOR_LAG) * THREE.MathUtils.smoothstep(a.lift / sc, 0.012, 0.03) : 0)) * sc / a.near;      // nhấc lên được 3 cm rồi mới đuổi nhanh: chưa nhấc mà đã lao đi là lết trên nền
      a.v = Math.min(want, a.v + ANCHOR_ACC * sc * dt);      // tốc độ đuổi theo tăng dần (giới hạn gia tốc) để bàn chân không giật khi bắt đầu bước
      const go = Math.min(1, a.lag > 1e-6 ? a.v * dt / a.lag : 1); if (go >= 1) a.v = 0;
      a.p.x += (a.t.x - a.p.x) * go; a.p.z += (a.t.z - a.p.z) * go; const left = a.lag * (1 - go);
      const lift = stepping ? Math.min(ANCHOR_UP, left * ANCHOR_LIFT) * a.near * sc : 0; a.lift += (lift - a.lift) * Math.min(1, dt * (lift > a.lift ? 24 : prop ? 18 : 40)); a.p.y = a.t.y + a.lift;
      a.ik = left >= 1e-4 || a.lift >= 1e-4;      // đã trùng tư thế mới thì không phải sửa gì
    }
    if (a.ik) legIK(r, B[S + 'UpLeg'], B[S + 'Leg'], B[S + 'Foot'], a.p, B[S + 'Foot'].getWorldQuaternion(_fqa), root, false, true);
  }
  A.busy = busy;
}
const _le = new THREE.Euler(0, 0, 0, 'YXZ'), _li = new THREE.Quaternion();
/** xoay đầu nhìn về điểm r.lookPos (toạ độ thế giới), giới hạn ±57° ngang và ±26° dọc; gọi khi _wq đã là hướng nhân vật */
function lookHead(r, k) {
  const Hd = r.bones.Head; if (!Hd || !r.headRel) return;
  Hd.getWorldPosition(_a); _b.copy(r.lookPos).sub(_a).applyQuaternion(_li.copy(_wq).invert());
  const flat = Math.hypot(_b.x, _b.z); if (flat < 0.05) return;                      // điểm nhìn ngay trên/dưới đầu: không có hướng ngang
  k *= THREE.MathUtils.smoothstep(_b.z / flat, -0.75, -0.25);                        // càng ra sau lưng càng thôi nhìn theo
  if (k < 0.004) return;
  const yaw = THREE.MathUtils.clamp(Math.atan2(_b.x, _b.z), -1, 1), pitch = THREE.MathUtils.clamp(Math.atan2(_b.y, Math.hypot(_b.x, _b.z)), -0.45, 0.45);
  _fq.copy(_wq).multiply(_tq.setFromEuler(_le.set(-pitch, yaw, 0))).multiply(r.headRel); Hd.parent.getWorldQuaternion(_fp);
  Hd.quaternion.slerp(_fp.invert().multiply(_fq), k); Hd.updateMatrixWorld(true);
}
// đứng dậy: clip kết thúc ở thế chân trước chân sau; khép chân về dáng đứng dần trong quãng này của clip (phần của độ dài clip), đúng lúc chân sau đang bước,
// để hết clip là vào dáng đứng luôn. Ép ngay từ đầu thì chân đang ngồi bị giật về dưới thân; không ép thì hết clip chân mới giật về.
const STAND_LEGS = [0.55, 0.95];
/** trộn dáng chụp ảnh hoặc clip phụ: r.pose = tên clip ('pose_peace'…, hoặc clip trong anims.glb như 'talk', 'sit_idle') hoặc null; nữ ưu tiên biến thể _f; trả về tổng trọng số dáng (0..1) */
function blendPoses(r, dt) {
  let want = null;
  if (r.pose) { const nm0 = r.flaps.length && r.pose === 'pose_squat' ? 'pose_grace' : r.pose, clip = (r.female && r.clips[nm0 + '_f']) || r.clips[nm0]; if (clip) { want = clip.name; if (!r.poses.has(want)) { const a = r.mixer.clipAction(clip); if (ONE_SHOT.test(want)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } a.setEffectiveWeight(0); a.play(); r.poses.set(want, { a, w: 0 }); } } }
  // động tác một lượt được gọi lại khi lượt trước còn đang mờ dần (ngồi – đứng – ngồi liên tiếp): phát lại từ khung đầu
  if (want !== r.poseWant) { r.poseWant = want; if (want && ONE_SHOT.test(want)) r.poses.get(want).a.reset(); }
  const k = 1 - Math.exp(-dt * 6); let sum = 0;
  for (const [nm, p] of r.poses) {
    p.w += ((nm === want ? 1 : 0) - p.w) * k;
    if (nm !== want && p.w < 0.004) { p.a.stop(); r.poses.delete(nm); continue; }
    sum += p.w;
  }
  const norm = sum > 1 ? 1 / sum : 1; let legs = 0; for (const [nm, p] of r.poses) { p.a.setEffectiveWeight(p.w * norm); legs += p.w * norm * (/^stand_up/.test(nm) ? THREE.MathUtils.smoothstep(p.a.time / p.a.getClip().duration, STAND_LEGS[0], STAND_LEGS[1]) : /squat/.test(nm) || /^sit_/.test(nm) || /grace/.test(nm) && r.female ? 0 : 1); }
  r.poseLegs = legs;                                // phần trọng số thuộc các dáng đứng cần khép chân
  return Math.min(1, sum);
}

const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), mix3 = (a, b, k) => _g1.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
const GEST = {      // hướng cánh tay / cẳng tay phải trong hệ của thân người (x: sang trái, y: lên, z: ra trước) ở hai đầu mỗi cử chỉ
  throw: { a0: [-0.3, 0.6, 0.15], a1: [-0.1, -0.1, 1], f0: [-0.1, 0.95, -0.2], f1: [-0.05, -0.25, 1] },
  drum: { a0: [-0.3, 0.35, 0.75], a1: [-0.22, -0.4, 0.85], f0: [-0.05, 0.95, 0.3], f1: [-0.02, -0.35, 0.95] },
};
/**
 * Cử chỉ tay ngắn đè lên hoạt hoạ đang chạy: g = { type, t, dur, at? } (t do human.js cộng dần).
 *   turn: quay dây · drib: nhồi bóng (g.ph, kéo dài tới khi bỏ) · cheer/oops: mừng/tiếc · wave: giơ tay phải vẫy · reach: với tay phải tới điểm g.at (toạ độ thế giới) · throw: vung tay ném · drum: gõ ba nhịp · shake: hai tay đẩy rung
 */
function gesture(r, g, root) {
  const B = r.bones, u = g.t / g.dur, env = Math.min(1, g.type === 'throw' ? 1 : u * 7, (1 - u) * 5); root.getWorldQuaternion(_wq);
  if (g.type === 'turn') { const c = Math.cos(g.ph || 0), s = Math.sin(g.ph || 0); aim(B.RightArm, B.RightForeArm, dirW(-0.3, -0.5 + c * 0.22, 0.8), 1); aim(B.RightForeArm, B.RightHand, dirW(-0.12 + s * 0.2, -0.05 + c * 0.4, 0.9), 1); return; }      // quay dây: cổ tay vẽ vòng tròn, g.ph = góc dây
  if (g.type === 'wave' && r.pose === 'pose_wave') {      // đã có dáng vẫy (đứng yên): không giơ thêm tay, chỉ lắc cẳng tay nào đang giơ cao
    const side = dirW(1, 0, 0), s = Math.sin(g.t * 11) * 0.38 * env;
    for (const S of ['Left', 'Right']) { const arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand']; if (!arm || !fore || !hand) continue; hand.getWorldPosition(_g1); arm.getWorldPosition(_g2); if (_g1.y < _g2.y + 0.08) continue; fore.getWorldPosition(_g2); aim(fore, hand, _g1.sub(_g2).normalize().addScaledVector(side, s).normalize().clone(), 1); }
    return;
  }
  if (g.type === 'wave') { const s = Math.sin(g.t * 11); aim(B.RightArm, B.RightForeArm, dirW(-0.6, 0.45, 0.3), env); aim(B.RightForeArm, B.RightHand, dirW(-0.1 + s * 0.42, 1, 0.22), env); return; }
  if (g.type === 'reach' && g.at) {
    const d = _g2.copy(g.at).sub(B.RightArm.getWorldPosition(_g1)).normalize().clone();
    aim(B.RightArm, B.RightForeArm, d, env); aim(B.RightForeArm, B.RightHand, d, env); return;
  }
  if (g.type === 'cheer' || g.type === 'oops') {      // mừng: hai tay giơ cao · tiếc: hai tay ôm đầu
    const up = g.type === 'cheer';
    for (const [S, s] of [['Left', 1], ['Right', -1]]) { const arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand']; if (!arm || !fore || !hand) continue; aim(arm, fore, up ? dirW(s * 0.45, 0.85, 0.15) : dirW(s * 0.55, 0.5, 0.35), env); aim(fore, hand, up ? dirW(s * 0.2, 1, 0.1) : dirW(-s * 0.6, 0.62, -0.2), env); }
    return;
  }
  if (g.type === 'drib') { const c = Math.abs(Math.cos(g.ph || 0)); crouch(r, root, 0.045, ['Left', 'Right']); bend(B.Spine, 1, 0, 0, 0.2); armTo(r, 'Left', [0.45, -0.8, 0.2], [0.2, -0.7, 0.6], 0.8);
    if (g.at) {      // có vị trí bóng thật: bàn tay phải úp trên đỉnh bóng, theo bóng xuống tới ngang hông rồi chờ bóng nảy lên
      const R = g.r || 0.12, yMin = root.getWorldPosition(_hs).y + 0.72 * (r.g.scale.y || 1); _ht.copy(g.at); _ht.y = Math.max(g.at.y + R + 0.06, yMin);
      armIK(r, 'Right', around(_ht, 0, 0, -0.08, _sh), 1, [0.7, -0.25, -0.6]); palmTo(r, 'Right', -1, [0, -1, 0.15], 1);
      if (B.RightHand && r.restQ.RightHand) { B.RightHand.quaternion.slerp(r.restQ.RightHand, 0.8); B.RightHand.updateMatrixWorld(true); bend(B.RightHand, 1, 0, 0, 0.45 * (1 - c)); } return;
    }
    aim(B.RightArm, B.RightForeArm, dirW(-0.28, -0.8, 0.45), 1); aim(B.RightForeArm, B.RightHand, dirW(-0.05, -0.75 + c * 0.45, 0.8), 1); return; }      // nhồi bóng: bàn tay phải theo quả bóng lên xuống
  if (g.type === 'shake') {
    const push = Math.sin(g.t * 20) * 0.1;
    for (const [S, s] of [['Left', 1], ['Right', -1]]) { const arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand']; if (!arm || !fore || !hand) continue; aim(arm, fore, dirW(s * 0.22, 0.12 + push, 1), env); aim(fore, hand, dirW(-s * 0.1, 0.3 - push, 1), env); }
    return;
  }
  if (g.type === 'shoot') {      // thả bóng: từ thế lấy lực (tay trước trán, gối khuỵu) duỗi gối + duỗi tay ném lên trước, cổ tay gập theo bóng, giữ ~0,3 giây rồi hạ
    const S = THREE.MathUtils.smoothstep, x = Math.min(1, u / 0.11), e = 1 - (1 - x) * (1 - x), out = 1 - S(u, 0.4, 0.85);      // e: tay đẩy nhanh ngay từ khung đầu (đi cùng quả bóng) rồi chậm dần
    crouch(r, root, 0.08 * (1 - S(u, 0, 0.18)), ['Left', 'Right']);
    if (r.shotSet && B.RightArm) {      // bắt đầu từ đúng thế đang đỡ bóng (actAim ghi lại): điểm "tâm bóng" đi từ chỗ thả lên trước–trên vai phải, cổ tay từ ngửa sang gập theo bóng
      root.localToWorld(_ht.copy(r.shotFrom)); B.RightArm.getWorldPosition(_hs).add(_it.set(-0.04, 0.58, 0.46).multiplyScalar(r.g.scale.y || 1).applyQuaternion(_wq)); _ht.lerp(_hs, e);
      shotHands(r, _ht, r.shotR, out, out * (1 - S(u, 0.1, 0.4)), -1.0 + 1.9 * S(u, 0.03, 0.22)); bend(B.Spine, 1, 0, 0, 0.07 * (1 - e)); return;      // thân còn hơi chúi trước như lúc lấy lực rồi dựng thẳng (không ngả ra sau)
    }
    armTo(r, 'Right', lerp3([0.3, 0.12, 0.92], [0.1, 0.88, 0.48], e), lerp3([-0.22, 0.95, 0.12], [0.03, 0.85, 0.52], e), out); armTo(r, 'Left', lerp3([0.42, 0.05, 0.88], [0.4, -0.2, 0.75], e), lerp3([-0.5, 0.82, 0.22], [0.1, -0.5, 0.8], e), out * (1 - S(u, 0.12, 0.45)));
    bend(B.RightHand, 1, 0, 0, 1.0 * e * out); bend(B.Spine, 1, 0, 0, -0.05 * e * out); return;
  }
  if (g.type === 'plane') {      // phi máy bay giấy: kéo tay ra sau tai (vai phải xoay ra sau) → đẩy thẳng ra trước ngang tầm mắt, thân xoay theo; máy bay rời tay ở PLANE_RELEASE
    const S = THREE.MathUtils.smoothstep, back = S(u, 0, 0.36), go = S(u, 0.42, 0.6), out = 1 - S(u, 0.78, 1);
    bend(B.Spine, 0, 1, 0, (-0.34 * back + 0.6 * go) * out); bend(B.Spine, 1, 0, 0, 0.07 * go * out);
    armTo(r, 'Right', PLANE_ARM[0], PLANE_ARM[1], 1 - go); armTo(r, 'Right', lerp3(PLANE_BACK[0], PLANE_FWD[0], go), lerp3(PLANE_BACK[1], PLANE_FWD[1], go), Math.max(back, go) * out);
    armTo(r, 'Left', [0.3, -0.75, 0.45], [-0.05, -0.2, 0.95], back * (1 - go) * 0.7); return;
  }
  const G0 = GEST[g.type]; if (!G0) return;
  if (g.type === 'throw') bend(B.Spine, 0, 1, 0, -0.3 + 0.65 * THREE.MathUtils.smoothstep(u, 0.08, 0.5) - 0.35 * THREE.MathUtils.smoothstep(u, 0.7, 1));      // ném: vai phải ra sau rồi xoay thân theo tay
  const k = g.type === 'drum' ? 0.5 - 0.5 * Math.cos(u * 3 * Math.PI * 2 + 0.6) : THREE.MathUtils.smoothstep(u, 0.08, 0.5);      // trống: ba nhịp lên xuống; ném: lấy đà rồi vung
  aim(B.RightArm, B.RightForeArm, dirW(...mix3(G0.a0, G0.a1, k).toArray()), env); aim(B.RightForeArm, B.RightHand, dirW(...mix3(G0.f0, G0.f1, k).toArray()), env);
}

/* ===== động tác thủ tục đè lên hoạt hoạ: nhảy, đá cầu, ném rổ, cầm vật =====
 * Hướng viết trong hệ nhân vật theo bộ ba [ra ngoài (phía của chính tay/chân đó), lên, ra trước]. */
const _bq = new THREE.Quaternion(), _bax = new THREE.Vector3(), _cp = [new THREE.Vector3(), new THREE.Vector3()], _cq2 = [new THREE.Quaternion(), new THREE.Quaternion()];
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** xoay thêm một xương quanh trục (hệ nhân vật: x sang trái, y lên, z ra trước; quanh +x góc dương = cúi ra trước) — gọi khi _wq đã là hướng nhân vật */
function bend(bone, ax, ay, az, ang, lazy) {
  if (!bone || Math.abs(ang) < 1e-4) return;
  _bax.set(ax, ay, az).applyQuaternion(_wq); _bq.setFromAxisAngle(_bax, ang); bone.parent.getWorldQuaternion(_pq);
  const world = bone.getWorldQuaternion(_q).premultiply(_bq); bone.quaternion.copy(_pq.invert().multiply(world)); if (!lazy) bone.updateMatrixWorld(true);
}
function armTo(r, S, a, f, k) { const B = r.bones, s = S === 'Left' ? 1 : -1, arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand']; if (!arm || !fore || !hand || k < 0.004) return; aim(arm, fore, dirW(s * a[0], a[1], a[2]), k); aim(fore, hand, dirW(s * f[0], f[1], f[2]), k); }
function legTo(r, S, t, sh, k) { const B = r.bones, s = S === 'Left' ? 1 : -1, up = B[S + 'UpLeg'], leg = B[S + 'Leg'], foot = B[S + 'Foot']; if (!up || !leg || !foot || k < 0.004) return; aim(up, leg, dirW(s * t[0], t[1], t[2]), k); aim(leg, foot, dirW(s * sh[0], sh[1], sh[2]), k); }
/** hạ hông drop (m của mô hình) mà các bàn chân nêu trong sides giữ nguyên chỗ (IK) → gối khuỵu: tiếp đất, chân trụ khi đá, lấy lực ném */
function crouch(r, root, drop, sides) {
  const B = r.bones; if (!B.Hips || !(drop > 0.002)) return; let n = 0;
  for (const S of sides) { const foot = B[S + 'Foot']; if (!foot || !B[S + 'UpLeg'] || !B[S + 'Leg']) continue; foot.getWorldPosition(_cp[n]); foot.getWorldQuaternion(_cq2[n]); n++; }
  B.Hips.position.y -= drop; B.Hips.updateMatrixWorld(true); n = 0;
  for (const S of sides) { const foot = B[S + 'Foot']; if (!foot || !B[S + 'UpLeg'] || !B[S + 'Leg']) continue; legIK(r, B[S + 'UpLeg'], B[S + 'Leg'], foot, _cp[n], _cq2[n], root, false, false, 0.12); n++; }
}
const _ia = new THREE.Vector3(), _ib = new THREE.Vector3(), _ic = new THREE.Vector3(), _ie = new THREE.Vector3(), _it = new THREE.Vector3();
/**
 * IK giải tích hai đốt cho tay: đưa CỔ TAY tới điểm T (thế giới), mức k; khuỷu chĩa về phía pole ([ra ngoài, lên, ra trước] của chính tay đó).
 * Dùng khi bàn tay phải chạm một vật có vị trí thật (quả bóng đang cầm, đang nhồi) — đặt hướng từng đoạn tay bằng số cố định thì tay không bao giờ trúng vật.
 * Gọi khi _wq đã là hướng nhân vật. T ngoài tầm với thì tay duỗi gần thẳng về phía T.
 */
function armIK(r, S, T, k, pole) {
  const B = r.bones, s = S === 'Left' ? 1 : -1, arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand']; if (!arm || !fore || !hand || k < 0.004) return;
  arm.getWorldPosition(_ia); fore.getWorldPosition(_ib); hand.getWorldPosition(_ic);
  const l1 = _ib.distanceTo(_ia), l2 = _ic.distanceTo(_ib); _ie.subVectors(T, _ia);
  const d = THREE.MathUtils.clamp(_ie.length(), Math.abs(l1 - l2) + 0.02, (l1 + l2) * 0.995); _ie.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _ic.set(s * pole[0], pole[1], pole[2]).applyQuaternion(_wq); _ic.addScaledVector(_ie, -_ic.dot(_ie)); if (_ic.lengthSq() < 1e-8) return; _ic.normalize();
  _ib.copy(_ia).addScaledVector(_ie, a).addScaledVector(_ic, h); _it.copy(_ia).addScaledVector(_ie, d);      // _ib: khuỷu, _it: cổ tay (đã kẹp trong tầm với)
  aim(arm, fore, _ic.subVectors(_ib, _ia).normalize(), k);
  fore.getWorldPosition(_ib); aim(fore, hand, _ic.subVectors(_it, _ib).normalize(), k);
}
/** điểm (hệ nhân vật: x sang trái, y lên, z ra trước; mét) quanh một điểm thế giới → toạ độ thế giới, ghi vào out */
const around = (at, x, y, z, out) => out.set(x, y, z).applyQuaternion(_wq).add(at);
const _ht = new THREE.Vector3(), _hs = new THREE.Vector3();
const JUMP_AIR = 0.72, LAND_SECS = 0.34, LAND_DROP = 0.13, JUMP_DIP = [0.09, 0.07];      // JUMP_DIP: [giây, m] hông hạ nhanh rồi trả ngay sau khi bấm nhảy — chỉ phần hiển thị, vật lý không trễ;      // thời gian trên không của cú nhảy thường (43 khung); quãng khuỵu gối tiếp đất và độ hạ hông (m của mô hình)
const JUMP = {      // [ra ngoài, lên, ra trước] ở mức co chân/vung tay cao nhất
  standT: [0.09, -0.75, 0.72], standS: [0, -0.55, -0.9],                    // nhảy tại chỗ: hai gối co nhẹ
  leadT: [0.04, -0.7, 0.85], leadS: [0, -1, -0.15], trailT: [0.04, -1, -0.5], trailS: [0, -0.7, -0.9],      // đang chạy: chân trước – chân sau như một sải bước
  armLow: [0.42, -0.85, -0.05], foreLow: [0.1, -0.25, 0.95], armUp: [0.32, -0.7, 0.45], foreUp: [-0.08, 0.55, 0.8],      // tay: vung lên trước lúc bật, hạ ra hai bên giữ thăng bằng
  armBack: [0.2, -0.65, -0.7], foreBack: [0.05, -0.9, 0.1], armFwd: [0.2, -0.75, 0.5], foreFwd: [-0.1, 0.3, 0.9],
};
/**
 * Nhảy: bật (chân duỗi, tay vung lên trước) → trên không (gối co; đang chạy thì chân trước–sau, thân ngả trước) → tiếp đất (gối khuỵu hấp thụ rồi đứng lên).
 * Chỉ là dáng; vật lý nhảy không đổi. r.jumpKind = 'rope': nhảy dây — nhảy thấp chụm chân, tay để yên cho cử chỉ khác.
 */
function actJump(r, dt, air, speed, root) {
  if (air) { r.airT += dt; r.land = 0; r.airV = Math.max(r.airV, speed); } else { if (r.airT > 0.14) { r.land = 1; r.landK = (r.jumpKind === 'rope' ? 0.35 : 1) * Math.min(1, r.airT / 0.5); } r.airT = 0; r.airV = 0; }
  r.airK += ((air && r.airT > 0.03 ? 1 : 0) - r.airK) * (1 - Math.exp(-dt * 14));
  if (r.land > 0) r.land = Math.max(0, r.land - dt / LAND_SECS);
  const a = r.airK; if (a < 0.01 && r.land <= 0) return;
  root.getWorldQuaternion(_wq);
  if (air && r.airT < JUMP_DIP[0] && r.jumpKind !== 'rope' && r.bones.Hips) { r.bones.Hips.position.y -= JUMP_DIP[1] * Math.sin(Math.PI * r.airT / JUMP_DIP[0]); r.bones.Hips.updateMatrixWorld(true); }
  if (a >= 0.01) {
    const rope = r.jumpKind === 'rope', mv = rope ? 0 : THREE.MathUtils.smoothstep(r.airV, 0.8, 2.6), u = Math.min(1, r.airT / JUMP_AIR), J = JUMP;
    const tuck = Math.pow(Math.sin(Math.PI * u), 0.8) * (rope ? 0.3 : 1) * (r.airT > JUMP_AIR ? 0 : 1) + (r.airT > JUMP_AIR ? 0.25 : 0);      // rơi lâu hơn một cú nhảy (bước hụt bậc): chân duỗi chờ đất, gối hơi co
    const up = THREE.MathUtils.smoothstep(u, 0, 0.2) * (1 - THREE.MathUtils.smoothstep(u, 0.4, 0.85));
    const down = [0.05, -1, 0.02], lead = r.jumpLead || 'Left', trail = lead === 'Left' ? 'Right' : 'Left';
    legTo(r, lead, lerp3(down, lerp3(J.standT, J.leadT, mv), tuck), lerp3([0, -1, -0.03], lerp3(J.standS, J.leadS, mv), tuck), a);
    legTo(r, trail, lerp3(down, lerp3(J.standT, J.trailT, mv), tuck), lerp3([0, -1, -0.03], lerp3(J.standS, J.trailS, mv), tuck), a);
    if (!rope) {
      const sa = lerp3(J.armLow, J.armUp, up), sf = lerp3(J.foreLow, J.foreUp, up), k = a * 0.9;
      armTo(r, lead, lerp3(sa, J.armBack, mv), lerp3(sf, J.foreBack, mv), k); armTo(r, trail, lerp3(sa, J.armFwd, mv), lerp3(sf, J.foreFwd, mv), k);
      bend(r.bones.Spine, 1, 0, 0, a * (0.05 + 0.17 * mv - up * 0.07 * (1 - mv)));
    }
  }
  if (r.land > 0) {      // tiếp đất: hông hạ nhanh rồi lên chậm, thân hơi gập
    const x = 1 - r.land, c = Math.sin(Math.PI * Math.pow(x, 0.55)) * r.landK;
    crouch(r, root, LAND_DROP * c, ['Left', 'Right']); bend(r.bones.Spine, 1, 0, 0, 0.13 * c);
  }
}
const KICK_HIT = 0.15, KICK_WIND = 0.22, KICK_OUT = 0.42;      // giây: vung chân từ thế lấy đà tới lúc chạm · quãng lấy đà trước đó (chỉ có khi trò chơi báo trước) · thu chân sau chạm
export const KICK_LEAD = KICK_HIT + KICK_WIND;      // trò chơi bắt đầu cú đá sớm nhất chừng này giây trước lúc chân chạm (h.kickLead)
const KICKS = {      // chân phải; wT/wS: đùi/cẳng lúc lấy đà, hT/hS: lúc vung hết (sau chạm); pitch: thân ngả (âm = ra sau), roll: thân nghiêng (âm = về phía chân trụ); inside: chạm bằng má trong
  pass: { wT: [0.2, -1, -0.2], wS: [0.1, -0.8, -0.55], hT: [0.8, -0.5, 0.6], hS: [-0.9, -0.12, 0.42], pitch: -0.04, roll: -0.11, sink: 0.04, inside: true },      // má trong: gối mở ra ngoài, bàn chân nâng ngang trước–trong
  lob: { wT: [0.05, -1, -0.15], wS: [0, -0.75, -0.65], hT: [0.1, -0.6, 0.8], hS: [0, -0.22, 0.97], pitch: -0.07, roll: -0.04, sink: 0.03 },          // mu bàn chân tâng: đùi nâng, cẳng chân vung lên trước
  flick: { wT: [0.05, -1, -0.5], wS: [0, -0.45, -0.9], hT: [0.06, -0.12, 1], hS: [0, 0.4, 0.92], pitch: -0.17, roll: -0.05, sink: 0.02 },            // búng giật / đá cao: vung mạnh, thân ngả sau
  drive: { wT: [0.05, -1, -0.5], wS: [0, -0.5, -0.85], hT: [0.05, -0.65, 0.76], hS: [0, -0.35, 0.94], pitch: -0.08, roll: -0.05, sink: 0.035 },      // sút bóng (mặc định)
};
/** bàn chân (cổ chân hoặc mũi chân) đang thấp hơn mức nghỉ trên nền của gốc thì nâng cổ chân lên đúng chừng đó (IK), giữ hướng bàn chân — chặn cuối cho dáng chờ cầu và lúc lấy đà (chân vung ra sau chúc mũi xuống nền) */
function liftSunk(r, root, S) {
  const B = r.bones, foot = B[S + 'Foot'], toe = B[S + 'ToeBase']; if (!foot || !B[S + 'UpLeg'] || !B[S + 'Leg'] || r.footY === undefined) return;
  const sc = r.g.scale.y || 1, y0 = root.getWorldPosition(_hs).y; foot.getWorldPosition(_ht); let e = (_ht.y - y0) / sc - r.footY;
  if (toe && r.toeY !== undefined) e = Math.min(e, (toe.getWorldPosition(_hs).y - y0) / sc - r.toeY);
  if (e > -0.002) return; _ht.y -= e * sc; legIK(r, B[S + 'UpLeg'], B[S + 'Leg'], foot, _ht, foot.getWorldQuaternion(_fqa), root, false, false);
}
const READY_DROP = 0.085, READY_WIDE = 0.055, STEP_HZ = 1.7, STEP_UP = 0.032;      // dáng chờ cầu: hông hạ (m của mô hình); nhịp nhún đổi chân (lần/giây mỗi chân) và độ nhấc bàn chân (m)
/**
 * Đá: r.kick vọt lên (≥ +0,3 so với khung trước) là bắt đầu một cú; kiểu lấy ở r.kickKind ('pass' | 'lob' | 'flick' | 'drive', mặc định 'drive').
 * Trục thời gian tính theo lúc CHẠM: r.kickLead = số giây từ lúc bắt đầu tới lúc chân chạm (mặc định KICK_HIT; trò chơi biết trước cầu rơi thì báo tới KICK_LEAD để có
 * quãng lấy đà nhìn thấy được). Lấy đà → vung (tăng tốc tới chạm) → vung tiếp theo đà → thu chân, tự chạy hết, không phụ thuộc tốc độ hạ r.kick của trò chơi.
 * r.kickAt (Vector3 thế giới, tuỳ chọn) = chỗ quả cầu/bóng ở lúc chạm: quanh lúc chạm bàn chân được IK đưa tới đúng điểm đó (trong tầm chân).
 * r.kickWind > 0 (trò chơi: cầu đang bay tới mình) = dáng chờ: gối chùng, thân hơi cúi, tay mở, nhún đổi chân tại chỗ.
 */
function actKick(r, dt, root) {
  const lv = r.kick || 0, S = THREE.MathUtils.smoothstep, B = r.bones;
  if (lv > r.kickPrev + 0.3) { r.kickT = 0; r.kickStyle = KICKS[r.kickKind] ? r.kickKind : 'drive'; r.kickC = THREE.MathUtils.clamp(r.kickLead ?? KICK_HIT, 0.04, KICK_LEAD); r.kickHas = !!r.kickAt; if (r.kickAt) r.kickP.copy(r.kickAt); } r.kickPrev = lv;
  r.windK += ((r.kickWind || 0) - r.windK) * (1 - Math.exp(-dt * 10));
  const active = r.kickT >= 0; if (!active && r.windK < 0.02) return;
  root.getWorldQuaternion(_wq);
  if (r.windK >= 0.02) {      // dáng chờ cầu (còn giữ trong lúc đá, tan dần sau khi trò chơi thôi báo)
    const rdy = Math.min(1, r.windK * 3), ph = r.t * STEP_HZ * Math.PI * 2, sc = r.g.scale.y || 1;
    if (!active && B.Hips) { B.Hips.position.x += Math.sin(ph) * 0.012 * rdy; B.Hips.updateMatrixWorld(true); }
    crouch(r, root, READY_DROP * rdy * (1 + 0.2 * Math.sin(ph * 2)), ['Left', 'Right']); bend(B.Spine, 1, 0, 0, 0.2 * rdy);
    const A = r.anchor, stepK = A.Left.lift > 0.004 || A.Right.lift > 0.004 ? 0 : S(r.w.idle, 0.8, 1);      // đang bước thật (neo chân nhấc một bàn) hoặc còn đang đi tới: không nhún thêm, kẻo có lúc cả hai bàn chân cùng rời đất
    if (!active) for (const [Sd, s, o] of [['Left', 1, 0], ['Right', -1, Math.PI]]) {      // hai chân mở rộng hơn vai một chút; nhún đổi chân: bàn chân không chịu lực nhấc lên vài cm rồi đặt lại
      const up = Math.max(0, Math.sin(ph + o)), lift = up * up * STEP_UP * rdy * sc * stepK, foot = B[Sd + 'Foot']; if (!foot || !B[Sd + 'UpLeg'] || !B[Sd + 'Leg']) continue;
      around(foot.getWorldPosition(_ht), s * READY_WIDE * rdy * sc, lift, 0, _hs); legIK(r, B[Sd + 'UpLeg'], B[Sd + 'Leg'], foot, _hs, foot.getWorldQuaternion(_fqa), root, false, false);
    }
    armTo(r, 'Left', [0.5, -0.82, 0.1], [0.42, -0.62, 0.62], rdy * 0.85); armTo(r, 'Right', [0.5, -0.82, 0.05], [0.42, -0.66, 0.58], rdy * 0.85);
  }
  if (!active) { liftSunk(r, root, 'Left'); liftSunk(r, root, 'Right'); return; }
  r.kickT += dt; const tau = r.kickT - r.kickC; if (tau >= KICK_OUT) { r.kickT = -1; return; }
  const K = KICKS[r.kickStyle], x = THREE.MathUtils.clamp((tau + KICK_HIT) / KICK_HIT, 0, 1), sw = x * x;      // sw: 0 ở thế lấy đà → 1 lúc chạm, tăng tốc dần (chân tới cầu lúc đang nhanh nhất)
  const env = Math.min(1, r.kickT / 0.09) * (1 - S(tau, 0.14, KICK_OUT)), go = tau < 0 ? 0.72 * sw : 0.72 + 0.28 * S(tau, 0, 0.1), hit = sw * (1 - S(tau, 0.12, KICK_OUT));
  crouch(r, root, K.sink * env, ['Left', 'Right']);      // cả chân đá cũng giữ chỗ khi hông hạ (lúc mới lấy đà/đang thu chân nó còn gần thẳng, hạ hông không giữ thì đế xuyên nền 3–4 cm); ngay sau đó legTo đưa nó đi
  legTo(r, 'Right', lerp3(K.wT, K.hT, go), lerp3(K.wS, K.hS, go), env);
  bend(B.Spine, 1, 0, 0, K.pitch * hit); bend(B.Spine, 0, 0, 1, K.roll * env);
  if (r.kickHas && r.kickAt && tau < 0.02) r.kickP.copy(r.kickAt);      // trò chơi dự đoán lại điểm chạm mỗi khung
  const xk = THREE.MathUtils.clamp((tau + KICK_HIT) / (KICK_HIT - 0.03), 0, 1), wk = r.kickHas ? (tau < 0 ? xk * xk : 1 - S(tau, 0.02, 0.11)) * env : 0, foot = B.RightFoot, toe = B.RightToeBase;      // IK đủ mức từ 2 khung trước tới 1 khung sau lúc chạm
  if (wk > 0.01 && foot && toe && B.RightUpLeg && B.RightLeg) {      // quanh lúc chạm: đưa điểm chạm của bàn chân (mu bàn chân, hoặc má trong) tới đúng quả cầu
    foot.getWorldPosition(_ht); toe.getWorldPosition(_hs); _hs.lerp(_ht, 0.45); _hs.y += 0.045 * (r.g.scale.y || 1);      // _hs: điểm chạm trên mu bàn chân (trục xương nằm trong giày ~4 cm)
    if (K.inside) _hs.add(_it.set(0.035, 0.02, 0).applyQuaternion(_wq));      // chân phải: má trong ở bên trái của bàn chân
    _hs.sub(_ht).negate().add(r.kickP).sub(_ht).multiplyScalar(wk).add(_ht);      // cổ chân mới = cổ chân + wk · (đích − điểm chạm)
    legIK(r, B.RightUpLeg, B.RightLeg, foot, _hs, foot.getWorldQuaternion(_fqa), root, false, false);
  }
  liftSunk(r, root, 'Right'); liftSunk(r, root, 'Left');
  const flick = r.kickStyle === 'flick' || r.kickStyle === 'drive';      // vung mạnh: tay trái đánh ra trước, tay phải ra sau; còn lại: hai tay dang giữ thăng bằng
  armTo(r, 'Left', flick ? lerp3([0.5, -0.7, -0.2], [0.45, -0.35, 0.7], go) : [0.55, -0.75, 0.2], flick ? [0.3, -0.6, 0.55] : [0.45, -0.8, 0.35], env * 0.85);
  armTo(r, 'Right', flick ? lerp3([0.4, -0.75, 0.3], [0.55, -0.6, -0.5], go) : [0.5, -0.8, -0.15], flick ? [0.35, -0.85, 0.05] : [0.4, -0.88, 0.15], env * 0.85);
}
const _sh = new THREE.Vector3();
/** hai bàn tay ôm hai bên một vật tròn/hộp bán kính R có tâm ở at (thế giới): cổ tay lùi sau tâm 7 cm, lòng bàn tay quay vào nhau */
function handsOn(r, at, R, k) {
  const side = Math.min(0.3, R + 0.035);
  for (const [S, s] of [['Left', 1], ['Right', -1]]) {
    armIK(r, S, around(at, s * side, -0.03, -0.07, _sh), k, [0.55, -0.8, -0.3]); palmTo(r, S, s, [-1, 0.1, 0], k);
    const hand = r.bones[S + 'Hand']; if (hand && r.restQ[S + 'Hand']) hand.quaternion.slerp(r.restQ[S + 'Hand'], 0.7 * k);
  }
}
/** thế cầm bóng ném rổ: tay phải đỡ DƯỚI–SAU bóng (cổ tay ngửa), tay trái áp bên trái bóng; at = tâm bóng (thế giới), kR/kL = mức áp từng tay, wrist = góc gập cổ tay phải (rad, âm = ngửa ra sau) */
function shotHands(r, at, R, kR, kL, wrist) {
  const B = r.bones;
  if (kR > 0.004) { armIK(r, 'Right', around(at, -0.03, -(R + 0.02), 0.0, _sh), kR, [0.3, -0.6, 0.75]); palmTo(r, 'Right', -1, [0, 0.25, 1], kR); if (B.RightHand && r.restQ.RightHand) { B.RightHand.quaternion.slerp(r.restQ.RightHand, 0.8 * kR); B.RightHand.updateMatrixWorld(true); bend(B.RightHand, 1, 0, 0, wrist * kR); } }
  if (kL > 0.004) { armIK(r, 'Left', around(at, R + 0.03, -0.07, -0.02, _sh), kL, [0.55, -0.55, 0.6]); palmTo(r, 'Left', 1, [-1, 0, 0.1], kL); if (B.LeftHand && r.restQ.LeftHand) B.LeftHand.quaternion.slerp(r.restQ.LeftHand, 0.7 * kL); }
}
/** lấy lực ném rổ: r.aim = 0..1 (mức lực) — hai tay đưa bóng lên trước trán (tay phải dưới bóng, tay trái đỡ bên), gối khuỵu dần theo lực. Có r.holdAt (tâm bóng thật) thì tay bám đúng quả bóng */
function actAim(r, root, k) {
  root.getWorldQuaternion(_wq); crouch(r, root, 0.03 + 0.075 * k, ['Left', 'Right']);
  bend(r.bones.Spine, 1, 0, 0, 0.04 + 0.05 * k);
  if (r.holdAt) { shotHands(r, r.holdAt, r.holdR || 0.12, 1, 1, -1.0); root.worldToLocal(r.shotFrom.copy(r.holdAt)); r.shotR = r.holdR || 0.12; r.shotSet = true; return; }      // shotFrom: tâm bóng trong hệ của gốc nhân vật — cử chỉ 'shoot' bắt đầu từ đúng thế này
  armTo(r, 'Right', [0.3, 0.12, 0.92], [-0.22, 0.95, 0.12], 1); armTo(r, 'Left', [0.42, 0.05, 0.88], [-0.5, 0.82, 0.22], 1);
}
export const PLANE_RELEASE = 0.52;      // phần của cử chỉ 'plane' mà máy bay rời tay (campus_play.js thả máy bay đúng lúc này, từ vị trí bàn tay)
const PLANE_BACK = [[0.55, 0.05, -0.35], [-0.2, 0.8, -0.35]], PLANE_FWD = [[0.12, 0.12, 1], [0.0, 0.18, 1]];      // tay phải: kéo ra sau tai / duỗi thẳng ra trước
const PLANE_ARM = [[0.22, -0.8, 0.42], [0.02, 0.5, 0.86]];      // cầm máy bay giấy: khuỷu sát sườn, cẳng tay chếch lên trước, bàn tay ngang ngực, lệch ra ngoài vai
/** cầm vật: 'plane' = cầm máy bay giấy trước ngực (khuỷu gập ~90°), 'carry' = hai tay ôm vật trước bụng (có r.holdAt/r.holdR thì bàn tay áp đúng hai bên vật) */
function actHold(r, root, kind) {
  root.getWorldQuaternion(_wq);
  if (kind === 'plane') { armTo(r, 'Right', PLANE_ARM[0], PLANE_ARM[1], 1); return; }
  if (r.holdAt) { handsOn(r, r.holdAt, r.holdR || 0.12, 1); return; }
  armTo(r, 'Right', [0.3, -0.88, 0.3], [-0.42, -0.1, 0.9], 1); armTo(r, 'Left', [0.3, -0.88, 0.3], [-0.42, -0.1, 0.9], 1);
}

// FOCUS_COS: nón nhìn nửa góc ~72° (rộng hơn nửa đường chéo khung hình ở FOV rộng nhất); FOCUS_HYST: vùng trễ (m, và 0,1 theo cos) để người ở mép tầm không nhấp nháy giữa hai đường
const FOCUS = { on: false, photo: false, p: new THREE.Vector3(), d: new THREE.Vector3() }, FOCUS_R = 12, FOCUS_NEAR = 3, FOCUS_COS = 0.3, FOCUS_HYST = 1, FOCUS_PHOTO = 60;
/**
 * Báo máy ảnh đang ở đâu, nhìn hướng nào (gọi mỗi khung). Phần chỉnh dáng tốn CPU khi đi/chạy — ép bàn chân lên nền, giải lại chân, sửa trục khuỷu,
 * thêm ~0,1 ms mỗi người mỗi khung — chỉ làm cho người trong vòng FOCUS_R mét và nằm trong khung nhìn (hoặc sát máy ảnh); người khác đi theo đường rẻ.
 * Chưa gọi lần nào (công cụ dựng người rời) thì ai cũng được chỉnh đầy đủ.
 */
export function setAnimFocus(camera, photo = false) { camera.getWorldPosition(FOCUS.p); camera.getWorldDirection(FOCUS.d); FOCUS.on = true; FOCUS.photo = !!photo; }
/** r.fineAlways (human.js đặt từ h.fine: người chơi lúc chụp ảnh / ở màn tạo nhân vật) và người đang tạo dáng trong chế độ chụp ảnh luôn được chỉnh kỹ dù máy ảnh bay xa */
function inFocus(r, root) {
  if (!FOCUS.on || r.fineAlways) return (r.fine = true);
  root.getWorldPosition(_g1).sub(FOCUS.p); _g1.y = Math.max(0, Math.abs(_g1.y) - 2); const d = _g1.length(), h = r.fine ? FOCUS_HYST : 0;      // người đứng ngay dưới/trên máy ảnh 2 m vẫn tính là gần
  const seen = _g1.dot(FOCUS.d) > d * (FOCUS_COS - h * 0.1);
  return (r.fine = d < FOCUS_NEAR + h || (d < FOCUS_R + h && seen) || (FOCUS.photo && d < FOCUS_PHOTO && seen && !!r.pose && r.pose.startsWith('pose_')));
}
const ANCHOR_JUMP = 0.05, ANCHOR_SLIDE = 1.0, ANCHOR_SPIN = 3, ANCHOR_VMAX = 2.4, _rp = new THREE.Vector3();      // ANCHOR_SPIN: gốc bị xoay nhanh hơn 3 rad/s (trượt vào ghế có xoay người) cũng là bị dời; ANCHOR_VMAX: bàn chân đang bước không đuổi nhanh hơn mức này (m/s)
// r.carry: nơi điều khiển gốc báo thẳng "đang mang nhân vật đi" (campus_play.js lúc trượt người vào/ra ghế).
// ANCHOR_JUMP/ANCHOR_SLIDE:      // gốc trôi nhanh hơn tốc độ đi báo vào quá 1 m/s → đang bị dời từ ngoài (thả neo êm); kèm nhảy quá 5 cm trong một khung → bỏ neo ngay.
// (1 m/s: phần lùi hông của clip ngồi xuống do tickMove dời gốc đạt tối đa ~0,9 m/s — lúc đó bàn chân phải được giữ yên, không thả)
/** bỏ neo bàn chân của một nhân vật ngay (gọi khi vừa đặt nhân vật sang chỗ khác); animateRigged cũng tự bỏ khi thấy gốc bị dời */
export function dropAnchors(r) { if (!r || !r.anchor) return; const A = r.anchor; A.Left.on = A.Right.on = false; A.Left.rel = A.Right.rel = false; A.Left.lift = A.Right.lift = 0; A.busy = false; A.step = null; }
const GAIT_PHASE = 0.05;      // clip chạy đặt chân trái muộn hơn clip đi chừng này (phần của một chu kỳ hai bước)
/**
 * Đi và chạy được trộn theo trọng số: hai clip phải cùng pha bước (chân trái cùng chạm đất một lúc), nếu không lúc chuyển đi ↔ chạy
 * tư thế trộn ra có hai chân chẳng khớp nhịp nào — bàn chân quét trên nền, chìm xuống đất. Lấy nhịp bước chung (số chu kỳ mỗi giây, trộn theo
 * trọng số) cho cả hai clip rồi đặt thời gian của clip nhẹ hơn theo pha của clip nặng hơn. Gọi sau khi đã đặt timeScale của từng clip.
 */
function syncGait(r) {
  const a = r.act.walk, b = r.act.run; if (!a || !b) return;
  const da = a.getClip().duration, db = b.getClip().duration, wa = r.w.walk, wb = r.w.run, sum = wa + wb; if (sum < 1e-4 || !(da > 0) || !(db > 0)) return;
  const rate = (wa * a.timeScale / da + wb * b.timeScale / db) / sum;
  a.timeScale = rate * da; b.timeScale = rate * db;
  if (wa >= wb) b.time = (a.time / da + GAIT_PHASE) % 1 * db; else a.time = ((b.time / db - GAIT_PHASE) % 1 + 1) % 1 * da;
}
/** cập nhật hoạt hoạ: speed (m/s), air = đang trên không, holding = đang cầm đồ */
export function animateRigged(r, speed, dt, air, holding, root) {
  const run = THREE.MathUtils.smoothstep(speed, 2.1, 3.2), move = THREE.MathUtils.smoothstep(speed, 0.15, 0.9);
  const target = { idle: 1 - move, walk: move * (1 - run), run: move * run }, k = 1 - Math.exp(-dt * 9);
  const pw = r.pw = blendPoses(r, dt), free = 1 - pw;      // free = phần còn lại cho đứng/đi/chạy khi đang tạo dáng
  for (const n in r.act) { r.w[n] += (target[n] - r.w[n]) * k; r.act[n].setEffectiveWeight(r.w[n] * free); }
  const sc = (r.g.scale.y || 1) * r.stride;       // người thấp, chân ngắn (mô hình nữ: hông thấp hơn mô hình mà clip được đo ~7 %) thì sải ngắn hơn → nhịp nhanh hơn ở cùng tốc độ
  if (r.act.walk) r.act.walk.timeScale = THREE.MathUtils.clamp(speed / (WALK_SPEED * sc), 0.6, 1.8);
  if (r.act.run) r.act.run.timeScale = THREE.MathUtils.clamp(speed / (RUN_SPEED * sc), 0.7, 1.7) * (air ? 0.35 : 1);
  syncGait(r);
  r.mixer.update(dt); r.t += dt;
  if (!(dt > 0)) return;      // cả dt = NaN cũng dừng ở đây
  const fine = root ? inFocus(r, root) : false;
  // gốc bị dời từ ngoài (dịch chuyển tức thời, trượt vào ghế, đặt lại chỗ, người chơi mạng giật vị trí): tư thế vẫn là đứng/ngồi nhưng cả người đang bị mang đi → không neo
  // chân (neo thì chân "bước đuổi" theo tới 4–5 m/s). Trôi nhanh hơn tốc độ đi được báo vào (speed) quá ANCHOR_SLIDE là bị dời.
  let carried = false; if (root) { root.getWorldPosition(_rp); const mv = r.rootSeen ? _rp.distanceTo(r.rootP) : 0; let dy = root.rotation.y - r.rootYaw; dy = Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy))); r.rootYaw = root.rotation.y;      // root = nhóm gốc của nhân vật, xoay quanh trục đứng
    carried = !!r.carry || mv / dt - speed > ANCHOR_SLIDE || (r.rootSeen && dy / dt > ANCHOR_SPIN); if (mv > ANCHOR_JUMP && mv / dt - speed > ANCHOR_SLIDE) dropAnchors(r); r.rootP.copy(_rp); r.rootSeen = true; }
  if (root && r.w.idle * free > 0.02) { relaxPose(r, Math.min(1, r.w.idle * free), root, fine); }
  const gait = (r.w.walk + r.w.run * 0.6) * free;
  if (root && gait > 0.02) { refineGait(r, Math.min(1, gait), root, fine); if (!fine && r.bones.Hips) r.bones.Hips.position.y += COARSE_UP * Math.min(1, (r.w.walk + r.w.run) * free);      // đường rẻ: không ép từng bàn chân, chỉ nâng cả người một chút cho đế bớt chìm
    if (!air) liftHips(r, 0.012 * r.w.run * free * (r.g.scale.y || 1), root, fine ? Math.min(1, (r.w.walk + r.w.run) * free) : 0); }
  // đứng yên vắt qua mép bậc/vỉa hè (nền dưới một bàn chân lệch nền dưới gốc): đặt từng bàn chân lên nền của nó như lúc đi. Nền phẳng thì không đụng gì tới dáng đứng
  if (root && fine && !air && r.groundAt && gait <= 0.02 && pw < 0.02 && r.w.idle > 0.5 && unevenFeet(r, root))      // pw < 0,02: đang ngồi xuống/đứng dậy/tạo dáng thì không đụng (mặt ghế, mép bồn cây cạnh chân không phải bậc để đặt chân lên)
    liftHips(r, 0, root, Math.min(1, r.w.idle * free));
  if (root && r.poseLegs > 0.02) poseLegs(r, Math.min(1, r.poseLegs), root);
  applyCurl(r);
  if (root && pw - r.poseLegs > 0.02) { groundFeet(r, 1, root, 1.6 * dt); if (fine) settleFeet(r, root, Math.min(1, pw - r.poseLegs)); } else r.gfc = 0;
  { // mức neo: 1 khi đứng/tạo dáng/đang dừng lại, 0 khi đã đi/chạy đều (clip tự giữ chân trụ) và khi đang bắt đầu đi (chân phải rời chỗ ngay; neo rồi thả giữa chừng
    // làm bàn chân giật 7–12 cm/khung²)
    const starting = target.walk + target.run > r.w.walk + r.w.run + 0.02;
    // bị mang đi chậm hơn một cú nhảy: thả neo êm (phần lệch tan dần theo bàn chân), không neo mới
    const aw = root && !air && !starting && !carried && fine ? 1 - THREE.MathUtils.smoothstep((r.w.walk + r.w.run) * free, ANCHOR_GAIT[0], ANCHOR_GAIT[1]) : 0;
    if (root && !air && (aw > 0.01 || r.anchor.busy || (carried && (r.anchor.Left.on || r.anchor.Right.on)))) anchorFeet(r, dt, root, aw); else { r.anchor.Left.on = r.anchor.Right.on = false; r.anchor.Left.rel = r.anchor.Right.rel = false; r.anchor.busy = false; r.anchor.step = null; } }
  if (root) actJump(r, dt, !!air, speed, root);
  if (r.flaps.length && root) { driveFlaps(r, dt, speed, root); }
  // nhìn về một điểm (máy ảnh, người đối diện)
  if (r.lookAt) r.lookPos.copy(r.lookAt); r.lk += ((r.lookAt ? 1 : 0) - r.lk) * (1 - Math.exp(-dt * 5));
  if (root && r.lk > 0.01) { root.getWorldQuaternion(_wq); lookHead(r, r.lk * 0.92); }
  // nụ cười (morph smile): r.smileT = mức muốn có, null = về mức của khuôn mặt
  const sT = r.smileT ?? r.smile0;
  if (Math.abs(sT - r.smileV) > 0.004) { r.smileV += (sT - r.smileV) * (1 - Math.exp(-dt * 6)); for (const o of r.smileMeshes) { const d = o.morphTargetDictionary, inf = o.morphTargetInfluences; inf[d.smile] = r.smileV; if (d.smile_open !== undefined) inf[d.smile_open] = Math.max(0, (r.smileV - 0.5) * 1.6); } }      // cười tươi (≥ 0,5) thì hở răng dần
  // chớp mắt: 2–6 giây một lần, mỗi lần ~0,15 giây
  if (r.blinkMeshes.length) {
    r.blinkIn -= dt; if (r.blinkIn <= 0) r.blinkIn = 2 + Math.random() * 4;
    const b = r.blinkIn < 0.15 && !(r.pose && r.pose.startsWith('pose_')) ? Math.sin(r.blinkIn / 0.15 * Math.PI) : 0;      // đang tạo dáng chụp ảnh thì không chớp (khỏi ra ảnh nhắm mắt)
    if (b !== r.blinkV) { r.blinkV = b; for (const o of r.blinkMeshes) o.morphTargetInfluences[o.morphTargetDictionary.blink] = b; }
  }
  // ngồi ghế thấp: dáng ngồi xổm gốc có tay giơ chữ V → hạ hai tay đặt lên gối (r.armsDown)
  if (r.armsDown && root) {
    root.getWorldQuaternion(_wq);
    for (const [S, s] of [['Left', 1], ['Right', -1]]) { const arm = r.bones[S + 'Arm'], fore = r.bones[S + 'ForeArm'], hand = r.bones[S + 'Hand']; if (!arm || !fore || !hand) continue; aim(arm, fore, dirW(s * 0.16, -0.9, 0.42), 1); aim(fore, hand, dirW(-s * 0.1, -0.5, 0.86), 1); }
  }
  // ăn uống: tay phải đưa lên tới miệng, r.eat = mức (0..1)
  if (r.eat > 0.01 && root && r.bones.RightArm && r.bones.RightForeArm && r.bones.RightHand && r.bones.Head) {
    root.getWorldQuaternion(_wq); aim(r.bones.RightArm, r.bones.RightForeArm, dirW(-0.3, -0.75, 0.6), r.eat);
    const elbow = r.bones.RightForeArm.getWorldPosition(new THREE.Vector3()), mouth = r.bones.Head.getWorldPosition(new THREE.Vector3()); root.getWorldDirection(_f); mouth.addScaledVector(_f, 0.1).y += 0.05;
    aim(r.bones.RightForeArm, r.bones.RightHand, mouth.sub(elbow).normalize(), r.eat);
  }
  if (root) actKick(r, dt, root);      // đá cầu / sút bóng: r.kick + r.kickKind
  if (root && r.aim != null) actAim(r, root, THREE.MathUtils.clamp(r.aim, 0, 1));
  if (r.gest && root && r.gest.t < r.gest.dur && r.bones.RightArm && r.bones.RightForeArm && r.bones.RightHand) gesture(r, r.gest, root);
  else if (root && r.hold && r.aim == null) actHold(r, root, r.hold);
  else if (holding && r.aim == null && r.bones.RightArm && r.bones.RightForeArm && r.bones.RightHand && root) {
    root.getWorldDirection(_f);
    aim(r.bones.RightArm, r.bones.RightForeArm, _d.copy(_f).multiplyScalar(0.75).add(_a.set(0, -0.62, 0)).normalize().clone(), 1);
    aim(r.bones.RightForeArm, r.bones.RightHand, _d.copy(_f).multiplyScalar(0.95).add(_a.set(0, 0.25, 0)).normalize().clone(), 1);
  }
}
