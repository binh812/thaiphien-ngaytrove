// Kiểm chuyển động tự động: cho nhân vật người chơi chạy từng clip / dáng chụp ảnh trong trang thật, lấy mẫu xương mỗi khung
// rồi tính các chỉ số (xuyên đất, trượt chân, giãn xương, tư thế, độ liền mạch) bằng tools/motion_metrics.mjs.
// Dùng: node tools/motion_qa.mjs <thư mục kết quả> [--q=low|high] [--gender=m|f] [--look=<mã>] [--only=<clip>[,<clip>…]]
//                                 [--shot=<clip>@<giây>[,…]] [--idle-seconds=28] [--raw] [--url=http://127.0.0.1:8137]
//   --only: idle, walk, run, chuyển (idle→walk→run→walk→idle), tên clip (talk, sit_down…) hoặc dáng (peace hay pose_peace); thêm 'idle (đường rẻ)', 'thang lên (đi)'… (xem EXTRA)
// Ngoài nền phẳng còn đo: cầu thang / dốc nhà xe / gờ vát ở cổng (chân so với mặt va chạm thật dưới từng bàn chân, tốc độ so với nền phẳng), đường hoạt hoạ rẻ dành cho
// người ở xa (không báo máy ảnh cho rigged.js), và một lượt chạy 30 giây với dt thay đổi như vòng lặp thật. sit_down / stand_up đi qua đường thật của trò chơi:
// ghế đá thật trong sân + campus.play.toggleSit() (gồm quãng trượt vào ghế, xoay người, stand() trả về chỗ cũ).
//   --shot: chụp ba ảnh (side = nhìn ngang, front = nhìn thẳng, feet = cận bàn chân, mắt sát mặt nền) đúng khung ở giây đó của phép đo;
//           giây lấy từ "lúc t=…" trong dòng cờ. --raw: ghi cả mẫu thô từng phép đo (<nhãn>.sample.json) để soi lại.
// Mã thoát: 0 = không có LỖI, 1 = có LỖI, 2 = công cụ không chạy được (trang không nạp, không tìm ra chỗ phẳng…).
// Không sửa gì trong src/: mọi móc nối làm từ ngoài bằng page.evaluate. Công cụ dừng vòng lặp thật rồi tự gọi player.update + phys.step
// từng khung 1/60 s (các hệ khác — người phụ, sự kiện sân trường — đứng yên), dựng lại nhân vật trước mỗi phép đo → cùng mã nguồn thì
// kết quả giống hệt giữa các lần chạy và không phụ thuộc --only/--gender. Cần máy chủ tĩnh đang chạy ở --url và Edge.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { runCast } from './motion_cast.mjs';
import { analyze, tableHeader, tableRow, LEVEL, LIMITS } from './motion_metrics.mjs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DT = 1 / 60;
/** ngoại hình tiêu biểu: giày bệt, thể thao, dép, cao gót + áo dài, váy; chiều cao khác nhau để thử cả tỉ lệ ≠ 1 */
const LOOKS = [
  { id: 'giày tây', gender: 'm', look: { gender: 'm', outfit: 'white', height: 1.68, hair: 'short' } },
  { id: 'thể thao', gender: 'm', look: { gender: 'm', outfit: 'classJ', height: 1.8, hair: 'short' } },
  { id: 'dép', gender: 'm', look: { gender: 'm', outfit: 'white', top: 'polo', bottom: 'khaki', shoes: 'sandals', height: 1.72, hair: 'short' } },
  { id: 'giày bệt', gender: 'f', look: { gender: 'f', outfit: 'white', height: 1.58, hair: 'long' } },
  { id: 'áo dài+cao gót', gender: 'f', look: { gender: 'f', outfit: 'aodaiT', height: 1.62, hair: 'long' } },
  { id: 'váy+thể thao', gender: 'f', look: { gender: 'f', outfit: 'classS', height: 1.68, hair: 'long' } },
  { id: 'dép', gender: 'f', look: { gender: 'f', outfit: 'classJ', shoes: 'sandals', height: 1.55, hair: 'long' } },
];
const GENDER_NAME = { m: 'nam', f: 'nữ' };
const H = Math.PI / 2;
/** phép đo thêm ngoài nền phẳng. place = [x, y nền, z, hướng] ở chân cầu thang nhà A (x≈22,4), chân dốc nhà xe (x≈69,7), trước gờ vát 15 cm ở cổng; expect = tốc độ trên nền phẳng */
const EXTRA = [
  { test: 'idle (đường rẻ)', kind: 'idle', coarse: true, base: 'idle' }, { test: 'walk (đường rẻ)', kind: 'walk', coarse: true, base: 'walk' }, { test: 'run (đường rẻ)', kind: 'run', coarse: true, base: 'run' },
  { test: 'thang lên (đi)', kind: 'terrain', place: [22.4, 0.15, 14.6, 0], keys: 'w', secs: 3.4, expect: 1.5 },
  { test: 'thang xuống (đi)', kind: 'terrain', place: [22.4, 2.25, 20.4, 2 * H], keys: 'w', secs: 3.4, expect: 1.5 },
  { test: 'thang lên (chạy)', kind: 'terrain', place: [22.4, 0.15, 13.0, 0], keys: 'r', secs: 2.0, expect: 4.2 },
  { test: 'dốc nhà xe lên (đi)', kind: 'terrain', place: [69.7, 0, 24.0, 2 * H], keys: 'w', secs: 6, expect: 1.5 },
  { test: 'gờ cổng (đi)', kind: 'terrain', place: [41, 0, 63.0, 2 * H], keys: 'w', secs: 2.4, expect: 1.5 },
  { test: 'chạy 30 s (dt thật)', kind: 'long' },
];
/** clip vận động có trong tệp nhưng trò chơi không phát tại chỗ (chỉ idle/walk/run được trộn theo tốc độ) → không đo */
const SKIP_CLIP = /^(walk|run|sprint|idle)/;

function parseArgs(argv) {
  const opt = {}, rest = [];
  for (const a of argv) { if (a.startsWith('--')) { const i = a.indexOf('='); if (i < 0) opt[a.slice(2)] = '1'; else opt[a.slice(2, i)] = a.slice(i + 1); } else rest.push(a); }
  if (!rest[0]) { console.error('Thiếu thư mục kết quả. Dùng: node tools/motion_qa.mjs <thư mục> [--q=low|high] [--gender=m|f] [--only=<clip>]'); process.exit(2); }
  const gender = opt.gender ? ({ nam: 'm', m: 'm', 'nữ': 'f', nu: 'f', f: 'f' })[opt.gender.toLowerCase()] : null;
  if (opt.gender && !gender) { console.error('--gender phải là m hoặc f'); process.exit(2); }
  const shots = (opt.shot || '').split(',').filter(Boolean).map((s) => { const [clip, t] = s.split('@'); if (!clip || !Number.isFinite(+t)) { console.error('--shot phải có dạng <clip>@<giây>, ví dụ walk@0.45'); process.exit(2); } return { clip: normClip(clip), t: +t }; });
  return { cast: !!opt.cast, t: opt.t || null, outDir: rest[0], q: opt.q || 'low', gender, lookId: opt.look || null, only: opt.only ? opt.only.split(',').map(normClip) : null, shots, raw: !!opt.raw, idleSeconds: Number(opt['idle-seconds'] || 28), url: opt.url || 'http://127.0.0.1:8137' };
}
/** tên phép đo chuẩn: 'peace' → 'pose_peace', 'transition' → 'chuyển' */
function normClip(s) { const k = s.trim(); return k === 'transition' || k === 'chuyen' ? 'chuyển' : k; }

/* ===================== phần chạy trong trang ===================== */
/** cài window.__mqa: dừng vòng lặp thật, tự bước khung, đọc xương/đế giày. Chạy một lần sau khi trang sẵn sàng. */
async function installProbe(DT) {
  const THREE = await import('three'), tp = window.__tp, P = tp.player, phys = tp.phys, st = P.st;
  if (!P || !phys) throw new Error('Trang thiếu __tp.player hoặc __tp.phys');
  // dừng vòng lặp thật: lần gọi requestAnimationFrame kế tiếp của loop() bị giữ lại, từ đó công cụ tự bước
  const realRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = () => 0;
  await new Promise(r => realRaf(() => realRaf(r)));
  st.started = true; tp.fixedCam = true;
  const mulberry = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r5 = (v) => Math.round(v * 1e5) / 1e5, v = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), s3 = new THREE.Vector3();
  const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'].concat(...['Left', 'Right'].map(S => ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase'].map(n => S + n)));
  const QUAT_BONES = ['Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg'];
  const TORSO_BONES = new Set(['Hips', 'Spine', 'Spine1', 'Spine2']);      // đùi tính riêng (ống thuôn bám theo xương đùi) vì chân đổi vị trí so với lúc nghỉ
  const DOWN = { x: 0, y: -1, z: 0 }, keysDown = new Set();
  const key = (code, down) => { if (down === keysDown.has(code)) return; down ? keysDown.add(code) : keysDown.delete(code); window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); };
  const releaseAll = () => { for (const c of [...keysDown]) key(c, false); };
  // phys.step gom thời gian rồi mới bước 1/60 s: cộng thêm một chút để sai số dấu phẩy động không làm khung này 0 bước, khung sau 2 bước
  // trò chơi báo máy ảnh cho rigged.js mỗi khung (campus_play.js) để chỉ chỉnh dáng kỹ cho người ở gần, trong khung nhìn; công cụ tự bước khung nên tự báo
  const { setAnimFocus } = await import('/src/game/rigged.js');
  // máy ảnh giữ nguyên thế đứng trước mặt, ngang tầm đầu nhưng đi theo người chơi (trong trò chơi máy ảnh luôn bám người chơi): để yên một chỗ thì chạy được 12 m
  // là nhân vật ra khỏi tầm chỉnh dáng kỹ, số đo thành của đường rẻ
  const followCam = () => { if (!runway) return; const h = P.holder.position; tp.camera.position.set(h.x + Math.sin(camYaw) * 3, h.y + 1.45, h.z + Math.cos(camYaw) * 3); tp.camera.lookAt(h.x, h.y + 1.2, h.z); tp.camera.updateMatrixWorld(true); };
  const farCam = new THREE.PerspectiveCamera(); farCam.position.set(5000, 0, 5000); farCam.updateMatrixWorld(true);
  let camYaw = 0, coarse = false, live = false;      // camYaw: máy ảnh đứng phía nào của nhân vật; coarse: đo đường hoạt hoạ rẻ (báo cho rigged.js một máy ảnh ở rất xa); live: bước cả campus.play (ngồi/đứng thật)
  const step = (dt = DT) => { followCam(); if (setAnimFocus) setAnimFocus(coarse ? farCam : tp.camera); P.update(dt); if (live) tp.campus.play.update(dt); if (coarse && setAnimFocus) setAnimFocus(farCam); phys.step(dt + 1e-9); };
  const groundAt = (x, y, z) => { const hit = phys.cast({ x, y: y + 1, z }, DOWN, 6, 0xffff0001); return hit ? y + 1 - hit.toi : null; };
  let cache = null, runway = null, visOff = 0;      // visOff: mặt nền nhìn thấy cao hơn mặt va chạm bao nhiêu ở chỗ đang đo

  /** tìm một dải nền phẳng, trống dài len mét (tia vật lý): trả về { x, z, yaw, y } gần điểm xuất phát nhất */
  function findRunway(len, accept) {
    const sx = 41, sz = 62.5, cands = [];
    for (let x = -80; x <= 140; x += 3) for (let z = -60; z <= 130; z += 3) cands.push([x, z, Math.hypot(x - sx, z - sz)]);
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, z] of cands) for (const yaw of [Math.PI, 0, Math.PI / 2, -Math.PI / 2]) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw), y0 = groundAt(x, 1.5, z); if (y0 === null || y0 < -0.5 || y0 > 1.5) continue;
      let ok = true;
      for (let d = -1; d <= len && ok; d += 0.5) for (const side of [-0.5, 0, 0.5]) { const g = groundAt(x + fx * d - fz * side, y0 + 0.4, z + fz * d + fx * side); if (g === null || Math.abs(g - y0) > 0.002) { ok = false; break; } }
      for (const h of [0.2, 0.8, 1.5]) for (const side of [-0.5, 0, 0.5]) { if (!ok) break; if (phys.cast({ x: x - fx - fz * side, y: y0 + h, z: z - fz + fx * side }, { x: fx, y: 0, z: fz }, len + 2, 0xffff0003)) ok = false; }
      if (ok) { const rw = { x, z, yaw, y: y0 }; if (accept(rw)) return rw; }
    }
    return null;
  }
  /** mặt nền nhìn thấy (lưới vẽ) tại một điểm, để đối chiếu với mặt va chạm; null nếu không bắn trúng gì */
  function visualGround(x, y, z) {
    const rc = new THREE.Raycaster(new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(0, -1, 0), 0, 1.5), hits = [];
    tp.scene.traverse((o) => { if (!o.isMesh || !o.visible || o.isInstancedMesh || o.isSkinnedMesh || o.material.transparent) return; for (let a = o; a; a = a.parent) if (a === P.holder || !a.visible) return; try { const h = rc.intersectObject(o, false); if (h.length) hits.push(h[0].point.y); } catch (e) { /* lưới đặc biệt không bắn tia được: bỏ qua */ } });
    return hits.length ? Math.max(...hits) : null;
  }

  /** đổi ngoại hình với hạt ngẫu nhiên cố định (pha đung đưa, chớp mắt… lặp lại được) và chờ mô hình có xương thay vào */
  async function setLook(look, seed) {
    Math.random = mulberry(seed); const tag = 'mqa' + seed + '_' + performance.now();
    P.setLook({ ...look, mqaTag: tag });
    const t0 = performance.now();
    while (!(P.body.look.mqaTag === tag && P.body.rig)) { if (performance.now() - t0 > 60000) throw new Error('Mô hình có xương không nạp được trong 60 giây (ngoại hình ' + JSON.stringify(look) + ')'); await new Promise(r => setTimeout(r, 20)); }
    // các giá trị ngẫu nhiên của bộ xương (pha đung đưa, điểm bắt đầu clip đứng, lần chớp mắt) đặt lại cố định: mã khác trong trang cũng gọi Math.random nên chỉ gieo hạt là chưa đủ
    const rig = P.body.rig; rig.seed = (seed % 628) / 100; rig.t = 0; rig.blinkIn = 3; for (const n in rig.act) rig.act[n].time = 0;
    cache = prepare();
    return { clips: Object.fromEntries(Object.entries(P.body.rig.clips).map(([k, c]) => [k, c.duration])), footSource: cache.footSource, footVerts: cache.feet.L.count + cache.feet.R.count, scale: cache.scale };
  }
  /** dữ liệu nghỉ của bộ xương, đỉnh lưới bàn chân/giày, biên dạng thân — tính một lần cho mỗi nhân vật */
  function prepare() {
    const rig = P.body.rig, B = rig.bones, restPos = {}, restQuat = {}; let skel = null;
    P.holder.updateMatrixWorld(true);
    rig.g.traverse((o) => { if (o.isSkinnedMesh && !skel && o.skeleton.bones.includes(B.Hips)) skel = o.skeleton; });
    if (!skel) throw new Error('Không thấy lưới có xương của nhân vật');
    for (const nm of BONES) { const i = skel.bones.indexOf(B[nm]); if (i < 0) throw new Error('Bộ xương thiếu ' + nm); m.copy(skel.boneInverses[i]).invert().decompose(v, q, s3); restPos[nm] = [v.x, v.y, v.z]; if (QUAT_BONES.includes(nm)) restQuat[nm] = [q.x, q.y, q.z, q.w]; }
    const feet = { L: { meshes: [], count: 0 }, R: { meshes: [], count: 0 } }, thighR = [{ out: [], fb: [] }, { out: [], fb: [] }], kneeY = restPos.LeftLeg[1], topY = restPos.LeftArm[1] - 0.03, dy = 0.04, nb = Math.max(1, Math.ceil((topY - kneeY) / dy));
    const torso = { y0: kneeY, dy, rx: Array(nb).fill(0), zf: Array(nb).fill(-Infinity), zb: Array(nb).fill(Infinity) };
    rig.g.traverse((o) => {
      if (!o.isSkinnedMesh) return; for (let a = o; a && a !== rig.g; a = a.parent) if (!a.visible) return;
      const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, names = o.skeleton.bones.map(b => b.name.replace('mixamorig', ''));
      const sel = { L: [], R: [] };
      for (let i = 0; i < pos.count; i++) {
        let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
        const nm = names[best]; v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
        if (/^(Left|Right)(Foot|ToeBase)$/.test(nm)) sel[nm.startsWith('Left') ? 'L' : 'R'].push(i);
        else if (/^(Left|Right)UpLeg$/.test(nm)) {      // bề dày đùi quanh trục khớp háng → gối: ra phía ngoài và theo chiều trước–sau, tách nửa trên / nửa dưới
          const S = nm.slice(0, -5), h = restPos[S + 'UpLeg'], k = restPos[S + 'Leg'], ax = [k[0] - h[0], k[1] - h[1], k[2] - h[2]], l2 = ax[0] * ax[0] + ax[1] * ax[1] + ax[2] * ax[2];
          const t = ((v.x - h[0]) * ax[0] + (v.y - h[1]) * ax[1] + (v.z - h[2]) * ax[2]) / l2;
          if (t > 0.15 && t < 0.9) { const part = thighR[t < 0.5 ? 0 : 1]; part.out.push((v.x - h[0] - ax[0] * t) * (S === 'Left' ? 1 : -1)); part.fb.push(Math.abs(v.z - h[2] - ax[2] * t)); }
        } else if (TORSO_BONES.has(nm)) { const b = Math.floor((v.y - torso.y0) / dy); if (b >= 0 && b < nb) { torso.rx[b] = Math.max(torso.rx[b], Math.abs(v.x)); torso.zf[b] = Math.max(torso.zf[b], v.z); torso.zb[b] = Math.min(torso.zb[b], v.z); } }
      }
      for (const side of ['L', 'R']) {
        const ids = sel[side]; if (!ids.length) continue;
        const bind = new Float32Array(ids.length * 3), bi = new Uint16Array(ids.length * 4), wt = new Float32Array(ids.length * 4), used = new Set();
        ids.forEach((i, n) => { v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix); bind.set([v.x, v.y, v.z], n * 3); let sum = 0; for (let k = 0; k < 4; k++) sum += sw.getComponent(i, k); for (let k = 0; k < 4; k++) { bi[n * 4 + k] = si.getComponent(i, k); wt[n * 4 + k] = sw.getComponent(i, k) / (sum || 1); if (wt[n * 4 + k] > 0) used.add(bi[n * 4 + k]); } });
        feet[side].meshes.push({ skeleton: o.skeleton, bind, bi, wt, used: [...used], mats: new Map(), out: new Float32Array(ids.length * 3) }); feet[side].count += ids.length;
      }
    });
    for (let b = 0; b < nb; b++) if (!Number.isFinite(torso.zf[b])) { torso.rx[b] = 0; torso.zf[b] = torso.zb[b] = 0; }
    // điểm dò ở đế: đỉnh thấp nhất trong từng ô dọc theo chiều dài bàn chân (lấy ở tư thế nghỉ)
    for (const side of ['L', 'R']) {
      const F = feet[side]; F.probes = []; if (!F.count) continue;
      let minY = Infinity, minZ = Infinity, maxZ = -Infinity, minX = Infinity, maxX = -Infinity;
      for (const M of F.meshes) for (let n = 0; n < M.bind.length; n += 3) { minY = Math.min(minY, M.bind[n + 1]); minZ = Math.min(minZ, M.bind[n + 2]); maxZ = Math.max(maxZ, M.bind[n + 2]); minX = Math.min(minX, M.bind[n]); maxX = Math.max(maxX, M.bind[n]); }
      const cells = new Map();
      F.meshes.forEach((M, mi) => { for (let n = 0; n < M.bind.length; n += 3) { const y = M.bind[n + 1]; if (y > minY + 0.012) continue; const c = Math.min(5, Math.floor((M.bind[n + 2] - minZ) / (maxZ - minZ + 1e-9) * 6)) * 2 + (M.bind[n] > (minX + maxX) / 2 ? 1 : 0), cur = cells.get(c); if (!cur || y < cur.y) cells.set(c, { y, mi, n: n / 3 }); } });
      F.probes = [...cells.values()]; F.restMinY = minY;
    }
    const p90 = (a) => (a.length ? a.sort((x, y) => x - y)[Math.floor(a.length * 0.9)] : null), thigh = thighR[0].out.length && thighR[1].out.length ? { top: { out: p90(thighR[0].out), fb: p90(thighR[0].fb) }, bottom: { out: p90(thighR[1].out), fb: p90(thighR[1].fb) } } : null;
    const footSource = feet.L.count && feet.R.count ? 'lưới' : 'xương';
    return { rig, B, restPos, restQuat, feet, torso, thigh, footSource, scale: rig.g.scale.toArray() };
  }
  /** vị trí thế giới của các đỉnh bàn chân ở tư thế hiện tại (tự nhân ma trận xương như bộ đổ bóng) → điểm thấp nhất + các điểm dò */
  function skinFoot(side) {
    const F = cache.feet[side], B = cache.B, S = side === 'L' ? 'Left' : 'Right';
    if (!F.count) {      // không có lưới bàn chân: dùng xương cổ chân/mũi chân trừ cao độ nghỉ của chúng
      const sc = cache.rig.g.scale.y, a = B[S + 'Foot'].getWorldPosition(new THREE.Vector3()), b = B[S + 'ToeBase'].getWorldPosition(new THREE.Vector3());
      a.y -= cache.rig.footY * sc; b.y -= cache.rig.toeY * sc; return { minY: r5(Math.min(a.y, b.y)), probes: [a.x, a.y, a.z, b.x, b.y, b.z].map(r5) };
    }
    let minY = Infinity;
    for (const M of F.meshes) {
      for (const j of M.used) { let mm = M.mats.get(j); if (!mm) M.mats.set(j, mm = new THREE.Matrix4()); mm.multiplyMatrices(M.skeleton.bones[j].matrixWorld, M.skeleton.boneInverses[j]); }
      const { bind, bi, wt, out } = M;
      for (let n = 0, c = bind.length / 3; n < c; n++) {
        const x = bind[n * 3], y = bind[n * 3 + 1], z = bind[n * 3 + 2]; let ox = 0, oy = 0, oz = 0;
        for (let k = 0; k < 4; k++) { const w = wt[n * 4 + k]; if (w <= 0) continue; const e = M.mats.get(bi[n * 4 + k]).elements; ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]); }
        out[n * 3] = ox; out[n * 3 + 1] = oy; out[n * 3 + 2] = oz; if (oy < minY) minY = oy;
      }
    }
    const probes = []; for (const p of F.probes) { const o = F.meshes[p.mi].out; probes.push(r5(o[p.n * 3]), r5(o[p.n * 3 + 1]), r5(o[p.n * 3 + 2])); }
    return { minY: r5(minY), probes };
  }
  function capture(t, action) {
    P.holder.updateMatrixWorld(true);
    const B = cache.B, b = [], qs = {}, h = P.holder.position;
    for (const nm of BONES) { v.setFromMatrixPosition(B[nm].matrixWorld); b.push(r5(v.x), r5(v.y), r5(v.z)); }
    for (const nm of QUAT_BONES) { B[nm].getWorldQuaternion(q); qs[nm] = [r5(q.x), r5(q.y), r5(q.z), r5(q.w)]; }
    const g = run && run.floor !== undefined ? run.floor : groundAt(h.x, h.y, h.z);      // ngồi ghế: tia dưới gốc trúng mặt ghế, nên dùng cao độ nền quanh ghế
    let tf; if (run && run.terrain) { const rig = cache.rig, sc = rig.g.scale.y, cl = (bone, rest) => { v.setFromMatrixPosition(bone.matrixWorld); const gy = groundAt(v.x, v.y, v.z); return gy === null ? null : r5(v.y - rest * sc - gy); }; tf = { L: [cl(B.LeftFoot, rig.footY), cl(B.LeftToeBase, rig.toeY)], R: [cl(B.RightFoot, rig.footY), cl(B.RightToeBase, rig.toeY)] }; }
    return { t: r5(t), tf, root: [r5(h.x), r5(h.y), r5(h.z)], yaw: r5(P.holder.rotation.y), ground: g === null ? null : r5(g + visOff), speed: r5(st.speed), grounded: st.grounded, clipTime: action ? r5(action.time) : null, b, q: qs, feet: { L: skinFoot('L'), R: skinFoot('R') } };
  }
  /** về đầu dải phẳng, đứng yên, máy ảnh cố định trước mặt ngang tầm đầu (dáng chụp ảnh quay người và nhìn về máy ảnh) */
  function reset() {
    releaseAll(); if (tp.campus && tp.campus.play && tp.campus.play.sitting) tp.campus.play.stand(); coarse = false; live = false; camYaw = runway.yaw; visOff = runway.visualOffset;
    st.pose = null; st.clip = null; st.photo = false; st.fp = false; st.pinned = false; st.pinBy = null;
    // xoá hẳn vận tốc còn dư của phép đo trước: một lần cập nhật ở trạng thái "bị ghim" đặt vận tốc về đúng 0 (player.js). Để nó tự tắt dần thì còn dư cỡ 1e-20 m/s,
    // và bộ điều khiển nhân vật đứng ở cao độ khác hẳn khi vận tốc mong muốn là "gần 0" so với "đúng 0" → kết quả phụ thuộc phép đo chạy trước
    const pinned = st.pinned; st.pinned = true; P.update(DT); st.pinned = pinned;
    P.teleport(runway.x, runway.y, runway.z, runway.yaw);
    tp.camera.position.set(runway.x + Math.sin(runway.yaw) * 3, runway.y + 1.45, runway.z + Math.cos(runway.yaw) * 3); tp.camera.lookAt(runway.x, runway.y + 1.2, runway.z);
    for (let i = 0; i < 90; i++) step();
  }
  const poseAction = () => { let best = null; for (const [, p] of cache.rig.poses) if (!best || p.w > best.w) best = p; return best ? best.a : null; };
  let run = null;      // phép đo đang chạy: { phases: [{ frames, before(), dts? (dt từng khung) }], frame, t, action() }
  /** chuẩn bị một phép đo theo spec = { test, kind, idleSeconds }; trả về tổng số khung sẽ lấy mẫu */
  function begin(spec) {
    if (!runway) throw new Error('Chưa có dải phẳng'); if (!cache) throw new Error('Chưa đặt ngoại hình');
    const rig = cache.rig, clips = rig.clips, secs = (s) => Math.ceil(s / DT), name = spec.test; reset();
    const cyc = (act, cycles) => Math.min(secs(6), Math.ceil(cycles * act.getClip().duration / Math.max(0.3, act.timeScale) / DT) + 2);
    let phases, floor, action = () => null;
    if (name === 'idle') { phases = [{ frames: secs(spec.idleSeconds) }]; action = () => rig.act.idle; }
    else if (name === 'walk' || name === 'run') {
      key('KeyW', true); if (name === 'run') key('ShiftLeft', true); for (let i = 0; i < 90; i++) step();
      phases = [{ frames: cyc(rig.act[name], name === 'run' ? 4 : 2) }]; action = () => rig.act[name];      // chạy: 4 chu kỳ vì hay dính lúc khựng phải loại bớt khung
    } else if (name === 'chuyển') {
      phases = [{ frames: secs(0.5) }, { frames: secs(2.5), before: () => key('KeyW', true) }, { frames: secs(2.5), before: () => key('ShiftLeft', true) }, { frames: secs(1.5), before: () => key('ShiftLeft', false) }, { frames: secs(6), before: () => key('KeyW', false) }];      // 6 giây đứng lại sau khi đi: bắt cả cao độ gốc lúc "đứng sau khi đi" (khác lúc mới đặt xuống)
    } else if (spec.coarse) {      // đường rẻ: như idle/walk/run nhưng rigged.js tưởng máy ảnh ở rất xa (nhân vật phụ ở xa, người chơi mạng đi đường này)
      coarse = true; const base = spec.base;
      if (base === 'idle') { for (let i = 0; i < 60; i++) step(); phases = [{ frames: secs(Math.min(8, spec.idleSeconds)) }]; action = () => rig.act.idle; }
      else { key('KeyW', true); if (base === 'run') key('ShiftLeft', true); for (let i = 0; i < 90; i++) step(); phases = [{ frames: cyc(rig.act[base], base === 'run' ? 4 : 2) }]; action = () => rig.act[base]; }
    } else if (spec.kind === 'terrain') {      // cầu thang / dốc / gờ: đặt ở chân dốc, giữ phím đi (hoặc chạy) suốt phép đo
      const [x, y, z, yaw] = spec.place; st.pinned = true; P.update(DT); st.pinned = false; P.teleport(x, y, z, yaw); camYaw = yaw + Math.PI / 2; visOff = 0; for (let i = 0; i < 60; i++) step();
      phases = [{ frames: secs(spec.secs), before: () => { key('KeyW', true); if (spec.keys === 'r') key('ShiftLeft', true); } }];
    } else if (spec.kind === 'long') {      // chạy 30 giây, mỗi khung một dt khác nhau (1/144…1/30 s, dãy cố định theo hạt) như vòng lặp thật; hết dải phẳng thì đặt lại đầu dải, vẫn giữ phím
      key('KeyW', true); key('ShiftLeft', true); for (let i = 0; i < 90; i++) step();
      const rnd = mulberry(4242), DTS = [1 / 144, 1 / 120, 1 / 90, 1 / 75, 1 / 60, 1 / 60, 1 / 50, 1 / 40, 1 / 30]; let lap = 0;
      const dts = []; for (let t = 0; t < 30;) { const d = DTS[Math.floor(rnd() * DTS.length)]; dts.push(d); t += d; }
      phases = [{ frames: dts.length, dts, lapEvery: 5.2, onLap: () => { const keep = [P.pos.y, st.vy]; P.pos.x = runway.x; P.pos.z = runway.z; phys.pbody.setTranslation(P.pos, true); phys.world.propagateModifiedBodyPositionsToColliders(); lap++; } }];
    } else if (name === 'sit_down' || name === 'stand_up') {      // đường thật: ghế đá trong sân, người chơi đứng trước ghế 0,65 m quay mặt vào ghế, bấm C (toggleSit)
      const play = tp.campus && tp.campus.play, seat = (tp.B.seats || []).find(q => !q.taken); if (!play || !seat) throw new Error('Không có campus.play hoặc ghế đá trống để đo ngồi/đứng');
      const gy = seat.y - 0.46, fx = Math.sin(seat.f), fz = Math.cos(seat.f); live = true; floor = gy; st.pinned = true; P.update(DT); st.pinned = false;
      P.teleport(seat.x + fx * 0.65, gy, seat.z + fz * 0.65, seat.f + Math.PI); P.holder.rotation.y = seat.f + Math.PI; camYaw = seat.f + Math.PI / 2; { const vg = visualGround(seat.x + fx * 0.65, gy, seat.z + fz * 0.65); visOff = vg === null ? 0 : vg - gy; }
      for (let i = 0; i < 90; i++) step();
      const sitNow = () => { play.toggleSit(); if (!play.sitting) throw new Error('toggleSit không ngồi được vào ghế đá'); };
      if (name === 'sit_down') phases = [{ frames: secs(rig.clips.sit_down.duration + 1.2), before: sitNow }];
      else { sitNow(); for (let i = 0, n = secs(rig.clips.sit_down.duration + 1.2); i < n; i++) step(); phases = [{ frames: secs(rig.clips.stand_up.duration + 1.2), before: () => play.toggleSit() }]; }
    }
    if (!phases) {
      const pose = name.startsWith('pose_'), clip = clips[name]; if (!clip) throw new Error('Không có clip ' + name);
      if (pose) st.pose = name.slice(5); else st.clip = name;
      for (let i = 0, n = secs(pose ? 2.5 : 1.5); i < n; i++) step();
      phases = [{ frames: Math.max(secs(3), secs(2 * clip.duration) + 2) }]; action = poseAction;
    }
    run = { phases, action, frame: 0, t: 0, lapT: 0, floor, terrain: spec.kind === 'terrain', total: phases.reduce((a, p) => a + p.frames, 0), startSpeed: st.speed };
    return { total: run.total, meta: { kind: spec.kind, expectSpeed: spec.expect, dt: DT, bones: BONES, scale: cache.scale, rest: { pos: cache.restPos, quat: cache.restQuat }, torso: cache.torso, thigh: cache.thigh, footSource: cache.footSource } };
  }
  /** bước tiếp tối đa n khung của phép đo hiện tại, trả về các khung đã lấy mẫu */
  function advance(n) {
    const out = [];
    while (n-- > 0 && run.frame < run.total) {
      let acc = 0, dt = DT; for (const ph of run.phases) { if (run.frame === acc && ph.before) ph.before(); if (run.frame >= acc && run.frame < acc + ph.frames && ph.dts) { dt = ph.dts[run.frame - acc]; run.lapT += dt; if (run.lapT >= ph.lapEvery) { run.lapT = 0; ph.onLap(); } } acc += ph.frames; }
      step(dt); run.t += dt; run.frame++; out.push(capture(run.t, run.action()));
    }
    if (run.frame >= run.total) releaseAll();
    return out;
  }
  /** vẽ lại đúng trạng thái hiện tại (không bước thời gian) từ một góc máy phụ: 'side' = toàn thân nhìn ngang, 'feet' = cận bàn chân sát đất */
  function renderView(view) {
    const cam = tp.camera, keep = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov }, h = P.holder.position, yaw = P.holder.rotation.y, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    if (view === 'feet') { const gy = groundAt(h.x, h.y, h.z) ?? h.y; cam.position.set(h.x + rx * 1.1, gy + 0.012, h.z + rz * 1.1); cam.fov = 26; cam.lookAt(h.x, gy + 0.07, h.z); }      // mắt sát mặt nền: chân hở thì thấy khe sáng dưới đế, chân chìm thì đế bị mặt nền cắt
    else if (view === 'front') { cam.position.set(h.x + Math.sin(yaw) * 3.4, h.y + 1.0, h.z + Math.cos(yaw) * 3.4); cam.fov = 34; cam.lookAt(h.x, h.y + 0.9, h.z); }
    else { cam.position.set(h.x + rx * 3.4, h.y + 1.0, h.z + rz * 3.4); cam.fov = 34; cam.lookAt(h.x, h.y + 0.9, h.z); }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); P.holder.visible = true;
    for (let i = 0; i < 3; i++) { tp.sky.update(0, cam); tp.pipeline.render(0, tp.sky.sun, tp.sky.state.lightDir); }
    return () => { cam.position.copy(keep.p); cam.quaternion.copy(keep.q); cam.fov = keep.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
  }
  let restoreCam = null;
  window.__mqa = {
init(len) {
      // mặt nền nhìn thấy (lớp nhựa đường, gạch lát… nằm trên mặt va chạm vài mm) phải đều suốt dải, nếu không mốc đo xuyên đất sẽ lệch theo chỗ đứng
      for (let i = 0; i < 600; i++) step();      // 10 giây cho các vật thể động lúc mới nạp nằm yên hẳn, để phép đo đầu tiên không khác các phép đo sau
      let tried = 0, fallback = null;
      const accept = (rw) => {
        fallback = fallback || rw; if (++tried > 60) return true;
        const ys = []; for (let d = 0; d <= len - 2; d += 3) for (const side of [-0.3, 0.3]) ys.push(visualGround(rw.x + Math.sin(rw.yaw) * d - Math.cos(rw.yaw) * side, rw.y, rw.z + Math.cos(rw.yaw) * d + Math.sin(rw.yaw) * side));
        if (ys.some(y => y === null) || Math.max(...ys) - Math.min(...ys) > 0.002 || Math.abs(ys[0] - rw.y) > 0.2) return false;
        rw.visualY = ys[0]; rw.visualOffset = ys[0] - rw.y; return true;
      };
      runway = findRunway(len, accept);
      if (runway && runway.visualY === undefined) { runway = fallback; runway.visualY = null; runway.visualOffset = 0; }
      return runway;
    },
    setLook, begin, advance,
    view(name) { if (restoreCam) restoreCam(); restoreCam = name ? renderView(name) : null; },
  };
  return true;
}

/* ===================== phần chạy trong Node ===================== */
async function openPage(browser, opt) {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => { errors.push(String(e).slice(0, 400)); });
  page.on('console', (msg) => { if (msg.type() === 'error' && /người|hoạt hoạ/.test(msg.text())) console.log('  trang báo lỗi: ' + msg.text().slice(0, 300)); });
  await page.goto(`${opt.url}/?${opt.query || `ui=0&q=${opt.q}&t=10.5&w=cloudy&reunion=0`}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true || /Lỗi/.test(document.getElementById("loadMsg").textContent)', { timeout: 180000 });
  const msg = await page.evaluate('document.getElementById("loadMsg").textContent');
  if (/Lỗi/.test(msg)) { await page.close(); throw new Error('Trang báo: ' + msg + (errors.length ? ' · ' + errors[0] : '')); }
  return page;
}
/** nạp trang, thử lại vài lần (các tệp nguồn có thể đang được sửa dở) */
async function openWithRetry(browser, opt, tries = 3, waitMs = 45000) {
  for (let i = 1; ; i++) {
    try { return await openPage(browser, opt); }
    catch (e) { console.error(`Lần ${i}/${tries}: trang không nạp được — ${e.message}`); if (i >= tries) throw e; console.error(`  chờ ${waitMs / 1000} giây rồi thử lại…`); await new Promise(r => setTimeout(r, waitMs)); }
  }
}
function testsFor(clipNames, opt) {
  const kindOf = (nm) => (/^sit_|squat|stand_up/.test(nm) ? 'sit' : nm.startsWith('pose_') ? 'pose' : 'action');
  const poses = [...new Set(clipNames.filter(n => n.startsWith('pose_')).map(n => n.replace(/_f$/, '')))];
  const actions = clipNames.filter(n => !n.startsWith('pose_') && !SKIP_CLIP.test(n));
  const all = [{ test: 'idle', kind: 'idle' }, { test: 'walk', kind: 'walk' }, { test: 'run', kind: 'run' }, { test: 'chuyển', kind: 'transition' }, ...EXTRA,
    ...actions.map(n => ({ test: n, kind: kindOf(n) })), ...poses.map(n => ({ test: n, kind: kindOf(n) }))];
  if (!opt.only) return all;
  const want = new Set(opt.only.flatMap(n => [n, 'pose_' + n])), picked = all.filter(t => want.has(t.test));
  const unknown = opt.only.filter(n => !all.some(t => t.test === n || t.test === 'pose_' + n));
  if (unknown.length) throw new Error(`--only: không có clip ${unknown.join(', ')}. Có: ${all.map(t => t.test).join(', ')}`);
  return picked;
}
/** chạy một phép đo; chụp ảnh ở các thời điểm yêu cầu (trạng thái đúng khung đó, không bước thêm thời gian) */
async function runTest(page, spec, shotTimes, shotPrefix, opt) {
  const { total, meta } = await page.evaluate((s) => window.__mqa.begin(s), { ...spec, idleSeconds: opt.idleSeconds });
  const stops = [...new Set(shotTimes.map(t => Math.min(total, Math.max(1, Math.round(t / DT)))))].sort((a, b) => a - b), frames = [], files = [];
  for (const stop of [...stops, total]) {
    if (stop > frames.length) frames.push(...await page.evaluate((n) => window.__mqa.advance(n), stop - frames.length));
    if (stop === total && !stops.includes(total)) break;
    for (const view of ['side', 'front', 'feet']) {
      await page.evaluate((v) => window.__mqa.view(v), view);
      const file = path.join(opt.outDir, `${shotPrefix}_t${(stop * DT).toFixed(2)}_${view}.png`); await page.screenshot({ path: file }); files.push(file);
    }
    await page.evaluate(() => window.__mqa.view(null));
  }
  return { sample: { meta, frames }, files };
}
/** ghi chú về điều kiện đo: tốc độ thật, nền không phẳng, rơi khỏi mặt đất… (để người đọc biết số nào kém tin cậy) */
function conditionNotes(spec, sample) {
  const notes = [], fr = sample.frames, speeds = fr.map(f => f.speed), mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  if (fr.some(f => f.ground === null)) throw new Error('Mất mặt nền dưới chân trong lúc đo');
  if (spec.kind === 'terrain') { const y = fr.map(f => f.root[1]); return [`gốc ${Math.min(...y).toFixed(2)}→${Math.max(...y).toFixed(2)} m, tốc độ ngang TB ${mean.toFixed(2)} m/s`]; }
  if (spec.kind === 'long') return [`${fr.length} khung, dt ${(Math.min(...fr.slice(1).map((f, i) => f.t - fr[i].t)) * 1000).toFixed(1)}–${(Math.max(...fr.slice(1).map((f, i) => f.t - fr[i].t)) * 1000).toFixed(1)} ms, tốc độ TB ${mean.toFixed(2)} m/s`];
  if (spec.test === 'sit_down' || spec.test === 'stand_up') return ['ghế đá thật + toggleSit'];
  const g = fr.map(f => f.ground); if (Math.max(...g) - Math.min(...g) > 0.004) notes.push(`nền dưới chân đổi cao độ ${((Math.max(...g) - Math.min(...g)) * 100).toFixed(1)} cm`);
  if (spec.test === 'walk' && Math.abs(mean - 1.5) > 0.1) notes.push(`tốc độ đi đo được ${mean.toFixed(2)} m/s (mong đợi 1,5) — có thể bị cản`);
  if (spec.test === 'run' && Math.abs(mean - 4.2) > 0.25) notes.push(`tốc độ chạy đo được ${mean.toFixed(2)} m/s (mong đợi 4,2) — có thể bị cản`);
  if (spec.kind !== 'walk' && spec.kind !== 'run' && spec.kind !== 'transition' && Math.max(...speeds) > 0.05) notes.push('nhân vật bị xê dịch trong lúc đứng tại chỗ');
  if (spec.kind === 'walk' || spec.kind === 'run' || spec.kind === 'transition') { const ro = fr.map(f => f.root[1] - f.ground); notes.push(`gốc nhân vật so với nền ${(Math.min(...ro) * 100).toFixed(1)}..${(Math.max(...ro) * 100).toFixed(1)} cm`); }
  if (fr.some(f => !f.grounded)) notes.push('có khung bộ điều khiển báo không chạm đất');
  if (sample.meta.footSource !== 'lưới') notes.push('không lấy được lưới bàn chân, đo theo xương + bù đế (kém chính xác)');
  return notes;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opt.outDir, { recursive: true });
  const looks = LOOKS.filter(l => (!opt.gender || l.gender === opt.gender) && (!opt.lookId || l.id.includes(opt.lookId)));
  if (!looks.length) { console.error('Không có ngoại hình nào khớp --gender/--look. Có: ' + LOOKS.map(l => `${GENDER_NAME[l.gender]}/${l.id}`).join(', ')); process.exit(2); }
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', protocolTimeout: 300000,
    args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-extensions', '--window-size=960,720'], defaultViewport: { width: 960, height: 720 } });
  const results = [], t0 = Date.now(); let runway = null;
  if (opt.cast) {      // --cast: quét chân mọi nhân vật không phải người chơi (tools/motion_cast.mjs)
    try { const rows = await runCast(browser, opt, openWithRetry); fs.writeFileSync(path.join(opt.outDir, `motion_cast_${opt.q}.json`), JSON.stringify(rows, null, 1)); process.exitCode = rows.some(r => r.level === 2) ? 1 : 0; }
    finally { await browser.close(); }
    return;
  }
  try {
    const page = await openWithRetry(browser, opt);
    await page.evaluate(installProbe, DT);
    runway = await page.evaluate(() => window.__mqa.init(26));
    if (!runway) throw new Error('Không tìm được dải nền phẳng, trống dài 26 m để cho nhân vật đi/chạy');
    console.log(`Mức đồ hoạ ${opt.q} · dải phẳng tại (${runway.x}; ${runway.z}) cao ${runway.y.toFixed(3)} m, hướng ${(runway.yaw * 180 / Math.PI).toFixed(0)}° · mặt nền nhìn thấy ${runway.visualY === null ? 'không dò được (dùng mặt va chạm)' : 'lệch mặt va chạm ' + (runway.visualOffset * 1000).toFixed(1) + ' mm'}`);
    console.log('Đơn vị: xuyên/hở/tay-thân/nối/giật = cm · trượt = m/s · xương = % · lưng/gù/gối/khuỷu/đầu = độ (đầu: âm là cúi)\n');
    console.log(tableHeader());
    for (let li = 0; li < looks.length; li++) {
      const L = looks[li], seed = 1000 + LOOKS.indexOf(L);
      const info = await page.evaluate((look, s) => window.__mqa.setLook(look, s), L.look, seed);
      for (const spec of testsFor(Object.keys(info.clips), opt)) {
        const label = `${GENDER_NAME[L.gender]}/${L.id}/${spec.test}`;
        await page.evaluate((look, s) => window.__mqa.setLook(look, s), L.look, seed);      // dựng lại nhân vật trước mỗi phép đo: kết quả không phụ thuộc thứ tự chạy
        const shotTimes = opt.shots.filter(s => s.clip === spec.test || 'pose_' + s.clip === spec.test).map(s => s.t);
        const { sample, files } = await runTest(page, spec, shotTimes, label.replace(/[\/+ ]/g, '_'), opt);
        const result = analyze(sample), notes = conditionNotes(spec, sample);
        console.log(tableRow(label, result) + (notes.length ? '  [' + notes.join('; ') + ']' : ''));
        for (const f of files) console.log('    ảnh: ' + f);
        results.push({ label, gender: L.gender, lookId: L.id, look: L.look, test: spec.test, kind: spec.kind, frames: sample.frames.length, seconds: +(sample.frames.length * DT).toFixed(2), level: result.level, flags: result.flags, notes, metrics: result.metrics, shots: files });
        if (opt.raw) fs.writeFileSync(path.join(opt.outDir, label.replace(/[\/+ ]/g, '_') + '.sample.json'), JSON.stringify(sample));
      }
    }
  } finally { await browser.close(); }

  const flagged = results.flatMap(r => r.flags.map(f => ({ label: r.label, ...f }))).sort((a, b) => b.severity - a.severity);
  const count = (lv) => results.filter(r => r.level === lv).length;
  console.log(`\n${results.length} phép đo trong ${((Date.now() - t0) / 1000).toFixed(0)} giây: ${count(LEVEL.OK)} OK · ${count(LEVEL.WARN)} CẢNH BÁO · ${count(LEVEL.ERROR)} LỖI`);
  if (flagged.length) { console.log('\nCác mục bị cờ, nặng nhất trước (mức nặng = giá trị / ngưỡng lỗi):'); for (const f of flagged.slice(0, 40)) console.log(`  ${f.level.padEnd(8)} ${f.severity.toFixed(2).padStart(5)}  ${f.label.padEnd(34)} ${f.metric}: ${f.text}`); if (flagged.length > 40) console.log(`  … còn ${flagged.length - 40} mục nữa trong tệp JSON`); }
  const outFile = path.join(opt.outDir, `motion_qa_${opt.q}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), url: opt.url, quality: opt.q, dt: DT, runway, limits: LIMITS, summary: { total: results.length, ok: count(LEVEL.OK), warn: count(LEVEL.WARN), error: count(LEVEL.ERROR) }, flagged, results }, null, 1));
  console.log('\nKết quả đầy đủ: ' + outFile);
  process.exit(count(LEVEL.ERROR) ? 1 : 0);
}
main().catch((e) => { console.error('Công cụ kiểm chuyển động không chạy được: ' + (e && e.stack ? e.stack : e)); process.exit(2); });
