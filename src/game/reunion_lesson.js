// Tiết sinh hoạt ở lớp cũ: màn mờ chuyển cảnh → cả lớp ngồi vào bàn, cô chủ nhiệm trên bục → điểm danh, kiểm tra miệng, chuyện chuyền giấy,
// sổ đầu bài, lời dặn của cô, trống trường. Nội dung nằm ở LESSON trong reunion_data.js; ở đây chỉ có dàn cảnh và trình chạy kịch bản.
// Không cho các bạn tự đi vào bàn: khe giữa ghế băng và bàn sau chỉ 15 cm, đi bộ vào sẽ xuyên qua ghế — nên chuyển cảnh bằng màn mờ.
import * as THREE from 'three';

const BLOCK = 'A', ROOM_I = 5, FLOOR = 0;                 // phòng học tầng trệt nhà A, sát trống trường
const SEAT_W = [-4.9, -5.7, -9.25, -10.05], ROW_GAP = 1.15, BENCH = 0.92, STAND = 0.62, ME_SEAT = [2, 1];      // cột ghế (toạ độ w), bước hàng, tâm ghế băng / chỗ đứng dậy tính từ mép bàn
const PODIUM = 0.2, TEACHER_AT = [0.95, -8.9], DOOR_OUT = [1.5, -1.6], DOOR_IN = [1.7, -4.3], AISLE = -7.5;
const SKIP = Symbol('bỏ qua tiết học');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function initLesson(R) {
  const { ctx, ui, actors, D } = R, { player, phys } = ctx, L = D.LESSON, b = ctx.blocks[BLOCK], room = b && b.roomNames.find(r => r.k === FLOOR && r.i === ROOM_I);
  if (!room || b.rooms[ROOM_I] !== 'class') { console.warn('[ngày về] không tìm thấy phòng học cho tiết sinh hoạt, bỏ chặng "Về lớp cũ"'); return { door: null, start() {}, update() {} }; }
  const y0 = room.y, rw = room.u2 - room.u1, P = (u, w) => { const p = b.W(room.u1 + u, w); return { x: p[0], z: p[1] }; };
  const o = P(0, AISLE), ob = P(-1, AISLE), toBoard = Math.atan2(ob.x - o.x, ob.z - o.z), toClass = toBoard + Math.PI, oy = P(0, AISLE + 1), toYard = Math.atan2(oy.x - o.x, oy.z - o.z);      // hướng nhìn lên bảng / từ bục xuống lớp
  const rowU = (j) => rw - 1.6 - (4 - j) * ROW_GAP, seat = ([c, j], off = BENCH) => ({ ...P(rowU(j) + off, SEAT_W[c]), u: rowU(j) + off, w: SEAT_W[c] });
  const door = { ...P(...DOOR_OUT), y: y0 }, tAt = P(...TEACHER_AT), tY = y0 + PODIUM, v3 = (p, y) => new THREE.Vector3(p.x, y, p.z);
  // cảnh cắt tĩnh: cam() chỉ đổi tư thế đích, giàn máy quay (camrig.js, chế độ 'lesson') mới ghi vào máy quay
  const shotPos = new THREE.Vector3(), shotAt = new THREE.Vector3(), camLesson = (dt, out) => { out.pos.copy(shotPos); out.dir.copy(shotAt).sub(shotPos); };
  const cam = (u, w, y, lu, lw, ly) => { const a = P(u, w), l = P(lu, lw); shotPos.set(a.x, y0 + y, a.z); shotAt.set(l.x, y0 + ly, l.z); };
  const tHead = v3(tAt, tY + 1.45);

  // cô chủ nhiệm: dùng cô chủ nhiệm (id chunhiem) của people.js; ở mức đồ hoạ thấp người đó không được dựng thì dựng riêng một cô cho tiết học
  let own = null; const borrowed = ctx.people && ctx.people.byId(D.TEACHER_ID);
  if (!borrowed) own = actors.add({ x: tAt.x, y: tY, z: tAt.z, f: toClass }, { gender: 'f', skin: 0, hair: 'bob', outfit: 'aodaiT', age: 'adult', height: 1.58, build: 1, stance: 'front' }, { off: true });
  let home = null, sitting = true, active = false, skipped = false, shot = 0, prevFp = false, lookV = new THREE.Vector3();
  function teacherIn() {
    if (own) { own.off = false; actors.place(own, tAt.x, tY, tAt.z, toClass); actors.solid(own, false); return; }
    home = ctx.people.relocate(borrowed, tAt.x, tY, tAt.z, toClass); borrowed.script = { face: toClass, look: null };
  }
  function teacherOut() { if (own) { own.off = true; return; } borrowed.script = null; borrowed.h.clip = null; if (home) ctx.people.relocate(borrowed, home.x, home.y, home.z, home.f); home = null; }
  const tTalk = (on) => { if (own) own.clip = on ? 'talk' : null; else borrowed.h.clip = on ? 'talk' : null; };
  const tLook = (v) => { if (own) own.look = v; else borrowed.script.look = v; };

  function sit(sl) { const s = seat(sl.def.seat, sitting ? BENCH : STAND), a = sl.a; actors.place(a, s.x, y0, s.z, toBoard); a.face = toBoard; a.clip = sitting ? 'sit_idle' : null; a.look = tHead; a.pose = null; a.smile = null; a.off = false; sl.seated = true; }
  function setup() {
    sitting = R.present().every(sl => sl.a.h.rig);      // hình tạm dựng bằng mã (?people=0, nạp mô hình lỗi) không có clip ngồi: cả lớp đứng cạnh bàn
    prevFp = player.st.fp; player.st.fp = false; R.setMode('lesson'); teacherIn(); document.body.classList.add('rvCine');
    for (const sl of R.present()) { actors.solid(sl.a, false); sl.a.probe = false; sit(sl); }
    const late = R.slots.find(s => s.def.id === 'dung'); if (late.present) { late.a.off = true; late.seated = false; }      // bạn chuyên đi muộn: lúc điểm danh mới xuất hiện ở cửa
    const s = seat(ME_SEAT, sitting ? BENCH : STAND), st = player.st; st.pinned = true; st.pinBy = 'lesson'; st.clip = sitting ? 'sit_idle' : null; st.pose = null;
    player.pos.set(s.x, y0 + phys.HH + phys.R, s.z); phys.pbody.setTranslation(player.pos, true); phys.world.propagateModifiedBodyPositionsToColliders(); player.holder.rotation.y = toBoard;
    cam(0.9, -4.2, 2.0, 4.4, -8, 0.8); ctx.cam.setMode('lesson', camLesson);
  }
  function teardown() {
    const st = player.st; document.body.classList.remove('rvCine'); st.pinned = false; st.pinBy = null; st.clip = null; st.fp = prevFp; ctx.cam.clearMode('lesson'); teacherOut();
    R.present().forEach((sl, k) => { const p = P(DOOR_OUT[0] + 1.2 + (k >> 1) * 0.9, k % 2 ? -0.9 : -2.1), a = sl.a; a.off = false; a.clip = null; actors.place(a, p.x, y0, p.z, toBoard); });
    player.teleport(door.x, y0, door.z, toYard); R.setMode('follow');
  }

  /* ----- máy quay cắt cảnh ----- */
  function focus(sp) {
    shot++;
    // cô nói: xen cảnh nhìn qua vai cả lớp với cảnh gần cô
    if (sp.kind === 'co') { if (shot % 3 === 0) cam(5.9, AISLE + 0.3, 1.5, 0.9, -8.3, PODIUM + 1.0); else cam(2.9, -7.3, 1.3, TEACHER_AT[0], TEACHER_AT[1], PODIUM + 1.3); tLook(null); return; }
    const sl = sp.sl, s = sp.kind === 'me' ? seat(ME_SEAT) : sl.seated ? seat(sl.def.seat) : { u: DOOR_IN[0], w: DOOR_IN[1] }, standing = sp.kind !== 'me' && !sl.seated;
    if (standing) cam(3.6, -6.6, 1.45, s.u, s.w, 1.25); else cam(s.u - 2.0, s.w > AISLE ? -7.1 : -7.9, sitting ? 1.12 : 1.45, s.u, s.w, sitting ? 1.0 : 1.3);
    tLook(lookV.set(P(s.u, s.w).x, y0 + (standing || !sitting ? 1.5 : 1.15), P(s.u, s.w).z));      // cô quay sang nhìn người đang nói
  }
  const talk = (sp, on) => { if (sp.kind === 'co') tTalk(on); else if (sp.kind === 'mate') { const low = sp.sl.seated && sitting; sp.sl.a.clip = on ? (low ? 'sit_talk' : 'talk') : (low ? 'sit_idle' : null); } };
  /** một câu thoại: cắt máy tới người nói, chờ người chơi bấm tiếp */
  async function line(id, raw, extra) {
    if (skipped) throw SKIP;
    const sp = R.who(id), s = sp && R.text(raw, sp.sl, extra); if (s == null) return;
    focus(sp); talk(sp, true);
    try { await ui.dialog.say(sp.label, s); } finally { talk(sp, false); }
    if (skipped) throw SKIP;
  }
  async function lines(arr, extra) { for (const [id, raw] of arr) await line(id, raw, extra); }
  async function ask(name, q, opts) { if (skipped) throw SKIP; const i = await ui.dialog.choose(name, q, opts); if (skipped) throw SKIP; return typeof i === 'number' ? i : 0; }
  function laugh() {
    const P_ = R.present(); for (const sl of P_) sl.a.smile = 0.95; setTimeout(() => { for (const sl of P_) if (R.mode === 'lesson') sl.a.smile = null; }, 2600);
    P_.filter((_, i) => (i + shot) % 3 === 0).forEach((sl, i) => ui.bubble(() => actors.head(sl.a, new THREE.Vector3()), i % 2 ? 'Hì hì!' : 'Ha ha ha!', 1.8));
    cam(0.9, -4.2, 2.0, 4.4, -8, 0.8);
  }

  /* ----- các phần của tiết học ----- */
  async function rollCall() {
    await line(...L.rollStart);
    const roster = R.roster, isHere = (i) => i < R.slots.length, skim = roster.length > 15, CALLS = ['{n}?', 'Bạn {n}?', '{n} đâu nhỉ?'];
    let called = roster.map((e, i) => ({ e, i })); if (skim) { let away = 0; called = called.filter(c => isHere(c.i) || away++ < 3); }      // danh sách dài: cô chỉ dừng ở các bạn có mặt và ba bạn vắng đầu
    let k = 0;
    for (const { e, i } of called) {
      const n = { n: e.name }; await line('co', CALLS[k % CALLS.length], n);
      if (!isHere(i)) { await lines(L.absent[k % L.absent.length], n); k++; continue; }
      const sl = R.slots[i], id = sl.def.id; k++;
      if (id === 'dung') {
        await line(L.late[0][0], L.late[0][1]);
        const p = P(...DOOR_IN); sl.a.off = false; sl.a.clip = null; actors.place(sl.a, p.x, y0, p.z, toBoard + Math.PI * 0.75); sl.a.face = tAt; sl.a.look = tHead;
        await line('dung', sl.def.roll); await line(L.late[2][0], L.late[2][1]); sit(sl);
      } else { await line(id, sl.def.roll); if (L.afterRoll[id]) await line(...L.afterRoll[id]); }
    }
    if (skim) await line(...L.rollSkim);
    focus({ kind: 'co' }); const i = await ask(D.TEACHER, R.fill(L.rollMe.ask), L.rollMe.opts.map(o => o.t)), pick = L.rollMe.opts[i];
    if (pick.laugh) laugh(); await lines(pick.re);
  }
  async function noteEvent() {
    const N = L.note; await lines(N.pre); focus({ kind: 'me' });
    const i = await ask('', R.fill(N.ask), N.opts.map(o => R.fill(o.t))); await lines(N.opts[i].re); laugh(); await wait(900);
    return N.opts[i].tag;
  }
  async function quiz() {
    await line(...L.quizStart); let score = 0, tag = null;
    for (let i = 0; i < L.quiz.length; i++) {
      if (i === L.noteAfter) tag = await noteEvent();
      const q = L.quiz[i]; focus({ kind: 'co' }); tTalk(true);
      let pick; try { pick = await ask(`${D.TEACHER} · câu ${i + 1}/${L.quiz.length}`, R.fill(q.q), q.opts); } finally { tTalk(false); }
      const ok = pick === q.ok; if (ok) score++; if (ctx.ui) ctx.ui.toast(ok ? '✓ Đúng rồi' : '✗ Chưa đúng — đáp án: ' + q.opts[q.ok], 3);
      const re = (q.pick && q.pick[pick]) || (ok ? q.right : q.wrong); await lines(re); if (re.length > 1) { laugh(); await wait(700); }
    }
    return { score, tag };
  }
  async function closing({ score, tag }) {
    await lines(L.closing);
    const Bk = L.book, mark = Bk.marks.find(m => score >= m[0]), here = R.present().length + 1, total = R.roster.length + 1;
    const rows = [`Sĩ số ${total} · có mặt ${here} · vắng ${total - here}`, `Kiểm tra miệng: ${score}/${L.quiz.length}`, 'Nhận xét: ' + mark[1]];
    if (tag) rows.push(`Ghi chú: giữa giờ có chuyền giấy, một em ${tag}.`); rows.push('Xếp loại tiết học: ' + mark[2]);
    ui.dialog.close(); await ui.card(Bk.title, R.fill(Bk.sub), rows, 'Ký sổ'); if (skipped) throw SKIP;
    R.state.score = score; R.save();
    if (ctx.campus) ctx.campus.play.addBookLine(BLOCK + ':' + room.nm, `Tiết sinh hoạt lớp ${R.cls.cls}: kiểm tra miệng ${score}/${L.quiz.length}, xếp loại ${mark[2]}.`);      // ghi luôn vào cuốn sổ đặt trên bàn giáo viên phòng này
    const C = L.closing2; await lines(C.slice(0, 2)); if (ctx.audio) ctx.audio.drum(); await lines(C.slice(2));
    // cả lớp đứng dậy chào cô: đứng vào khe giữa ghế và bàn
    for (const sl of R.present()) { const s = seat(sl.def.seat, STAND); sl.seated = false; sl.a.clip = null; actors.place(sl.a, s.x, y0, s.z, toBoard); }
    { const s = seat(ME_SEAT, STAND); player.st.clip = null; player.pos.set(s.x, y0 + phys.HH + phys.R, s.z); }
    cam(0.9, -4.2, 2.0, 4.4, -8, 0.8); ui.dialog.close(); ui.sfx.clap(2.6, 8, 0.5); await wait(2600);
  }

  async function start() {
    if (active || R.busy || R.mode !== 'follow' || !R.lock(true)) return; active = true; skipped = false; R.busy = true;
    await ui.fade(true);
    try {
      setup(); ui.dialog.skippable(() => { skipped = true; ui.dialog.answer(0); ui.cardClose(); });
      await ui.fade(false); await lines(L.intro); await rollCall(); await closing(await quiz());
    } catch (e) { if (e !== SKIP) console.error('[ngày về] tiết học dừng vì lỗi, trả mọi người về chỗ:', e); }
    ui.dialog.skippable(null); ui.dialog.close();
    try { await ui.fade(true); teardown(); R.complete('lesson'); if (ctx.ui) ctx.ui.toast(L.done, 5); }
    finally { R.busy = false; R.lock(false); active = false; await ui.fade(false); }
  }
  return { door, start, update() {}, get active() { return active; } };
}
