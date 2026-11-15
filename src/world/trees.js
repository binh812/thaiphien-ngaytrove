// Cây cối: cây bóng mát (bàng lá đỏ/vàng/xanh), cau vua, tùng, hàng rào cây, thảm cỏ 3D, lá rụng.
import * as THREE from 'three';
import { mulberry32, Q } from '../engine/util.js';
import { U, kindMat } from '../engine/materials.js';
import { canvasTex } from '../engine/textures.js';
import { roundPlanter } from './kit.js';
import { PENCIL_ON } from '../engine/pencil/style.js';

/* ---------- texture ---------- */
function leafShape(g, len, wid) { g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid, -len * 0.25, wid * 0.9, -len * 0.8, 0, -len); g.bezierCurveTo(-wid * 0.9, -len * 0.8, -wid, -len * 0.25, 0, 0); }
const clusterTex = () => canvasTex(256, 256, (g, w, h) => {
  const rnd = mulberry32(8); g.clearRect(0, 0, w, h); g.translate(w / 2, h / 2);
  g.strokeStyle = 'rgb(120,105,80)'; g.lineWidth = 5; g.beginPath(); g.moveTo(-60, 70); g.quadraticCurveTo(0, 20, 50, -50); g.stroke();
  for (let i = 0; i < 44; i++) {
    const a = rnd() * 6.283, d = 10 + rnd() * 74, len = 40 + rnd() * 26, v = 150 + rnd() * 80;
    g.save(); g.translate(Math.cos(a) * d * 0.9, Math.sin(a) * d * 0.9); g.rotate(a + Math.PI / 2 + (rnd() - 0.5) * 1.2);
    const gr = g.createLinearGradient(-len * 0.3, 0, len * 0.3, 0); gr.addColorStop(0, `rgb(${v * 0.82 | 0},${v * 0.9 | 0},${v * 0.66 | 0})`); gr.addColorStop(0.5, `rgb(${v | 0},${v | 0},${v * 0.8 | 0})`); gr.addColorStop(1, `rgb(${v * 0.7 | 0},${v * 0.78 | 0},${v * 0.55 | 0})`);
    g.fillStyle = gr; leafShape(g, len, len * 0.3); g.fill(); g.strokeStyle = 'rgba(255,255,235,.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.95); g.stroke(); g.restore();
  }
});
const frondTex = () => canvasTex(512, 160, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = 'rgb(170,180,120)'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  for (let i = 0; i < 64; i++) { const x = 14 + i * 7.7, L = (h * 0.47) * Math.sin(Math.min(1, i / 60 + 0.1) * Math.PI * 0.9 + 0.1), v = 160 + (i * 37 % 60); for (const s of [-1, 1]) { g.strokeStyle = `rgb(${v * 0.78 | 0},${v | 0},${v * 0.62 | 0})`; g.lineWidth = 4.2; g.beginPath(); g.moveTo(x, h / 2); g.quadraticCurveTo(x + 10, h / 2 + s * L * 0.6, x + 22, h / 2 + s * L); g.stroke(); } }
});
const singleLeafTex = () => canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.translate(32, 60); const gr = g.createLinearGradient(-16, 0, 16, 0); gr.addColorStop(0, 'rgb(200,200,170)'); gr.addColorStop(1, 'rgb(250,250,225)'); g.fillStyle = gr; leafShape(g, 56, 22); g.fill(); g.strokeStyle = 'rgba(120,100,70,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -54); g.stroke(); });

/* ---------- vật liệu lá có gió ---------- */
const WIND_V = `
  { float tpF = aFlex * ( 0.35 + uWind );
    vec3 tpW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
    transformed.x += tpF * ( sin( uWindT * 1.3 + tpW.x * 0.21 + tpW.z * 0.17 ) * 0.11 + sin( uWindT * 4.1 + tpW.z * 1.7 + tpW.y * 2.3 ) * 0.035 );
    transformed.z += tpF * ( sin( uWindT * 1.1 + tpW.z * 0.19 - tpW.x * 0.13 ) * 0.08 + cos( uWindT * 3.7 + tpW.x * 1.9 + tpW.y * 2.1 ) * 0.035 );
    transformed.y += tpF * sin( uWindT * 3.1 + tpW.x * 1.3 + tpW.z * 1.1 ) * 0.02; }`;
function windPatch(m, key, extraV = '') {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = U.uWindT; sh.uniforms.uWind = U.uWind; sh.uniforms.uPlayer = U.uPlayer;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFlex; uniform float uWindT; uniform float uWind; uniform vec3 uPlayer;').replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_V + extraV);
  };
  m.customProgramCacheKey = () => 'wind|' + key;
  return m;
}
function leafMaterial(tex, o = {}) {
  const m = windPatch(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, alphaToCoverage: Q.msaa > 0, envMapIntensity: 0.35, ...o }), 'leaf');
  const d = windPatch(new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide }), 'leafD');
  return { m, d };
}

/* ---------- bộ gom hình lá ---------- */
class Cards {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.flex = []; this.idx = []; this.n = 0; }
  /** thẻ lá: tâm c, hai trục a (ngang), b (dọc), pháp tuyến chiếu sáng n, màu rgb, độ lắc */
  quad(c, a, b, n, col, flex, uv = [0, 0, 1, 1]) {
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]], UV = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    for (let i = 0; i < 4; i++) { this.pos.push(c[0] + a[0] * P[i][0] + b[0] * P[i][1], c[1] + a[1] * P[i][0] + b[1] * P[i][1], c[2] + a[2] * P[i][0] + b[2] * P[i][1]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(UV[i][0], UV[i][1]); this.col.push(col[0], col[1], col[2]); this.flex.push(Array.isArray(flex) ? flex[i] : flex); }
    this.idx.push(this.n, this.n + 1, this.n + 2, this.n, this.n + 2, this.n + 3); this.n += 4;
    if (PENCIL_ON) { const k = this.cur || [c[0], c[1], c[2], 1]; (this.cen || (this.cen = [])).push(...k, ...k, ...k, ...k); }      // kiểu chì màu: tâm + bán kính cụm lá của thẻ này (nét cong theo khối)
  }
  mesh(mat, depthMat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1)); if (this.cen) g.setAttribute('aCen', new THREE.Float32BufferAttribute(this.cen, 4)); g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; if (depthMat) m.customDepthMaterial = depthMat; m.matrixAutoUpdate = false; return m;
  }
}
const _c = new THREE.Color();
const lin = (hex, k = 1) => { _c.setHex(hex); return [_c.r * k, _c.g * k, _c.b * k]; };
const PAL = { green: [0x5d8a36, 0x4a7a2c, 0x6a9a3c, 0x3f6d28], red: [0xc2401c, 0xd65a22, 0xa83216, 0xe0782a], gold: [0xc6a830, 0xa8b034, 0xd6b83c, 0x8fa030], dark: [0x2f5a24, 0x3a6a2a, 0x28501f], mango: [0x33602a, 0x3f7030, 0x2a5424] };
function rndDir(rnd) { const y = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - y * y); return [Math.cos(a) * r, y, Math.sin(a) * r]; }

function blobCards(cards, rnd, cx, cy, cz, r, n, pal, canopy, size) {
  cards.cur = [cx, cy, cz, r];
  for (let i = 0; i < n; i++) {
    const d = rndDir(rnd), rr = r * (0.55 + 0.45 * Math.pow(rnd(), 0.5)), p = [cx + d[0] * rr, cy + d[1] * rr * 0.8, cz + d[2] * rr];
    const t1 = rndDir(rnd), s = size * (0.75 + rnd() * 0.6);
    let nx = p[0] - canopy[0], ny = p[1] - canopy[1] + canopy[3] * 0.25, nz = p[2] - canopy[2]; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const b = [d[1] * t1[2] - d[2] * t1[1], d[2] * t1[0] - d[0] * t1[2], d[0] * t1[1] - d[1] * t1[0]], bl = Math.hypot(...b) || 1;
    const depth = Math.min(1, Math.max(0, (Math.hypot(p[0] - canopy[0], (p[1] - canopy[1]) * 1.2, p[2] - canopy[2]) / canopy[3] - 0.25) / 0.75)), low = Math.min(1, Math.max(0, (p[1] - (canopy[1] - canopy[3] * 0.6)) / (canopy[3] * 0.9)));
    const shade = (0.38 + 0.62 * depth) * (0.62 + 0.38 * low) * (0.85 + rnd() * 0.3);
    cards.quad(p, [t1[0] * s, t1[1] * s * 0.6, t1[2] * s], [b[0] / bl * s, b[1] / bl * s, b[2] / bl * s], [nx, ny, nz], lin(pal[Math.floor(rnd() * pal.length)], shade), 0.6 + depth * 0.6);
  }
  cards.cur = null;
}
function trunkGeo(B, rnd, x, y, z, h, r0, r1, color, branches) {
  const pts = [], bend = [(rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector3(x + bend[0] * t * t, y + h * t, z + bend[1] * t * t)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 1, 9, false), P = g.attributes.position, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) { const t = Math.min(1, Math.max(0, (P.getY(i) - y) / h)), r = r0 + (r1 - r0) * t + (t < 0.12 ? (0.12 - t) * r0 * 2.2 : 0); P.setXYZ(i, P.getX(i) - N.getX(i) * (1 - r), P.getY(i) - N.getY(i) * (1 - r), P.getZ(i) - N.getZ(i) * (1 - r)); }
  { const uv = g.attributes.uv, wrap = Math.max(1, Math.round(6.283 * r0 / 0.9)); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * wrap, uv.getX(i) * h / 0.9); }
  B.geo('bark', color, g, { s: false, keepUV: true });
  const top = pts[5];
  for (const br of branches) { const d = new THREE.Vector3(br[0] - top.x, br[1] - (top.y - h * 0.12), br[2] - top.z), L = d.length(), cg = new THREE.CylinderGeometry(r1 * 0.35, r1 * 0.8, L, 7); cg.translate(0, L / 2, 0); cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); cg.translate(top.x, top.y - h * 0.12, top.z); { const uv = cg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * L / 0.9); } B.geo('bark', color, cg, { s: false, keepUV: true }); }
  return top;
}

/** Gọi TRƯỚC khi B.build: dựng thân cây, bồn cây, va chạm thân. Lá dựng ở init(). */
const plan = [];
export function prepare(B) {
  const rnd = mulberry32(1960);
  for (const t of B.trees) {
    const y = t.y || 0, kind = t.kind || 'shade';
    if (kind === 'shade' || kind === 'mango') {
      const s = t.s || 1, h = Math.abs(Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1, pal = kind === 'mango' ? 'mango' : (h < 0.26 ? 'red' : h < 0.42 ? 'gold' : 'green');
      if (t.planter) roundPlanter(B, t.x, t.z, 1.0, 0.4);
      const blobs = [[0, 5.7 * s, 0, 2.2 * s]]; for (let i = 0; i < 5; i++) { const a = i * 1.2566 + h * 6; blobs.push([Math.cos(a) * 1.6 * s, (4.7 + rnd() * 0.5) * s, Math.sin(a) * 1.6 * s, 1.7 * s]); } for (let i = 0; i < 3; i++) { const a = i * 2.094 + h * 3; blobs.push([Math.cos(a) * 2.7 * s, (4.1 + rnd() * 0.6) * s, Math.sin(a) * 2.7 * s, 1.15 * s]); }
      const top = trunkGeo(B, rnd, t.x, y, t.z, 4.3 * s, (kind === 'mango' ? 0.3 : 0.24) * s, 0.15 * s, kind === 'mango' ? 0x6a5440 : 0x8a7560, blobs.slice(1, 6).map(b => [t.x + b[0] * 0.85, y + b[1] - 0.3, t.z + b[2] * 0.85]));
      B.solid(t.x - 0.2 * s, t.x + 0.2 * s, y, y + 4.3 * s, t.z - 0.2 * s, t.z + 0.2 * s);
      plan.push({ kind, x: top.x, y, z: top.z, s, pal, blobs, ox: t.x, oz: t.z });
    } else if (kind === 'palm') {
      const g = new THREE.CylinderGeometry(0.19, 0.27, 8, 14, 8), P = g.attributes.position; for (let i = 0; i < P.count; i++) { const ty = (P.getY(i) + 4) / 8, k = 1 + 0.16 * Math.sin(ty * Math.PI) + 0.02 * Math.sin(ty * 60); P.setX(i, P.getX(i) * k); P.setZ(i, P.getZ(i) * k); }
      B.put('concrete', 0xb0aaa0, g, t.x, 4, t.z, 0, { s: false }); B.put('gloss', 0x6f8f4a, new THREE.CylinderGeometry(0.15, 0.21, 1.3, 12), t.x, 8.6, t.z, 0, { s: false }); B.solid(t.x - 0.22, t.x + 0.22, 0, 8, t.z - 0.22, t.z + 0.22);
      plan.push({ kind, x: t.x, y: 9.15, z: t.z });
    } else if (kind === 'cone') {
      const h = t.h || 2.6, r = t.slim ? Math.min(0.75, h * 0.2) : h * 0.34;
      B.put('bark', 0x6b4a30, new THREE.CylinderGeometry(0.05, 0.08, 0.5, 6), t.x, y + 0.25, t.z, 0, { s: false });
      const cg = new THREE.ConeGeometry(r * 0.8, h * 0.94, 10); B.put('foliage', 0x1f3d1a, cg, t.x, y + 0.3 + h * 0.47, t.z, 0, { s: false }); B.solid(t.x - r * 0.5, t.x + r * 0.5, y, y + h * 0.8, t.z - r * 0.5, t.z + r * 0.5);
      plan.push({ kind, x: t.x, y: y + 0.3, z: t.z, h, r });
    } else if (kind === 'slim') {
      const h = t.h || 6.6; trunkGeo(B, rnd, t.x, y, t.z, h * 0.72, 0.09, 0.045, 0xcbc6b6, []); B.solid(t.x - 0.08, t.x + 0.08, y, y + h * 0.7, t.z - 0.08, t.z + 0.08);
      plan.push({ kind, x: t.x, y: y + h * 0.72, z: t.z, h });
    }
  }
  // lõi tối của hàng rào cây (lá phủ bên ngoài dựng ở init)
  for (const hb of B.hedges) {
    const [x1, x2, y1, y2, z1, z2, type] = hb;
    if (type === 'ball' || type === 'flower' || type === 'flowerP') { const g = new THREE.SphereGeometry(0.5, 12, 8); g.scale((x2 - x1) * 0.82, (y2 - y1) * 0.82, (z2 - z1) * 0.82); B.put('foliage', 0x1f3d1a, g, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, 0, { s: false }); if (type === 'ball' && x2 - x1 > 1.5) B.solid(x1 + 0.5, x2 - 0.5, y1, y2 - 0.4, z1 + 0.5, z2 - 0.5); }
    else if (type !== 'low') B.box('foliage', 0x1f3d1a, x1 + 0.06, x2 - 0.06, y1, y2 - 0.07, z1 + 0.06, z2 - 0.06, { s: false });
  }
}

function grassField(ctx, lawns) {
  // cụm cỏ instanced: mỗi cụm 3 lá, gió + rạp theo người chơi
  const rnd = mulberry32(7), blade = [];
  const NB = 6; for (let b = 0; b < NB; b++) { const a = b * 2.4 + 0.4, dx = Math.cos(a), dz = Math.sin(a), ox = dx * 0.02 * b, oz = dz * 0.02 * b, lean = 0.012 + b * 0.007; for (const [t, w] of [[0, 0.0075], [1 - b * 0.07, 0.0015]]) blade.push([ox - dz * w + dx * lean * t * t, t, oz + dx * w + dz * lean * t * t, t], [ox + dz * w + dx * lean * t * t, t, oz - dx * w + dz * lean * t * t, t]); }
  const g = new THREE.BufferGeometry(), pos = [], flex = [], idx = [];
  blade.forEach(v => { pos.push(v[0], v[1], v[2]); flex.push(v[3]); }); for (let b = 0; b < NB; b++) { const o = b * 4; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1)); g.setIndex(idx);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const list = [];
  for (const [x1, x2, z1, z2, type] of lawns) { const dens = (type === 'field' ? 40 : type === 'planter' ? 90 : 70) * Q.grass, n = Math.round((x2 - x1) * (z2 - z1) * dens), y0 = type === 'planter' ? (z1 < 0 && z1 > -19 ? 0.26 : 0.41) : type === 'field' ? 0.02 : 0.03; for (let i = 0; i < n; i++) list.push([x1 + rnd() * (x2 - x1), y0, z1 + rnd() * (z2 - z1), type === 'field' ? 0.04 + rnd() * 0.04 : 0.055 + rnd() * 0.075, rnd()]); }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindT = U.uWindT; sh.uniforms.uWind = U.uWind; sh.uniforms.uPlayer = U.uPlayer;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFlex; uniform float uWindT; uniform float uWind; uniform vec3 uPlayer; varying float vH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 ip = instanceMatrix[3].xyz; float h = aFlex; vH = h;
        vec2 away = ip.xz - uPlayer.xz; float pd = length( away ); float push = smoothstep( 0.9, 0.15, pd ) * step( abs( uPlayer.y - ip.y ), 1.2 );
        transformed.xz += ( vec2( sin( uWindT * 1.6 + ip.x * 0.5 + ip.z * 0.3 ), cos( uWindT * 1.3 + ip.z * 0.6 ) ) * ( 0.25 + uWind ) * 0.22 + normalize( away + 1e-4 ) * push * 0.9 ) * h * h * 0.1;
        transformed.y -= push * h * 0.5; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix( 0.45, 1.1, vH );');
  };
  mat.customProgramCacheKey = () => 'grass';
  const im = new THREE.InstancedMesh(g, mat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((v, i) => { q.setFromAxisAngle(up, v[4] * 6.283); s.set(1, v[3] * 1.15, 1); m.compose(p.set(v[0], v[1], v[2]), q, s); im.setMatrixAt(i, m); const k = 0.75 + (v[4] * 7 % 1) * 0.5, dry = (v[4] * 13 % 1) < 0.12; im.setColorAt(i, col.setRGB((dry ? 0.36 : 0.15) * k, (dry ? 0.34 : 0.34) * k, 0.07 * k)); });
  im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false; im.name = 'grass'; ctx.scene.add(im);
}

export async function init(ctx) {
  const B = ctx.B, rnd = mulberry32(73), K = Q.leafK;
  const photo = await Promise.all(['leafcluster', 'leaf'].map(k => new THREE.TextureLoader().loadAsync('assets/tex/' + k + '.png').then(t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso; return t; }, () => { console.warn('[cây] thiếu ảnh lá thật ' + k + ', dùng lá vẽ bằng mã'); return null; })));
  const tex = photo[0] || clusterTex(), leaf = leafMaterial(tex), cards = new Cards();
  const palmM = leafMaterial(frondTex(), { roughness: 0.5 }), fronds = new Cards();
  const litter = [];
  for (const t of plan) {
    if (t.kind === 'shade' || t.kind === 'mango') {
      const s = t.s, canopy = [t.x, t.y + 4.9 * s, t.z, 3.9 * s], pal = PAL[t.pal], mix = t.pal === 'green' || t.pal === 'mango' ? pal : [...pal, ...pal, PAL.green[0]];
      for (const b of t.blobs) blobCards(cards, rnd, t.x + b[0], t.y + b[1], t.z + b[2], b[3], Math.round(b[3] * b[3] * (t.kind === 'mango' ? 80 : 62) * K), mix, canopy, (t.kind === 'mango' ? 0.46 : 0.5) * Math.sqrt(s));
      const n = Math.round((t.pal === 'green' ? 16 : 46) * K); for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 6.2 * s; litter.push([t.ox + Math.cos(a) * d - 0.8, t.oz + Math.sin(a) * d - 0.5, pal[Math.floor(rnd() * pal.length)]]); }
      ctx.treeTops = ctx.treeTops || []; ctx.treeTops.push({ x: t.x, y: t.y + 4.4 * s, z: t.z, r: 3.4 * s, pal: t.pal });
    } else if (t.kind === 'palm') {
      for (let i = 0; i < 13; i++) {
        const a = i / 13 * 6.283 + rnd() * 0.3, droop = 0.25 + rnd() * 0.45 + (i % 3) * 0.12, L = 3.3 + rnd() * 0.6, dx = Math.cos(a), dz = Math.sin(a), col = lin(PAL.dark[i % 3], 1.25);
        let px = t.x + dx * 0.1, py = t.y, pz = t.z + dz * 0.1, ang = 0.75 - droop * 0.2;
        for (let sgm = 0; sgm < 5; sgm++) {
          const sl = L / 5, nx2 = px + dx * Math.cos(ang) * sl, ny2 = py + Math.sin(ang) * sl, nz2 = pz + dz * Math.cos(ang) * sl, wv = 0.55 * (0.7 + 0.3 * Math.sin((sgm + 0.5) / 5 * Math.PI));
          const c = [(px + nx2) / 2, (py + ny2) / 2, (pz + nz2) / 2], av = [(nx2 - px) / 2, (ny2 - py) / 2, (nz2 - pz) / 2], bv = [-dz * wv, 0, dx * wv];
          fronds.quad(c, av, bv, [dx * 0.3, 0.9, dz * 0.3], col, [sgm * 0.25, (sgm + 1) * 0.25, (sgm + 1) * 0.25, sgm * 0.25], [sgm / 5, 0, (sgm + 1) / 5, 1]);
          px = nx2; py = ny2; pz = nz2; ang -= droop * (0.3 + sgm * 0.16);
        }
      }
    } else if (t.kind === 'cone') {
      const n = Math.round(t.h * t.r * 150 * K);
      for (let i = 0; i < n; i++) { const ty = Math.pow(rnd(), 0.8), a = rnd() * 6.283, rr = t.r * (1 - ty) * (0.82 + rnd() * 0.25) + 0.03, p = [t.x + Math.cos(a) * rr, t.y + ty * t.h, t.z + Math.sin(a) * rr], t1 = rndDir(rnd), s = 0.16 + rnd() * 0.1;
        cards.quad(p, [t1[0] * s, t1[1] * s, t1[2] * s], [-t1[2] * s, s * 0.5, t1[0] * s], [Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8], lin(PAL.dark[i % 3], 0.7 + rnd() * 0.5), 0.15 + ty * 0.3); }
    } else if (t.kind === 'slim') {
      const canopy = [t.x, t.y + 0.4, t.z, 1.9];
      for (let k = 0; k < 6; k++) { const a = k * 1.05, d = k ? 0.9 : 0; blobCards(cards, rnd, t.x + Math.cos(a) * d, t.y + (k ? 0.1 + (k % 2) * 0.7 : 1.0), t.z + Math.sin(a) * d, 0.95, Math.round(26 * K), PAL.green, canopy, 0.42); }
    }
  }
  // lá phủ hàng rào cây
  for (const [x1, x2, y1, y2, z1, z2, type] of B.hedges) {
    const ball = type === 'ball' || type === 'flower' || type === 'flowerP', cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, cz = (z1 + z2) / 2, rx = (x2 - x1) / 2, ry = (y2 - y1) / 2, rz = (z2 - z1) / 2;
    const area = ball ? 12.6 * ((rx * ry + ry * rz + rx * rz) / 3) : (x2 - x1) * (z2 - z1) + 2 * (y2 - y1) * ((x2 - x1) + (z2 - z1)), n = Math.round(area * (type === 'low' ? 30 : 95) * K);
    for (let i = 0; i < n; i++) {
      let p, nrm;
      if (ball) { const d = rndDir(rnd); d[1] = Math.abs(d[1]) * 1.2 - 0.25; p = [cx + d[0] * rx * 0.95, cy + d[1] * ry * 0.95, cz + d[2] * rz * 0.95]; nrm = [d[0] * 0.7, 0.5 + d[1] * 0.5, d[2] * 0.7]; }
      else { const f = rnd() * area, top = (x2 - x1) * (z2 - z1); if (f < top) { p = [x1 + rnd() * (x2 - x1), y2 - 0.03, z1 + rnd() * (z2 - z1)]; nrm = [0, 1, 0]; } else { const side = Math.floor(rnd() * 4), yy = y1 + Math.pow(rnd(), 0.7) * (y2 - y1); if (side < 2) { p = [x1 + rnd() * (x2 - x1), yy, side ? z2 - 0.03 : z1 + 0.03]; nrm = [0, 0.55, side ? 0.8 : -0.8]; } else { p = [side === 2 ? x1 + 0.03 : x2 - 0.03, yy, z1 + rnd() * (z2 - z1)]; nrm = [side === 2 ? -0.8 : 0.8, 0.55, 0]; } } }
      const t1 = rndDir(rnd), s = 0.1 + rnd() * 0.08, fl = (type === 'flower' || type === 'flowerP') && rnd() < 0.3, lowF = type === 'low';
      const col = fl ? lin(type === 'flower' ? 0xd8305a : 0xb44cc8, 1) : lin(PAL.dark[i % 3], (0.75 + rnd() * 0.6) * (0.6 + 0.4 * Math.min(1, (p[1] - y1) / Math.max(0.2, y2 - y1) + 0.3)));
      cards.quad(p, [t1[0] * s, t1[1] * s * (lowF ? 0.3 : 1), t1[2] * s], [-t1[2] * s, s * 0.6, t1[0] * s], nrm, col, 0.1);
    }
  }
  const leafMesh = cards.mesh(leaf.m, leaf.d); leafMesh.name = 'leaves'; leafMesh.frustumCulled = false; ctx.scene.add(leafMesh);
  if (fronds.n) { const fm = fronds.mesh(palmM.m, palmM.d); fm.name = 'fronds'; fm.frustumCulled = false; ctx.scene.add(fm); }
  // lá rụng trên sân + trên đường nội bộ
  for (let i = 0; i < 260 * K; i++) litter.push([38.6 + rnd() * 5, -34 + rnd() * 84, PAL[rnd() < 0.5 ? 'red' : 'gold'][Math.floor(rnd() * 4)]]);
  const lg = new THREE.PlaneGeometry(0.22, 0.3); lg.rotateX(-Math.PI / 2);
  const lm = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ map: photo[1] || singleLeafTex(), alphaTest: 0.5, roughness: 0.75, side: THREE.DoubleSide }), litter.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), cc = new THREE.Color();
  litter.forEach(([x, z, c], i) => { e.set((rnd() - 0.5) * 0.3, rnd() * 6.283, (rnd() - 0.5) * 0.3); q.setFromEuler(e); const s = 0.7 + rnd() * 0.7; m4.compose(pv.set(x, 0.022 + rnd() * 0.012, z), q, sv.set(s, s, s)); lm.setMatrixAt(i, m4); lm.setColorAt(i, cc.setHex(c).multiplyScalar(0.7 + rnd() * 0.4)); });
  lm.receiveShadow = true; lm.frustumCulled = false; lm.name = 'litter'; ctx.scene.add(lm);
  if (Q.grass > 0) grassField(ctx, B.lawns);
}
