// Chơi nhiều người: nối các phần mạng (net.js), người chơi khác (remote.js), khung chat (chat.js) với trò chơi.
// Chưa cấu hình máy chủ (src/net/config.js để rỗng và không có ?net=) thì hàm init thoát ngay: không giao diện, không kết nối.
// Riêng tư: chỉ gửi tên hiển thị, ngoại hình nhân vật, vị trí/dáng và tin nhắn. Danh sách lớp (tp2_class) và mọi dữ liệu lưu khác KHÔNG gửi đi.
import { param } from '../engine/util.js';
import { loadClass } from '../game/reunion_class.js';
import { NET_ON, NET_URL, LOCAL_TEST, ROOM_PARAM, NAME_PARAM, PUBLIC_ROOM, PUBLIC_SHARDS, MAX_NAME, SEND_HZ, cleanRoom } from './config.js';
import { isPublicRoom } from './pure.js';
import { createNet } from './net.js';
import { createRemotes } from './remote.js';
import { createChat } from './chat.js';

const PREF_KEY = 'tp2_net', CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789', WAVE_S = 2.5, MAX_PLAYERS = 16;      // mã phòng: bỏ các ký tự dễ nhầm (0/o, 1/l/i)
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const newCode = () => { const a = new Uint32Array(6); crypto.getRandomValues(a); return Array.from(a, (n) => CODE_CHARS[n % CODE_CHARS.length]).join(''); };
const roomLabel = (room) => (isPublicRoom(room) ? 'Sân trường chung' + (room === PUBLIC_ROOM ? '' : ' ' + room.slice(PUBLIC_ROOM.length + 1)) : 'Phòng ' + room.toUpperCase());

function loadPref() {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; return { mode: ['solo', 'pub', 'code'].includes(p.mode) ? p.mode : 'solo', room: cleanRoom(p.room) }; }
  catch (e) { console.warn('[mạng] không đọc được lựa chọn phòng đã lưu'); return { mode: 'solo', room: '' }; }
}
function savePref(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { console.warn('[mạng] trình duyệt không cho lưu lựa chọn phòng'); } }

export function init(ctx) {
  if (!NET_ON || !ctx.player || !ctx.ui) return;
  const { player } = ctx, st = player.st;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('./net.css', import.meta.url).href; document.head.appendChild(css);

  /** tên hiển thị: ô "Tên bạn" của mục Lớp mình — chỉ lấy đúng trường này, không đụng tới danh sách lớp */
  const myName = () => { const me = NAME_PARAM || (ctx.reunion && ctx.reunion.cls ? ctx.reunion.cls.me : loadClass().me) || ''; return Array.from(String(me).trim()).slice(0, MAX_NAME).join('') || 'Bạn cũ'; };

  const pref = ROOM_PARAM ? { mode: 'code', room: ROOM_PARAM } : loadPref();
  let shard = 1, joined = false, everOnline = false, sendT = 0, lastSent = '', waveT = 0;

  /* ----- chỉ báo trạng thái trên HUD ----- */
  const stat = mk('div', 'hidden'); stat.id = 'netStat'; const statTxt = mk('span'); stat.append(mk('i'), statTxt); document.getElementById('hud').appendChild(stat);
  function drawStat() {
    const s = net.status(), room = roomLabel(net.room());
    stat.className = s;
    statTxt.textContent = s === 'online' ? `${room} · ${remotes.count() + 1} người` : s === 'connecting' ? 'Đang nối…' : s === 'offline' ? 'Mất kết nối – đang nối lại…'
      : s === 'full' ? `Phòng đã đầy (${MAX_PLAYERS} người)` : s === 'toomany' ? 'Quá nhiều kết nối cùng mạng' : s === 'kicked' ? 'Máy chủ đã ngắt kết nối' : 'Chưa vào phòng';
  }

  /* ----- kết nối, người chơi khác, chat ----- */
  const net = createNet({ url: NET_URL, room: PUBLIC_ROOM, hello: () => ({ name: myName(), look: player.getLook() }) });
  const chat = createChat({
    onSend: (text) => { if (!net.send({ t: 'chat', m: text }, true)) chat.system('Đang mất kết nối — tin sẽ được gửi khi nối lại.'); },
    onWave: waveButton,
    canOpen: () => joined && st.started && !st.photo && !st.locked,
    onClose: () => { const c = ctx.pipeline.renderer.domElement; if (!document.body.classList.contains('touch') && c.requestPointerLock) { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => { /* trình duyệt chưa cho khoá lại chuột: người chơi bấm vào màn hình là được */ }); } },
    onHide: () => remotes.refresh(),
    roster: () => remotes.list().map((r) => ({ id: r.id, name: r.name })),
  });
  const remotes = createRemotes(ctx, (id, name) => chat.isHidden(id, name));

  net.on('status', (s) => {
    drawStat();
    if (s === 'full') {
      if (isPublicRoom(net.room()) && shard < PUBLIC_SHARDS) { shard++; net.open(`${PUBLIC_ROOM}-${shard}`); return; }      // phòng chung đầy: sang phòng chung kế tiếp
      chat.system('Phòng đã đầy. Hãy thử lại sau hoặc hẹn nhau một mã phòng khác.'); ctx.ui.toast('Phòng đã đầy — bạn đang chơi một mình', 5);
    } else if (s === 'toomany') chat.system('Đã có quá nhiều kết nối từ cùng một mạng trong phòng này. Đóng bớt thẻ/máy đang mở trò chơi rồi tải lại trang.');
    else if (s === 'kicked') chat.system('Máy chủ đã ngắt kết nối. Tải lại trang để vào lại.');
    else if (s === 'offline' && everOnline) chat.system('Mất kết nối. Trò chơi vẫn chạy, đang thử nối lại…');
    if (s !== 'online') { remotes.reset([]); chat.rosterChanged(); }
  });
  net.on('welcome', (m) => {
    remotes.reset(m.peers); lastSent = ''; drawStat(); chat.rosterChanged();
    chat.system(`${everOnline ? 'Đã nối lại' : 'Đã vào'} ${roomLabel(net.room())} · ${remotes.count() + 1} người. Enter để nhắn, H để vẫy tay.`);
    if (!everOnline) chat.system(isPublicRoom(net.room()) ? 'Phòng chung, ai cũng vào được: đừng chia sẻ thông tin cá nhân (họ tên đầy đủ, số điện thoại, địa chỉ…).' : 'Ai có mã phòng đều vào được — chỉ gửi mã cho bạn bè.');
    everOnline = true;
  });
  net.on('join', (m) => { const r = remotes.join(m); if (r) { if (!chat.isHidden(r.id, r.name)) chat.system(`${r.name} vừa vào phòng.`); drawStat(); chat.rosterChanged(); } });
  net.on('leave', (m) => { const id = String(m.id), name = remotes.leave(id); if (name) { if (!chat.isHidden(id, name)) chat.system(`${name} đã rời phòng.`); drawStat(); chat.rosterChanged(); } });
  net.on('S', (m) => remotes.states(m.l, net.id()));
  net.on('chat', (m) => {
    if (typeof m.m !== 'string') return;
    const mine = m.id === net.id(), id = String(m.id), name = mine ? (typeof m.name === 'string' && m.name ? m.name.slice(0, 60) : myName()) : remotes.name(id); if (!name) return;      // tên mình lấy theo bản máy chủ đã làm sạch (đúng như người khác thấy)
    const text = m.m.slice(0, 400);
    if (chat.add(mine ? '' : id, name, text, mine) && !mine) remotes.say(id, text);
  });
  net.on('emote', (m) => remotes.emote(m.id, m.e));
  net.on('err', (m) => { if (m.code === 'rate') chat.system('Bạn nhắn nhanh quá — chờ vài giây rồi nhắn tiếp.'); });

  /* ----- vẫy tay -----
   * Giao kèo với các mô-đun khác (để chỉ MỘT nơi bắt phím H):
   *  - ctx.onWave: mảng hàm không tham số. Mô-đun này thêm vào đó hàm `wave` (gửi cái vẫy tay cho cả phòng).
   *  - Nếu có ctx.campus.wave (mô-đun sân trường tự bắt phím H): mô-đun này KHÔNG bắt phím H nữa; ctx.campus.wave() cần gọi
   *    `for (const fn of ctx.onWave || []) fn()` mỗi lần người chơi vẫy. Nút 👋 gọi ctx.campus.wave().
   *  - Nếu không có ctx.campus.wave: mô-đun này tự bắt phím H như cũ.
   * wave() an toàn khi chưa vào phòng (không làm gì) và chỉ tự đặt dáng vẫy khi chưa ai đặt dáng nào. */
  function wave() {
    waveSeen = true;
    if (!joined || !st.started || st.locked || st.photo) return;
    net.send({ t: 'emote', e: 'wave' });
    if (!st.pinned && !st.clip && !st.pose) { player.setPose('wave'); waveT = WAVE_S; }
  }
  let waveSeen = false;
  const campusWave = () => (ctx.campus && typeof ctx.campus.wave === 'function' ? ctx.campus.wave : null);
  /** nút 👋 (và phím H khi không có ctx.campus.wave): nhờ mô-đun sân trường vẫy nếu có; nó quên gọi ctx.onWave thì tự gửi */
  function waveButton() { const cw = campusWave(); waveSeen = false; if (cw) cw(); if (!waveSeen) wave(); }
  (ctx.onWave || (ctx.onWave = [])).push(wave);
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || campusWave()) return;
    const a = document.activeElement; if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    wave();
  });
  function join(room) { joined = true; shard = 1; stat.classList.remove('hidden'); chat.show(true); net.open(room); drawStat(); }

  /* ----- gửi trạng thái của mình ~10 lần/giây, chỉ khi có thay đổi ----- */
  ctx.updaters.push((dt) => {
    if (waveT > 0 && (waveT -= dt) <= 0 && st.pose === 'wave' && !st.photo) player.setPose(null);
    if (!joined) return;
    sendT += dt; if (sendT < 1 / SEND_HZ) return; sendT = 0;
    if (net.status() !== 'online' || !st.started) return;
    const h = player.holder, r2 = (v) => Math.round(v * 100) / 100;
    const msg = { t: 's', p: [r2(h.position.x), r2(h.position.y), r2(h.position.z)], r: r2(h.rotation.y), v: r2(st.speed || 0), a: st.grounded ? 0 : 1, c: st.clip || 0, o: st.pose || 0 };
    const key = JSON.stringify(msg); if (key === lastSent) return;
    if (net.send(msg)) lastSent = key;
  });

  /* ----- mục "Chơi cùng bạn bè" ở màn bắt đầu ----- */
  const go = document.getElementById('go');
  if (go) {
    const box = mk('div'); box.id = 'netBox';
    const seg = mk('div', 'seg'), codeRow = mk('div', 'row'), help = mk('p', 'help');
    const MODES = [['solo', 'Một mình'], ['pub', 'Sân trường chung'], ['code', 'Mã phòng']];
    for (const [k, n] of MODES) { const b = mk('button', null, n); b.type = 'button'; b.dataset.k = k; seg.appendChild(b); }
    const inp = mk('input'); inp.type = 'text'; inp.maxLength = 16; inp.placeholder = 'mã phòng'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', 'Mã phòng'); inp.value = pref.room;
    const bNew = mk('button', null, 'Tạo mã'), bCopy = mk('button', null, 'Chép liên kết mời'); bNew.type = bCopy.type = 'button';
    codeRow.append(inp, bNew, bCopy);
    box.append(mk('h3', null, 'Chơi cùng bạn bè'), seg, codeRow, help); go.before(box);
    for (const ev of ['mousedown', 'wheel', 'touchstart']) box.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    const inviteUrl = () => { const u = new URL(location.origin + location.pathname); u.searchParams.set('room', pref.room); return u.toString(); };
    function draw() {
      for (const b of seg.children) b.classList.toggle('on', b.dataset.k === pref.mode);
      codeRow.classList.toggle('hidden', pref.mode !== 'code');
      help.textContent = '';
      if (pref.mode === 'solo') help.append('Không kết nối với ai. Bạn có thể đổi lựa chọn này ở lần vào sau.');
      else {
        help.append('Người cùng phòng thấy ', mk('b', null, myName()), ' (lấy từ ô “Tên bạn” ở mục Lớp mình), nhân vật và tin nhắn của bạn. Danh sách lớp không bị gửi đi. ');
        help.append(pref.mode === 'pub' ? `Phòng chung tối đa ${MAX_PLAYERS} người, ai cũng vào được: đừng chia sẻ thông tin cá nhân.` : pref.room ? 'Gửi mã hoặc liên kết mời cho bạn cùng lớp; ai có mã đều vào được.' : 'Nhập mã bạn bè gửi, hoặc bấm “Tạo mã” rồi gửi cho cả lớp.');
      }
    }
    seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; b.blur(); pref.mode = b.dataset.k; if (pref.mode === 'code' && !pref.room) { pref.room = newCode(); inp.value = pref.room; } savePref(pref); draw(); });
    box.addEventListener('pointerenter', draw);      // tên có thể vừa được sửa ở mục Lớp mình
    inp.addEventListener('change', () => { pref.room = cleanRoom(inp.value); inp.value = pref.room; if (!pref.room) ctx.ui.toast('Mã phòng gồm 3–16 chữ cái không dấu, chữ số hoặc gạch nối', 4); savePref(pref); draw(); });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    bNew.addEventListener('click', () => { bNew.blur(); pref.room = newCode(); inp.value = pref.room; savePref(pref); draw(); });
    bCopy.addEventListener('click', async () => {
      bCopy.blur(); pref.room = cleanRoom(inp.value) || newCode(); inp.value = pref.room; savePref(pref); draw();
      const link = inviteUrl();
      try { await navigator.clipboard.writeText(link); ctx.ui.toast('Đã chép liên kết mời — dán gửi cho bạn bè', 3); }
      catch (e) { window.prompt('Trình duyệt không cho chép tự động. Hãy chép liên kết này:', link); }
    });
    draw();
    go.addEventListener('click', () => {
      if (pref.mode === 'code') { pref.room = cleanRoom(inp.value); if (!pref.room) { ctx.ui.toast('Mã phòng chưa hợp lệ — bạn đang chơi một mình', 4); return; } }
      if (pref.mode !== 'solo') join(pref.mode === 'pub' ? PUBLIC_ROOM : pref.room);
    });
  }
  // thử nghiệm không qua màn bắt đầu: ?ui=0&net=… → vào thẳng phòng (?room= hoặc phòng chung)
  if (param('ui', '1') === '0' && LOCAL_TEST) join(ROOM_PARAM || PUBLIC_ROOM);

  addEventListener('pagehide', () => net.close());
  addEventListener('pageshow', (e) => { if (e.persisted && joined) net.open(); });      // quay lại bằng nút Back (trang lấy từ bfcache): kết nối đã bị pagehide đóng → nối lại
  ctx.net = { net, remotes, chat, join, wave, waveButton, status: () => net.status() };
}
