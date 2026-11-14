// Nhảy dây: hai bạn quay một sợi dây thật (đường cong quay quanh trục nối hai bàn tay), người chơi bấm E vào giữa, bấm Space đúng nhịp để
// nhảy qua mỗi lần dây quét sát đất. Dây quay nhanh dần theo số cái nhảy được; vướng dây thì đếm lại; kỷ lục lưu máy.
// Trong lúc chơi st.game = 'rope' (player.js thôi nhảy/đá/tương tác riêng, vẫn cho bước) nên cú nhảy do module này đặt st.vy.
import * as THREE from 'three';

const TALL_YAW = 0.9, TALL_DIST = 6.2;
const SPAN = 3.2, HAND_Y = 1.0, SAG = 0.98, SEGS = 18, THICK = 0.014;                    // khoảng cách hai bạn quay, cao tay, độ võng (bán kính quay), số đốt dây
const T_SLOW = 1.5, T_FAST = 0.74, T_STEP = 0.04, IDLE_T = 1.7, JUMP_V = 3.3, CLEAR = 0.08, HIT_R = 1.25;      // chu kỳ quay (giây): chậm nhất, nhanh nhất, bớt mỗi cái; vận tốc nhảy; chân cao hơn thế này là qua dây
const TRIP_PAUSE = 1.3, LEAVE_R = 2.3, ACTIVE_R = 45, KEY_REST = 0.3;
import { typing } from './reunion_ui.js';

export function initRope(K) {
  const { ctx, ui, D, state, save, actors } = K, { player, scene } = ctx, st = player.st, R = D.ROPE, [cx, cz] = R.at, rec = state.rope, tmp = new THREE.Vector3();
  // hai bạn quay dây đứng hai đầu theo trục x, quay mặt vào nhau
  const turners = [-1, 1].map((s, k) => actors.add({ x: cx + s * SPAN / 2, y: 0.02, z: cz, f: -s * Math.PI / 2 }, R.looks[k], { face: -s * Math.PI / 2, show: 60, smile: 0.5 }));
  for (const a of turners) a.gestTurn = { type: 'turn', t: 0, dur: Infinity, ph: 0 };
  const rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(THICK, THICK, 1, 5), new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.9 }), SEGS);
  rope.frustumCulled = false; rope.castShadow = true; rope.userData.noBake = true; scene.add(rope);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), m4 = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  let joined = false, joinedAt = 0, count = 0, ang = Math.PI, pause = 0, ground = 0.02, barN = -1, barM = -1, barText = '', air = false, bragged = false, tall = false;      // ang = góc dây: 0 là sát đất, π là trên đầu

  const period = () => (joined ? Math.max(T_FAST, T_SLOW - count * T_STEP) : IDLE_T);
  /** điểm thứ s (0..1) của dây ở góc ang: cung parabol võng SAG quay quanh trục nối hai tay */
  function point(s, out) { const sag = Math.sin(Math.PI * s) * SAG; out.lerpVectors(A, B, s); out.y -= Math.cos(ang) * sag; out.z += Math.sin(ang) * sag; if (out.y < ground + THICK) out.y = ground + THICK; return out; }
  function drawRope() {
    for (let k = 0; k < 2; k++) { const a = turners[k], rig = a.h.rig, out = k ? B : A, g = a.h.g.position; if (rig && rig.bones.RightHand && a.h.g.visible) rig.bones.RightHand.getWorldPosition(out); else out.set(g.x + (k ? -0.3 : 0.3), g.y + HAND_Y, g.z); }
    point(0, p0);
    for (let i = 0; i < SEGS; i++) { point((i + 1) / SEGS, p1); mid.addVectors(p0, p1).multiplyScalar(0.5); dir.subVectors(p1, p0); const len = dir.length() || 1e-4; q.setFromUnitVectors(UP, dir.divideScalar(len)); rope.setMatrixAt(i, m4.compose(mid, q, sc.set(1, len, 1))); p0.copy(p1); }
    rope.instanceMatrix.needsUpdate = true;
  }
  const say = (list) => { const a = turners[Math.floor(Math.random() * 2)]; ui.bubble(() => actors.head(a, tmp), list[Math.floor(Math.random() * list.length)], 1.8); };
  function join() {
    if (joined || !K.free()) return; const hoop = K.hoop; if (hoop) { hoop.cancel(); if (hoop.dribbling) hoop.toggleDribble(); }
    joined = true; joinedAt = performance.now(); st.game = 'rope'; count = 0; barN = -1; ang = Math.PI * 0.6; pause = 0.8;      // dây dừng trên cao một nhịp cho người chơi vào chỗ
    // màn dọc (điện thoại): góc nhìn ngang hẹp, đứng thẳng góc với dây thì một bạn quay bị khuất mép → quay chéo và lùi tầm nhìn (xin giàn máy quay mỗi khung ở update, không ghi đè st.dist của người chơi)
    tall = innerHeight > innerWidth * 1.2;
    player.teleport(cx, player.holder.position.y, cz, tall ? TALL_YAW : 0); player.holder.rotation.y = st.yaw; if (ctx.ui) ctx.ui.toast(R.join, 7);
  }
  function leave() { if (!joined) return; joined = false; if (st.game === 'rope') st.game = null; ui.progress('', null); if (ctx.ui) ctx.ui.toast(R.leave, 2); }
  function jump() { if (joined && st.grounded && !st.locked && !st.photo && !st.pinned) { st.vy = JUMP_V; st.grounded = false; air = true; } }
  /** dây vừa quét qua điểm thấp nhất: người chơi đang ở dưới dây mà chân chưa rời đất đủ cao thì vướng */
  function sweep() {
    if (ctx.audio && Math.hypot(player.pos.x - cx, player.pos.z - cz) < 16) ctx.audio.thud(0.16);
    if (!joined || Math.abs(player.pos.x - cx) > HIT_R || Math.abs(player.pos.z - cz) > 0.5) return;
    if (player.holder.position.y - ground >= CLEAR) {
      count++; K.fx.sound('tick', 1 + Math.min(12, count) * 0.05);      // qua dây: tiếng cao dần theo số cái
      if (count > rec.best) { if (!bragged && rec.best >= 3) { bragged = true; K.fx.sound('best'); K.fx.cheer(); if (ctx.ui) ctx.ui.toast(R.best, 1.6); } rec.best = count; save(); K.drawHud(); }
      if (count % 5 === 0) say(R.cheer); return;
    }
    if (ctx.ui) ctx.ui.toast(count ? K.fill(R.trip, { n: count }) : R.tripFirst, 2.2); say(R.oops); K.fx.sound('bad'); K.fx.oops(); K.fx.ring(player.pos.x, ground + 0.04, player.pos.z, 0xff6a5a, 0.7); count = 0; bragged = false; pause = TRIP_PAUSE; ang = Math.PI * 0.6;      // dây về lại trên cao rồi quay tiếp từ nhịp chậm
  }
  const it = { x: cx, y: 0.9, z: cz, r: 2.4, label: R.label, fn: join }; ctx.interact.push(it);
  K.addHud(() => (rec.best ? `🪢 ${rec.best}` : ''));
  K.touchDefs.push({ label: () => (joined ? R.tJump : ''), fn: jump }, { label: () => (joined ? R.tQuit : ''), fn: leave });
  addEventListener('keydown', (e) => {
    if (!joined || e.repeat || typing() || performance.now() - joinedAt < KEY_REST * 1000 || st.photo || st.locked || st.pinned) return;
    if (e.code === 'KeyE' || e.code === 'Escape') leave(); else if (e.code === 'Space') { e.preventDefault(); jump(); }
  });

  function update(dt) {
    it.r = joined ? 0 : 2.4;
    const far = Math.hypot(player.pos.x - cx, player.pos.z - cz);
    if (joined && (st.locked || st.photo || st.pinned || st.game !== 'rope' || far > LEAVE_R)) leave();
    if (joined && tall && ctx.cam) ctx.cam.askDist(TALL_DIST);      // ngừng xin (thôi chơi, thoát bất thường) là máy quay tự về khoảng lùi người chơi chọn
    if (far > ACTIVE_R) { rope.visible = false; return; }
    rope.visible = true; ground = turners[0].h.g.position.y;
    if (air && st.grounded) { air = false; K.fx.puff(player.pos.x, ground + 0.03, player.pos.z, 'dust', 3); }      // tiếp đất: chút bụi dưới chân
    if (pause > 0) pause -= dt;
    else { const prev = ang; ang += dt * Math.PI * 2 / period(); if (ang >= Math.PI * 2) { ang -= Math.PI * 2; sweep(); } else if (prev < Math.PI * 2 && ang >= Math.PI * 2) sweep(); }
    for (const a of turners) { a.gestTurn.ph = ang; a.h.gest = a.gestTurn; a.kick = far < 14 ? 0.011 : 0; }      // kick rất nhỏ: buộc actors cập nhật xương mọi khung khi người chơi ở gần, để đầu dây không giật theo nhịp tiết kiệm hoạt hoạ
    drawRope();
    if (joined) { if (count !== barN || rec.best !== barM) { barN = count; barM = rec.best; barText = K.fill(R.bar, { n: count, m: rec.best }); } ui.progress(barText, Math.min(1, count / Math.max(10, rec.best))); }      // chuỗi chữ chỉ dựng lại khi số đổi
  }
  return { update, join, leave, jump, turners, rec, get joined() { return joined; }, get count() { return count; }, get ang() { return ang; }, get period() { return period(); } };
}
