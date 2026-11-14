// Không khí ngày hội, chạy độc lập với tiến trình: văn nghệ trên sân khấu + khán giả vỗ tay theo đợt, và các nhóm hội khoá khác
// lặp chu trình xếp hàng → tạo dáng → đếm 1-2-3 → chớp máy → tản ra cười nói. Dữ liệu ở SHOW và GROUPS trong reunion_data.js.
import * as THREE from 'three';

const STAGE = { x: 46.0, y: 0.83, z: -0.3, face: -Math.PI / 2 };      // tâm đội hình trên sân khấu, quay mặt về khán giả (phía tây)
const FAR_SHOW = 60;      // nhân vật nền chỉ hiện trong 60 m (bạn cùng lớp: 90 m)
const GAP = 0.72, COUNT_STEP = 0.8, HOLD = 1.3, RELAX = 9, HEAR = 30;      // vai–vai trong hàng chụp; nhịp đếm; giữ dáng sau chớp; thời gian tản ra; tầm nghe (m)
const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function initFest(R) {
  const { ctx, ui, actors, D } = R, { player } = ctx, tmp = new THREE.Vector3();
  const vol = (x, z) => Math.max(0, 1 - Math.hypot(player.pos.x - x, player.pos.z - z) / HEAR);

  /* ----- văn nghệ ----- */
  const S = D.SHOW, cast = S.performers.slice(0, R.low ? 3 : 4).map((look, i) => actors.add({ x: STAGE.x, y: STAGE.y, z: STAGE.z + S.figures[0].f[i][1], f: STAGE.face }, { smile: 0.5, ...look }, { vmax: 1.1, smile: 0.6, show: FAR_SHOW }));
  const crowd = S.audience.slice(0, R.low ? 3 : 6).map((c) => actors.add({ x: c.x, y: 0.02, z: c.z, f: Math.PI / 2 }, c.look, { face: { x: STAGE.x, z: STAGE.z - 2 }, show: FAR_SHOW }));
  let fig = -1, figT = 0, cheerT = 0;
  function show(dt) {
    figT -= dt;
    if (figT <= 0) {
      fig = (fig + 1) % S.figures.length; const F = S.figures[fig]; figT = F.s;
      cast.forEach((a, i) => { a.to = { x: STAGE.x + F.f[i][0], z: STAGE.z + F.f[i][1], y: STAGE.y }; a.pose = F.p[i]; });
      if (fig % 2 === 0) {      // hết một cặp động tác: khán giả vỗ tay một đợt
        cheerT = 2.4; crowd.forEach((a, i) => { if ((i + fig) % 3 !== 1) a.pose = 'cheer'; a.smile = 0.8; }); ui.sfx.clap(2.2, crowd.length + 2, 0.45 * vol(38, -5));
      }
    }
    if (cheerT > 0) { cheerT -= dt; if (cheerT <= 0) for (const a of crowd) { a.pose = null; a.smile = null; } }
  }

  /* ----- các nhóm hội khác ----- */
  const flash = new THREE.PointLight(0xffffff, 0, 10, 1.6); ctx.scene.add(flash);      // một đèn dùng chung cho mọi lần chớp (thêm bớt đèn làm three biên dịch lại vật liệu)
  function attachPhone(a) {
    a.h.ready.then(() => {
      const hand = a.h.rig && a.h.rig.bones.RightHand; if (!hand) return;      // không có mô hình có xương (?people=0) thì thôi máy ảnh
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.012), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.35, metalness: 0.4 }));
      m.position.set(0, 0.09, 0.03); hand.add(m);
    });
  }
  const groups = D.GROUPS.slice(0, R.low ? 1 : D.GROUPS.length).map((def) => {
    const [ax, az] = def.at, f = def.f, fx = Math.sin(f), fz = Math.cos(f), rx = fz, rz = -fx, n = def.members.length - 1;
    const slot = (i, m = n) => ({ x: ax + rx * (i - (m - 1) / 2) * GAP, z: az + rz * (i - (m - 1) / 2) * GAP });
    const members = def.members.map((look, i) => { const p = i < n ? slot(i) : { x: def.cam[0], z: def.cam[1] }; return actors.add({ x: p.x, y: def.y, z: p.z, f: i < n ? f : f + Math.PI }, { smile: 0.4, ...look }, { vmax: 1.2, show: FAR_SHOW }); });
    const g = { def, posers: members.slice(0, n), shooter: members[n], slot, phase: 'gather', t: 0, n: 0, shot: 0, helping: false, front: { x: ax + fx * 1.3, z: az + fz * 1.3 }, hi: 0 };
    attachPhone(g.shooter);
    g.it = { x: ax + fx * 1.6, y: def.y + 0.8, z: az + fz * 1.6, r: 3.2, label: 'Chào nhóm ' + def.nm, fn: () => greet(g) }; ctx.interact.push(g.it);
    return g;
  });
  const headOf = (a) => () => actors.head(a, tmp);
  function setPhase(g, phase) { g.phase = phase; g.t = 0; g.n = 0; }
  function fire(g, from) {
    flash.position.copy(from); flash.intensity = 45; ui.sfx.shutter(0.6 * vol(g.def.at[0], g.def.at[1])); ui.bubble(from.clone(), '📸 Tách!', 1.2);
  }
  /** chu trình của một nhóm; khi người chơi chụp giúp (g.helping) thì người chơi là người cầm máy */
  function cycle(g, dt) {
    const { def, posers, shooter } = g, camAt = g.helping ? { x: player.pos.x, z: player.pos.z } : { x: def.cam[0], z: def.cam[1] }, lens = g.helping ? 'player' : actors.head(shooter, g.lens || (g.lens = new THREE.Vector3()));
    g.t += dt;
    if (g.phase === 'gather') {
      posers.forEach((a, i) => { a.to = g.slot(i); a.face = camAt; a.look = null; a.pose = null; a.clip = null; a.smile = 0.5; });
      if (!g.helping) { shooter.to = { x: def.cam[0], z: def.cam[1] }; shooter.face = { x: def.at[0], z: def.at[1] }; shooter.holding = false; shooter.clip = null; shooter.look = null; }
      if (g.t > 1 && (posers.every(a => !a.speed) && (g.helping || !shooter.speed) || g.t > 8)) { setPhase(g, 'pose'); if (!g.helping) ui.bubble(headOf(shooter), def.calls[g.shot % def.calls.length], 2); }
    } else if (g.phase === 'pose') {
      const set = def.poses[g.shot % def.poses.length]; posers.forEach((a, i) => { a.pose = set[i % set.length]; a.look = lens; a.smile = 0.85; }); if (!g.helping) shooter.holding = true;
      if (g.helping) { const a = shooter; a.pose = 'peace'; a.look = lens; a.smile = 0.85; a.face = camAt; }
      if (g.t > 2.2) setPhase(g, 'count');
    } else if (g.phase === 'count') {
      if (g.t >= g.n * COUNT_STEP && g.n < 3) {
        g.n++; const s = g.n < 3 ? g.n + '…' : '3!';
        if (g.helping) { if (ctx.ui) ctx.ui.toast('Bạn đếm: ' + s, 1); } else ui.bubble(headOf(shooter), s, COUNT_STEP + 0.2, 'big');      // người chơi cầm máy (góc nhìn thứ nhất) thì không có đầu ai để gắn chữ
      }
      if (g.t >= 3 * COUNT_STEP) { fire(g, g.helping ? tmp.set(player.pos.x, player.pos.y + 0.7, player.pos.z) : actors.head(shooter, tmp)); setPhase(g, 'hold'); }
    } else if (g.phase === 'hold') {
      if (g.t > HOLD) { g.shot++; if (g.helping) setPhase(g, 'helped'); else if (g.shot % 2) setPhase(g, 'gather'); else setPhase(g, 'relax'); if (g.phase === 'gather') ui.bubble(headOf(shooter), def.calls[1 % def.calls.length], 2); }
    } else if (g.phase === 'relax') {
      if (g.n === 0) {      // vừa tản ra: mỗi người một chỗ lỏng lẻo phía trước hàng, người cầm máy lại gần khoe ảnh
        g.n = 1; posers.forEach((a, i) => { const s = g.slot(i), k = 0.6 + ((i * 7 + g.shot * 3) % 5) * 0.28, side = ((i * 5 + g.shot) % 3 - 1) * 0.35; a.to = { x: s.x + Math.sin(def.f) * k + Math.cos(def.f) * side, z: s.z + Math.cos(def.f) * k - Math.sin(def.f) * side }; a.pose = null; a.face = g.front; a.look = null; a.smile = 0.7; a.clip = i % 2 ? null : 'talk'; });
        shooter.holding = false; shooter.to = { x: g.front.x + Math.sin(def.f) * 1.1, z: g.front.z + Math.cos(def.f) * 1.1 }; shooter.face = g.front; shooter.clip = 'talk'; shooter.smile = 0.7;
        ui.bubble(headOf(posers[g.shot % posers.length]), def.chat[(g.shot >> 1) % def.chat.length], 3);
      }
      if (g.t > RELAX) setPhase(g, 'gather');
    }
  }

  /* ----- chào hỏi, chụp giúp ----- */
  async function greet(g) {
    if (R.busy || g.helping || !R.lock(true)) return; R.busy = true; const def = g.def;
    try {
      await ui.dialog.say(def.nm, R.fill(def.hello[g.hi++ % def.hello.length]));
      if (!R.state.helped[def.id]) { const i = await ui.dialog.choose(def.nm, R.fill(def.ask), ['Để tôi chụp cho cả nhóm', 'Chào mọi người rồi đi tiếp']); if (i === 0) await help(g); }
    } finally { ui.dialog.close(); R.lock(false); R.busy = false; }
  }
  /** đổi chỗ với người cầm máy một lần: người chơi đứng vào chỗ máy (góc nhìn thứ nhất), người cầm máy vào hàng, đếm, chớp, cảm ơn */
  async function help(g) {
    const def = g.def, st = player.st, back = { x: player.pos.x, y: player.holder.position.y, z: player.pos.z, yaw: st.yaw, pitch: st.pitch, fp: st.fp }, sh = g.shooter, y = sh.h.g.position.y;
    ui.dialog.close(); await ui.fade(true);
    player.teleport(def.cam[0], y, def.cam[1], def.f + Math.PI); st.pitch = 0.02; st.fp = true;
    const old = g.slot, s0 = (i) => old(i, g.posers.length + 1), s = s0(g.posers.length);      // hàng thêm một chỗ cho người vốn cầm máy
    g.slot = s0; g.posers.forEach((a, i) => { const p = s0(i); actors.place(a, p.x, a.h.g.position.y, p.z, def.f + Math.PI); }); actors.place(sh, s.x, y, s.z, def.f + Math.PI); sh.holding = false; sh.clip = null; sh.to = null;
    g.helping = true; g.shot = 0; setPhase(g, 'gather'); await ui.fade(false);
    while (g.phase !== 'helped') await wait(100);      // chu trình chạy trong vòng lặp game; ở đây chỉ chờ nó tới bước chụp xong
    R.state.helped[def.id] = true; R.save(); await ui.dialog.say(def.nm, R.fill(def.thanks));
    ui.dialog.close(); await ui.fade(true);
    g.helping = false; g.slot = old; sh.pose = null; actors.place(sh, def.cam[0], y, def.cam[1], def.f + Math.PI); setPhase(g, 'relax');
    player.teleport(back.x, back.y, back.z, back.yaw); st.pitch = back.pitch; st.fp = back.fp; await ui.fade(false);
  }

  function update(dt) {
    show(dt);
    if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - dt * 260);
    for (const g of groups) cycle(g, dt);
  }
  return { update, groups, cast, crowd };
}
