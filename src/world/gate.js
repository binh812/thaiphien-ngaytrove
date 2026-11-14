// Tường bao, hàng rào phía nam, cổng trường, chốt bảo vệ, trang trí 20-11, mặt tiền Ban giám hiệu, nhà dân quanh trường.
import * as THREE from 'three';
import { NS, DECO, RY, label, picture, hipRoof, flagPole, tubeHouse, logo } from './kit.js';
import { yT } from './blocks.js';
import { mulberry32 } from '../engine/util.js';

const GZ = 54.6;       // trục hàng rào/cổng phía nam
function fence(B, x1, x2) {
  B.box('paint', 0xddd0ae, x1, x2, 0, 0.9, GZ - 0.2, GZ + 0.2);
  for (let x = x1; x <= x2 + 0.01; x += 4) { B.box('paint', 0xddd0ae, x - 0.3, x + 0.3, 0, 2.6, GZ - 0.3, GZ + 0.3, NS); B.box('roofTile', 0xffffff, x - 0.38, x + 0.38, 2.6, 2.75, GZ - 0.38, GZ + 0.38, DECO); }
  for (let x = x1 + 0.15; x < x2; x += 0.18) B.box('metalPaint', 0x6e2a22, x - 0.014, x + 0.014, 0.9, 2.45, GZ - 0.014, GZ + 0.014, DECO);
  for (const y of [1.5, 2.4]) B.box('metalPaint', 0x6e2a22, x1, x2, y, y + 0.05, GZ - 0.025, GZ + 0.025, DECO);
  B.solid(x1, x2, 0, 2.6, GZ - 0.2, GZ + 0.2);
}
function gateLeaf(B, alongX, a1, a2, fixed, dynamic) {
  if (dynamic) { B.spawn.push({ type: 'gateLeaf', alongX, a1, a2, fixed }); return; }
  const bx = (u1, u2, y1, y2, w, kind, c) => (alongX ? B.box(kind, c, u1, u2, y1, y2, fixed - w, fixed + w, DECO) : B.box(kind, c, fixed - w, fixed + w, y1, y2, u1, u2, DECO));
  bx(a1, a2, 0.08, 1.35, 0.02, 'metalPaint', 0xa9b0b4); for (const [y1, y2] of [[0.05, 0.12], [1.35, 1.45], [2.2, 2.3]]) bx(a1, a2, y1, y2, 0.035, 'metalPaint', 0x8b9398);
  for (let u = a1 + 0.05; u < a2; u += 0.2) bx(u - 0.015, u + 0.015, 1.45, 2.55, 0.015, 'metalPaint', 0x8b9398);
  if (alongX) B.solid(a1, a2, 0, 2.5, fixed - 0.05, fixed + 0.05); else B.solid(fixed - 0.05, fixed + 0.05, 0, 2.5, a1, a2);
}

export function build(B) {
  // tường bao 3 phía
  B.box('paint', 0xe0d4b4, -63.4, -63, 0, 2.6, -48.4, 54.6); B.box('paint', 0xe0d4b4, 73, 73.4, 0, 2.6, -48.4, 54.6); B.box('paint', 0xe0d4b4, -63.4, 73.4, 0, 2.6, -48.8, -48.4);
  for (const [a, b, c, d] of [[-63.45, -62.95, -48.4, 54.6], [72.95, 73.45, -48.4, 54.6], [-63.4, 73.4, -48.85, -48.35]]) B.box('roofTile', 0xd0b0a0, a, b, 2.6, 2.68, c, d, DECO);
  fence(B, -63, 34.5); fence(B, 47.5, 73);
  // băng rôn mặt ngoài rào
  const ban = (x, w, lines, o) => label(B, w, 1.5, lines, { ppm: 90, rough: 0.8, ...o }, x, 1.6, GZ + 0.33, RY.S);
  ban(30.2, 4.8, [{ t: 'KINH TẾ TUẦN HOÀN', c: '#1f7a3a' }, { t: 'VÌ TƯƠNG LAI XANH HƠN', s: 0.8, c: '#2f8f5a' }], { bg: '#d8f0c8', border: '#2f8f5a' });
  ban(22, 4.8, [{ t: 'AN TOÀN GIAO THÔNG', c: '#c8262b' }, { t: 'CHO NỤ CƯỜI NGÀY MAI', s: 0.8, c: '#1f4fa0' }], { bg: '#e8f0fb', border: '#1f4fa0' });
  ban(13.8, 4.8, [{ t: 'NÓI KHÔNG VỚI', s: 0.8, c: '#ffffff' }, { t: 'MA TÚY – BẠO LỰC HỌC ĐƯỜNG', s: 0.9, c: '#ffe680' }], { bg: '#c8262b', border: '#ffe680' });
  ban(5.6, 4.8, [{ t: 'TRƯỜNG HỌC', s: 0.7, c: '#1f4fa0' }, { t: 'XANH – SẠCH – ĐẸP – AN TOÀN', c: '#2f8f5a' }], { bg: '#f6f6e8', border: '#2f8f5a' });
  ban(-10, 6.4, [{ t: 'THI ĐUA LẬP THÀNH TÍCH CHÀO MỪNG', s: 0.8, c: '#ffe680' }, { t: 'NGÀY NHÀ GIÁO VIỆT NAM 20-11', c: '#ffffff' }], { bg: '#1f4fa0', border: '#ffe680' });
  ban(-26, 4.8, [{ t: 'DẠY TỐT – HỌC TỐT', c: '#c8262b' }, { t: 'Kỷ cương · Tình thương · Trách nhiệm', s: 0.65, c: '#1f4fa0', f: 'italic bold' }], { bg: '#fff8dc', border: '#c8262b' });
  ban(52.2, 4.8, [{ t: 'AN TOÀN GIAO THÔNG', s: 0.85, c: '#ffffff' }, { t: 'ĐỘI MŨ BẢO HIỂM KHI ĐI XE', s: 0.75, c: '#ffe680' }], { bg: '#1f4fa0', border: '#ffffff' });
  ban(59.4, 4.8, [{ t: 'CHUNG TAY', s: 0.8, c: '#1f7a3a' }, { t: 'BẢO VỆ MÔI TRƯỜNG', c: '#1f7a3a' }], { bg: '#e0f2d0', border: '#1f7a3a' });

  // ---- cổng trường ----
  const RED = 0x8e2626, TAN = 0xc79a5a, CREAM = 0xf2ead6;
  for (const [a, b] of [[37.3, 38.3], [43.7, 44.7]]) { B.box('paint', RED, a, b, 0, 5.2, 54.0, 55.2); B.box('granite', 0x5a5a5c, a - 0.06, b + 0.06, 0, 0.5, 53.94, 55.26, NS); }
  for (const [a, b] of [[34.5, 35.3], [46.7, 47.5]]) B.box('paint', TAN, a, b, 0, 3.4, 54.1, 55.1);
  B.box('paint', CREAM, 37.0, 45.0, 4.0, 5.25, 54.0, 55.2, NS); B.box('paint', CREAM, 36.4, 45.6, 5.25, 5.45, 53.2, 56.0, NS);
  hipRoof(B, 9.0, 3.2, 1.5, 41, 5.45, 54.6);
  for (const cx of [36.3, 45.7]) { B.box('paint', CREAM, cx - 1.3, cx + 1.3, 3.0, 3.55, 54.1, 55.1, NS); B.box('paint', CREAM, cx - 1.7, cx + 1.7, 3.55, 3.72, 53.5, 55.7, NS); hipRoof(B, 3.4, 2.2, 0.9, cx, 3.72, 54.6); }
  label(B, 6.6, 0.98, [{ t: 'TRƯỜNG TRUNG HỌC PHỔ THÔNG', s: 0.7, c: '#f2c94c' }, { t: 'THÁI PHIÊN', s: 1.2, c: '#f7d24a', f: '900' }], { bg: '#1c2f86', border: '#d9b84a', ppm: 120, rough: 0.35 }, 41, 4.62, 55.22, RY.S);
  label(B, 6.6, 1.2, [{ t: 'TRƯỜNG THÁI PHIÊN', c: '#ffffff' }, { t: 'NIỀM TỰ HÀO CỦA CHÚNG EM', s: 0.85, c: '#ffffff' }], { bg: '#1a9aa8', border: '#d9b84a', ppm: 100 }, 41, 4.62, 53.98, RY.N);
  // cánh cổng chính: 2 cánh có bản lề, đẩy được; cổng phụ đóng
  B.spawn.push({ type: 'gate', hinge: [38.36, 54.0], len: 2.7, open: -Math.PI / 2 * 0.96, side: 1 });
  B.spawn.push({ type: 'gate', hinge: [43.64, 54.0], len: 2.7, open: Math.PI / 2 * 0.96, side: -1 });
  gateLeaf(B, true, 35.3, 37.3, 54.6); gateLeaf(B, true, 44.7, 46.7, 54.6);
  // băng rôn 20-11 dưới dầm cổng
  for (const [z, ry] of [[55.24, RY.S], [53.96, RY.N]]) label(B, 5.3, 0.78, [{ t: 'CHÀO MỪNG NGÀY NHÀ GIÁO VIỆT NAM', c: '#ffe680' }, { t: '20 – 11 – 2026', c: '#ffffff' }], { bg: '#c8262b', border: '#ffe680', ppm: 110, rough: 0.8 }, 41, 3.56, z, ry);
  // lẵng hoa
  const FL = [0xd8262b, 0xf2c21a, 0xf08ab0, 0xfafaf4, 0x9b59b6, 0xf08a1c], hw = [0.42, 0.6, 0.72, 0.74, 0.62, 0.44, 0.22], bud = new THREE.IcosahedronGeometry(0.115, 1);
  [[36.75, 56.0], [37.9, 56.25], [44.1, 56.25], [45.25, 56.0]].forEach(([x, z], n) => {
    for (const [dx, dz] of [[-0.25, 0.15], [0.25, 0.15], [0, -0.2]]) B.box('gold', 0xc9a040, x + dx - 0.015, x + dx + 0.015, 0.14, 1.0, z + dz - 0.015, z + dz + 0.015, DECO);
    B.box('wood', 0x8a5a32, x - 0.27, x + 0.27, 0.95, 1.22, z - 0.2, z + 0.2, DECO);
    hw.forEach((w, r) => { const y = 1.24 + 0.23 * r, zz = z - 0.035 * r; B.box('foliage', 0x3f8a3a, x - w, x + w, y - 0.08, y + 0.1, zz - 0.1, zz - 0.02, DECO); const cnt = Math.max(1, Math.round(w * 2 / 0.22)); for (let i = 0; i <= cnt; i++) { const fx = x - w + (2 * w) * i / cnt, edge = i === 0 || i === cnt || r === hw.length - 1; B.put('plastic', edge ? 0xd8262b : FL[(i + r * 2 + n) % 6], bud, fx, y, zz + 0.04, 0, DECO); } });
    B.solid(x - 0.3, x + 0.3, 0.14, 2.8, z - 0.25, z + 0.25);
  });
  flagPole(B, 48.3, 0.14, 55.9, 6.5, 1.6);
  // biển tên đường
  B.put('steel', 0x888888, new THREE.CylinderGeometry(0.05, 0.05, 3, 8), 31, 1.64, 60.2); label(B, 2.4, 0.5, [{ t: 'ĐƯỜNG ĐÀ NẴNG' }], { bg: '#1a5fb4', border: '#ffffff', double: true, ppm: 110 }, 31, 3.1, 60.2, RY.S);

  // ---- chốt bảo vệ ----
  B.box('paint', 0xe8bb48, 44.8, 47.6, 0, 2.6, 50, 52); B.box('paint', 0xf1e7cf, 44.6, 47.8, 2.6, 2.82, 49.8, 52.2, NS);
  B.box('wood', 0x2d5e3e, 44.75, 44.8, 0.02, 2.05, 50.2, 50.95, DECO); B.box('glass', 0xffffff, 44.76, 44.79, 1.1, 1.95, 51.15, 51.8, DECO); B.box('gloss', 0x26302f, 44.79, 44.805, 1.1, 1.95, 51.15, 51.8, DECO);
  label(B, 1.0, 0.28, [{ t: 'BẢO VỆ' }], { bg: '#7b3424', ppm: 140 }, 44.74, 2.32, 51.0, RY.W);

  // ---- mặt tiền nhà Ban giám hiệu ----
  picture(B, 3.4, 7.2, 90, (g, w, h) => {
    g.fillStyle = '#c8262b'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,220,120,.25)'); gr.addColorStop(1, 'rgba(90,0,0,.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    logo(g, w / 2, h * 0.16, w * 0.24); g.fillStyle = '#ffe680'; g.textAlign = 'center'; g.font = `900 ${w * 0.3}px Arial`; g.fillText('66', w / 2, h * 0.42); g.font = `bold ${w * 0.15}px Arial`; g.fillText('NĂM', w / 2, h * 0.52);
    g.fillStyle = '#ffffff'; g.font = `bold ${w * 0.085}px Arial`; g.fillText('XÂY DỰNG', w / 2, h * 0.63); g.fillText('& TRƯỞNG THÀNH', w / 2, h * 0.69); g.fillStyle = '#ffe680'; g.font = `bold ${w * 0.1}px Arial`; g.fillText('1960 – 2026', w / 2, h * 0.82);
  }, 48.88, 3.8, 50.2, RY.W);
  B.box('paint', 0xf4f0e6, 48.6, 49, 0.2, 7.6, 47.9, 48.6, NS); for (let k = 0; k < 9; k++) B.put('paint', 0xf4f0e6, new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI), 48.72, 0.9 + 0.75 * k, 48.25, -Math.PI / 2, DECO);
  B.box('paint', 0xf2efe6, 45.9, 49, 3.35, 3.55, 38.3, 43.7, NS); hipRoof(B, 5.2, 2.6, 0.8, 47.4, 3.55, 41);
  for (const z of [38.7, 43.3]) B.cyl('paint', 0xf6f4ee, 46.3, 0, 3.35, z, 0.2, 0.24, 16);
  for (let k = 0; k < 3; k++) B.box('granite', 0x9a3a2a, 45.6 + 0.45 * k, 49, 0, 0.05 * (k + 1), 38.6, 43.4);
  [33, 37, 45].forEach((z) => label(B, 0.48, 2.5, ['THI', 'ĐUA', 'DẠY', 'TỐT', 'HỌC', 'TỐT'].map(t => ({ t, c: '#ffe680' })), { bg: '#c8262b', ppm: 110, rough: 0.8 }, 48.94, 1.75, z, RY.W));
  label(B, 22, 0.85, [{ t: 'DÙ KHÓ KHĂN ĐẾN ĐÂU CŨNG PHẢI TIẾP TỤC THI ĐUA DẠY TỐT – HỌC TỐT' }], { bg: '#e8508a', fg: '#ffffff', ppm: 60, rough: 0.8 }, 48.96, yT(1) + 0.55, 41, RY.W);
  const fc = [0xd8262b, 0x2f8f5a, 0x1f4fa0, 0xf1c40f, 0xe84393, 0x8e44ad];
  for (let k = 0; k < 15; k++) { const z = 30 + 1.55 * k; B.box('steel', 0xcccccc, 48.89, 48.91, yT(1) + 0.9, yT(1) + 2.4, z - 0.01, z + 0.01, DECO); B.flags.push({ x: 48.9, y: yT(1) + 2.38, z, w: 0.5, h: 0.34, color: fc[k % 6], dir: -1, small: true }); }
  // mái tôn che sân thượng
  { const g = new THREE.BoxGeometry(14.5, 0.08, 25); g.rotateZ(-0.14); B.put('metalCorr', 0xa4a8ac, g, 55, 11.15, 41, 0, NS); for (const z of [30, 36, 42, 48, 52]) B.put('steel', 0x8a8f94, new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), 49.5, 10.75, z, 0, DECO); }

  // ---- nhà dân ngoài tường (cảnh nền) ----
  const rnd = mulberry32(77), PAL = [0xf3e9d2, 0xe9d6a8, 0xcfe3ea, 0xf2c9b0, 0xd9e8c4, 0xf6f1e6, 0xe6b8a0, 0xbcd3e6], ROOF = [0xb5523a, 0x8a8f96, 0xa9643c, 0x9aa3a8];
  B.setZone('town');
  const row = (axis, a0, a1, front, dir) => { for (let a = a0; a < a1;) { const w = 4.2 + rnd() * 3.2, fl = 2 + Math.floor(rnd() * 3.2); tubeHouse(B, { a, b: a + w - 0.15, front: front - dir * rnd() * 1.5, dir, axis, fl, depth: 9 + rnd() * 4, color: PAL[Math.floor(rnd() * 8)], roof: ROOF[Math.floor(rnd() * 4)], tank: rnd() < 0.6, noGround: true }); a += w; } };
  row('z', -54, 38, 78, -1); row('z', -54, 60, -68, 1); row('x', -68, 78, -53.5, 1);
  B.setZone('main');
  for (let z = -45; z < 53; z += 8.5 + rnd() * 3) B.trees.push({ x: 75.4, z, s: 1.15 + rnd() * 0.45, planter: false });
  for (let x = -58; x < 60; x += 9 + rnd() * 4) B.trees.push({ x, z: -51, s: 1.15 + rnd() * 0.45, planter: false });
}
