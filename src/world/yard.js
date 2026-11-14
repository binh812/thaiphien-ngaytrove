// Sân trường: sân khấu + màn LED trước nhà A, cột cờ, ghế sự kiện, phù điêu phía tây, sân bóng rổ, khu thể thao bắc, chi tiết quanh các nhà.
import * as THREE from 'three';
import { NS, DECO, RY, label, picture, flagPole, lamp, bench, star, logo, roundPlanter } from './kit.js';
import { yT, C } from './blocks.js';
import { hoopBoard } from './halls.js';
import { canvasTex } from '../engine/textures.js';
import { signMat } from '../engine/materials.js';
import { mulberry32, Q } from '../engine/util.js';

function vnMap(g, w, h) {
  g.fillStyle = '#f4ead0'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, h * 0.7, 0, h); gr.addColorStop(0, '#8fc27a'); gr.addColorStop(1, '#4f9a55'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, h * 0.86); for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.84 + Math.sin(x * 0.012) * h * 0.03); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  const pts = [[0.30, 0.02], [0.55, 0.03], [0.62, 0.10], [0.50, 0.18], [0.45, 0.25], [0.52, 0.35], [0.62, 0.45], [0.70, 0.55], [0.72, 0.65], [0.66, 0.74], [0.55, 0.80], [0.44, 0.86], [0.40, 0.80], [0.52, 0.70], [0.56, 0.60], [0.50, 0.50], [0.40, 0.40], [0.34, 0.28], [0.36, 0.18], [0.26, 0.10]];
  g.fillStyle = '#c8262b'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(w * (0.12 + x * 0.7), h * (0.06 + y * 0.82)) : g.moveTo(w * (0.12 + x * 0.7), h * (0.06 + y * 0.82)))); g.closePath(); g.fill();
  star(g, w * 0.46, h * 0.2, w * 0.05, '#ffde4a'); g.fillStyle = '#1f4fa0'; g.font = `bold ${w * 0.04}px Arial`; g.fillText('Hoàng Sa', w * 0.72, h * 0.42); g.fillText('Trường Sa', w * 0.74, h * 0.72);
  for (const [x, y] of [[0.8, 0.46], [0.84, 0.47], [0.82, 0.76], [0.87, 0.78], [0.85, 0.74]]) { g.fillStyle = '#c8262b'; g.beginPath(); g.arc(w * x, h * y, w * 0.008, 0, 7); g.fill(); }
}
function boards(g, w, h, title, cols) {
  g.fillStyle = '#d8442c'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffe680'; g.textAlign = 'center'; g.font = `bold ${h * 0.11}px Arial`; g.fillText(title, w / 2, h * 0.14, w * 0.9);
  const n = cols.length; cols.forEach((c, i) => { const x = w * (0.03 + i * 0.97 / n), ww = w * (0.94 / n - 0.02); g.fillStyle = '#fbf8ee'; g.fillRect(x, h * 0.22, ww, h * 0.7); g.fillStyle = '#1f4fa0'; g.font = `bold ${h * 0.085}px Arial`; c.forEach((t, k) => g.fillText(t, x + ww / 2, h * (0.36 + k * 0.12), ww * 0.9)); for (let k = c.length; k < 5; k++) { g.fillStyle = '#c9c4b4'; g.fillRect(x + ww * 0.1, h * (0.33 + k * 0.12), ww * 0.8, h * 0.02); } });
}
function gableBoard(B, w, x, z, ry, title, cols, roofBox) {
  picture(B, w, 1.7, 110, (g, ww, hh) => boards(g, ww, hh, title, cols), x, 1.35, z, ry);
  B.box('roofTile', 0xffffff, ...roofBox.slice(0, 2), 2.35, 2.5, ...roofBox.slice(2), DECO);
}

export function build(B, { blocks }) {
  const rnd = mulberry32(2026);
  // ---- khung sân khấu trên mặt nhà A + màn LED ----
  for (const [z1, z2] of [[-15.2, -13.4], [3.4, 5.2]]) B.box('metalPaint', 0x5aa7e6, 47.6, 48.6, 0, 15.2, z1, z2);
  B.box('metalPaint', C.RED, 47.6, 48.6, 12.9, 15, -13.4, 3.4, NS);
  label(B, 1.7, 10, ['TÔN', 'SƯ', 'TRỌNG', 'ĐẠO', '♥', '20 - 11'].map(t => ({ t })), { bg: '#5aa7e6', fg: '#ffffff', ppm: 70 }, 47.58, 8.2, -14.3, RY.W);
  label(B, 1.7, 10, ['TRI', 'ÂN', 'THẦY', 'CÔ', '♥', '2026'].map(t => ({ t })), { bg: '#5aa7e6', fg: '#ffffff', ppm: 70 }, 47.58, 8.2, 4.3, RY.W);
  picture(B, 17, 1.9, 60, (g, w, h) => { g.fillStyle = '#c8262b'; g.fillRect(0, 0, w, h); logo(g, h * 0.6, h / 2, h * 0.4); g.fillStyle = '#fff6d0'; g.textAlign = 'center'; g.font = `bold ${h * 0.3}px Arial`; g.fillText('TRƯỜNG TRUNG HỌC PHỔ THÔNG', w * 0.52, h * 0.36); g.font = `900 ${h * 0.46}px Arial`; g.fillText('THÁI PHIÊN', w * 0.52, h * 0.84); }, 47.58, 13.95, -5, RY.W);
  B.box('metalPaint', 0xf4f4f4, 48.1, 48.6, 4.3, 12.3, -13.2, 3.2, NS);
  B.spots.push({ type: 'led', x: 48.08, y: 8.3, z: -5, w: 15.2, h: 7.2, ry: RY.W });
  // sân khấu
  B.box('wood', 0x8a5a3a, 44.8, 47.6, 0, 0.8, -14, 4); B.box('fabric', 0xb0202a, 44.9, 47.5, 0.8, 0.83, -13.9, 3.9, DECO);
  for (let z = -14; z < 4; z += 0.45) { B.box('fabric', 0xc0202a, 44.76, 44.8, 0.02, 0.8, z, z + 0.23, DECO); B.box('fabric', 0x8e1820, 44.78, 44.8, 0.02, 0.8, z + 0.23, z + 0.45, DECO); }
  B.box('concrete', 0xa8a8a8, 44.2, 44.8, 0, 0.53, -7.5, -2.5); B.box('concrete', 0xa8a8a8, 43.6, 44.2, 0, 0.27, -7.5, -2.5);
  B.box('wood', 0x7a4a2a, 45.3, 46.1, 0.8, 1.95, -9.5, -8.6); label(B, 0.8, 0.5, [{ t: 'THÁI PHIÊN' }], { bg: '#7a4a2a', fg: '#ffd23f', ppm: 140 }, 45.28, 1.55, -9.05, RY.W);
  for (const z of [-13.4, 3.4]) { B.box('rubber', 0x1c1c1c, 45.6, 46.6, 0.8, 2.4, z - 0.5, z + 0.5); for (const y of [1.25, 1.95]) { const cone = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20); cone.rotateZ(Math.PI / 2); B.put('rubber', 0x3a3a3a, cone, 45.59, y, z, 0, DECO); } }
  B.spots.push({ type: 'speaker', x: 45.6, y: 1.6, z: -13.4 }, { type: 'speaker', x: 45.6, y: 1.6, z: 3.4 });
  // cột cờ chính + cờ trên nóc nhà A
  flagPole(B, 31.5, 0.3, -5, 12, 2.6); B.box('granite', 0xbdb6a6, 30.6, 32.4, 0, 0.3, -5.9, -4.1); flagPole(B, 55.5, yT(3), -11, 5, 2);
  // ghế nhựa sự kiện (vật thể động): lưới x -26..24, z -15.2..5.4, chừa lối giữa
  const step = Q.grass < 0.5 ? 3.2 : 1.6;
  for (let x = -26; x <= 24; x += step) for (let i = 0; i < 22; i++) { const z = -15.2 + i * 0.95; if (Math.abs(z + 5) < 1.1) continue; B.spawn.push({ type: 'stool', x, y: 0, z, color: (Math.round((z + 20) / 0.95) % 4 < 2) ? 0x1f5fd0 : 0xd8262b }); }
  // biển tập hợp lớp A1..A14
  for (let k = 0; k < 14; k++) { const z = -15.6 + 1.7 * k; B.box('steel', 0xd8d8d8, 26.98, 27.02, 0, 1.62, z - 0.02, z + 0.02, DECO); B.box('steel', 0xd8d8d8, 26.8, 27.2, 0, 0.03, z - 0.2, z + 0.2, DECO); label(B, 0.62, 0.45, [{ t: 'A' + (k + 1) }], { bg: '#1f4fa0', double: true, ppm: 110 }, 27, 1.85, z, RY.E); }

  // ---- phù điêu + bảng tin phía tây ----
  B.box('granite', 0x202327, -57.7, -57, 0, 4.4, -12.5, 3.5); B.box('granite', 0x15171a, -57.76, -56.94, 4.4, 4.6, -12.56, 3.56, NS); B.box('granite', 0x6e5a48, -57.7, -56.6, 0, 0.45, -12.5, 3.5, NS);
  picture(B, 9.6, 4.0, 80, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#c9963a'); gr.addColorStop(1, '#8a5a22'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 18; k++) { const a = -Math.PI * k / 17; g.strokeStyle = 'rgba(255,225,140,.55)'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, h * 0.42); g.lineTo(w / 2 + Math.cos(a) * w * 0.6, h * 0.42 + Math.sin(a) * h * 0.7); g.stroke(); }
    g.fillStyle = '#f2d27a'; g.beginPath(); g.arc(w / 2, h * 0.42, h * 0.17, 0, 7); g.fill();
    for (let k = 0; k < 12; k++) { const x = w * (0.07 + k * 0.078), y = h * (0.5 + (k % 2) * 0.05), s = h * 0.28; g.fillStyle = k % 2 ? '#6a4418' : '#7a5220'; g.fillRect(x - s * 0.11, y, s * 0.22, s); g.beginPath(); g.arc(x, y - s * 0.1, s * 0.1, 0, 7); g.fill(); if (k % 3 === 1) { g.lineWidth = 7; g.strokeStyle = '#6a4418'; g.beginPath(); g.moveTo(x + s * 0.08, y + s * 0.1); g.lineTo(x + s * 0.3, y - s * 0.3); g.stroke(); } }
    g.fillStyle = '#f6ecc8'; g.beginPath(); g.moveTo(w * 0.42, h * 0.72); g.lineTo(w * 0.5, h * 0.68); g.lineTo(w * 0.58, h * 0.72); g.lineTo(w * 0.58, h * 0.84); g.lineTo(w * 0.5, h * 0.8); g.lineTo(w * 0.42, h * 0.84); g.fill();
    for (let k = 0; k < 3; k++) { g.strokeStyle = 'rgba(60,40,10,.5)'; g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x += 10) g.lineTo(x, h * (0.9 + k * 0.03) + Math.sin(x * 0.04 + k * 2) * 6); g.stroke(); }
    g.strokeStyle = '#5a3a14'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
  }, -56.98, 2.45, -4.5, RY.E, { rough: 0.3 });
  for (const [zc, title] of [[-17.5, 'BẢNG TIN NHÀ TRƯỜNG'], [8.5, 'GƯƠNG SÁNG HỌC TẬP']]) {
    B.box('metalPaint', 0xa8382a, -57.3, -57, 0, 2.6, zc - 3.2, zc + 3.2); B.box('roofTile', 0xffffff, -57.5, -56.5, 2.6, 2.8, zc - 3.4, zc + 3.4, NS);
    picture(B, 6, 2, 100, (g, w, h) => { g.fillStyle = '#d8ecc0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8262b'; g.fillRect(0, 0, w, h * 0.18); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold ${h * 0.12}px Arial`; g.fillText(title, w / 2, h * 0.135); for (let i = 0; i < 4; i++) { g.fillStyle = '#fff'; g.fillRect(w * (0.04 + i * 0.24), h * 0.26, w * 0.2, h * 0.64); g.fillStyle = '#9aa'; for (let k = 0; k < 7; k++) g.fillRect(w * (0.06 + i * 0.24), h * (0.34 + k * 0.075), w * 0.16 * (0.6 + ((i * 7 + k * 3) % 5) / 12), h * 0.018); } }, -56.98, 1.35, zc, RY.E);
  }
  B.box('concrete', 0x6e6a64, -57, -53.6, 0, 0.55, -11, 2); B.box('brickPave', 0xffffff, -57, -53.6, 0.55, 0.6, -11, 2);
  B.box('brick', 0x8a5a4a, -53.6, -53.05, 0, 0.4, -7, -2); B.box('brick', 0x8a5a4a, -53.05, -52.5, 0, 0.2, -7, -2);
  // ---- sân bóng rổ ngoài trời ----
  B.box('court', 0x596360, -52.5, -37.5, 0, 0.012, -18, 10, DECO);
  { const L = (a, b, c, d) => B.box('court', 0xf2f2f2, a, b, 0.012, 0.016, c, d, DECO), t = 0.07;
    L(-52.5, -37.5, -18, -18 + t); L(-52.5, -37.5, 10 - t, 10); L(-52.5, -52.5 + t, -18, 10); L(-37.5 - t, -37.5, -18, 10); L(-52.5, -37.5, -4 - t / 2, -4 + t / 2);
    const ring = (r, x, z, a0, a1) => { const g = new THREE.RingGeometry(r - t, r, 48, 1, a0, a1); g.rotateX(-Math.PI / 2); B.put('court', 0xf2f2f2, g, x, 0.016, z, 0, DECO); };
    ring(1.8, -45, -4, 0, Math.PI * 2);
    for (const [zE, d] of [[-18, 1], [10, -1]]) { L(-47.45, -47.45 + t, Math.min(zE, zE + d * 5.8), Math.max(zE, zE + d * 5.8)); L(-42.55 - t, -42.55, Math.min(zE, zE + d * 5.8), Math.max(zE, zE + d * 5.8)); L(-47.45, -42.55, zE + d * 5.8 - t / 2, zE + d * 5.8 + t / 2); ring(1.8, -45, zE + d * 5.8, d > 0 ? Math.PI : 0, Math.PI); ring(6.75, -45, zE + d * 1.6, d > 0 ? Math.PI : 0, Math.PI); }
  }
  for (const [zB, zR, d] of [[-18.9, -17.65, 1], [10.9, 9.65, -1]]) {   // cột rổ di động
    B.box('metalPaint', 0x8a8a86, -45.6, -44.4, 0.1, 0.5, zB - 0.8, zB + 0.8); const post = new THREE.CylinderGeometry(0.07, 0.09, 3.5, 10); post.rotateX(-d * 0.3); B.put('metalPaint', 0xe8e8e8, post, -45, 1.95, zB + d * 0.55, 0, DECO);
    B.box('metalPaint', 0xe8e8e8, -45.05, -44.95, 3.3, 3.4, Math.min(zR, zB + d), Math.max(zR, zB + d), DECO); hoopBoard(B, -45, zR, 0, d);
  }
  B.spawn.push({ type: 'ball', kind: 'basket', x: -40, y: 0.2, z: -8 }, { type: 'ball', kind: 'basket', x: -45, y: 0.2, z: -12 }, { type: 'ball', kind: 'basket', x: -44, y: 0.2, z: 5 }, { type: 'ball', kind: 'basket', x: 12, y: 0.4, z: 47 }, { type: 'ball', kind: 'basket', x: 2, y: 0.4, z: 48 }, { type: 'ball', kind: 'volley', x: -6, y: 0.4, z: 46 });

  // ---- khu thể thao phía bắc ----
  B.box('grass', 0xcfeab0, -48, -14, 0, 0.02, -46.8, -35, DECO); B.lawns.push([-48, -14, -46.8, -35, 'field']);
  { const L = (a, b, c, d) => B.box('court', 0xffffff, a, b, 0.02, 0.03, c, d, DECO); L(-48, -14, -46.8, -46.6); L(-48, -14, -35.2, -35); L(-48, -47.8, -46.8, -35); L(-14.2, -14, -46.8, -35); L(-31.1, -30.9, -46.8, -35); }
  for (const x of [-47.6, -14.4]) { for (const z of [-42.9, -39]) B.cyl('metalPaint', 0xf4f4f4, x, 0, 2, z, 0.05, 0.05, 8); const bar = new THREE.CylinderGeometry(0.05, 0.05, 3.9, 8); bar.rotateX(Math.PI / 2); B.put('metalPaint', 0xf4f4f4, bar, x, 2, -40.95, 0, DECO); B.solid(x - 0.05, x + 0.05, 1.95, 2.05, -42.9, -39); }
  B.spawn.push({ type: 'ball', kind: 'soccer', x: -26, y: 0.2, z: -41 }, { type: 'ball', kind: 'soccer', x: -33, y: 0.2, z: -38 });
  B.box('court', 0xc0563a, -10, 8, 0, 0.012, -41.3, -40.1, DECO); B.box('court', 0xffffff, 7.8, 8, 0.012, 0.02, -41.3, -40.1, DECO);
  B.box('sand', 0xffffff, 8, 14, 0, 0.05, -42.2, -39.2, DECO); for (const z of [-42.3, -39.2]) B.box('wood', 0x9a8a6a, 8, 14, 0, 0.1, z, z + 0.1, NS);
  B.box('steel', 0x8a8f94, -10.53, -10.47, 0, 1.2, -39.73, -39.67, DECO); label(B, 2.2, 0.4, [{ t: 'BÃI TẬP NHẢY XA' }], { bg: '#2f8f5a', ppm: 110 }, -10.5, 1.4, -39.7, RY.E);

  // ---- cây ----
  for (const [x, z] of [[28, 9.5], [-58, -44], [-52, -40], [20, -45], [35.8, -12], [35.8, -20], [35.8, -28], [46.4, -21], [46.4, 9.6]]) B.trees.push({ x, z, s: 1, planter: true });
  for (const x of [-35, -26, -17, -8, 1, 10]) { B.box('brick', 0xffffff, x - 2, x + 2, 0, 0.4, 6.3, 8.1); B.box('grass', 0xb8dc9a, x - 1.85, x + 1.85, 0.4, 0.41, 6.45, 7.95, DECO); B.lawns.push([x - 1.8, x + 1.8, 6.5, 7.9, 'planter']); B.trees.push({ x, z: 7.2, s: 1, planter: false, y: 0.38 }); }
  for (const x of [-30.5, -21.5, -12.5, -3.5, 5.5]) B.trees.push({ x, z: 2.4, s: 1, planter: true });
  for (const x of [-27.5, -18.5, -9.5, -0.5, 8.5]) B.trees.push({ x, z: -11.4, s: 1, planter: true });
  B.trees.push({ kind: 'mango', x: 35.8, z: 3 }); roundPlanter(B, 35.8, 3, 1.25, 0.45); B.spots.push({ type: 'mango', x: 35.8, z: 3 });
  for (const [x, z] of [[36, 16], [36, 28], [36, 40], [-35.5, -2], [30, -12]]) lamp(B, x, z);
  for (const [x, z] of [[47.7, 15], [47.7, 23], [47.7, 31], [47.7, 39], [35.1, 20], [35.1, 34], [47.7, 44], [47.7, 52]]) flagPole(B, x, 0, z, 5.5, 0.8, 'red', 2.2);
  // chum sành
  const jar = new THREE.LatheGeometry([[0.001, 0], [0.2, 0], [0.32, 0.2], [0.34, 0.42], [0.27, 0.66], [0.19, 0.75], [0.22, 0.78], [0.2, 0.78]].map(p => new THREE.Vector2(...p)), 18);
  for (const [x, z] of [[44.2, -15.4], [44.2, 5.4], [46.6, 13.6]]) { B.put('gloss', 0x1e5a48, jar, x, 0, z, 0, NS); B.solid(x - 0.28, x + 0.28, 0, 0.78, z - 0.28, z + 0.28); B.hedges.push([x - 0.4, x + 0.4, 0.75, 1.3, z - 0.4, z + 0.4, 'flowerP']); }

  // ---- băng rôn 20-11 qua đường nội bộ ----
  for (const x of [36.9, 48.3]) { B.cyl('steel', 0x9aa0a6, x, 0, 5.8, 17.2, 0.06, 0.08, 10); B.put('gold', 0xffd23f, new THREE.SphereGeometry(0.11, 10, 8), x, 5.9, 17.2, 0, DECO); }
  label(B, 11.2, 1.6, [{ t: 'NHIỆT LIỆT CHÀO MỪNG NGÀY NHÀ GIÁO VIỆT NAM', c: '#ffe680' }, { t: '20 – 11 – 2026', s: 1.1, c: '#ffffff' }, { t: 'Tôn sư trọng đạo  ·  Tri ân thầy cô', s: 0.7, c: '#ffe9c8', f: 'italic bold' }], { grad: ['#d8232b', '#a9141b'], bg: '#d8232b', border: '#f2c94c', double: true, ppm: 70, rough: 0.85, cast: true }, 42.6, 4.75, 17.2, RY.S);
  // ---- trống trường ----
  { const DX = 51.15, DZ = 12.6; for (const z of [11.98, 13.16]) { B.box('wood', 0x6b3a1e, 50.6, 50.68, 0.15, 1.05, z, z + 0.06, DECO); B.box('wood', 0x6b3a1e, 51.62, 51.7, 0.15, 2.35, z, z + 0.06, DECO); B.box('wood', 0x6b3a1e, 50.6, 51.7, 0.8, 0.88, z, z + 0.06, DECO); }
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.43 + 0.07 * Math.sin(t * Math.PI), (t - 0.5) * 0.95)); }
    const body = new THREE.LatheGeometry(pts, 24); body.rotateZ(Math.PI / 2); B.put('wood', 0xa82a1c, body, DX, 1.3, DZ, 0, DECO);
    for (const s of [-1, 1]) { const skin = new THREE.CircleGeometry(0.43, 24); skin.rotateY(s * Math.PI / 2); B.put('fabric', 0xead6a8, skin, DX + s * 0.478, 1.3, DZ, 0, DECO); const band = new THREE.TorusGeometry(0.44, 0.02, 6, 24); band.rotateY(Math.PI / 2); B.put('gold', 0xd8a93a, band, DX + s * 0.45, 1.3, DZ, 0, DECO); }
    B.solid(50.6, 51.7, 0.15, 1.8, 11.98, 13.22); label(B, 1.5, 0.34, [{ t: 'TRỐNG TRƯỜNG' }], { bg: '#c8262b', ppm: 110 }, 51.6, 2.15, DZ, RY.W); B.spots.push({ type: 'drum', x: DX, y: 1.3, z: DZ }); }

  // ---- đầu hồi các nhà: tranh, chữ, bảng tin ----
  picture(B, 8.2, 9.45, 60, vnMap, 56.5, 7.875, 14.63, RY.S, { rough: 0.85 }); picture(B, 8.2, 9.45, 60, vnMap, 56.5, 7.875, -36.63, RY.N, { rough: 0.85 });
  for (const [z, ry] of [[14.65, RY.S], [-36.65, RY.N]]) label(B, 0.9, 0.9, [{ t: 'A', c: '#8a2a1a' }], { bg: '#e8bb48', ppm: 120, rough: 0.9 }, 50.5, 4.65, z, ry);
  gableBoard(B, 2.95, 57.5, 14.64, RY.S, 'QUYẾT TÂM THAY ĐỔI VÀ PHÁT TRIỂN', [['CHỦ ĐỀ NĂM HỌC', 'KỶ CƯƠNG', 'SÁNG TẠO', 'ĐỘT PHÁ'], ['KẾT QUẢ', 'NĂM HỌC']], [55.83, 59.18, 14.6, 15.5]);
  picture(B, 8.2, 5.25, 70, (g, w, h) => { g.fillStyle = '#2e6fd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8262b'; g.fillRect(0, 0, w, h * 0.24); g.fillStyle = '#ffe680'; g.textAlign = 'center'; g.font = `bold ${h * 0.075}px Arial`; g.fillText('TRƯỜNG THPT THÁI PHIÊN RA SỨC THI ĐUA', w / 2, h * 0.1); g.fillText('HỌC TẬP VÀ LÀM THEO TẤM GƯƠNG ĐẠO ĐỨC HỒ CHÍ MINH', w / 2, h * 0.2, w * 0.95); logo(g, w / 2, h * 0.48, h * 0.17); for (let k = 0; k < 9; k++) { const x = w * (0.1 + k * 0.1); g.fillStyle = '#ffffff'; g.fillRect(x - h * 0.035, h * 0.76, h * 0.07, h * 0.16); g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(x, h * 0.72, h * 0.035, 0, 7); g.fill(); } g.fillStyle = '#ffffff'; g.font = `italic bold ${h * 0.07}px Arial`; g.fillText('Vì sự nghiệp giáo dục', w / 2, h * 0.985); }, 35.03, 5.775, 19.5, RY.E, { rough: 0.85 });
  label(B, 0.9, 1.1, [{ t: 'B', c: '#8a2a1a' }], { bg: '#e8bb48', ppm: 120, rough: 0.9 }, 35.04, 2.4, 15.35, RY.E);
  { picture(B, 6.6, 1.7, 110, (g, w, h) => boards(g, w, h, 'SỔ TAY SỰ KIỆN', [['THÁI PHIÊN', '66 NĂM'], [], ['ẢNH', 'HOẠT ĐỘNG']]), 35.04, 1.35, 20.5, RY.E); B.box('roofTile', 0xffffff, 35, 35.9, 2.35, 2.5, 17, 24, DECO); }
  label(B, 0.9, 0.9, [{ t: 'C', c: '#8a2a1a' }], { bg: '#e8bb48', ppm: 120, rough: 0.9 }, -52.45, 4.65, -22.5, RY.W);
  // ---- quanh nhà C ----
  B.box('paint', C.WALL, 26.71, 26.96, 0.15, 4.1, -24, -21);
  picture(B, 12, 3.95, 60, (g, w, h) => { const bands = ['#1d3f93', '#ffffff', '#c8262b', '#ffffff', '#1d3f93', '#ffffff', '#c8262b', '#9a9a96']; bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, h * i / 8, w, h / 8 + 1); }); for (const fx of [0.3, 0.7]) { g.fillStyle = '#f0c95a'; g.beginPath(); g.moveTo(w * (fx - 0.09), h * 0.92); g.lineTo(w * (fx - 0.09), h * 0.4); g.arc(w * fx, h * 0.4, w * 0.09, Math.PI, 0); g.lineTo(w * (fx + 0.09), h * 0.92); g.fill(); g.fillStyle = '#6a3a22'; g.fillRect(w * (fx - 0.07), h * 0.42, w * 0.14, h * 0.5); g.strokeStyle = '#4a2616'; g.lineWidth = 3; for (let y = 0.45; y < 0.9; y += 0.035) { g.beginPath(); g.moveTo(w * (fx - 0.07), h * y); g.lineTo(w * (fx + 0.07), h * y); g.stroke(); } } }, 26.98, 2.125, -27, RY.E, { rough: 0.85 });
  B.box('paint', C.CREAM, 26.96, 27.02, 4.1, 4.4, -33, -21, DECO); for (const z of [-27.3, -29.7]) { B.box('wood', 0x6a3a22, 26.96, 27.02, 5.65, 7.35, z - 0.75, z + 0.75, DECO); B.box('gloss', 0x2a2420, 27.02, 27.03, 5.75, 7.25, z - 0.65, z + 0.65, DECO); }
  B.box('granite', 0xb8b0a0, 6.82, 15.36, 0, 0.08, -21, -20.25, NS);
  for (const x of [7.12, 15.06]) { B.box('brick', 0xffffff, x - 0.55, x + 0.55, 0, 0.45, -20.5, -19.4); B.trees.push({ kind: 'cone', x, z: -19.95, h: 5.2, slim: true, y: 0.4 }); }
  for (const [x1, x2] of [[-35, -21.5], [-18.5, -5], [-2, 11.5], [14.5, 25.5]]) { B.box('brick', 0xffffff, x1, x2, 0, 0.25, -18.5, -16.7); B.box('grass', 0xb8dc9a, x1 + 0.12, x2 - 0.12, 0.25, 0.26, -18.38, -16.82, DECO); B.lawns.push([x1 + 0.15, x2 - 0.15, -18.35, -16.85, 'planter']); }
  [-33.8, -30.2, -26.6, -23.0, -17.3, -13.7, -10.1, -6.5, -0.8, 2.8, 6.4, 10.0, 15.7, 19.3, 22.9].forEach((x, k) => B.trees.push({ kind: 'slim', x, z: k % 2 ? -17.4 : -17.8, h: 6.6 + (k % 3) * 0.5, y: 0.22 }));
  B.box('granite', 0x4f5357, -35.5, 26, 0, 0.014, -19.45, -19.1, DECO);
  for (const z of [-31.6, -30.7, -29.8]) { B.box('steel', 0xc6cbd0, 47.35, 47.85, 0, 1.25, z - 0.3, z + 0.3); B.box('glow', 0x2f7fe0, 47.34, 47.35, 0.95, 1.0, z - 0.2, z + 0.2, DECO); }
  B.spawn.push({ type: 'bin', x: 47.6, z: -33.4 }, { type: 'bin', x: 4.35, z: -20.45 }, { type: 'bin', x: 33, z: 12 }, { type: 'bin', x: -36, z: 11 });
  for (const [xa, xb] of [[8, 26], [-30, -12]]) { const L = (a, b, c, d) => B.box('court', 0xf2f2f2, a, b, 0, 0.006, c, d, DECO); L(xa, xb, -9.5, -9.41); L(xa, xb, -0.59, -0.5); for (const x of [xa, xa + 6, (xa + xb) / 2, xb - 6, xb - 0.09]) L(x, x + 0.09, -9.5, -0.5); }
  // backdrop chụp ảnh
  picture(B, 3.9, 3.094, 110, (g, w, h) => { g.fillStyle = '#fbf3df'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c8262b'; g.lineWidth = 12; g.strokeRect(10, 10, w - 20, h - 20); logo(g, w / 2, h * 0.27, h * 0.16); g.fillStyle = '#1f4fa0'; g.textAlign = 'center'; g.font = `900 ${h * 0.15}px Arial`; g.fillText('THÁI PHIÊN', w / 2, h * 0.62); g.fillStyle = '#c8262b'; g.font = `italic bold ${h * 0.11}px "Times New Roman", serif`; g.fillText('since 1960', w / 2, h * 0.77); g.fillStyle = '#2f8f5a'; g.font = `bold ${h * 0.07}px Arial`; g.fillText('NGÀY TRỞ VỀ', w / 2, h * 0.9); }, 29.8, 1.6, -27, RY.E, { double: true, cast: true });
  for (const z of [-27.9, -25.9]) B.box('steel', 0x8a8f94, 29.3, 29.78, 0, 0.05, z - 0.03, z + 0.03, DECO); B.box('fabric', 0xc0242e, 29.5, 33.2, 0, 0.03, -29.4, -24.6, DECO); B.solid(29.7, 29.9, 0, 3.1, -28.95, -25.05);
  // biển "THÁI PHIÊN – ngày trở về"
  picture(B, 7, 2.6, 90, (g, w, h) => { g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.lineJoin = 'round'; g.strokeStyle = '#ffffff'; g.lineWidth = h * 0.06; g.font = `900 ${h * 0.42}px Arial`; g.strokeText('THÁI PHIÊN', w / 2, h * 0.55); g.fillStyle = '#16883e'; g.fillText('THÁI PHIÊN', w / 2, h * 0.55); g.font = `italic bold ${h * 0.24}px "Times New Roman", serif`; g.strokeText('ngày trở về', w * 0.6, h * 0.86); g.fillStyle = '#f2c23c'; g.fillText('ngày trở về', w * 0.6, h * 0.86); g.strokeStyle = '#1f9a4a'; g.lineWidth = h * 0.035; g.beginPath(); g.moveTo(w * 0.3, h * 0.2); g.lineTo(w * 0.5, h * 0.05); g.lineTo(w * 0.7, h * 0.2); g.stroke(); }, 21, 1.5, 9.6, RY.S, { double: true, alpha: true, cast: true });
  B.box('metalPaint', 0x14713a, 17.6, 24.4, 0, 0.2, 9.52, 9.68); for (const x of [18, 24]) B.box('steel', 0x14713a, x - 0.04, x + 0.04, 0.2, 2.2, 9.56, 9.64, DECO); B.solid(17.6, 24.4, 0, 2.6, 9.55, 9.65);
  // ghế đá đầu hồi tây nhà C + bàn gỗ
  for (const z of [-24.9, -26.4, -27.9, -29.4, -30.9, -32.4]) bench(B, -52.8, z, 1.3, 'z', -1, 0xe9e6df);
  B.box('wood', 0x8a5a32, -53.7, -52.9, 0.7, 0.76, -34.9, -33.3); for (const [x, z] of [[-53.62, -34.82], [-53.02, -34.82], [-53.62, -33.42], [-53.02, -33.42]]) B.box('wood', 0x6f4526, x, x + 0.06, 0, 0.7, z, z + 0.06, DECO);
  // ghế nhựa trên hành lang, nón giao thông trước dốc
  for (const [x, z] of [[-40, -22.6], [-39.3, -22.6], [-8.6, 13.4], [-7.9, 13.4], [-7.2, 13.4], [50.6, -27.0], [50.6, -26.3]]) B.spawn.push({ type: 'stool', x, y: 0.15, z, color: 0x2f6fd0 });
  // lá rụng: rải quanh gốc cây (hệ hạt ở game/effects.js)
  B.spots.push({ type: 'leaves', seed: Math.floor(rnd() * 1e6) });
}
