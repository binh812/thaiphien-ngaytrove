// Đá cầu điều khiển trực tiếp: quả cầu bay thật (trọng lực + cản lớn kiểu lông vũ), người chơi DI CHUYỂN tới dưới cầu rồi đá —
// F: đá má trong chuyền cho bạn · Space: tâng cao lên đầu mình (tự tâng tiếp được) · giữ F rồi thả: búng giật đi xa.
// Các bạn trong vòng tự chạy đón và đá lại, có sai số và có lúc đá hụt. Cầu chạm đất là mất lượt; đếm số chạm liên tiếp của cả vòng,
// kỷ lục lưu máy. Chân vung bằng trường kick của rigged.js.
import * as THREE from 'three';
import { Q } from '../engine/util.js';
import { typing } from './reunion_ui.js';

const RADIUS = 2.0, DRAG = 1.5, GRAV = 9.0, FOOT = 0.3, REACH = 1.25, REACH_LO = 0.06, REACH_HI = 1.5, KID_REACH = 0.8, KID_SPEED = 3.0;
// vận tốc đứng ban đầu (m/s): chuyền thấp, tâng cao, búng giật, và cú các bạn đá CHO NGƯỜI CHƠI (bay ~1,8 giây để kịp chạy tới)
const KICKS = { pass: 4.8, lob: 7.4, flick: 5.8, serve: 11.2 };
const FLICK_HOLD = 0.3, KICK_FADE = 3.2, RESTART = 1.4, ACTIVE_R = 45, LEAVE_R = 9, TO_PLAYER = 0.45, WILD = 0.1, KID_MISS = 0.12, MISS_FROM = 3, SELF_FWD = 0.25, BRAG_FROM = 3;

export function initCau(K) {
  const { ctx, ui, D, state, save, actors } = K, { player, scene } = ctx, st = player.st, C = D.CAU, [cx, cz] = C.at, tmp = new THREE.Vector3();
  const kids = C.looks.slice(0, Q.grass < 0.5 ? 2 : 3).map((look) => actors.add({ x: cx, y: 0.02, z: cz, f: 0 }, look, { face: { x: cx, z: cz }, vmax: KID_SPEED, show: 60, smile: 0.5 }));
  for (const a of kids) a.dest = { x: cx, z: cz };      // đích đi tới, dùng lại mỗi khung (không cấp phát)
  // quả cầu: đế tròn + chùm lông; vòng tròn nhỏ trên nền báo chỗ cầu sắp rơi (chỉ hiện khi người chơi đang trong vòng)
  const cau = new THREE.Group(); { const base = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })), fe = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8, 1, true).rotateX(Math.PI).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide })); cau.add(base, fe); } scene.add(cau);
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd66a, transparent: true, opacity: 0.7, depthWrite: false })); mark.visible = false; mark.userData.noBake = true; scene.add(mark);
  const p = new THREE.Vector3(cx, 1, cz), v = new THREE.Vector3(), land = { x: cx, z: cz }, ground = 0.02;
  let joined = false, joinedAt = 0, dead = 0.5, touches = 0, target = -1, chaser = -1, lastBy = -1, fDown = 0, flub = false, barN = -1, barM = -1, barText = '', drops = 0, bragged = false;      // target/chaser/lastBy: số thứ tự người trong vòng (kids.length = người chơi); flub: lượt này bạn đón sẽ đá hụt
  const ME = () => kids.length, N = () => kids.length + (joined ? 1 : 0);
  const home = (i) => { const a = i / N() * Math.PI * 2; return { x: cx + Math.sin(a) * RADIUS, z: cz + Math.cos(a) * RADIUS }; };
  const posOf = (i) => (i === ME() ? player.pos : kids[i].h.g.position);

  /* ----- đường bay: cản tuyến tính nên phương đứng và phương ngang độc lập, tính ngược được vận tốc ngang để rơi đúng chỗ ----- */
  function flightTime(y0, vy0) { let y = y0, vy = vy0, t = 0; for (; t < 6; t += 0.02) { vy += (-GRAV - DRAG * vy) * 0.02; y += vy * 0.02; if (vy < 0 && y <= ground + FOOT) break; } return t; }
  /** đá từ vị trí hiện tại của cầu tới điểm (tx, tz) với vận tốc đứng vy0; by = người đá, mine = cú này dành cho chính người chơi đón */
  function send(tx, tz, vy0, by, mine) {
    const T = flightTime(p.y, vy0), f = (1 - Math.exp(-DRAG * T)) / DRAG; v.set((tx - p.x) / f, vy0, (tz - p.z) / f); land.x = tx; land.z = tz; lastBy = by; touches++;
    // ai đón: người được nhắm; nếu điểm rơi lệch xa họ mà có bạn khác gần hơn thì bạn gần nhất chạy tới
    let best = -1, bd = 1e9; for (let i = 0; i < kids.length; i++) { if (i === by && N() > 2) continue; const g = kids[i].h.g.position, d = Math.hypot(g.x - tx, g.z - tz); if (d < bd) { bd = d; best = i; } }
    const meD = joined ? Math.hypot(player.pos.x - tx, player.pos.z - tz) : 1e9; chaser = mine || (joined && by !== ME() && meD < bd + 0.6) ? -1 : best;      // điểm rơi gần người chơi thì để người chơi đón
    flub = chaser >= 0 && touches >= MISS_FROM && Math.random() < KID_MISS;      // thỉnh thoảng các bạn cũng đá hụt (không hụt ngay mấy chạm đầu)
    if (ctx.audio && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 14) ctx.audio.thud(0.18);
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
  function kidKick(i) {
    kids[i].kick = 1; let to; do { to = Math.floor(Math.random() * N()); } while (to === i && N() > 1);
    if (joined && Math.random() < TO_PLAYER) to = ME();
    const q = posOf(to), mine = to === ME(), wild = mine ? 0.22 : Math.random() < WILD ? 1.3 : 0.28; target = to;      // đá cho người chơi thì cao, chậm và ít lệch
    send(q.x + gauss() * wild, q.z + gauss() * wild, mine ? KICKS.serve : Math.random() < 0.6 ? KICKS.lob : KICKS.pass, i, false);
  }
  /** người chơi đá: kind = 'pass' | 'lob' | 'flick'. Cầu phải ở trong tầm chân; chuyền/búng thì tới bạn đang nhìn tới (búng: bạn xa nhất), tâng thì lên đầu mình */
  function kick(kind) {
    if (!joined || st.photo || st.pinned || st.locked) return false; st.kick = 1;      // chân vẫn vung dù hụt; tiếng và hiệu ứng TRÚNG chỉ phát khi chạm cầu thật (bên dưới)
    const feet = player.holder.position.y, dx = p.x - player.pos.x, dz = p.z - player.pos.z, h = p.y - feet;
    if (dead > 0 || Math.hypot(dx, dz) > REACH || h < REACH_LO || h > REACH_HI) {      // đá hụt: tiếng gió và một chữ ngắn, tối đa hai lần mỗi giây
      if (K.fx.once('cauMiss', 0.5)) { if (ctx.audio) ctx.audio.whoosh(); ui.bubble(() => tmp.set(player.pos.x, player.pos.y + 1.05, player.pos.z), dead > 0 ? C.wait : C.miss, 0.7); }
      return false;
    }
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    if (kind === 'lob') { target = ME(); send(player.pos.x + fx * SELF_FWD, player.pos.z + fz * SELF_FWD, KICKS.lob, ME(), true); }      // rơi lại ngay trước mũi chân mình
    else {
      let best = 0, bs = -9;
      for (let i = 0; i < kids.length; i++) { const g = kids[i].h.g.position, ux = g.x - player.pos.x, uz = g.z - player.pos.z, l = Math.hypot(ux, uz) || 1, s = kind === 'flick' ? l : (ux * fx + uz * fz) / l; if (s > bs) { bs = s; best = i; } }
      const q = kids[best].h.g.position; target = best; send(q.x + dx * 0.9 + gauss() * 0.15, q.z + dz * 0.9 + gauss() * 0.15, KICKS[kind], ME(), false);
    }
    K.fx.sound(kind === 'pass' ? 'tok' : kind === 'lob' ? 'tokHi' : 'tokLong'); K.fx.ring(p.x, p.y, p.z, 0xffffff, kind === 'flick' ? 0.4 : 0.26, st.yaw);
    if (touches > state.cau) { if (!bragged && state.cau >= BRAG_FROM) { bragged = true; K.fx.sound('best'); K.fx.cheer(); if (ctx.ui) ctx.ui.toast(C.best, 2); } state.cau = touches; save(); K.drawHud(); }      // kỷ lục mới: báo một lần mỗi lượt
    if (touches % 5 === 0) say(C.cheer);
    return true;
  }
  const say = (list) => { const a = kids[Math.floor(Math.random() * kids.length)]; ui.bubble(() => actors.head(a, tmp), list[Math.floor(Math.random() * list.length)], 1.8); };
  function arrange() { kids.forEach((a, i) => { a.homeAt = home(i); }); }
  function join() {
    if (joined || !K.free('cau')) return;
    const hoop = K.hoop; if (hoop) { hoop.cancel(); if (hoop.dribbling) hoop.toggleDribble(); }      // đang nhồi/lấy lực bóng rổ: cầm bóng lên, cú dịch chuyển bên dưới sẽ thả bóng xuống
    joined = true; joinedAt = performance.now(); st.game = 'cau'; arrange();      // st.game: player.js thôi nhảy/đá/tương tác, vẫn cho đi lại
    const q = home(kids.length); player.teleport(q.x, player.holder.position.y, q.z, Math.atan2(cx - q.x, cz - q.z)); player.holder.rotation.y = st.yaw; touches = 0; barN = -1; if (ctx.ui) ctx.ui.toast(C.join, 7);
  }
  function leave() { if (!joined) return; joined = false; if (st.game === 'cau') st.game = null; st.kick = 0; fDown = 0; ui.progress('', null); mark.visible = false; arrange(); if (ctx.ui) ctx.ui.toast(C.leave, 2); }
  const it = { x: cx, y: 0.9, z: cz, r: 3.2, label: C.label, fn: join }; ctx.interact.push(it);
  K.addHud(() => (state.cau ? `🪶 ${state.cau}` : ''));
  K.touchDefs.push({ label: () => (joined ? C.tPass : ''), fn: () => kick('pass') }, { label: () => (joined ? C.tFlick : ''), fn: () => kick('flick') });
  addEventListener('keydown', (e) => {
    if (!joined || e.repeat || typing() || performance.now() - joinedAt < 300) return;      // phím E vừa dùng để vào chơi không tính là phím thôi chơi
    if (st.photo || st.pinned || st.locked) return;      // đang chụp ảnh (E/Space là phím bay của máy ảnh) hoặc bị giữ: không nhận phím của trò
    if (e.code === 'KeyE' || e.code === 'Escape') leave(); else if (e.code === 'Space') { e.preventDefault(); kick('lob'); } else if (e.code === 'KeyF') fDown = performance.now();
  });
  addEventListener('keyup', (e) => { if (e.code !== 'KeyF' || !joined || !fDown) return; const held = (performance.now() - fDown) / 1000; fDown = 0; kick(held >= FLICK_HOLD ? 'flick' : 'pass'); });      // F ngắn: má trong; giữ rồi thả: búng giật
  // mất sự kiện nhả phím (Alt-Tab, đổi thẻ, mất khoá chuột): bỏ cú đang giữ, không tự đá khi quay lại
  const dropHold = () => { fDown = 0; }; addEventListener('blur', dropHold); document.addEventListener('visibilitychange', dropHold); document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) dropHold(); });

  function update(dt) {
    for (const a of kids) if (a.kick) a.kick = Math.max(0, a.kick - dt * KICK_FADE);
    if (st.kick) st.kick = Math.max(0, st.kick - dt * KICK_FADE);
    it.r = joined ? 0 : 3.2;
    const far = Math.hypot(player.pos.x - cx, player.pos.z - cz);
    if (joined && (st.locked || st.photo || st.pinned || st.game !== 'cau' || far > LEAVE_R)) leave();      // đi ra xa, mở máy ảnh, hoặc bị kịch bản khác giữ: thôi chơi
    if (far > ACTIVE_R) { cau.visible = false; return; }
    cau.visible = true; if (!kids[0].homeAt) arrange();
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i], g = a.h.g.position, chase = dead <= 0 && i === chaser, to = chase ? land : a.homeAt;
      if (Math.hypot(to.x - g.x, to.z - g.z) > (chase ? 0.12 : 0.25)) { a.dest.x = to.x; a.dest.z = to.z; a.to = a.dest; } else a.to = null;
      if (chase && v.y < 0 && p.y - g.y < 0.95 && Math.hypot(p.x - g.x, p.z - g.z) < KID_REACH) { if (flub) { a.kick = 1; chaser = -1; } else kidKick(i); }      // đá hụt: vung chân mà không trúng, cầu rơi
    }
    if (joined) { if (touches !== barN || state.cau !== barM) { barN = touches; barM = state.cau; barText = K.fill(C.streak, { n: touches, m: state.cau }); } ui.progress(barText, Math.min(1, touches / Math.max(5, state.cau))); }      // chuỗi chữ chỉ dựng lại khi số đổi
    if (dead > 0) { dead -= dt; if (dead <= 0) { const i = Math.floor(Math.random() * kids.length), g = kids[i].h.g.position; p.set(g.x, g.y + 0.5, g.z); touches = 0; kidKick(i); touches = 0; } cau.position.copy(p); return; }      // phát cầu lại
    v.x += -DRAG * v.x * dt; v.z += -DRAG * v.z * dt; v.y += (-GRAV - DRAG * v.y) * dt; p.addScaledVector(v, dt);
    cau.position.copy(p); cau.rotation.set(Math.atan2(Math.hypot(v.x, v.z), -v.y) + Math.PI, Math.atan2(v.x, v.z), 0, 'YXZ');      // đế cầu chúi theo hướng bay
    if (p.y <= ground + 0.03) {      // chạm đất: mất lượt
      p.y = ground + 0.03; dead = RESTART; chaser = -1; drops++; bragged = false; K.fx.puff(p.x, ground + 0.04, p.z, 'dust', 6); if (joined) K.fx.sound('bad'); if (joined) { if (ctx.ui) ctx.ui.toast(K.fill(touches > 1 ? C.down : C.late, { n: touches }), 1.8); say(C.oops); } touches = 0; cau.rotation.set(Math.PI, 0, 0);
    }
    mark.visible = joined && dead <= 0; if (mark.visible) mark.position.set(land.x, ground + 0.03, land.z);
  }
  return { update, join, leave, kick, kids, get joined() { return joined; }, get touches() { return touches; }, get streak() { return touches; }, get holding() { return !!fDown; }, get drops() { return drops; }, get target() { return target; }, get lastBy() { return lastBy; }, vel: v, shuttle: p, land, tap: () => kick('lob') };
}
