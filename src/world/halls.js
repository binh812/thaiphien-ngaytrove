// Nhà thi đấu đa năng + Hội trường (phía nam, cạnh cổng) và sân phù điêu giữa hai nhà.
import * as THREE from 'three';
import { NS, DECO, RY, label, picture, gableRoof, bench, star } from './kit.js';
import { mulberry32 } from '../engine/util.js';

// tường có ô cửa: trục dài theo x (z cố định) hoặc theo z (x cố định)
function wall(B, kind, color, ax, a1, a2, y1, y2, f1, f2, holes = []) {
  const bx = (u1, u2, v1, v2) => (ax === 'x' ? B.box(kind, color, u1, u2, v1, v2, f1, f2) : B.box(kind, color, f1, f2, v1, v2, u1, u2));
  let cur = a1;
  for (const h of [...holes].sort((p, q) => p.a - q.a)) { if (h.a > cur) bx(cur, h.a, y1, y2); if (h.y1 > y1) bx(h.a, h.b, y1, h.y1); if (h.y2 < y2) bx(h.a, h.b, h.y2, y2); cur = h.b; }
  if (cur < a2) bx(cur, a2, y1, y2);
}

function mosaic(g, w, h) {   // phù điêu gốm: mảnh ghép nhiều màu, mặt trời, sóng, dáng người, quyển sách
  const rnd = mulberry32(5), tile = (x, y, ww, hh, base) => { for (let i = x; i < x + ww; i += 7) for (let j = y; j < y + hh; j += 7) { const v = (rnd() - 0.5) * 34; g.fillStyle = `rgb(${base[0] + v | 0},${base[1] + v | 0},${base[2] + v | 0})`; g.fillRect(i, j, 6, 6); } };
  g.fillStyle = '#5a4a3a'; g.fillRect(0, 0, w, h); tile(0, 0, w, h * 0.55, [70, 130, 190]); tile(0, h * 0.55, w, h * 0.45, [196, 150, 70]);
  for (let k = 0; k < 14; k++) { const a = -Math.PI * k / 13; g.strokeStyle = 'rgba(250,200,70,.9)'; g.lineWidth = 9; g.beginPath(); g.moveTo(w * 0.5, h * 0.5); g.lineTo(w * 0.5 + Math.cos(a) * w * 0.5, h * 0.5 + Math.sin(a) * h * 0.55); g.stroke(); }
  g.fillStyle = '#e8562a'; g.beginPath(); g.arc(w * 0.5, h * 0.5, h * 0.17, 0, 7); g.fill(); star(g, w * 0.5, h * 0.5, h * 0.11, '#ffde4a');
  for (let k = 0; k < 4; k++) { g.strokeStyle = ['#2a6a9a', '#3a8aba', '#e8f0f4', '#2a6a9a'][k]; g.lineWidth = 7; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.82 + k * 0.04) + Math.sin(x * 0.03 + k) * 9); g.stroke(); }
  for (let k = 0; k < 12; k++) { const x = w * (0.06 + k * 0.08), y = h * (0.62 + (k % 3) * 0.03), s = h * 0.13; g.fillStyle = ['#f4ead0', '#c8262b', '#1f4fa0', '#f2c94c'][k % 4]; g.fillRect(x - s * 0.16, y, s * 0.32, s * 0.8); g.fillStyle = '#e8b890'; g.beginPath(); g.arc(x, y - s * 0.12, s * 0.14, 0, 7); g.fill(); if (k % 3 === 0) { g.strokeStyle = '#e8b890'; g.lineWidth = 5; g.beginPath(); g.moveTo(x + s * 0.12, y + s * 0.1); g.lineTo(x + s * 0.34, y - s * 0.3); g.stroke(); } }
  g.fillStyle = '#fbf6e6'; g.beginPath(); g.moveTo(w * 0.42, h * 0.9); g.lineTo(w * 0.5, h * 0.87); g.lineTo(w * 0.58, h * 0.9); g.lineTo(w * 0.58, h * 0.97); g.lineTo(w * 0.5, h * 0.94); g.lineTo(w * 0.42, h * 0.97); g.fill();
  g.strokeStyle = 'rgba(40,30,20,.35)'; g.lineWidth = 1; for (let i = 0; i < w; i += 7) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); } for (let j = 0; j < h; j += 7) { g.beginPath(); g.moveTo(0, j); g.lineTo(w, j); g.stroke(); }
  g.strokeStyle = '#6a2a26'; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
}
function courtLines(B, x1, x2, z1, z2, y) {
  const L = (a, b, c, d) => B.box('court', 0xf4f4f4, a, b, y, y + 0.004, c, d, DECO), t = 0.06;
  L(x1, x2, z1, z1 + t); L(x1, x2, z2 - t, z2); L(x1, x1 + t, z1, z2); L(x2 - t, x2, z1, z2); L((x1 + x2) / 2 - t / 2, (x1 + x2) / 2 + t / 2, z1, z2);
  const ring = new THREE.RingGeometry(1.74, 1.8, 40); ring.rotateX(-Math.PI / 2); B.put('court', 0xf4f4f4, ring, (x1 + x2) / 2, y + 0.004, (z1 + z2) / 2, 0, DECO);
  for (const [xa, dir] of [[x1, 1], [x2, -1]]) { L(Math.min(xa, xa + dir * 5.8), Math.max(xa, xa + dir * 5.8), (z1 + z2) / 2 - 2.45, (z1 + z2) / 2 - 2.45 + t); L(Math.min(xa, xa + dir * 5.8), Math.max(xa, xa + dir * 5.8), (z1 + z2) / 2 + 2.45 - t, (z1 + z2) / 2 + 2.45); L(xa + dir * 5.8 - t / 2, xa + dir * 5.8 + t / 2, (z1 + z2) / 2 - 2.45, (z1 + z2) / 2 + 2.45); }
}
export function hoopBoard(B, x, z, dirX, dirZ) {   // bảng rổ gắn tường/cột: mặt bảng quay theo (dirX, dirZ)
  const ax = dirX !== 0;
  if (ax) B.box('plastic', 0xf6f6f6, x - 0.03, x + 0.03, 2.9, 3.95, z - 0.9, z + 0.9); else B.box('plastic', 0xf6f6f6, x - 0.9, x + 0.9, 2.9, 3.95, z - 0.03, z + 0.03);
  const rim = new THREE.TorusGeometry(0.23, 0.014, 6, 24); rim.rotateX(Math.PI / 2); B.put('metalPaint', 0xe8541e, rim, x + dirX * 0.3, 3.05, z + dirZ * 0.3, 0, DECO);
  const sq = ax ? [x + dirX * 0.035, x + dirX * 0.04] : [z + dirZ * 0.035, z + dirZ * 0.04];
  if (ax) { B.box('gloss', 0xd8262b, sq[0], sq[1], 3.1, 3.55, z - 0.3, z - 0.26, DECO); B.box('gloss', 0xd8262b, sq[0], sq[1], 3.1, 3.55, z + 0.26, z + 0.3, DECO); B.box('gloss', 0xd8262b, sq[0], sq[1], 3.51, 3.55, z - 0.3, z + 0.3, DECO); }
  else { B.box('gloss', 0xd8262b, x - 0.3, x - 0.26, 3.1, 3.55, sq[0], sq[1], DECO); B.box('gloss', 0xd8262b, x + 0.26, x + 0.3, 3.1, 3.55, sq[0], sq[1], DECO); B.box('gloss', 0xd8262b, x - 0.3, x + 0.3, 3.51, 3.55, sq[0], sq[1], DECO); }
  B.spots.push({ type: 'hoop', x: x + dirX * 0.3, y: 3.05, z: z + dirZ * 0.3 });
}

function gym(B) {
  const H = 9, G = 0x8c8a86;
  B.setZone('gym');
  B.box('wood', 0xd9b27a, -9.7, 31.7, 0, 0.06, 43.3, 53.3, NS);
  wall(B, 'concrete', G, 'x', -10, 32, 0, 4.5, 43, 43.3, [{ a: 4.5, b: 7.5, y1: 0, y2: 3.5 }, { a: 20.5, b: 23.5, y1: 0, y2: 3.5 }]);
  wall(B, 'concrete', G, 'x', -10, 32, 4.5, H, 43, 43.3, [-7, -1, 5, 11, 17, 23, 29].map(c => ({ a: c - 1.8, b: c + 1.8, y1: 5.5, y2: 7.4 })));
  wall(B, 'concrete', G, 'x', -10, 32, 0, H, 53.3, 53.6, [-7, -1, 5, 11, 17, 23, 29].map(c => ({ a: c - 1.8, b: c + 1.8, y1: 5.5, y2: 7.4 })));
  wall(B, 'concrete', G, 'z', 43.3, 53.3, 0, H, -10, -9.7); wall(B, 'concrete', G, 'z', 43.3, 53.3, 0, H, 31.7, 32, [{ a: 46.5, b: 50, y1: 0, y2: 3.5 }]);
  for (const z of [43.15, 53.45]) for (const c of [-7, -1, 5, 11, 17, 23, 29]) { B.box('glass', 0xffffff, c - 1.8, c + 1.8, 5.5, 7.4, z - 0.02, z + 0.02, DECO); for (const dx of [-0.6, 0.6]) B.box('metalPaint', 0x3a3f44, c + dx - 0.025, c + dx + 0.025, 5.5, 7.4, z - 0.04, z + 0.04, DECO); }
  // gờ, băng sơn trang trí mặt ngoài
  for (const y of [4.4, 8.2]) { B.box('paint', 0xf1e7cf, -10.06, 32.06, y, y + 0.3, 42.94, 43, DECO); B.box('paint', 0xf1e7cf, -10.06, 32.06, y, y + 0.3, 53.6, 53.66, DECO); }
  B.box('paintIn', 0xd8cdb6, -9.7, 31.7, 8.8, 9, 43.3, 53.3, NS);
  gableRoof(B, 43, 11.6, 2.6, 11, H, 48.3, true, 'metalCorr', 0x9aa3ac); B.solid(-10, 32, H, H + 1, 43, 53.6);
  for (let x = -6; x < 31; x += 6) B.box('steel', 0x6a6f75, x - 0.08, x + 0.08, 8.5, 8.8, 43.3, 53.3, DECO);
  for (let x = -3; x < 30; x += 6) for (const z of [45.8, 50.8]) { B.box('glow', 0xfff6e0, x - 0.5, x + 0.5, 8.42, 8.5, z - 0.15, z + 0.15, DECO); B.lamps.push({ x, y: 8.3, z, power: 0.7, indoor: true }); }
  // sân đấu sơn xanh + vạch
  B.box('court', 0x2f7f6a, -9, 17, 0.06, 0.07, 43.6, 51.9, DECO); B.box('court', 0xc86a3a, -6, 14, 0.07, 0.075, 44.5, 51, DECO); courtLines(B, -6, 14, 44.5, 51, 0.076);
  hoopBoard(B, -8.4, 47.4, 1, 0); hoopBoard(B, 16.6, 47.4, -1, 0);
  for (const x of [-8.4, 16.6]) { B.box('steel', 0x6a6f75, Math.min(x, x < 0 ? -9.7 : x), Math.max(x, x < 0 ? x : 17.6), 3.3, 3.4, 47.35, 47.45, DECO); if (x > 0) B.box('steel', 0x6a6f75, 17.5, 17.7, 0.06, 3.4, 47.3, 47.5); }
  // khán đài
  [[0x8f9aa6, 0.4, 50.4], [0x7f8a96, 0.8, 51.4], [0x6f7a86, 1.2, 52.4]].forEach(([c, h, z], i) => { B.box('concrete', c, 18.5, 30, 0, h, z, 53.3); B.box('concrete', c, -7, 17.6, 0, h, 52 + i * 0.43, 53.3); });
  label(B, 14, 1.6, [{ t: 'NHÀ THI ĐẤU ĐA NĂNG' }], { bg: '#1f4fa0', border: '#ffffff', ppm: 60 }, 6, 7.6, 42.93, RY.N);
  // sảnh đông
  for (const z of [44.6, 51.9]) B.box('paint', 0xd8262b, 32.6, 33.5, 0, 6.6, z - 0.45, z + 0.45);
  B.box('concrete', 0x9a9890, 32, 33.6, 4.2, 4.5, 44, 52.5, NS); B.box('granite', 0xb8b0a0, 32, 32.6, 0, 0.3, 46.3, 50.2); B.box('granite', 0xb8b0a0, 32.6, 33.1, 0, 0.15, 46.3, 50.2);
  for (const z of [45.6, 50.9]) { B.cyl('granite', 0xc9b48c, 34.2, 0, 0.6, z, 0.5, 0.38, 14); B.hedges.push([33.65, 34.75, 0.55, 1.45, z - 0.55, z + 0.55, 'ball']); }
  label(B, 2, 0.36, [{ t: 'SÂN BÓNG RỔ' }], { bg: '#1f4fa0', ppm: 110 }, 32.03, 3.9, 48.25, RY.E);
  B.setZone('main');
  // phù điêu gốm đầu hồi tây
  picture(B, 10.2, 6.2, 70, mosaic, -10.03, 3.4, 48.3, RY.W, { rough: 0.3 });
  B.box('roofTile', 0xb08a80, -10.45, -10, 6.5, 6.85, 42.8, 53.8, DECO); B.box('gold', 0xd8b048, -10.3, -10, 6.42, 6.5, 42.9, 53.7, DECO); B.box('brick', 0xffffff, -10.25, -10, 0, 0.3, 43, 53.6, NS);
  bench(B, -21.1, 45, 1.8, 'x', 1, 0x9a9a96, false); bench(B, -21.1, 51.5, 1.8, 'x', -1, 0x9a9a96, false);
  B.trees.push({ x: -29.6, z: 44.2, s: 1, planter: true });
}

function hall(B) {
  const WH = 0xf2efe6;
  B.setZone('hall');
  B.box('floorTile', 0xe2d8c0, -57.7, -32.3, 0, 0.05, 43.3, 53.3, NS);
  const wins = [-54, -50, -46, -42, -38, -34].map(c => ({ a: c - 0.75, b: c + 0.75, y1: 1.3, y2: 3.9 }));
  wall(B, 'paint', WH, 'x', -58, -32, 0, 6.2, 43, 43.3, wins); wall(B, 'paint', WH, 'x', -58, -32, 0, 6.2, 53.3, 53.6, wins);
  wall(B, 'paint', WH, 'z', 43.3, 53.3, 0, 6.2, -58, -57.7); wall(B, 'paint', WH, 'z', 43.3, 53.3, 0, 6.2, -32.3, -32, [{ a: 45.6, b: 51, y1: 0, y2: 3.1 }]);
  for (const z of [43.15, 53.45]) for (const w of wins) {   // cửa sổ vòm có song
    B.box('glass', 0xffffff, w.a, w.b, w.y1, w.y2, z - 0.02, z + 0.02, DECO);
    for (let u = w.a + 0.25; u < w.b - 0.1; u += 0.25) B.box('metalPaint', 0x2f4a3a, u - 0.012, u + 0.012, w.y1, w.y2, z + 0.04, z + 0.065, DECO);
    B.box('metalPaint', 0x2f4a3a, w.a, w.b, 3.0, 3.03, z + 0.04, z + 0.065, DECO);
    const arch = new THREE.TorusGeometry(0.75, 0.08, 6, 16, Math.PI); for (const dz of [-0.17, 0.17]) B.put('paint', 0xe8bb48, arch, (w.a + w.b) / 2, w.y2 - 0.02, z + dz, 0, DECO);
  }
  B.box('paintIn', 0xf6f4ee, -57.7, -32.3, 6.05, 6.2, 43.3, 53.3, NS); gableRoof(B, 27, 11.6, 2.4, -45, 6.2, 48.3, true); B.solid(-58, -32, 6.2, 7.2, 43, 53.6);
  // hiên đông
  B.box('paint', WH, -32, -30.6, 3.4, 3.65, 43.3, 53.3, NS); B.box('granite', 0xc9c1b0, -32, -30.9, 0, 0.15, 43.3, 53.3);
  for (const z of [44, 46.15, 48.3, 50.45, 52.6]) B.cyl('paint', 0xf0e2a6, -31, 0.15, 3.4, z, 0.2, 0.23, 16);
  for (const z of [44.4, 52.2]) { B.box('brick', 0xffffff, -31.9, -30.9, 0, 0.45, z - 0.5, z + 0.5); B.hedges.push([-31.95, -30.85, 0.4, 1.3, z - 0.55, z + 0.55, 'ball']); }
  label(B, 3.2, 0.55, [{ t: 'HỘI TRƯỜNG' }], { bg: '#1f4fa0', border: '#ffffff', ppm: 100 }, -31.96, 3.95, 48.3, RY.E);
  // sân khấu
  B.box('wood', 0x8a3a2a, -57.7, -51.5, 0, 0.8, 43.3, 53.3); B.box('wood', 0x9a6a3a, -51.6, -51.4, 0.74, 0.82, 43.3, 53.3, DECO); B.box('fabric', 0xb0303a, -57.7, -57.62, 0.8, 6.05, 43.3, 53.3, DECO);
  for (let z = 43.5; z < 53.3; z += 0.5) B.box('fabric', 0x8e2028, -57.62, -57.58, 0.8, 6.05, z, z + 0.22, DECO);
  picture(B, 9.6, 4.6, 70, (g, w, h) => {
    g.fillStyle = '#b0202a'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 22) { g.fillStyle = 'rgba(80,0,0,.18)'; g.fillRect(x, 0, 9, h); }
    star(g, w * 0.13, h * 0.3, h * 0.13, '#ffde4a'); g.fillStyle = '#ffde4a'; g.textAlign = 'center'; g.font = `bold ${h * 0.085}px "Times New Roman", serif`; g.fillText('ĐẢNG CỘNG SẢN VIỆT NAM QUANG VINH MUÔN NĂM', w * 0.56, h * 0.13, w * 0.8);
    g.fillStyle = '#12224a'; g.fillRect(w * 0.26, h * 0.26, w * 0.66, h * 0.62); g.fillStyle = '#ffffff'; g.font = `bold ${h * 0.1}px Arial`; g.fillText('HỘI NGHỊ', w * 0.59, h * 0.42);
    g.fillStyle = '#ffe680'; g.font = `bold ${h * 0.075}px Arial`; g.fillText('BAN LIÊN LẠC CỰU HỌC SINH CÁC KHÓA', w * 0.59, h * 0.55, w * 0.62); g.fillText('TRƯỜNG THPT THÁI PHIÊN', w * 0.59, h * 0.66, w * 0.62);
    g.fillStyle = '#cfe0ff'; g.font = `italic ${h * 0.06}px Arial`; g.fillText('Hải Phòng, ngày trở về', w * 0.59, h * 0.79);
  }, -57.55, 3.35, 48.3, RY.E, { glow: 0.25 });
  label(B, 6, 1.2, [{ t: 'RÈN ĐỨC LUYỆN TÀI – VÌ NGÀY MAI LẬP NGHIỆP' }], { bg: '#7a1e1a', fg: '#f2d36b', ppm: 70, rough: 0.85 }, -45, 4.9, 43.32, RY.S);
  for (const z of [43.8, 52.8]) label(B, 0.8, 3.8, ['THÁI', 'PHIÊN', '♥', 'NGÀY', 'TRỞ', 'VỀ'].map(t => ({ t, c: '#ffe680' })), { bg: '#c8262b', ppm: 80, rough: 0.85 }, -57.55, 2.9, z, RY.E);
  B.box('wood', 0xa8743f, -54.6, -53.8, 0.8, 2.0, 50.6, 51.6);
  // bàn ghế
  for (const x of [-49.5, -47.4, -45.3, -43.2, -41.1, -39.0, -36.9]) for (const [z1, z2] of [[43.9, 47.6], [49.0, 52.7]]) {
    B.box('wood', 0xb0763e, x, x + 0.5, 0.72, 0.78, z1, z2); B.box('wood', 0x8a5a2e, x + 0.04, x + 0.08, 0.05, 0.72, z1 + 0.05, z2 - 0.05, DECO);
    for (let k = 0; k < 3; k++) B.spawn.push({ type: 'chair', x: x + 0.92, y: 0.05, z: z1 + 0.6 + k * 1.25, ry: -Math.PI / 2 });
  }
  for (const x of [-48, -40]) for (const z of [45.8, 50.8]) { B.spots.push({ type: 'fan', x, y: 5.4, z }); B.box('steel', 0xcfd3d6, x - 0.02, x + 0.02, 5.45, 6.05, z - 0.02, z + 0.02, DECO); B.lamps.push({ x, y: 5.2, z: z + 1.2, power: 0.6, indoor: true }); B.box('glow', 0xfff6e0, x - 0.6, x + 0.6, 5.98, 6.04, z + 1.1, z + 1.3, DECO); }
  B.setZone('main');
}

export function build(B) {
  B.box('pavers', 0xe6dccc, -32, -10, 0, 0.012, 42.2, 54.4, DECO);   // sân trước phù điêu
  gym(B); hall(B);
}
