// Chuyện trò theo chủ đề: bấm E ở một nhân vật → lời chào theo ngữ cảnh → người chơi CHỌN chủ đề (hoặc gõ tự do) → đoạn hội thoại nhiều lượt có rẽ nhánh
// → quay lại danh sách chủ đề. Không có máy chủ hay AI: mọi câu là kịch bản trong campus_talk_data.js / reunion_talk_data.js; ở đây chỉ có trình chạy,
// ngữ cảnh (giờ, mưa, trang phục, tiến trình…), trí nhớ theo từng nhân vật (cờ lưu trong tp2_campus) và khớp từ khoá cho câu gõ tự do.
import * as D from './campus_talk_data.js';
import { resolveSaid, norm } from './campus_talk_match.js';
export { norm };

const MAX_TURNS = 40, SAID_MAX = 80, POSE_SECS = 20, WALK_BEHIND = 1.3, WALK_LOST = 25, WALK_BLOCKED = 2, WALK_STEP = 0.6, NIGHT_FROM = 19.5, NIGHT_TO = 4;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function initTalk(K) {
  const { ctx, ui, state, save, cls } = K, { player, sky } = ctx, st = player.st;
  // dữ liệu đã lưu có thể sai hình (bản cũ, người chơi sửa tay): ép về đúng dạng thay vì để ném lỗi giữa cuộc thoại
  if (!state.talk || typeof state.talk !== 'object' || Array.isArray(state.talk)) state.talk = {};
  for (const id of Object.keys(state.talk)) { const e = state.talk[id], ok = e && typeof e === 'object'; state.talk[id] = { met: ok && Number.isFinite(e.met) ? e.met : 0, done: ok && Array.isArray(e.done) ? e.done.filter(x => typeof x === 'string') : [], flags: ok && e.flags && typeof e.flags === 'object' && !Array.isArray(e.flags) ? { ...e.flags } : {} }; }
  const memo = (id) => (Object.prototype.hasOwnProperty.call(state.talk, id) ? state.talk[id] : (state.talk[id] = { met: 0, done: [], flags: {} }));
  const rayO = { x: 0, y: 0, z: 0 }, rayD = { x: 0, y: 0, z: 0 };      // tia dò dùng lại mỗi khung
  let now = 0, poseUntil = 0, walker = null;      // walker = { n, until, desc }: nhân vật trường đang đi cùng người chơi

  /* ----- ngữ cảnh ----- */
  function context(desc, m) {
    const h = sky.state.hour % 24, look = player.getLook(), top = String(look.top || look.outfit || ''), r = ctx.reunion, done = r ? r.state.done : {}, mems = state.mem.length, total = K.D.MEMORIES.length;
    const C = { morning: h >= 5 && h < 11, noon: h >= 11 && h < 13.5, evening: h >= 17 && h < 19.5, night: h >= NIGHT_FROM || h < NIGHT_TO, young: desc.kind === 'young', noXoi: false, rain: sky.state.weather === 'rain',
      wearClass: /^class/.test(top), wearAodai: /^aodai/.test(top), wearUniform: /^(uniform|white|jacket)/.test(top),
      first: m.met === 0, again: m.met > 0, often: m.met >= 3, doneLesson: !!done.lesson, doneShow: !!done.show, donePhoto: !!done.photo, doneAll: !!done.bye || ['lesson', 'show', 'photo'].every(k => done[k]),
      memNone: mems === 0, memAll: mems >= total, cauPro: (state.cau || 0) >= 5, full: desc.absent === 0 };
    for (const f in m.flags) C['f_' + f] = true;
    return C;
  }
  /** câu có biến thể theo ngữ cảnh: lấy biến thể đầu tiên (theo thứ tự khai) có khoá đang đúng, không thì câu mặc định t */
  const variant = (text, C) => { if (typeof text === 'string') return text; for (const k in text) if (k !== 't' && C[k]) return text[k]; return text.t; };
  function nearestMemory() {
    let best = null, bd = 1e9; for (const f of (ctx.campus ? ctx.campus.frames : [])) { if (f.gone) continue; const d = Math.hypot(f.m.at[0] - player.pos.x, f.m.at[2] - player.pos.z); if (d < bd) { bd = d; best = f.m.nm; } }
    return best ? best.charAt(0).toLowerCase() + best.slice(1) : 'sân trường';
  }
  function fill(desc, s) {
    const male = player.getLook().gender !== 'f', k = desc.kind, T = desc.self;
    const ban = k === 'mate' ? (male ? 'ông' : 'bà') : k === 'young' ? (male ? 'anh' : 'chị') : (T === 'bác' || T === 'bà' ? 'cháu' : 'em'), h = sky.state.hour % 24;
    const own = { toi: k === 'mate' ? 'tôi' : T, ban, minh: k === 'mate' ? 'tôi' : ban, goi: k === 'mate' ? (cls.me || ban) : cls.me ? ban + ' ' + cls.me : ban, ong: k === 'mate' ? desc.short : T, ten: desc.short,
      kyniem: nearestMemory(), gio: `${Math.floor(h)} giờ${h % 1 >= 0.5 ? ' rưỡi' : ''}`, cau: String(state.cau || 0) };
    let out = s.replace(/\{(\w+)\}/g, (m, key) => (key in own ? own[key] : m));
    out = desc.fill ? desc.fill(out) : K.fill(out, { me: cls.me || ban, khoa: cls.year });
    return out.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
  }

  /* ----- trình chạy kịch bản ----- */
  const meName = () => cls.me || 'Bạn';
  async function say(desc, C, text, mine) {
    const s = fill(desc, variant(text, C)); if (!mine && desc.talk) desc.talk(true);
    try { await ui.dialog.say(mine ? meName() : desc.name, s); } finally { if (!mine && desc.talk) desc.talk(false); }
  }
  const ABORT = { aborted: true };      // khung thoại bị cuộc thoại khác thay thế giữa chừng (choose trả null): dừng cả chuỗi, không ghi cờ, không đánh dấu chủ đề
  async function play(desc, m, nodes) {
    for (const node of nodes) {
      const C = context(desc, m), kind = node[0];
      if (kind === 'n') await say(desc, C, node[1]);
      else if (kind === 'p') await say(desc, C, node[1], true);
      else if (kind === 'c') {
        const opts = node[2], i = await ui.dialog.choose(desc.name, fill(desc, variant(node[1], C)), opts.map(o => fill(desc, o[0]))); if (typeof i !== 'number' || !opts[i]) throw ABORT; const o = opts[i];
        if (o[2]) { m.flags[o[2]] = 1; save(); }      // nhớ lựa chọn của người chơi (chỉ lưu tên cờ, không lưu câu chữ)
        await play(desc, m, o[1]);
      }
    }
  }
  async function runTopic(desc, m, t) { const seen = m.done.includes(t.id); await play(desc, m, seen && t.again ? t.again : t.script); if (!seen) { m.done.push(t.id); save(); } }

  /* ----- hành động kèm theo ----- */
  function actPhoto(desc) {
    if (desc.kind === 'mate') { if (ctx.reunion && ctx.reunion.cheese) ctx.reunion.cheese(POSE_SECS); }
    else if (ctx.people) { ctx.people.poseNear(true, desc.n); poseUntil = now + POSE_SECS; }
  }
  function actFollow(desc) { if (!desc.n || desc.n.script) return; stopWalk(false); walker = { n: desc.n, until: now + D.WALK.secs, desc, blocked: 0, go: { x: 0, y: 0, z: 0 } }; }      // đang có người đi cùng thì người đó về chỗ trước
  function stopWalk(sayIt) {
    if (!walker) return; const w = walker; walker = null; w.n.goal = null; Object.assign(w.n.it, { x: w.n.c.x, y: (w.n.homeY ?? 0) + 0.8, z: w.n.c.z });      // điểm tương tác về lại chỗ đứng
    if (sayIt) ui.bubble(K.headOf(w.n), fill(w.desc, D.WALK.done[w.desc.kind] || D.WALK.done.young), 3.5);
  }
  /** câu gõ tự do → 'bye' (kết thúc), 'end' (đóng khung để hành động), hoặc undefined (đã đáp, quay lại danh sách). Khớp ở campus_talk_match.js */
  async function freeText(desc, m, said) {
    const C = context(desc, m), r = resolveSaid(desc, said);
    if (r.type === 'topic') { await runTopic(desc, m, r.topic); return; }
    if (r.type === 'place') { await say(desc, C, r.line); return; }
    if (r.type === 'deflect') { await say(desc, C, pick(D.DEFLECT[desc.kind])); return; }
    const it = r.intent, order = it.act === 'order' && (desc.extra || []).find(e => e.order);
    if (order) { desc.after = order.fn; return 'end'; }                                   // người bán: mở luôn bảng chọn món
    const topic = (it.topic && desc.topics.find(t => it.topic.includes(t.id))) || (it.game && desc.topics.find(t => t.game === it.game));
    if (topic) { await runTopic(desc, m, topic); return; }
    await say(desc, C, pick(it.re[desc.kind]));
    if (it.act === 'bye' || (it.act === 'unfollow' && !(walker && walker.n === desc.n))) return it.act === 'bye' ? 'bye' : undefined;
    if (it.act === 'unfollow') { stopWalk(false); return; }
    if (it.act === 'photo') { actPhoto(desc); return 'end'; }
    if (it.act === 'follow' && desc.kind === 'elder') { actFollow(desc); return 'end'; }      // chỉ người lớn trong trường mới đi cùng; học sinh đã từ chối bằng câu đáp
  }

  /**
   * Một cuộc trò chuyện. desc = { id, name, short, kind: 'elder' | 'young' | 'mate', self (tự xưng), topics, hello, back, bye, fill?, talk?(on), n? (nhân vật people.js),
   *   extra? [{ label, fn }] (lựa chọn thêm như "Gọi món"), absent (số bạn vắng, chỉ cho bạn cùng lớp), noLock (bên gọi đã giữ khoá) }.
   */
  async function converse(desc) {
    if (!desc.noLock && (!K.idle() || !K.lock('talk'))) return;
    let after = null;
    try {
      const m = memo(desc.id); desc.after = null;
      let line = variant(pick(desc.hello), context(desc, m));
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const extra = [...(desc.extra || []), ...(walker && walker.n === desc.n ? [{ label: fill(desc, D.MENU.stop), fn: () => stopWalk(false) }] : [])];
        const labels = [...desc.topics.map(t => (m.done.includes(t.id) ? '✓ ' : '') + fill(desc, t.title)), ...extra.map(e => e.label), D.MENU.bye];
        if (desc.talk) desc.talk(true);
        let i; try { i = await ui.dialog.choose(desc.name, fill(desc, line), labels, { input: { placeholder: D.MENU.input, send: D.MENU.send, max: SAID_MAX } }); } finally { if (desc.talk) desc.talk(false); }
        line = pick(desc.back);
        if (i && typeof i === 'object') { const r = await freeText(desc, m, String(i.said || '').slice(0, SAID_MAX)); if (r === 'bye' || r === 'end') { after = desc.after; break; } continue; }
        if (typeof i !== 'number' || i < 0) break;
        if (i < desc.topics.length) { await runTopic(desc, m, desc.topics[i]); continue; }
        if (i < desc.topics.length + extra.length) { after = extra[i - desc.topics.length].fn; break; }
        await say(desc, context(desc, m), pick(desc.bye)); break;
      }
      m.met++; save();
    } catch (e) { if (e !== ABORT) console.error('[trò chuyện] dừng vì lỗi:', e); }
    finally { ui.dialog.close(); if (!desc.noLock) K.unlock('talk'); }
    if (after) after();      // hành động của lựa chọn thêm (gọi món…) chạy sau khi đã đóng khung và nhả khoá
  }

  /* ----- nhân vật trong trường ----- */
  function peopleDesc(n) {
    const T = D.NPC[n.c.id], [full] = n.c.n.split(' – '), first = full.split(' ')[0].toLowerCase(), short = full.replace(/^(Bác|Bà|Cô|Thầy|Bạn)\s+/, '').replace(/\s+\d+[A-Z]\d*$/, ''),      // short = tên riêng, bỏ danh xưng và tên lớp
       elder = /^(bác|bà|cô|thầy)$/.test(first), kind = elder ? 'elder' : 'young';
    const v = K.food && K.food.byNpc(n.c.id);
    return { id: n.c.id, name: n.c.n, short, kind, self: elder ? first : 'em', n, topics: [T.job, D.THEN[T.then], D.TIP[T.tip]].filter(Boolean), hello: D.HELLO[kind], back: D.BACK[kind], bye: D.BYE[kind],
      talk: (on) => { if (!n.script) n.h.clip = on ? 'talk' : null; }, extra: v ? [{ label: D.MENU.order, order: true, fn: () => K.food.ask(v, n.c.n, null) }] : [] };
  }
  for (const n of (ctx.people && ctx.people.list) || []) {
    if (!D.NPC[n.c.id]) { console.warn('[trò chuyện] chưa có chủ đề cho nhân vật "' + n.c.id + '", giữ kiểu nói một câu'); continue; }
    n.it.fn = () => converse(peopleDesc(n));
  }

  function update(dt) {
    now += dt;
    if (poseUntil && now > poseUntil && !st.photo) { poseUntil = 0; if (ctx.people) ctx.people.poseNear(false); }      // hết giờ tạo dáng mà người chơi không chụp: ai về chỗ nấy
    if (walker) {
      const g = walker.n.h.g.position, p = player.pos, yaw = player.holder.rotation.y, d = Math.hypot(g.x - p.x, g.z - p.z);
      // người đi cùng chỉ đi trên sân: người chơi lên tầng, vào phòng học, hoặc bị tường chắn giữa hai người quá 2 giây thì họ chào rồi về chỗ
      const feet = player.holder.position.y, dy = Math.abs(feet - (walker.n.homeY ?? g.y)), dx = p.x - g.x, dz = p.z - g.z;
      rayO.x = g.x; rayO.y = g.y + 1.0; rayO.z = g.z; rayD.x = dx / (d || 1); rayD.z = dz / (d || 1);
      const wall = d > 0.5 && ctx.phys.cast(rayO, rayD, d, 0xffff0001, walker.n.col); walker.blocked = wall ? walker.blocked + dt : 0;
      if (now > walker.until || d > WALK_LOST || walker.n.script || dy > WALK_STEP || K.roomAt() || walker.blocked > WALK_BLOCKED) { stopWalk(d <= WALK_LOST); return; }
      { const it = walker.n.it; it.x = g.x; it.y = g.y + 0.8; it.z = g.z; }      // điểm tương tác đi theo người (để còn bấm E nói "về chỗ đi nhé")
      const go = walker.go; go.x = p.x - Math.sin(yaw) * WALK_BEHIND - Math.cos(yaw) * 0.7; go.z = p.z - Math.cos(yaw) * WALK_BEHIND + Math.sin(yaw) * 0.7; go.y = walker.n.homeY ?? g.y; walker.n.goal = go;
    }
  }
  return { converse, update, norm, memo, get walker() { return walker; }, stopWalk, peopleDesc };
}
