// Đời sống sân trường (chạy cả khi ?reunion=0): góc kỷ niệm thu thập, câu cửa miệng và lời chào của nhân vật phụ, bảng tên người chơi,
// bộ đếm trên HUD. Các trò tay chân (ném dép, ngồi ghế, máy bay giấy, sổ đầu bài) ở campus_play.js. Lời văn ở campus_data.js.
import * as THREE from 'three';
import { floorY } from './people.js';
import { getUI } from './reunion_ui.js';
import { loadClass } from './reunion_class.js';
import * as D from './campus_data.js';
import { initPlay } from './campus_play.js';
import { initFood } from './campus_food.js';
import { initNight } from './campus_night.js';
import { initCau } from './campus_cau.js';
import { initTalk } from './campus_talk.js';
import { initHoop } from './campus_hoop.js';
import { initFx } from './campus_fx.js';
import { initDaily } from './campus_daily.js';
import { initGoal } from './campus_goal.js';
import { initRope } from './campus_rope.js';
import { makeActors } from './reunion_actors.js';

const KEY = 'tp2_campus';
const MEM_R = 1.8, MEM_UP = 1.15;                          // tầm bấm E, độ cao khung ảnh so với nền
const QUIP_IN = 6, QUIP_OUT = 9, QUIP_REST = 45, GREET_IN = 3.5, GREET_REST = 90, GREET_SKIP = 20, SAY_SECS = 3.2, SOUL_TICK = 0.25;      // m và giây: xem souls()
const num = (v) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return Number.isFinite(n) && n >= 0 ? n : 0; },      // '7' (chuỗi số hợp lệ) vẫn là 7
   obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
/**
 * Chuẩn hoá dữ liệu đã lưu về đúng hình dạng (người chơi sửa tay, bản cũ, tệp hỏng): số nào không phải số hữu hạn ≥ 0 thì về 0, thiếu khoá thì
 * thêm. Mọi trò ghi vào tp2_campus đều khai ở đây — module con chỉ đọc, không tự đoán hình dạng. (talk do campus_talk.js soát từng mục.)
 */
export function normalise(s) {
  s = obj(s); const h = obj(s.hoop), g = obj(s.goal), r = obj(s.rope), book = {};
  for (const [k, v] of Object.entries(obj(s.book))) if (Array.isArray(v)) book[k] = v.filter(l => l && typeof l.d === 'string' && typeof l.t === 'string').map(l => ({ d: l.d.slice(0, 8), t: l.t.slice(0, 120) }));
  return { v: 1, mem: Array.isArray(s.mem) ? [...new Set(s.mem.filter(x => typeof x === 'string'))] : [], memDone: s.memDone === true, mango: num(s.mango), planes: num(s.planes), book,
    tag: ['off', 'on', 'photo'].includes(s.tag) ? s.tag : 'on', food: num(s.food), cau: num(s.cau), talk: obj(s.talk),
    hoop: { pts: num(h.pts), best: num(h.best), best60: num(h.best60) }, goal: { n: num(g.n), pen: num(g.pen) }, rope: { best: num(r.best) } };
}
const fresh = () => normalise({});
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); const s = JSON.parse(raw || 'null'); if (s && s.v === 1) return normalise(s); }
  catch (e) { console.warn('[sân trường] không đọc được dữ liệu đã lưu, bắt đầu lại:', e.message); }
  // có dữ liệu mà không đọc được (JSON hỏng, phiên bản lạ): giữ lại bản gốc ở tp2_campus_bak trước khi lần lưu kế ghi đè
  if (raw) { try { localStorage.setItem(KEY + '_bak', raw); console.warn('[sân trường] dữ liệu cũ không dùng được, đã chép sang ' + KEY + '_bak'); } catch (e) { console.warn('[sân trường] không chép được bản dự phòng:', e.message); } }
  return fresh();
}

export function init(ctx) {
  const { player, phys, scene } = ctx, ui = getUI(ctx), state = load(), cls = ctx.reunion ? ctx.reunion.cls : loadClass(), tmp = new THREE.Vector3();
  let warned = false;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { if (!warned) { warned = true; console.warn('[sân trường] trình duyệt không cho lưu:', e.message); } } };
  const male = () => player.getLook().gender !== 'f';
  const fill = (s, extra) => s.replace(/\{(\w+)\}/g, (m, k) => (extra && k in extra ? extra[k] : k === 'me' ? cls.me : k === 'lop' ? cls.cls : k === 'ac' ? (male() ? 'anh' : 'chị') : k === 'Ac' ? (male() ? 'Anh' : 'Chị') : m));
  const idle = () => player.st.started && !player.st.locked && !player.st.photo && !player.st.builder;
  /** MỘT phép kiểm chung cho mọi trò chơi nhỏ: người chơi rảnh tay rảnh chân — không bị kịch bản giữ, không chụp ảnh, không ngồi/bị ghim,
   *  không ở trong trò khác. game = tên trò đang hỏi (đang ở chính trò đó thì vẫn tính là rảnh). */
  const free = (game) => idle() && !player.st.pinned && (!player.st.game || player.st.game === game);
  // st.locked ghi tên chủ khoá: chỉ chủ mới nhả được, để module này không nhả nhầm khoá của module khác (và ngược lại)
  const lock = (owner) => { if (player.st.locked) return false; player.st.locked = owner; if (ctx.ui) ctx.ui.prompt(''); return true; };
  const unlock = (owner) => { if (player.st.locked === owner) player.st.locked = false; };

  /* ----- các phòng học (dùng cho sổ đầu bài, máy bay giấy, ngồi ghế băng) ----- */
  const rooms = [];
  for (const code of ['A', 'B', 'C']) {
    const b = ctx.blocks[code]; if (!b) continue;
    for (const r of b.roomNames) {
      if (b.rooms[r.i] !== 'class') continue;
      const P = (u, w) => { const p = b.W(r.u1 + u, w); return { x: p[0], z: p[1] }; }, o = P(0, -7.5), ob = P(-1, -7.5), a = b.W(r.u1, -12), c = b.W(r.u2, -3.2);
      rooms.push({ key: code + ':' + r.nm, nm: r.nm, y0: r.y, rw: r.u2 - r.u1, P, toBoard: Math.atan2(ob.x - o.x, ob.z - o.z), x1: Math.min(a[0], c[0]), x2: Math.max(a[0], c[0]), z1: Math.min(a[1], c[1]), z2: Math.max(a[1], c[1]) });
    }
  }
  const roomAt = () => { const p = player.pos, y = player.holder.position.y; return rooms.find(r => Math.abs(y - r.y0) < 1.2 && p.x > r.x1 && p.x < r.x2 && p.z > r.z1 && p.z < r.z2) || null; };

  /* ----- bộ đếm trên HUD ----- */
  const hud = ui.el('div', 'clHud'), hint = ui.el('div', 'clHint'); ui.root.append(hud, hint);
  const extra = [];      // các module con thêm mục: () => chuỗi hoặc ''
  function drawHud() {
    const parts = [`📷 Kỷ niệm ${state.mem.length}/${D.MEMORIES.length}`, ...extra.map(f => f()).filter(Boolean)], s = parts.join('  ·  ');
    if (hud.textContent !== s) hud.textContent = s; ui.board.note(`Góc kỷ niệm đã nhặt: ${state.mem.length}/${D.MEMORIES.length}`);
  }
  /** gợi ý phím ở đáy màn hình (C ngồi, R ném dép); '' để ẩn */
  let hintText = ''; const setHint = (s) => { if (s === hintText) return; hintText = s; hint.textContent = s; hint.classList.toggle('on', !!s); };

  /* ----- góc kỷ niệm ----- */
  const frames = [];
  { const border = new THREE.TorusGeometry(0.2, 0.022, 6, 4).rotateZ(Math.PI / 4), pane = new THREE.PlaneGeometry(0.25, 0.25);
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd66a }), glow = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false });
    for (const m of D.MEMORIES) {
      if (state.mem.includes(m.id)) continue;
      const g = new THREE.Group(); g.add(new THREE.Mesh(border, gold), new THREE.Mesh(pane, glow)); g.userData.noBake = true; g.position.set(m.at[0], m.at[1] + MEM_UP, m.at[2]); scene.add(g);
      const it = { x: m.at[0], y: m.at[1] + 0.8, z: m.at[2], r: MEM_R, label: 'Xem góc kỷ niệm: ' + m.nm, fn: () => pick(f) }, f = { m, g, it, gone: 0 }; ctx.interact.push(it); frames.push(f);
    } }
  async function pick(f) {
    if (!idle() || f.gone || !lock('memory')) return;
    try {      // khoá lấy xong là vào try ngay: tiếng/hiệu ứng có lỗi thì khoá vẫn được nhả
      f.gone = 0.001; f.it.r = 0; ui.sfx.ting();
      player.st.gest = { type: 'reach', t: 0, dur: 0.6, at: f.g.position.clone() }; K.fx.puff(f.g.position.x, f.g.position.y, f.g.position.z, 'spark', 10);
      await ui.dialog.say('Góc kỷ niệm · ' + f.m.nm, f.m.t);
    }
    finally { ui.dialog.close(); unlock('memory'); }
    state.mem.push(f.m.id); save(); drawHud(); drawMemMap();
    if (state.mem.length >= D.MEMORIES.length && !state.memDone) { state.memDone = true; save(); const M = D.MEMORY_DONE; ui.sfx.ting(0.6); await ui.card(M.title, M.sub, M.lines, M.btn); }
    else if (ctx.ui) ctx.ui.toast(`Đã nhặt góc kỷ niệm ${state.mem.length}/${D.MEMORIES.length}`, 3);
  }
  // bảng dịch chuyển (M): thêm mục các góc kỷ niệm chưa nhặt
  const mapEl = document.getElementById('mapPanel'), memList = ui.el('div', 'clMem');
  function drawMemMap() {
    memList.textContent = ''; const left = frames.filter(f => !f.gone); if (!left.length) return;
    memList.appendChild(ui.el('h3', null, `Góc kỷ niệm chưa nhặt (${left.length})`));
    for (const f of left) { const b = ui.el('button', 'clLoc', '📷 ' + f.m.nm); b.addEventListener('click', (e) => { e.stopPropagation(); if (player.st.locked) { if (ctx.ui) ctx.ui.toast('Đang dở tay — xong việc này rồi hãy đi.', 2.5); return; } K.fx.clear(); player.teleport(f.m.at[0], (f.y0 ?? f.m.at[1] + MEM_UP) - MEM_UP, f.m.at[2] + 0.9); if (ctx.ui) { ctx.ui.toast('Đã tới: ' + f.m.nm); ctx.ui.toggle('mapPanel', false); } }); memList.appendChild(b); }
  }
  if (mapEl) { mapEl.appendChild(memList); drawMemMap(); }
  let memSnapped = false, mt = 0;
  function tickMemories(dt) {
    mt += dt;
    if (!memSnapped && mt > 0.2) { memSnapped = true; for (const f of frames) { const fy = floorY(phys, f.m.at[0], f.m.at[1] + 0.3, f.m.at[2]); if (fy !== null) { f.g.position.y = fy + MEM_UP; f.it.y = fy + 0.8; } f.y0 = f.g.position.y; } }
    for (const f of frames) {
      if (f.gone >= 1) continue;
      if (f.gone) { f.gone = Math.min(1, f.gone + dt * 1.6); f.g.scale.setScalar(1 + f.gone * 1.5); f.g.position.y = f.y0 + f.gone * 0.6; f.g.visible = f.gone < 1; f.g.rotation.y += dt * 9; continue; }      // vừa nhặt: phóng to, bay lên rồi biến mất
      f.g.visible = f.g.position.distanceToSquared(ctx.camera.position) < 70 * 70; if (!f.g.visible) continue;
      f.g.rotation.y += dt * 0.9; if (f.y0 !== undefined) f.g.position.y = f.y0 + Math.sin(mt * 1.6 + f.m.at[0]) * 0.06;
    }
  }

  /* ----- nhân vật phụ có hồn: câu cửa miệng khi lại gần, lời chào khi đi ngang ----- */
  const souls = ((ctx.people && ctx.people.list) || []).map((n, i) => ({ n, armed: true, quipAt: 0, greetAt: 0, qi: i % 2, elder: !!n.teacher }));
  let soulT = 0, now = 0, quietUntil = 0;
  const headOf = (n) => () => { const g = n.h.g.position; return tmp.set(g.x, g.y + (n.h.look.height || 1.65) + 0.22, g.z); };
  function tickSouls(dt) {
    now += dt; soulT += dt; if (soulT < SOUL_TICK) return; soulT = 0; if (!idle() || now < quietUntil) return;      // mỗi lúc chỉ một người lên tiếng, chờ câu trước tắt hẳn
    const p = player.pos, feet = player.holder.position.y; let spoke = false;
    for (const s of souls) {
      const g = s.n.h.g.position, d = Math.hypot(g.x - p.x, g.z - p.z); if (d > QUIP_OUT) { s.armed = true; continue; }
      if (spoke || Math.abs(g.y - feet) > 1.5 || !s.n.h.g.visible || s.n.pose) continue;
      if (d < GREET_IN && now > s.greetAt && player.st.speed > 0.5 && now > s.quipAt - QUIP_REST + 3) {      // đi ngang sát bên: chào, gọi tên (mỗi người nghỉ 90 giây)
        if (Math.random() < 0.5) { s.greetAt = now + GREET_SKIP; continue; }      // không phải lần nào đi ngang cũng chào
        s.greetAt = now + GREET_REST; const set = D.GREET[(s.elder ? 'elder' : 'young') + (cls.me ? '' : 'NoName')];
        ui.bubble(headOf(s.n), fill(set[Math.floor(Math.random() * set.length)]), SAY_SECS); spoke = true; quietUntil = now + SAY_SECS + 0.6;
      } else if (d < QUIP_IN && s.armed && now > s.quipAt && s.n.c.quips) {
        s.armed = false; s.quipAt = now + QUIP_REST; ui.bubble(headOf(s.n), s.n.c.quips[s.qi++ % s.n.c.quips.length], SAY_SECS); spoke = true; quietUntil = now + SAY_SECS + 0.6;
      }
    }
  }

  /* ----- bảng tên trên đầu người chơi ----- */
  const tag = ui.el('div', 'clTag'); ui.root.appendChild(tag);
  { const panel = document.getElementById('panel');
    if (panel) {
      const h = ui.el('h3', null, 'Bảng tên trên đầu'), seg = ui.el('span'), box = ui.el('div', 'seg'); seg.appendChild(box);
      const opts = [['off', 'Tắt'], ['on', 'Bật'], ['photo', 'Cả khi chụp ảnh']], btns = opts.map(([k, nm]) => { const b = ui.el('button', state.tag === k ? 'on' : '', nm); b.addEventListener('click', () => { state.tag = k; save(); btns.forEach((x, i) => x.classList.toggle('on', opts[i][0] === k)); }); box.appendChild(b); return b; });
      panel.append(h, seg);
    } }
  function tickTag() {
    const st = player.st, show = !!cls.me && state.tag !== 'off' && st.started && !st.builder && !st.fp && (!st.photo || state.tag === 'photo') && !document.body.classList.contains('rvCine');
    if (show) { tmp.set(player.pos.x, player.pos.y + (st.pinned && st.clip ? 0.62 : 1.08), player.pos.z).project(ctx.camera); if (tmp.z >= 1 || Math.abs(tmp.x) > 1 || Math.abs(tmp.y) > 1) { tag.style.display = 'none'; return; } }
    tag.style.display = show ? '' : 'none'; if (!show) return;
    const s = cls.me + ' · ' + cls.cls; if (tag.textContent !== s) tag.textContent = s;
    tag.style.transform = `translate(-50%,-100%) translate(${((tmp.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - tmp.y) / 2 * innerHeight).toFixed(1)}px)`;
  }

  const actors = makeActors(ctx);      // vài nhân vật có xương riêng của module (nhóm đá cầu), dùng chung cơ chế ẩn/bóng/hoạt hoạ theo khoảng cách
  const K = { ctx, ui, D, state, save, cls, fill, idle, rooms, roomAt, drawHud, setHint, addHud: (f) => extra.push(f), souls, headOf, tmp, actors, seatFns: [], touchDefs: [], lock, unlock, free, quiet: () => now < quietUntil, hush: (secs) => { quietUntil = Math.max(quietUntil, now + secs); } };      // touchDefs: nút cảm ứng theo ngữ cảnh do module con đăng ký { label(), fn }
  const fx = K.fx = initFx(K);      // phản hồi dùng chung: hạt, vòng lan, tiếng ngắn, giới hạn tần suất
  const play = K.play = initPlay(K), food = K.food = initFood(K), night = initNight(K), cau = K.cau = initCau(K), talk = K.talk = initTalk(K), hoop = K.hoop = initHoop(K), daily = initDaily(K), goal = initGoal(K), rope = initRope(K);
  /* ----- nút cảm ứng theo ngữ cảnh (chỉ hiện trên máy cảm ứng): ngồi/đứng, ném dép, tâng cầu, thôi đá, xong ảnh ----- */
  const touch = ui.el('div', 'clTouch'); ui.root.appendChild(touch);
  const tBtn = (fn) => { const b = ui.el('button'), go = (e) => { e.preventDefault(); e.stopPropagation(); fn(); }; b.addEventListener('touchstart', go, { passive: false }); b.addEventListener('click', go); touch.appendChild(b); return b; };
  const tSit = tBtn(() => play.toggleSit()), tSandal = tBtn(() => play.tryThrow()), tTap = tBtn(() => cau.tap()), tQuit = tBtn(() => cau.leave()), tPhoto = tBtn(() => ctx.ui && ctx.ui.photo());
  const moreBtns = K.touchDefs.map(d => ({ d, b: tBtn(d.fn) }));
  const showBtn = (b, text) => { const on = !!text; if (b.hidden === on) b.hidden = !on; if (on && b.textContent !== text) b.textContent = text; };
  function tickTouch() {
    const st = player.st, free = idle();
    showBtn(tSit, st.started && !st.locked && play.sitting ? 'Đứng dậy' : free && play.seatNear() ? 'Ngồi' : '');
    showBtn(tSandal, free && play.canThrow() ? 'Ném dép' : ''); showBtn(tTap, cau.joined ? 'Tâng' : ''); showBtn(tQuit, cau.joined ? 'Thôi đá' : ''); showBtn(tPhoto, st.photo ? 'Xong ảnh' : ''); for (const q of moreBtns) showBtn(q.b, st.started && !st.locked && !st.photo ? q.d.label() : '');
  }
  const isTouchUi = document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches;
  drawHud();
  ctx.updaters.push((dt) => {
    if (isTouchUi) tickTouch();

    const on = player.st.started && !player.st.builder; hud.classList.toggle('on', on && !player.st.photo);
    tickMemories(dt); tickSouls(dt); play.update(dt); food.update(dt); night.update(dt); cau.update(dt); hoop.update(dt); goal.update(dt); rope.update(dt); talk.update(dt); daily.update(dt); actors.update(dt); fx.update(dt); tickTag();
    if (!ctx.reunion) ui.update(dt);      // chữ nổi: khi có Ngày về thì module đó đã cập nhật
  });
  ctx.campus = { state, frames, pick, rooms, play, souls, food, night, cau, talk, hoop, daily, goal, rope, fx, wave: daily.wave, free };
}
