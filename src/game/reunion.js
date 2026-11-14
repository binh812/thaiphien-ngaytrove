// "Ngày về": lớp nội dung của buổi họp lớp — bạn cùng lớp ở cổng, đi theo người chơi, chương trình các chặng, ảnh kỷ yếu, chia tay.
// Tiết học nằm ở reunion_lesson.js, không khí ngày hội (văn nghệ, nhóm hội khác) ở reunion_fest.js, lời thoại ở reunion_data.js.
// Tắt hẳn bằng ?reunion=0.
import * as THREE from 'three';
import { param, Q } from '../engine/util.js';
import { floorY } from './people.js';
import * as D from './reunion_data.js';
import { getUI } from './reunion_ui.js';
import { makeActors } from './reunion_actors.js';
import { loadClass, saveClass, parseRoster, isSample, buildClassForm } from './reunion_class.js';
import { initLesson } from './reunion_lesson.js';
import { initFest } from './reunion_fest.js';

const KEY = 'tp2_reunion';
const GATE_PT = { x: 40.5, z: 49.7 }, SHOW_PT = { x: 36.5, z: -5.5 }, PHOTO_PT = { x: 41, z: 51.4 }, STAGE_PT = { x: 46, z: -2 };
const SHOW_ZONE = [26, 44.4, -13.5, 3.5], SHOW_SECS = 20;                                  // khu khán giả [x1, x2, z1, z2], số giây phải đứng xem
const FORMATION = [[-1.3, 0.3], [1.6, 0.3], [-1.7, 1.6], [2.0, 1.6], [-1.2, 2.9], [1.6, 2.9], [-2.5, 0.7]];   // chỗ của từng bạn so với người chơi: [sang phải, lùi sau] (m) — hai hàng hai bên, chừa lối giữa cho máy quay phía sau
const START_AT = 1.1, STOP_AT = 0.3, ANCHOR_STEP = 0.6;                                    // lệch chỗ bao nhiêu thì bước / thì dừng; người chơi đi bao xa thì dời đội hình
const FAR = 30, STUCK_SECS = 3, STUCK_MAX = 7, APART = 0.6;                                // xa quá thì chuyển tới ngay; kẹt mấy giây thì chuyển lúc khuất tầm nhìn; khoảng cách tối thiểu giữa hai bạn
const PHOTO_CAM = { x: 41, y: 1.62, z: 46.6 }, ROW_BACK = 51.9, ROW_FRONT = 51.05, FRONT_IDS = [2, 4, 6], BACK_POSES = ['peace', 'thumb', 'heart', 'peace2', 'wave'];

const freshState = () => ({ v: 1, done: {}, met: [], helped: {}, score: null, board: true, watch: 0 });
function loadState() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === 1 && s.done && Array.isArray(s.met)) return { ...freshState(), ...s }; }
  catch (e) { console.warn('[ngày về] không đọc được tiến trình đã lưu, bắt đầu lại:', e.message); }
  return freshState();
}

export function init(ctx) {
  if (param('reunion', '1') === '0') return;
  const { player, phys } = ctx, ui = getUI(ctx), actors = makeActors(ctx), cls = loadClass(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let state = loadState(), mode = 'gate', busy = false, custom = false, roster = [], absent = [], vangI = 0, saveWarned = false;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { if (!saveWarned) { saveWarned = true; console.warn('[ngày về] trình duyệt không cho lưu tiến trình:', e.message); } } };
  const male = () => player.getLook().gender !== 'f';
  const ground = (x, y, z, col) => floorY(phys, x, y, z, col ?? undefined);
  const lock = (on) => { const st = player.st; if (on) { st.locked = 'reunion'; if (ctx.ui) ctx.ui.prompt(''); } else if (st.locked === 'reunion') st.locked = false; };      // khoá có chủ: không nhả nhầm khoá của module khác

  /* ----- phân vai theo danh sách lớp ----- */
  const slots = D.MATES.map((def, i) => ({ def, i, a: null, present: false, name: '', note: '', g: def.g, lineI: 0, it: null, go: false, gave: -1 }));
  const present = () => slots.filter(s => s.present);
  const label = (sl) => custom ? sl.name + (sl.note ? ' – ' + sl.note : '') : `${sl.name} – ${sl.def.role}`;
  /** áp danh sách lớp vào bảy vai: 7 dòng đầu có mặt (đổi tên, đổi giới thì dựng lại mô hình), các dòng sau là bạn vắng */
  function recast(first) {
    roster = parseRoster(cls.list); custom = !isSample(cls); absent = roster.slice(slots.length).map(e => e.name);
    for (const sl of slots) {
      const e = roster[sl.i], g = (e && e.g) || sl.def.g, look = D.LOOKS[g][sl.i], [x, z, f] = sl.def.spot;
      if (first) { sl.a = actors.add({ x, y: 0.02, z, f }, look, { probe: true }); sl.it = { x, y: 0.8, z, r: 0, label: '', fn: () => chat(sl) }; ctx.interact.push(sl.it); }
      else if (g !== sl.g) actors.relook(sl.a, look);
      Object.assign(sl, { g, present: !!e, name: e ? e.name : '', note: e ? e.note : '' });
      sl.a.off = !sl.present; sl.it.label = 'Nói chuyện với ' + label(sl); if (!sl.present) actors.solid(sl.a, false);
    }
    state.met = state.met.filter(id => slots.some(s => s.def.id === id && s.present));
  }
  /** vai id do ai giữ; vai vắng mặt (danh sách ngắn) thì một bạn có mặt nói thay — tránh trùng với người đang nói nếu được */
  function slotFor(id, speaker) {
    const sl = slots.find(s => s.def.id === id); if (!sl) return null; if (sl.present) return sl;
    const P = present(); if (!P.length) return null;
    const c = P[sl.i % P.length]; return c === speaker && P.length > 1 ? P[(sl.i + 1) % P.length] : c;
  }
  /** điền ký hiệu thay thế (xem đầu reunion_data.js); speaker = vai đang nói */
  function fill(s, speaker, extra) {
    const out = s.replace(/\{(@?)(\w+)\}/g, (m, at, k) => {
      if (extra && k in extra) return extra[k];
      if (k === 'me') return cls.me || 'bạn hiền'; if (k === 'em') return cls.me ? 'em ' + cls.me : 'em';
      if (k === 'x') return male() ? 'ông' : 'bà'; if (k === 'ac') return male() ? 'anh' : 'chị'; if (k === 'Ac') return male() ? 'Anh' : 'Chị';
      if (k === 'lop') return cls.cls; if (k === 'khoa') return cls.year;
      if (k === 'vang') return absent.length ? absent[vangI++ % absent.length] : '';
      const sl = slotFor(k, speaker); return sl ? (at ? (sl.g === 'm' ? 'thằng ' : 'cái ') : '') + sl.name : m;
    });
    return out.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());      // tên/đại từ điền vào đầu câu thì viết hoa
  }
  /** một câu trong dữ liệu → chuỗi đã điền, hoặc null nếu câu không dùng được (cần {vang} mà lớp không vắng ai) */
  function text(raw, speaker, extra) {
    if (raw == null) return null;
    let s = typeof raw === 'string' ? raw : raw.t;
    if (s.includes('{vang}') && !absent.length) { s = typeof raw === 'string' ? null : raw.alt; if (s == null) return null; }
    return fill(s, speaker, extra);
  }
  /** người nói theo mã: 'co' cô chủ nhiệm, 'me' người chơi, còn lại là mã vai → { kind, sl, label } */
  function who(id, speaker) {
    if (id === 'co') return { kind: 'co', sl: null, label: D.TEACHER };
    if (id === 'me') return { kind: 'me', sl: null, label: cls.me || 'Bạn' };
    const sl = slotFor(id, speaker); return sl ? { kind: 'mate', sl, label: label(sl) } : null;
  }
  /** một câu thoại không cắt máy (ở cổng, lúc chia tay): người nói phát clip nói chuyện */
  async function speak(id, raw, extra) {
    const sp = who(id), s = sp && text(raw, sp.sl, extra); if (s == null) return;
    if (sp.sl) sp.sl.a.clip = 'talk';
    try { await ui.dialog.say(sp.label, s); } finally { if (sp.sl) sp.sl.a.clip = null; }
  }

  /* ----- chặng 1: gặp lại lớp mình ở cổng ----- */
  async function chat(sl) {
    if (busy || !sl.present) return; busy = true; lock(true);
    try {
      const id = sl.def.id, sayAs = (raw, extra) => speak(id, raw, extra);
      if (!state.met.includes(id)) {
        if (custom && sl.note) await ui.dialog.say(cls.me || 'Bạn', fill(D.NOTE_GREET, null, { n: sl.name, note: sl.note }));
        await sayAs(sl.def.greet); state.met.push(id); save();
      } else {
        const n = sl.def.say.length; let raw = null;
        for (let k = 0; k < n && raw == null; k++) { const c = sl.def.say[sl.lineI++ % n]; if (text(c, sl) != null) raw = c; }      // bỏ qua câu không dùng được với danh sách hiện tại
        if (raw != null) await sayAs(raw);
      }
      checkGate();
    } finally { ui.dialog.close(); lock(false); busy = false; }
  }
  /** đã chào hết các bạn đang có mặt thì xong chặng 1 — gọi sau mỗi lần nói chuyện và mỗi lần sửa danh sách (danh sách thu nhỏ có thể làm "đủ mặt" ngay) */
  function checkGate() {
    const P = present(); if (state.done.gate || mode !== 'gate' || !P.length || !P.every(s => state.met.includes(s.def.id))) return;
    complete('gate'); setMode('follow'); if (ctx.ui) ctx.ui.toast(fill(D.GATE.allMet), 7);
  }
  function atGate() {
    const p = player.pos;
    for (const sl of present()) {
      const a = sl.a, g = a.h.g.position, [x, z, f] = sl.def.spot, near = (g.x - p.x) ** 2 + (g.z - p.z) ** 2 < 4.5 * 4.5;
      if (a.to && Math.hypot(a.to.x - g.x, a.to.z - g.z) < 0.1) a.to = null;
      if (!a.to) actors.solid(a, true);
      a.face = near ? 'player' : f; a.look = near ? 'player' : null; a.smile = near ? 0.55 : null;
      if (a.to && a.stuck > STUCK_SECS) actors.place(a, x, ground(x, g.y, z, a.col) ?? g.y, z, f);      // đường về chỗ đứng bị chắn: đặt thẳng về chỗ
    }
  }

  /* ----- đi theo người chơi ----- */
  const anchor = { x: 0, z: 0, yaw: 0, ver: 0, set: false };
  function unseen(a) { const g = a.h.g.position, c = ctx.camera; c.getWorldDirection(tmp); tmp2.set(g.x - c.position.x, g.y + 1 - c.position.y, g.z - c.position.z); const l = tmp2.length(); return l > 0.5 && tmp2.dot(tmp) / l < 0.5; }
  const WARP_ANG = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6, Math.PI];      // lệch so với hướng "sau lưng máy quay": ưu tiên chỗ khuất tầm nhìn
  /**
   * Chuyển một bạn bị kẹt/bị bỏ xa tới cạnh người chơi: thử lần lượt các chỗ quanh người chơi, bắt đầu từ phía sau máy quay (ngoài tầm nhìn);
   * chỗ hợp lệ = có nền cùng cao độ và không bị tường/vật chắn giữa nó với người chơi. Không tìm được thì thử lại sau một giây.
   */
  function warp(sl, k) {
    const a = sl.a, p = player.pos, feet = player.holder.position.y, st = player.st, d = player.viewDir(tmp), back = Math.atan2(-d.x, -d.z);
    for (const r of [(st.fp ? 0 : st.dist) + 1.3 + 0.6 * (k % 3), 1.3 + 0.35 * (k % 3)]) for (let i = 0; i < WARP_ANG.length; i++) {
      const ang = back + WARP_ANG[(i + k) % WARP_ANG.length], dx = Math.sin(ang), dz = Math.cos(ang), x = p.x + dx * r, z = p.z + dz * r;
      const fy = floorY(phys, x, feet, z, a.col); if (fy === null || Math.abs(fy - feet) > 0.4) continue;
      if (phys.cast({ x: p.x, y: feet + 0.9, z: p.z }, { x: dx, y: 0, z: dz }, r + 0.3, 0xffff0001, a.col) || phys.cast({ x: p.x, y: feet + 0.35, z: p.z }, { x: dx, y: 0, z: dz }, r + 0.3, 0xffff0001, a.col)) continue;
      actors.place(a, x, fy, z, ang + Math.PI); sl.go = false; return true;
    }
    a.stuck = STUCK_SECS - 1; return false;
  }
  function follow(dt) {
    const p = player.pos, feet = player.holder.position.y, st = player.st, P = present();
    if (!anchor.set || Math.hypot(p.x - anchor.x, p.z - anchor.z) > ANCHOR_STEP) { anchor.x = p.x; anchor.z = p.z; anchor.yaw = player.holder.rotation.y; anchor.ver++; anchor.set = true; }
    const fx = Math.sin(anchor.yaw), fz = Math.cos(anchor.yaw), watching = inShowZone();
    P.forEach((sl, k) => {
      const a = sl.a, g = a.h.g.position, [ox, oz] = FORMATION[k], tx = anchor.x - fx * oz - fz * ox, tz = anchor.z - fz * oz + fx * ox;
      const d = Math.hypot(tx - g.x, tz - g.z), dp = Math.hypot(p.x - g.x, p.z - g.z);
      actors.solid(a, false); a.face = watching ? STAGE_PT : 'player'; a.look = watching ? null : 'player';
      if (dp > FAR || (Math.abs(g.y - feet) > 2.5 && dp > 8)) { warp(sl, k); return; }
      if (!sl.go && d > START_AT && sl.gave !== anchor.ver) sl.go = true;
      if (sl.go && d < STOP_AT) sl.go = false;
      // người chơi đứng yên ở cao độ khác (trên sân khấu, bạn dưới sân): bạn có thể vẫn "đi được" dọc chân bục nên a.stuck không tăng → đếm riêng rồi chuyển lên
      const level = Math.abs(g.y - feet) < 0.5; sl.lowT = level || !st.grounded || st.speed > 0.3 ? 0 : (sl.lowT || 0) + dt;
      if (sl.lowT > STUCK_SECS && (unseen(a) || sl.lowT > STUCK_MAX)) { sl.lowT = 0; warp(sl, k); return; }
      if (a.stuck > STUCK_SECS) {
        if (dp <= 4 && level) { sl.go = false; sl.gave = anchor.ver; a.stuck = 0; }                 // đã ở gần người chơi: thôi cố chen vào chỗ bị chắn, chờ người chơi đi tiếp
        else if (unseen(a) || a.stuck > STUCK_MAX) warp(sl, k);
      }
      a.to = sl.go ? { x: tx, z: tz } : null; a.vmax = d > 5 ? 4.2 : st.speed > 2.5 ? 3.4 : 1.7;
      if (dp < APART && dp > 0.01 && Math.abs(g.y - feet) < 1) { g.x += (g.x - p.x) / dp * (APART - dp); g.z += (g.z - p.z) / dp * (APART - dp); }      // người chơi lùi vào: né ra
    });
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i].a.h.g.position, b = P[j].a.h.g.position, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d >= APART || Math.abs(a.y - b.y) > 1) continue;
      if (d < 0.01) { a.x -= APART / 2; b.x += APART / 2; continue; }      // trùng hẳn một chỗ: không có hướng để tách, đẩy theo trục x
      const k = (APART - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k;
    }
  }
  /* ----- ngồi chơi cùng người chơi (quán nước, lửa trại): module khác giao chỗ, các bạn tới ngồi; trả lại thì đi theo tiếp ----- */
  let hang = null;      // { owner, spots: [{ x, y, z, f, clip }] } — bạn thứ k nhận chỗ thứ k, hết chỗ thì đứng quanh
  function hangout(spots, owner) { if (busy || (mode !== 'follow' && !(mode === 'hang' && hang.owner === owner))) return false; setMode('hang'); hang = { owner, spots }; return true; }
  function resume(owner) { if (mode !== 'hang' || hang.owner !== owner) return; hang = null; setMode('follow'); }
  function hangTick() {
    present().forEach((sl, k) => {
      const a = sl.a, s = hang.spots[k], g = a.h.g.position; actors.solid(a, false);
      if (!s) { a.to = null; a.face = 'player'; a.look = 'player'; return; }
      if (!sl.arrived) { a.to = { x: s.x, z: s.z }; a.vmax = 1.8; if (Math.hypot(s.x - g.x, s.z - g.z) < 0.25 || a.stuck > 2.5) { actors.place(a, s.x, s.y, s.z, s.f); sl.arrived = true; } return; }      // tới sát chỗ (hoặc bị chắn) thì đặt hẳn vào ghế
      a.to = null; a.face = s.f; a.clip = s.clip || null; a.armsDown = s.clip === 'pose_squat'; a.look = null; a.smile = 0.5;
    });
  }
  /** chữ nổi trên đầu bạn đang giữ vai id (cho module khác: tán gẫu ở quán, quanh lửa) */
  function bubbleAs(id, raw, secs = 4) { const sp = who(id), s = sp && text(raw, sp.sl); if (s != null) ui.bubble(() => actors.head(sp.sl.a, tmp2), s, secs); }
  let waveT = 0;
  function setMode(m) {
    mode = m; anchor.set = false;
    for (const sl of present()) { const a = sl.a; a.pose = null; a.clip = null; a.smile = null; a.stuck = 0; sl.go = false; sl.arrived = false; a.armsDown = false; a.probe = true; a.vmax = 1.5; if (m === 'gate') { const [x, z] = sl.def.spot; a.to = { x, z }; actors.solid(a, false); } else a.to = null; }
  }

  /* ----- chặng 3: xem văn nghệ ----- */
  function inShowZone() { const p = player.pos; return p.x > SHOW_ZONE[0] && p.x < SHOW_ZONE[1] && p.z > SHOW_ZONE[2] && p.z < SHOW_ZONE[3] && player.holder.position.y < 0.6; }
  function watchShow(dt) {
    if (!state.done.gate || state.done.show || (mode !== 'follow' && mode !== 'hang') || busy || !inShowZone()) { ui.progress('', null); return; }      // đang ngồi chơi gần đó (hang) vẫn tính là đang xem
    const t0 = state.watch; state.watch = t0 + dt; ui.progress('Đang xem văn nghệ cùng lớp mình', state.watch / SHOW_SECS);
    D.SHOW.comments.forEach(([id, raw], i) => { const at = 3 + i * 6; if (t0 < at && state.watch >= at) { const sp = who(id), s = sp && text(raw, sp.sl); if (s != null) ui.bubble(() => actors.head(sp.sl.a, tmp2), s, 4.5); } });
    if (state.watch >= SHOW_SECS) { ui.progress('', null); ui.sfx.clap(2.5, 8, 0.5); complete('show'); }
  }

  /* ----- chặng 4: ảnh kỷ yếu ----- */
  let photoOn = false;
  function startPhoto() {
    if (busy || mode !== 'follow' || player.st.photo) return; busy = true; mode = 'photo';
    const P = present(), front = P.filter(s => FRONT_IDS.includes(s.i)), back = P.filter(s => !FRONT_IDS.includes(s.i)), y = ground(PHOTO_PT.x, player.holder.position.y, ROW_BACK) ?? 0.02;
    player.teleport(PHOTO_PT.x, y, ROW_BACK, Math.PI); player.holder.rotation.y = Math.PI;
    const stand = (sl, x, z, pose) => { const a = sl.a, g = a.h.g.position; if (Math.hypot(g.x - x, g.z - z) > 7) actors.place(a, x, y, z, Math.PI); a.probe = false; a.vmax = 1.6; a.to = { x, z, y }; a.face = 'cam'; a.look = 'cam'; a.smile = 0.8; a.pose = pose; actors.solid(a, false); };
    back.forEach((sl, i) => stand(sl, PHOTO_PT.x + (i % 2 ? 1 : -1) * (Math.floor(i / 2) + 1) * 0.7, ROW_BACK, BACK_POSES[i % BACK_POSES.length]));      // người chơi đứng giữa hàng sau
    front.forEach((sl, i) => stand(sl, PHOTO_PT.x + (i - (front.length - 1) / 2) * 0.8, ROW_FRONT, 'squat'));                                        // hàng trước ngồi xổm (mặc váy thì rigged.js tự đổi sang dáng duyên)
    ctx.camera.position.set(PHOTO_CAM.x, y + PHOTO_CAM.y, PHOTO_CAM.z); player.st.yaw = 0; player.st.pitch = 0.09;
    if (ctx.people) ctx.people.taken = P.map(s => s.a.to);      // "chụp cùng" (G) không được xếp nhân vật phụ vào đúng ô của lớp
    ctx.ui.photo(); ctx.ui.toast(D.PHOTO.tip, 8); ui.caption(fill(D.PHOTO.caption)); photoOn = true;
    const sp = who(D.PHOTO.call[0]); if (sp) ui.bubble(() => actors.head(sp.sl.a, tmp2), fill(D.PHOTO.call[1]), 5);
  }
  function watchPhoto() {
    if (!photoOn || player.st.photo) return;                 // người chơi thoát chế độ chụp (đã lưu ảnh hay chưa) là xong chặng
    photoOn = false; ui.caption(null); busy = false; if (ctx.people) ctx.people.taken = null; setMode('follow'); complete('photo');
  }

  /* ----- chặng 5: chia tay ----- */
  async function startBye() {
    if (busy || mode !== 'follow') return; busy = true; lock(true);
    try {
      for (const sl of present()) { sl.a.to = null; sl.go = false; }
      for (const [id, raw] of D.BYE.lines) await speak(id, raw);
      ui.dialog.close(); await ui.fade(true);
      for (const sl of present()) { const [x, z, f] = sl.def.spot, a = sl.a; actors.place(a, x, ground(x, a.h.g.position.y, z, a.col) ?? a.h.g.position.y, z, f); }
      setMode('gate'); for (const sl of present()) { sl.a.to = null; sl.a.pose = 'wave'; } waveT = 25;
      complete('bye');
      await ui.card(D.BYE.title, fill(D.BYE.sign), [D.BYE.text], D.BYE.again);
      await ui.fade(false);
    } finally { ui.dialog.close(); lock(false); busy = false; }
  }

  recast(true);

  /* ----- chương trình, mốc chỉ đường ----- */
  const R = { ctx, ui, actors, D, slots, present, cls, fill, text, who, lock, ground, tmp: tmp2, get state() { return state; }, save, get roster() { return roster; }, get absent() { return absent; },
    get mode() { return mode; }, setMode, get busy() { return busy; }, set busy(v) { busy = v; }, complete, low: Q.grass < 0.5 };
  const lesson = initLesson(R), fest = initFest(R);
  const fourDone = () => ['gate', 'lesson', 'show', 'photo'].every(id => state.done[id]);
  const points = { gate: GATE_PT, lesson: lesson.door, show: SHOW_PT, photo: PHOTO_PT, bye: GATE_PT };
  const open = (id) => !state.done[id] && (id === 'gate' || (id === 'bye' ? fourDone() : !!state.done.gate)) && !!points[id];
  function complete(id) {
    if (state.done[id]) return; state.done[id] = true; save();
    const nm = D.STAGES.find(s => s.id === id).nm; if (ctx.ui && id !== 'gate' && id !== 'bye') ctx.ui.toast('✓ ' + nm + (fourDone() ? ' — ' + D.BYE.hint : ''), 6);
  }
  const marks = new Map();
  { const ring = new THREE.RingGeometry(0.85, 1.05, 40).rotateX(-Math.PI / 2), col = new THREE.CylinderGeometry(0.42, 0.42, 7, 20, 1, true).translate(0, 3.5, 0);
    const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xffd66a, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const mRing = mat(0.75), mCol = mat(0.13);
    for (const s of D.STAGES) { const pt = points[s.id]; if (!pt) continue; const g = new THREE.Group(); g.add(new THREE.Mesh(ring, mRing), new THREE.Mesh(col, mCol)); g.userData.noBake = true; g.visible = false; g.position.set(pt.x, 0.05, pt.z); ctx.scene.add(g); marks.set(s.id, g); } }
  const spots = [];      // điểm tương tác của các chặng: bán kính 0 khi chưa tới lượt
  function addSpot(id, pt, r, labelOf, fn) { if (!pt) return; const it = { x: pt.x, y: 0.9, z: pt.z, r: 0, label: '', fn }; ctx.interact.push(it); spots.push({ id, it, r, labelOf }); }
  addSpot('lesson', lesson.door, 2.2, () => D.LESSON.doorLabel, () => lesson.start());
  addSpot('photo', PHOTO_PT, 2.6, () => D.PHOTO.label, startPhoto);
  addSpot('bye', GATE_PT, 2.6, () => D.BYE.label, startBye);
  let markT = 0, snapMarks = false, boardT = 0; const mateItems = new Set(slots.map(s => s.it));
  function tickStages(dt) {
    markT += dt; const p = player.pos, feet = player.holder.position.y, idle = !busy && mode === 'follow';
    for (const s of spots) { const on = open(s.id) && idle; s.it.r = on ? s.r : 0; if (on) { s.it.label = s.labelOf(); s.it.y = feet + 0.8; } }
    if (!snapMarks && markT > 0.2) { snapMarks = true; for (const [id, g] of marks) { const pt = points[id], fy = ground(pt.x, pt.y ?? 0.3, pt.z); if (fy !== null) g.position.y = fy + 0.05; } }
    for (const [id, g] of marks) { g.visible = open(id) && !busy && !player.st.photo; if (g.visible) g.children[0].scale.setScalar(1 + Math.sin(markT * 3) * 0.08); }
    // các bạn đi sát người chơi nên luôn "gần nhất": khi có điểm tương tác khác trong tầm (cửa lớp, điểm chụp ảnh, nhóm hội, trống trường…) thì nhường phím E cho điểm đó
    let other = false; if (mode === 'follow') for (const it of ctx.interact) if (it.r > 0 && !mateItems.has(it) && Math.abs(it.y - p.y) < 2.4 && Math.hypot(it.x - p.x, it.z - p.z) < it.r) { other = true; break; }
    for (const sl of slots) { const it = sl.it, g = sl.a.h.g.position; it.x = g.x; it.z = g.z; it.y = g.y + 0.8; it.r = sl.present && !busy && !other && (mode === 'gate' || mode === 'follow') ? (mode === 'gate' ? 1.9 : 1.5) : 0; }
    boardT -= dt; if (boardT > 0 || ui.board.el.classList.contains('hidden')) return; boardT = 0.25;
    let cur = null; const rows = D.STAGES.map((s) => { const o = open(s.id), pt = points[s.id]; if (o && !cur) cur = s.id; return { id: s.id, nm: s.nm, done: !!state.done[s.id], cur: cur === s.id, dist: o && pt ? Math.hypot(pt.x - p.x, pt.z - p.z) : null }; });
    ui.board.render('Ngày về · lớp ' + cls.cls, 'Khoá ' + cls.year + (cls.me ? ' · ' + cls.me : ''), rows);
  }

  /* ----- bảng chương trình, danh sách lớp, làm lại ----- */
  function toggleBoard(force) { state.board = ui.board.toggle(force); boardT = 0; save(); }
  const hudBtn = document.getElementById('bPlan'); if (hudBtn) { hudBtn.classList.remove('hidden'); hudBtn.addEventListener('click', () => { hudBtn.blur(); toggleBoard(); }); }
  addEventListener('keydown', (e) => { const a = document.activeElement; if (e.code !== 'KeyJ' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || !player.st.started || player.st.photo || (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) return; toggleBoard(); });
  const applyClass = () => { saveClass(cls); recast(false); checkGate(); boardT = 0; };
  { const host = document.querySelector('#start .box'), keys = host && host.querySelector('.keys');
    if (host) { const det = ui.el('details', 'rvClassBox'); det.append(ui.el('summary', null, 'Lớp mình – tên bạn và danh sách lớp'), buildClassForm(cls, applyClass)); host.insertBefore(det, keys || null); }
    else console.warn('[ngày về] không thấy màn bắt đầu để gắn mục "Lớp mình"'); }
  let modal = null;
  ui.board.onEdit = () => {
    if (modal || busy) return; busy = true; lock(true); if (document.pointerLockElement) document.exitPointerLock();
    const genders = slots.map(s => s.g).join('');
    modal = ui.el('div', 'rvModal'); const box = ui.el('div', 'box'), done = ui.el('button', 'primary', 'Xong'); ui.stopEv(modal);
    box.append(ui.el('h2', null, 'Lớp mình'), buildClassForm(cls, applyClass), done); modal.appendChild(box); ui.root.appendChild(modal);
    done.addEventListener('click', () => { modal.remove(); modal = null; busy = false; lock(false); if (ctx.ui) ctx.ui.toast(slots.map(s => s.g).join('') !== genders ? 'Đã đổi danh sách. Bạn nào đổi nam/nữ sẽ thay hình trong giây lát.' : 'Đã đổi danh sách lớp.', 4); });
  };
  let resetArm = 0;
  ui.board.onReset = () => {
    if (busy) return;
    if (performance.now() > resetArm) { resetArm = performance.now() + 4000; if (ctx.ui) ctx.ui.toast('Bấm “Làm lại từ đầu” lần nữa để xoá tiến trình ngày về', 4); return; }
    resetArm = 0; state = { ...freshState(), board: state.board }; save(); for (const sl of slots) sl.lineI = 0;
    for (const sl of present()) { const [x, z, f] = sl.def.spot, a = sl.a; actors.place(a, x, ground(x, 0.3, z, a.col) ?? 0.02, z, f); }
    setMode('gate'); for (const sl of present()) sl.a.to = null; if (ctx.ui) ctx.ui.toast('Đã làm lại từ đầu. ' + D.GATE.hintFirst, 5);
  };

  setMode(state.done.gate && !state.done.bye ? 'follow' : 'gate'); for (const sl of present()) sl.a.to = null;
  let hinted = false;
  ctx.updaters.push((dt) => {
    if (!hinted && player.st.started) { hinted = true; if (state.board) ui.board.toggle(true); setTimeout(() => { if (!state.done.gate && !busy && ctx.ui) ctx.ui.toast(D.GATE.hintFirst + ' (J: chương trình ngày về)', 7); }, 2500); }
    if (waveT > 0) { waveT -= dt; if (waveT <= 0) for (const sl of slots) if (sl.a.pose === 'wave') sl.a.pose = null; }
    // chưa bấm "Vào trường" (đang ở màn tạo nhân vật) thì các bạn cứ đứng ở chỗ tụ tập, không kéo tới vây quanh máy quay xem trước
    if (mode === 'follow' && player.st.started && !player.st.builder) follow(dt); else if (mode === 'gate' || mode === 'follow') atGate(); else if (mode === 'hang') hangTick();
    watchShow(dt); watchPhoto(); lesson.update(dt); fest.update(dt); tickStages(dt);
    actors.update(dt); ui.update(dt);
  });
  // cho kịch bản kiểm thử và bảng điều khiển: trạng thái + các lối tắt
  ctx.reunion = { get state() { return state; }, get mode() { return mode; }, get busy() { return busy; }, ui, slots, actors, fest, lesson, chat, startPhoto, startBye, hangout, resume, bubbleAs, present, recast: () => recast(false), cls,
    meetAll() { for (const sl of present()) if (!state.met.includes(sl.def.id)) state.met.push(sl.def.id); complete('gate'); setMode('follow'); } };
}
