// Người 3D có xương (MakeHuman/MPFB, xem assets/people/LICENSE.md): nạp .glb, nhuộm màu theo lựa chọn, trộn hoạt hoạ đứng/đi/chạy.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Q, param } from '../engine/util.js';

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
  const gk = look.gender === 'f' ? 'f' : 'm', w = man.wardrobe && (param('ai', '1') !== '0' && man.wardrobe[gk + '_ai'] || man.wardrobe[gk]);      // mặc định dùng bản có da đầu chiếu từ bản vẽ; ?ai=0 để so với bản cũ if (!w || param('wardrobe', '1') === '0') return null;
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
  if (!headTex.has(path)) headTex.set(path, texLoader.loadAsync(DIR + path).then((t) => { t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }));
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
 * Kết quả: { g, mixer, act, bones, dispose }
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
    try { for (const k in head.textures) hmaps[k] = await headTexture(head.textures[k], k !== 'headNormal'); }      // đường dẫn theo manifest
    catch (e) { if (!missingWarned.has('head' + head.id)) { missingWarned.add('head' + head.id); console.warn('[người] không nạp được gương mặt ' + head.id + ', dùng mặt mặc định:', e && e.message ? e.message : e); } for (const k in hmaps) delete hmaps[k]; }
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
    if (m.side === THREE.DoubleSide) m.shadowSide = THREE.BackSide;      // vải hai mặt: chỉ mặt khuất nắng ghi vào bản đồ bóng, nếu không mặt được chiếu sáng tự đổ bóng lốm đốm lên chính nó
    const gl = /glasses_(\d+)/.exec(o.name + '/' + (o.parent ? o.parent.name : ''));                // kính: lưới glasses_N, vật liệu lens/frame
    if (gl) { o.visible = +gl[1] === glasses; o.castShadow = false; if (name === 'lens') { m.transparent = true; m.opacity = Math.min(m.opacity, 0.35); m.roughness = 0.05; m.depthWrite = false; } return; }
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
    else if (name === 'eyebrows' || name === 'eyelashes') { o.castShadow = false; m.color.setRGB(ht[0] * 0.6, ht[1] * 0.6, ht[2] * 0.6); }
  });
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
  const toeY = bones.LeftToeBase ? bones.LeftToeBase.getWorldPosition(new THREE.Vector3()).y : undefined;
  const footY = bones.LeftFoot ? bones.LeftFoot.getWorldPosition(new THREE.Vector3()).y : undefined;
  mixer.update(0);
  return { g, mixer, act, clips, poses: new Map(), pose: null, pw: 0, lookAt: null, lookPos: new THREE.Vector3(), lk: 0, smileMeshes, smile0: morph.smile, smileV: morph.smile, smileT: null, gfc: 0, flapDead: W && W.bottom && W.bottom.flaps && !(W.top && W.top.flaps) ? 0.16 : 0, twistMax: W && W.top && (W.top.hides || []).includes('skin_forearm') ? 0.3 : undefined, blinkMeshes, blinkIn: 1 + Math.random() * 4, blinkV: 0, bones, flaps, footY, toeY, restQ, headRel, neckDir, female: look.gender === 'f', stance: look.stance || 'side', t: 0, seed: Math.random() * 6.28, w: { idle: 1, walk: 0, run: 0 }, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); for (const m of mats) m.dispose(); model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); } };
}

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
/** xoay xương sao cho đoạn xương→con chĩa theo hướng dir (toạ độ thế giới), mức k */
function aim(bone, child, dir, k) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _d.subVectors(_b, _a).normalize();
  _q.setFromUnitVectors(_d, dir); bone.parent.getWorldQuaternion(_pq);
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(_q);
  bone.quaternion.slerp(_pq.invert().multiply(world), k); bone.updateMatrixWorld(true);
}

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
  side:  [[0.085, -1, -0.03], [0.03, -1, 0.10]],      // buông xuôi sát thân, khuỷu gập nhẹ
  front: [[0.16, -1, 0.10], [-0.62, -0.72, 0.34]],      // hai tay chắp trước bụng dưới
  back:  [[0.15, -1, -0.10], [-0.55, -0.78, -0.30]],    // hai tay chắp sau lưng
};
const PALM = [-1, 0, -0.22], TWIST_MAX = 1.0;      // lòng bàn tay áp vào đùi, hơi quay ra sau; xoắn cẳng tay tối đa ~57° (quá nữa thì tay áo bị vặn)
const _pn = new THREE.Vector3(), _pt = new THREE.Vector3(), _px = new THREE.Vector3(), _hd = new THREE.Vector3(), _tq = new THREE.Quaternion();
/**
 * Xoay cẳng tay quanh trục của nó để lòng bàn tay quay về hướng dir (hệ nhân vật, viết cho tay trái; tay phải lấy đối xứng x).
 * aim() chỉ lo hướng của đoạn xương, còn độ xoắn quanh trục thì bỏ mặc → bàn tay hay bị ngửa ra trước hoặc úp ra sau.
 * Pháp tuyến lòng bàn tay tính từ hình học: (gốc ngón giữa − cổ tay) × (gốc ngón trỏ − gốc ngón út), đổi dấu theo bên.
 */
function palmTo(r, S, s, dir, k) {
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
  fore.quaternion.slerp(_pq.invert().multiply(world), k); fore.updateMatrixWorld(true);
}
function relaxPose(r, k, root) {
  const B = r.bones, f = r.female ? 1 : 0, t = r.t, br = Math.sin(t * 1.5 + r.seed) * 0.005;
  // dồn trọng tâm chậm rãi sang một chân: hông lệch ngang ~1,5 cm, chân kia chùng gối nhẹ
  const lean = Math.sin(t * 0.23 + r.seed) * 0.8 + Math.sin(t * 0.61 + r.seed * 2.3) * 0.2, side = THREE.MathUtils.clamp(lean * 1.6, -1, 1);
  // hông, lưng, cổ, bàn tay, bàn chân về tư thế nghỉ (clip đứng gốc ưỡn hông, xoè tay, chân chữ bát)
  for (const kq in r.restQ) B[kq].quaternion.slerp(r.restQ[kq], (kq === 'Head' || kq === 'Neck' ? 0.55 : 0.8) * k);
  if (B.Hips) { B.Hips.position.x += side * 0.015 * k; B.Hips.updateMatrixWorld(true); }
  root.getWorldQuaternion(_wq);
  straighten(r, 0.85 * k, 0.012);                     // lưng thẳng, cổ không rướn ra trước
  const arms = ARMS[r.stance] || ARMS.side;
  for (const [S, s] of [['Left', 1], ['Right', -1]]) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], foot = B[S + 'Foot'], arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand'];
    const free = Math.max(0, -side * s);                 // chân không chịu lực: gối chùng ra trước, bàn chân hơi lùi
    if (up && leg && foot) { aim(up, leg, dirW(s * (0.035 - f * 0.015) - side * 0.02, -1, 0.012 + free * 0.10), k); aim(leg, foot, dirW(s * 0.004 - side * 0.02, -1, -0.02 - free * 0.13), k); }
    if (arm && fore && hand) {
      const a0 = arms[0], a1 = arms[1], w = r.stance === 'side' ? f * 0.02 : 0;
      const as = r.stance === 'side' ? Math.sin(r.seed * 3.1 + s) * 0.02 : 0;        // hai tay không buông giống hệt nhau
      aim(arm, fore, dirW(s * (a0[0] - w), a0[1], a0[2] + br + as), k); aim(fore, hand, dirW(s * a1[0], a1[1], a1[2] + br + as * 1.5), k);
      if (r.stance === 'side') palmTo(r, S, s, PALM, k);       // chắp tay trước/sau: giữ độ xoắn của tư thế, không ép
    }
  }
  groundFeet(r, k, root);
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
function straighten(r, k, lean) {
  const B = r.bones; if (!B.Spine || !B.Neck || !B.Head) return;
  aim(B.Spine, B.Neck, dirW(0, 1, lean), k);
  const nd = r.neckDir; aim(B.Neck, B.Head, dirW(0, nd ? nd.y : 1, (nd ? nd.z * 0.8 : 0.06) + lean * 0.5), k);
  if (r.headRel) { _fq.copy(_wq).multiply(r.headRel); B.Head.parent.getWorldQuaternion(_fp); B.Head.quaternion.slerp(_fp.invert().multiply(_fq), k); B.Head.updateMatrixWorld(true); }
}
function refineGait(r, k, root) {
  const B = r.bones, f = r.female ? 1 : 0;
  if (B.Hips && r.restQ.Hips) { B.Hips.quaternion.slerp(r.restQ.Hips, 0.2 * k); B.Hips.updateMatrixWorld(true); }   // bớt chúi người, ưỡn hông
  for (const kq of ['LeftShoulder', 'RightShoulder']) if (B[kq] && r.restQ[kq]) B[kq].quaternion.slerp(r.restQ[kq], 0.6 * k);
  root.getWorldQuaternion(_wq); _cq.copy(_wq).invert();
  straighten(r, 0.85 * k, 0.035 + 0.14 * r.w.run);
  for (const [S, s] of [['Left', 1], ['Right', -1]]) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], arm = B[S + 'Arm'], fore = B[S + 'ForeArm'], hand = B[S + 'Hand'];
    if (up && leg) tuck(up, leg, s, 0.02, 0.45, 1 - (1 - STRIDE) * r.w.walk, k);                                   // bước chân gần đường giữa hơn (không đi chữ bát)
    if (arm && fore) tuck(arm, fore, s, 0.11 - f * 0.02, 0.4, 0.8 - f * 0.2, k);          // khuỷu tay khép vào sườn
    if (fore && hand) { tuck(fore, hand, s, 0.03, 0.5, 0.9 - f * 0.15, k); palmTo(r, S, s, PALM, 0.8 * k); if (r.restQ[S + 'Hand']) { hand.quaternion.slerp(r.restQ[S + 'Hand'], 0.6 * k); } }
  }
}

const _H = new THREE.Vector3(), _K = new THREE.Vector3(), _T = new THREE.Vector3(), _ax = new THREE.Vector3(), _pole = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fp = new THREE.Quaternion();
/**
 * Clip đi gốc luôn khuỵu gối (gối duỗi tối đa ~158°). Nâng hông lên `lift` (mét trong thế giới) rồi giải lại hai đốt chân (IK giải tích)
 * sao cho bàn chân vẫn ở đúng chỗ cũ → chân trụ duỗi gần thẳng, dáng đi cao và nhẹ hơn.
 */
function liftHips(r, lift, root) {
  const B = r.bones; if (!B.Hips || lift < 1e-4) return;
  const legs = [];
  for (const S of ['Left', 'Right']) {
    const up = B[S + 'UpLeg'], leg = B[S + 'Leg'], foot = B[S + 'Foot']; if (!up || !leg || !foot) return;
    legs.push({ up, leg, foot, T: foot.getWorldPosition(new THREE.Vector3()), fq: foot.getWorldQuaternion(new THREE.Quaternion()) });
  }
  B.Hips.position.y += lift / (r.g.scale.y || 1); B.Hips.updateMatrixWorld(true);
  for (const L of legs) {
    L.up.getWorldPosition(_H); L.leg.getWorldPosition(_K); _T.copy(L.T);
    const l1 = _K.distanceTo(_H), l2 = L.foot.getWorldPosition(_b).distanceTo(_K);
    _ax.subVectors(_T, _H); const d = Math.min(_ax.length(), (l1 + l2) * 0.997); _ax.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _pole.subVectors(_K, _H); _pole.addScaledVector(_ax, -_pole.dot(_ax));                 // gối giữ hướng gập cũ
    if (_pole.lengthSq() < 1e-8) root.getWorldDirection(_pole); _pole.normalize();
    _K.copy(_H).addScaledVector(_ax, a).addScaledVector(_pole, h);
    aim(L.up, L.leg, _d.subVectors(_K, _H).normalize().clone(), 1);
    L.leg.getWorldPosition(_K); _T.copy(L.T).addScaledVector(_ax, 0); aim(L.leg, L.foot, _d.subVectors(L.T, _K).normalize().clone(), 1);
    // bàn chân giữ nguyên hướng trong thế giới
    L.foot.parent.getWorldQuaternion(_fp); L.foot.quaternion.copy(_fp.invert().multiply(L.fq)); L.foot.updateMatrixWorld(true);
  }
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
/** trộn dáng chụp ảnh hoặc clip phụ: r.pose = tên clip ('pose_peace'…, hoặc clip trong anims.glb như 'talk', 'sit_idle') hoặc null; nữ ưu tiên biến thể _f; trả về tổng trọng số dáng (0..1) */
function blendPoses(r, dt) {
  let want = null;
  if (r.pose) { const nm0 = r.flaps.length && r.pose === 'pose_squat' ? 'pose_grace' : r.pose, clip = (r.female && r.clips[nm0 + '_f']) || r.clips[nm0]; if (clip) { want = clip.name; if (!r.poses.has(want)) { const a = r.mixer.clipAction(clip); a.setEffectiveWeight(0); a.play(); r.poses.set(want, { a, w: 0 }); } } }
  const k = 1 - Math.exp(-dt * 6); let sum = 0;
  for (const [nm, p] of r.poses) {
    p.w += ((nm === want ? 1 : 0) - p.w) * k;
    if (nm !== want && p.w < 0.004) { p.a.stop(); r.poses.delete(nm); continue; }
    sum += p.w;
  }
  const norm = sum > 1 ? 1 / sum : 1; let legs = 0; for (const [nm, p] of r.poses) { p.a.setEffectiveWeight(p.w * norm); if (!(/squat/.test(nm) || /^sit_/.test(nm) || /grace/.test(nm) && r.female)) legs += p.w * norm; }
  r.poseLegs = legs;                                // phần trọng số thuộc các dáng đứng cần khép chân
  return Math.min(1, sum);
}

/** cập nhật hoạt hoạ: speed (m/s), air = đang trên không, holding = đang cầm đồ */
export function animateRigged(r, speed, dt, air, holding, root) {
  const run = THREE.MathUtils.smoothstep(speed, 2.1, 3.2), move = THREE.MathUtils.smoothstep(speed, 0.15, 0.9);
  const target = { idle: 1 - move, walk: move * (1 - run), run: move * run }, k = 1 - Math.exp(-dt * 9);
  const pw = r.pw = blendPoses(r, dt), free = 1 - pw;      // free = phần còn lại cho đứng/đi/chạy khi đang tạo dáng
  for (const n in r.act) { r.w[n] += (target[n] - r.w[n]) * k; r.act[n].setEffectiveWeight(r.w[n] * free); }
  const sc = r.g.scale.y || 1;                    // người thấp sải ngắn hơn → nhịp nhanh hơn ở cùng tốc độ
  if (r.act.walk) r.act.walk.timeScale = THREE.MathUtils.clamp(speed / (WALK_SPEED * sc), 0.6, 1.8);
  if (r.act.run) r.act.run.timeScale = THREE.MathUtils.clamp(speed / (RUN_SPEED * sc), 0.7, 1.5) * (air ? 0.35 : 1);
  r.mixer.update(dt); r.t += dt;
  if (dt <= 0) return;
  if (root && r.w.idle * free > 0.02) { relaxPose(r, Math.min(1, r.w.idle * free), root); }
  const gait = (r.w.walk + r.w.run * 0.6) * free; if (root && gait > 0.02) { refineGait(r, Math.min(1, gait), root); if (!air) liftHips(r, 0.012 * r.w.run * free * (r.g.scale.y || 1), root); }
  if (root && r.poseLegs > 0.02) poseLegs(r, Math.min(1, r.poseLegs), root);
  if (root && pw - r.poseLegs > 0.02) groundFeet(r, 1, root, 1.6 * dt); else r.gfc = 0;
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
  // tâng cầu: đưa chân phải ra trước, r.kick = mức (0..1)
  if (r.kick > 0.01 && r.bones.RightUpLeg && r.bones.RightLeg && r.bones.RightFoot && root) {
    root.getWorldDirection(_f);
    aim(r.bones.RightUpLeg, r.bones.RightLeg, _d.copy(_f).multiplyScalar(0.8).add(_a.set(0, -0.6, 0)).normalize().clone(), r.kick);
    aim(r.bones.RightLeg, r.bones.RightFoot, _d.copy(_f).multiplyScalar(0.95).add(_a.set(0, -0.3, 0)).normalize().clone(), r.kick);
  }
  if (holding && r.bones.RightArm && r.bones.RightForeArm && r.bones.RightHand && root) {
    root.getWorldDirection(_f);
    aim(r.bones.RightArm, r.bones.RightForeArm, _d.copy(_f).multiplyScalar(0.75).add(_a.set(0, -0.62, 0)).normalize().clone(), 1);
    aim(r.bones.RightForeArm, r.bones.RightHand, _d.copy(_f).multiplyScalar(0.95).add(_a.set(0, 0.25, 0)).normalize().clone(), 1);
  }
}
