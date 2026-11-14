// Khu dịch vụ phía đông: nhà để xe 2 tầng sau nhà A, căng tin, nhà vệ sinh nối đầu bắc nhà A.
import * as THREE from 'three';
import { NS, DECO, RY, label, picture } from './kit.js';

function bicycle(B, x, z, c, y = 0) {
  const wheel = new THREE.TorusGeometry(0.33, 0.02, 6, 20);
  for (const d of [-0.52, 0.52]) B.put('rubber', 0x1a1a1a, wheel, x + d, y + 0.35, z, 0, DECO);
  const bar = (a, b, r = 0.018) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), g = new THREE.CylinderGeometry(r, r, d.length(), 6); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); B.put('metalPaint', c, g, x + A.x, y + A.y, z + A.z, 0, DECO); };
  bar([-0.52, 0.35, 0], [-0.15, 0.82, 0]); bar([-0.15, 0.82, 0], [0.35, 0.86, 0]); bar([0.35, 0.86, 0], [0.52, 0.35, 0]); bar([-0.52, 0.35, 0], [0.02, 0.36, 0]); bar([0.02, 0.36, 0], [0.35, 0.86, 0]); bar([0.02, 0.36, 0], [-0.15, 0.82, 0]); bar([0.35, 0.86, 0], [0.33, 1.02, 0]);
  B.box('rubber', 0x151515, x - 0.3, x - 0.05, y + 0.86, y + 0.91, z - 0.07, z + 0.07, DECO); B.box('steel', 0xbbbbbb, x + 0.31, x + 0.35, y + 1.0, y + 1.03, z - 0.25, z + 0.25, DECO);
  B.solid(x - 0.85, x + 0.85, y, y + 1.0, z - 0.12, z + 0.12);
}

function bikeShed(B) {
  const CC = 0x8f8a80;
  B.box('concrete', 0x5a5b5f, 62.6, 72.2, 0, 0.02, -36, 14.4, DECO); B.box('concrete', 0x9c9a94, 62.6, 72.2, 2.4, 2.6, -36, 14.4); B.box('concrete', CC, 62.6, 72.2, 0, 2.4, -36, -35.8);
  for (const z of [14.25, 7.95, 1.65, -4.65, -10.95, -17.25, -23.55, -29.85]) for (const x of [62.75, 72.05]) { B.box('concrete', CC, x - 0.15, x + 0.15, 0, 2.4, z - 0.15, z + 0.15); B.box('steel', 0x6a6f75, x - 0.06, x + 0.06, 3.55, 5.2, z - 0.06, z + 0.06, NS); }
  const Y = 0xe9cf7a;
  B.box('paint', Y, 62.6, 62.8, 2.6, 3.55, -36, 14.4); B.box('paint', Y, 72, 72.2, 2.6, 3.55, -36, 14.4); B.box('paint', Y, 62.6, 72.2, 2.6, 3.55, -36, -35.8); B.box('paint', Y, 62.6, 67.5, 2.6, 3.55, 14.2, 14.4); B.box('paint', Y, 71.9, 72.2, 2.6, 3.55, 14.2, 14.4);
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(5.3, 0.08, 51.6); g.rotateZ(-s * 0.2); B.put('metalCorr', 0x2f6b4f, g, 67.4 + s * 2.57, 5.65, -10.8, 0, NS); }
  B.box('concrete', CC, 67.5, 72.2, 0, 2.4, 14.2, 14.4);
  label(B, 2.9, 0.66, [{ t: 'NHÀ ĐỂ XE', c: '#1a1a1a' }], { bg: '#f4f4ee', border: '#c9b458', ppm: 110 }, 65.1, 3.1, 14.43, RY.S);
  // dốc lên tầng trên
  { const g = new THREE.BufferGeometry(), x1 = 67.6, x2 = 71.8, v = [[x1, 0, 22.6], [x2, 0, 22.6], [x2, 2.6, 14.4], [x1, 2.6, 14.4], [x1, -0.02, 22.6], [x2, -0.02, 22.6], [x2, 2.3, 14.4], [x1, 2.3, 14.4]], f = [[0, 1, 2], [0, 2, 3], [5, 4, 7], [5, 7, 6], [4, 0, 3], [4, 3, 7], [1, 5, 6], [1, 6, 2]], pos = [];
    for (const t of f) for (const k of t) pos.push(...v[k]); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); B.geo('pavers', 0xd8d8d8, g);
    B.ramp([[x1, 0, 22.6], [x2, 0, 22.6], [x1, 2.6, 14.4], [x2, 2.6, 14.4], [x1, -0.4, 22.6], [x2, -0.4, 22.6], [x1, 2.2, 14.4], [x2, 2.2, 14.4]]);
    for (const x of [67.5, 71.9]) { for (let i = 0; i < 16; i++) { const z = 22.6 - (i + 0.5) * 8.2 / 16, y = (22.6 - z) / 8.2 * 2.6; B.box('paint', Y, x - 0.08, x + 0.08, y - 0.1, y + 0.12, z - 0.27, z + 0.27, DECO); B.box('paint', Y, x - 0.07, x + 0.07, y + 0.9, y + 1.0, z - 0.27, z + 0.27, DECO); for (const dz of [-0.13, 0.13]) B.box('metalPaint', 0x1c1d20, x - 0.012, x + 0.012, y + 0.1, y + 0.92, z + dz - 0.012, z + dz + 0.012, DECO); B.solid(x - 0.08, x + 0.08, y - 0.2, y + 1.0, z - 0.27, z + 0.27); }
      B.box('paint', Y, x - 0.3, x + 0.3, 0, 1.2, 22.55, 23.15); B.box('paint', 0xdcc56e, x - 0.34, x + 0.34, 1.2, 1.28, 22.5, 23.2, DECO); } }
  for (const x of [68.4, 69.7, 71.0]) B.spawn.push({ type: 'cone', x, z: 23.9 });
  const cols = [0x2b5fb3, 0xc8262b, 0x2a2a2a, 0xe6e6e6, 0x2f8f5a, 0xe887a8, 0x6a3fa0, 0xf0b429];
  for (let i = 0; i < 9; i++) bicycle(B, 69.6, 12.4 - 0.7 * i, cols[i % 8]); for (let i = 0; i < 6; i++) bicycle(B, 64.4, 4 - 0.7 * i, cols[(i + 3) % 8]); for (let i = 0; i < 9; i++) bicycle(B, 64.6, 12.2 - 0.7 * i, cols[(i + 5) % 8], 2.6);
}

function canteen(B) {
  const T = 0xf2e6c4;
  B.setZone('canteen');
  B.box('floorTile', 0xe2d8c0, 51, 62, 0, 0.04, 22.2, 28.2, DECO);
  B.box('paint', T, 61.75, 62, 0, 3.3, 22.2, 28.2); B.box('paint', T, 51, 62, 0, 3.3, 22.2, 22.45); B.box('paint', T, 51, 62, 0, 3.3, 27.95, 28.2);
  for (const z of [22.35, 28.05]) B.box('paint', 0xd8c9a0, 51, 51.3, 0, 3.3, z - 0.15, z + 0.15);
  B.box('metalCorr', 0xb4472f, 49.6, 62.2, 3.3, 3.42, 21.9, 28.5);
  for (let i = 0; i < 10; i++) B.box('fabric', i % 2 ? 0xf4f4f4 : 0xd8262b, 49.58, 49.62, 2.85, 3.3, 22.2 + i * 0.6, 22.8 + i * 0.6, DECO);
  label(B, 4.2, 0.7, [{ t: 'CANTEEN', c: '#ffe680' }], { bg: '#d8262b', border: '#ffffff', ppm: 90 }, 49.55, 3.78, 25.2, RY.W);
  B.box('wood', 0x9a5a2a, 59.8, 60.5, 0, 1.05, 23.2, 27.2); B.box('granite', 0xe9dcc0, 59.74, 60.56, 1.05, 1.1, 23.14, 27.26, NS);
  B.box('glass', 0xffffff, 59.85, 60.4, 1.12, 1.55, 23.7, 25.2, DECO); B.box('steel', 0xc0c4c8, 59.85, 60.4, 1.55, 1.57, 23.7, 25.2, DECO);
  const snack = [0xe84a3a, 0xf2c21a, 0x3a9a4a, 0x2f6fd0, 0xe87a2a, 0x9b59b6]; for (let i = 0; i < 6; i++) B.spawn.push({ type: 'box', x: 60.15, y: 1.25, z: 25.75 + i * 0.28, sx: 0.16, sy: 0.24, sz: 0.06, color: snack[i], mass: 0.05 });
  B.box('gloss', 0xe8e8ec, 61.05, 61.7, 0, 2, 26.6, 27.5); B.box('glow', 0x9fd8ff, 61.04, 61.05, 1.75, 1.9, 26.7, 27.4, DECO);
  picture(B, 3.2, 1.6, 120, (g, w, h) => { g.fillStyle = '#1d4a35'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a040'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.fillStyle = '#ffe680'; g.textAlign = 'center'; g.font = `bold ${h * 0.14}px Arial`; g.fillText('THỰC ĐƠN', w / 2, h * 0.2); g.fillStyle = '#f4f4ec'; g.font = `${h * 0.105}px Arial`; g.textAlign = 'left'; ['Bánh mì pate ........... 15k', 'Xôi xéo ..................... 12k', 'Mì tôm trứng .......... 20k', 'Sữa đậu nành .......... 5k', 'Trà đá ......................... 3k'].forEach((t, i) => g.fillText(t, w * 0.1, h * (0.38 + i * 0.125))); }, 61.73, 2.15, 25.2, RY.W);
  for (const [x, z] of [[54, 23.9], [54, 26.5], [56.8, 23.9], [56.8, 26.5]]) {
    B.box('plastic', 0xe8e4dc, x - 0.7, x + 0.7, 0.7, 0.76, z - 0.45, z + 0.45); B.cyl('steel', 0xb0b4b8, x, 0, 0.7, z, 0.05, 0.05, 8); B.box('steel', 0xb0b4b8, x - 0.3, x + 0.3, 0, 0.03, z - 0.3, z + 0.3, DECO);
    for (const dz of [-0.8, 0.8]) B.spawn.push({ type: 'stool', x, y: 0.04, z: z + dz, color: 0xd8262b });
  }
  B.lamps.push({ x: 55.5, y: 3.0, z: 25.2, power: 0.7, indoor: true }); B.box('glow', 0xfff6e0, 54.9, 56.1, 3.24, 3.3, 25.1, 25.3, DECO);
  B.setZone('main');
}

function toilet(B) {
  const W = 0xf6f2ea, F0 = 0.25;
  B.setZone('wc');
  B.box('granite', 0x8a8a8c, 51.5, 62.1, 0, F0, -47.7, -37.5); B.box('granite', 0x8a8a8c, 51.0, 51.5, 0, 0.12, -44.3, -40.9); B.box('floorTile', 0xd8d4c8, 50.2, 51.8, 0, 0.015, -47.4, -37.8, DECO);
  // tường
  B.box('paint', W, 51.8, 62.1 - 0.3, F0, 3.8, -47.4, -47.1); B.box('paint', W, 51.8, 61.8, F0, 3.8, -38.1, -37.8); B.box('paint', W, 61.5, 61.8, F0, 3.8, -47.1, -38.1);
  B.box('paint', W, 51.8, 52.1, F0, 3.8, -47.1, -44.0); B.box('paint', W, 51.8, 52.1, F0, 3.8, -41.2, -38.1); B.box('paint', W, 51.8, 52.1, 2.75, 3.8, -44.0, -41.2, NS);
  for (const z of [-44.0, -41.28]) B.box('gold', 0xd4a83a, 51.78, 52.12, F0, 2.75, z, z + 0.08, DECO); B.box('gold', 0xd4a83a, 51.78, 52.12, 2.75, 2.83, -44.0, -41.2, DECO);
  label(B, 1.3, 0.5, [{ t: 'NỮ' }], { bg: '#d0408a', ppm: 110 }, 51.78, 3.2, -45.3, RY.W); label(B, 1.3, 0.5, [{ t: 'NAM' }], { bg: '#1f5fb4', ppm: 110 }, 51.78, 3.2, -39.9, RY.W);
  B.box('gold', 0xd4a83a, 51.6, 62, 3.8, 3.95, -47.6, -37.6, NS); B.box('paint', 0xe8e2d6, 51.7, 61.9, 3.95, 4.25, -47.5, -37.7); B.box('paintIn', 0xf8f8f4, 52.1, 61.5, 3.7, 3.8, -47.1, -38.1, NS);
  for (const z of [-46.4, -43.5, -40.6]) { const g = new THREE.BoxGeometry(8, 0.08, 2.5); g.rotateX(0.12); B.put('gloss', 0x1f3a6a, g, 56.8, 4.5, z + 1.25, 0, NS); }
  B.box('metalPaint', 0x7a1e1a, 51.8, 51.95, 4.25, 5.8, -47.5, -37.7, NS);
  label(B, 9.5, 1.15, [{ t: 'NHÀ VỆ SINH 5 TỎI', c: '#ffd84a' }], { bg: '#7a1e1a', border: '#d4a83a', ppm: 70 }, 51.78, 5.02, -42.6, RY.W);
  label(B, 3.4, 0.3, [{ t: '★★★★★  Đạt chuẩn 5 sao', c: '#4a1a10' }], { bg: '#d4a83a', ppm: 110 }, 51.76, 3.62, -42.6, RY.W);
  for (const z of [-46.9, -38.3]) { B.cyl('metalPaint', 0x1c1c1c, 51.22, 0, 2.4, z, 0.04, 0.05, 8); B.put('glow', 0xfff3c0, new THREE.SphereGeometry(0.16, 12, 8), 51.22, 2.55, z, 0, DECO); B.lamps.push({ x: 51.22, y: 2.55, z, power: 0.35 }); }
  // bên trong: tường ốp gạch, sàn, buồng
  B.box('wallTile', 0xffffff, 52.1, 61.5, F0, 3.7, -47.1, -47.08, DECO); B.box('wallTile', 0xffffff, 52.1, 61.5, F0, 3.7, -38.12, -38.1, DECO); B.box('wallTile', 0xffffff, 61.48, 61.5, F0, 3.7, -47.1, -38.1, DECO);
  B.box('floorTile', 0xc8ccd0, 52.1, 61.5, F0, F0 + 0.012, -47.1, -38.1, DECO);
  for (const side of [-1, 1]) {
    const zw = side < 0 ? -47.08 : -38.12, zf = zw - side * 1.55;
    for (let k = 0; k <= 7; k++) { const x = 53.66 + k * 1.12; if (k < 7 || true) B.box('plastic', 0xfbfbfa, x - 0.015, x + 0.015, F0 + 0.15, F0 + 2.1, Math.min(zw, zf), Math.max(zw, zf)); }
    for (let k = 0; k < 7; k++) {
      const x = 53.66 + k * 1.12, open = (k * 3 + (side < 0 ? 1 : 0)) % 4 === 1;
      B.spawn.push({ type: 'door', hinge: [x + 0.04, zf], len: 1.02, y: F0 + 0.15, h: 1.95, open: open ? side * 1.3 : 0, axis: 'x', color: 0xfbfbfa });
      B.put('gloss', 0xfcfcfc, new THREE.CylinderGeometry(0.2, 0.15, 0.4, 14), x + 0.56, F0 + 0.2, zw - side * 0.45, 0, NS); B.box('gloss', 0xfcfcfc, x + 0.36, x + 0.76, F0 + 0.4, F0 + 0.85, zw - side * 0.02, zw - side * 0.2, DECO);
    }
    B.box('steel', 0xb9bec3, 53.66, 61.5, F0 + 2.1, F0 + 2.14, zf - 0.02, zf + 0.02, DECO);
  }
  B.box('plastic', 0xfbfbfa, 53.35, 53.39, F0 + 0.15, F0 + 2.1, -43.9, -41.3);
  for (const x of [56.5, 60.0]) for (const z of [-44.1, -41.1]) { B.box('glow', 0xf6faff, x - 0.6, x + 0.6, 3.64, 3.7, z - 0.05, z + 0.05, DECO); }
  B.lamps.push({ x: 54.7, y: 3.4, z: -42.6, power: 0.6, indoor: true }, { x: 59, y: 3.4, z: -42.6, power: 0.6, indoor: true });
  B.spawn.push({ type: 'box', x: 59.07, y: F0 + 0.2, z: -39.96, sx: 0.35, sy: 0.38, sz: 0.38, color: 0xd8322c, mass: 0.6 });
  B.setZone('main');
}

export function build(B) { bikeShed(B); canteen(B); toilet(B); }
