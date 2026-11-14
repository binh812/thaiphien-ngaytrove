// Phố Đà Nẵng trước cổng: dãy nhà ống đối diện, quán sữa chua, xe xôi, trà đá, cột điện, cây vỉa hè.
import * as THREE from 'three';
import { NS, DECO, RY, label, picture, umbrella, scooter, tubeHouse } from './kit.js';
import { mulberry32 } from '../engine/util.js';

const SIGNS = ['PHOTO · IN MÀU', 'TẠP HÓA', 'BÁNH ĐA CUA', 'SÁCH · VĂN PHÒNG PHẨM', 'CAFE', 'NEM CUA BỂ', 'TRÀ SỮA', 'SỬA XE MÁY', 'BÚN CÁ CAY', 'CƠM VĂN PHÒNG', 'HIỆU THUỐC', 'KEM · SỮA CHUA', 'TẠP HÓA', 'GIẶT LÀ', 'BÁNH MÌ CAY'];
const COLS = [0xf2e3c4, 0xd9e8e2, 0xf4d6c6, 0xe6e0f0, 0xf6efc0, 0xcfe1f2, 0xf0d1d1], BGS = ['#c8262b', '#1f4fa0', '#2f8f5a', '#e8a21a', '#7a3fa0', '#1a8fa0'];
const FZ = 81.5;   // mặt tiền dãy đối diện cổng (quay bắc)

function shop(B, x1, x2, fl, color, lines, so = {}, o = {}) {
  const front = o.front ?? FZ, dir = o.dir ?? -1, zs = front + dir * 0.14;
  tubeHouse(B, { a: x1, b: x2, front, dir, axis: 'x', fl, depth: 11, color, ac: true, noGround: true });
  const bx = (kind, c, a, b, y1, y2, d1, d2) => B.box(kind, c, a, b, y1, y2, front + dir * d1, front + dir * d2, DECO);
  if (o.open) bx('flat', 0x4a3e32, x1 + 0.3, x2 - 0.3, 0.14, 2.7, -0.4, 0.02); else if (o.glass) { bx('glass', 0xffffff, x1 + 0.3, x2 - 0.3, 0.2, 2.7, 0.02, 0.05); bx('gloss', 0x1c2528, x1 + 0.3, x2 - 0.3, 0.2, 2.7, -0.01, 0.02); bx('steel', 0x9a9c9f, (x1 + x2) / 2 - 0.03, (x1 + x2) / 2 + 0.03, 0.2, 2.7, 0.05, 0.08); }
  else bx('metalCorr', o.shutter || 0xbfc2c6, x1 + 0.3, x2 - 0.3, 0.14, 2.7, 0.01, 0.05);
  if (lines) { const sh = so.h || 1.0; bx('flat', 0x3a3a3a, x1 + 0.2, x2 - 0.2, 2.8, 2.9 + sh, 0.02, 0.12); label(B, x2 - x1 - 0.5, sh, lines, { ppm: 90, rough: 0.5, glow: 0.35, ...so }, (x1 + x2) / 2, 2.85 + sh / 2, zs, dir < 0 ? RY.N : RY.S); }
  if (o.awning) for (let x = x1 + 0.2, i = 0; x < x2 - 0.2; x += 0.45, i++) { const g = new THREE.BoxGeometry(0.45, 0.03, 1.9); g.rotateX(-dir * 0.16); B.put('fabric', o.awning[i % o.awning.length], g, x + 0.225, 2.42, front + dir * 0.95, 0, NS); }
}

export function build(B) {
  const rnd = mulberry32(4711);
  B.setZone('street');
  // ---- dãy đối diện cổng, từ đông sang tây ----
  shop(B, 81, 86, 3, 0xe9e2d0, [{ t: 'ĐỒ ĂN NHANH', c: '#ffe94a' }, { t: 'TRÀ TẮC · TRÀ SỮA', s: 0.7 }], { bg: '#3f9a3a' }, { shutter: 0xe6c64a });
  shop(B, 76, 81, 3, 0xf1ead8, [{ t: 'BÁNH GÀ NÓNG GIÒN' }], { bg: '#f2ae1a' });
  shop(B, 71.8, 76, 3, 0xe8e4dc, [{ t: 'ĐIỆN THOẠI · SIM THẺ' }], { bg: '#1f6fd0' }, { awning: [0x2f5fb0, 0xf4f4f4] });
  shop(B, 67.4, 71.8, 3, 0xdad6cc, [{ t: 'TEA', c: '#333333' }], { bg: '#bfc2c0' }, { awning: [0x2f6fd0] });
  shop(B, 65, 67.4, 2, 0xd8c9a8, null);
  B.cyl('steel', 0x8a8f94, 65.3, 0.14, 3.3, 80.3, 0.04, 0.04, 8); label(B, 1.5, 0.5, [{ t: 'TRẦN QUỐC TOẢN' }], { bg: '#1f4fb0', border: '#ffffff', double: true, ppm: 120 }, 65.3, 3.0, 80.3, RY.N);
  shop(B, 53.5, 58, 4, 0xe9eef2, [{ t: 'VĂN PHÒNG PHẨM', c: '#c8262b' }], { bg: '#f4f4f0', border: '#e8862e' }, { glass: true });
  shop(B, 49.5, 53.5, 3, 0xe2b79f, [{ t: 'TRÀ SỮA', c: '#3a2a1a' }, { t: 'NƯỚC ÉP · SINH TỐ', c: '#3a2a1a', s: 0.8 }], { bg: '#f2b21a' }, { glass: true });
  shop(B, 44.5, 49.5, 4, 0xe8c66a, [{ t: 'Quán Gió Biển', f: 'italic bold' }, { t: 'Ca cao dầm · Trân châu · Kem', s: 0.6 }, { t: 'Mở cửa cả ngày', s: 0.45 }], { bg: '#f2ae18', h: 1.4 }, { open: true });
  shop(B, 38.5, 44.5, 4, 0xe6c88a, [{ t: 'SAO MAI', c: '#c8262b' }, { t: 'ĐIỆN THOẠI - PHỤ KIỆN', s: 0.6, c: '#1f4fa0' }, { t: 'Sửa chữa · Dán màn hình', s: 0.45, c: '#333333' }], { bg: '#eef0f0', h: 1.4 }, { glass: true });
  shop(B, 33.5, 38.5, 3, 0xdfe6da, [{ t: 'SỮA CHUA HOA SỮA', c: '#1f8a4c' }, { t: 'Quán quen cổng trường', s: 0.55, c: '#1f8a4c' }], { bg: '#ffffff', border: '#1f8a4c', h: 1.2 }, { open: true });
  shop(B, 28, 33.5, 3, 0xf0dcc0, [{ t: 'PHỤ KIỆN' }], { bg: '#f08a1c' }, { glass: true });
  let i = 0; for (let x = 28; x > -112;) { const w = 4.5 + rnd() * 2.5, fl = 2 + Math.floor(rnd() * 3); shop(B, x - w, x, fl, COLS[i % 7], [{ t: SIGNS[i % 15] }], { bg: BGS[i % 6], h: 0.8 }, { glass: rnd() > 0.3 }); x -= w; i++; }
  i = 5; for (let x = 86; x < 112;) { const w = 4.5 + rnd() * 2.5, fl = 2 + Math.floor(rnd() * 3); shop(B, x, x + w, fl, COLS[i % 7], [{ t: SIGNS[i % 15] }], { bg: BGS[i % 6], h: 0.8 }, { glass: rnd() > 0.3 }); x += w; i++; }
  // dãy cùng phía trường, phía đông cổng (quay nam)
  shop(B, 74.2, 81.5, 3, 0xe9e2d2, [{ t: 'DÙNG ĐIỆN AN TOÀN, TIẾT KIỆM', c: '#7a1e5a' }], { bg: '#f2b6d8', h: 0.9 }, { front: 54.6, dir: 1, glass: true, awning: [0xf4f4f4, 0x4a4a4a] });
  shop(B, 81.5, 89.5, 3, 0xf2f2ee, [{ t: 'FOOD & COFFEE', c: '#1f7a4a' }], { bg: '#f6f6f2' }, { front: 54.6, dir: 1, awning: [0x3f9a7a] });
  i = 3; for (let x = 89.5; x < 112;) { const w = 4.6 + rnd() * 2.2; shop(B, x, x + w, 2 + Math.floor(rnd() * 2), COLS[i % 7], [{ t: SIGNS[(i + 8) % 15] }], { bg: BGS[i % 6], h: 0.8 }, { front: 54.6, dir: 1, glass: rnd() > 0.4 }); x += w; i++; }
  // dãy phía tây cổng sau hàng rào không có nhà (là trường) — phố Trần Quốc Toản: 2 dãy nhà dọc theo z
  for (const [fx, dir] of [[58, -1], [65, 1]]) for (let z = 93; z < 130;) { const w = 4.5 + rnd() * 2; tubeHouse(B, { a: z, b: z + w, front: fx, dir: -dir, axis: 'z', fl: 2 + Math.floor(rnd() * 3), depth: 10, color: COLS[Math.floor(rnd() * 7)] }); z += w; }

  // ---- quán sữa chua Thùy Dương ----
  for (const y of [1.0, 1.5, 2.0]) { B.box('wood', 0xd8c8a8, 34.0, 36.9, y, y + 0.04, 81.52, 81.82, DECO); for (let k = 0; k < 9; k++) B.box('plastic', [0xe84a3a, 0xf2c21a, 0x3a9a4a, 0x2f6fd0, 0xf08ab0][(k + y * 2 | 0) % 5], 34.15 + k * 0.3, 34.36 + k * 0.3, y + 0.04, y + 0.3, 81.58, 81.76, DECO); }
  B.box('gloss', 0xf4f4f4, 37.05, 37.75, 0.16, 1.9, 81.3, 81.75); B.box('glass', 0xffffff, 37.1, 37.7, 0.3, 1.8, 81.27, 81.3, DECO);
  B.box('plastic', 0xd8262b, 34.5, 36.1, 0.14, 1.0, 80.2, 80.85); B.box('granite', 0xf4f4f4, 34.45, 36.15, 1.0, 1.05, 80.15, 80.9, NS);
  umbrella(B, 35.4, 79.75, 1.7, 2.6, [0xf08ab0, 0xf2c21a, 0xfafafa]);
  picture(B, 0.62, 1.55, 160, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f9a4a'; g.fillRect(0, 0, w, h * 0.16); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold ${h * 0.06}px Arial`; g.fillText('SỮA CHUA · GIẢI KHÁT', w / 2, h * 0.1, w * 0.92); g.fillStyle = '#c8262b'; g.font = `bold ${h * 0.085}px Arial`; ['CA CAO DẦM', 'TRÀ SỮA', 'TRÀ TẮC', 'SINH TỐ', 'NƯỚC ÉP'].forEach((t, k) => g.fillText(t, w / 2, h * (0.3 + k * 0.125))); g.fillStyle = '#1f8a4c'; g.font = `${h * 0.05}px Arial`; g.fillText('Quán quen cổng trường', w / 2, h * 0.95); }, 37.94, 1.07, 80.2, RY.W, { double: true });
  B.box('metalPaint', 0x2f9a4a, 37.95, 38.0, 0.14, 1.99, 79.85, 80.55);
  label(B, 4.5, 1.5, [{ t: 'HOA SỮA', c: '#ffffff' }, { t: 'SỮA CHUA', c: '#ffe680' }], { bg: '#1f8a4c', border: '#f2c94c', ppm: 80, glow: 0.5, cast: true }, 36, 5.45, 80.6, RY.N);
  const tables = [[36.85, 79.8], [31.6, 76.7], [34.2, 76.7], [36.8, 76.7], [32.9, 78.25], [35.5, 78.25], [38.1, 78.25]], SC = [0xf2c21a, 0x3f9a4a, 0xd8322c];
  tables.forEach(([x, z], n) => { B.spawn.push({ type: 'table', x, y: 0.14, z }); if (n === 0) { for (const [dx, dz] of [[-0.65, -0.5], [0.65, -0.5], [-0.65, -0.9]]) B.spawn.push({ type: 'stool', x: x + dx, y: 0.14, z: z + dz, color: SC[n % 3], small: true }); return; } [[0, -0.62], [0.62, 0], [0, 0.62], [-0.62, 0]].forEach(([dx, dz], k) => B.spawn.push({ type: 'stool', x: x + dx, y: 0.14, z: z + dz, color: SC[(k + n) % (n % 2 ? 3 : 2)], small: true })); });
  umbrella(B, 33.0, 77.45, 1.6, 2.5, [0xf2c21a, 0xfafafa]); umbrella(B, 37.0, 77.45, 1.6, 2.5, [0x2f9a4a, 0xfafafa]);
  for (const x of [39.36, 40.64]) B.cyl('metalPaint', 0x1f8a4c, x, 0.14, 2.84, 75.58, 0.04, 0.04, 8);
  label(B, 1.3, 2.2, [{ t: 'MỜI VÀO NGỒI', s: 0.6, c: '#1f8a4c' }, { t: 'HOA', c: '#1f8a4c' }, { t: 'SỮA', c: '#1f8a4c' }, { t: 'SỮA CHUA', s: 0.8, c: '#d8262b' }, { t: 'Trân châu · Ca cao dầm', s: 0.45, c: '#333' }, { t: 'Nguyên vị · Cốm', s: 0.45, c: '#333' }], { bg: '#ffffff', border: '#1f8a4c', double: true, ppm: 110 }, 40, 1.7, 75.58, RY.S);
  // đồ trước dãy nhà
  umbrella(B, 56.2, 79.6, 1.5, 2.3, [0xd8402c]); umbrella(B, 51.2, 79.8, 1.5, 2.3, [0x2f9a4a]); umbrella(B, 42, 79.9, 1.5, 2.3, [0xe8d9b0]);
  for (const [x, z, c] of [[57.6, 79.2, 0x1c1c1c], [55.4, 79.4, 0xd8d8d8], [54.2, 79.3, 0x1c1c1c], [52.4, 79.5, 0xc8262b], [50.2, 79.2, 0x1c1c1c], [49.2, 79.3, 0x3a5fb0], [32.4, 79.4, 0xf4f4f4], [31.3, 79.3, 0xd8d8d0]]) scooter(B, x, z, c);
  B.box('metalPaint', 0xe8862e, 46.2, 47.6, 0.44, 1.5, 79.2, 80.0); B.box('gloss', 0xf4f4f4, 46.15, 47.65, 1.5, 1.54, 79.15, 80.05, NS);
  // ---- xe xôi, trà đá trước cổng ----
  B.box('metalPaint', 0x1e6fd1, 50.6, 53.6, 0.45, 1.35, 57, 58.2); B.box('steel', 0xdddddd, 50.55, 53.65, 1.35, 1.4, 56.95, 58.25, NS); B.box('glass', 0xffffff, 50.8, 52, 1.4, 1.95, 57.1, 58.1, DECO);
  for (const x of [51.2, 53]) { const w = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16); w.rotateX(Math.PI / 2); B.put('rubber', 0x1a1a1a, w, x, 0.44, 58.22, 0, DECO); }
  B.put('steel', 0xd0d4d8, new THREE.CylinderGeometry(0.26, 0.26, 0.36, 16), 52.8, 1.58, 57.6, 0, NS);
  label(B, 2.9, 0.8, [{ t: 'XÔI THỊT · BÁNH MÌ' }, { t: 'NÓNG GIÒN · 10K', s: 0.8, c: '#ffe680' }], { bg: '#1e6fd1', ppm: 110 }, 52.1, 0.9, 58.22, RY.S);
  B.box('fabric', 0x2f8f5a, 50.3, 53.9, 2.35, 2.4, 56.6, 58.8, NS); for (const x of [50.4, 53.8]) for (const z of [56.7, 58.7]) B.box('steel', 0xb0b4b8, x - 0.02, x + 0.02, 0.14, 2.35, z - 0.02, z + 0.02, DECO);
  B.box('wood', 0x9a6a3a, 27.2, 28.8, 0.6, 0.64, 57.6, 58.4); for (const [x, z] of [[27.25, 57.65], [28.7, 57.65], [27.25, 58.3], [28.7, 58.3]]) B.box('wood', 0x7a4a2a, x, x + 0.05, 0.14, 0.6, z, z + 0.05, DECO);
  B.spawn.push({ type: 'box', x: 27.6, y: 0.82, z: 58, sx: 0.16, sy: 0.34, sz: 0.16, color: 0xc8262b, mass: 0.8 });
  umbrella(B, 28, 58, 1.7, 2.6, [0xe8b23a]);
  label(B, 2, 0.5, [{ t: 'TRÀ ĐÁ · TRÀ CHANH', c: '#b4472f' }], { bg: '#f4ead0', border: '#b4472f', double: true, ppm: 110 }, 25.6, 1.2, 57.4, RY.S); B.box('wood', 0x7a4a2a, 25.57, 25.63, 0.14, 0.95, 57.37, 57.43, DECO);
  for (const [x, z, c] of [[26.6, 57.4, 0x1f5fd0], [26.6, 58.6, 0xd8262b], [29.4, 57.4, 0xd8262b], [29.4, 58.6, 0x1f5fd0], [55, 58.5, 0x1f5fd0], [55.7, 58.5, 0xd8262b], [49.8, 59.2, 0xd8262b]]) B.spawn.push({ type: 'stool', x, y: 0.14, z, color: c });
  umbrella(B, 75.6, 56.4, 1.5, 2.3, [0xd8402c]); B.box('metalPaint', 0xe8862e, 74.8, 76.4, 0.14, 1.0, 56.9, 57.3); scooter(B, 85.5, 56.4, 0x1c1c1c); scooter(B, 86.6, 56.5, 0xd8d8d8);
  // ---- cây vỉa hè, cột điện, dây ----
  for (const x of [-98, -82, -66, -50, -34, -18, -2, 14, 30, 62, 78, 94, 110]) B.trees.push({ x, z: 59.7, s: 0.9, planter: false, y: 0.14 });
  for (const x of [-92, -76, -60, -44, -28, -12, 4, 20, 52, 68, 84, 100]) B.trees.push({ x, z: 76.3, s: 0.85, planter: false, y: 0.14 });
  for (const x of [-96, -62, -28, 6, 40, 74]) { B.cyl('concrete', 0x9a9c9f, x, 0.14, 8.6, 75.55, 0.11, 0.15, 10); B.box('steel', 0x7a7c7f, x - 0.05, x + 0.05, 7.5, 7.6, 74.8, 76.3, DECO); B.lamps.push({ x, y: 7.0, z: 74.6, power: 1, street: true }); B.box('steel', 0x7a7c7f, x - 0.03, x + 0.03, 6.95, 7.0, 73.9, 75.5, DECO); B.box('glow', 0xffe8b8, x - 0.12, x + 0.12, 6.88, 6.95, 73.9, 74.5, DECO); }
  B.spots.push({ type: 'wires', pts: [[7.62, 74.9], [7.62, 75.5], [7.62, 76.2], [6.9, 75.6], [6.6, 75.45]], xs: [-112, -96, -62, -28, 6, 40, 74, 112] });
  B.solid(-118, -112, 0, 20, -60, 140); B.solid(112, 118, 0, 20, -60, 140); B.solid(-118, 118, 0, 20, 128, 132);
  B.setZone('main');
}
