// Bộ chi tiết dùng lại: biển chữ, mái, cột cờ, đèn, ghế, ô che, xe…
import * as THREE from 'three';
import { signTex, canvasTex } from '../engine/textures.js';
import { signMat } from '../engine/materials.js';

export const NS = { s: false }, DECO = { s: false, ns: true };
export const RY = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };   // hướng mặt biển quay về

/** Biển chữ. o: tham số signTex + {double, glow, cast} */
export function label(B, w, h, lines, o, x, y, z, ry = 0) {
  const m = signMat(signTex(w, h, lines, o), { glow: o && o.glow, rough: o && o.rough });
  if (o && o.double) B.sign(m, w, h, x, y, z, ry + Math.PI, {});
  return B.sign(m, w, h, x, y, z, ry, { cast: o && o.cast });
}
/** Tấm ảnh vẽ bằng canvas */
export function picture(B, w, h, px, draw, x, y, z, ry = 0, o = {}) {
  const t = canvasTex(Math.round(w * px), Math.round(h * px), draw);
  const m = signMat(t, { rough: o.rough ?? 0.7, glow: o.glow }); if (o.alpha) { m.transparent = false; m.alphaTest = 0.5; }
  if (o.double) B.sign(m, w, h, x, y, z, ry + Math.PI, {});
  return B.sign(m, w, h, x, y, z, ry, { cast: o.cast });
}
export function star(g, cx, cy, r, color) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.382 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
export function logo(g, cx, cy, r) {
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.strokeStyle = '#1f4fa0'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(cx, cy, r * 0.9, 0, 7); g.stroke();
  g.fillStyle = '#d8262b'; g.beginPath(); g.moveTo(cx, cy - r * 0.62); g.quadraticCurveTo(cx + r * 0.34, cy - r * 0.2, cx, cy - r * 0.05); g.quadraticCurveTo(cx - r * 0.34, cy - r * 0.2, cx, cy - r * 0.62); g.fill();
  g.fillStyle = '#1f4fa0'; g.font = `900 ${r * 0.62}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TP', cx, cy + r * 0.32);
}

/** Mái 4 dốc: đáy W (x) × D (z), cao H, tâm đáy tại (x, y, z) */
export function hipRoof(B, W, D, H, x, y, z, kind = 'roofTile', color = 0xffffff) {
  const a = W / 2, b = D / 2, rr = Math.max(0, a - b * 0.9), v = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b], [-rr, H, 0], [rr, H, 0]];
  const tri = [[3, 2, 5], [3, 5, 4], [1, 0, 4], [1, 4, 5], [2, 1, 5], [0, 3, 4]], pos = [];
  for (const t of tri) for (const k of t) pos.push(v[k][0] + x, v[k][1] + y, v[k][2] + z);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); B.geo(kind, color, g);
}
/** Mái 2 dốc: sống mái theo trục x (alongX) hoặc z; len dọc sống, width ngang, đáy tại y */
export function gableRoof(B, len, width, height, x, y, z, alongX = true, kind = 'roofTile', color = 0xffffff) {
  const sh = new THREE.Shape(); sh.moveTo(-width / 2, 0); sh.lineTo(width / 2, 0); sh.lineTo(0, height); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); if (alongX) g.rotateY(Math.PI / 2); g.translate(x, y, z); B.geo(kind, color, g);
}

export const flagTexVN = () => canvasTex(300, 200, (g) => { g.fillStyle = '#da251d'; g.fillRect(0, 0, 300, 200); star(g, 150, 100, 62, '#ffde00'); });
export const flagTexRed = () => canvasTex(64, 160, (g) => { g.fillStyle = '#e0261c'; g.fillRect(0, 0, 64, 160); });
let _vn = null, _red = null;
/** Cột cờ: lá cờ mô phỏng vải ở game/cloth.js */
export function flagPole(B, x, y, z, h, fw = 2.4, kind = 'vn', ratio = 2 / 3) {
  B.put('steel', 0xdedede, new THREE.CylinderGeometry(0.05, 0.085, h, 10), x, y + h / 2, z); B.put('gold', 0xffd23f, new THREE.SphereGeometry(0.12, 12, 8), x, y + h + 0.1, z, 0, DECO);
  B.solid(x - 0.12, x + 0.12, y, y + h, z - 0.12, z + 0.12);
  B.flags.push({ x: x + 0.06, y: y + h - 0.1, z, w: fw, h: fw * ratio, tex: kind === 'vn' ? (_vn = _vn || flagTexVN()) : (_red = _red || flagTexRed()) });
}
/** Đèn sân cao 6,5 m, tay vươn về +x */
export function lamp(B, x, z, dir = 1) {
  B.put('steel', 0x9aa0a6, new THREE.CylinderGeometry(0.06, 0.1, 6.5, 10), x, 3.25, z); B.solid(x - 0.1, x + 0.1, 0, 6.5, z - 0.1, z + 0.1);
  B.box('steel', 0x9aa0a6, Math.min(x, x + 1.3 * dir), Math.max(x, x + 1.3 * dir), 6.4, 6.48, z - 0.04, z + 0.04, DECO);
  B.box('metalPaint', 0xe8e8e8, x + (dir > 0 ? 0.95 : -1.55), x + (dir > 0 ? 1.55 : -0.95), 6.27, 6.4, z - 0.14, z + 0.14, DECO);
  B.box('glow', 0xfff0cc, x + (dir > 0 ? 1.0 : -1.5), x + (dir > 0 ? 1.5 : -1.0), 6.24, 6.27, z - 0.11, z + 0.11, DECO);
  B.lamps.push({ x: x + 1.25 * dir, y: 6.2, z, power: 1 });
}
/** Ghế đá có tựa (ax: trục dài 'x' hoặc 'z'; face: ±1 hướng ngồi) */
export function bench(B, x, z, len, ax = 'x', face = 1, color = 0x9a9a96, back = true) {
  const bx = (u1, u2, y1, y2, v1, v2, o) => (ax === 'x' ? B.box('granite', color, x + u1, x + u2, y1, y2, z + v1 * face, z + v2 * face, o) : B.box('granite', color, x + v1 * face, x + v2 * face, y1, y2, z + u1, z + u2, o));
  bx(-len / 2, len / 2, 0.38, 0.46, -0.22, 0.22); for (const u of [-len / 2 + 0.2, len / 2 - 0.2]) bx(u - 0.07, u + 0.07, 0, 0.38, -0.18, 0.18, NS);
  if (back) bx(-len / 2, len / 2, 0.46, 0.92, -0.26, -0.18);
  for (const u of [-0.32, 0.32]) B.seats.push(ax === 'x' ? { x: x + u * len / 1.3, y: 0.46, z, f: face > 0 ? 0 : Math.PI } : { x, y: 0.46, z: z + u * len / 1.3, f: face > 0 ? Math.PI / 2 : -Math.PI / 2 });
}
/** Ô che: tán nón có múi màu */
export function umbrella(B, x, z, r, y, colors) {
  B.put('steel', 0xd0d0d0, new THREE.CylinderGeometry(0.025, 0.025, y, 6), x, y / 2, z, 0, NS); B.solid(x - 0.05, x + 0.05, 0, y, z - 0.05, z + 0.05);
  const g = new THREE.ConeGeometry(r, r * 0.42, 8, 1, true).toNonIndexed(), n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { c.setHex(colors[Math.floor(i / 6) % colors.length]); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.translate(x, y + r * 0.1, z); B.geo('fabric', null, g);
}
/** Xe máy dựng (dài theo z) */
export function scooter(B, x, z, color, alongX = false) {
  const bx = (u1, u2, y1, y2, v1, v2, kind, c) => (alongX ? B.box(kind, c, x + v1, x + v2, y1, y2, z + u1, z + u2, DECO) : B.box(kind, c, x + u1, x + u2, y1, y2, z + v1, z + v2, DECO));
  const wheel = new THREE.CylinderGeometry(0.22, 0.22, 0.09, 14); wheel.rotateZ(Math.PI / 2); if (alongX) wheel.rotateY(Math.PI / 2);
  for (const d of [-0.45, 0.45]) B.put('rubber', 0x1a1a1a, wheel, x + (alongX ? d : 0), 0.22, z + (alongX ? 0 : d), 0, DECO);
  bx(-0.15, 0.15, 0.3, 0.62, -0.45, 0.4, 'plastic', color); bx(-0.14, 0.14, 0.62, 0.78, -0.42, 0.12, 'rubber', 0x1c1c1c); bx(-0.12, 0.12, 0.3, 0.95, 0.38, 0.5, 'plastic', color);
  bx(-0.28, 0.28, 0.95, 1.0, 0.4, 0.46, 'rubber', 0x222222); bx(-0.07, 0.07, 1.0, 1.12, 0.42, 0.5, 'gloss', 0xdddddd);
  if (alongX) B.solid(x - 0.62, x + 0.62, 0, 1, z - 0.17, z + 0.17); else B.solid(x - 0.17, x + 0.17, 0, 1, z - 0.62, z + 0.62);
}
/** Bồn cây tròn viền gạch */
export function roundPlanter(B, x, z, r = 1.0, h = 0.4) {
  B.put('brick', 0xffffff, new THREE.CylinderGeometry(r, r + 0.05, h, 20), x, h / 2, z); B.put('grass', 0x6a5a48, new THREE.CylinderGeometry(r - 0.12, r - 0.12, 0.04, 20), x, h + 0.005, z, 0, DECO);
  B.solid(x - r * 0.75, x + r * 0.75, 0, h, z - r * 0.75, z + r * 0.75);
}
/** Dãy nhà ống: mặt tiền tại đường f, quay theo side; trả về không gì. axis 'x' = dãy chạy theo x */
export function tubeHouse(B, o) {
  // o: {a, b (khoảng dọc dãy), front (toạ độ mặt tiền), dir (+1/-1: hướng mặt tiền quay ra), axis, fl, depth, color, roof, tank}
  const { a, b, front, dir, axis = 'x', fl, depth, color } = o, h = fl * 3.4 + 0.6, back = front - dir * depth;
  const bx = (kind, c, u1, u2, y1, y2, d1, d2, op) => { const v1 = front - dir * d1, v2 = front - dir * d2; if (axis === 'x') B.box(kind, c, u1, u2, y1, y2, v1, v2, op); else B.box(kind, c, v1, v2, y1, y2, u1, u2, op); };
  bx('paint', color, a + 0.08, b - 0.08, 0, h, 0, depth); bx('concrete', o.roof || 0x8a8f96, a - 0.05, b + 0.05, h, h + 0.22, -0.3, depth, NS);
  if (o.tank) { const p = axis === 'x' ? [a + 1.6, front - dir * 3] : [front - dir * 3, a + 1.6]; B.put('steel', 0xc8ccd0, new THREE.CylinderGeometry(0.55, 0.55, 1.25, 14), p[0], h + 0.85, p[1], 0, NS); }
  for (let k = 0; k < fl; k++) {
    const y = k * 3.4 + 0.6;
    if (k === 0) { if (!o.noGround) { bx('gloss', 0x2b3336, a + 0.5, a + (b - a) * 0.45, 0.2, 2.5, -0.03, 0.02, DECO); bx('metalCorr', 0xbfc2c6, a + (b - a) * 0.52, b - 0.5, 0.05, 2.6, -0.03, 0.02, DECO); } continue; }
    bx('glass', 0xffffff, a + 0.5, a + (b - a) * 0.45, y + 0.3, y + 2.0, -0.04, -0.02, DECO); bx('gloss', 0x1c2528, a + 0.5, a + (b - a) * 0.45, y + 0.3, y + 2.0, -0.02, 0.02, DECO);
    bx('gloss', 0x1c2528, a + (b - a) * 0.55, b - 0.5, y - 0.3, y + 2.0, -0.02, 0.02, DECO);
    bx('concrete', 0xe8e2d6, a + 0.1, b - 0.1, y - 0.42, y - 0.3, -0.9, 0, NS); bx('metalPaint', 0x5a6066, a + 0.1, b - 0.1, y + 0.55, y + 0.6, -0.9, -0.86, DECO);
    for (let u = a + 0.15; u < b - 0.1; u += 0.16) bx('metalPaint', 0x5a6066, u, u + 0.025, y - 0.3, y + 0.55, -0.89, -0.87, DECO);
    if (o.ac && k === 1) bx('metalPaint', 0xe6e6e6, b - 1.3, b - 0.5, y + 2.1, y + 2.65, -0.32, 0, DECO);
  }
}
