// Vật thể động: ghế nhựa, bóng, thùng rác, cổng bản lề, cửa buồng, xoài; cờ vải (Verlet); màn LED; quạt trần; dây điện.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex } from '../engine/textures.js';
import { U } from '../engine/materials.js';
import { mulberry32, QNAME } from '../engine/util.js';
import { stoolGeometry, stoolMaterial, stoolColor, STOOL } from './stool.js';

const plastic = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0 });
function ballTex(kind) {
  return canvasTex(256, 128, (g, w, h) => {
    if (kind === 'basket') { g.fillStyle = '#c8581c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(60,20,0,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } g.strokeStyle = '#1a1208'; g.lineWidth = 3; for (const x of [0, w / 4, w / 2, w * 3 / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); for (const s of [-1, 1]) { g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, h / 2 + s * (h * 0.3) * Math.abs(Math.sin(x / w * Math.PI * 2))); g.stroke(); } }
    else if (kind === 'soccer') { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#16161a'; for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { const cx = (i + (j % 2) * 0.5) * w / 6, cy = (j + 0.5) * h / 4; g.beginPath(); for (let k = 0; k < 5; k++) g.lineTo(cx + Math.cos(k * 1.2566) * 11, cy + Math.sin(k * 1.2566) * 11); g.fill(); } }
    else { g.fillStyle = '#f6f2e0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { g.fillStyle = ['#f2c21a', '#1f4fa0', '#f6f2e0'][i % 3]; g.fillRect(i * w / 6, 0, w / 6, h); } }
  });
}
function chairGeo() {
  const b = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  return mergeGeometries([b(0.42, 0.04, 0.42, 0, 0.2, 0), b(0.42, 0.34, 0.03, 0, 0.5, -0.2), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => b(0.025, 0.44, 0.025, x * 0.19, -0.02, z * 0.19)), b(0.025, 0.36, 0.025, -0.19, 0.4, -0.2), b(0.025, 0.36, 0.025, 0.19, 0.4, -0.2)]);
}
function tableGeo() { const top = new THREE.CylinderGeometry(0.36, 0.36, 0.035, 22); top.translate(0, 0.29, 0); const stem = new THREE.CylinderGeometry(0.03, 0.03, 0.58, 8); const base = new THREE.CylinderGeometry(0.22, 0.24, 0.03, 16); base.translate(0, -0.295, 0); return mergeGeometries([top, stem, base]); }
function coneGeo() { const c = new THREE.CylinderGeometry(0.035, 0.14, 0.55, 14); c.translate(0, 0.02, 0); const b = new THREE.BoxGeometry(0.36, 0.035, 0.36); b.translate(0, -0.26, 0); return mergeGeometries([c, b]); }
function binGeo() { const b = new THREE.BoxGeometry(0.56, 0.84, 0.6); const lid = new THREE.BoxGeometry(0.62, 0.08, 0.68); lid.translate(0, 0.46, 0); return mergeGeometries([b, lid]); }
function gateGeo(len) {
  const b = (x1, x2, y1, y2, t) => { const g = new THREE.BoxGeometry(x2 - x1, y2 - y1, t); g.translate((x1 + x2) / 2, (y1 + y2) / 2, 0); return g; }, parts = [b(0, len, 0.08, 1.35, 0.03), b(0, len, 0.05, 0.12, 0.06), b(0, len, 1.35, 1.45, 0.06), b(0, len, 2.2, 2.3, 0.06), b(0, 0.07, 0.05, 2.5, 0.07), b(len - 0.07, len, 0.05, 2.5, 0.07)];
  for (let u = 0.2; u < len - 0.1; u += 0.2) parts.push(b(u - 0.015, u + 0.015, 1.45, 2.55, 0.03));
  return mergeGeometries(parts);
}

/* ---------- cờ vải: lưới Verlet, mép trái ghim vào cột ---------- */
function makeCloth(ctx, f) {
  const NX = f.small ? 5 : 14, NY = f.small ? 3 : 9, n = NX * NY, dir = f.dir || 1, dx = f.w / (NX - 1), dy = f.h / (NY - 1);
  const pos = new Float32Array(n * 3), prev = new Float32Array(n * 3), geo = new THREE.PlaneGeometry(f.w, f.h, NX - 1, NY - 1);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const k = (j * NX + i) * 3; pos[k] = f.x + dir * i * dx; pos[k + 1] = f.y - j * dy; pos[k + 2] = f.z + i * 0.01; }
  prev.set(pos); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.MeshStandardMaterial({ map: f.tex || null, color: f.color ?? 0xffffff, side: THREE.DoubleSide, roughness: 0.85 });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = !f.small; mesh.receiveShadow = true; mesh.frustumCulled = false; ctx.scene.add(mesh);
  const cons = []; for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * NX + i; if (i < NX - 1) cons.push([a, a + 1, dx]); if (j < NY - 1) cons.push([a, a + NX, dy]); if (i < NX - 1 && j < NY - 1) cons.push([a, a + NX + 1, Math.hypot(dx, dy)]); }
  // ràng buộc dẹt (kiểu số, bỏ cặp ghim cả hai đầu, trọng số đã tính sẵn): vòng lặp nóng không còn duyệt mảng của mảng và không gọi Math.hypot
  const live = cons.filter(([a, b]) => !(a % NX === 0 && b % NX === 0)), cn = live.length, cA = new Int32Array(cn), cB = new Int32Array(cn), cL = new Float64Array(cn), cWA = new Float32Array(cn), cWB = new Float32Array(cn);
  live.forEach(([a, b, L], i) => { const pa = a % NX === 0, pb = b % NX === 0; cA[i] = a * 3; cB[i] = b * 3; cL[i] = L; cWA[i] = pa ? 0 : pb ? 2 : 1; cWB[i] = pb ? 0 : pa ? 2 : 1; });
  return { pos, prev, geo, cons, cn, cA, cB, cL, cWA, cWB, NX, NY, f, seed: f.x * 3.1 + f.z, far: false };
}
function stepCloth(c, dt, t, wind) {
  const { pos, prev, NX, NY, cons, f } = c, n = NX * NY, damp = 0.985, wx = (0.6 + wind * 3.2) * (f.dir || 1), g = -3.2;
  for (let i = 0; i < n; i++) {
    if (i % NX === 0) continue; const k = i * 3, u = (i % NX) / (NX - 1);
    const gust = Math.sin(t * 2.3 + c.seed + pos[k + 1] * 2.0 + u * 5) * 0.6 + Math.sin(t * 5.7 + c.seed * 2 + u * 9) * 0.3;
    const ax = wx * (1 + gust * 0.5), ay = g + gust * wx * 0.35, az = (Math.sin(t * 3.1 + c.seed + u * 7) * 1.4 + Math.cos(t * 1.3 + c.seed) * 0.8) * (0.3 + wind * 2.2);
    const vx = (pos[k] - prev[k]) * damp, vy = (pos[k + 1] - prev[k + 1]) * damp, vz = (pos[k + 2] - prev[k + 2]) * damp;
    prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2];
    pos[k] += vx + ax * dt * dt; pos[k + 1] += vy + ay * dt * dt; pos[k + 2] += vz + az * dt * dt;
  }
  const { cn, cA, cB, cL, cWA, cWB } = c;
  for (let it = 0; it < 3; it++) for (let ci = 0; ci < cn; ci++) {
    const ka = cA[ci], kb = cB[ci], L = cL[ci], wa = cWA[ci], wb = cWB[ci], ex = pos[kb] - pos[ka], ey = pos[kb + 1] - pos[ka + 1], ez = pos[kb + 2] - pos[ka + 2], d = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6, k = (d - L) / d * 0.5;
    pos[ka] += ex * k * wa; pos[ka + 1] += ey * k * wa; pos[ka + 2] += ez * k * wa; pos[kb] -= ex * k * wb; pos[kb + 1] -= ey * k * wb; pos[kb + 2] -= ez * k * wb;
  }
  c.geo.attributes.position.needsUpdate = true; c.geo.computeVertexNormals();
}

function drawLED(g, t, state) {
  const W = 1024, H = 480, grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#7e0f1c'); grd.addColorStop(0.5, '#c21e2a'); grd.addColorStop(1, '#6a0c18'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,226,120,${0.15 + 0.25 * Math.sin(t * 2.4 + i * 1.7)})`; g.beginPath(); g.arc((i * 97) % W, (i * 61) % 300, 2 + (i % 3), 0, 7); g.fill(); }
  const flower = (cx, cy, r, c) => { g.fillStyle = c; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(cx + Math.cos(k * 1.047 + t * 0.15) * r * 0.62, cy + Math.sin(k * 1.047 + t * 0.15) * r * 0.62, r * 0.5, 0, 7); g.fill(); } g.fillStyle = '#ffe26a'; g.beginPath(); g.arc(cx, cy, r * 0.34, 0, 7); g.fill(); };
  for (const s of [-1, 1]) { const x0 = s < 0 ? 105 : 919; flower(x0, 130, 52, '#fff4f6'); flower(x0 - s * 62, 165, 36, '#ff9ec2'); flower(x0 + s * 58, 172, 34, '#ffd84a'); flower(x0 - s * 18, 220, 30, '#ffb46a'); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffe26a'; g.font = '900 52px Arial'; g.fillText('CHÀO MỪNG', 512, 56);
  g.font = '900 76px Arial'; g.fillStyle = 'rgba(70,5,10,.6)'; g.fillText('NGÀY NHÀ GIÁO VIỆT NAM', 515, 134, 690); g.fillStyle = '#ffffff'; g.fillText('NGÀY NHÀ GIÁO VIỆT NAM', 512, 130, 690);
  g.fillStyle = '#ffe26a'; g.font = '900 78px Arial'; g.fillText('20 · 11 · 2026', 512, 216); g.fillStyle = '#fff3c4'; g.font = "italic bold 36px 'Times New Roman', serif"; g.fillText('Tôn sư trọng đạo   ·   Uống nước nhớ nguồn', 512, 280, 700);
  g.fillStyle = '#f2c94c'; g.fillRect(0, 318, W, 96); g.fillStyle = '#a3141c'; g.font = 'bold 54px Arial'; g.textAlign = 'left';
  const msg = '★ KÍNH CHÚC CÁC THẦY CÔ GIÁO MẠNH KHỎE, HẠNH PHÚC ★ CÁC THẾ HỆ HỌC SINH THÁI PHIÊN TRI ÂN THẦY CÔ ★ NGÀY TRỞ VỀ ★ ';
  const mw = g.measureText(msg).width; state.x -= 22; if (state.x < -mw) state.x = W; g.fillText(msg, state.x, 368);
  g.fillStyle = '#ffe9c8'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('Trường THPT Thái Phiên  ·  258 Đà Nẵng  ·  Hải Phòng', 512, 446);
}

export function init(ctx) {
  const { phys, B, scene } = ctx, rnd = mulberry32(55);
  const list = (type) => B.spawn.filter(s => s.type === type);
  ctx.interact = []; ctx.hoops = []; ctx.balls = [];
  // ghế nhựa
  { const L = list('stool'), set = phys.propSet(stoolGeometry(), stoolMaterial(), L.length + 4), hh = STOOL.H / 2; ctx.stools = set;      // campus_food.js: ngồi ghế nhựa
    L.forEach((s, i) => set.add(phys.dyn(['box', STOOL.BASE - 0.01, hh, STOOL.BASE - 0.01], s.x + (rnd() - 0.5) * 0.05, s.y + hh + 0.01, s.z + (rnd() - 0.5) * 0.05, { mass: 0.8, ry: (rnd() - 0.5) * 0.35, rest: 0.25, fric: 0.6 }), stoolColor(s.color, i))); }
  { const L = list('chair'), set = phys.propSet(chairGeo(), new THREE.MeshStandardMaterial({ color: 0xc4cad0, roughness: 0.3, metalness: 0.85 }), L.length + 1); for (const s of L) set.add(phys.dyn(['box', 0.21, 0.24, 0.21], s.x, s.y + 0.25, s.z, { mass: 3, ry: s.ry, offset: [0, 0, 0] })); }
  { const L = list('table'), set = phys.propSet(tableGeo(), plastic(), L.length + 1); ctx.tables = set; for (const s of L) set.add(phys.dyn(['cyl', 0.31, 0.3], s.x, s.y + 0.32, s.z, { mass: 4, fric: 0.9 }), 0xf2c21a); }
  { const L = list('cone'), set = phys.propSet(coneGeo(), plastic(), L.length + 1); for (const s of L) set.add(phys.dyn(['cyl', 0.27, 0.14], s.x, 0.29, s.z, { mass: 1.2 }), 0xe8541e); }
  { const L = list('bin'), set = phys.propSet(binGeo(), plastic(), L.length + 1); for (const s of L) set.add(phys.dyn(['box', 0.28, 0.46, 0.3], s.x, 0.47, s.z, { mass: 7 }), 0x2f8a63); }
  { const L = list('box'), set = phys.propSet(new THREE.BoxGeometry(1, 1, 1), plastic(), L.length + 1); for (const s of L) set.add(phys.dyn(['box', s.sx / 2, s.sy / 2, s.sz / 2], s.x, s.y, s.z, { mass: s.mass || 0.5 }), s.color, new THREE.Vector3(s.sx, s.sy, s.sz)); }
  // bóng
  for (const kind of ['basket', 'soccer', 'volley']) {
    const L = list('ball').filter(s => s.kind === kind), r = kind === 'basket' ? 0.12 : 0.11, set = phys.propSet(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex(kind), roughness: kind === 'basket' ? 0.75 : 0.5, bumpScale: 0.5 }), L.length + 1);
    for (const s of L) { const it = set.add(phys.dyn(['ball', r], s.x, s.y + r, s.z, { mass: kind === 'basket' ? 0.62 : 0.43, rest: kind === 'basket' ? 0.8 : 0.72, fric: 0.6, ld: 0.12, ad: 0.5, ccd: true, sleep: false })); it.ball = kind; it.r = r; it.lastY = s.y; ctx.balls.push(it); }
  }
  // cổng chính: 2 cánh bản lề đẩy được
  { const L = list('gate'), mat = new THREE.MeshStandardMaterial({ color: 0xa9b0b4, roughness: 0.45, metalness: 0.5 });
    for (const s of L) { const set = phys.propSet(gateGeo(s.len), mat, 1), bd = phys.RAPIER.RigidBodyDesc.dynamic().setTranslation(s.hinge[0], 0, s.hinge[1]).setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }).setAngularDamping(2.2).setLinearDamping(0.5), body = phys.world.createRigidBody(bd);
      phys.world.createCollider(phys.RAPIER.ColliderDesc.cuboid(s.len / 2, 1.25, 0.035).setTranslation(s.len / 2, 1.3, 0).setMass(40).setCollisionGroups(0x0002fffe), body);
      phys.hinge(body, s.hinge[0], 0, s.hinge[1], s.side > 0 ? [0.03, Math.PI / 2 + 0.15] : [Math.PI / 2 - 0.15, Math.PI - 0.03]); set.add(body); } }
  { const L = list('door'), g = new THREE.BoxGeometry(1.02, 1.95, 0.03); g.translate(0.51, 0.975, 0); const set = phys.propSet(g, plastic(), L.length + 1);
    for (const s of L) { const body = phys.world.createRigidBody(phys.RAPIER.RigidBodyDesc.dynamic().setTranslation(s.hinge[0], s.y, s.hinge[1]).setRotation({ x: 0, y: Math.sin(s.open / 2), z: 0, w: Math.cos(s.open / 2) }).setAngularDamping(1.6));
      phys.world.createCollider(phys.RAPIER.ColliderDesc.cuboid(0.5, 0.97, 0.015).setTranslation(0.52, 0.975, 0).setMass(6).setCollisionGroups(0x0002fffe), body); phys.hinge(body, s.hinge[0], s.y, s.hinge[1], [-1.5, 1.5]); body.sleep(); set.add(body, s.color); } }
  // xoài: quả treo trên cây, rung cây thì rụng
  const mangoSet = phys.propSet((() => { const g = new THREE.SphereGeometry(0.075, 12, 10); g.scale(1, 1.4, 0.9); return g; })(), plastic(), 60), hanging = [];
  const mangoSpot = B.spots.find(s => s.type === 'mango');
  if (mangoSpot) {
    const hg = new THREE.InstancedMesh(mangoSet.mesh.geometry, mangoSet.mesh.material, 18), m = new THREE.Matrix4(), cols = [0xe0c23a, 0xb8c43a, 0xf0a83a];
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.283, d = 1.5 + rnd() * 1.3, p = new THREE.Vector3(mangoSpot.x + Math.cos(a) * d, 3.5 + rnd() * 0.8, mangoSpot.z + Math.sin(a) * d); hanging.push({ p, on: true, c: cols[i % 3] }); hg.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)); hg.setColorAt(i, new THREE.Color(cols[i % 3])); }
    hg.castShadow = true; scene.add(hg); let cool = 0, regrow = 0;
    /** làm rụng tối đa max quả đang treo; sure = true thì còn quả là chắc chắn rụng ít nhất một (ném dép trúng), false thì hên xui như rung cây. Trả về số quả rụng */
    const drop = (max, sure) => {
      let k = 0;
      for (let pass = 0; pass < (sure ? 2 : 1) && !k; pass++) for (let i = 0; i < 18 && k < max; i++) {
        const h = hanging[i]; if (!h.on || (!pass && rnd() < 0.5) || mangoSet.items.length >= mangoSet.max) continue; h.on = false; hg.setMatrixAt(i, m.makeScale(0, 0, 0)); k++;
        const b = phys.dyn(['ball', 0.075], h.p.x, h.p.y, h.p.z, { mass: 0.3, rest: 0.3, sleep: false, ad: 0.8, ld: 0.2 }); b.applyImpulse({ x: (rnd() - 0.5) * 0.1, y: 0, z: (rnd() - 0.5) * 0.1 }, true); mangoSet.add(b, h.c);
      }
      hg.instanceMatrix.needsUpdate = true; regrow = 60; return k;
    };
    ctx.mango = { x: mangoSpot.x, z: mangoSpot.z, set: mangoSet, drop, onShake: [] };      // cho trò ném dép khều xoài (campus_life.js)
    ctx.interact.push({ x: mangoSpot.x, y: 1, z: mangoSpot.z, r: 3, label: 'Rung cây xoài', fn: () => { if (cool > 0) return; cool = 1.2; const k = drop(3, false);
      ctx.shake = 1; if (ctx.audio) ctx.audio.rustle(); if (ctx.ui) ctx.ui.toast(k ? `Rụng ${k} quả xoài!` : 'Cây rung mà chưa rụng quả nào…'); for (const f of ctx.mango.onShake) f(); } });
    ctx.updaters.push((dt) => { cool -= dt; if (regrow > 0) { regrow -= dt; if (regrow <= 0 && mangoSet.items.length < 50) { hanging.forEach((h, i) => { h.on = true; hg.setMatrixAt(i, m.makeTranslation(h.p.x, h.p.y, h.p.z)); }); hg.instanceMatrix.needsUpdate = true; } } });
  }
  // cờ
  const cloths = B.flags.map(f => makeCloth(ctx, f)); let ct = 0;
  // Mô phỏng vải đo được 4,6–6,2 ms JS mỗi khung khi cờ nào cũng chạy đủ. Chỉ cờ ở gần (35 m) và nằm trong nón nhìn mới chạy mọi khung;
  // cờ xa trong tầm nhìn 2 khung một lần, cờ ngoài tầm nhìn 6 khung một lần (vẫn nhúc nhích để quay máy lại không thấy cờ đứng hình). So le theo số thứ tự.
  const cfw = new THREE.Vector3(), CLOTH_NEAR2 = 35 * 35, CLOTH_CONE = 0.42, CLOTH_EVERY = QNAME === 'low' || QNAME === 'medium' ? 2 : 1; let cframe = 0;      // mức thấp/vừa: cờ gần mô phỏng 30 Hz (bước thời gian gấp đôi), mức cao giữ mọi khung  ctx.updaters.push((dt) => {
  ctx.updaters.push((dt) => {
    ct += dt; cframe++; const cp = ctx.camera.position; ctx.camera.getWorldDirection(cfw);
    for (let i = 0; i < cloths.length; i++) {
      const c = cloths[i], dx = c.f.x - cp.x, dy = (c.f.y || 3) - cp.y, dz = c.f.z - cp.z, d2 = dx * dx + dz * dz; if (d2 > (c.f.small ? 45 * 45 : 150 * 150)) continue;
      const seen = d2 < 64 || (dx * cfw.x + dy * cfw.y + dz * cfw.z) / Math.sqrt(d2 + dy * dy) > CLOTH_CONE, near = seen && d2 < CLOTH_NEAR2, every = seen ? (near ? CLOTH_EVERY : 2) : 6;
      if ((cframe + i) % every) continue;
      stepCloth(c, Math.min(dt * (near ? CLOTH_EVERY : 1), CLOTH_EVERY > 1 ? 1 / 30 : 1 / 40), ct, U.uWind.value);
    }
  });
  // màn LED
  const led = B.spots.find(s => s.type === 'led');
  if (led) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 480; const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), mesh = new THREE.Mesh(new THREE.PlaneGeometry(led.w, led.h), mat); mesh.position.set(led.x, led.y, led.z); mesh.rotation.y = led.ry; scene.add(mesh);
    const st = { x: 1024 }; let acc = 1;
    const ledFw = new THREE.Vector3();
    ctx.updaters.push((dt) => {
      acc += dt; mat.color.setScalar(1.25 + U.uNight.value * 1.2); if (acc < 0.1) return;
      // vẽ lại canvas 1024×480 + đẩy ảnh + dựng mipmap mỗi 0,1 s kể cả khi màn nằm sau lưng/xa hàng trăm mét: chỉ làm khi màn ở trong nón nhìn (hoặc đứng gần)
      const cp = ctx.camera.position, dx = led.x - cp.x, dy = led.y - cp.y, dz = led.z - cp.z, d2 = dx * dx + dz * dz; ctx.camera.getWorldDirection(ledFw);
      if (d2 > 25 * 25 && (d2 > 160 * 160 || (dx * ledFw.x + dy * ledFw.y + dz * ledFw.z) / Math.sqrt(d2 + dy * dy) < 0.3)) return;
      acc = 0; drawLED(g, performance.now() / 1000, st); tex.needsUpdate = true;
    });
    ctx.ledLight = new THREE.PointLight(0xff5a4a, 0, 38, 1.6); ctx.ledLight.position.set(led.x - 4, led.y, led.z); scene.add(ctx.ledLight);
  }
  // quạt trần
  const fans = B.spots.filter(s => s.type === 'fan').map(s => { const g = new THREE.Group(), bm = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 }); for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.16), bm); b.position.set(Math.cos(i * 2.094) * 0.62, 0, Math.sin(i * 2.094) * 0.62); b.rotation.y = -i * 2.094; g.add(b); } g.position.set(s.x, s.y, s.z); scene.add(g); return g; });
  if (fans.length) ctx.updaters.push((dt) => { for (const f of fans) f.rotation.y += dt * 7; });
  // dây điện võng
  const wires = B.spots.find(s => s.type === 'wires');
  if (wires) { const pts = []; for (const [y, z] of wires.pts) for (let i = 0; i < wires.xs.length - 1; i++) { const x1 = wires.xs[i], x2 = wires.xs[i + 1]; for (let k = 0; k < 10; k++) { const a = k / 10, b = (k + 1) / 10, sag = (t) => -1.1 * 4 * t * (1 - t) * (x2 - x1) / 34; pts.push(x1 + (x2 - x1) * a, y + sag(a), z, x1 + (x2 - x1) * b, y + sag(b), z); } }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x15151a }))); }
  // mặt nước hồ
  const water = B.spots.filter(s => s.type === 'water'); if (water.length) ctx.updaters.push((dt) => { for (const w of water) { const nm = w.mesh.material.normalMap; if (nm) { nm.offset.x += dt * 0.012; nm.offset.y += dt * 0.007; } } });
  // rổ: đếm bóng vào (campus_hoop.js tính điểm qua ctx.hoopHit nếu có)
  for (const s of B.spots.filter(s => s.type === 'hoop')) ctx.hoops.push(s);
  let score = 0;
  ctx.updaters.push(() => { for (const b of ctx.balls) { const t = b.body.translation(); for (const h of ctx.hoops) { if (b.lastY > h.y && t.y <= h.y && (t.x - h.x) ** 2 + (t.z - h.z) ** 2 < 0.2 * 0.2) { if (ctx.hoopHit) ctx.hoopHit(b, h); else { score++; if (ctx.ui) ctx.ui.toast(`🏀 Vào rổ! (${score})`); if (ctx.audio) ctx.audio.swish(); } } } b.lastY = t.y; } });
  // trống trường
  const drum = B.spots.find(s => s.type === 'drum'); if (drum) ctx.interact.push({ x: drum.x, y: drum.y, z: drum.z, r: 2.3, label: 'Đánh trống trường', fn: () => { const t = performance.now(); if (t - (drum.hitAt || -1e9) < 1300) return; drum.hitAt = t;      // một hồi trống xong mới đánh hồi kế
      if (ctx.audio) ctx.audio.drum(); if (ctx.ui) ctx.ui.toast('🥁 Tùng! Tùng! Tùng! – Trống vào lớp rồi!'); for (const f of ctx.onDrum || []) f(drum); } });
  ctx.mangoSet = mangoSet;
}
