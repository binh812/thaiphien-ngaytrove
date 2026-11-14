// Ghế đẩu nhựa vuông kiểu Việt Nam: thân hình thang cụt, 4 chân bản rộng khoét vòm, giằng ngang, mặt ghế gân chéo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const STOOL = { H: 0.3, TOP: 0.125, BASE: 0.16, RED: 0xd61f1f, BLUE: 0x1c49c4 };

export function stoolGeometry() {
  const { H, TOP: tb, BASE: bb } = STOOL, hs = Math.hypot(H, bb - tb), lw = 0.058, T = 0.012;
  const w = (y) => bb + (tb - bb) * (y / hs), ys1 = 0.07, ys2 = 0.112, ym = hs * 0.62, yt = hs - 0.042;
  const sh = new THREE.Shape();
  sh.moveTo(-bb, 0); sh.lineTo(-bb + lw, 0); sh.lineTo(-(w(ys1) - lw), ys1); sh.lineTo(w(ys1) - lw, ys1); sh.lineTo(bb - lw, 0); sh.lineTo(bb, 0); sh.lineTo(tb, hs); sh.lineTo(-tb, hs); sh.closePath();
  const a1 = w(ys2) - lw, a2 = w(ym) - lw - 0.004, hole = new THREE.Path();
  hole.moveTo(-a1, ys2); hole.lineTo(a1, ys2); hole.lineTo(a2, ym); hole.quadraticCurveTo(a2 * 0.96, yt, 0, yt); hole.quadraticCurveTo(-a2 * 0.96, yt, -a2, ym); hole.closePath(); sh.holes.push(hole);
  const side = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 7 });
  side.translate(0, 0, -T); side.rotateX(-Math.atan2(bb - tb, H)); side.translate(0, -H / 2, bb);
  const parts = [];
  for (let k = 0; k < 4; k++) { const g = side.clone(); g.rotateY(k * Math.PI / 2); parts.push(g); }
  // mặt ghế bo mép + gân chéo + vành lỗ giữa
  const top = new THREE.BoxGeometry(tb * 2 + 0.004, 0.016, tb * 2 + 0.004); top.translate(0, H / 2 - 0.006, 0); parts.push(top);
  for (let i = -3; i <= 3; i++) { const d = i * 0.036, len = 2 * (tb * Math.SQRT2 - Math.abs(d)) - 0.03; if (len < 0.04 || i === 0) continue; const rib = new THREE.BoxGeometry(len, 0.004, 0.007); rib.rotateY(Math.PI / 4); rib.translate(d * Math.SQRT1_2, H / 2 + 0.003, d * Math.SQRT1_2); parts.push(rib); }
  const ring = new THREE.TorusGeometry(0.017, 0.004, 5, 14); ring.rotateX(Math.PI / 2); ring.translate(0, H / 2 + 0.002, 0); parts.push(ring);
  // gờ chân
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const f = new THREE.BoxGeometry(lw + 0.012, 0.012, lw + 0.012); f.translate(sx * (bb - lw / 2), -H / 2 + 0.006, sz * (bb - lw / 2)); parts.push(f); }
  const g = mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; })); g.computeVertexNormals();
  return g;
}
export const stoolMaterial = () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.22, side: THREE.DoubleSide });
/** Chỉ hai màu đỏ / xanh: màu lạ quy về màu gần nhất theo sắc độ */
export function stoolColor(hex, i = 0) {
  const r = (hex >> 16) & 255, b = hex & 255, g = (hex >> 8) & 255;
  if (r > 150 && g < 90 && b < 90) return STOOL.RED; if (b > 150 && r < 90) return STOOL.BLUE; return i % 2 ? STOOL.RED : STOOL.BLUE;
}
