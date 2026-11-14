// Trò tay chân ở sân trường: ném dép khều xoài (R), ngồi ghế (C), máy bay giấy, sổ đầu bài ở mọi phòng học.
// Dép và máy bay giấy tự mô phỏng bằng vài phép tính (không qua Rapier): chỉ cần quỹ đạo nhìn vui mắt, không cần va chạm với vật khác.
import * as THREE from 'three';
import { floorY } from './people.js';

const TREE_R = 7, CANOPY_Y = 4.0, SANDALS = 2, PICK_R = 1.1, THROW_SECS = 0.6, P_HIT = 0.55, P_STUCK = 0.15;      // ném dép: tầm đứng, cao độ tán, số dép, tầm nhặt, thời gian bay, xác suất
const SEAT_R = 1.3, BENCH_H = 0.46, ROW_GAP = 1.15, BENCH_U = 0.92, BENCH_W = [[-6.3, -3.3], [-11.65, -8.65]];     // ngồi: tầm với ghế, cao mặt ghế đá, bố trí ghế băng trong lớp (xem furnishClass)
const FOLD_SECS = 1.5, PLANE_V = 8, PLANE_LIFE = 14, PLANE_REST = 25, PLANE_MAX = 8, PLANE_MIN = 2, BOOK_KEEP = 14, BOOK_LEN = 90;
const typing = () => { const a = document.activeElement; return !!a && /INPUT|SELECT|TEXTAREA/.test(a.tagName); };

export function initPlay(K) {
  const { ctx, ui, D, state, save } = K, { player, phys, scene } = ctx, st = player.st, tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const feetY = () => player.holder.position.y;
  const down = (x, y, z) => floorY(phys, x, y, z);

  /* ===== ném dép khều xoài ===== */
  const mango = ctx.mango, sandals = [];
  let have = SANDALS;
  if (mango) {
    const geo = new THREE.BoxGeometry(0.11, 0.035, 0.27), mats = [0x2f6fd0, 0x2f6fd0].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
    for (let i = 0; i < SANDALS; i++) { const m = new THREE.Mesh(geo, mats[i]); m.castShadow = true; m.visible = false; scene.add(m); sandals.push({ m, mode: 'hand', t: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), vy: 0, out: '' }); }
    mango.onShake.push(() => { for (const s of sandals) if (s.mode === 'stuck') { s.mode = 'fall'; s.vy = 0; } });
    K.addHud(() => `🥭 ${state.mango}  ·  🩴 ${have}`);
    addEventListener('keydown', (e) => { if (e.code === 'KeyR' && !e.repeat && !typing() && K.idle() && nearTree()) throwSandal(); });
  }
  const nearTree = () => mango && Math.hypot(player.pos.x - mango.x, player.pos.z - mango.z) < TREE_R && feetY() < 1;
  /** lời bình của bạn học sinh đứng gần cây (nếu có và ở gần), không thì hiện thông báo */
  function comment(list) {
    const s = list[Math.floor(Math.random() * list.length)], n = ctx.people && ctx.people.byId('xoai');
    if (n && n.h.g.visible && Math.hypot(n.h.g.position.x - player.pos.x, n.h.g.position.z - player.pos.z) < 14) ui.bubble(K.headOf(n), s, 3.5); else if (ctx.ui) ctx.ui.toast(s, 3);
  }
  function throwSandal() {
    const s = sandals.find(x => x.mode === 'hand'); if (!s) { if (ctx.ui) ctx.ui.toast(D.SANDAL.none, 2.5); return; }
    have--; K.drawHud(); s.mode = 'fly'; s.t = 0; s.m.visible = true; s.a.set(player.pos.x, player.pos.y + 0.5, player.pos.z);
    const r = Math.random(); s.out = r < P_HIT ? 'hit' : r < P_HIT + P_STUCK ? 'stuck' : 'miss';
    const ang = Math.random() * 6.283, rad = s.out === 'miss' ? 2.4 + Math.random() : Math.random() * 1.5;      // trượt thì bay vọt ra ngoài tán
    s.b.set(mango.x + Math.cos(ang) * rad, CANOPY_Y + (Math.random() - 0.5) * 0.8, mango.z + Math.sin(ang) * rad); if (ctx.audio) ctx.audio.whoosh();
  }
  function tickSandals(dt) {
    if (!mango) return;
    for (const s of sandals) {
      const p = s.m.position;
      if (s.mode === 'fly') {
        s.t += dt / THROW_SECS; const k = Math.min(1, s.t); p.lerpVectors(s.a, s.b, k); p.y += Math.sin(k * Math.PI) * 0.9; s.m.rotation.x += dt * 14; s.m.rotation.z += dt * 5;
        if (k < 1) continue;
        if (s.out === 'hit') { const n = mango.drop(1 + Math.floor(Math.random() * 3), true); if (n) { comment(D.SANDAL.hit); if (ctx.audio) ctx.audio.rustle(); } else if (ctx.ui) ctx.ui.toast(D.SANDAL.bare, 2.5); }
        else comment(D.SANDAL[s.out]);
        s.mode = s.out === 'stuck' ? 'stuck' : 'fall'; s.vy = 0; s.m.rotation.set(0.3, Math.random() * 6, 0.2);
      } else if (s.mode === 'fall') {
        s.vy -= 9.8 * dt; p.y += s.vy * dt; s.m.rotation.x += dt * 6;
        const fy = down(p.x, Math.max(0.2, p.y), p.z) ?? (p.y < 0.6 ? 0 : null);      // rơi tới mặt nền bên dưới (kể cả mặt bồn cây)
        if (fy !== null && p.y <= fy + 0.03) { p.y = fy + 0.03; s.mode = 'ground'; s.m.rotation.set(0, Math.random() * 6, 0); }
        else if (p.y < -1) { p.y = 0.03; s.mode = 'ground'; }
      } else if (s.mode === 'ground' && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < PICK_R && Math.abs(p.y - feetY()) < 1.2) {
        s.mode = 'hand'; s.m.visible = false; have++; K.drawHud(); if (ctx.ui) ctx.ui.toast(D.SANDAL.back, 1.8);
      }
    }
    // đếm xoài nhặt được: quả nào người chơi cầm lên lần đầu (chuột trái) thì tính
    const held = st.held && st.held.body.userData; if (held && held.set === mango.set && !held.counted) { held.counted = true; state.mango++; save(); K.drawHud(); }
  }

  /* ===== ngồi tự do (C) ===== */
  let sitting = null;      // { x, z, back: Vector3 chỗ đứng trước khi ngồi }
  /** ghế gần nhất trong tầm: ghế đá ngoài trời (B.seats) hoặc ghế băng của phòng học đang đứng → { x, y (nền), z, f } */
  function seatNear() {
    const p = player.pos, y = feetY(); let best = null, bd = SEAT_R;
    const take = (x, fy, z, f, o) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bd && Math.abs(fy - y) < 0.6) { bd = d; best = { x, y: fy, z, f, ...o }; } };
    for (const fn of K.seatFns) fn(take);      // module khác góp ghế: ghế nhựa (campus_food.js), gốc cây quanh lửa trại (campus_night.js)
    for (const s of ctx.B.seats || []) take(s.x, s.y - BENCH_H, s.z, s.f);
    const r = K.roomAt();
    if (r) for (let j = 0; j < 5; j++) for (const [wa] of BENCH_W) for (const dw of [0.5, 1.5, 2.5]) { const q = r.P(r.rw - 1.6 - (4 - j) * ROW_GAP + BENCH_U, wa + dw); take(q.x, r.y0, q.z, r.toBoard); }
    return best;
  }
  function sit(s) {
    sitting = { ...s, clip: s.clip || 'sit_idle', back: player.pos.clone() }; st.pinned = true; st.pinBy = 'seat'; st.clip = sitting.clip; st.pose = null;
    if (s.stool) phys.pcol.setEnabled(false); if (s.it) s.it.occupied = true; st.armsDown = !!s.stool;      // ghế đang có người ngồi: không nhấc, không đá được (player.js); ngồi ghế thấp thì hạ tay      // ghế nhựa là vật thể động: tắt va chạm của người chơi kẻo ghế bị hất văng
    const f = s.f ?? player.holder.rotation.y; player.pos.set(s.x, s.y + phys.HH + phys.R, s.z); player.holder.rotation.y = f; st.yaw = f;
  }
  function release() { if (sitting && sitting.it) sitting.it.occupied = false; sitting = null; st.armsDown = false; phys.pcol.setEnabled(true); }
  function toggleSit() { if (!st.started || st.locked) return; if (sitting) stand(); else if (!st.photo && !st.pinned) { const s = seatNear(); if (s) sit(s); } }
  function stand() {
    if (!sitting) return; const b = sitting.back; release(); st.pinned = false; st.pinBy = null; st.clip = null;
    player.pos.copy(b); phys.pbody.setTranslation(player.pos, true); phys.world.propagateModifiedBodyPositionsToColliders();
  }
  addEventListener('keydown', (e) => {
    if (e.repeat || typing() || !st.started || st.locked) return;
    if (e.code === 'KeyC') toggleSit(); else if (sitting && !st.photo && /^(KeyW|KeyA|KeyS|KeyD|Arrow\w+|Space)$/.test(e.code)) stand();
  });
  function tickSit() {
    if (sitting && sitting.it) { const t = sitting.it.body.translation(); if (Math.hypot(t.x - sitting.x, t.z - sitting.z) > 0.25 || Math.abs(t.y - 0.15 - sitting.y) > 0.2) stand(); }      // ghế dưới chân bị dời (bóng đẩy, ai xô): đứng dậy
    if (sitting && (!st.pinned || Math.hypot(player.pos.x - sitting.x, player.pos.z - sitting.z) > 0.3)) { release(); if (st.pinBy === 'seat') { st.clip = null; st.pinned = false; st.pinBy = null; } }      // nhả ghim nếu chính việc ngồi đã ghim (tiết học ghim thì để tiết học nhả)      // bị dịch chuyển (bản đồ M) hoặc kịch bản khác lấy quyền ghim
    K.setHint(!K.idle() ? '' : sitting ? D.SIT.up : nearTree() && have ? D.SANDAL.hint + (seatNear() ? '   ' + D.SIT.hint : '') : seatNear() ? D.SIT.hint : '');
  }

  /* ===== máy bay giấy ===== */
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.22, -0.13, 0.025, -0.16, 0, 0, -0.16, 0, 0, 0.22, 0, 0, -0.16, 0.13, 0.025, -0.16, 0, 0, 0.22, 0, 0, -0.16, 0, -0.055, -0.16], 3)); planeGeo.computeVertexNormals();
  const planeMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf4, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x333330 });
  const hand = new THREE.Mesh(planeGeo, planeMat); hand.position.set(0.3, 1.12, 0.28); hand.visible = false; player.holder.add(hand);
  const planes = []; let fold = 0, holding = false;
  for (const r of K.rooms) { const q = r.P(r.rw - 3.4, -7.5), it = { x: q.x, y: r.y0 + 0.8, z: q.z, r: 2, label: D.PLANE.label, fn: () => { if (!K.idle() || holding || fold) return; if (st.held) { if (ctx.ui) ctx.ui.toast(D.PLANE.busy, 3); return; } if (K.lock('plane')) fold = 0.001; } }; ctx.interact.push(it); r.paperIt = it; }
  function launch() {
    if (!holding || !K.idle()) return; holding = false; hand.visible = false; st.handUse = null;
    let pl = planes.find(x => !x.m.visible); if (!pl) { if (planes.length >= PLANE_MAX) pl = planes.reduce((a, b) => (a.t > b.t ? a : b)); else { pl = { m: new THREE.Mesh(planeGeo, planeMat), v: new THREE.Vector3(), from: new THREE.Vector3() }; pl.m.castShadow = true; scene.add(pl.m); planes.push(pl); } }
    const d = player.viewDir(tmp); pl.m.visible = true; pl.m.position.set(player.pos.x + d.x * 0.5, player.pos.y + 0.7, player.pos.z + d.z * 0.5); pl.from.copy(pl.m.position);
    pl.v.set(d.x, Math.max(-0.2, d.y) + 0.12, d.z).normalize().multiplyScalar(PLANE_V); pl.t = 0; pl.landed = 0; pl.drop = false; pl.seed = Math.random() * 6; if (ctx.audio) ctx.audio.whoosh();
  }
  function tickPlanes(dt) {
    if (fold) {      // đang gấp: thanh tiến độ 1,5 giây
      fold += dt; ui.progress(D.PLANE.folding, fold / FOLD_SECS);
      if (fold >= FOLD_SECS) { fold = 0; ui.progress('', null); K.unlock('plane'); holding = true; hand.visible = true; st.handUse = launch; K.drawHud(); if (ctx.ui) ctx.ui.toast(D.PLANE.ready, 4); }
    }
    hand.visible = holding && !st.fp;
    for (const r of K.rooms) r.paperIt.r = holding || fold ? 0 : 2;
    for (const pl of planes) {
      if (!pl.m.visible) continue; const p = pl.m.position, v = pl.v;
      if (pl.landed) { pl.landed += dt; if (pl.landed > PLANE_REST) pl.m.visible = false; continue; }
      pl.t += dt; const sp = Math.hypot(v.x, v.z), stall = pl.drop || sp < 2.5 || pl.t > PLANE_LIFE;
      v.y += (stall ? -6 : -2.1 + Math.sin(pl.t * 2.2 + pl.seed) * 1.4) * dt; v.multiplyScalar(1 - 0.32 * dt);                 // lực nâng gần cân trọng lực, chòng chành nhẹ; hết đà thì chúi xuống
      const bank = Math.sin(pl.t * 0.9 + pl.seed) * 0.45 * dt, c = Math.cos(bank), s = Math.sin(bank), vx = v.x * c - v.z * s; v.z = v.x * s + v.z * c; v.x = vx;      // lượn trái phải
      const len = v.length() * dt, hit = len > 1e-5 && phys.cast(p, tmp2.copy(v).normalize(), len + 0.12, 0xffff0001);
      if (hit || p.y < -2) {
        p.addScaledVector(tmp2, hit ? Math.max(0, hit.toi - 0.05) : 0); const under = phys.cast({ x: p.x, y: p.y - 0.04, z: p.z }, { x: 0, y: -1, z: 0 }, 40, 0xffff0001), fy = under ? p.y - 0.04 - under.toi : null;      // nền thật bên dưới (dò xa: máy bay có thể đang sát trần)
        if (hit && !pl.drop && (fy === null || p.y - fy > 0.4)) { pl.drop = true; v.set(-v.x * 0.08, -1.5, -v.z * 0.08); continue; }      // đâm tường/trần ở trên cao: bật ra rồi rơi xuống sàn
        pl.landed = 0.001; if (fy !== null && p.y - fy < 0.5) p.y = fy + 0.03; pl.m.rotation.set(0, Math.atan2(v.x, v.z), 0.5);
        const far = Math.hypot(p.x - pl.from.x, p.z - pl.from.z);
        if (far >= PLANE_MIN) { state.planes++; save(); K.drawHud(); if (ctx.ui) ctx.ui.toast(K.fill(D.PLANE.flew, { n: state.planes, d: Math.round(far) }), 3.5); } else if (ctx.ui) ctx.ui.toast(D.PLANE.short, 3);      // chuyến dưới 2 m không tính
        continue;
      }
      p.addScaledVector(v, dt); pl.m.lookAt(tmp.copy(p).add(v));
    }
  }
  K.addHud(() => (state.planes || holding ? `✈ ${state.planes}` : ''));

  /* ===== sổ đầu bài ở mọi phòng học ===== */
  const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; };
  /** các dòng của một cuốn sổ: ba dòng có sẵn (theo tên phòng) + dòng người chơi đã ghi, lấy 14 dòng gần nhất */
  function bookLines(key) { const S = D.BOOK.seed, h = hash(key), seed = [0, 1, 2].map(i => ({ d: '—', t: S[(h + i * 3) % S.length] })); return [...seed, ...(state.book[key] || [])].slice(-BOOK_KEEP); }
  function addBookLine(key, text) {
    let cs = Array.from(String(text).replace(/\s+/g, ' ').trim()); if (!cs.length) return false;
    if (cs.length > BOOK_LEN) { cs = cs.slice(0, BOOK_LEN - 1); const sp = cs.lastIndexOf(' '); if (sp > BOOK_LEN * 0.6) cs = cs.slice(0, sp); cs.push('…'); }      // dài quá: cắt ở ranh từ, thêm dấu ba chấm
    const t = cs.join('');
    const now = new Date(), d = `${now.getDate()}/${now.getMonth() + 1}`; state.book[key] = [...(state.book[key] || []), { d, t }].slice(-BOOK_KEEP); save(); return true;
  }
  let modal = null;
  function openBook(r) {
    if (modal || !K.idle() || !K.lock('book')) return; if (document.pointerLockElement) document.exitPointerLock();
    modal = ui.el('div', 'rvModal clBook'); const box = ui.el('div', 'box'), list = ui.el('ol'), inp = ui.el('input'), add = ui.el('button', 'primary', D.BOOK.add), close = ui.el('button', null, D.BOOK.close), row = ui.el('div', 'row');
    inp.type = 'text'; inp.maxLength = BOOK_LEN; inp.placeholder = D.BOOK.placeholder; inp.autocomplete = 'off';
    const draw = () => { list.textContent = ''; for (const l of bookLines(r.key)) { const li = ui.el('li'); li.append(ui.el('span', 'd', l.d), ui.el('span', 't', l.t)); list.appendChild(li); } list.scrollTop = list.scrollHeight; };
    const write = () => { if (addBookLine(r.key, inp.value)) { inp.value = ''; ui.sfx.ting(); draw(); } };
    const shut = () => { modal.remove(); modal = null; K.unlock('book'); };
    add.addEventListener('click', write); close.addEventListener('click', shut); inp.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') write(); else if (e.code === 'Escape') shut(); });
    row.append(inp, add); box.append(ui.el('h2', null, D.BOOK.title), ui.el('div', 'rvSub', 'Phòng ' + r.nm), list, row, close); modal.appendChild(box); ui.stopEv(modal); ui.root.appendChild(modal); draw();
  }
  for (const r of K.rooms) { const q = r.P(1.75, -7.6); ctx.interact.push({ x: q.x, y: r.y0 + 0.8, z: q.z, r: 1.3, label: D.BOOK.label + r.nm, fn: () => openBook(r) }); }

  return { update(dt) { tickSandals(dt); tickSit(); tickPlanes(dt); }, throwSandal, sandals, seatNear, sit, stand, launch, openBook, addBookLine, bookLines,
    get sitting() { return !!sitting; }, get seat() { return sitting; }, get holding() { return holding; }, get have() { return have; }, planes, fold: () => { if (K.idle() && !holding && !fold && K.lock('plane')) fold = 0.001; },
    toggleSit, tryThrow: () => { if (K.idle() && nearTree()) throwSandal(); }, canThrow: () => nearTree() && have > 0 };
}
