// Nếp sinh hoạt thường ngày ở sân trường (chạy cả khi ?reunion=0):
//   · người chơi vẫy tay (H) — người quanh đó vẫy lại; gõ trống có dùi và nhịp tay; rung cây xoài bằng hai tay
//   · vài nhân vật trong trường có việc để làm: bác bảo vệ đi tuần một đoạn, bạn sao đỏ đi một vòng, người bán hàng lau dọn quầy,
//     hai bạn ngồi ghế đá (mức đồ hoạ thấp chỉ còn hai người đi lại, không có hai bạn ghế đá)
//   · hai nhân vật đứng gần nhau tự nói với nhau vài câu khi người chơi ở gần (chữ nổi, mỗi lúc một người nói)
// Động tác tay là cử chỉ ngắn của rigged.js (h.gest); lời và lối đi ở campus_daily_data.js.
import * as THREE from 'three';
import { Q } from '../engine/util.js';
import { floorY, viewCone } from './people.js';
import { WAVE, ROUTES, TIDY, BENCH, CHATS } from './campus_daily_data.js';

const WAVE_SECS = 1.8, WAVE_REST = 0.9, WAVE_R = 9, WAVE_HINT_AT = 25;                    // giây vẫy, nghỉ giữa hai lần, tầm người khác thấy mình vẫy (m)
const DRUM_SECS = 1.15, SHAKE_SECS = 0.9, STICK_LEN = 0.36;
const SHOOT_R = 8;
const STOP_R = 3.4, ARRIVE = 0.1, STEP_MAX = 0.3, RETRY = 3, TICK = 0.25;                 // người chơi lại gần thì đứng lại; sai số tới nơi; chênh nền đi được
const HEAR_R = 9, PAIR_R = 5.5, LEVEL = 1.5, CHAT_FIRST = 12, CHAT_GAP = [22, 40], PAIR_REST = 150, LINE_BASE = 2.2, LINE_PER_CHAR = 0.035, CHAT_LOST = 14;
const STAFF = ['guard', 'xoi', 'trada', 'cangtin'], ORDER = 'msev', UP = new THREE.Vector3(0, 1, 0);
import { typing } from './reunion_ui.js';
const rnd = (a, b) => a + Math.random() * (b - a), pick = (l) => l[Math.floor(Math.random() * l.length)];

export function initDaily(K) {
  const { ctx, ui, actors } = K, { player, phys, scene } = ctx, st = player.st, low = Q.grass < 0.5, people = (ctx.people && ctx.people.list) || [];
  const tmp = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), rayO = { x: 0, y: 0, z: 0 }, rayD = { x: 0, y: 0, z: 0 };
  let now = 0, tick = 0;

  /* ===== vẫy tay ===== */
  const replies = [];      // { at, h }: người sẽ vẫy lại sau một nhịp
  let waveAt = -9, waveClip = 0, hinted = false;
  /** người đang rảnh và ở trong tầm thì vẫy lại; trả về người gần nhất (để nói một câu) */
  function waveBack() {
    const p = player.pos, feet = player.holder.position.y; let near = null, nd = WAVE_R;
    const see = (h, head, kind) => { const g = h.g.position, d = Math.hypot(g.x - p.x, g.z - p.z); if (d > WAVE_R || Math.abs(g.y - feet) > LEVEL || !h.g.visible) return; replies.push({ at: now + rnd(0.25, 0.85), h }); if (d < nd) { nd = d; near = { head, kind }; } };
    for (const n of people) if (!n.script && !n.pose && !n.h.clip) see(n.h, K.headOf(n), n.teacher ? 'elder' : 'young');
    const r = ctx.reunion; if (r && !r.busy && (r.mode === 'gate' || r.mode === 'follow' || r.mode === 'hang')) for (const sl of r.present()) if (!sl.a.pose && !sl.a.speed) see(sl.a.h, () => r.actors.head(sl.a, tmp), 'mate');
    for (const q of sitters) see(q.a.h, () => actors.head(q.a, tmp), 'young');
    return near;
  }
  /**
   * Người chơi vẫy tay. Đứng yên và chưa có dáng nào thì dùng clip pose_wave qua st.clip (mô-đun mạng đồng bộ st.clip cho người khác thấy);
   * đang đi/đang ngồi thì chỉ vẫy tay phải (cử chỉ đè lên dáng hiện có). Mỗi lần vẫy gọi các hàm trong ctx.onWave (hợp đồng với src/net).
   */
  function wave() {
    if (!st.started || st.locked || st.builder || now - waveAt < WAVE_REST) return false;
    waveAt = now; st.gest = { type: 'wave', t: 0, dur: WAVE_SECS }; K.fx.sound('hey');
    if (!st.clip && !st.pose && !st.pinned && !st.held && !st.photo && st.speed < 0.3) { st.clip = 'pose_wave'; waveClip = WAVE_SECS; }
    for (const fn of ctx.onWave || []) { try { fn(); } catch (e) { console.warn('[vẫy tay] hàm nghe ctx.onWave lỗi:', e); } }
    const near = waveBack(); if (near && !K.quiet()) { ui.bubble(near.head, K.fill(pick(WAVE[near.kind])), 2.2); K.hush(2.6); }
    return true;
  }
  addEventListener('keydown', (e) => { if (e.code === 'KeyH' && !e.repeat && !typing() && !st.locked) wave(); });
  function tickWave(dt) {
    if (document.hidden) replies.length = 0;      // thẻ bị ẩn: bỏ các cái vẫy đang hẹn
    if (waveClip > 0) { waveClip -= dt; if (waveClip <= 0 || st.speed > 0.4 || st.clip !== 'pose_wave') { if (st.clip === 'pose_wave') st.clip = null; waveClip = 0; } }
    for (let i = replies.length - 1; i >= 0; i--) if (now >= replies[i].at) { replies[i].h.gest = { type: 'wave', t: 0, dur: 1.5 }; replies.splice(i, 1); }
    if (!hinted && now > WAVE_HINT_AT && K.free() && !K.quiet() && !st.held) { hinted = true; if (ctx.ui) ctx.ui.toast(WAVE.hint, 3); }
  }

  /* ===== đánh trống, rung cây: quay người về phía đó rồi làm động tác ===== */
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, STICK_LEN, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 })); stick.visible = false; stick.castShadow = true; scene.add(stick);
  const faceTo = (x, z) => { if (!st.pinned) player.holder.rotation.y = Math.atan2(x - player.pos.x, z - player.pos.z); };
  let drumAt = null, drumBeat = 0;
  (ctx.onDrum || (ctx.onDrum = [])).push((drum) => { faceTo(drum.x, drum.z); st.gest = { type: 'drum', t: 0, dur: DRUM_SECS }; drumAt = drum; drumBeat = 0; });
  if (ctx.mango) ctx.mango.onShake.push(() => { faceTo(ctx.mango.x, ctx.mango.z); st.gest = { type: 'shake', t: 0, dur: SHAKE_SECS }; K.fx.puff(ctx.mango.x, 3.4, ctx.mango.z, 'leaf', 12); ctx.shake = K.fx.reduced ? 0 : Math.min(ctx.shake || 0, 0.45); });      // lá rụng; rung máy quay nhẹ (props.js đặt 1), bỏ hẳn khi người dùng bật giảm chuyển động
  function tickStick() {
    const rig = player.body.rig, on = !!(st.gest && st.gest.type === 'drum' && rig && rig.bones.RightHand && rig.bones.RightForeArm && player.holder.visible);
    stick.visible = on; if (!on) { drumAt = null; return; }
    // mỗi nhịp gõ (ba nhịp theo cử chỉ) một vòng lan trên mặt trống
    if (drumAt && st.gest.t / st.gest.dur > (drumBeat + 0.42) / 3) { drumBeat++; K.fx.ring(drumAt.x, drumAt.y, drumAt.z, 0xffe9b0, 0.5, player.holder.rotation.y); K.fx.shake(0.12); }
    rig.bones.RightHand.getWorldPosition(a3); rig.bones.RightForeArm.getWorldPosition(b3); b3.subVectors(a3, b3).normalize();
    stick.position.copy(a3).addScaledVector(b3, STICK_LEN * 0.55); stick.quaternion.setFromUnitVectors(UP, b3);      // dùi nối dài theo cẳng tay
  }

  /* ===== nhân vật đi tuần / đi dạo ===== */
  const walkers = ROUTES.filter(r => !low || r.low).map(r => ({ r, n: ctx.people && ctx.people.byId(r.id), i: -1, at: null, wait: rnd(4, 12), held: false })).filter(w => w.n);
  /** lối đi thẳng từ chỗ người n đang đứng tới (x, z) có thông không: không vướng tường, bàn ghế, người khác; nền bên kia không hẫng */
  function clearWay(n, x, z) {
    const g = n.h.g.position, dx = x - g.x, dz = z - g.z, d = Math.hypot(dx, dz); if (d < 0.05) return g.y;
    rayD.x = dx / d; rayD.z = dz / d; rayO.x = g.x; rayO.z = g.z;
    // tia thấp 0,12 m: ghế nhựa chỉ cao 0,3 m
    for (const hy of [0.12, 0.3, 1.0]) { rayO.y = g.y + hy; if (phys.cast(rayO, rayD, d + 0.3, 0xffff0003, n.col)) return null; }
    const fy = floorY(phys, x, g.y, z, n.col); return fy !== null && Math.abs(fy - (n.homeY ?? g.y)) < STEP_MAX ? fy : null;
  }
  /* ----- không ai đứng quay lưng giữa khung ảnh -----
     Chụp kỷ yếu (ctx.reunion.mode === 'photo'): người đi tuần/đi dạo đang ở gần nhóm chụp (< SHOOT_R) mà lọt khung thì bước ra điểm gần nhất
     nằm ngoài khung (điểm "aside" khai sẵn, các điểm tuần, chỗ gốc) và đứng đó tới khi chụp xong.
     Chế độ ảnh thường (P): người đó đứng lại, quay mặt và nhìn về máy ảnh (script riêng w.ps, trả lại khi thôi chụp). */
  const fw = new THREE.Vector3();
  function inFrame(x, y, z) { const c = ctx.camera.position, dx = x - c.x, dy = y + 0.9 - c.y, dz = z - c.z, l = Math.hypot(dx, dy, dz) || 1; return (dx * fw.x + dy * fw.y + dz * fw.z) / l > frameCos; }
  let frameCos = 1;
  function tickShoot(w, g, d) {
    const n = w.n, r = ctx.reunion, year = !!r && r.mode === 'photo', snap = !year && !!st.photo;
    if (!year) w.out = null;
    if (!snap && n.script === w.ps && w.ps) n.script = null;
    if ((!year && !snap) || d > SHOOT_R) return false;
    ctx.camera.getWorldDirection(fw); frameCos = viewCone(ctx.camera);
    if (year) {
      // Máy quay CẮT thẳng sang vị trí máy ảnh nên không ai thấy quãng chuyển: ĐẶT THẲNG người này ra chỗ lánh (không đi bộ).
      // Khung đầu của chặng máy quay có thể chưa kịp sang chỗ mới → lần đầu cứ ra điểm "aside" đã khai; các khung sau còn lọt khung thì đặt lại.
      const first = !w.out;
      if (first || inFrame(g.x, g.y, g.z)) {
        const cands = [w.r.aside, ...w.r.pts, [n.c.x, n.c.z]].filter(Boolean).filter((q, i) => (first && i === 0 && w.r.aside) || (!inFrame(q[0], g.y, q[1]) && Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z) > 2));
        if (!cands.length) return false;
        if (!(first && w.r.aside)) cands.sort((a, b) => Math.hypot(a[0] - g.x, a[1] - g.z) - Math.hypot(b[0] - g.x, b[1] - g.z));
        const y = n.homeY ?? g.y; w.out = { x: cands[0][0], y, z: cands[0][1] };
        g.set(w.out.x, y, w.out.z); n.col.setTranslation({ x: w.out.x, y: y + 0.8, z: w.out.z }); const it = n.it; it.x = w.out.x; it.y = y + 0.8; it.z = w.out.z;
      }
      n.goal = w.out; w.at = null; w.i = -1; w.wait = rnd(4, 8); return true;      // chụp xong: w.out bị xoá, người này đi bộ về chỗ gốc rồi đi tuần lại
    }
    if (!inFrame(g.x, g.y, g.z)) return false;
    const c = ctx.camera.position; w.ps = w.ps || { face: 0, look: c }; w.ps.face = Math.atan2(c.x - g.x, c.z - g.z); w.ps.look = c;
    w.stay = w.stay || { x: 0, y: 0, z: 0 }; w.stay.x = g.x; w.stay.y = g.y; w.stay.z = g.z; n.goal = w.stay; n.script = w.ps; return true;
  }
  function tickWalker(w, dt) {
    const n = w.n, g = n.h.g.position;
    if ((n.script && n.script !== w.ps) || n.pose || (K.talk && K.talk.walker && K.talk.walker.n === n)) { w.held = true; return; }      // kịch bản khác đang dùng người này (chụp ảnh, lửa trại, đi cùng người chơi)
    if (w.held) { w.held = false; w.at = null; w.i = -1; w.wait = rnd(5, 10); n.goal = null; return; }      // được trả lại: về chỗ cũ rồi đi lại từ đầu
    const it = n.it; it.x = g.x; it.y = g.y + 0.8; it.z = g.z;      // điểm bấm E đi theo người
    const d = Math.hypot(g.x - player.pos.x, g.z - player.pos.z);
    if (tickShoot(w, g, d)) return;
    // người chơi lại gần, đang nói chuyện gần đó, hoặc người này đang dở câu chuyện/lau dọn (có clip riêng): đứng lại
    if (d < STOP_R || (st.locked && d < 8) || n.h.clip) { w.stay = w.stay || { x: 0, y: 0, z: 0 }; w.stay.x = g.x; w.stay.y = g.y; w.stay.z = g.z; n.goal = w.stay; return; }      // người chơi lại gần hoặc đang nói chuyện: đứng lại
    n.goal = w.at;      // null = về chỗ đứng gốc
    const tx = w.at ? w.at.x : n.c.x, tz = w.at ? w.at.z : n.c.z; if (Math.hypot(tx - g.x, tz - g.z) > ARRIVE) return;
    w.wait -= dt; if (w.wait > 0) return;
    const pts = w.r.pts, next = (w.i + 2) % (pts.length + 1) - 1;      // -1 = chỗ đứng gốc, rồi lần lượt các điểm
    const nx = next < 0 ? n.c.x : pts[next][0], nz = next < 0 ? n.c.z : pts[next][1], fy = clearWay(n, nx, nz);
    if (fy === null) { w.wait = RETRY; w.i = next; return; }      // lối đang vướng: bỏ điểm này, lát thử điểm kế
    w.i = next; w.at = next < 0 ? null : { x: nx, y: fy, z: nz }; w.wait = rnd(w.r.rest[0], w.r.rest[1]);
  }

  /* ===== người bán hàng lau dọn quầy ===== */
  const tidy = TIDY.ids.map(id => ({ n: ctx.people && ctx.people.byId(id), next: rnd(6, 16), until: 0 })).filter(q => q.n);
  function tickTidy(q) {
    const n = q.n, h = n.h;
    if (h.clip === 'interact') { if (now > q.until || n.script || n.pose) h.clip = null; return; }
    if (now < q.next || h.clip || n.script || n.pose || st.locked) return;
    const d = Math.hypot(h.g.position.x - player.pos.x, h.g.position.z - player.pos.z); if (d < 2.6) { q.next = now + 4; return; }      // khách đang đứng trước quầy thì tiếp khách
    h.clip = 'interact'; q.until = now + TIDY.secs; q.next = now + rnd(TIDY.every[0], TIDY.every[1]);
  }

  /* ===== hai bạn ngồi ghế đá ===== */
  const sitters = [];
  if (!low && ctx.B.seats && ctx.B.seats.length > 1) {
    const S = ctx.B.seats; let bi = 0, bd = 1e9; for (let i = 0; i + 1 < S.length; i += 2) { const d = Math.hypot((S[i].x + S[i + 1].x) / 2 - BENCH.near[0], (S[i].z + S[i + 1].z) / 2 - BENCH.near[1]); if (d < bd) { bd = d; bi = i; } }
    for (let k = 0; k < 2; k++) { const s = S[bi + k]; s.taken = true; sitters.push({ s, placed: false, a: actors.add({ x: s.x, y: 0.02, z: s.z, f: s.f }, BENCH.looks[k], { clip: 'sit_idle', face: s.f, show: 55, smile: 0.4 }) }); }
  }
  function seatSitters() {      // chờ lượt dò nền đầu tiên của actors rồi mới đặt xuống mặt đất dưới ghế (dò nền sẽ đặt nhầm lên mặt ghế)
    for (const q of sitters) { if (q.placed) continue; const s = q.s, fy = (floorY(phys, s.x, 0.1, s.z + (s.f === 0 ? 0.5 : -0.5), q.a.col) ?? 0.02); actors.place(q.a, s.x, fy, s.z, s.f); q.placed = true; }
  }

  /* ===== chuyện nền giữa hai nhân vật ===== */
  let chat = null, nextChat = CHAT_FIRST; const rested = new Map(), cand = [];
  /** những người có thể lên tiếng quanh người chơi → { key, kind, title, g (vị trí), head(), talk(on) } */
  function speakers(out) {
    out.length = 0; const p = player.pos, feet = player.holder.position.y;
    const ok = (g, vis) => vis && Math.hypot(g.x - p.x, g.z - p.z) < HEAR_R && Math.abs(g.y - feet) < LEVEL;
    for (const n of people) {
      if (n.script || n.pose || n.h.clip || !ok(n.h.g.position, n.h.g.visible) || (K.talk && K.talk.walker && K.talk.walker.n === n)) continue;
      out.push({ key: n.c.id, kind: STAFF.includes(n.c.id) ? 'v' : n.teacher ? 'e' : 's', title: n.c.n.split(' ')[0].toLowerCase(), g: n.h.g.position, head: K.headOf(n), talk: (on) => { const ok = on ? !n.h.clip && !n.script : n.h.clip === 'talk'; if (ok) n.h.clip = on ? 'talk' : null; return ok; } });
    }
    const r = ctx.reunion;
    if (r && !r.busy && (r.mode === 'gate' || r.mode === 'follow' || r.mode === 'hang')) for (const sl of r.present()) {
      const a = sl.a; if (a.pose || !ok(a.h.g.position, a.h.g.visible)) continue;
      out.push({ key: 'mate' + sl.i, kind: 'm', title: '', g: a.h.g.position, head: () => r.actors.head(a, tmp), talk: (on) => { const ok = on ? !a.clip : a.clip === 'talk'; if (ok) a.clip = on ? 'talk' : null; return ok; } });
    }
    for (let k = 0; k < sitters.length; k++) { const a = sitters[k].a; if (ok(a.h.g.position, a.h.g.visible)) out.push({ key: 'bench' + k, kind: 's', title: '', g: a.h.g.position, head: () => actors.head(a, tmp), talk: (on) => { a.clip = on ? 'sit_talk' : 'sit_idle'; return true; } }); }
    return out;
  }
  function startChat() {
    const S = speakers(cand), pairs = [];
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const a = ORDER.indexOf(S[i].kind) <= ORDER.indexOf(S[j].kind) ? S[i] : S[j], b = a === S[i] ? S[j] : S[i], type = a.kind + b.kind, id = a.key + '|' + b.key;
      if (CHATS[type] && Math.hypot(a.g.x - b.g.x, a.g.z - b.g.z) < PAIR_R && !((rested.get(id) || 0) > now)) pairs.push({ a, b, type, id });
    }
    if (!pairs.length) { nextChat = now + 4; return; }
    const pr = pick(pairs), list = CHATS[pr.type], n = (rested.get(pr.type + '#') || 0), lines = list[n % list.length]; rested.set(pr.type + '#', n + 1); rested.set(pr.id, now + PAIR_REST);
    const other = pr.b.title || pr.a.title, cap = other.charAt(0).toUpperCase() + other.slice(1);
    chat = { who: [pr.a, pr.b], lines: lines.map(s => K.fill(s, { tc: other, Tc: cap, vb: other, Vb: cap })), i: 0, t: 0, on: null };
  }
  // chỉ tắt dáng nói do CHÍNH chuyện nền bật (chat.mine). Người chơi vừa bắt chuyện (st.locked) thì dáng 'talk' lúc này là của cuộc trò chuyện ấy:
  // hoãn việc tắt tới khi người chơi rảnh — khi đó cuộc trò chuyện đã tự tắt, hoặc người kia vẫn còn dáng của chuyện nền thì mới tắt.
  const offLater = [];
  const hushUp = (who) => { if (st.locked) offLater.push(who); else who.talk(false); };
  function endChat() { if (chat && chat.on && chat.mine) hushUp(chat.on); chat = null; nextChat = now + rnd(CHAT_GAP[0], CHAT_GAP[1]); }
  function tickChat(dt) {
    if (!st.locked) while (offLater.length) offLater.pop().talk(false);
    if (!chat) { if (now > nextChat && K.idle() && !K.quiet() && !st.game) startChat(); return; }
    const p = player.pos, sp = chat.who[chat.i % 2]; chat.t -= dt;
    if (!K.idle() || Math.hypot(sp.g.x - p.x, sp.g.z - p.z) > CHAT_LOST) { endChat(); return; }      // người chơi bận việc khác hoặc đi xa: thôi
    if (chat.t > 0) return;
    if (chat.on) { if (chat.mine) chat.on.talk(false); chat.on = null; chat.i++; }
    if (chat.i >= chat.lines.length) { endChat(); return; }
    if (chat.i === 0 && K.quiet()) return;      // chờ câu của người khác (câu cửa miệng, lời chào) tắt hẳn rồi mới mở lời; các câu sau đã giữ lượt bằng K.hush
    const who = chat.who[chat.i % 2], text = chat.lines[chat.i], secs = LINE_BASE + text.length * LINE_PER_CHAR;
    ui.bubble(who.head, text, secs); K.hush(secs + 0.5); chat.mine = who.talk(true); chat.on = who; chat.t = secs + 0.35;
  }

  function update(dt) {
    now += dt; tickWave(dt); tickStick();
    if (now > 0.6) seatSitters();
    for (const w of walkers) tickWalker(w, dt);
    tick += dt; if (tick < TICK) return; const step = tick; tick = 0;
    for (const q of tidy) tickTidy(q);
    tickChat(step);
  }
  return { update, wave, walkers, sitters, tidy, get chat() { return chat; }, startChat, clearWay, speakers: () => speakers([]), get replies() { return replies.length; } };
}
