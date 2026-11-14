// Sinh texture PBR bằng mã (màu, pháp tuyến, độ nhám) — mọi texture lặp liền mép.
import * as THREE from 'three';
import { mulberry32, clamp, Q, param } from './util.js';

const S = Q.tex;                       // cạnh texture (px)
const N = S * S;

/* ---------- nhiễu lặp liền mép ---------- */
function valueLayer(period, seed) {
  const rnd = mulberry32(seed), lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(N), k = period / S;
  for (let y = 0; y < S; y++) {
    const fy = y * k, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % period) * period, yb = ((y0 + 1) % period) * period;
    for (let x = 0; x < S; x++) {
      const fx = x * k, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % period, xb = (x0 + 1) % period;
      const a = lat[ya + xa], b = lat[ya + xb], c = lat[yb + xa], d = lat[yb + xb];
      out[y * S + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
function fbm(period, oct, seed, gain = 0.5) {
  const out = new Float32Array(N); let amp = 1, tot = 0;
  for (let o = 0; o < oct && period <= S / 2; o++) {
    const l = valueLayer(period, seed + o * 101);
    for (let i = 0; i < N; i++) out[i] += l[i] * amp;
    tot += amp; amp *= gain; period *= 2;
  }
  for (let i = 0; i < N; i++) out[i] /= tot;
  return out;
}
// các lớp nhiễu dùng chung
const NZ = { lo: fbm(4, 4, 11), mid: fbm(16, 4, 23), hi: fbm(64, 3, 37), grain: valueLayer(S / 2, 53), blot: fbm(3, 3, 71) };
const at = (arr, x, y) => arr[(((y % S) + S) % S) * S + (((x % S) + S) % S)];

/* ---------- đóng gói thành texture ---------- */
function dataTex(data, srgb) {
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = Q.aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
/**
 * pixel(x, y, o): ghi o.h (độ cao 0..1), o.r/g/b (0..1, sRGB), o.ro (độ nhám 0..1)
 * meters: bề rộng thật mà 1 lần lặp texture phủ; bump: độ nổi (m) ứng với h = 1
 */
function build(meters, bump, pixel) {
  const H = new Float32Array(N), col = new Uint8Array(N * 4), rm = new Uint8Array(N * 4), nm = new Uint8Array(N * 4), o = { h: 0, r: 1, g: 1, b: 1, ro: 0.8 };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; o.h = 0.5; o.r = o.g = o.b = 1; o.ro = 0.8; pixel(x, y, o, x / S, y / S);
    H[i] = o.h; col[i * 4] = clamp(o.r, 0, 1) * 255; col[i * 4 + 1] = clamp(o.g, 0, 1) * 255; col[i * 4 + 2] = clamp(o.b, 0, 1) * 255; col[i * 4 + 3] = 255;
    const r = clamp(o.ro, 0.03, 1) * 255; rm[i * 4] = 255; rm[i * 4 + 1] = r; rm[i * 4 + 2] = 0; rm[i * 4 + 3] = 255;
  }
  const k = bump * S / meters;          // đổi chênh cao giữa 2 điểm ảnh thành độ dốc
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, dx = (at(H, x + 1, y) - at(H, x - 1, y)) * 0.5 * k, dy = (at(H, x, y + 1) - at(H, x, y - 1)) * 0.5 * k;
    const l = 1 / Math.hypot(dx, dy, 1);
    nm[i * 4] = (-dx * l * 0.5 + 0.5) * 255; nm[i * 4 + 1] = (-dy * l * 0.5 + 0.5) * 255; nm[i * 4 + 2] = (l * 0.5 + 0.5) * 255; nm[i * 4 + 3] = 255;
  }
  return { map: dataTex(col, true), normalMap: dataTex(nm, false), roughnessMap: dataTex(rm, false), meters };
}
const hash2 = (a, b, s = 0) => { let h = (a * 374761393 + b * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- bộ texture ---------- */
const defs = {
  // vữa sơn: trắng (màu do vật liệu nhuộm), gợn bay nhẹ + hạt cát mịn
  plaster: () => build(2.4, 0.004, (x, y, o) => {
    const a = at(NZ.mid, x, y), b = at(NZ.hi, x, y), g = at(NZ.grain, x, y), l = at(NZ.lo, x, y);
    o.h = a * 0.45 + b * 0.35 + g * 0.2;
    const v = 0.9 + l * 0.1 + (b - 0.5) * 0.06; o.r = o.g = o.b = v; o.ro = 0.82 + g * 0.14;
  }),
  // bê tông trần
  concrete: () => build(3, 0.006, (x, y, o) => {
    const a = at(NZ.mid, x, y), b = at(NZ.hi, x, y), g = at(NZ.grain, x, y), l = at(NZ.lo, x, y);
    o.h = a * 0.4 + b * 0.3 + g * 0.3 - (g > 0.93 ? 0.5 : 0);
    const v = 0.78 + l * 0.16 + (b - 0.5) * 0.1; o.r = v; o.g = v * 0.985; o.b = v * 0.96; o.ro = 0.78 + g * 0.2;
  }),
  // sân lát gạch block bê tông 40×40 cm
  pavers: () => build(3.2, 0.012, (x, y, o, u, v) => {
    const c = 8, fu = u * c, fv = v * c, iu = Math.floor(fu), iv = Math.floor(fv), du = fu - iu, dv = fv - iv;
    const e = Math.min(du, 1 - du, dv, 1 - dv), joint = sm(0.012, 0.045, e), tone = hash2(iu, iv, 1);
    const b = at(NZ.hi, x, y), g = at(NZ.grain, x, y), l = at(NZ.lo, x * 2, y * 2), bl = at(NZ.blot, x, y);
    o.h = joint * (0.75 + tone * 0.12) + b * 0.14 + g * 0.1;
    let val = 0.7 + tone * 0.1 + (b - 0.5) * 0.1 + (l - 0.5) * 0.14; val *= 0.7 + 0.3 * joint; val *= 0.86 + 0.14 * sm(0.3, 0.6, bl);
    o.r = val * 1.04; o.g = val * 0.99; o.b = val * 0.91; o.ro = 0.72 + g * 0.2 + (1 - joint) * 0.1;
  }),
  // vỉa hè gạch đỏ con sâu / chữ nhật so le
  brickPave: () => build(1.6, 0.012, (x, y, o, u, v) => {
    const rows = 16, row = Math.floor(v * rows), fu = u * 8 + (row % 2) * 0.5, iu = Math.floor(fu), du = fu - iu, dv = v * rows - row;
    const e = Math.min(du * 2, (1 - du) * 2, dv, 1 - dv), joint = sm(0.03, 0.1, e), tone = hash2(iu, row, 2), b = at(NZ.hi, x, y), g = at(NZ.grain, x, y), l = at(NZ.lo, x, y);
    o.h = joint * 0.8 + b * 0.12 + g * 0.08;
    const k = (0.8 + tone * 0.25 + (b - 0.5) * 0.15) * (0.6 + 0.4 * joint) * (0.85 + l * 0.2);
    o.r = 0.66 * k; o.g = 0.33 * k; o.b = 0.26 * k; if (joint < 0.3) { o.r = o.g = o.b = 0.42; }
    o.ro = 0.78 + g * 0.18;
  }),
  // nhựa đường
  asphalt: () => build(4, 0.008, (x, y, o) => {
    const g = at(NZ.grain, x, y), g2 = at(NZ.grain, x * 2 + 17, y * 2 + 5), b = at(NZ.hi, x, y), l = at(NZ.lo, x, y), bl = at(NZ.blot, x, y);
    o.h = g * 0.5 + g2 * 0.3 + b * 0.2;
    let v = 0.2 + g * 0.1 + (g2 > 0.8 ? 0.12 : 0) + (l - 0.5) * 0.08; v *= 0.85 + 0.25 * bl;
    o.r = v; o.g = v; o.b = v * 1.03; o.ro = 0.7 + g * 0.25;
  }),
  // ngói đất nung (hàng ngói âm dương)
  roofTile: () => build(1.6, 0.05, (x, y, o, u, v) => {
    const rows = 5, cols = 8, fv = v * rows, row = Math.floor(fv), dv = fv - row, fu = u * cols + (row % 2) * 0.5, iu = Math.floor(fu), du = fu - iu;
    const prof = Math.sin(du * Math.PI), lap = 1 - dv, tone = hash2(iu, row, 3), b = at(NZ.hi, x, y), g = at(NZ.grain, x, y), l = at(NZ.lo, x, y);
    o.h = prof * 0.6 + lap * 0.35 + b * 0.05;
    const edge = sm(0, 0.08, dv) * sm(0, 0.1, du) * sm(0, 0.1, 1 - du), k = (0.72 + tone * 0.3 + (b - 0.5) * 0.2) * (0.5 + 0.5 * edge) * (0.8 + 0.3 * l);
    o.r = 0.62 * k; o.g = 0.27 * k; o.b = 0.19 * k;
    const moss = sm(0.62, 0.8, at(NZ.blot, x, y)) * 0.35; o.r = o.r * (1 - moss) + 0.2 * moss; o.g = o.g * (1 - moss) + 0.22 * moss; o.b = o.b * (1 - moss) + 0.13 * moss;
    o.ro = 0.75 + g * 0.2;
  }),
  // gạch men lát nền 50×50, bóng
  floorTile: () => build(2, 0.003, (x, y, o, u, v) => {
    const c = 4, fu = u * c, fv = v * c, iu = Math.floor(fu), iv = Math.floor(fv), du = fu - iu, dv = fv - iv, e = Math.min(du, 1 - du, dv, 1 - dv), joint = sm(0.004, 0.014, e);
    const tone = hash2(iu, iv, 4), b = at(NZ.mid, x, y), l = at(NZ.lo, x * 3, y * 3);
    o.h = joint; const k = (0.9 + tone * 0.05 + (l - 0.5) * 0.08 + (b - 0.5) * 0.04) * (0.5 + 0.5 * joint);
    o.r = k; o.g = k * 0.985; o.b = k * 0.95; o.ro = joint > 0.9 ? 0.22 + b * 0.12 : 0.9;
  }),
  // gạch men ốp tường 20×30 trắng
  wallTile: () => build(1.2, 0.003, (x, y, o, u, v) => {
    const fu = u * 6, fv = v * 4, du = fu - Math.floor(fu), dv = fv - Math.floor(fv), e = Math.min(du, 1 - du, dv, 1 - dv), joint = sm(0.012, 0.04, e);
    o.h = joint; const k = 0.95 * (0.62 + 0.38 * joint); o.r = k; o.g = k; o.b = k; o.ro = joint > 0.9 ? 0.16 : 0.85;
  }),
  // gỗ ván
  wood: () => build(1.2, 0.004, (x, y, o, u, v) => {
    const planks = 6, fu = u * planks, iu = Math.floor(fu), du = fu - iu, joint = sm(0.01, 0.05, Math.min(du, 1 - du));
    const g = at(NZ.mid, x * 4 + iu * 91, Math.floor(y / 6) + iu * 37), f = at(NZ.hi, x * 2, Math.floor(y / 4)), tone = hash2(iu, 0, 5);
    const ring = 0.5 + 0.5 * Math.sin((g * 9 + du * 3) * 6.283);
    o.h = joint * 0.8 + ring * 0.12 + f * 0.08; const k = (0.72 + tone * 0.22 + ring * 0.14 + (f - 0.5) * 0.1) * (0.55 + 0.45 * joint);
    o.r = k; o.g = k * 0.93; o.b = k * 0.84; o.ro = 0.5 + f * 0.25;
  }),
  // vỏ cây
  bark: () => build(1, 0.03, (x, y, o) => {
    const a = at(NZ.mid, x * 3, Math.floor(y / 3)), b = at(NZ.hi, x * 2, Math.floor(y / 2)), l = at(NZ.lo, x, y);
    const ridge = Math.abs(a - 0.5) * 2; o.h = ridge * 0.7 + b * 0.3;
    const k = 0.55 + ridge * 0.5 + (l - 0.5) * 0.2; o.r = k; o.g = k * 0.96; o.b = k * 0.9; o.ro = 0.92;
  }),
  // nền đất cỏ
  grass: () => build(4, 0.02, (x, y, o) => {
    const a = at(NZ.mid, x, y), b = at(NZ.hi, x, y), g = at(NZ.grain, x, y), l = at(NZ.lo, x, y), bl = at(NZ.blot, x, y);
    o.h = a * 0.4 + b * 0.3 + g * 0.3; const dry = sm(0.55, 0.75, bl) * 0.5, k = 0.75 + g * 0.35 + (l - 0.5) * 0.3;
    o.r = (0.3 + dry * 0.2) * k; o.g = (0.46 + dry * 0.04) * k; o.b = (0.16 + dry * 0.04) * k; o.ro = 0.9;
  }),
  // tôn sóng
  metalCorr: () => build(1.2, 0.02, (x, y, o, u) => {
    const s = 0.5 + 0.5 * Math.sin(u * 12 * 6.283), b = at(NZ.hi, x, y), l = at(NZ.lo, x, y);
    o.h = s; const k = 0.82 + (l - 0.5) * 0.2 + (b - 0.5) * 0.08; o.r = o.g = o.b = k; o.ro = 0.38 + b * 0.25;
  }),
  // cát hố nhảy
  sand: () => build(2, 0.01, (x, y, o) => {
    const g = at(NZ.grain, x, y), a = at(NZ.mid, x, y), l = at(NZ.lo, x, y);
    o.h = a * 0.6 + g * 0.4; const k = 0.82 + g * 0.16 + (l - 0.5) * 0.12; o.r = k; o.g = k * 0.9; o.b = k * 0.7; o.ro = 0.95;
  }),
  // mặt sân thể thao sơn acrylic
  court: () => build(3, 0.003, (x, y, o) => {
    const g = at(NZ.grain, x, y), l = at(NZ.lo, x, y), b = at(NZ.blot, x, y);
    o.h = g; const k = 0.88 + (l - 0.5) * 0.14 + (g - 0.5) * 0.08 - sm(0.6, 0.8, b) * 0.06; o.r = o.g = o.b = k; o.ro = 0.62 + g * 0.2;
  }),
  // tường gạch đỏ xây trần
  brick: () => build(1.2, 0.012, (x, y, o, u, v) => {
    const rows = 16, row = Math.floor(v * rows), fu = u * 6 + (row % 2) * 0.5, iu = Math.floor(fu), du = fu - iu, dv = v * rows - row;
    const joint = sm(0.02, 0.06, Math.min(du / 3 * 2, (1 - du) / 3 * 2 + 0.0, dv, 1 - dv) + (Math.min(du, 1 - du) < 0.03 ? -1 : 0)), tone = hash2(iu, row, 7), b = at(NZ.hi, x, y), g = at(NZ.grain, x, y);
    o.h = joint * 0.8 + b * 0.2; const k = (0.75 + tone * 0.35 + (b - 0.5) * 0.2);
    if (joint > 0.5) { o.r = 0.6 * k; o.g = 0.27 * k; o.b = 0.2 * k; } else { o.r = 0.62; o.g = 0.6; o.b = 0.56; }
    o.ro = 0.85 + g * 0.1;
  }),
  // đá granite mài (bệ tượng, bậc thềm)
  granite: () => build(1.5, 0.001, (x, y, o) => {
    const g = at(NZ.grain, x, y), g2 = at(NZ.grain, x * 2 + 9, y * 2 + 31), l = at(NZ.lo, x, y);
    o.h = 0.5; const k = 0.7 + (g - 0.5) * 0.5 + (g2 > 0.82 ? -0.25 : 0) + (l - 0.5) * 0.1; o.r = k; o.g = k * 0.98; o.b = k * 0.96; o.ro = 0.25 + g * 0.15;
  }),
  // vải / bạt
  fabric: () => build(0.5, 0.002, (x, y, o) => {
    const w = (Math.sin(x * 6.283 * 32 / S) * Math.sin(y * 6.283 * 32 / S)) * 0.5 + 0.5; o.h = w; const k = 0.9 + w * 0.1; o.r = o.g = o.b = k; o.ro = 0.9;
  }),
};

/* ---------- vật liệu quét (ảnh thật, CC0) — nạp trước khi dựng cảnh; thiếu tệp thì dùng bản sinh bằng mã ---------- */
const scans = new Map();
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
// màu trung bình (tuyến tính) của bản sinh bằng mã — tính sẵn để khỏi dựng lại texture chỉ để đo
const PROC_MEAN = {"plaster":[0.8884,0.8884,0.8884],"concrete":[0.7108,0.6869,0.6482],"pavers":[0.46,0.4122,0.3418],"brickPave":[0.2653,0.0765,0.0552],"asphalt":[0.049,0.049,0.052],"roofTile":[0.213,0.0382,0.0198],"floorTile":[0.8045,0.7774,0.7162],"wallTile":[0.8262,0.8262,0.8262],"wood":[0.7227,0.6186,0.4921],"bark":[0.4025,0.3675,0.3186],"grass":[0.0645,0.1535,0.0191],"metalCorr":[0.6393,0.6393,0.6393],"sand":[0.789,0.6217,0.3546],"court":[0.7478,0.7478,0.7478],"brick":[0.2924,0.1064,0.0783],"granite":[0.4617,0.4414,0.4215],"fabric":[0.887,0.887,0.887]};
function procMean(name) {
  if (PROC_MEAN[name]) return PROC_MEAN[name];
  const d = defs[name]().map.image.data, m = [0, 0, 0]; let n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) { m[0] += srgb2lin(d[i] / 255); m[1] += srgb2lin(d[i + 1] / 255); m[2] += srgb2lin(d[i + 2] / 255); n++; }
  return m.map(v => v / n);
}
export async function loadScans(onProgress) {
  if (param('scan', '1') === '0') return { loaded: 0, failed: [] };
  let man; try { const r = await fetch('assets/tex/manifest.json'); if (!r.ok) throw new Error('HTTP ' + r.status); man = await r.json(); } catch (e) { console.warn('[tex] không nạp được manifest vật liệu quét, dùng vật liệu sinh bằng mã:', e.message); return { loaded: 0, failed: ['manifest'] }; }
  const want = Q.tex >= 1024 ? 2048 : Q.tex >= 512 ? 1024 : 512, loader = new THREE.TextureLoader(), names = Object.keys(man).filter(k => defs[k]), failed = []; let done = 0;
  await Promise.all(names.map(async (name) => {
    const e = man[name], size = e.sizes.includes(want) ? want : Math.max(...e.sizes.filter(s => s <= want));
    try {
      const [map, normalMap, arm] = await Promise.all(['col', 'nor', 'arm'].map(k => loader.loadAsync(`assets/tex/${name}_${k}_${size}.jpg`)));
      for (const t of [map, normalMap, arm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Q.aniso; }
      map.colorSpace = THREE.SRGBColorSpace;
      const pm = procMean(name), gain = e.keep ? [1, 1, 1] : pm.map((v, i) => clamp(v / Math.max(e.mean[i], 1e-3), 0.25, 6));
      scans.set(name, { map, normalMap, roughnessMap: arm, aoMap: arm, meters: e.meters, gain, scan: true });
    } catch (err) { failed.push(name); console.warn('[tex] thiếu vật liệu quét', name, '→ dùng bản sinh bằng mã'); }
    if (onProgress) onProgress(++done / names.length);
  }));
  return { loaded: scans.size, failed, gain: Object.fromEntries([...scans].map(([k, v]) => [k, v.gain.map(g => +g.toFixed(2))])) };
}

const cache = new Map();
export function texSet(name) {
  if (scans.has(name)) return scans.get(name);
  if (!cache.has(name)) { if (!defs[name]) throw new Error('Không có texture: ' + name); cache.set(name, defs[name]()); }
  return cache.get(name);
}

// texture nhiễu RGBA dùng cho vết thời gian, vũng nước
export const grungeTex = (() => {
  const d = new Uint8Array(N * 4), streak = new Float32Array(N), col = valueLayer(S / 4, 97);
  for (let x = 0; x < S; x++) { let acc = 0; for (let y = 0; y < S * 2; y++) { const yy = y % S, c = at(col, x, 0) > 0.6 ? at(NZ.hi, x, yy) : 0; acc = Math.max(acc * 0.985, c > 0.62 ? 1 : 0); if (y >= S) streak[yy * S + x] = acc; } }
  for (let i = 0; i < N; i++) { d[i * 4] = NZ.lo[i] * 255; d[i * 4 + 1] = NZ.mid[i] * 255; d[i * 4 + 2] = streak[i] * 255; d[i * 4 + 3] = NZ.blot[i] * 255; }
  return dataTex(d, false);
})();

/* ---------- canvas 2D: biển hiệu, băng rôn ---------- */
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Q.aniso;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** Biển chữ: lines = [{t, s (cỡ tương đối), c (màu), f (kiểu chữ)}] hoặc chuỗi */
export function signTex(wM, hM, lines, o = {}) {
  const ppm = o.ppm || 80, w = Math.min(2048, Math.max(64, Math.round(wM * ppm))), h = Math.min(2048, Math.max(48, Math.round(hM * ppm)));
  return canvasTex(w, h, (g) => {
    g.fillStyle = o.bg || '#1f4fa0'; g.fillRect(0, 0, w, h);
    if (o.grad) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, o.grad[0]); gr.addColorStop(1, o.grad[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    if (o.draw) o.draw(g, w, h);
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = Math.max(3, h * 0.035); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); }
    const L = lines.map(l => (typeof l === 'string' ? { t: l } : l)), tot = L.reduce((a, l) => a + (l.s || 1), 0), pad = h * 0.1, unit = (h - pad * 2) / tot;
    let y = pad; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of L) {
      const lh = unit * (l.s || 1); let fs = lh * 0.74; g.font = `${l.f || 'bold'} ${fs}px Arial, "Segoe UI", sans-serif`;
      const mw = g.measureText(l.t).width, lim = w * 0.92; if (mw > lim) { fs *= lim / mw; g.font = `${l.f || 'bold'} ${fs}px Arial, "Segoe UI", sans-serif`; }
      g.fillStyle = l.c || o.fg || '#ffffff'; g.fillText(l.t, w / 2, y + lh / 2); y += lh;
    }
  });
}
