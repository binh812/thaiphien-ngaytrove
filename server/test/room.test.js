// Phép thử lớp Room với giả lập tối thiểu của môi trường Workers (không cần wrangler, không thêm thư viện): `node --test`
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeRoom, ipMark, FLUSH_MS, HELLO_TIMEOUT_MS, STALE_MS, ALARM_MS, MAX_STRIKES } from '../src/room.js';
import { MAX_PLAYERS, CLOSE } from '../src/protocol.js';

/* ----- giả lập: WebSocket phía máy chủ, cặp socket, Response 101, ngữ cảnh Durable Object ----- */
class FakeWs {
  constructor() { this.sent = []; this.closed = null; this.att = null; this.accepted = false; }
  accept() { this.accepted = true; }
  send(text) { if (this.closed) throw new Error('đã đóng'); this.sent.push(text); }
  close(code, reason) { if (!this.closed) this.closed = { code, reason }; }
  serializeAttachment(v) { this.att = structuredClone(v); }
  deserializeAttachment() { return this.att ? structuredClone(this.att) : null; }
  /** các thông điệp JSON đã gửi cho kết nối này, lọc theo loại */
  msgs(t) { return this.sent.filter((s) => s !== 'pong').map((s) => JSON.parse(s)).filter((m) => !t || m.t === t); }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new FakeWs(); this[1] = new FakeWs(); } };
globalThis.WebSocketRequestResponsePair = class { constructor(req, res) { this.request = req; this.response = res; } };
const RealResponse = globalThis.Response;
globalThis.Response = class { constructor(body, init = {}) { this.status = init.status ?? 200; this.webSocket = init.webSocket; } };      // Response của node không nhận mã 101
class Base { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
const Room = makeRoom(Base);

function fakeCtx(sockets = []) {
  const ctx = {
    sockets, auto: new Map(), alarmAt: null, autoPair: null,
    id: { toString: () => 'phòng-thử' },
    getWebSockets: () => ctx.sockets.filter((w) => !w.closed),
    acceptWebSocket: (ws) => { ctx.sockets.push(ws); },
    setWebSocketAutoResponse: (p) => { ctx.autoPair = p; },
    getWebSocketAutoResponseTimestamp: (ws) => (ctx.auto.has(ws) ? new Date(ctx.auto.get(ws)) : null),
    storage: { getAlarm: async () => ctx.alarmAt, setAlarm: async (t) => { ctx.alarmAt = t; }, deleteAlarm: async () => { ctx.alarmAt = null; } },
  };
  return ctx;
}
const req = (ip = '203.0.113.7') => ({ headers: { get: (k) => (k === 'CF-Connecting-IP' ? ip : null) } });
const HELLO = (name = 'An') => JSON.stringify({ t: 'hello', v: 1, name, look: { gender: 'm' } });
const STATE = (x = 1) => JSON.stringify({ t: 's', p: [x, 0, 2], r: 0, v: 1 });
/** nối một người vào phòng; trả về socket phía máy chủ (nơi Room gửi ra) hoặc socket bị từ chối */
async function connect(room, ctx, ip) {
  const before = ctx.sockets.length, res = await room.fetch(req(ip));
  assert.equal(res.status, 101);
  return ctx.sockets.length > before ? ctx.sockets[ctx.sockets.length - 1] : null;
}
async function joinAs(room, ctx, name, ip) { const ws = await connect(room, ctx, ip); room.webSocketMessage(ws, HELLO(name)); return ws; }

let clock;
beforeEach(() => { clock = mock.timers; clock.enable({ apis: ['setTimeout', 'Date'], now: 1_700_000_000_000 }); });
afterEach(() => mock.timers.reset());

test('chào: nhận welcome kèm danh sách người đã có; người cũ nhận join', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const a = await joinAs(room, ctx, 'An'), b = await joinAs(room, ctx, 'Bình');
  assert.equal(a.msgs('welcome')[0].peers.length, 0);
  const wb = b.msgs('welcome')[0];
  assert.deepEqual(wb.peers.map((p) => p.name), ['An']);
  assert.equal(a.msgs('join')[0].name, 'Bình');
  assert.equal(b.msgs('join').length, 0);      // không tự nhận join của chính mình
  assert.equal(ctx.autoPair.request, 'ping');
});

test('phòng đầy: người thứ 17 nhận err full và bị đóng mã 4001, không vào danh sách', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '99' });
  for (let i = 0; i < MAX_PLAYERS; i++) await joinAs(room, ctx, 'N' + i);
  const res = await room.fetch(req());
  assert.equal(room.sessions.size, MAX_PLAYERS);
  assert.equal(ctx.sockets.length, MAX_PLAYERS);
  assert.equal(res.status, 101);
});

test('phòng đầy: kết nối bị từ chối được báo rõ lý do', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '99' });
  for (let i = 0; i < MAX_PLAYERS; i++) await joinAs(room, ctx, 'N' + i);
  const pair = new WebSocketPair(); room.reject(pair, 'full', CLOSE.FULL, { max: MAX_PLAYERS });
  assert.deepEqual(JSON.parse(pair[1].sent[0]), { t: 'err', code: 'full', max: MAX_PLAYERS });
  assert.deepEqual(pair[1].closed, { code: CLOSE.FULL, reason: 'full' });
});

test('giới hạn theo IP: mặc định 3 kết nối cùng nguồn mỗi phòng; nguồn khác vẫn vào được', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, {});
  for (let i = 0; i < 3; i++) assert.ok(await connect(room, ctx, '198.51.100.9'));
  assert.equal(await connect(room, ctx, '198.51.100.9'), null);      // kết nối thứ tư bị từ chối
  assert.equal(room.sessions.size, 3);
  assert.ok(await connect(room, ctx, '198.51.100.10'));
  // một kết nối cùng nguồn rời đi thì chỗ được trả lại
  room.webSocketClose(ctx.sockets[0], 1000);
  assert.ok(await connect(room, ctx, '198.51.100.9'));
});

test('giới hạn theo IP: chỉ giữ dấu vết băm, không giữ địa chỉ; băm khác nhau giữa các phòng', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, {});
  const ws = await joinAs(room, ctx, 'An', '198.51.100.77');
  const dump = JSON.stringify(ws.att) + JSON.stringify([...room.sessions.values()].map((s) => ({ ...s, lim: 0 })));
  assert.ok(!dump.includes('198.51.100.77'), dump);
  assert.match(ws.att.ip, /^[0-9a-f]{12}$/);
  assert.notEqual(await ipMark('198.51.100.77', 'phòng-a'), await ipMark('198.51.100.77', 'phòng-b'));
  assert.equal(await ipMark('198.51.100.77', 'phòng-a'), await ipMark('198.51.100.77', 'phòng-a'));
  for (const w of ctx.sockets) for (const s of w.sent) assert.ok(!s.includes(ws.att.ip) && !s.includes('198.51'), 'dấu vết nguồn không được gửi cho client');
});

test('chào hai lần bị tính là rác; đủ 5 lần rác thì ngắt mã 4002 và mọi người nhận leave', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const a = await joinAs(room, ctx, 'An'), b = await joinAs(room, ctx, 'Bình');
  for (let i = 0; i < MAX_STRIKES - 1; i++) { clock.tick(200); room.webSocketMessage(b, HELLO('Bình')); }
  assert.equal(b.closed, null);
  assert.equal(a.msgs('join').length, 1);      // chào lại không phát join lần nữa
  clock.tick(200); room.webSocketMessage(b, '{hỏng');
  assert.deepEqual(b.closed, { code: CLOSE.BAD, reason: 'bad' });
  assert.equal(a.msgs('leave').length, 1);
  assert.equal(room.sessions.size, 1);
});

test('chưa chào mà gửi trạng thái/chat: không phát cho ai, tính là rác', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const a = await joinAs(room, ctx, 'An'), lurker = await connect(room, ctx);
  room.webSocketMessage(lurker, STATE()); room.webSocketMessage(lurker, JSON.stringify({ t: 'chat', m: 'lén' }));
  clock.tick(FLUSH_MS + 1);
  assert.equal(a.msgs('S').length + a.msgs('chat').length, 0);
  assert.equal(room.sessions.get(lurker).strikes, 2);
  assert.equal(lurker.msgs().length, 0);      // người chưa chào không nhận gì của phòng
});

test('gửi dồn dập: quá 25 thông điệp trong một giây thì ngắt mã 4008', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, {});
  const a = await joinAs(room, ctx, 'An');
  for (let i = 0; i < 24; i++) room.webSocketMessage(a, STATE(i));      // + 1 lời chào = 25
  assert.equal(a.closed, null);
  room.webSocketMessage(a, STATE(99));
  assert.deepEqual(a.closed, { code: CLOSE.FLOOD, reason: 'flood' });
  assert.equal(room.sessions.size, 0);
});

test('nhịp bình thường 10 lần/giây suốt 5 giây không bị ngắt, không bị bỏ', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const a = await joinAs(room, ctx, 'An'), b = await joinAs(room, ctx, 'Bình');
  for (let i = 0; i < 50; i++) { clock.tick(100); room.webSocketMessage(a, STATE(i)); }
  clock.tick(FLUSH_MS + 1);
  assert.equal(a.closed, null);
  const rows = b.msgs('S').flatMap((m) => m.l);
  assert.equal(rows.length, 50);
  assert.equal(rows[49][1], 49);
});

test('trần cả phòng: quá 240 thông điệp/giây thì phần vượt bị bỏ, không ai bị ngắt oan', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '99' });
  const all = []; for (let i = 0; i < 16; i++) all.push(await joinAs(room, ctx, 'N' + i));
  clock.tick(2000);
  let chats = 0;
  for (let k = 0; k < 20; k++) for (const ws of all) room.webSocketMessage(ws, STATE(k));      // 320 thông điệp trong cùng một giây, mỗi người 20
  for (const ws of all) assert.equal(ws.closed, null);
  room.webSocketMessage(all[0], JSON.stringify({ t: 'chat', m: 'còn nghe không' }));
  chats = all[1].msgs('chat').length;
  assert.equal(chats, 0);      // đã quá trần 240 → tin này bị bỏ
  clock.tick(1001);
  room.webSocketMessage(all[0], JSON.stringify({ t: 'chat', m: 'giờ thì được' }));
  assert.equal(all[1].msgs('chat').length, 1);
});

test('flush: gộp trạng thái mới nhất của từng người thành một gói, cất vào phần đính kèm', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const a = await joinAs(room, ctx, 'An'), b = await joinAs(room, ctx, 'Bình');
  room.webSocketMessage(a, STATE(1)); room.webSocketMessage(a, STATE(2)); room.webSocketMessage(b, STATE(7));
  assert.equal(b.msgs('S').length, 0);      // chưa tới nhịp phát
  clock.tick(FLUSH_MS + 1);
  const packs = b.msgs('S');
  assert.equal(packs.length, 1);
  assert.deepEqual(packs[0].l.map((r) => [r[0], r[1]]).sort(), [[a.att.id, 2], [b.att.id, 7]].sort());
  assert.equal(a.att.s[0], 2);
  clock.tick(1000);
  assert.equal(b.msgs('S').length, 1);      // không ai cử động thì không phát, không còn hẹn giờ
  assert.equal(room.timer, null);
});

test('chat: phát cho cả phòng kể cả người nhắn, đã lọc; vượt 1 tin/giây thì người nhắn nhận err rate', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const a = await joinAs(room, ctx, 'An'), b = await joinAs(room, ctx, 'Bình');
  room.webSocketMessage(a, JSON.stringify({ t: 'chat', m: 'vcl đẹp thế' }));
  room.webSocketMessage(a, JSON.stringify({ t: 'chat', m: 'tin thứ hai' }));
  assert.deepEqual(b.msgs('chat').map((m) => m.m), ['*** đẹp thế']);
  assert.equal(a.msgs('chat').length, 1);
  assert.deepEqual(a.msgs('err'), [{ t: 'err', code: 'rate' }]);
  assert.equal(b.msgs('err').length, 0);
});

test('dựng lại phiên sau khi ngủ: tên, ngoại hình, vị trí cuối, dấu vết nguồn còn nguyên; phòng chạy tiếp bình thường', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, {});
  const a = await joinAs(room, ctx, 'An', '198.51.100.1'), b = await joinAs(room, ctx, 'Bình', '198.51.100.2');
  room.webSocketMessage(a, STATE(5)); clock.tick(FLUSH_MS + 1);
  // ngủ: bộ nhớ mất, chỉ còn các socket và phần đính kèm
  const ctx2 = fakeCtx(ctx.sockets), woke = new Room(ctx2, {});
  assert.equal(woke.sessions.size, 2);
  assert.deepEqual([...woke.sessions.values()].map((s) => s.name).sort(), ['An', 'Bình']);
  const c = await joinAs(woke, ctx2, 'Chi', '198.51.100.3');
  const peerA = c.msgs('welcome')[0].peers.find((p) => p.name === 'An');
  assert.equal(peerA.s[0], 5);
  assert.deepEqual(peerA.look, { gender: 'm' });
  woke.webSocketMessage(b, JSON.stringify({ t: 'chat', m: 'vẫn đây' }));
  assert.equal(a.msgs('chat').at(-1).name, 'Bình');
  // giới hạn theo IP vẫn đếm đúng sau khi thức dậy
  assert.ok(await connect(woke, ctx2, '198.51.100.1')); assert.ok(await connect(woke, ctx2, '198.51.100.1'));
  assert.equal(await connect(woke, ctx2, '198.51.100.1'), null);
});

test('dọn phiên chết: đã chào nhưng không ping quá 90 giây thì bị đóng khi có người mới vào; người còn ping thì ở lại', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const dead = await joinAs(room, ctx, 'Mất mạng'), alive = await joinAs(room, ctx, 'Còn đây');
  clock.tick(STALE_MS - 5000); ctx.auto.set(alive, Date.now());      // người còn sống vừa được trả lời ping
  clock.tick(10000);
  assert.equal(room.sessions.size, 2);      // chưa ai kiểm
  const c = await joinAs(room, ctx, 'Chi');
  assert.deepEqual(dead.closed, { code: CLOSE.IDLE, reason: 'idle' });
  assert.equal(alive.closed, null);
  assert.deepEqual(c.msgs('welcome')[0].peers.map((p) => p.name), ['Còn đây']);
  assert.equal(alive.msgs('leave').length, 1);
});

test('dọn phiên chết: kết nối không chào quá 15 giây bị dọn; người vừa gửi trạng thái không bị coi là chết', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const lurker = await connect(room, ctx), mover = await joinAs(room, ctx, 'Đang đi');
  clock.tick(HELLO_TIMEOUT_MS + 1); room.sweep(Date.now());
  assert.equal(lurker.closed.code, CLOSE.IDLE);
  clock.tick(STALE_MS - 1000); room.webSocketMessage(mover, STATE(3)); clock.tick(2000); room.sweep(Date.now());
  assert.equal(mover.closed, null);
});

test('chuông: đặt khi có người vào, tự đặt lại khi phòng còn người, thôi khi phòng trống', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, {});
  assert.equal(ctx.alarmAt, null);
  const a = await joinAs(room, ctx, 'An');
  assert.equal(ctx.alarmAt, Date.now() + ALARM_MS);
  clock.tick(ALARM_MS); ctx.auto.set(a, Date.now() - 1000); ctx.alarmAt = null;
  await room.alarm();
  assert.equal(a.closed, null);
  assert.equal(ctx.alarmAt, Date.now() + ALARM_MS);
  clock.tick(ALARM_MS); ctx.alarmAt = null;      // lần này An đã im lặng 5 phút
  await room.alarm();
  assert.equal(a.closed.code, CLOSE.IDLE);
  assert.equal(ctx.alarmAt, null);
});

test('rời phòng: người khác nhận leave đúng một lần dù close và error cùng tới', async () => {
  const ctx = fakeCtx(), room = new Room(ctx, { MAX_PER_IP: '9' });
  const a = await joinAs(room, ctx, 'An'), b = await joinAs(room, ctx, 'Bình');
  room.webSocketClose(b, 1001); room.webSocketError(b);
  assert.deepEqual(a.msgs('leave'), [{ t: 'leave', id: b.att.id }]);
});

test.after(() => { globalThis.Response = RealResponse; });
