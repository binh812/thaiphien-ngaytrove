// Trò tay chân ở sân trường: ném dép khều xoài (R), ngồi ghế (C), máy bay giấy, sổ đầu bài ở mọi phòng học.
// Dép và máy bay giấy tự mô phỏng bằng vài phép tính (không qua Rapier): chỉ cần quỹ đạo nhìn vui mắt, không cần va chạm với vật khác.
import * as THREE from 'three';
import { floorY } from './people.js';
import { setAnimFocus, PLANE_RELEASE } from './rigged.js';

const SANDAL_WIND = 0.2, TREE_R = 7, CANOPY_Y = 4.0, SANDALS = 2, PICK_R = 1.1, THROW_SECS = 0.6, P_HIT = 0.55, P_STUCK = 0.15;      // ném dép: tầm đứng, cao độ tán, số dép, tầm nhặt, thời gian bay, xác suất
const SEAT_R = 1.3, BENCH_H = 0.46, ROW_GAP = 1.15, BENCH_U = 0.92, BENCH_W = [[-6.3, -3.3], [-11.65, -8.65]];     // ngồi: tầm với ghế, cao mặt ghế đá, bố trí ghế băng trong lớp (xem furnishClass)
const PRE_TURN = 2.3, PRE_SPEED = 0.7, PRE_MIN = 0.3, PRE_REST = 0.15, POST_MIN = 0.2, POST_SPEED = 0.55;      // PRE_REST: đứng yên chừng này sau khi xoay xong rồi mới ngồi (bàn chân bước cho xong); POST_SPEED: tốc độ bước về chỗ cũ sau khi đứng dậy;      // trước khi ngồi: tốc độ xoay người (rad/s) và bước tới ghế (m/s) tối đa, quãng ngắn nhất (giây); sau khi đứng dậy: quãng bước về chỗ cũ ngắn nhất
const SIT_IN = 1.3, SIT_OUT = 1.03, SIT_MOVE = 0.45;      // giây: động tác ngồi xuống / đứng dậy khi chưa đọc được độ dài clip sit_down, stand_up (bình thường lấy độ dài clip thật, xem clipSecs), thời gian trượt người giữa chỗ đứng và mặt ghế
const SEAT_MOVE = 0.3, SEAT_STALE = 400;
const FOLD_SECS = 1.5, PLANE_V = 8, PLANE_LIFE = 14, PLANE_REST = 25, PLANE_MAX = 8, PLANE_MIN = 2, BOOK_KEEP = 14, BOOK_LEN = 90;
import { typing } from './reunion_ui.js';

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
    have--; K.drawHud(); st.gest = { type: 'throw', t: 0, dur: 0.5 }; s.mode = 'fly'; s.t = -SANDAL_WIND / THROW_SECS; s.m.visible = true; s.a.set(player.pos.x, player.pos.y + 0.5, player.pos.z);      // s.t < 0: dép còn trong tay đang vung (tickSandals)
    const r = Math.random(); s.out = r < P_HIT ? 'hit' : r < P_HIT + P_STUCK ? 'stuck' : 'miss';
    const ang = Math.random() * 6.283, rad = s.out === 'miss' ? 2.4 + Math.random() : Math.random() * 1.5;      // trượt thì bay vọt ra ngoài tán
    s.b.set(mango.x + Math.cos(ang) * rad, CANOPY_Y + (Math.random() - 0.5) * 0.8, mango.z + Math.sin(ang) * rad); if (ctx.audio) ctx.audio.whoosh();
  }
  function tickSandals(dt) {
    if (!mango) return;
    for (const s of sandals) {
      const p = s.m.position;
      if (s.mode === 'fly') {
        s.t += dt / THROW_SECS;
        if (s.t < 0) { const hb = player.body.rig && player.body.rig.bones.RightHand; if (hb) { hb.getWorldPosition(p); p.y += 0.04; s.a.copy(p); } else p.copy(s.a); continue; }      // đang vung tay: dép nằm trong bàn tay phải, rời tay từ đúng chỗ đó
        const k = Math.min(1, s.t); p.lerpVectors(s.a, s.b, k); p.y += Math.sin(k * Math.PI) * 0.9; s.m.rotation.x += dt * 14; s.m.rotation.z += dt * 5;
        if (k < 1) continue;
        K.fx.puff(p.x, p.y, p.z, 'leaf', s.out === 'miss' ? 0 : 8); if (s.out !== 'hit') K.fx.sound(s.out === 'stuck' ? 'rim' : 'bad', 0.9);      // dép chạm tán: lá rụng; mắc cành / trượt: tiếng riêng
        if (s.out === 'hit') { const n = mango.drop(1 + Math.floor(Math.random() * 3), true); if (n) { comment(D.SANDAL.hit); if (ctx.audio) ctx.audio.rustle(); } else if (ctx.ui) ctx.ui.toast(D.SANDAL.bare, 2.5); }
        else comment(D.SANDAL[s.out]);
        s.mode = s.out === 'stuck' ? 'stuck' : 'fall'; s.vy = 0; s.m.rotation.set(0.3, Math.random() * 6, 0.2);
      } else if (s.mode === 'fall') {
        s.vy -= 9.8 * dt; p.y += s.vy * dt; s.m.rotation.x += dt * 6;
        const fy = down(p.x, Math.max(0.2, p.y), p.z) ?? (p.y < 0.6 ? 0 : null);      // rơi tới mặt nền bên dưới (kể cả mặt bồn cây)
        if (fy !== null && p.y <= fy + 0.03) { p.y = fy + 0.03; s.mode = 'ground'; s.m.rotation.set(0, Math.random() * 6, 0); }
        else if (p.y < -1) { p.y = 0.03; s.mode = 'ground'; }
      } else if (s.mode === 'ground' && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < PICK_R && Math.abs(p.y - feetY()) < 1.2) {
        s.mode = 'hand'; s.m.visible = false; have++; K.drawHud(); K.fx.sound('tick'); if (ctx.ui) ctx.ui.toast(D.SANDAL.back, 1.8);
      }
    }
    // đếm xoài nhặt được: quả nào người chơi cầm lên lần đầu (chuột trái) thì tính
    const held = st.held && st.held.body.userData; if (held && held.set === mango.set && !held.counted) { held.counted = true; state.mango++; save(); K.drawHud(); }
  }

  /* ===== ngồi tự do (C) ===== */
  let sitting = null;      // { x, z, back: Vector3 chỗ đứng trước khi ngồi }
  /** độ dài thật (giây) của một clip trên bộ xương người chơi: đổi clip sớm hơn thì động tác bị cắt cụt, muộn hơn thì đứng hình ở khung cuối */
  const clipSecs = (nm, fallback) => { const r = player.body && player.body.rig, c = r && r.clips && r.clips[nm]; return c && c.duration > 0 ? c.duration : fallback; };
  /** ghế gần nhất trong tầm: ghế đá ngoài trời (B.seats) hoặc ghế băng của phòng học đang đứng → { x, y (nền), z, f } */
  // Tìm ghế là việc nặng (trong phòng học phải duyệt ~30 chỗ, mỗi chỗ một điểm mới) mà mỗi khung bị hỏi vài lần (gợi ý phím, nút cảm ứng):
  // nhớ kết quả, chỉ tìm lại khi người chơi đã dịch quá SEAT_MOVE hoặc sau SEAT_STALE ms (ghế nhựa có thể bị xô, có người vừa ngồi).
  const seatAt = { x: 1e9, y: 0, z: 0, t: -1e9 }; let seatMemo = null;
  function seatNear() {
    const p = player.pos, y = feetY(), t = performance.now();
    if (t - seatAt.t < SEAT_STALE && Math.abs(y - seatAt.y) < 0.2 && Math.hypot(p.x - seatAt.x, p.z - seatAt.z) < SEAT_MOVE) return seatMemo;
    seatAt.x = p.x; seatAt.y = y; seatAt.z = p.z; seatAt.t = t; seatMemo = findSeat(); return seatMemo;
  }
  function findSeat() {
    const p = player.pos, y = feetY(); let best = null, bd = SEAT_R;
    const take = (x, fy, z, f, o) => { const d = Math.hypot(x - p.x, z - p.z); if (d < bd && Math.abs(fy - y) < 0.6) { bd = d; best = { x, y: fy, z, f, ...o }; } };
    for (const fn of K.seatFns) fn(take);      // module khác góp ghế: ghế nhựa (campus_food.js), gốc cây quanh lửa trại (campus_night.js)
    for (const s of ctx.B.seats || []) if (!s.taken) take(s.x, s.y - BENCH_H, s.z, s.f);      // s.taken: chỗ đã có bạn học sinh ngồi (campus_daily.js)
    const r = K.roomAt();
    if (r) for (let j = 0; j < 5; j++) for (const [wa] of BENCH_W) for (const dw of [0.5, 1.5, 2.5]) { const q = r.P(r.rw - 1.6 - (4 - j) * ROW_GAP + BENCH_U, wa + dw); take(q.x, r.y0, q.z, r.toBoard, { tight: true }); }      // tight: mép bàn nằm ngay trước ghế băng, không có chỗ đứng trước ghế
    return best;
  }
  function sit(s) {
    // ghế cao (ghế đá, ghế băng) có động tác ngồi xuống rồi mới vào dáng ngồi; ghế thấp ngồi xổm (s.clip riêng) thì chuyển mềm thẳng sang dáng
    const soft = !s.clip;
    sitting = { ...s, clip: s.clip || 'sit_idle', back: player.pos.clone(), f0: player.holder.rotation.y, tr: soft ? 'turn' : null, t: 0, dur: clipSecs('sit_down', SIT_IN) }; st.pinned = true; st.pinBy = 'seat'; st.clip = soft ? null : sitting.clip; st.pose = null;
    if (s.stool) phys.pcol.setEnabled(false); if (s.it) s.it.occupied = true; st.armsDown = !!s.stool;      // ghế đang có người ngồi: không nhấc, không đá được (player.js); ngồi ghế thấp thì hạ tay      // ghế nhựa là vật thể động: tắt va chạm của người chơi kẻo ghế bị hất văng
    const f = sitting.f = s.f ?? player.holder.rotation.y;
    if (soft) {      // có động tác: trước hết xoay người + bước tới sát ghế (tr = 'turn', bàn chân bước thật nhờ neo chân của rigged.js), xong mới phát clip ngồi xuống
      const a = seatAnchor(sitting, 'sit_down', 0); let d = f - sitting.f0; d = Math.atan2(Math.sin(d), Math.cos(d));
      sitting.pre = PRE_REST + Math.max(PRE_MIN, Math.abs(d) / PRE_TURN, Math.hypot(a.x - player.pos.x, a.z - player.pos.z) / PRE_SPEED); player.turnTo(f, Math.max(0.8, sitting.pre)); return;
    }
    player.turnTo(f);
    player.pos.set(s.x, s.y + phys.HH + phys.R, s.z); player.holder.rotation.y = f;
  }
  /** đứng dậy có động tác (phím C, phím đi); đang dở động tác ngồi xuống hoặc ghế thấp thì đứng ngay */
  function standUp() {
    if (!sitting || sitting.tr === 'up' || sitting.tr === 'back') return;
    // bấm đứng dậy khi còn đang dở: đang xoay người tới ghế thì bước ngược về chỗ cũ; đang ngồi xuống thì ngồi cho xong rồi đứng dậy ngay — không giật người về chỗ cũ giữa chừng
    if (sitting.tr === 'turn') { const S = sitting, b = S.back; S.tr = 'back'; S.t = 0; S.ax = player.pos.x; S.az = player.pos.z; S.f = player.holder.rotation.y; S.post = Math.max(POST_MIN, Math.hypot(b.x - S.ax, b.z - S.az) / POST_SPEED); return; }
    if (sitting.tr === 'down') { sitting.wantUp = true; return; }
    if (sitting.clip !== 'sit_idle' || st.pinBy !== 'seat') { stand(); return; }
    sitting.tr = 'up'; sitting.t = 0; sitting.dur = clipSecs('stand_up', SIT_OUT); st.clip = 'stand_up';
  }
  const ease = (k) => k * k * (3 - 2 * k);
  /** chỗ đặt gốc nhân vật ở giây t của clip ngồi xuống/đứng dậy: clip có phần lùi ra sau/nhích ra trước của hông tách riêng (rigged.js: splitRootZ) — dời gốc theo để bàn chân
   *  đứng yên, mông hạ đúng mặt ghế. Ghế băng trong lớp (S.tight) thì không dời: đứng trước ghế 25 cm là đứng lọt vào mặt bàn → ngồi xuống tại chỗ */
  function seatAnchor(S, clip, t) { const rig = player.body && player.body.rig, rs = rig && rig.rootShift && !S.tight ? rig.rootShift(clip, t) : 0; anchorP.x = S.x + Math.sin(S.f) * rs; anchorP.z = S.z + Math.cos(S.f) * rs; return anchorP; }
  const anchorP = { x: 0, z: 0 };
  /**
   * Ngồi xuống / đứng dậy theo bốn chặng (S.tr): 'turn' xoay người về hướng ghế + bước tới chỗ sẽ ngồi (tối đa PRE_TURN rad/s, PRE_SPEED m/s: đủ chậm để rigged.js cho bàn chân
   * bước theo thay vì lết) → 'down' clip ngồi xuống → (ngồi) → 'up' clip đứng dậy → 'back' bước về chỗ đứng cũ (vẫn quay lưng về ghế). Trước đây người bị trượt 0,65 m và
   * xoay 180° trong 0,45 giây đầu của clip ngồi xuống: bàn chân quét trên nền tới 2–2,7 m/s.
   */
  function tickMove(dt) {
    const S = sitting, sy = S.y + phys.HH + phys.R, b = S.back; S.t += dt; S.sliding = false;
    // giữa động tác mà bị dịch chuyển đi nơi khác (bản đồ M, kịch bản): bỏ dở, nhả ghim tại chỗ mới chứ không kéo người về ghế
    if (S.last && Math.hypot(player.pos.x - S.last.x, player.pos.z - S.last.z) > 0.05) { release(); st.pinned = false; st.pinBy = null; st.clip = null; return; }
    let d = S.f - S.f0; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (S.tr === 'turn') {
      const u = Math.max(0, 1 - S.t / (S.pre - PRE_REST)), k = 0.5 * (u + ease(u)), a = seatAnchor(S, 'sit_down', 0);      // nửa đều nửa êm: tốc độ xoay đỉnh chỉ gấp 1,25 lần trung bình (xoay quá 3 rad/s thì rigged.js coi là bị mang đi, thôi neo chân)      // k = 1: ở chỗ đứng, 0: sát ghế, đã quay lưng về ghế
      player.pos.set(a.x + (b.x - a.x) * k, sy + (b.y - sy) * k, a.z + (b.z - a.z) * k); player.holder.rotation.y = S.f - d * k;
      if (S.t >= S.pre) { S.tr = 'down'; S.t = 0; st.clip = 'sit_down'; }
    } else if (S.tr === 'back') {
      const k = ease(Math.min(1, S.t / S.post));
      player.pos.set(S.ax + (b.x - S.ax) * k, sy + (b.y - sy) * k, S.az + (b.z - S.az) * k); player.holder.rotation.y = S.f;
      if (S.t >= S.post) { stand(); K.fx.sound('tick', 0.7); return; }
    } else {
      const a = seatAnchor(S, S.tr === 'down' ? 'sit_down' : 'stand_up', S.t); player.pos.set(a.x, sy, a.z); player.holder.rotation.y = S.f;
      if (S.tr === 'down' && S.t >= S.dur) { S.tr = null; st.clip = S.clip; K.fx.sound('sit'); if (S.wantUp) { S.wantUp = false; standUp(); } }
      else if (S.tr === 'up' && S.t >= S.dur) { S.tr = 'back'; S.t = 0; S.ax = a.x; S.az = a.z; S.post = Math.max(POST_MIN, Math.hypot(b.x - a.x, b.z - a.z) / POST_SPEED); st.clip = null; }
    }
    (S.last || (S.last = { x: 0, z: 0 })).x = player.pos.x; S.last.z = player.pos.z;
  }
  function release() { if (sitting && sitting.it) sitting.it.occupied = false; sitting = null; st.armsDown = false; phys.pcol.setEnabled(true); }
  function toggleSit() { if (!st.started || st.locked) return; if (sitting) standUp(); else if (!st.photo && !st.pinned && !st.game) { const s = seatNear(); if (s) sit(s); else if (K.fx.once('noSeat', 4) && ctx.ui) ctx.ui.toast(D.SIT.none, 2.5); } }      // chưa ngồi được: nói rõ vì sao
  function stand() {
    if (!sitting) return; const b = sitting.back; release(); st.pinned = false; st.pinBy = null; st.clip = null; player.turnTo(st.yaw, 0);      // huỷ lượt xoay về hướng ghế còn dở (C rồi C lại trong 0,8 s)
    player.pos.copy(b); phys.pbody.setTranslation(player.pos, true); phys.world.propagateModifiedBodyPositionsToColliders();
  }
  addEventListener('keydown', (e) => {
    if (e.repeat || typing() || !st.started || st.locked) return;
    if (e.code === 'KeyC') toggleSit(); else if (sitting && !st.photo && /^(KeyW|KeyA|KeyS|KeyD|Arrow\w+|Space)$/.test(e.code)) standUp();
  });
  function tickSit(dt) {
    // đang ngồi (kể cả đang dở động tác ngồi xuống) mà kịch bản khác giành quyền ghim (tiết học đặt người vào ghế của nó): thôi coi là đang ngồi ghế này —
    // không dời người, không đụng tới ghim của chủ mới. Thiếu bước này thì sitting.tr kẹt ở 'down', trong tiết bấm C/W sẽ kéo người về chỗ cũ và bỏ ghim của tiết học.
    if (sitting && st.pinned && st.pinBy !== 'seat') release();
    { const rg = player.body && player.body.rig; if (rg) rg.carry = !!(sitting && sitting.tr && sitting.sliding); }      // báo cho rigged.js: đang mang người đi, đừng neo bàn chân (kẻo chân bước đuổi theo)
    if (sitting && sitting.tr && st.pinned && st.pinBy === 'seat') tickMove(dt);
    if (sitting && sitting.it) { const t = sitting.it.body.translation(); if (Math.hypot(t.x - sitting.x, t.z - sitting.z) > 0.25 || Math.abs(t.y - 0.15 - sitting.y) > 0.2) stand(); }      // ghế dưới chân bị dời (bóng đẩy, ai xô): đứng dậy
    if (sitting && (!st.pinned || (!sitting.tr && Math.hypot(player.pos.x - sitting.x, player.pos.z - sitting.z) > 0.3))) { release(); if (st.pinBy === 'seat') { st.clip = null; st.pinned = false; st.pinBy = null; } }      // nhả ghim nếu chính việc ngồi đã ghim (tiết học ghim thì để tiết học nhả)      // bị dịch chuyển (bản đồ M) hoặc kịch bản khác lấy quyền ghim
    K.setHint(!K.idle() ? '' : sitting ? D.SIT.up : nearTree() && have ? D.SANDAL.hint + (seatNear() ? '   ' + D.SIT.hint : '') : seatNear() ? D.SIT.hint : '');
  }

  /* ===== máy bay giấy ===== */
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.22, -0.13, 0.025, -0.16, 0, 0, -0.16, 0, 0, 0.22, 0, 0, -0.16, 0.13, 0.025, -0.16, 0, 0, 0.22, 0, 0, -0.16, 0, -0.055, -0.16], 3)); planeGeo.computeVertexNormals();
  const planeMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf4, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x333330 });
  planeGeo.scale(0.8, 0.8, 0.8);      // dài ~30 cm, sải ~21 cm (tờ A4 gấp; trước đây 38 cm, to như cái ê-ke)
  const hand = new THREE.Mesh(planeGeo, planeMat); hand.position.set(0.3, 1.12, 0.28); hand.rotation.x = -0.3; hand.visible = false; player.holder.add(hand);
  const planes = [], PLANE_TOSS = 0.7; let fold = 0, holding = false, toss = 0;      // toss: giây đã trôi của động tác phi (0 = không phi)
  for (const r of K.rooms) { const q = r.P(r.rw - 3.4, -7.5), it = { x: q.x, y: r.y0 + 0.8, z: q.z, r: 2, label: D.PLANE.label, fn: () => { if (!K.idle() || holding || fold) return; if (st.held) { if (ctx.ui) ctx.ui.toast(D.PLANE.busy, 3); return; } if (K.lock('plane')) fold = 0.001; } }; ctx.interact.push(it); r.paperIt = it; }
  /** bấm phi: tay kéo máy bay ra sau tai rồi đẩy tới (cử chỉ 'plane' của rigged.js); máy bay còn trong tay tới PLANE_RELEASE rồi mới bay ra (letFly) */
  function launch() { if (!holding || toss || !K.idle()) return; toss = 0.001; st.handUse = null; st.gest = { type: 'plane', t: 0, dur: PLANE_TOSS }; }
  function letFly() {
    toss = 0; holding = false; hand.visible = false;
    let pl = planes.find(x => !x.m.visible); if (!pl) { if (planes.length >= PLANE_MAX) pl = planes.reduce((a, b) => (a.t > b.t ? a : b)); else { pl = { m: new THREE.Mesh(planeGeo, planeMat), v: new THREE.Vector3(), from: new THREE.Vector3() }; pl.m.castShadow = true; scene.add(pl.m); planes.push(pl); } }
    const d = player.viewDir(tmp); pl.m.visible = true; if (st.fp) pl.m.position.set(player.pos.x + d.x * 0.5, player.pos.y + 0.7, player.pos.z + d.z * 0.5); else hand.getWorldPosition(pl.m.position).addScaledVector(d, 0.12); pl.from.copy(pl.m.position);      // bay ra từ đúng bàn tay (góc nhìn thứ nhất không thấy tay: ra từ trước mặt)
    pl.v.set(d.x, Math.max(-0.2, d.y) + 0.12, d.z).normalize().multiplyScalar(PLANE_V); pl.t = 0; pl.landed = 0; pl.drop = false; pl.seed = Math.random() * 6; if (ctx.audio) ctx.audio.whoosh();
  }
  function tickPlanes(dt) {
    if (fold) {      // đang gấp: thanh tiến độ 1,5 giây
      fold += dt; ui.progress(D.PLANE.folding, fold / FOLD_SECS);
      if (fold >= FOLD_SECS) { fold = 0; ui.progress('', null); K.unlock('plane'); holding = true; hand.visible = true; st.handUse = launch; K.drawHud(); if (ctx.ui) ctx.ui.toast(D.PLANE.ready, 4); }
    }
    if (toss) { toss += dt; if (!holding || !K.idle()) toss = 0; else if (toss >= PLANE_TOSS * PLANE_RELEASE) letFly(); if (!toss && holding) st.handUse = launch; }      // bị kịch bản khác chen vào giữa chừng: thôi phi, vẫn cầm
    hand.visible = holding && !st.fp;
    { const rg = player.body.rig, hb = rg && rg.bones.RightHand; if (hand.visible && hb) { hb.getWorldPosition(hand.position); player.holder.worldToLocal(hand.position); hand.position.y += 0.035; hand.position.z += 0.07; hand.rotation.x = toss ? -0.12 : -0.3; } }      // máy bay nằm trong bàn tay phải (dáng cầm: rigged.js actHold 'plane')
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
    if (modal || !K.idle() || !K.lock('book')) return;
    try { showBook(r); } catch (e) { if (modal) modal.remove(); modal = null; K.unlock('book'); console.error('[sổ đầu bài] không mở được:', e); }      // dựng bảng lỗi thì nhả khoá, không để người chơi kẹt
  }
  function showBook(r) {
    if (document.pointerLockElement) document.exitPointerLock();
    modal = ui.el('div', 'rvModal clBook'); const box = ui.el('div', 'box'), list = ui.el('ol'), inp = ui.el('input'), add = ui.el('button', 'primary', D.BOOK.add), close = ui.el('button', null, D.BOOK.close), row = ui.el('div', 'row');
    inp.type = 'text'; inp.maxLength = BOOK_LEN; inp.placeholder = D.BOOK.placeholder; inp.autocomplete = 'off';
    const draw = () => { list.textContent = ''; for (const l of bookLines(r.key)) { const li = ui.el('li'); li.append(ui.el('span', 'd', l.d), ui.el('span', 't', l.t)); list.appendChild(li); } list.scrollTop = list.scrollHeight; };
    const write = () => { if (addBookLine(r.key, inp.value)) { inp.value = ''; ui.sfx.ting(); draw(); } };
    const shut = () => { modal.remove(); modal = null; K.unlock('book'); };
    add.addEventListener('click', write); close.addEventListener('click', shut); inp.addEventListener('keydown', (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter') write(); else if (e.code === 'Escape') shut(); });
    row.append(inp, add); box.append(ui.el('h2', null, D.BOOK.title), ui.el('div', 'rvSub', 'Phòng ' + r.nm), list, row, close); modal.appendChild(box); ui.stopEv(modal); ui.root.appendChild(modal); draw();
  }
  for (const r of K.rooms) { const q = r.P(1.75, -7.6); ctx.interact.push({ x: q.x, y: r.y0 + 0.8, z: q.z, r: 1.3, label: D.BOOK.label + r.nm, fn: () => openBook(r) }); }

  return { update(dt) { setAnimFocus(ctx.camera, st.photo); tickSandals(dt); tickSit(dt); tickPlanes(dt); }, throwSandal, sandals, seatNear, sit, stand, standUp, launch, openBook, addBookLine, bookLines,
    get sitting() { return !!sitting; }, get seat() { return sitting; }, get holding() { return holding; }, get have() { return have; }, planes, fold: () => { if (K.idle() && !holding && !fold && K.lock('plane')) fold = 0.001; },
    toggleSit, tryThrow: () => { if (K.idle() && nearTree()) throwSandal(); }, canThrow: () => nearTree() && have > 0 };
}
