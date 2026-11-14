// Nhóm đá cầu ở sân: ba học sinh đứng vòng tròn tâng cầu qua lại; người chơi bấm E để vào đá cùng — cầu tới thì bấm Space đúng lúc.
// Quả cầu bay theo đường cong định sẵn giữa hai người (không qua vật lý); người nhận đưa chân bằng trường kick của rigged.js.
import * as THREE from 'three';
import { Q } from '../engine/util.js';

const RADIUS = 1.7, FOOT_Y = 0.32, ARC = 1.5, FLY = [0.85, 1.15], PLAYER_FLY = 1.15, WIN_FROM = 0.7, EARLY_FROM = 0.4, KICK_FADE = 3.2, RESTART = 1.4, ACTIVE_R = 40;

export function initCau(K) {
  const { ctx, ui, D, state, save, actors } = K, { player, scene } = ctx, st = player.st, C = D.CAU, [cx, cz] = C.at, tmp = new THREE.Vector3();
  const spot = (i, n) => { const a = i / n * Math.PI * 2; return { x: cx + Math.sin(a) * RADIUS, z: cz + Math.cos(a) * RADIUS }; };
  const kids = C.looks.slice(0, Q.grass < 0.5 ? 2 : 3).map((look, i, all) => { const p = spot(i, all.length); return actors.add({ x: p.x, y: 0.02, z: p.z, f: 0 }, look, { face: { x: cx, z: cz }, vmax: 1.6, show: 60, smile: 0.5 }); });
  // quả cầu: đế tròn + chùm lông
  const cau = new THREE.Group(); { const base = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })), fe = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8, 1, true).rotateX(Math.PI).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide })); cau.add(base, fe); } scene.add(cau);
  let joined = false, from = 0, to = 1, k = 0, dur = 1, dead = 0, streak = 0, joinedAt = 0, pressed = false;      // dead > 0: cầu rơi, chờ phát lại
  const N = () => kids.length + (joined ? 1 : 0), ME = () => kids.length;      // người chơi là "người thứ N" trong vòng
  const posOf = (i, out) => { if (i === ME()) return out.set(player.pos.x, player.holder.position.y + FOOT_Y, player.pos.z); const g = kids[i].h.g.position; return out.set(g.x, g.y + FOOT_Y, g.z); };
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  function pass(src) { from = src; do { to = Math.floor(Math.random() * N()); } while (to === from); k = 0; pressed = false; dur = to === ME() ? PLAYER_FLY : FLY[0] + Math.random() * (FLY[1] - FLY[0]); }
  function arrange() { const n = N(); kids.forEach((a, i) => { const p = spot(i, n); a.to = { x: p.x, z: p.z }; }); }
  const say = (list) => { const a = kids[Math.floor(Math.random() * kids.length)]; ui.bubble(() => actors.head(a, tmp), list[Math.floor(Math.random() * list.length)], 1.8); };
  function miss(msg) { streak = 0; dead = RESTART; if (ctx.ui) ctx.ui.toast(msg, 1.6); say(C.oops); }

  function join() {
    if (joined || !K.idle() || !K.lock('cau')) return; joined = true; joinedAt = performance.now(); arrange();
    const p = spot(kids.length, N()); player.teleport(p.x, player.holder.position.y, p.z, Math.atan2(cx - p.x, cz - p.z)); player.holder.rotation.y = st.yaw; streak = 0; if (ctx.ui) ctx.ui.toast(C.join, 5);
  }
  function leave() { if (!joined) return; joined = false; K.unlock('cau'); st.kick = 0; ui.progress('', null); arrange(); if (to >= N() || from >= N()) pass(0); if (ctx.ui) ctx.ui.toast(C.leave, 2); }
  const it = { x: cx, y: 0.9, z: cz, r: 2.8, label: C.label, fn: join }; ctx.interact.push(it);
  K.addHud(() => (state.cau ? `🪶 ${state.cau}` : ''));
  addEventListener('keydown', (e) => {
    if (!joined || e.repeat || performance.now() - joinedAt < 300) return;      // phím E vừa dùng để vào chơi không được tính là phím thôi chơi
    if (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'KeyQ') { leave(); return; }
    if (e.code !== 'Space' || to !== ME() || dead > 0 || pressed) return; e.preventDefault();
    if (k < EARLY_FROM) return;                                   // cầu còn xa: bỏ qua, chưa tính
    pressed = true;
    if (k < WIN_FROM) { miss(C.early); return; }
    st.kick = 1; streak++; say(C.cheer); if (ctx.audio) ctx.audio.thud(0.25);
    if (streak > state.cau) { state.cau = streak; save(); K.drawHud(); if (streak > 1 && ctx.ui) ctx.ui.toast(K.fill(C.record, { n: streak }), 2); }
    pass(ME());
  });

  function update(dt) {
    for (const a of kids) if (a.kick) a.kick = Math.max(0, a.kick - dt * KICK_FADE);
    if (st.kick) st.kick = Math.max(0, st.kick - dt * KICK_FADE);
    it.r = joined ? 0 : 2.8;
    if (joined && (st.locked !== 'cau' || Math.hypot(player.pos.x - cx, player.pos.z - cz) > RADIUS + 2)) leave();      // bị kịch bản khác kéo đi
    if (Math.hypot(player.pos.x - cx, player.pos.z - cz) > ACTIVE_R) { cau.visible = false; return; }
    cau.visible = true;
    if (dead > 0) { dead -= dt; cau.position.y = Math.max(0.03, cau.position.y - dt * 4); if (dead <= 0) pass(Math.floor(Math.random() * kids.length)); return; }
    if (from >= N() || to >= N()) pass(0);
    k += dt / dur; posOf(from, a3); posOf(to, b3); const q = Math.min(1, k);
    cau.position.lerpVectors(a3, b3, q); cau.position.y += Math.sin(q * Math.PI) * ARC; cau.rotation.x += dt * 9;
    if (joined) ui.progress(to === ME() ? (k >= WIN_FROM ? C.now : C.coming) + '  ·  ' + K.fill(C.streak, { n: streak, m: state.cau }) : K.fill(C.streak, { n: streak, m: state.cau }), to === ME() ? q : 0);
    if (to !== ME() && k > 0.8) kids[to].kick = Math.min(1, (kids[to].kick || 0) + dt * 9);      // người nhận đưa chân đón
    if (k < 1) return;
    if (to === ME()) { miss(C.late); return; }
    kids[to].kick = 1; if (ctx.audio && Math.hypot(player.pos.x - cx, player.pos.z - cz) < 12) ctx.audio.thud(0.15); pass(to);
  }
  pass(0);
  return { update, join, leave, kids, get joined() { return joined; }, get streak() { return streak; }, get flight() { return { to, me: ME(), k, dead }; }, tap: () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })) };
}
