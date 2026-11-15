// Bóng rổ thật tay hơn: đang cầm bóng thì GIỮ chuột trái (hoặc Space) để lấy lực — có thanh lực và chuỗi chấm dự đoán đường bay — thả ra để ném;
// phím B nhồi bóng khi đi; vào rổ tính 2 điểm (ngoài vạch 6,75 m là 3), có chuỗi liên tiếp, kỷ lục, lưới rung; bấm E dưới rổ để thi "ném 60 giây";
// bóng văng xa thì người đứng gần ném trả. Quả bóng vẫn là vật thể Rapier sẵn có (ctx.balls); ở đây chỉ đặt vận tốc lúc ném và đọc sự kiện vào rổ.
import * as THREE from 'three';
import { typing } from './reunion_ui.js';

const CHARGE_SECS = 1.5, V_MIN = 5.2, V_MAX = 11.5, LOFT = 2.4, DOTS = 14, DOT_DT = 0.085, DAMP = 0.12, G = 9.81;
const THREE_PT = 6.75, MODE_SECS = 60, RETURN_AFTER = 2.0, RETURN_FAR = 5, HELPER_R = 18, PASS_SECS = 1.15, HINT_GAP = 40;
const RIM_DV = 3, RIM_R = 0.95, AIM_FAR = 8;
const AIM_NEAR = 1.0, AIM_GOOD = 0.2, AIM_STEP = 0.01, AIM_SPAN = 10, AIM_TURN = 0.0125, AIM_TURNS = 4, AIM_SECS = 2.4, KEY_REST = 0.25, TOP_Y = 2.6, DEAD_V = 0.5;      // trợ ngắm: lệch tâm rổ dưới 1 m thì chỉnh lực ngang tối đa ±10% và hướng tối đa ±2,9°; chấm xanh khi sẽ vào
const DRIB_SIDE = 0.3, DRIB_FWD = 0.3, DRIB_H = 0.8, DRIB_HZ = 5.2;

export function initHoop(K) {
  const { ctx, ui, D, state, save } = K, { player, scene } = ctx, st = player.st, H = D.HOOP, tmp = new THREE.Vector3(), v3 = new THREE.Vector3();
  const rec = state.hoop;
  const heldBall = () => (st.held && st.held.body.userData && st.held.body.userData.ball === 'basket' ? st.held.body : null);
  let charge = null, drib = null, last = null, streak = 0, mode = null, hintAt = -HINT_GAP, now = 0, busyAt = -1, missRun = 0;      // last = quả vừa ném: { body, from, t, scored, missed }

  /* ----- chấm dự đoán đường bay ----- */
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85, depthWrite: false }), DOTS);
  dots.visible = false; dots.frustumCulled = false; dots.userData.noBake = true; scene.add(dots); const mat = new THREE.Matrix4();
  const power = () => Math.min(1, charge.t / CHARGE_SECS);
  /** vận tốc ném theo hướng nhìn và mức lực p (0..1) */
  /**
   * Hướng ném ngang nhắm vào ĐÚNG chỗ hồng tâm đang chỉ: máy quay đứng lệch vai (lúc ngắm rổ còn lệch thêm) nên tia ngắm và tia từ quả bóng
   * song song chứ không trùng nhau; cho hai tia gặp nhau ở tầm rổ gần nhất phía trước (không có rổ thì 8 m) để đặt hồng tâm lên rổ là bóng tới rổ.
   */
  function launchVel(p, out) {
    const d = player.viewDir(tmp), v = V_MIN + (V_MAX - V_MIN) * p, c = ctx.camera.position, b = heldBall(), hl = Math.hypot(d.x, d.z) || 1; let hx = d.x / hl, hz = d.z / hl;
    if (b && !st.fp) {
      const t = b.translation(); let L = AIM_FAR;
      for (const q of ctx.hoops || []) { const along = (q.x - c.x) * hx + (q.z - c.z) * hz, off = Math.abs((q.x - c.x) * hz - (q.z - c.z) * hx); if (along > 1.5 && along < 14 && off < 2.5 && along < L) L = along; }
      const ax = c.x + hx * L - t.x, az = c.z + hz * L - t.z, al = Math.hypot(ax, az); if (al > 0.5) { hx = ax / al; hz = az / al; }
    }
    return out.set(hx * hl * v, d.y * v + LOFT * (0.7 + 0.3 * p), hz * hl * v);
  }
  const vd = new THREE.Vector3(), COL_AIM = new THREE.Color(0x7dff8a), COL_DOT = new THREE.Color(0xffe9a8);
  /** bay thử từ t0 với vận tốc v (trọng lực + cản như Rapier): khoảng lệch ngang nhỏ nhất so với tâm một rổ lúc bóng đi XUỐNG qua mặt vành; 9 nếu không qua */
  function arcMiss(t0, v, k, rot) {
    const c = Math.cos(rot), sn = Math.sin(rot); let x = t0.x, y = t0.y, z = t0.z, vx = (v.x * c + v.z * sn) * k, vy = v.y, vz = (v.z * c - v.x * sn) * k, best = 9; const h = DOT_DT / 3;
    for (let t = 0; t < AIM_SECS; t += h) {
      const y0 = y; vy -= G * h; const f = 1 - DAMP * h; vx *= f; vy *= f; vz *= f; x += vx * h; y += vy * h; z += vz * h;
      if (vy < 0) for (const q of ctx.hoops || []) if (y0 >= q.y && y < q.y) { const d = Math.hypot(x - q.x, z - q.z); if (d < best) best = d; }
      if (y < 0.3) break;
    }
    return best;
  }
  /** trợ ngắm nhẹ: nếu đường bay đã đi gần rổ thì tìm hệ số lực ngang và góc lệch nhỏ cho bóng rơi sát tâm vành nhất → { k, rot, miss } */
  const turn = (v, a) => { const c = Math.cos(a.rot), sn = Math.sin(a.rot), x = (v.x * c + v.z * sn) * a.k; v.z = (v.z * c - v.x * sn) * a.k; v.x = x; return v; };
  function assist(t0, v) {
    let k = 1, rot = 0, miss = arcMiss(t0, v, 1, 0); if (miss > AIM_NEAR) return { k, rot, miss };
    for (let j = -AIM_TURNS; j <= AIM_TURNS; j++) for (let i = -AIM_SPAN; i <= AIM_SPAN; i++) { const m = arcMiss(t0, v, 1 + i * AIM_STEP, j * AIM_TURN); if (m < miss - 1e-4) { miss = m; k = 1 + i * AIM_STEP; rot = j * AIM_TURN; } }
    return { k, rot, miss };
  }
  function drawDots(body) {
    const t0 = body.translation(), v = vd.copy(launchVel(power(), v3)), aim = assist(t0, v); let x = t0.x, y = t0.y, z = t0.z; turn(v, aim);
    for (let i = 0; i < DOTS; i++) { for (let s = 0; s < 3; s++) { const h = DOT_DT / 3; v.y -= G * h; v.multiplyScalar(1 - DAMP * h); x += v.x * h; y += v.y * h; z += v.z * h; } mat.makeTranslation(x, y, z); dots.setMatrixAt(i, mat); }      // tích phân như Rapier: trọng lực + cản tuyến tính của quả bóng
    dots.instanceMatrix.needsUpdate = true; dots.visible = true; dots.material.color.copy(aim.miss < AIM_GOOD ? COL_AIM : COL_DOT);      // chấm xanh: thả bây giờ là vào
  }
  // vừa xong một câu thoại/kịch bản thì chờ một nhịp: cùng lần bấm Space đóng thoại không được tính là bắt đầu lấy lực
  /** src = 'pointer' (chuột/chạm, mặc định — player.js gọi st.handUse không tham số) hoặc 'key' (Space): chỉ đúng nguồn đã bắt đầu mới nhả được */
  function begin(src = 'pointer') { if (!charge && heldBall() && K.free() && now - busyAt > KEY_REST) { charge = { t: 0, src }; K.fx.sound('tick'); } }
  const startByHand = () => begin('pointer');
  /** huỷ lấy lực, KHÔNG ném (mất chuột/phím giữa chừng, bị kịch bản khác giữ) */
  function cancel() { if (!charge) return; charge = null; dots.visible = false; ui.progress('', null); }
  function release(src) {
    if (!charge || (src && charge.src && src !== charge.src)) return; const body = heldBall(), p = power(); charge = null; dots.visible = false; ui.progress('', null); if (!body) return;
    const v = launchVel(p, v3); turn(v, assist(body.translation(), v)); body.setGravityScale(1, true); body.setLinvel({ x: v.x, y: v.y, z: v.z }, true); body.setAngvel({ x: -6 * Math.cos(st.yaw), y: 0, z: 6 * Math.sin(st.yaw) }, true);      // xoáy ngược như ném rổ thật
    st.held = null; st.gest = { type: 'shoot', t: 0, dur: 0.75 }; last = { body, from: player.pos.clone(), t: 0, scored: false, missed: false, top: false }; if (ctx.audio) ctx.audio.whoosh();
  }
  addEventListener('mouseup', (e) => { if (e.button === 0) release('pointer'); });
  addEventListener('keydown', (e) => {
    if (e.repeat || typing() || !K.free()) return;
    if (e.code === 'Space' && drib) { e.preventDefault(); toggleDribble(); begin('key'); }      // đang nhồi mà bấm Space: cầm bóng lên và lấy lực luôn
    else if (e.code === 'Space' && heldBall()) { e.preventDefault(); begin('key'); } else if (e.code === 'KeyB') toggleDribble();
  });
  addEventListener('keyup', (e) => { if (e.code === 'Space') release('key'); });
  // mất sự kiện nhả (Alt-Tab, đổi thẻ, mất khoá chuột, hệ điều hành cắt chạm): huỷ lấy lực chứ không ném
  addEventListener('blur', cancel); document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) cancel(); });
  { const tb = document.getElementById('tThrow'); if (tb) { tb.addEventListener('touchend', () => release('pointer')); tb.addEventListener('touchcancel', cancel); } }

  /* ----- nhồi bóng ----- */
  function toggleDribble() {
    if (drib) { st.held = { body: drib.body }; st.heldT = 0; drib = null; dropGest(); return; }      // cầm bóng lên lại
    const body = heldBall(); if (!body || charge || !K.free()) return; drib = { body, ph: 0, beat: 0 }; st.held = null; body.setGravityScale(0, true); st.gest = dribGest; dribGest.t = 0;
  }
  const dribAt = new THREE.Vector3(), dribGest = { type: 'drib', t: 0, dur: Infinity, ph: 0, at: null, r: 0.12 }, dropGest = () => { if (st.gest === dribGest) st.gest = null; };      // bàn tay phải theo bóng suốt lúc nhồi
  function tickDribble(dt) {
    if (!drib) { dropGest(); return; }
    if (st.locked || st.pinned || st.photo || st.held || st.game) { const b = drib.body; drib = null; dropGest(); b.setGravityScale(1, true); return; }      // bị kịch bản khác giữ, hoặc tay đã cầm thứ khác: thả bóng
    const yaw = player.holder.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), feet = player.holder.position.y;
    drib.ph += dt * (DRIB_HZ + st.speed * 1.3); const up = Math.abs(Math.cos(drib.ph)), beat = Math.floor(drib.ph / Math.PI + 0.5);
    dribAt.set(player.pos.x + fx * DRIB_FWD - fz * DRIB_SIDE, feet + 0.13 + up * DRIB_H, player.pos.z + fz * DRIB_FWD + fx * DRIB_SIDE);      // bên tay PHẢI (trước đây đặt nhầm sang trái trong khi tay phải nhồi)
    drib.body.setTranslation(dribAt, true); drib.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    dribGest.ph = drib.ph; dribGest.at = dribAt; if (st.gest !== dribGest && !st.gest) st.gest = dribGest;      // dribGest.at → rigged.js: bàn tay phải bám theo đỉnh bóng
    if (beat !== drib.beat) { drib.beat = beat; if (ctx.audio) ctx.audio.bounce(0.35); const t = drib.body.translation(); K.fx.puff(t.x, feet + 0.03, t.z, 'dust', 2); }      // mỗi lần chạm đất một tiếng và chút bụi
  }

  /* ----- vào rổ, trượt, ném trả ----- */
  const nets = (ctx.hoops || []).map((h) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.13, 0.42, 12, 3, true), new THREE.MeshBasicMaterial({ color: 0xf4f4f0, wireframe: true, transparent: true, opacity: 0.8 })); m.position.set(h.x, h.y - 0.22, h.z); m.userData.noBake = true; scene.add(m); return { h, m, w: 0 }; });
  ctx.hoopHit = (ball, h) => {
    const net = nets.find(q => q.h === h); if (net) net.w = 0.7; if (ctx.audio) ctx.audio.swish();
    if (!last || last.body !== ball.body || last.scored) { if (ctx.ui) ctx.ui.toast(H.other, 2); return; }
    const far = Math.hypot(last.from.x - h.x, last.from.z - h.z), pts = far >= THREE_PT ? 3 : 2; last.scored = true; last.t = 0; streak++;
    rec.pts += pts; if (streak > rec.best) rec.best = streak; if (mode) mode.pts += pts; save(); K.drawHud();
    missRun = 0; K.fx.puff(h.x, h.y - 0.25, h.z, 'spark', pts === 3 ? 18 : 12); K.fx.ring(h.x, h.y, h.z, 0xffe08a, 0.55); K.fx.sound(pts === 3 ? 'best' : 'good'); K.fx.cheer();
    if (ctx.ui) ctx.ui.toast(K.fill(pts === 3 ? H.three : H.two, { n: streak, d: far.toFixed(1) }), 3);
  };
  /** người có thể ném trả: hai bạn bóng rổ của people.js hoặc bạn cùng lớp đang ở gần quả bóng */
  function helperNear(x, z) {
    let best = null, bd = HELPER_R;
    for (const id of ['ro1', 'ro2']) { const n = ctx.people && ctx.people.byId(id); if (!n || !n.h.g.visible) continue; const d = Math.hypot(n.h.g.position.x - x, n.h.g.position.z - z); if (d < bd) { bd = d; best = { at: K.headOf(n), kind: 'young' }; } }
    const r = ctx.reunion; if (r && (r.mode === 'follow' || r.mode === 'hang')) for (const sl of r.present()) { const g = sl.a.h.g.position, d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = { at: () => r.actors.head(sl.a, tmp), kind: 'mate' }; } }
    return best;
  }
  function passBack(body, helper) {
    const t = body.translation(), p = player.pos, dx = p.x - t.x, dz = p.z - t.z, dy = p.y + 0.2 - t.y, f = (1 - Math.exp(-DAMP * PASS_SECS)) / DAMP;      // có cản tuyến tính: quãng đi được = v0·f
    body.wakeUp(); body.setLinvel({ x: dx / f, y: (dy + G * PASS_SECS / DAMP) / f - G / DAMP, z: dz / f }, true);
    if (helper) ui.bubble(helper.at, H.pass[helper.kind][Math.floor(Math.random() * H.pass[helper.kind].length)], 2.2);
  }
  function tickLast(dt) {
    if (!last) return; last.t += dt; const t = last.body.translation(), lv = last.body.linvel(); if (t.y > TOP_Y) last.top = true;
    // chạm bảng/vành: vận tốc đổi đột ngột khi bóng đang ở sát rổ (trọng lực mỗi khung chỉ đổi ~0,2 m/s)
    if (last.pv && !last.scored && Math.hypot(lv.x - last.pv.x, lv.y - last.pv.y, lv.z - last.pv.z) > RIM_DV) for (const q of ctx.hoops || []) if (Math.hypot(t.x - q.x, t.y - q.y, t.z - q.z) < RIM_R && K.fx.once('rim', 0.2)) { K.fx.sound('rim'); K.fx.puff(t.x, t.y, t.z, 'spark', 3); }
    (last.pv || (last.pv = { x: 0, y: 0, z: 0 })).x = lv.x; last.pv.y = lv.y; last.pv.z = lv.z;
    // trượt: chạm đất, hoặc đã lên tới tầm rổ rồi rơi xuống dưới vành mà không vào, hoặc nằm yên trên chỗ cao (ghế, bục)
    if (!last.scored && !last.missed && last.t > 0.5 && (t.y < 0.45 || (last.top && lv.y < 0 && t.y < TOP_Y - 0.6) || (last.t > 1.2 && Math.hypot(lv.x, lv.y, lv.z) < DEAD_V))) { last.missed = true; last.t = 0; if (++missRun >= 2 && K.guide) K.guide.nudge(); K.fx.sound('bad', 0.9); if (t.y < 0.45) K.fx.puff(t.x, 0.05, t.z, 'dust', 4); if (ctx.ui) ctx.ui.toast(streak > 1 ? K.fill(H.miss, { n: streak }) : H.missOne, 1.6); streak = 0; }      // chạm đất mà chưa vào rổ: mất chuỗi
    if (!(last.scored || last.missed) || last.t < RETURN_AFTER) { if (last.t > 12) last = null; return; }
    const far = Math.hypot(t.x - player.pos.x, t.z - player.pos.z), helper = helperNear(t.x, t.z);
    if (far > RETURN_FAR && far < 45 && (helper || mode) && !st.held && !drib) passBack(last.body, helper);      // thi 60 giây thì luôn có người nhặt hộ
    last = null;
  }

  /* ----- thi ném 60 giây ----- */
  function toggleMode() {
    if (mode) { endMode(); return; } if (!K.free()) return;
    mode = { t: MODE_SECS, pts: 0 }; streak = 0; if (ctx.ui) ctx.ui.toast(H.modeStart, 4);
  }
  function endMode() { const m = mode; mode = null; ui.progress('', null); const best = m.pts > rec.best60; if (best) { rec.best60 = m.pts; save(); K.drawHud(); K.fx.sound('best'); K.fx.cheer(); } if (ctx.ui) ctx.ui.toast(K.fill(best ? H.modeBest : H.modeEnd, { n: m.pts, m: rec.best60 }), 5); }
  const items = (ctx.hoops || []).map((h) => { const it = { x: h.x, y: 0.9, z: h.z, r: 2.6, label: H.mode, fn: toggleMode }; ctx.interact.push(it); return it; });

  K.addHud(() => (rec.pts ? `🏀 ${rec.pts}` : ''));
  K.touchDefs.push({ label: () => (drib ? H.tPick : heldBall() && !charge ? H.tDribble : ''), fn: toggleDribble });
  function update(dt) {
    now += dt; const ball = heldBall();
    // tay đang cầm bóng rổ: chuột trái là "bắt đầu lấy lực" (player.js gọi st.handUse khi bấm chuột); đang nhồi bóng thì chuột trái là cầm bóng lên
    if (drib) st.handUse = toggleDribble; else if (ball) st.handUse = startByHand; else if (st.handUse === startByHand || st.handUse === toggleDribble) st.handUse = null;
    if (st.locked || ui.dialog.open) busyAt = now;
    if (charge) { if (!ball || !K.free()) cancel(); else { charge.t += dt; drawDots(ball); ui.progress(H.power, power()); } }
    st.aim = charge ? power() : null;      // rigged.js: dáng lấy lực (hai tay đưa bóng lên trước trán, gối khuỵu theo lực); player.js: bóng nằm trong tay
    tickDribble(dt); tickLast(dt);
    for (const q of nets) if (q.w > 0) { q.w = Math.max(0, q.w - dt); const k = Math.sin(q.w * 30) * q.w * 0.35; q.m.scale.set(1 + k * 0.4, 1 - k, 1 + k * 0.4); }      // lưới rung khi bóng lọt
    for (const it of items) it.label = mode ? H.modeStop : H.mode;
    if (mode && st.game) endMode();      // vào trò khác (đá cầu, nhảy dây…) thì thôi thi ném — hai thanh tiến độ không chồng nhau
    if (mode) { mode.t -= dt; if (!charge) ui.progress(K.fill(H.modeBar, { s: Math.ceil(mode.t), n: mode.pts }), mode.t / MODE_SECS); if (mode.t <= 0) endMode(); }
  }
  return { update, begin, release, cancel, toggleDribble, toggleMode, get charging() { return !!charge; }, get dribbling() { return !!drib; }, get streak() { return streak; }, get mode() { return mode; }, get last() { return last; }, rec,
    /** cho phép thử: độ lệch dự đoán ở mức lực p, và ném ngay ở mức lực p */
    probe: { miss: (p) => { const b = heldBall(); if (!b) return null; charge = { t: p * CHARGE_SECS }; const r = assist(b.translation(), vd.copy(launchVel(p, v3))); charge = null; return r; }, throwAt: (p) => { if (!heldBall()) return false; charge = { t: p * CHARGE_SECS }; release(); return true; } } };
}
