// Sút bóng ở sân cỏ: lại gần quả bóng đá, GIỮ F để lấy lực (có thanh lực), thả ra để sút theo hướng nhìn — ngước máy lên thì bóng bổng hơn.
// Bóng qua vạch giữa hai cột, dưới xà là "Vào!". Khung thành phía tây có thủ môn chạy ngang đón bóng; bấm E ở chấm phạt đền để đá loạt 5 quả.
// Quả bóng vẫn là vật thể Rapier sẵn có (ctx.balls); ở đây chỉ đặt vận tốc lúc sút, thêm lưới chắn sau khung và đọc vị trí bóng để tính bàn.
import * as THREE from 'three';
import { G as GROUPS } from './physics.js';

const FIELD = [-48, -14, -46.8, -35], GOALS = [{ x: -47.6, dir: -1 }, { x: -14.4, dir: 1 }], GOAL_Z = [-42.9, -39], BAR_Y = 2, NET_DEPTH = 0.9;      // sân [x1, x2, z1, z2]; dir = phía sau khung
const CHARGE_SECS = 0.9, V_MIN = 6.5, V_MAX = 19, LOFT_MIN = 1.2, LOFT_MAX = 4.2, PITCH_LOFT = 7, REACH = 1.9, FRONT = 0.2, SLACK = 0.7;
const NET_WOBBLE = 0.7;
const CLEAR_R = 9, PARK = [-26, -37.5];
const SPOT = [-39.6, -40.95], SHOTS = 5, SHOT_WAIT = 3.2, RESET_WAIT = 1.3, LEAVE_R = 13, KEY_REST = 0.3;
const KEEP_X = -47.0, KEEP_V = 2.5, KEEP_REACT = 0.22, KEEP_R = 0.62, KEEP_H = 1.85, KEEP_Z = [-42.4, -39.5], SWAY = 0.9;
const KEEPER_LOOK = { gender: 'm', outfit: 'pe', age: 'teen', hair: 'short', skin: 1, face: 6, height: 1.75, build: 1 };
import { typing } from './reunion_ui.js';

export function initGoal(K) {
  const { ctx, ui, D, state, save, actors } = K, { player, phys, scene } = ctx, st = player.st, T = D.GOAL, rec = state.goal, tmp = new THREE.Vector3();
  const balls = (ctx.balls || []).filter(b => b.ball === 'soccer');
  let charge = null, pen = null, now = 0, hinted = false, penAt = 0, barK = -1, barN = -1, barText = '';      // pen = { left, made, wait, phase: 'aim' | 'fly' | 'reset', ball }
  const inField = (x, z, pad = 0) => x > FIELD[0] - pad && x < FIELD[1] + pad && z > FIELD[2] - pad && z < FIELD[3] + pad;

  /* ----- lưới sau khung: hình dây + ba tấm chắn để bóng vào lưới nằm lại ----- */
  { const mat = new THREE.MeshBasicMaterial({ color: 0xf4f4f0, wireframe: true, transparent: true, opacity: 0.55 }), w = GOAL_Z[1] - GOAL_Z[0], zc = (GOAL_Z[0] + GOAL_Z[1]) / 2;
    for (const g of GOALS) {
      const xc = g.x + g.dir * NET_DEPTH / 2, net = g.net = new THREE.Mesh(new THREE.BoxGeometry(NET_DEPTH, BAR_Y, w, 4, 6, 12), mat); net.position.set(xc, BAR_Y / 2, zc); net.userData.noBake = true; scene.add(net);
      const wall = (hx, hy, hz, x, y, z) => phys.world.createCollider(phys.RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(GROUPS.STATIC).setRestitution(0.05), phys.fixed);
      wall(0.03, BAR_Y / 2, w / 2, g.x + g.dir * NET_DEPTH, BAR_Y / 2, zc); wall(NET_DEPTH / 2, 0.03, w / 2, xc, BAR_Y + 0.03, zc);
      for (const z of GOAL_Z) wall(NET_DEPTH / 2, BAR_Y / 2, 0.03, xc, BAR_Y / 2, z);
    } }

  /* ----- thủ môn ----- */
  const keeper = actors.add({ x: KEEP_X, y: 0.02, z: (GOAL_Z[0] + GOAL_Z[1]) / 2, f: Math.PI / 2 }, KEEPER_LOOK, { face: Math.PI / 2, vmax: KEEP_V, show: 70 }), kDest = { x: KEEP_X, z: 0 };
  let react = 0, saved = 0;
  function tickKeeper(dt, live) {
    const g = keeper.h.g.position; let tz = (GOAL_Z[0] + GOAL_Z[1]) / 2 + Math.sin(now * 0.7) * SWAY;      // rảnh thì đảo qua đảo lại trước khung
    if (live) {
      const t = live.body.translation(), lv = live.body.linvel();
      if (lv.x < -1.5 && t.x > KEEP_X && t.x < -28) { react += dt; if (react > KEEP_REACT) tz = t.z + lv.z * Math.min(1.2, (t.x - KEEP_X) / -lv.x); } else react = 0;      // bóng đang lao về khung: đoán chỗ bóng tới (chậm một nhịp)
      // bắt bóng: bóng tới sát người thủ môn, trong tầm tay
      if (now > saved && t.x < KEEP_X + 0.45 && t.x > KEEP_X - 0.3 && Math.abs(t.z - g.z) < KEEP_R && t.y < KEEP_H && lv.x < -0.5) {
        saved = now + 1.5; live.body.setLinvel({ x: 2.5 + Math.random() * 2, y: 1.5, z: (Math.random() - 0.5) * 3 }, true); keeper.kick = 1;
        ui.bubble(() => actors.head(keeper, tmp), T.save[Math.floor(Math.random() * T.save.length)], 2); if (ctx.audio) ctx.audio.thud(0.6); K.fx.ring(t.x, t.y, t.z, 0xffffff, 0.45, Math.PI / 2); K.fx.sound('tokLong'); if (pen && pen.phase === 'fly') endShot(false, T.saved);
      }
    } else react = 0;
    tz = Math.max(KEEP_Z[0], Math.min(KEEP_Z[1], tz)); kDest.z = tz; keeper.to = Math.abs(tz - g.z) > 0.06 ? kDest : null;
    if (keeper.kick) keeper.kick = Math.max(0, keeper.kick - dt * 3);
  }

  /* ----- lấy lực và sút ----- */
  /** quả bóng đá trong tầm chân, phía trước mặt */
  function ballNear() {
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw), feet = player.holder.position.y; let best = null, bd = REACH;
    for (const b of balls) { if (pen && b !== pen.ball) continue; const t = b.body.translation(), dx = t.x - player.pos.x, dz = t.z - player.pos.z, d = Math.hypot(dx, dz); if (d < bd && Math.abs(t.y - feet) < 0.9 && (dx * fx + dz * fz) / (d + 1e-4) > FRONT) { bd = d; best = b; } }
    return best;
  }
  const power = () => Math.min(1, charge.t / CHARGE_SECS);
  function begin() {
    if (charge) return true;      // đang lấy lực: nhận luôn các sự kiện lặp phím F (player.js không lọc e.repeat), nếu không nó rơi xuống cú đá thường và làm hỏng cú sút
    if (!K.free('pen') || now - penAt < KEY_REST || (pen && pen.phase !== 'aim')) return false;
    if (!inField(player.pos.x, player.pos.z, 3)) return false; const b = ballNear(); if (!b) return false;
    charge = { t: 0, ball: b }; return true;
  }
  /** huỷ lấy lực, không sút. lost = huỷ vì bóng đã lăn khỏi chân: báo một tiếng và một dòng chữ (mất focus thì huỷ lặng lẽ) */
  function cancel(lost) { if (!charge) return; charge = null; ui.progress('', null); if (lost === true) { K.fx.sound('bad', 1.2); if (ctx.ui) ctx.ui.toast(T.lost, 1.8); } }
  const ballFar = (b) => { const t = b.body.translation(); return Math.hypot(t.x - player.pos.x, t.z - player.pos.z) > REACH + SLACK; };
  function shoot() {
    if (!charge) return; const p = power(), b = charge.ball; charge = null; ui.progress('', null); st.kick = 1;      // chân vung; campus_cau.js tự hạ dần st.kick
    if (ballFar(b)) { if (ctx.audio) ctx.audio.whoosh(); return; }      // bóng đã lăn khỏi tầm chân: sút hụt, chỉ có tiếng gió
    const v = V_MIN + (V_MAX - V_MIN) * p, up = LOFT_MIN + (LOFT_MAX - LOFT_MIN) * p + Math.max(0, -st.pitch) * PITCH_LOFT;
    b.body.wakeUp(); b.body.setLinvel({ x: Math.sin(st.yaw) * v, y: up, z: Math.cos(st.yaw) * v }, true); b.body.setAngvel({ x: Math.cos(st.yaw) * v * 2, y: 0, z: -Math.sin(st.yaw) * v * 2 }, true);
    b.shotAt = now; if (ctx.audio) ctx.audio.thud(0.5 + p * 0.5); { const t = b.body.translation(); K.fx.puff(t.x, 0.05, t.z, 'dust', 3 + Math.round(p * 5)); }
    if (pen && pen.ball === b) { pen.phase = 'fly'; pen.wait = SHOT_WAIT; }
  }
  st.kickHook = begin;      // player.js: phím F / nút cảm ứng gọi kick() → nếu có bóng đá trong tầm ở sân cỏ thì lấy lực thay cho cú đá thường
  addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && !typing() && pen && st.game === 'pen') begin(); });      // đang đá phạt đền (st.game) thì player.js không gọi kick()
  addEventListener('keyup', (e) => { if (e.code === 'KeyF') shoot(); });
  // mất sự kiện nhả phím (Alt-Tab, đổi thẻ, mất khoá chuột, hệ điều hành cắt chạm): huỷ, không tự sút
  addEventListener('blur', () => cancel()); document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); }); document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) cancel(); });
  { const tb = document.getElementById('tUse'); if (tb) { tb.addEventListener('touchstart', () => { if (pen && st.game === 'pen') begin(); }); tb.addEventListener('touchend', () => shoot()); tb.addEventListener('touchcancel', () => cancel()); } }

  /* ----- bàn thắng ----- */
  function scored(b, g) {
    rec.n++; save(); K.drawHud(); ui.sfx.clap(1.2, 5, 0.4); g.wob = NET_WOBBLE; { const t = b.body.translation(); K.fx.puff(t.x, Math.max(0.3, t.y), t.z, 'spark', 16); } K.fx.sound('good'); K.fx.cheer(); if (ctx.ui) ctx.ui.toast(K.fill(T.goal, { n: rec.n }), 2.5);
    const fan = ctx.people && ctx.people.byId('bong'); if (fan && fan.h.g.visible && !fan.script && Math.hypot(fan.h.g.position.x - b.body.translation().x, fan.h.g.position.z - b.body.translation().z) < 30 && !K.quiet()) { ui.bubble(K.headOf(fan), T.cheer[Math.floor(Math.random() * T.cheer.length)], 2.2); K.hush(2.6); }
    if (pen && pen.ball === b && pen.phase === 'fly' && g === GOALS[0]) endShot(true, T.penIn);
  }
  function tickBalls() {
    for (const b of balls) {
      const t = b.body.translation(), px = b.px ?? t.x; b.px = t.x;
      if (t.y < BAR_Y && t.z > GOAL_Z[0] && t.z < GOAL_Z[1]) for (const g of GOALS) if ((px - g.x) * g.dir <= 0 && (t.x - g.x) * g.dir > 0 && now - (b.goalAt || -9) > 2) { b.goalAt = now; scored(b, g); }
    }
  }

  /* ----- loạt phạt đền 5 quả ----- */
  function place(b) { b.body.setTranslation({ x: SPOT[0], y: 0.02 + b.r + 0.01, z: SPOT[1] }, true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); b.body.setAngvel({ x: 0, y: 0, z: 0 }, true); b.px = SPOT[0]; }
  function startPen() {
    if (pen || !balls.length || !K.free()) return; const hoop = K.hoop; if (hoop) { hoop.cancel(); if (hoop.dribbling) hoop.toggleDribble(); }
    pen = { left: SHOTS, made: 0, wait: 0, phase: 'aim', ball: balls[0] }; st.game = 'pen'; penAt = now;
    balls.forEach((b, i) => { if (b === pen.ball) return; const t = b.body.translation(); if (Math.hypot(t.x - SPOT[0], t.z - SPOT[1]) < CLEAR_R) { b.body.setTranslation({ x: PARK[0] + i * 0.6, y: 0.02 + b.r + 0.01, z: PARK[1] }, true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); b.px = PARK[0] + i * 0.6; } });      // quả bóng khác nằm quanh chấm: dời ra giữa sân kẻo vướng chân
    player.teleport(SPOT[0] + 1.3, player.holder.position.y, SPOT[1], -Math.PI / 2); player.holder.rotation.y = st.yaw; place(pen.ball); if (ctx.ui) ctx.ui.toast(T.penStart, 6);
  }
  function endShot(made, msg) {
    if (!pen || pen.phase !== 'fly') return; pen.left--; if (made) pen.made++; else { K.fx.sound('bad'); K.fx.oops(); } pen.phase = 'reset'; pen.wait = RESET_WAIT;
    if (ctx.ui) ctx.ui.toast(K.fill(msg, { n: pen.made, k: SHOTS - pen.left }), 2);
  }
  function stopPen(done) {
    if (!pen) return; const p = pen; pen = null; cancel(); if (st.game === 'pen') st.game = null; ui.progress('', null);
    if (done) { const best = p.made > rec.pen; if (best) { rec.pen = p.made; save(); K.fx.sound('best'); K.fx.cheer(); } if (ctx.ui) ctx.ui.toast(K.fill(best ? T.penBest : T.penEnd, { n: p.made, m: rec.pen }), 5); } else if (ctx.ui) ctx.ui.toast(T.penQuit, 2);
  }
  function tickPen(dt) {
    if (!pen) return;
    if (st.locked || st.photo || st.pinned || st.game !== 'pen' || Math.hypot(player.pos.x - SPOT[0], player.pos.z - SPOT[1]) > LEAVE_R) { stopPen(false); return; }
    if (pen.phase === 'fly') { pen.wait -= dt; const t = pen.ball.body.translation(), lv = pen.ball.body.linvel(); if (pen.wait <= 0 || !inField(t.x, t.z, 2.5) || (pen.wait < SHOT_WAIT - 1 && Math.hypot(lv.x, lv.z) < 0.4)) endShot(false, T.penOut); }
    if (pen.phase === 'reset') { pen.wait -= dt; if (pen.wait <= 0) { if (pen.left <= 0) { stopPen(true); return; } place(pen.ball); pen.phase = 'aim'; } }
    if (!charge) { if (pen.left !== barK || pen.made !== barN) { barK = pen.left; barN = pen.made; barText = K.fill(T.penBar, { k: Math.min(SHOTS, SHOTS - pen.left + 1), n: pen.made }); } ui.progress(barText, (SHOTS - pen.left) / SHOTS); }
  }
  const spot = { x: SPOT[0], y: 0.9, z: SPOT[1], r: 2.2, label: T.penLabel, fn: startPen }; ctx.interact.push(spot);
  { const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.position.set(SPOT[0], 0.035, SPOT[1]); dot.userData.noBake = true; scene.add(dot); }
  addEventListener('keydown', (e) => { if (pen && !e.repeat && !typing() && now - penAt > KEY_REST && !st.photo && !st.locked && (e.code === 'KeyE' || e.code === 'Escape')) stopPen(false); });

  K.addHud(() => (rec.n ? `⚽ ${rec.n}` : ''));
  K.touchDefs.push({ label: () => (pen ? T.tQuit : ''), fn: () => stopPen(false) });
  function update(dt) {
    now += dt; spot.r = pen ? 0 : 2.2;
    const near = inField(player.pos.x, player.pos.z, 25); keeper.off = !near; if (!near) { if (pen) stopPen(false); cancel(); return; }
    if (!hinted && inField(player.pos.x, player.pos.z) && K.idle() && !st.game) { hinted = true; if (ctx.ui) ctx.ui.toast(T.hint, 6); }
    if (charge) { if (!K.free('pen')) cancel(); else if (ballFar(charge.ball)) cancel(true); else {      // đã lấy lực thì quay người/quay máy thoải mái; chỉ huỷ khi bóng rời xa
      charge.t += dt; ui.progress(T.power, power()); } }
    let live = null; for (const b of balls) if (now - (b.shotAt ?? -9) < 4) live = b;
    tickKeeper(dt, live); tickBalls(); tickPen(dt);
    for (const g of GOALS) if (g.wob > 0) { g.wob = Math.max(0, g.wob - dt); const k = K.fx.reduced ? 0 : Math.sin(g.wob * 28) * g.wob * 0.18; g.net.scale.set(1 + k, 1 - k * 0.3, 1); }      // lưới rung khi bóng vào
  }
  return { update, begin, shoot, cancel, startPen, stopPen, keeper, balls, rec, goals: GOALS, get charging() { return !!charge; }, get pen() { return pen; } };
}
