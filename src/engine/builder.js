// Bộ dựng hình: gom mọi khối theo (loại vật liệu, vùng) rồi gộp thành ít lệnh vẽ; đồng thời ghi lại hộp va chạm.
import * as THREE from 'three';
import { kindMat, kindMeters, glassMat, glowMat } from './materials.js';

const _c = new THREE.Color();
// tông thực tế: màu sơn ngoài đời ít rực hơn mã màu thuần → kéo về xám 20%, tối 8%
function setTone(hex) { _c.setHex(hex); const l = _c.r * 0.2126 + _c.g * 0.7152 + _c.b * 0.0722; _c.r = (l + (_c.r - l) * 0.8) * 0.92; _c.g = (l + (_c.g - l) * 0.8) * 0.92; _c.b = (l + (_c.b - l) * 0.8) * 0.92; }
const FACES = [ // pháp tuyến, 4 góc (chỉ số 0/1 chọn min/max cho x,y,z), trục u, trục v
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], u: 2, v: 1 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], u: 2, v: 1 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], u: 0, v: 2 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], u: 0, v: 2 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], u: 0, v: 1 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], u: 0, v: 1 },
];

class Group {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
}

export class Builder {
  constructor() {
    this.groups = new Map();
    this.solids = [];     // [x1,x2,y1,y2,z1,z2]
    this.ramps = [];      // {pts: Float32Array (8 đỉnh lồi)}
    this.zone = 'main';
    this.zoneBox = new Map();
    this.extra = [];      // mesh riêng (biển hiệu…): {mesh, zone}
    // yêu cầu cho các hệ khác: vật thể động, cờ, đèn, cây, hàng rào cây, thảm cỏ, chỗ ngồi, điểm tương tác
    this.spawn = []; this.flags = []; this.lamps = []; this.trees = []; this.hedges = []; this.lawns = []; this.seats = []; this.spots = [];
  }
  setZone(z) { this.zone = z || 'main'; }
  _g(kind, o) {
    const key = `${kind}|${this.zone}|${o && o.ns ? 1 : 0}`;
    let g = this.groups.get(key);
    if (!g) { g = new Group(); g.kind = kind; g.zone = this.zone; g.ns = !!(o && o.ns); this.groups.set(key, g); }
    return g;
  }
  /** Hộp thẳng trục. o: {s:false bỏ va chạm, ns:true không đổ bóng, uvk: hệ số UV} */
  box(kind, color, x1, x2, y1, y2, z1, z2, o) {
    if (x1 > x2) [x1, x2] = [x2, x1]; if (y1 > y2) [y1, y2] = [y2, y1]; if (z1 > z2) [z1, z2] = [z2, z1];
    const g = this._g(kind, o), lim = [[x1, x2], [y1, y2], [z1, z2]], k = 1 / kindMeters(kind);
    setTone(color);
    for (const f of FACES) {
      for (const c of f.c) {
        const p = [lim[0][c[0]], lim[1][c[1]], lim[2][c[2]]];
        g.pos.push(p[0], p[1], p[2]); g.nrm.push(f.n[0], f.n[1], f.n[2]); g.uv.push(p[f.u] * k, p[f.v] * k); g.col.push(_c.r, _c.g, _c.b);
      }
      g.idx.push(g.n, g.n + 1, g.n + 2, g.n, g.n + 2, g.n + 3); g.n += 4;
    }
    if (!o || o.s !== false) this.solids.push([x1, x2, y1, y2, z1, z2]);
    // tấm nền mỏng nhô khỏi mặt đất (vỉa hè, bó vỉa, lối lát, thảm…) tuy không khai báo va chạm vẫn phải đỡ được chân người và đồ vật,
    // nếu không mọi thứ đứng trên đó sẽ lún xuống tới mặt va chạm chung ở cao độ 0
    else if (y1 <= 0.031 && y2 >= 0.015 && y2 <= 0.2 && Math.min(x2 - x1, z2 - z1) >= 0.19 && (x2 - x1) * (z2 - z1) >= 1) this.solids.push([x1, x2, -0.2, y2, z1, z2]);
  }
  solid(x1, x2, y1, y2, z1, z2) { this.solids.push([Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2), Math.min(z1, z2), Math.max(z1, z2)]); }
  /** Thêm hình bất kỳ (đã ở toạ độ thế giới). UV chiếu theo trục pháp tuyến trội trừ khi o.keepUV */
  geo(kind, color, geometry, o) {
    const g = this._g(kind, o), src = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!src.attributes.normal) src.computeVertexNormals();
    const P = src.attributes.position, Nn = src.attributes.normal, UVs = src.attributes.uv, C = src.attributes.color, k = 1 / kindMeters(kind);
    if (color != null) setTone(color);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = Nn.getX(i), ny = Nn.getY(i), nz = Nn.getZ(i);
      g.pos.push(x, y, z); g.nrm.push(nx, ny, nz);
      if (o && o.keepUV && UVs) g.uv.push(UVs.getX(i), UVs.getY(i));
      else { const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz); if (ay >= ax && ay >= az) g.uv.push(x * k, z * k); else if (ax >= az) g.uv.push(z * k, y * k); else g.uv.push(x * k, y * k); }
      if (C && color == null) g.col.push(C.getX(i), C.getY(i), C.getZ(i)); else g.col.push(_c.r, _c.g, _c.b);
      g.idx.push(g.n++);
    }
  }
  /** Hình dựng tại gốc rồi đặt vào thế giới */
  put(kind, color, geometry, x, y, z, ry = 0, o) {
    const g = geometry.clone(); if (ry) g.rotateY(ry); g.translate(x, y, z); this.geo(kind, color, g, o);
  }
  cyl(kind, color, x, y1, y2, z, rTop, rBot, seg = 12, o) {
    this.put(kind, color, new THREE.CylinderGeometry(rTop, rBot ?? rTop, y2 - y1, seg), x, (y1 + y2) / 2, z, 0, o);
    if (!o || o.s !== false) { const r = Math.max(rTop, rBot ?? rTop) * 0.8; this.solids.push([x - r, x + r, y1, y2, z - r, z + r]); }
  }
  /** Mặt dốc cho cầu thang/dốc xe: 8 đỉnh lồi, dùng làm va chạm */
  ramp(pts) { this.ramps.push(new Float32Array(pts.flat())); }
  /** Mesh riêng có vật liệu riêng (biển hiệu, kính…) */
  mesh(m, o = {}) { m.castShadow = !!o.cast; m.receiveShadow = o.receive !== false; this.extra.push({ mesh: m, zone: this.zone }); return m; }
  /** Tấm phẳng mang ảnh, tâm (x,y,z), quay ry quanh trục đứng (ry=0: mặt hướng +z) */
  sign(material, w, h, x, y, z, ry = 0, o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); m.position.set(x, y, z); m.rotation.y = ry; return this.mesh(m, o);
  }

  /** Gộp và đưa vào cảnh. Trả về Map vùng -> Group three để bật/tắt theo khoảng cách */
  build(scene) {
    const zones = new Map();
    const zg = (z) => { if (!zones.has(z)) { const g = new THREE.Group(); g.name = 'zone:' + z; zones.set(z, g); scene.add(g); } return zones.get(z); };
    for (const g of this.groups.values()) {
      if (!g.n) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
      geo.setIndex(g.n > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mat = g.kind === 'glass' ? glassMat : g.kind === 'glow' ? glowMat : kindMat(g.kind);
      const m = new THREE.Mesh(geo, mat); m.name = g.kind + '|' + g.zone;
      const plain = g.kind !== 'glass' && g.kind !== 'glow';
      m.castShadow = plain && !g.ns; m.receiveShadow = plain; if (g.kind === 'glass') m.renderOrder = 5;
      m.matrixAutoUpdate = false; zg(g.zone).add(m);
      g.pos = g.nrm = g.uv = g.col = g.idx = null;
    }
    for (const e of this.extra) { e.mesh.updateMatrix(); e.mesh.matrixAutoUpdate = false; zg(e.zone).add(e.mesh); }
    this.groups.clear(); this.extra = [];
    return zones;
  }
}

/** Hệ toạ độ cục bộ của một khối nhà: u dọc nhà, w theo chiều sâu; r là bội của 90° */
export function frame(B, ox, oz, r) {
  const cr = Math.round(Math.cos(r)), sr = Math.round(Math.sin(r));
  const W = (u, w) => [ox + u * cr + w * sr, oz - u * sr + w * cr];
  const f = {
    ox, oz, r, cr, sr, W,
    box(kind, color, u1, u2, y1, y2, w1, w2, o) { const a = W(u1, w1), b = W(u2, w2); B.box(kind, color, a[0], b[0], y1, y2, a[1], b[1], o); },
    solid(u1, u2, y1, y2, w1, w2) { const a = W(u1, w1), b = W(u2, w2); B.solid(a[0], b[0], y1, y2, a[1], b[1]); },
    /** hình dựng trong hệ cục bộ (x = u, y, z = -w… dùng ma trận) */
    matrix: new THREE.Matrix4().set(cr, 0, sr, ox, 0, 1, 0, 0, -sr, 0, cr, oz, 0, 0, 0, 1),
    /** đặt hình có toạ độ (u, y, w) vào thế giới */
    geo(kind, color, geometry, o) { const g = geometry.clone(); g.applyMatrix4(f.matrix); B.geo(kind, color, g, o); },
    pt(u, w, y = 0) { const p = W(u, w); return new THREE.Vector3(p[0], y, p[1]); },
    /** góc quay quanh trục đứng để một mặt phẳng hướng theo +w */
    faceW: Math.atan2(sr, cr),
    ramp(pts) { B.ramp(pts.map(([u, y, w]) => { const p = W(u, w); return [p[0], y, p[1]]; })); },
    sign(material, wd, h, u, y, w, dir = 1, o) { const p = W(u, w); return B.sign(material, wd, h, p[0], y, p[1], Math.atan2(sr * dir, cr * dir), o); },
  };
  return f;
}
