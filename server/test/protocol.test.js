// Phép thử kiểm thông điệp và giới hạn tần suất: `node --test test/` trong thư mục server/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClient, cleanText, cleanName, cleanChat, cleanLook, cleanState, roomName, originAllowed, BOUNDS, MAX_CHAT, MAX_NAME, MAX_RAW, PUBLIC_ROOM, DEFAULT_NAME } from '../src/protocol.js';
import { createLimiter } from '../src/ratelimit.js';

const LOOK = { gender: 'f', skin: 1, hair: 'pony', hairColor: 0, outfit: 'aodai', height: 1.58, build: 1, face: 2, age: 'mid', top: 'aodai', topColor: '#C8262B' };
const hello = (o = {}) => JSON.stringify({ t: 'hello', v: 1, name: 'Hoa', look: LOOK, ...o });

test('cleanText: bỏ ký tự điều khiển, ký tự đổi chiều chữ, gộp khoảng trắng', () => {
  assert.equal(cleanText('a' + String.fromCodePoint(0) + 'b\n\tc' + String.fromCodePoint(0x202e) + 'd' + String.fromCodePoint(0x200b) + '  e', 50), 'a b cd e');      // ký tự điều khiển thành dấu cách; ký tự vô hình bị xoá hẳn
  assert.equal(cleanText(42, 50), '');
});

test('cleanText: cắt theo điểm mã, không làm vỡ emoji; bớt dấu chồng', () => {
  assert.equal(cleanText('😀😀😀😀', 3), '😀😀😀');
  const zalgo = cleanText('a' + String.fromCodePoint(0x301).repeat(40) + 'b', 50);
  assert.equal(Array.from(zalgo).length, 4, zalgo);      // á (đã gộp) + 2 dấu chồng được giữ + b
});

test('tin nhắn dài bị cắt còn đúng 120 ký tự; tin rỗng thành null', () => {
  assert.equal(Array.from(cleanChat('ă'.repeat(500))).length, MAX_CHAT);
  assert.equal(cleanChat('   \u0007 '), null);
});

test('tên: cắt 20 ký tự, lọc từ tục, rỗng thì lấy tên mặc định', () => {
  assert.equal(Array.from(cleanName('x'.repeat(80))).length, MAX_NAME);
  assert.equal(cleanName('  Minh   lớp trưởng '), 'Minh lớp trưởng');
  assert.equal(cleanName(''), DEFAULT_NAME);
  assert.equal(cleanName(undefined), DEFAULT_NAME);
  assert.equal(cleanName('địt'), DEFAULT_NAME);      // chỉ còn *** → không còn chữ nào
  assert.equal(cleanName('Tuấn vcl'), 'Tuấn ***');
});

test('ngoại hình: giữ trường hợp lệ, bỏ trường lạ và sai kiểu, kẹp chiều cao', () => {
  const raw = JSON.parse('{"__proto__":{"gender":"f","skin":3},"constructor":{"prototype":{"x":1}},"height":9,"skin":"x","evil":"<img>","hair":"../../x","bottomColor":"red","glasses":2}');
  assert.ok(Object.hasOwn(raw, '__proto__'));      // JSON.parse tạo khoá riêng tên __proto__, đúng như dữ liệu từ mạng
  const out = cleanLook({ ...LOOK, ...raw, ['__proto__']: raw.__proto__ });
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(({}).x, undefined);
  assert.deepEqual(out, { gender: 'f', hairColor: 0, outfit: 'aodai', height: 1.95, build: 1, face: 2, age: 'mid', glasses: 2, top: 'aodai', topColor: '#c8262b' });
});

test('ngoại hình: không phải đối tượng hoặc quá 2 KB thì từ chối', () => {
  assert.equal(cleanLook(null), null);
  assert.equal(cleanLook([1, 2]), null);
  assert.equal(cleanLook('m'), null);
  assert.equal(cleanLook({ gender: 'm', pad: 'x'.repeat(2100) }), null);
  assert.deepEqual(cleanLook({}), { gender: 'm' });
});

test('trạng thái: kẹp toạ độ trong bản đồ, chuẩn hoá góc, kẹp tốc độ', () => {
  const s = cleanState({ p: [1e9, -1e9, 12.3456], r: Math.PI * 5, v: 999, a: 1, c: 'sit_idle', o: 'peace' });
  assert.deepEqual(s.slice(0, 3), [BOUNDS.x[1], BOUNDS.y[0], 12.35]);
  assert.ok(Math.abs(Math.abs(s[3]) - 3.14) < 0.01);
  assert.deepEqual(s.slice(4), [8, 1, 'sit_idle', 'peace']);
});

test('trạng thái: NaN, Infinity, thiếu trường, sai kiểu đều bị từ chối; clip/dáng lạ bị bỏ', () => {
  assert.equal(cleanState({ p: [NaN, 0, 0], r: 0, v: 0 }), null);
  assert.equal(cleanState({ p: [0, 0], r: 0, v: 0 }), null);
  assert.equal(cleanState({ p: [0, 0, '3'], r: 0, v: 0 }), null);
  assert.equal(cleanState({ p: [0, 0, 0], r: Infinity, v: 0 }), null);
  assert.equal(cleanState({ p: 'abc', r: 0, v: 0 }), null);
  assert.deepEqual(cleanState({ p: [0, 0, 0], r: 0, v: 0, c: '<script>', o: { x: 1 } }).slice(5), [0, 0, 0]);
});

test('parseClient: hello hợp lệ trả về tên và ngoại hình đã làm sạch', () => {
  const r = parseClient(hello({ name: 'Hoa\u0000 12A1' }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.msg, { t: 'hello', name: 'Hoa 12A1', look: { ...LOOK, topColor: '#c8262b' } });
});

test('parseClient: rác bị từ chối kèm lý do', () => {
  assert.equal(parseClient(new ArrayBuffer(4)).why, 'binary');
  assert.equal(parseClient('x'.repeat(MAX_RAW + 1)).why, 'size');
  assert.equal(parseClient('{oops').why, 'json');
  assert.equal(parseClient('[1,2]').why, 'shape');
  assert.equal(parseClient('null').why, 'shape');
  assert.equal(parseClient('{"t":"admin"}').why, 'type');
  assert.equal(parseClient(hello({ v: 99 })).why, 'version');
  assert.equal(parseClient(hello({ look: 'm' })).why, 'look');
  assert.equal(parseClient('{"t":"s","p":[0,0]}').why, 'state');
  assert.equal(parseClient('{"t":"chat","m":5}').why, 'chat');
  assert.equal(parseClient('{"t":"emote","e":"explode"}').why, 'emote');
});

test('parseClient: chat được cắt và lọc; emote hợp lệ đi qua', () => {
  const r = parseClient(JSON.stringify({ t: 'chat', m: 'vcl ' + 'a'.repeat(300) }));
  assert.equal(r.ok, true);
  assert.equal(Array.from(r.msg.m).length, MAX_CHAT);
  assert.ok(r.msg.m.startsWith('*** aaa'));
  assert.deepEqual(parseClient('{"t":"emote","e":"wave"}'), { ok: true, msg: { t: 'emote', e: 'wave' } });
});

test('mã phòng: rỗng là phòng chung, sai dạng là null, chữ hoa về chữ thường', () => {
  assert.equal(roomName(null), PUBLIC_ROOM);
  assert.equal(roomName(''), PUBLIC_ROOM);
  assert.equal(roomName('K7M2QX'), 'k7m2qx');
  for (const bad of ['ab', 'a'.repeat(17), 'phòng', 'a b', '../x', '-abc']) assert.equal(roomName(bad), null, bad);
});

test('Origin: khớp chính xác hoặc theo mục ":*" (mọi cổng); thiếu Origin thì từ chối', () => {
  const list = 'https://binh812.github.io, http://localhost:*,http://127.0.0.1:*';
  for (const ok of ['https://binh812.github.io', 'http://localhost:8137', 'http://127.0.0.1:8137', 'http://localhost']) assert.equal(originAllowed(ok, list), true, ok);
  for (const bad of [null, '', 'https://evil.example', 'https://binh812.github.io.evil.example', 'http://localhost.evil.example:80', 'http://127.0.0.1:80@evil.example', 'https://localhost:8137']) assert.equal(originAllowed(bad, list), false, String(bad));
});

test('giới hạn chat: 1 tin/giây và 5 tin/10 giây', () => {
  const lim = createLimiter([[1, 1000], [5, 10000]]);
  assert.equal(lim.allow(0), true);
  assert.equal(lim.allow(500), false);                // tin thứ hai trong cùng giây
  assert.equal(lim.allow(1000), true);
  for (const t of [2000, 3000, 4000]) assert.equal(lim.allow(t), true, 't=' + t);
  assert.equal(lim.allow(5000), false);               // tin thứ sáu trong 10 giây
  assert.equal(lim.allow(9999), false);
  assert.equal(lim.allow(10000), true);               // tin đầu (t=0) đã ra khỏi cửa sổ
});

test('giới hạn: lần bị chặn không bị tính vào cửa sổ', () => {
  const lim = createLimiter([[2, 1000]]);
  assert.equal(lim.allow(0), true); assert.equal(lim.allow(1), true);
  for (let t = 2; t < 900; t += 50) assert.equal(lim.allow(t), false);
  assert.equal(lim.allow(1000), true);
});
