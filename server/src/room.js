// Lớp phòng chơi (Durable Object). Tách khỏi index.js và nhận lớp cha làm tham số để thử được bằng node --test với một lớp cha giả
// (index.js truyền DurableObject thật của `cloudflare:workers`).
// WebSocket dùng Hibernation API: phòng không ai cử động thì đối tượng ngủ, không tính thời gian chạy.
// Không ghi dữ liệu người chơi xuống đĩa, không ghi log nội dung trò chuyện hay địa chỉ IP.
import { parseClient, MAX_PLAYERS, CLOSE, VERSION } from './protocol.js';
import { createLimiter } from './ratelimit.js';

export const FLUSH_MS = 100;             // gộp trạng thái di chuyển, phát lại 10 lần/giây
export const HELLO_TIMEOUT_MS = 15000;   // kết nối không chào trong 15 giây thì bị dọn
export const STALE_MS = 90000;           // phiên không ping, không gửi gì quá 90 giây là đã mất mạng (client ping 25 giây/lần; thẻ nền bị trình duyệt bóp còn ~60 giây/lần)
export const ALARM_MS = 5 * 60000;       // chuông dọn phiên chết: thưa (5 phút) và chỉ đặt khi phòng còn người, để không đánh thức phòng vô ích
export const MAX_STRIKES = 5;            // số thông điệp rác được tha trước khi ngắt
export const DEFAULT_MAX_PER_IP = 3;     // số kết nối tối đa từ cùng một địa chỉ mạng trong một phòng
const CHAT_RULES = [[1, 1000], [5, 10000]];      // 1 tin/giây và 5 tin/10 giây
const STATE_RULES = [[15, 1000]];                // client gửi ~10 Hz
const EMOTE_RULES = [[2, 2000]];
const ANY_RULES = [[25, 1000]];                  // tổng mọi loại của một kết nối: quá 25 thông điệp/giây là gửi dồn dập → ngắt
const ROOM_RULES = [[240, 1000]];                // tổng của cả phòng (16 người × ~12/giây lúc đông nhất); vượt thì bỏ bớt thông điệp

const newId = () => { const a = new Uint8Array(5); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8); };
/**
 * Dấu vết rút gọn của địa chỉ mạng: 6 byte đầu của SHA-256(muối theo phòng + IP). Chỉ dùng để ĐẾM số kết nối cùng nguồn trong phòng;
 * nằm trong bộ nhớ và phần đính kèm của kết nối, mất khi kết nối đóng; không ghi log, không gửi cho ai, không so được giữa các phòng.
 */
export async function ipMark(ip, salt) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + (ip || 'không rõ')));
  return Array.from(new Uint8Array(d).slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function makeRoom(Base) {
  return class Room extends Base {
    constructor(ctx, env) {
      super(ctx, env);
      /** ws → phiên { id, name, look, s, at, ip, seen, strikes, dirty, lim } — dựng lại từ phần đính kèm mỗi khi đối tượng thức dậy */
      this.sessions = new Map();
      for (const ws of ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a) this.sessions.set(ws, this.session(a)); }
      this.timer = null;
      this.roomLim = createLimiter(ROOM_RULES);
      this.maxPerIp = Math.max(1, parseInt(env && env.MAX_PER_IP, 10) || DEFAULT_MAX_PER_IP);
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));      // ping của client được trả lời mà không đánh thức phòng
    }

    session(a) {
      return { ...a, seen: 0, strikes: 0, dirty: false, lim: { any: createLimiter(ANY_RULES), chat: createLimiter(CHAT_RULES), state: createLimiter(STATE_RULES), emote: createLimiter(EMOTE_RULES) } };
    }
    /** phần sống sót qua giấc ngủ của một phiên (≤ 16 KB): danh tính, ngoại hình, trạng thái cuối, dấu vết nguồn */
    persist(ws, se) { ws.serializeAttachment({ id: se.id, name: se.name, look: se.look, s: se.s, at: se.at, ip: se.ip }); }

    /** lần cuối kết nối này còn sống: lúc nối, lần gửi gần nhất (trong bộ nhớ), hoặc lần ping được trả lời tự động gần nhất */
    lastAlive(ws, se) {
      const auto = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      return Math.max(se.at || 0, se.seen || 0, auto ? auto.getTime() : 0);
    }
    /** dọn kết nối chưa chào quá hạn và phiên đã mất mạng đột ngột (không còn ping) */
    sweep(now) {
      for (const [ws, se] of [...this.sessions]) {
        if (!se.name ? now - se.at > HELLO_TIMEOUT_MS : now - this.lastAlive(ws, se) > STALE_MS) this.drop(ws, CLOSE.IDLE, 'idle');
      }
    }
    async alarm() {
      this.sweep(Date.now());
      if (this.sessions.size) await this.ctx.storage.setAlarm(Date.now() + ALARM_MS);      // phòng trống thì thôi đặt chuông → đối tượng được giải phóng
    }

    /** nhận kết nối để báo rõ lý do rồi đóng (trình duyệt không đọc được mã HTTP của lần nâng cấp thất bại) */
    reject(pair, code, closeCode, extra) {
      const server = pair[1];
      server.accept();
      server.send(JSON.stringify({ t: 'err', code, ...extra }));
      server.close(closeCode, code);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    async fetch(request) {
      const now = Date.now();
      this.sweep(now);
      const ip = await ipMark(request.headers.get('CF-Connecting-IP'), this.ctx.id.toString());
      const pair = new WebSocketPair();
      if (this.sessions.size >= MAX_PLAYERS) return this.reject(pair, 'full', CLOSE.FULL, { max: MAX_PLAYERS });
      let same = 0; for (const se of this.sessions.values()) if (se.ip === ip) same++;
      if (same >= this.maxPerIp) return this.reject(pair, 'ip', CLOSE.IP, { max: this.maxPerIp });
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      const se = this.session({ id: newId(), name: null, look: null, s: null, at: now, ip });
      this.sessions.set(server, se); this.persist(server, se);
      if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(now + ALARM_MS);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    webSocketMessage(ws, raw) {
      const se = this.sessions.get(ws);
      if (!se) { try { ws.close(CLOSE.BAD, 'no session'); } catch { /* đã đóng */ } return; }
      const now = Date.now(); se.seen = now;
      if (!se.lim.any.allow(now)) { this.drop(ws, CLOSE.FLOOD, 'flood'); return; }
      const r = parseClient(raw);
      if (!r.ok) { this.strike(ws, se); return; }
      const m = r.msg;
      if (m.t === 'hello') {
        if (se.name) { this.strike(ws, se); return; }
        se.name = m.name; se.look = m.look; this.persist(ws, se);
        const peers = [];
        for (const [, o] of this.sessions) if (o !== se && o.name) peers.push({ id: o.id, name: o.name, look: o.look, s: o.s });
        this.send(ws, { t: 'welcome', v: VERSION, id: se.id, name: se.name, max: MAX_PLAYERS, peers });
        this.broadcast({ t: 'join', id: se.id, name: se.name, look: se.look }, ws);
        return;
      }
      if (!se.name) { this.strike(ws, se); return; }      // phải chào trước
      if (!this.roomLim.allow(now)) return;                // cả phòng đang quá tải: bỏ bớt
      if (m.t === 's') {
        if (!se.lim.state.allow(now)) return;              // gửi nhanh quá mức: bỏ bớt, không phạt (tổng lượng đã có ANY_RULES chặn)
        se.s = m.s; se.dirty = true;
        if (!this.timer) this.timer = setTimeout(() => this.flush(), FLUSH_MS);
      } else if (m.t === 'chat') {
        if (!m.m) return;
        if (!se.lim.chat.allow(now)) { this.send(ws, { t: 'err', code: 'rate' }); return; }
        this.broadcast({ t: 'chat', id: se.id, name: se.name, m: m.m });
      } else if (m.t === 'emote') {
        if (se.lim.emote.allow(now)) this.broadcast({ t: 'emote', id: se.id, e: m.e }, ws);
      }
    }

    /** phát gộp trạng thái của những người vừa cử động; đồng thời cất trạng thái cuối vào phần đính kèm để người vào sau (và lần thức dậy sau) thấy đúng chỗ */
    flush() {
      this.timer = null;
      const l = [];
      for (const [ws, se] of this.sessions) if (se.dirty) { se.dirty = false; l.push([se.id, ...se.s]); try { this.persist(ws, se); } catch { /* kết nối vừa đóng */ } }
      if (l.length) this.broadcast({ t: 'S', l });
    }

    webSocketClose(ws, code) { this.gone(ws); try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* đã đóng hẳn */ } }
    webSocketError(ws) { this.gone(ws); }

    gone(ws) {
      const se = this.sessions.get(ws);
      if (!se) return;
      this.sessions.delete(ws);
      if (se.name) this.broadcast({ t: 'leave', id: se.id });
    }
    strike(ws, se) { if (++se.strikes >= MAX_STRIKES) this.drop(ws, CLOSE.BAD, 'bad'); }
    drop(ws, code, reason) { this.gone(ws); try { ws.close(code, reason); } catch { /* đã đóng */ } }
    send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch { this.gone(ws); } }
    /** gửi cho mọi người đã chào (trừ except) */
    broadcast(obj, except) {
      const text = JSON.stringify(obj), dead = [];
      for (const [ws, se] of this.sessions) { if (ws === except || !se.name) continue; try { ws.send(text); } catch { dead.push(ws); } }
      for (const ws of dead) this.gone(ws);
    }
  };
}
