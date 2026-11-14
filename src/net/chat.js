// Khung trò chuyện: Enter mở/gửi, Esc đóng; giữ ~30 tin gần nhất của phiên (không lưu đi đâu); nút ẩn từng người.
// Mọi nội dung của người khác (tên, tin nhắn) chỉ đưa vào trang bằng textContent — tuyệt đối không dùng innerHTML.
import { MAX_CHAT } from './config.js';
import { nameKey } from './pure.js';

const MAX_LINES = 30, FADE_MS = 14000;
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/**
 * opt = { onSend(text), onWave(), canOpen(): có được mở khung lúc này không, onClose(): gọi sau khi đóng (để khoá lại chuột),
 *         onHide(id, hidden): người chơi vừa ẩn/hiện một người, roster(): [{ id, name }] những người đang trong phòng }.
 * Trả về { add(id, name, text), system(text), isHidden(id), show(on), open(), close(), isOpen(), lines() }.
 */
export function createChat(opt) {
  const hidden = new Set(), hiddenNames = new Set();      // ẩn theo mã phiên VÀ theo tên hiển thị (đã chuẩn hoá): người bị ẩn nối lại nhận mã mới nhưng vẫn bị ẩn trong phiên này
  const isHidden = (id, name) => hidden.has(id) || (name != null && hiddenNames.has(nameKey(name)));
  const box = mk('div', 'hidden'); box.id = 'chat';
  const roster = mk('div', 'chatRoster'), log = mk('div', 'chatLog'), row = mk('div', 'chatRow');
  const inp = mk('input'); inp.type = 'text'; inp.maxLength = MAX_CHAT; inp.placeholder = 'Nhắn cả phòng…  Enter gửi · Esc đóng'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.enterKeyHint = 'send';
  inp.setAttribute('aria-label', 'Tin nhắn');
  const send = mk('button', null, 'Gửi'); send.type = 'button';
  const shut = mk('button', 'x', '✕'); shut.type = 'button'; shut.title = 'Đóng (Esc)';
  row.append(inp, send, shut); box.append(roster, log, row); document.body.appendChild(box);
  // nút trên thanh công cụ (bấm được cả bằng cảm ứng)
  const bar = document.getElementById('topbar');
  const bChat = mk('button', 'hidden', '💬'); bChat.id = 'bChat'; bChat.title = 'Trò chuyện (Enter)';
  const bWave = mk('button', 'hidden', '👋'); bWave.id = 'bWave'; bWave.title = 'Vẫy tay (H)';
  if (bar) bar.prepend(bChat, bWave);
  for (const ev of ['mousedown', 'wheel', 'touchstart']) box.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });

  let active = false;
  const isOpen = () => box.classList.contains('open');
  function push(el) {
    log.appendChild(el); while (log.children.length > MAX_LINES) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    setTimeout(() => el.classList.add('old'), FADE_MS);      // tin cũ mờ đi khi khung đang đóng; mở khung thì hiện lại đủ
  }
  function drawRoster() {
    roster.textContent = '';
    const people = opt.roster();
    roster.appendChild(mk('span', 'lbl', people.length ? 'Trong phòng (bấm tên để ẩn/hiện):' : 'Chưa có ai khác trong phòng.'));
    for (const p of people) {
      const off = isHidden(p.id, p.name), b = mk('button', off ? 'off' : '', p.name + (off ? ' (đã ẩn)' : '')); b.type = 'button';
      b.addEventListener('click', () => setHidden(p.id, !off, p.name));
      roster.appendChild(b);
    }
  }
  function setHidden(id, on, name) {
    if (on) { hidden.add(id); hiddenNames.add(nameKey(name)); } else { hidden.delete(id); hiddenNames.delete(nameKey(name)); }
    if (on) for (const el of [...log.children]) if (el.dataset.from === id) el.remove();
    opt.onHide(id, on);
    api.system(on ? `Đã ẩn ${name}: bạn không còn thấy nhân vật và tin nhắn của người này.` : `Đã hiện lại ${name}.`);
    if (isOpen()) drawRoster();
  }
  function open() {
    if (!active || isOpen()) return;
    dispatchEvent(new Event('blur'));      // player.js nhả mọi phím đang giữ khi cửa sổ mất tiêu điểm → mượn đúng đường đó để nhân vật không tự đi tiếp trong lúc gõ
    box.classList.add('open'); drawRoster(); log.scrollTop = log.scrollHeight;
    if (document.pointerLockElement) document.exitPointerLock();
    inp.focus({ preventScroll: true });
  }
  function close() { if (!isOpen()) return; box.classList.remove('open'); inp.blur(); opt.onClose(); }
  function submit() {
    const text = inp.value.replace(/\s+/g, ' ').trim();
    inp.value = '';
    if (text) opt.onSend(text);
  }
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();      // phím gõ trong ô chat không được lọt xuống phím tắt của trò chơi
    if (e.isComposing || e.keyCode === 229) return;      // đang gõ dở bằng bộ gõ (telex/IME): Enter là chốt chữ, chưa phải gửi
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); submit(); close(); }
    else if (e.code === 'Escape') { e.preventDefault(); close(); }
  });
  send.addEventListener('click', () => { submit(); inp.focus({ preventScroll: true }); });
  shut.addEventListener('click', close);
  bChat.addEventListener('click', () => { bChat.blur(); if (isOpen()) close(); else open(); });
  bWave.addEventListener('click', () => { bWave.blur(); opt.onWave(); });
  addEventListener('keydown', (e) => {
    if (!active || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const a = document.activeElement; if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    if (!opt.canOpen()) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); open(); }
  });

  const api = {
    /** tin của một người (id = mã phiên của họ; id rỗng = chính mình) */
    add(id, name, text, mine) {
      if (isHidden(id, mine ? null : name)) return false;
      const line = mk('div', 'msg' + (mine ? ' me' : '')); line.dataset.from = id;
      line.append(mk('b', null, name + ': '), mk('span', null, text));
      if (!mine) { const h = mk('button', 'hide', 'Ẩn'); h.type = 'button'; h.title = 'Ẩn người này'; h.addEventListener('click', () => setHidden(id, true, name)); line.appendChild(h); }
      push(line); return true;
    },
    system(text) { const last = log.lastChild; if (last && last.classList.contains('sys') && last.textContent === text && !last.classList.contains('old')) return; push(mk('div', 'msg sys', text)); },      // không lặp lại cùng một dòng nhắc liền nhau
    isHidden,
    /** bật/tắt cả khung chat và hai nút (chỉ bật khi đang ở trong một phòng) */
    show(on) { active = on; box.classList.toggle('hidden', !on); bChat.classList.toggle('hidden', !on); bWave.classList.toggle('hidden', !on); if (!on) box.classList.remove('open'); },
    rosterChanged() { if (isOpen()) drawRoster(); },
    open, close, isOpen,
    lines: () => [...log.children].map((el) => el.textContent),
  };
  return api;
}
