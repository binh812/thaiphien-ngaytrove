// Vườn hoa phía nam: lối gạch, hàng cau vua, tượng Thái Phiên, tượng đài, hồ non bộ; vườn sau nhà B và bảng thông báo.
import * as THREE from 'three';
import { NS, DECO, RY, label, picture, bench, flagPole, logo } from './kit.js';
import { texSet } from '../engine/textures.js';
import { mulberry32 } from '../engine/util.js';

function bust(B, x, y, z) {   // tượng bán thân đá trắng, quay mặt về đông
  const W = 0xf2f2ee, sh = new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2); sh.scale(0.62, 0.75, 1.0);
  B.put('granite', W, sh, x, y, z, 0, DECO); B.put('granite', W, new THREE.CylinderGeometry(0.1, 0.13, 0.22, 12), x, y + 0.36, z, 0, DECO);
  const head = new THREE.SphereGeometry(0.2, 20, 14); head.scale(0.92, 1.12, 0.88); B.put('granite', W, head, x, y + 0.62, z, 0, DECO);
  const hair = new THREE.SphereGeometry(0.205, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45); hair.scale(0.95, 1.1, 0.92); B.put('granite', 0xe6e6e0, hair, x - 0.01, y + 0.65, z, 0, DECO);
  B.put('granite', W, new THREE.BoxGeometry(0.06, 0.07, 0.05), x + 0.19, y + 0.6, z, 0, DECO);
}
function goldStatue(B, x, y, z) {   // tượng đứng vẫy tay, mạ vàng, quay mặt về đông (+x)
  const G = 0xc8993a, P = (g, dx, dy, dz) => B.put('gold', G, g, x + dx, y + dy, z + dz, 0, DECO);
  const limb = (a, b, r1, r2) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), d = Bv.clone().sub(A), g = new THREE.CylinderGeometry(r2, r1, d.length(), 10); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); P(g, A.x, A.y, A.z); P(new THREE.SphereGeometry(r2 * 1.05, 10, 8), Bv.x, Bv.y, Bv.z); };
  for (const s of [-1, 1]) { limb([0, 0, s * 0.13], [0, 1.0, s * 0.12], 0.1, 0.12); const foot = new THREE.BoxGeometry(0.3, 0.08, 0.13); P(foot, 0.06, 0.04, s * 0.13); }
  const torso = new THREE.CylinderGeometry(0.2, 0.24, 0.72, 14); torso.scale(0.72, 1, 1.05); P(torso, 0, 1.36, 0);
  const coat = new THREE.CylinderGeometry(0.245, 0.26, 0.3, 14); coat.scale(0.74, 1, 1.05); P(coat, 0, 1.0, 0);
  P(new THREE.SphereGeometry(0.13, 12, 8), 0, 1.7, 0.27); P(new THREE.SphereGeometry(0.13, 12, 8), 0, 1.7, -0.27);
  limb([0, 1.7, 0.27], [0.02, 1.25, 0.31], 0.075, 0.065); limb([0.02, 1.25, 0.31], [0.06, 0.92, 0.3], 0.062, 0.05);          // tay trái buông
  limb([0, 1.7, -0.27], [0.12, 2.02, -0.42], 0.075, 0.065); limb([0.12, 2.02, -0.42], [0.2, 2.4, -0.4], 0.062, 0.05);        // tay phải giơ cao
  const hand = new THREE.SphereGeometry(0.075, 10, 8); hand.scale(0.5, 1.2, 1); P(hand, 0.22, 2.5, -0.4);
  P(new THREE.CylinderGeometry(0.07, 0.085, 0.14, 10), 0, 1.8, 0); const head = new THREE.SphereGeometry(0.135, 16, 12); head.scale(0.95, 1.15, 0.9); P(head, 0.01, 1.99, 0);
  const beard = new THREE.ConeGeometry(0.05, 0.16, 8); beard.rotateX(Math.PI); P(beard, 0.1, 1.86, 0);
}

export function build(B) {
  const rnd = mulberry32(31);
  // ---- nền cỏ, lối gạch ----
  B.box('grass', 0xffffff, -58, 31.5, 0, 0.03, 30.5, 42.6, DECO); B.lawns.push([-58, 31.5, 30.5, 35.3], [-8.4, 31.5, 40.7, 42.3], [-50, -18, 30.6, 36.6], [-42.4, -17.6, 39.4, 42.3], [-58, -48.8, 30.6, 34.4]);
  B.box('brickPave', 0xf2d8d0, -8.6, 31.5, 0.03, 0.045, 36.2, 39.8, DECO);
  for (const [z1, z2] of [[35.4, 36.2], [39.8, 40.6]]) for (const [x1, x2] of [[-5, 5], [7, 19], [21, 31]]) { B.box('brick', 0xffffff, x1, x2, 0, 0.35, z1, z2); B.hedges.push([x1 + 0.08, x2 - 0.08, 0.3, 0.78, z1 + 0.08, z2 - 0.08]); }
  for (const x of [6, 20]) { bench(B, x, 35.78, 1.8, 'x', 1); bench(B, x, 40.22, 1.8, 'x', -1); }
  [-6, -1.6, 2.8, 7.2, 11.6, 16, 20.4, 24.8].forEach(x => flagPole(B, x, 0, 35, 4.6, 0.75, 'red', 2.6)); [-3.8, 0.6, 5, 9.4, 13.8, 18.2, 22.6, 27].forEach(x => flagPole(B, x, 0, 41, 4.6, 0.75, 'red', 2.6));
  for (const x of [-2, 6, 14, 22, 30]) B.trees.push({ kind: 'palm', x, z: 33.9 }); for (const x of [2, 10, 18, 26]) B.trees.push({ kind: 'palm', x, z: 39.9 });
  for (const x of [-4, 0.4, 9.2, 18, 26.8]) B.trees.push({ kind: 'cone', x, z: 34.2, h: 2.4 }); for (const x of [-4, 0.4, 4.8, 9.2, 13.6, 18, 22.4, 26.8]) B.trees.push({ kind: 'cone', x, z: 41.7, h: 2.4 });

  // ---- tượng Thái Phiên ----
  const TX = -13, TZ = 38;
  { const ring = new THREE.RingGeometry(2.4, 4.4, 48); ring.rotateX(-Math.PI / 2); B.put('brickPave', 0xf2d8d0, ring, TX, 0.046, TZ, 0, DECO); const curb = new THREE.TorusGeometry(4.4, 0.07, 6, 48); curb.rotateX(Math.PI / 2); B.put('brick', 0xffffff, curb, TX, 0.07, TZ, 0, DECO); }
  B.put('brick', 0xffffff, new THREE.CylinderGeometry(2.4, 2.45, 0.35, 40), TX, 0.175, TZ); B.put('grass', 0xa8d890, new THREE.CylinderGeometry(2.3, 2.3, 0.02, 40), TX, 0.355, TZ, 0, DECO); B.solid(TX - 1.8, TX + 1.8, 0, 0.35, TZ - 1.8, TZ + 1.8);
  for (let i = 0; i < 16; i++) { if (i === 0 || i === 1 || i === 15) continue; const a = i / 16 * Math.PI * 2, x = TX + Math.cos(a) * 1.95, z = TZ + Math.sin(a) * 1.95; B.hedges.push([x - 0.32, x + 0.32, 0.3, 0.9, z - 0.32, z + 0.32, i % 3 === 0 ? 'flower' : 'ball']); }
  B.box('granite', 0x2a2a2c, -14.2, -11.8, 0.3, 0.55, 36.6, 39.4); B.box('granite', 0x2a2a2c, -13.9, -12.1, 0.55, 1.15, 37, 39); B.box('granite', 0x7a3a2a, -13.5, -12.5, 1.15, 2.45, 37.45, 38.55);
  label(B, 1.0, 1.28, [{ t: 'THÁI PHIÊN', c: '#f4e6c8' }, { t: '(1882 – 1916)', s: 0.6, c: '#f4e6c8' }], { bg: '#7a3a2a', ppm: 140, rough: 0.35 }, -12.49, 1.8, 38, RY.E);
  label(B, 0.9, 0.3, [{ t: 'Nhà yêu nước', f: 'italic bold', c: '#3a2a1a' }], { bg: '#c9b27a', ppm: 160 }, -12.09, 0.85, 38, RY.E);
  bust(B, TX, 2.45, TZ);
  B.box('granite', 0x1a1a1c, -11.5, -11, 0.3, 0.8, 37.75, 38.25); B.put('gloss', 0xf2f2ee, new THREE.CylinderGeometry(0.17, 0.11, 0.16, 14), -11.25, 0.88, 38, 0, DECO);
  for (const [x, z] of [[-9.27, 41.48], [-16.76, 41.44], [-9.83, 34.01], [-13.15, 32.9], [-16.4, 34.2]]) B.trees.push({ kind: 'cone', x, z, h: 2.8, slim: true });
  B.box('brickPave', 0xf2d8d0, -15.2, -10.8, 0.03, 0.045, 41.6, 43.2, DECO); B.box('brickPave', 0xf2d8d0, -46.2, -17.4, 0.03, 0.045, 36.8, 39.2, DECO);

  // ---- tượng đài mạ vàng + bàn thờ đá ----
  B.box('granite', 0xb8b4ac, -48.6, -42.6, 0.03, 0.06, 34.6, 41.4, DECO);
  B.box('granite', 0x1c1c1e, -48.3, -46.1, 0, 0.18, 36.8, 39.2); B.box('granite', 0x1c1c1e, -48.05, -46.35, 0.18, 0.36, 37, 39); B.box('granite', 0x5a1e1a, -47.8, -46.6, 0.36, 1.75, 37.3, 38.7); B.box('granite', 0x3a1412, -47.86, -46.54, 1.75, 1.85, 37.24, 38.76, NS);
  picture(B, 0.7, 0.7, 200, (g, w, h) => { g.fillStyle = '#5a1e1a'; g.fillRect(0, 0, w, h); logo(g, w / 2, h / 2, w * 0.42); }, -46.59, 1.1, 38, RY.E, { rough: 0.3 });
  goldStatue(B, -47.2, 1.85, 38);
  B.box('granite', 0x8c8a86, -45.6, -44.8, 0, 0.85, 37.1, 38.9); B.box('granite', 0x9c9a96, -45.66, -44.74, 0.85, 0.95, 37.04, 38.96, NS);
  for (const z of [37.35, 38.65]) { B.put('gloss', 0xf4f6fa, new THREE.CylinderGeometry(0.07, 0.1, 0.34, 12), -45.2, 1.12, z, 0, DECO); B.put('plastic', 0xd8304a, new THREE.IcosahedronGeometry(0.14, 1), -45.2, 1.4, z, 0, DECO); }
  B.put('gloss', 0xf2f2ee, new THREE.CylinderGeometry(0.15, 0.1, 0.14, 14), -45.2, 1.02, 38, 0, DECO);

  // ---- hồ non bộ ----
  for (const [a, b, c, d] of [[-58.1, -50.2, 34.6, 34.85], [-58.1, -50.2, 41.15, 41.4], [-50.45, -50.2, 34.85, 41.15]]) B.box('brick', 0xffffff, a, b, 0, 0.45, c, d);
  B.box('concrete', 0x4a5a58, -58.1, -50.45, 0, 0.12, 34.85, 41.15, DECO);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(7.65, 6.3), new THREE.MeshPhysicalMaterial({ color: 0x2f6a66, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.86, normalMap: (() => { const t = texSet('sand').normalMap.clone(); t.needsUpdate = true; return t; })(), normalScale: new THREE.Vector2(0.25, 0.25) }));
  water.rotation.x = -Math.PI / 2; water.position.set(-54.27, 0.3, 38); water.userData.water = true; B.mesh(water, { receive: true }); B.spots.push({ type: 'water', mesh: water });
  for (let k = 0; k < 9; k++) { const g = new THREE.DodecahedronGeometry(0.7 + rnd() * 0.9, 0), s = 0.6 + rnd() * 0.5; g.scale(s, 0.8 + rnd() * 1.6, s); g.rotateY(rnd() * 3); B.put('concrete', [0x7d7a74, 0x6f6c66, 0x8a877f][k % 3], g, -55.2 + rnd() * 2.6, 0.9 + rnd() * 0.8, 36.2 + rnd() * 3.6); }
  B.solid(-56, -52, 0, 3.5, 35.8, 40.2);
  B.box('paint', 0xe6c76a, -58.6, -58.1, 0, 3.2, 32.6, 42.6); B.box('paint', 0xc9a650, -58.66, -58.04, 3.2, 3.4, 32.54, 42.66, NS);
  // bia đá, hàng rào cây mép nam, cây tán tròn
  B.box('granite', 0x5f5c58, 28.6, 30.4, 0, 1.6, 41.85, 42.25);
  label(B, 1.6, 1.3, [{ t: 'TRƯỜNG THPT THÁI PHIÊN', s: 0.8, c: '#f2d98a' }, { t: 'Thành lập 7 – 11 – 1960', s: 0.6, c: '#e8e2d0' }, { t: 'Mang tên Thái Phiên từ năm 1973', s: 0.5, c: '#e8e2d0' }], { bg: '#4a4844', ppm: 140, rough: 0.3 }, 29.5, 0.85, 41.84, RY.N);
  for (const [a, b] of [[-58, -15.2], [-10.8, 31.5]]) { B.hedges.push([a, b, 0, 0.62, 42.3, 42.6]); B.solid(a, b, 0, 0.6, 42.3, 42.6); }
  for (const x of [-48, -36, -26]) B.hedges.push([x - 1.3, x + 1.3, 0.2, 2.7, 30.9, 33.5, 'ball']);
  for (const [x, z] of [[-30, 30], [-42, 30], [-53, 29]]) B.trees.push({ x, z, s: 1, planter: true });

  // ---- vườn sau nhà B ----
  B.box('grass', 0xffffff, -58, 32, 0, 0.03, 24.6, 30.6, DECO); B.lawns.push([-58, 32, 24.7, 26.3], [-58, 32, 28.7, 30.5]);
  B.hedges.push([-58, 32, 0, 0.62, 24.3, 24.6]); B.solid(-58, 32, 0, 0.6, 24.3, 24.6);
  B.box('brickPave', 0xf2d8d0, 32, 37.4, 0, 0.02, 24.3, 34, DECO); B.box('granite', 0x9a5040, 37.3, 37.5, 0, 0.14, 24.3, 34, NS);
  for (const [x, z] of [[22.5, 27.4], [-6, 27.5], [-30, 27.5]]) { B.box('brick', 0x8a5a4a, x - 1.1, x + 1.1, 0, 0.5, z - 1.1, z + 1.1); B.trees.push({ x, z, s: 1.05, planter: false, y: 0.4 }); }
  const FC = [0xf08ab0, 0xf2c21a, 0xd8262b, 0xfafaf4, 0x9b59b6, 0xf08a1c], petal = (() => { const g = new THREE.SphereGeometry(0.028, 7, 5); g.scale(1, 0.22, 2.1); g.translate(0, 0, 0.055); g.rotateX(-0.35); return g; })(), core = new THREE.SphereGeometry(0.022, 7, 5);
  const bloom = (x, y, z, col) => { const r0 = rnd() * 6.283, n = 7; for (let k = 0; k < n; k++) B.put('flat', col, petal, x, y, z, r0 + k * 6.283 / n, DECO); B.put('flat', 0xe2b21c, core, x, y + 0.012, z, 0, DECO); };
  for (const x0 of [-42, -20, 4, 12]) { B.box('brick', 0xffffff, x0, x0 + 5, 0, 0.3, 26.4, 28.6); B.box('grass', 0x6a5a48, x0 + 0.1, x0 + 4.9, 0.3, 0.31, 26.5, 28.5, DECO); for (let i = 0; i < 70; i++) { const x = x0 + 0.3 + rnd() * 4.4, z = 26.7 + rnd() * 1.6, h = 0.22 + rnd() * 0.2; B.box('foliage', 0x3f8a3a, x - 0.005, x + 0.005, 0.3, 0.3 + h, z - 0.005, z + 0.005, DECO); bloom(x, 0.3 + h, z, FC[Math.floor(rnd() * 6)]); } B.hedges.push([x0 + 0.15, x0 + 4.85, 0.28, 0.5, 26.55, 28.45, 'low']); }
  B.box('brick', 0x8a5a4a, 15.4, 20.6, 0, 0.35, 28.6, 30.0); for (const x of [16, 17.1, 18.2, 19.3]) B.hedges.push([x - 0.5, x + 0.5, 0.3, 1.2, 28.8, 29.8, 'ball']);
  // bảng thông báo (quay đông)
  for (const z of [25.2, 29, 32.8]) B.box('steel', 0x8a8f94, 34.14, 34.26, 0, 3, z - 0.06, z + 0.06); B.box('metalPaint', 0x6f757a, 34.1, 34.3, 0.7, 3.1, 25, 33); B.box('metalPaint', 0x5a6065, 34.05, 34.4, 3.1, 3.22, 24.9, 33.1, NS);
  picture(B, 8, 2.4, 120, (g, w, h) => {
    g.fillStyle = '#1b4d33'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d3f9a'; g.fillRect(w * 0.52, 0, w * 0.48, h);
    g.textAlign = 'center'; g.fillStyle = '#f2d23c'; g.font = `bold ${h * 0.1}px Arial`; g.fillText('THÔNG BÁO CỦA NHÀ TRƯỜNG', w * 0.26, h * 0.14);
    g.fillStyle = '#fbfbf4'; g.fillRect(w * 0.05, h * 0.22, w * 0.42, h * 0.68); g.strokeStyle = '#c8262b'; g.lineWidth = 5; g.strokeRect(w * 0.05, h * 0.22, w * 0.42, h * 0.68);
    g.fillStyle = '#c8262b'; g.font = `bold ${h * 0.085}px Arial`; g.fillText('CHÀO MỪNG CỰU HỌC SINH', w * 0.26, h * 0.36); g.fillText('VỀ THĂM TRƯỜNG', w * 0.26, h * 0.47);
    g.fillStyle = '#2a2a2a'; g.font = `${h * 0.055}px Arial`; g.fillText('Mời các anh chị ghi cảm tưởng vào sổ truyền thống', w * 0.26, h * 0.62, w * 0.4); g.fillText('tại Phòng truyền thống – tầng 2 nhà Ban giám hiệu.', w * 0.26, h * 0.71, w * 0.4); g.font = `italic ${h * 0.055}px Arial`; g.fillText('Trân trọng cảm ơn thầy cô và các bạn!', w * 0.26, h * 0.83, w * 0.4);
    g.fillStyle = '#f2d23c'; g.font = `bold ${h * 0.1}px Arial`; g.fillText('NĂM ĐIỀU BÁC HỒ DẠY', w * 0.76, h * 0.14); g.fillStyle = '#ffffff'; g.font = `bold ${h * 0.075}px Arial`; g.textAlign = 'left';
    ['1. Yêu Tổ quốc, yêu đồng bào.', '2. Học tập tốt, lao động tốt.', '3. Đoàn kết tốt, kỷ luật tốt.', '4. Giữ gìn vệ sinh thật tốt.', '5. Khiêm tốn, thật thà, dũng cảm.'].forEach((t, i) => g.fillText(t, w * 0.56, h * (0.32 + i * 0.135)));
  }, 34.32, 1.95, 29, RY.E);
}
