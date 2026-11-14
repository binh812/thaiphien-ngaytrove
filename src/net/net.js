// Kết nối WebSocket tới máy chủ phòng chơi: tự nối lại có lùi dần, hàng đợi gửi cho thông điệp quan trọng, ping giữ kết nối.
// Không phụ thuộc gì vào phần còn lại của trò chơi; mất mạng thì chỉ phát sự kiện, không ném lỗi ra vòng lặp game.

const CLOSE_FULL = 4001, CLOSE_BAD = 4002, CLOSE_IP = 4003, CLOSE_FLOOD = 4008;
const PING_MS = 25000, PONG_WAIT_MS = 10000, BACKOFF_MIN = 1000, BACKOFF_MAX = 30000, QUEUE_MAX = 20, VERSION = 1;

/**
 * Tạo kết nối. opt = { url, room, hello: () => ({ name, look }) }.
 * Trả về { on(tên, hàm), send(obj, reliable), close(), status(), id() }.
 * Sự kiện: 'status' (chuỗi: 'connecting' | 'online' | 'offline' | 'full' | 'toomany' | 'kicked' | 'closed'), và mọi thông điệp máy chủ theo trường t
 * ('welcome', 'join', 'leave', 'S', 'chat', 'emote', 'err').
 * send(obj, true): chưa nối được thì xếp hàng (tối đa 20), gửi khi nối lại; send(obj) thường: chưa nối thì bỏ (vị trí cũ không còn giá trị).
 */
export function createNet(opt) {
  const handlers = new Map(), queue = [];
  let ws = null, state = 'closed', myId = null, tries = 0, retryT = 0, pingT = 0, pongT = 0, stopped = false, ready = false;

  const emit = (name, data) => { for (const fn of handlers.get(name) || []) { try { fn(data); } catch (e) { console.error('[mạng] lỗi khi xử lý', name, e); } } };
  const setState = (s) => { if (state !== s) { state = s; emit('status', s); } };
  const clearTimers = () => { clearTimeout(retryT); clearInterval(pingT); clearTimeout(pongT); };

  function connect() {
    if (stopped) return;
    clearTimers(); ready = false; setState('connecting');
    let sock;
    try { sock = new WebSocket(`${opt.url}/ws?room=${encodeURIComponent(opt.room)}`); }
    catch (e) { console.warn('[mạng] không mở được kết nối:', e.message || e); schedule(); return; }
    ws = sock;
    sock.addEventListener('open', () => {
      if (ws !== sock) return;
      const h = opt.hello();
      sock.send(JSON.stringify({ t: 'hello', v: VERSION, name: h.name, look: h.look }));
      pingT = setInterval(() => {
        if (sock.readyState !== WebSocket.OPEN) return;
        sock.send('ping'); clearTimeout(pongT);
        pongT = setTimeout(() => { console.warn('[mạng] máy chủ không trả lời ping, nối lại'); sock.close(); }, PONG_WAIT_MS);
      }, PING_MS);
    });
    sock.addEventListener('message', (e) => {
      if (ws !== sock || typeof e.data !== 'string') return;
      if (e.data === 'pong') { clearTimeout(pongT); return; }
      let m;
      try { m = JSON.parse(e.data); } catch (err) { console.warn('[mạng] máy chủ gửi dữ liệu không đọc được'); return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'welcome') {
        myId = m.id; tries = 0; ready = true; setState('online'); emit('welcome', m);
        for (const q of queue.splice(0)) sock.send(q);
        return;
      }
      emit(m.t, m);
    });
    sock.addEventListener('close', (e) => {
      if (ws !== sock) return;
      ws = null; ready = false; clearTimers();
      if (stopped) { setState('closed'); return; }
      if (e.code === CLOSE_FULL) { setState('full'); return; }                      // phòng đầy: không tự nối lại, để lớp trên quyết định
      if (e.code === CLOSE_IP) { setState('toomany'); return; }                    // quá số kết nối cùng mạng trong phòng: không tự nối lại
      if (e.code === CLOSE_BAD || e.code === CLOSE_FLOOD) { setState('kicked'); return; }      // bị máy chủ ngắt vì gửi sai/gửi dồn dập: không nối lại
      setState('offline'); schedule();
    });
    sock.addEventListener('error', () => { /* sự kiện close theo ngay sau; không cần xử lý riêng */ });
  }
  function schedule() {
    const wait = Math.min(BACKOFF_MAX, BACKOFF_MIN * 2 ** tries) * (0.75 + Math.random() * 0.5); tries++;
    retryT = setTimeout(connect, wait);
  }

  return {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); },
    send(obj, reliable) {
      const text = JSON.stringify(obj);
      if (ws && ready && ws.readyState === WebSocket.OPEN) { ws.send(text); return true; }
      if (reliable && !stopped) { queue.push(text); if (queue.length > QUEUE_MAX) queue.shift(); }
      return false;
    },
    /** đổi phòng (hoặc nối lần đầu) */
    open(room) { if (room) opt.room = room; stopped = false; tries = 0; queue.length = 0; if (ws) { const old = ws; ws = null; old.close(); } connect(); },
    close() { stopped = true; clearTimers(); queue.length = 0; if (ws) { const old = ws; ws = null; old.close(); } setState('closed'); },
    status: () => state,
    id: () => myId,
    room: () => opt.room,
  };
}
