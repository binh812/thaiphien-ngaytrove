// Bộ sinh khối nhà học: hành lang mở phía sân, phòng học, cầu thang 2 vế, mặt tiền vòm cuốn.
import * as THREE from 'three';
import { frame } from '../engine/builder.js';
import { signTex } from '../engine/textures.js';
import { signMat } from '../engine/materials.js';

export const FH = 4.2;
export const yT = (k) => 0.15 + k * FH;
export const C = {
  WALL: 0xe8bb48, WALL_IN: 0xf0d58c, CREAM: 0xf1e7cf, CEIL: 0xf0ede4, COL: 0xdfb650, WHITE: 0xf3f3ee, STONE: 0xbdb3a2,
  SHUT: 0x74321f, BOARD: 0x1d4a35, DESK: 0xa8743f, LEG: 0x3b4f45, RED: 0xc0262b, CAP: 0xc4948a, BRICK: 0xa8553f,
  DOORFRAME: 0x6a3a22, DOOR: 0x3d2718, HEDGE: 0x3f7a35,
};
const LANTERN = [0xd8262b, 0xf0a020, 0x2f8f6a, 0xe86a8a, 0x8a2a2a];
const NS = { s: false }, DECO = { s: false, ns: true };

function wallHoles(f, kind, color, u1, u2, y1, y2, w1, w2, holes, o) {
  let cur = u1;
  for (const h of [...holes].sort((a, b) => a.a - b.a)) {
    if (h.a > cur + 1e-3) f.box(kind, color, cur, h.a, y1, y2, w1, w2, o);
    if (h.y1 > y1 + 1e-3) f.box(kind, color, h.a, h.b, y1, h.y1, w1, w2, o);
    if (h.y2 < y2 - 1e-3) f.box(kind, color, h.a, h.b, h.y2, y2, w1, w2, o);
    cur = h.b;
  }
  if (cur < u2 - 1e-3) f.box(kind, color, cur, u2, y1, y2, w1, w2, o);
}

// cánh chớp gỗ: khung + nan
function shutter(f, color, u1, u2, y1, y2, w1, w2) {
  const t = 0.07; f.box('wood', color, u1, u2, y1, y1 + t, w1, w2, DECO); f.box('wood', color, u1, u2, y2 - t, y2, w1, w2, DECO);
  f.box('wood', color, u1, u1 + t, y1, y2, w1, w2, DECO); f.box('wood', color, u2 - t, u2, y1, y2, w1, w2, DECO);
  const wm = (w1 + w2) / 2, n = Math.round((y2 - y1) / 0.11);
  for (let i = 1; i < n; i++) { const y = y1 + (y2 - y1) * i / n; f.box('wood', color, u1 + t, u2 - t, y - 0.012, y + 0.03, wm - 0.012, wm + 0.012, DECO); }
  f.box('flat', 0x2a180e, u1 + t, u2 - t, y1 + t, y2 - t, wm - 0.004, wm + 0.004, DECO);
}

function archWall(f, L, BWY, nb, y0, y1, depth) {
  const sh = new THREE.Shape(), a = 0.375 * BWY, ys = y0 + 1.125;
  sh.moveTo(-L / 2, y0);
  for (let i = 0; i < nb; i++) { const c = -L / 2 + BWY * (i + 0.5); sh.lineTo(c - a, y0); sh.lineTo(c - a, ys); sh.absellipse(c, ys, a, 1.5, Math.PI, 0, true); sh.lineTo(c + a, y0); }
  sh.lineTo(L / 2, y0); sh.lineTo(L / 2, y1); sh.lineTo(-L / 2, y1); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 22 }); g.translate(0, 0, -depth);
  f.geo('paint', C.WALL, g);
  // gờ chỉ quanh vòm
  for (let i = 0; i < nb; i++) {
    const c = -L / 2 + BWY * (i + 0.5), pts = [];
    for (let k = 0; k <= 22; k++) { const t = Math.PI * k / 22; pts.push(new THREE.Vector3(c - Math.cos(t) * (a + 0.07), ys + Math.sin(t) * 1.57, 0.02)); }
    f.geo('paint', C.CREAM, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.045, 5, false), DECO);
  }
}

const lanternGeo = new THREE.LatheGeometry([[0.001, -0.3], [0.07, -0.29], [0.2, -0.12], [0.23, 0.02], [0.19, 0.17], [0.08, 0.28], [0.001, 0.29]].map(([a, b]) => new THREE.Vector2(a, b)), 14);

let bannerMat = null;
function furnishClass(B, f, u1, y0, rw) {
  f.box('gloss', C.BOARD, u1 + 0.1, u1 + 0.16, y0 + 0.95, y0 + 2.25, -9.6, -5.0, NS);
  f.box('wood', 0x7a5a3a, u1 + 0.1, u1 + 0.2, y0 + 0.88, y0 + 0.95, -9.65, -4.95, NS);
  f.box('wood', 0x8a6a4a, u1 + 0.1, u1 + 0.15, y0 + 2.25, y0 + 2.32, -9.65, -4.95, NS);
  f.box('concrete', 0xa8a8a8, u1 + 0.1, u1 + 1.5, y0, y0 + 0.2, -11.75, -3.25);
  // bàn giáo viên
  f.box('wood', C.DESK, u1 + 0.6, u1 + 1.3, y0 + 0.9, y0 + 0.95, -8.2, -6.7); f.box('wood', C.DESK, u1 + 0.62, u1 + 0.66, y0 + 0.2, y0 + 0.9, -8.18, -6.72, NS); f.box('wood', C.DESK, u1 + 0.64, u1 + 1.28, y0 + 0.2, y0 + 0.9, -8.18, -8.14, NS); f.box('wood', C.DESK, u1 + 0.64, u1 + 1.28, y0 + 0.2, y0 + 0.9, -6.76, -6.72, NS);
  f.box('plastic', 0x1f4f9a, u1 + 0.75, u1 + 1.09, y0 + 0.95, y0 + 0.975, -7.9, -7.4, DECO);
  f.box('glow', 0xfff4d8, u1 + 0.1, u1 + 0.2, y0 + 2.33, y0 + 2.41, -7.9, -6.7, DECO);
  bannerMat = bannerMat || signMat(signTex(4.4, 0.56, [{ t: 'THI ĐUA DẠY TỐT – HỌC TỐT' }], { bg: '#c0262b', fg: '#ffe680', ppm: 70 }));
  const bp = f.W(u1 + 0.17, -7.3); B.sign(bannerMat, 4.4, 0.56, bp[0], y0 + 3.5, bp[1], Math.atan2(f.cr, -f.sr));
  const rowsU = [0, 1, 2, 3, 4].map(j => (rw - 1.6) - (4 - j) * 1.15);
  for (const ru of rowsU) for (const [wa, wb] of [[-6.3, -3.3], [-11.65, -8.65]]) {
    const ui = u1 + ru;
    f.box('wood', C.DESK, ui, ui + 0.5, y0 + 0.72, y0 + 0.78, wa, wb, NS); f.box('wood', C.DESK, ui + 0.68, ui + 1.0, y0 + 0.42, y0 + 0.47, wa, wb, NS);
    for (const w of [wa + 0.04, (wa + wb) / 2, wb - 0.04]) { f.box('metalPaint', C.LEG, ui + 0.04, ui + 0.46, y0 + 0.3, y0 + 0.72, w - 0.02, w + 0.02, DECO); f.box('metalPaint', C.LEG, ui + 0.04, ui + 0.98, y0, y0 + 0.05, w - 0.02, w + 0.02, DECO); f.box('metalPaint', C.LEG, ui + 0.8, ui + 0.88, y0, y0 + 0.42, w - 0.04, w + 0.04, DECO); f.box('metalPaint', C.LEG, ui + 0.04, ui + 0.08, y0, y0 + 0.3, w - 0.02, w + 0.02, DECO); }
    f.box('plastic', 0xfdfdf8, ui + 0.1, ui + 0.34, y0 + 0.78, y0 + 0.79, wa + 0.6, wa + 0.92, DECO);
    f.solid(ui, ui + 0.5, y0, y0 + 0.78, wa, wb); f.solid(ui + 0.68, ui + 1.0, y0, y0 + 0.47, wa, wb);
  }
}
function furnishOffice(f, u1, y0) {
  f.box('wood', 0x6b3e22, u1 + 2, u1 + 6, y0 + 0.74, y0 + 0.8, -9, -5.5); f.box('wood', 0x4a2a18, u1 + 2.1, u1 + 5.9, y0, y0 + 0.74, -8.8, -5.7, NS);
  for (const du of [2.5, 3.5, 4.5, 5.5]) for (const [wa, wb] of [[-5.3, -4.86], [-9.64, -9.2]]) { f.box('fabric', 0x8a2a2a, u1 + du - 0.22, u1 + du + 0.22, y0, y0 + 0.48, wa, wb); f.box('fabric', 0x8a2a2a, u1 + du - 0.22, u1 + du + 0.22, y0 + 0.48, y0 + 1.0, wa < -8 ? wa : wb - 0.07, wa < -8 ? wa + 0.07 : wb, NS); }
  f.box('wood', 0x5a3a22, u1 + 0.3, u1 + 0.8, y0, y0 + 2.0, -11.7, -8); f.box('gold', 0xc8a040, u1 + 0.4, u1 + 0.7, y0 + 2, y0 + 2.3, -10.5, -10.1, NS);
}

function buildStair(f, a, k, F) {
  const yk = yT(k), R = 0.175, TD = 0.3, wS = -3.8, wE = -7.4, STEP = 0xc2b8a6, NOSE = 0x9e9483;
  if (k <= F - 2) {
    for (let i = 1; i <= 12; i++) {
      const top = yk + i * R, w2 = wS - (i - 1) * TD, w1 = wS - i * TD;
      f.box('granite', STEP, a + 0.3, a + 3.8, k === 0 ? yk : top - 0.35 - R, top, w1, w2, NS); f.box('granite', NOSE, a + 0.3, a + 3.8, top - 0.02, top + 0.004, w2 - 0.05, w2, DECO);
      const top2 = yk + 2.1 + i * R, v1 = wE + (i - 1) * TD, v2 = wE + i * TD;
      f.box('granite', STEP, a + 4.2, a + 7.7, top2 - 0.35 - R, top2, v1, v2, NS); f.box('granite', NOSE, a + 4.2, a + 7.7, top2 - 0.02, top2 + 0.004, v1, v1 + 0.05, DECO);
    }
    f.ramp([[a + 0.3, yk, wS], [a + 3.8, yk, wS], [a + 0.3, yk + 2.1, wE], [a + 3.8, yk + 2.1, wE], [a + 0.3, yk - (k ? 0.4 : 0), wS], [a + 3.8, yk - (k ? 0.4 : 0), wS], [a + 0.3, k ? yk + 1.7 : yk, wE], [a + 3.8, k ? yk + 1.7 : yk, wE]]);
    f.ramp([[a + 4.2, yk + 2.1, wE], [a + 7.7, yk + 2.1, wE], [a + 4.2, yk + 4.2, wS], [a + 7.7, yk + 4.2, wS], [a + 4.2, yk + 1.7, wE], [a + 7.7, yk + 1.7, wE], [a + 4.2, yk + 3.8, wS], [a + 7.7, yk + 3.8, wS]]);
    f.box('granite', STEP, a + 0.3, a + 7.7, yk + 1.85, yk + 2.1, -11.75, wE);                       // chiếu nghỉ
    // lan can xây dọc mép trong 2 vế (xấp xỉ bằng các đoạn bậc) + tay vịn
    for (let i = 0; i < 12; i++) {
      const y = yk + (i + 0.5) * R, w2 = wS - i * TD;
      f.box('paint', C.WALL, a + 3.6, a + 3.8, k === 0 ? yk : y - 0.5, y + 1.0, w2 - TD, w2, NS); f.box('paint', C.BRICK, a + 3.56, a + 3.84, y + 1.0, y + 1.07, w2 - TD, w2, DECO);
      const y2 = yk + 2.1 + (i + 0.5) * R, v1 = wE + i * TD;
      f.box('paint', C.WALL, a + 4.2, a + 4.4, y2 - 0.5, y2 + 1.0, v1, v1 + TD, NS); f.box('paint', C.BRICK, a + 4.16, a + 4.44, y2 + 1.0, y2 + 1.07, v1, v1 + TD, DECO);
      f.box('wood', 0x7a4a2a, a + 0.2, a + 0.27, y + 0.86, y + 0.93, w2 - TD, w2, DECO); f.box('wood', 0x7a4a2a, a + 7.73, a + 7.8, y2 + 0.86, y2 + 0.93, v1, v1 + TD, DECO);
    }
    f.solid(a + 3.6, a + 4.4, yk, yk + 5.2, wE - 0.2, wS);
    f.box('paint', C.WALL, a + 3.6, a + 4.4, yk + 1.75, yk + 3.1, wE - 0.2, wE, NS); f.box('paint', C.BRICK, a + 3.55, a + 4.45, yk + 3.1, yk + 3.17, wE - 0.24, wE + 0.04, DECO);
    if (k === 0) {
      // kho gầm thang + biển
      f.box('paint', C.WALL, a + 4.2, a + 7.7, yk, yk + 2.75, -3.9, wS); f.box('metalPaint', 0xece6dc, a + 4.5, a + 7.4, yk + 0.05, yk + 2.45, -3.78, -3.76, DECO);
      for (let i = 0; i <= 4; i++) f.box('metalPaint', 0xcfc7b8, a + 4.5 + i * 0.725 - 0.02, a + 4.5 + i * 0.725 + 0.02, yk + 0.05, yk + 2.45, -3.76, -3.74, DECO);
      f.solid(a + 4.2, a + 7.7, yk, yk + 2.1, wE, wS);
    }
  } else {
    f.box('paint', C.WALL, a + 0.1, a + 4.4, yk - 0.35, yk + 1.0, -4.0, -3.8); f.box('paint', C.BRICK, a + 0.05, a + 4.45, yk + 1.0, yk + 1.07, -4.04, -3.76, DECO);
    f.box('paint', C.WALL, a + 4.2, a + 4.4, yk, yk + 1.0, -7.4, -3.8);
  }
}

/** o: {code,title,ox,oz,r,F,rooms,roomW,roof,facade,openU,pots,panels,noHedge,baseStripe,colColor,rail,names} */
export function makeBlock(B, o) {
  const { code, ox, oz, r, rooms, F = 3, roof = 'flat', names = {} } = o, RW = o.roomW || 8;
  const widths = rooms.map(t => (t === 'stair' ? 8 : RW)), L = widths.reduce((a, b) => a + b, 0), U0 = -L / 2;
  const starts = widths.map((_, i) => U0 + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const f = frame(B, ox, oz, r), yF = yT(F), arcade = o.facade === 'arcade';
  const nb = Math.max(1, Math.round(L / 4)), BWY = L / nb;
  const info = { code, f, L, U0, F, starts, widths, rooms, roomNames: [], lights: [], yF, BWY, nb };
  B.setZone('blk' + code);

  // nền, sàn các tầng
  f.box('concrete', 0xc9c1b0, U0 - 0.02, -U0 + 0.02, 0, 0.13, -12, 0.02);
  f.box('floorTile', 0xe9dfc8, U0, -U0, 0.13, 0.15, -12, 0, NS);
  for (let k = 1; k <= F; k++) {
    const y = yT(k);
    f.box('paintIn', C.CREAM, U0, -U0, y - 0.25, y - 0.02, -3, 0); if (k < F) f.box('floorTile', 0xe9dfc8, U0, -U0, y - 0.02, y, -3, 0, NS); else f.box('concrete', 0xb9b3a6, U0, -U0, y - 0.02, y, -12, 0, NS);
    rooms.forEach((t, i) => {
      const u1 = starts[i], u2 = u1 + widths[i];
      if (t === 'stair' && k < F) { f.box('granite', C.STONE, u1, u2, y - 0.25, y, -3.8, -3); }
      else { f.box('paintIn', C.CEIL, u1, u2, y - 0.25, y - 0.02, -12, -3); if (k < F) f.box('floorTile', 0xd9d4c6, u1, u2, y - 0.02, y, -12, -3, NS); }
    });
  }
  // tường sau (khoét cửa sổ thật), tường hồi, vách ngăn
  for (let k = 0; k < F; k++) {
    const y0 = yT(k), y1 = yT(k + 1) - 0.25, holes = [];
    rooms.forEach((t, i) => { if (t === 'stair') return; for (const fr of [0.15, 0.575]) { const a = starts[i] + fr * widths[i]; holes.push({ a, b: a + 2.2, y1: y0 + 1.0, y2: y0 + 2.75 }); } });
    wallHoles(f, 'paint', C.WALL, U0, -U0, k ? y0 - 0.25 : 0, y1, -12, -11.75, holes);
    for (const h of holes) {
      f.box('paint', C.CREAM, h.a - 0.1, h.b + 0.1, h.y1 - 0.1, h.y1, -12.06, -12, DECO); f.box('paint', C.CREAM, h.a - 0.1, h.b + 0.1, h.y2, h.y2 + 0.1, -12.06, -12, DECO);
      shutter(f, C.SHUT, h.a - 0.65, h.a - 0.1, h.y1, h.y2, -12.09, -12.01); shutter(f, C.SHUT, h.b + 0.1, h.b + 0.65, h.y1, h.y2, -12.09, -12.01);
      f.box('wood', C.DOORFRAME, h.a + 1.07, h.a + 1.13, h.y1, h.y2, -11.92, -11.84, DECO); f.box('wood', C.DOORFRAME, h.a, h.b, h.y2 - 0.06, h.y2, -11.92, -11.84, DECO);
      f.box('glass', 0xffffff, h.a, h.b, h.y1, h.y2, -11.89, -11.87, DECO);
      f.box('granite', 0xe9e2cf, h.a - 0.05, h.b + 0.05, h.y1 - 0.04, h.y1, -12.04, -11.68, DECO);
      f.solid(h.a, h.b, h.y1, h.y2, -11.95, -11.8);
    }
  }
  f.box('paint', C.WALL, U0, U0 + 0.25, 0, yF, -11.75, -3); f.box('paint', C.WALL, -U0 - 0.25, -U0, 0, yF, -11.75, -3);
  for (let i = 1; i < rooms.length; i++) f.box('paintIn', C.WALL_IN, starts[i] - 0.1, starts[i] + 0.1, 0.15, yF - 0.25, -11.75, -3);
  // đầu hành lang các tầng trên: lan can bịt
  for (let k = 1; k < F; k++) for (const u of [U0, -U0 - 0.2]) { f.box('paint', C.WALL, u, u + 0.2, yT(k), yT(k) + 0.95, -3, 0); f.box('granite', C.CAP, u - 0.03, u + 0.23, yT(k) + 0.95, yT(k) + 1.03, -3, 0.05, DECO); }

  // cột, lan can, mặt tiền
  for (let n = 0; n <= nb; n++) {
    const u = U0 + n * BWY;
    if (arcade) f.box('paint', C.WALL, Math.max(U0, u - 0.5), Math.min(-U0, u + 0.5), 0.15, yF, -0.5, 0);
    else { f.box('paint', o.colColor || C.COL, Math.max(U0, u - 0.22), Math.min(-U0, u + 0.22), 0.15, yF, -0.44, 0); }
  }
  for (let k = 1; k < F; k++) {
    const y = yT(k);
    if (o.rail === 'balusters') {
      f.box('paint', C.WHITE, U0, -U0, y, y + 0.2, -0.19, 0, NS); f.box('paint', C.WHITE, U0, -U0, y + 0.92, y + 1.0, -0.21, 0.02, NS);
      for (let u = U0 + 0.2; u < -U0; u += 0.3) B.put('paint', C.WHITE, new THREE.CylinderGeometry(0.04, 0.055, 0.72, 8), ...((p) => [p[0], y + 0.56, p[1]])(f.W(u, -0.09)), 0, DECO);
    } else { f.box('paint', C.WALL, U0, -U0, y, y + 0.95, -0.2, 0, NS); f.box('granite', C.CAP, U0, -U0, y + 0.95, y + 1.03, -0.27, 0.05, DECO); }
    f.solid(U0, -U0, y, y + 1.1, -0.2, 0);
    if (arcade) f.box('paint', C.WALL, U0, -U0, yT(k + 1) - 0.8, yT(k + 1) - 0.25, -0.28, 0, NS);
    for (let n = 0; n < nb; n++) {
      const c = U0 + (n + 0.5) * BWY;
      if (o.pots) { B.put('roofTile', 0xffffff, new THREE.CylinderGeometry(0.15, 0.1, 0.24, 10), ...((p) => [p[0], y + 1.15, p[1]])(f.W(c, -0.11)), 0, DECO); B.put('foliage', 0x3f8a3a, new THREE.IcosahedronGeometry(0.22, 1), ...((p) => [p[0], y + 1.42, p[1]])(f.W(c, -0.11)), 0, DECO); }
      if (o.panels) for (const du of [-BWY / 2 + 0.8, 0.1]) f.box('paint', 0xf8f8f5, c + du, c + du + BWY / 2 - 0.9, y + 0.2, y + 0.76, 0, 0.03, DECO);
    }
  }
  if (arcade) {
    archWall(f, L, BWY, nb, 1.1, yT(1) - 0.25, 0.5);
    const stairBay = (c) => rooms.some((t, i) => t === 'stair' && c > starts[i] && c < starts[i] + 8);
    for (let i = 0; i < nb; i++) {
      const c = U0 + BWY * (i + 0.5), open = stairBay(c) || i === 0 || i === nb - 1 || i === Math.floor(nb / 2) || (o.openU && c > o.openU[0] && c < o.openU[1]);
      if (i % 2 === 0) { const p = f.W(c, -0.25); B.put('plastic', LANTERN[(i / 2 + code.charCodeAt(0)) % 5], lanternGeo, p[0], yT(1) - 1.35, p[1], 0, DECO); B.put('flat', 0x3a3a3a, new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), p[0], yT(1) - 0.8, p[1], 0, DECO); }
      if (open) continue;
      f.box('paint', C.WALL, c - 1.5, c + 1.5, 0.15, 1.1, -0.3, 0, NS); f.box('granite', C.CAP, c - 1.55, c + 1.55, 1.1, 1.17, -0.36, 0.05, DECO);
      if (!o.noHedge) { f.box('brick', 0xffffff, c - 1.6, c + 1.6, 0, 0.35, 0.05, 1.0, NS); { const a = f.W(c - 1.5, 0.12), b = f.W(c + 1.5, 0.92); B.hedges.push([Math.min(a[0], b[0]), Math.max(a[0], b[0]), 0.35, 0.85, Math.min(a[1], b[1]), Math.max(a[1], b[1])]); } }
      f.solid(c - 1.6, c + 1.6, 0, 1.17, -0.36, o.noHedge ? 0.05 : 1.0);
      if (i % 3 === 1) { const p = f.W(c + 0.9, -0.16); B.put('gloss', 0xf2f0ea, new THREE.CylinderGeometry(0.16, 0.12, 0.24, 12), p[0], 1.29, p[1], 0, DECO); const fl = new THREE.IcosahedronGeometry(0.2, 1); fl.scale(1, 0.7, 1); B.put('foliage', 0xf2c81e, fl, p[0], 1.52, p[1], 0, DECO); }
    }
  } else {
    // diềm vòm dẹt tầng 1 (nhà BGH)
    const sh = new THREE.Shape(), y0 = yT(1) - 1.25, y1 = yT(1) - 0.25; sh.moveTo(U0, y1);
    sh.lineTo(U0, y0); for (let i = 0; i < nb; i++) { const c = U0 + BWY * (i + 0.5); sh.lineTo(c - BWY * 0.4, y0); sh.absellipse(c, y0, BWY * 0.4, 0.62, Math.PI, 0, true); } sh.lineTo(-U0, y0); sh.lineTo(-U0, y1); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false, curveSegments: 16 }); g.translate(0, 0, -0.2); f.geo('paint', C.COL, g);
  }
  // mái
  if (roof === 'red') {
    f.box('paint', C.CREAM, U0 - 0.3, -U0 + 0.3, yF, yF + 0.35, -12.3, 0.3, NS);
    const hw = 6.9, h = 3.4, LL = L / 2 + 0.7, sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, h); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: LL * 2, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-LL, yF + 0.35, -6);
    f.geo('roofTile', 0xffffff, g, { s: false }); f.box('roofTile', 0xd8b0a0, -LL, LL, yF + 0.35 + h - 0.06, yF + 0.35 + h + 0.12, -6.14, -5.86, DECO);
    f.solid(U0, -U0, yF, yF + 1.2, -12, 0);
  } else {
    for (const [w1, w2] of [[-0.25, 0], [-12, -11.75]]) f.box('paint', C.CREAM, U0, -U0, yF, yF + 0.9, w1, w2);
    f.box('paint', C.CREAM, U0, U0 + 0.25, yF, yF + 0.9, -11.75, -0.25); f.box('paint', C.CREAM, -U0 - 0.25, -U0, yF, yF + 0.9, -11.75, -0.25);
    f.box('granite', C.CAP, U0 - 0.04, -U0 + 0.04, yF + 0.9, yF + 0.96, -0.3, 0.05, DECO);
  }
  if (o.title) f.sign(signMat(signTex(Math.min(18, 0.3 * L), 1.3, [{ t: o.title }], { bg: '#1f4fa0', border: '#ffffff', ppm: 50 })), Math.min(18, 0.3 * L), 1.3, 0, yF + (roof === 'red' ? 1.2 : 0.45), 0.06, 1, { cast: true });

  // từng phòng
  for (let k = 0; k < F; k++) {
    const y0 = yT(k), y1 = yT(k + 1) - 0.25; let n = 0;
    rooms.forEach((t, i) => {
      const u1 = starts[i], u2 = u1 + widths[i], rw = widths[i];
      if (t === 'stair') { B.setZone('blk' + code); buildStair(f, u1, k, F); return; }
      n++;
      const L0 = u1 + 3.91, R0 = u2 - 1.37, ww = Math.min(2, (R0 - L0 - 0.1) / 4), wA = L0 + ww / 2, wins = [[wA, wA + ww], [wA + 2 * ww + 0.1, wA + 3 * ww + 0.1]];
      B.setZone('blk' + code);
      wallHoles(f, 'paintIn', C.WALL_IN, u1, u2, y0, y1, -3.2, -3, [{ a: u1 + 0.35, b: u1 + 2.69, y1: y0, y2: y0 + 3.0 }, ...wins.map(([a, b]) => ({ a, b, y1: y0 + 0.9, y2: y0 + 2.75 }))]);
      // cửa đi 2 cánh mở áp tường
      f.box('wood', C.DOORFRAME, u1 + 0.35, u1 + 0.43, y0, y0 + 3, -3.22, -2.98, DECO); f.box('wood', C.DOORFRAME, u1 + 2.61, u1 + 2.69, y0, y0 + 3, -3.22, -2.98, DECO); f.box('wood', C.DOORFRAME, u1 + 0.35, u1 + 2.69, y0 + 2.9, y0 + 3, -3.22, -2.98, DECO);
      for (const [a, b] of [[u1 - 0.82, u1 + 0.35], [u1 + 2.69, u1 + 3.86]]) { f.box('wood', C.DOOR, a, b, y0 + 0.02, y0 + 2.94, -2.98, -2.93, DECO); f.box('wood', 0x4a2f1c, a + 0.12, b - 0.12, y0 + 0.2, y0 + 1.3, -2.93, -2.915, DECO); f.box('wood', 0x4a2f1c, a + 0.12, b - 0.12, y0 + 1.5, y0 + 2.75, -2.93, -2.915, DECO); f.box('gold', 0xc9a24a, (a + b) / 2 - 0.04, (a + b) / 2 + 0.04, y0 + 1.0, y0 + 1.1, -2.915, -2.89, DECO); }
      for (const [a, b] of wins) {
        f.box('glass', 0xffffff, a, b, y0 + 0.92, y0 + 2.75, -3.12, -3.1, DECO);
        for (let u = a + 0.3; u < b - 0.05; u += 0.3) f.box('metalPaint', 0xe8e0c8, u - 0.012, u + 0.012, y0 + 0.92, y0 + 2.75, -3.06, -3.035, DECO);
        for (const dy of [1.4, 1.85, 2.3]) f.box('metalPaint', 0xe8e0c8, a, b, y0 + dy - 0.012, y0 + dy + 0.012, -3.06, -3.035, DECO);
        f.box('wood', 0xc9b48c, a - 0.05, b + 0.05, y0 + 0.84, y0 + 0.92, -3.02, -2.9, DECO);
        shutter(f, C.DOOR, a - ww / 2, a, y0 + 0.92, y0 + 2.75, -2.99, -2.93); shutter(f, C.DOOR, b, b + ww / 2, y0 + 0.92, y0 + 2.75, -2.99, -2.93);
        f.solid(a, b, y0 + 0.9, y0 + 2.75, -3.15, -3.05);
      }
      // chân tường
      for (const [a, b] of [[u1, u1 + 0.35], [u1 + 3.86, u2]]) {
        if (o.baseStripe) { if (k === 0) { f.box('gloss', 0x1f3f8a, a, b, y0, y0 + 0.6, -3, -2.98, DECO); f.box('gloss', 0xffffff, a, b, y0 + 0.6, y0 + 0.66, -3, -2.98, DECO); f.box('gloss', C.RED, a, b, y0 + 0.66, y0 + 0.8, -3, -2.98, DECO); } }
        else if (t === 'class') { f.box('wallTile', 0xb9682e, a, b, y0, y0 + 0.78, -3, -2.98, DECO); f.box('wood', 0x8a4520, a, b, y0 + 0.78, y0 + 0.9, -3, -2.97, DECO); }
      }
      const nm = (names[k] && names[k][i]) || `${code}${k + 1}0${n}`;
      f.sign(signMat(signTex(nm.length > 6 ? 1.9 : 1.0, 0.32, [{ t: nm }], { bg: t === 'office' ? '#7b3424' : '#1f4fa0', ppm: 120 })), nm.length > 6 ? 1.9 : 1.0, 0.32, u1 + 1.52, y0 + 3.4, -2.985, 1);
      info.roomNames.push({ k, i, nm, u1, u2, y: y0 });
      // nội thất (vùng riêng để ẩn khi ở xa)
      B.setZone('in' + code);
      for (const w of [-6.12, -9.12]) { f.box('glow', 0xfff8ea, u1 + 2, u2 - 2, y1 - 0.05, y1 - 0.01, w - 0.06, w + 0.06, DECO); f.box('metalPaint', 0xd8dadc, u1 + 1.95, u2 - 1.95, y1 - 0.01, y1, w - 0.1, w + 0.1, DECO); }
      const lp = f.W(u1 + rw / 2, -7.4); info.lights.push({ x: lp[0], y: y0 + 3.2, z: lp[1], k });
      if (t === 'class') furnishClass(B, f, u1, y0, rw, code); else furnishOffice(f, u1, y0);
    });
  }
  B.setZone('main');
  info.W = f.W; info.at = (u, w, y = 0) => { const p = f.W(u, w); return new THREE.Vector3(p[0], y, p[1]); };
  return info;
}
