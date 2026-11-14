// Hình người dựng bằng mã: thân lofting theo tiết diện giải phẫu, đầu có mặt vẽ (mắt, mày, mũi, môi), tóc, đồng phục.
import * as THREE from 'three';
import { canvasTex } from '../engine/textures.js';
import { buildRigged, animateRigged } from './rigged.js';

export const SKINS = [0xf1cfae, 0xe2b48e, 0xc99a72, 0xa8774f];
export const HAIR_COLORS = [0x14110e, 0x2e2018, 0x4a3020, 0x8a8a8a, 0x8a4a26];
export const HAIR_LABELS = { short: 'Ngắn', side: 'Rẽ ngôi', crop: 'Húi cua', crew: 'Húi cua', fringe: 'Mái rủ', shaved: 'Cạo sát', long: 'Dài thẳng', pony: 'Đuôi ngựa', bob: 'Ngang vai', wavy_half: 'Gợn, buộc nửa', braid: 'Tết bím', pixie: 'Tém', bob_bangs: 'Bob mái bằng' };
export const GLASSES = [[0, 'Không'], [1, 'Gọng đen'], [2, 'Gọng mảnh'], [3, 'Kính màu']];
export const HAIRS = { m: [['short', 'Ngắn'], ['side', 'Rẽ ngôi'], ['crop', 'Húi cua']], f: [['long', 'Dài'], ['pony', 'Đuôi ngựa'], ['bob', 'Ngang vai']] };
export const OUTFITS = { m: [['white', 'Áo trắng'], ['jacket', 'Áo khoác đồng phục'], ['pe', 'Thể dục'], ['teacher', 'Sơ mi – quần âu'], ['class', 'Áo lớp']], f: [['class', 'Áo lớp – quần đen'], ['classJ', 'Áo lớp – quần bò'], ['classS', 'Áo lớp – váy bò'], ['white', 'Áo trắng'], ['jacket', 'Áo khoác đồng phục'], ['pe', 'Thể dục'], ['aodai', 'Áo dài trắng'], ['aodaiT', 'Áo dài hồng'], ['aodaiR', 'Áo dài đỏ'], ['aodaiL', 'Áo dài ngà']] };
export const FACES = [[0, '1'], [1, '2'], [2, '3'], [3, '4'], [4, '5'], [5, '6'], [6, '7']];
export const AGES = [['teen', 'Học sinh'], ['adult', 'Thanh niên'], ['mid', 'Cựu học sinh'], ['old', 'Lớn tuổi']];
/** dáng chụp ảnh: [mã, tên hiện trên nút] — clip tương ứng là pose_<mã> trong assets/people/poses.glb */
export const POSES = [['peace', 'Chữ V'], ['peace2', 'Hai tay V'], ['heart', 'Thả tim'], ['bigheart', 'Tim lớn'], ['wave', 'Vẫy chào'], ['thumb', 'Thích'], ['hips', 'Chống hông'], ['cross', 'Khoanh tay'], ['chin', 'Chống cằm'], ['grace', 'Duyên dáng'], ['cheer', 'Giơ tay'], ['squat', 'Ngồi xổm']];
export const DEFAULT_LOOK = { gender: 'm', skin: 1, hair: 'short', hairColor: 0, outfit: 'white', height: 1.68, build: 1, face: 0, age: 'mid' };      // mặc định là cựu học sinh về thăm trường

/** Ống lofting qua các vòng [y, rx, rz, ox, oz]; mặt trước là +z (u = 0,25) */
function loft(rings, seg = 20, cap = 3) {
  const pos = [], uv = [], idx = [], n = rings.length;
  for (let i = 0; i < n; i++) { const [y, rx, rz, ox = 0, oz = 0] = rings[i]; for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2; pos.push(ox - Math.cos(a) * rx, y, oz + Math.sin(a) * rz); uv.push(j / seg, i / (n - 1)); } }
  const up = rings[n - 1][0] > rings[0][0];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; if (up) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const capAt = (i, flip) => { const [y, , , ox = 0, oz = 0] = rings[i], c = pos.length / 3; pos.push(ox, y, oz); uv.push(0.5, i ? 1 : 0); for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j; if (flip) idx.push(c, a, a + 1); else idx.push(c, a + 1, a); } };
  if (cap & 1) capAt(0, !up); if (cap & 2) capAt(n - 1, up);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const shade = (c, k) => { const o = new THREE.Color(c).multiplyScalar(k); return '#' + o.getHexString(); };

function faceTex(skin, female, hairCol) {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = hex(skin); g.fillRect(0, 0, w, h);
    const cx = 128, blot = (x, y, rx, ry, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry)); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, 7); g.fill(); g.restore(); };
    blot(cx, 196, 60, 26, shade(skin, 0.72), 0.35);                                   // bóng dưới cằm
    for (const s of [-1, 1]) { blot(cx + s * 40, 148, 20, 14, '#d86a5a', female ? 0.22 : 0.12); blot(cx + s * 31, 116, 19, 11, shade(skin, 0.62), 0.42); }
    blot(cx, 140, 9, 22, shade(skin, 1.12), 0.5); blot(cx, 151, 13, 6, shade(skin, 0.7), 0.4);     // sống mũi sáng, bóng dưới mũi
    for (const s of [-1, 1]) {
      const ex = cx + s * 30, ey = 119;
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(ex, ey, 11.5, 5.2, 0, 0, 7); g.fill();
      g.fillStyle = '#3a2416'; g.beginPath(); g.arc(ex, ey, 5.1, 0, 7); g.fill(); g.fillStyle = '#0c0806'; g.beginPath(); g.arc(ex, ey, 2.4, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(ex + 1.8, ey - 1.8, 1.2, 0, 7); g.fill();
      g.strokeStyle = '#1a100a'; g.lineWidth = female ? 2.6 : 1.9; g.beginPath(); g.moveTo(ex - 12.5, ey + 0.5); g.quadraticCurveTo(ex, ey - 8.5, ex + 12.5, ey + 0.5); g.stroke();
      g.strokeStyle = shade(skin, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(ex - 11, ey + 3); g.quadraticCurveTo(ex, ey + 7.5, ex + 11, ey + 3); g.stroke();
      g.strokeStyle = hex(hairCol); g.lineWidth = female ? 3 : 4.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - s * 13, ey - 14); g.quadraticCurveTo(ex, ey - (female ? 19 : 17), ex + s * 14, ey - 12.5); g.stroke();
      g.fillStyle = shade(skin, 0.5); g.beginPath(); g.ellipse(cx + s * 5.5, 152, 2.6, 1.6, 0, 0, 7); g.fill();
    }
    g.fillStyle = female ? '#b8504a' : shade(skin, 0.72); g.beginPath(); g.moveTo(cx - 15, 171); g.quadraticCurveTo(cx - 6, 165.5, cx, 168); g.quadraticCurveTo(cx + 6, 165.5, cx + 15, 171); g.quadraticCurveTo(cx, 180, cx - 15, 171); g.fill();
    g.strokeStyle = shade(skin, 0.45); g.lineWidth = 1.3; g.beginPath(); g.moveTo(cx - 15, 171); g.quadraticCurveTo(cx, 173.5, cx + 15, 171); g.stroke();
  });
}
function torsoTex(outfit) {
  return canvasTex(256, 256, (g, w, h) => {
    const fx = w * 0.25, line = (x, c, lw) => { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); };
    if (outfit === 'jacket') { g.fillStyle = '#1f4a9a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h * 0.2); g.fillRect(0, h * 0.86, w, h * 0.05); line(fx, '#c8ccd2', 3); for (const x of [0, w * 0.5, w]) line(x, '#f2f2ee', 7); g.fillStyle = '#d8262b'; g.fillRect(fx + 22, h * 0.3, 16, 16); }
    else if (outfit === 'pe') { g.fillStyle = '#e9edf2'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f3f8a'; g.fillRect(0, 0, w, h * 0.12); for (const x of [0, w * 0.5, w]) line(x, '#1f3f8a', 9); g.fillStyle = '#1f3f8a'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('TP', fx, h * 0.42); }
    else { g.fillStyle = outfit === 'teacher' ? '#dfe7f2' : '#f3f2ec'; g.fillRect(0, 0, w, h); line(fx, 'rgba(120,125,135,.55)', 2); for (let y = 26; y < h - 30; y += 40) { g.fillStyle = 'rgba(150,150,150,.9)'; g.beginPath(); g.arc(fx, y, 2.6, 0, 7); g.fill(); } if (outfit !== 'aodai') { g.strokeStyle = 'rgba(120,125,135,.6)'; g.lineWidth = 1.5; g.strokeRect(fx + 16, h * 0.3, 26, 26); if (outfit === 'white') { g.fillStyle = '#c8262b'; g.fillRect(fx + 21, h * 0.33, 16, 11); } } }
    const gr = g.createLinearGradient(0, 0, w, 0); for (const [o, a] of [[0, 0.16], [0.25, 0], [0.5, 0.16], [0.75, 0.08], [1, 0.16]]) gr.addColorStop(o, `rgba(0,0,0,${a})`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(0,0,0,.035)'; g.lineWidth = 2 + (i % 3); g.beginPath(); const x = (i * 53) % w; g.moveTo(x, h * 0.2); g.quadraticCurveTo(x + 9, h * 0.5, x - 5, h * 0.96); g.stroke(); }
  });
}
function headGeo(female) {
  const g = new THREE.SphereGeometry(1, 36, 28), P = g.attributes.position, G = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const t = Math.max(0, -y), jaw = Math.pow(t, 1.35);
    let sx = 0.088 * (1 - (female ? 0.36 : 0.3) * jaw), sz = 0.103 * (1 - 0.2 * jaw), sy = y > 0 ? 0.108 : 0.124, oz = 0;
    if (z > 0) { oz += 0.019 * G(x, y, 0, -0.16, 0.13, 0.17) + 0.007 * G(x, y, 0, -0.3, 0.2, 0.06) + 0.008 * G(x, y, 0, -0.62, 0.3, 0.2) + 0.004 * G(x, y, 0, 0.2, 0.6, 0.1); oz -= 0.007 * (G(x, y, 0.36, 0.06, 0.16, 0.1) + G(x, y, -0.36, 0.06, 0.16, 0.1)); }
    P.setXYZ(i, x * sx, y * sy, z * sz + (z > 0 ? oz : 0) + 0.006);
  }
  g.computeVertexNormals(); return g;
}
function hairGeo(style) {
  const g = new THREE.SphereGeometry(1, 30, 20), P = g.attributes.position, sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const front = style === 'crop' ? 0.6 : style === 'side' ? 0.48 : 0.44, back = style === 'crop' ? -0.1 : -0.42, side = style === 'crop' ? 0.3 : 0.08, puff = style === 'crop' ? 1.03 : style === 'side' ? 1.07 : 1.06;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const f = sm(-0.05, 0.55, z), bk = sm(0.1, -0.5, z);
    let minY = side + (back - side) * bk; minY = minY + (front - minY) * f; if (style === 'side') minY += 0.1 * x * f;
    let k = puff; if (y < minY) { y = minY; k = 1.005; const r = Math.sqrt(Math.max(0.0001, 1 - y * y)), l = Math.hypot(x, z) || 1; x = x / l * r; z = z / l * r; }
    P.setXYZ(i, x * 0.088 * k, y * (y > 0 ? 0.108 : 0.124) * k + 0.004, z * 0.103 * k + 0.003);
  }
  g.computeVertexNormals(); return g;
}

/** Trả về { g (Group, chân tại y=0, mặt hướng +z), parts, phase, dispose() } */
/** các lần nạp mô hình có xương còn dang dở — màn hình chờ đợi tập này rỗng rồi mới cho vào chơi */
export const humansLoading = new Set();

export function buildHuman(look = {}) {
  const L = { ...DEFAULT_LOOK, ...look }, F = L.gender === 'f', skinC = SKINS[L.skin] ?? SKINS[1], hairC = HAIR_COLORS[L.hairColor] ?? HAIR_COLORS[0], b = 0.9 + 0.1 * L.build, o = L.outfit;
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); root.userData.noBake = true; g.scale.setScalar(L.height / 1.72);
  const disposables = [], M = (p) => { const m = new THREE.MeshStandardMaterial(p); disposables.push(m); if (p.map) disposables.push(p.map); return m; };
  const skin = M({ color: skinC, roughness: 0.58 }), face = M({ map: faceTex(skinC, F, hairC), roughness: 0.55 }), hair = M({ color: hairC, roughness: 0.42 });
  const topC = o === 'jacket' ? 0x1f4a9a : o === 'pe' ? 0xe9edf2 : o === 'teacher' ? 0xdfe7f2 : 0xf3f2ec, top = M({ map: torsoTex(o), roughness: 0.88 }), sleeve = M({ color: o === 'jacket' ? 0x1f4a9a : topC, roughness: 0.88 });
  const pantC = o === 'aodai' ? 0xf1f0ea : o === 'teacher' ? 0x2a2a30 : 0x1c2540, pants = M({ color: pantC, roughness: 0.82 }), shoe = M({ color: o === 'pe' ? 0xf0f0f0 : o === 'aodai' ? 0xe8e4dc : 0x1c1c1e, roughness: 0.45 });
  const add = (geo, mat, parent = g, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); disposables.push(geo); return m; };
  // thân
  const sh = (F ? 0.168 : 0.192) * b, ch = (F ? 0.15 : 0.172) * b, wa = (F ? 0.122 : 0.15) * b, hp = (F ? 0.172 : 0.162) * b;
  add(loft([[0.84, hp * 0.96, 0.108 * b], [0.93, hp, 0.115 * b], [1.04, wa, 0.098 * b], [1.16, ch * 0.97, 0.108 * b, 0, F ? 0.012 : 0.004], [1.27, ch, 0.114 * b, 0, F ? 0.02 : 0.008], [1.36, sh, 0.1 * b], [1.41, sh * 0.8, 0.085], [1.445, 0.062, 0.058]], 24), top);
  add(loft([[1.42, 0.052, 0.05], [1.5, 0.047, 0.047, 0, 0.004]], 14, 0), skin);
  if (o !== 'pe') add(loft([[1.425, 0.07, 0.066], [1.465, 0.058, 0.056, 0, -0.004], [1.47, 0.066, 0.062, 0, -0.004]], 16, 0), M({ color: o === 'jacket' ? 0xf2f2ee : topC, roughness: 0.85, side: THREE.DoubleSide }));
  add(loft([[0.8, hp * 0.95, 0.107 * b], [0.9, hp * 1.01, 0.117 * b]], 20, 1), pants);
  if (o === 'aodai') for (const s of [-1, 1]) { const flap = loft([[1.02, wa * 0.92, 0.012, 0, s * 0.1 * b], [0.6, hp * 0.9, 0.012, 0, s * 0.125], [0.12, hp * 0.98, 0.012, 0, s * 0.135]], 10); add(flap, top); }
  // đầu
  const head = new THREE.Group(); head.position.set(0, 1.618, 0.004); head.scale.setScalar(1.1); g.add(head);
  add(headGeo(F), face, head); add(hairGeo(L.hair), hair, head);
  for (const s of [-1, 1]) { const ear = new THREE.SphereGeometry(1, 10, 8); ear.scale(0.009, 0.024, 0.014); add(ear, skin, head, s * 0.086, -0.012, 0.002); }
  if (L.hair === 'long') add(loft([[0.03, 0.094, 0.05, 0, -0.062], [-0.12, 0.1, 0.05, 0, -0.07], [-0.3, 0.092, 0.036, 0, -0.082], [-0.4, 0.07, 0.02, 0, -0.088]], 14), hair, head);
  if (L.hair === 'bob') add(loft([[0.04, 0.098, 0.07, 0, -0.04], [-0.1, 0.104, 0.074, 0, -0.038], [-0.17, 0.098, 0.066, 0, -0.04]], 16, 0), M({ color: hairC, roughness: 0.42, side: THREE.DoubleSide }), head);
  if (L.hair === 'pony') { add(new THREE.SphereGeometry(0.026, 10, 8), hair, head, 0, 0.03, -0.108); add(loft([[0.02, 0.026, 0.024, 0, -0.118], [-0.14, 0.034, 0.028, 0, -0.14], [-0.3, 0.014, 0.012, 0, -0.125]], 10), hair, head); }
  // tay chân có khớp
  const parts = {}, long = o === 'jacket' || o === 'aodai' || o === 'teacher';
  for (const s of [-1, 1]) {
    const th = new THREE.Group(); th.position.set(s * 0.09 * b, 0.9, 0); th.scale.set(1.13, 1, 1.13); g.add(th);
    add(loft([[0.02, 0.086 * b, 0.09 * b], [-0.16, 0.078 * b, 0.082 * b], [-0.34, 0.06 * b, 0.064 * b], [-0.44, 0.052 * b, 0.056 * b]], 14), pants, th);
    const shn = new THREE.Group(); shn.position.y = -0.43; th.add(shn);
    add(loft([[0.03, 0.053 * b, 0.057 * b], [-0.12, 0.056 * b, 0.06 * b, 0, -0.006], [-0.3, 0.043 * b, 0.045 * b], [-0.41, 0.04 * b, 0.042 * b]], 14), pants, shn);
    const sg = new THREE.CapsuleGeometry(0.043, 0.13, 5, 12); sg.rotateX(Math.PI / 2); sg.scale(1, 0.72, 1); add(sg, shoe, shn, 0, -0.438, 0.045);
    const ua = new THREE.Group(); ua.position.set(s * (sh + 0.012), 1.372, 0); ua.rotation.z = s * 0.075; ua.scale.set(1.16, 1, 1.16); g.add(ua);
    add(new THREE.SphereGeometry(0.056 * b, 12, 10), sleeve, ua, 0, 0, 0);
    add(loft([[0.01, 0.054 * b, 0.056 * b], [-0.16, 0.047 * b, 0.049 * b], [long ? -0.29 : -0.18, 0.044 * b, 0.046 * b]], 12, 2), sleeve, ua);
    if (!long) add(loft([[-0.15, 0.041 * b, 0.043 * b], [-0.29, 0.036 * b, 0.038 * b]], 12), skin, ua);
    const fa = new THREE.Group(); fa.position.y = -0.28; ua.add(fa);
    add(loft([[0.02, 0.038 * b, 0.04 * b], [-0.1, 0.036 * b, 0.037 * b], [-0.25, 0.026 * b, 0.028 * b]], 12), long ? sleeve : skin, fa);
    const hand = new THREE.SphereGeometry(1, 12, 10); hand.scale(0.018, 0.05, 0.034); add(hand, skin, fa, 0, -0.295, 0.004);
    const thumb = new THREE.CapsuleGeometry(0.008, 0.028, 3, 6); thumb.rotateX(0.5); add(thumb, skin, fa, 0, -0.275, 0.034);
    parts[s] = { th, sh: shn, ua, fa };
  }
  const h = { g: root, parts, head, phase: Math.random() * 6, look: L, rig: null, dead: false, dispose() { h.dead = true; if (h.rig) h.rig.dispose(); for (const d of disposables) d.dispose(); } };
  // người dựng bằng mã chỉ là hình tạm: khi mô hình có xương nạp xong thì thay vào (thiếu tệp thì giữ hình tạm)
  h.ready = buildRigged(L).then((rig) => {
    if (!rig) return; if (h.dead) { rig.dispose(); return; }
    root.remove(g); root.add(rig.g); h.rig = rig;
  }).catch((e) => { if (!buildHuman.warned) { buildHuman.warned = true; console.warn('[người] không nạp được mô hình có xương, dùng hình dựng bằng mã:', e.message || e); } });
  humansLoading.add(h.ready); h.ready.finally(() => humansLoading.delete(h.ready));
  return h;
}

/** Hoạt hoạ đi/đứng dùng chung cho người chơi và nhân vật phụ; h.pose = mã dáng chụp ảnh, h.clip = tên clip phụ trong anims.glb ('talk', 'sit_idle'…, ưu tiên hơn h.pose) */
export function animateHuman(h, speed, dt, air, holding, t = 0) {
  if (h.rig) {
    // lỗi hoạt hoạ của một người (ví dụ tệp mô hình hỏng) không được làm dừng cả vòng lặp game
    if (!h.rigBroken) { try { const r = h.rig; r.pose = h.clip || (h.pose ? 'pose_' + h.pose : null); r.kick = h.kick || 0; r.armsDown = !!h.armsDown; r.eat = h.eat || 0; r.lookAt = h.lookAt || null; r.smileT = h.smile ?? null; animateRigged(r, speed, dt, air, holding, h.g); } catch (e) { h.rigBroken = true; console.error('[người] lỗi hoạt hoạ, giữ nguyên tư thế:', e); } }
    return;
  }
  h.phase += dt * (3 + speed * 2.1); const a = Math.min(1, speed / 3.2), sw = Math.sin(h.phase) * 0.72 * a, idle = 1 - a, br = Math.sin(t * 1.4 + h.phase * 0.01) * 0.012 * idle;
  for (const s of [-1, 1]) {
    const p = h.parts[s]; p.th.rotation.x = air ? -0.35 * (s > 0 ? 1 : 0.4) : -sw * s; p.sh.rotation.x = air ? 0.7 : Math.max(0, Math.sin(h.phase + (s > 0 ? Math.PI : 0) + 0.6)) * 1.05 * a;
    p.ua.rotation.x = holding && s > 0 ? -1.25 : sw * s * 0.75 + br * 2; p.fa.rotation.x = holding && s > 0 ? -0.5 : -0.16 - Math.abs(sw) * 0.5;
  }
  h.g.children[0].position.y = Math.abs(Math.sin(h.phase)) * 0.028 * a + br; h.head.rotation.x = br * 1.5;
}
