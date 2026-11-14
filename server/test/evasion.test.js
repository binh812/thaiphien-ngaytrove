// Phép thử các lối lách đã được người soát chỉ ra: chữ toàn góc, chữ đồng hình, ký tự vô hình, viết rời từng chữ,
// tên/tin vô hình, mã định danh trùng tên thuộc tính của Object. Ký tự đặc biệt viết bằng mã số để tệp nguồn chỉ chứa chữ nhìn thấy được.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { censor, canon, INVISIBLE_RANGES } from '../src/filter.js';
import { cleanText, cleanName, cleanChat, cleanLook, cleanState, parseClient, safeId, DEFAULT_NAME, POSES } from '../src/protocol.js';

const C = (...n) => String.fromCodePoint(...n);
const ZWSP = C(0x200b), ZWNJ = C(0x200c), ZWJ = C(0x200d), FILLER = C(0x3164);
const fullwidth = (s) => Array.from(s, (c) => C(c.codePointAt(0) + 0xfee0)).join('');      // chữ ASCII → chữ toàn góc
const CYR = { s: 0x455, a: 0x430, e: 0x435, o: 0x43e, c: 0x441, i: 0x456, k: 0x43a, t: 0x442, h: 0x4bb, d: 0x501 };
const cyr = (s) => Array.from(s, (c) => (CYR[c] ? C(CYR[c]) : c)).join('');

test('bảng chữ đồng hình: hai chuỗi nguồn/đích dài bằng nhau và đổi đúng', () => {
  assert.equal(canon(cyr('dit')), 'dit');
  assert.equal(canon(C(0x3b1, 0x3bf, 0x3b5)), 'aoe');      // alpha, omicron, epsilon Hy Lạp
  assert.equal(canon('Thái Phiên'), 'thái phiên');           // tiếng Việt đi qua nguyên vẹn (chỉ đổi chữ thường)
});

test('chữ toàn góc bị bắt', () => {
  assert.equal(censor(fullwidth('fuck')).text, '***');
  assert.equal(censor('a ' + fullwidth('vcl') + ' b').text, 'a *** b');
});

test('chữ đồng hình Cyrillic bị bắt', () => {
  assert.equal(censor(cyr('dit')).text, '***');
  assert.equal(censor('x ' + cyr('shit') + ' y').text, 'x *** y');
  assert.equal(censor(cyr('cac') + ' ban').hit, false);      // "các bạn" không dấu viết bằng chữ đồng hình vẫn là từ sạch
});

test('ký tự vô hình chen giữa từ: bị xoá khi làm sạch nên từ vẫn bị bắt (không còn biến thành "d i t")', () => {
  for (const z of [ZWSP, ZWNJ, C(0x2060), C(0xfeff), C(0xad), C(0x34f), C(0x180e), FILLER, C(0xe0061)]) {
    const raw = 'd' + z + 'i' + z + 't';
    assert.equal(cleanText(raw, 50), 'dit', 'U+' + z.codePointAt(0).toString(16));
    assert.equal(cleanChat(raw), '***', 'U+' + z.codePointAt(0).toString(16));
  }
  assert.equal(censor('f' + ZWJ + 'uck').text, '***');      // dấu nối không độ rộng được giữ trong bản hiển thị (emoji cần) nhưng bỏ khi so
});

test('viết rời từng chữ bị gộp lại để so; chữ rời vô hại thì giữ nguyên', () => {
  assert.equal(censor('d i t').text, '*** *** ***');
  assert.equal(censor('nó v c l thật').text, 'nó *** *** *** thật');
  assert.equal(censor('đ m mày').text, '*** *** mày');
  for (const ok of ['a b c', 'lớp 1 2 A', 'x y', 'ô k', 'A 1 B 2']) assert.deepEqual(censor(ok), { text: ok, hit: false }, ok);
});

test('cụm "con cac": câu có dấu thì không bắt, câu hoàn toàn không dấu mới bắt', () => {
  for (const ok of ['mua cho con các loại sữa', 'con các bạn học lớp nào', 'đàn con các cụ', 'Con Các Mác']) assert.equal(censor(ok).hit, false, ok);
  assert.equal(censor('may la con cac a').text, 'may la *** *** a');
  assert.equal(censor('đồ con cặc').text, 'đồ con ***');      // dạng đủ dấu: bắt đúng từ đó
});

test('"đít" (đít chai, đít ghế) không bị chặn nhầm vì trùng dạng không dấu; "dit", "đit", "địt", "DIT", "địtttt" vẫn bị bắt', () => {
  for (const ok of ['đít ghế', 'kính đít chai', 'dịt vết thương', 'dù mà xa', 'Đít']) assert.deepEqual(censor(ok), { text: ok, hit: false }, ok);
  for (const bad of ['dit', 'đit', 'địt', 'DIT', 'Địt', 'địtttt', 'đ.i.t', 'djt', 'đjt', 'duma', 'đụ', 'd1t']) assert.equal(censor(bad).text, '***', bad);
  // tiếng Anh thêm dấu tiếng Việt để lách vẫn bị bắt (không trùng từ tiếng Việt nào)
  for (const bad of ['fùck', 'shít', 'bítch']) assert.equal(censor(bad).text, '***', bad);
});

test('tên riêng thông thường không bị chặn', () => {
  for (const n of ['Dick', 'Moby Dick', 'Dũng', 'Phúc', 'Cường', 'Loan', 'Bùi Thị Cúc', 'Đỗ Mười', 'Lon', 'Phó Đức Phương']) assert.equal(cleanName(n), cleanText(n, 20), n);
});

test('bản hiển thị giữ nguyên khi không trúng (không bị đổi sang NFKC hay chữ thường)', () => {
  const s = 'Lớp 12A1 ①②③ ' + fullwidth('ABC') + ' ' + cyr('tot');
  assert.deepEqual(censor(s), { text: s, hit: false });
});

test('tên toàn ký tự vô hình / ô trống giả → tên mặc định; tin toàn ký tự vô hình → bỏ', () => {
  const blanks = INVISIBLE_RANGES.map(([a]) => C(a)).join('');
  for (const cp of [0x3164, 0x115f, 0x1160, 0xffa0, 0x61c, 0x180e, 0x34f, 0xe0020, 0xe007f, 0x200b, 0x2800]) {
    const z = C(cp).repeat(5);
    assert.equal(cleanName(z), DEFAULT_NAME, 'tên U+' + cp.toString(16));
    assert.equal(cleanChat(z), null, 'tin U+' + cp.toString(16));
    assert.equal(cleanChat(' ' + z + ' ' + z), null);
  }
  assert.equal(cleanName(blanks), DEFAULT_NAME);
  assert.equal(cleanChat(blanks + ' ' + blanks), null);
  assert.equal(cleanName(FILLER + 'An' + FILLER), 'An');
});

test('tin phải có ít nhất một ký tự nhìn thấy được; emoji và dấu câu vẫn tính', () => {
  assert.equal(cleanChat(C(0x1f44b)), C(0x1f44b));      // 👋
  assert.equal(cleanChat('?!'), '?!');
  assert.equal(cleanChat(C(0x301, 0x301)), null);        // chỉ có dấu thanh trơ trọi
});

test('safeId: cấm tên thuộc tính có sẵn của Object và tiền tố "_"', () => {
  for (const bad of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'prototype', '_x', '__defineGetter__', '', 'a-b', 'x'.repeat(25), 5, null]) assert.equal(safeId(bad), false, String(bad));
  for (const ok of ['sit_idle', 'talk', 'aodai_modern', 'peace2', 'k7']) assert.equal(safeId(ok), true, ok);
});

test('ngoại hình: khoá __proto__/constructor từ JSON và giá trị "constructor"/"__proto__" đều bị loại', () => {
  const raw = JSON.parse('{"gender":"f","__proto__":{"skin":3,"polluted":true},"constructor":"x","hair":"constructor","top":"__proto__","outfit":"toString","bottom":"jeans","age":"valueOf","head":"hasOwnProperty"}');
  assert.ok(Object.hasOwn(raw, '__proto__'));
  const out = cleanLook(raw);
  assert.deepEqual(out, { gender: 'f', bottom: 'jeans' });
  assert.deepEqual(Object.keys(out), ['gender', 'bottom']);
  assert.equal(({}).polluted, undefined);
  assert.equal(out.skin, undefined);
});

test('trạng thái: clip kiểu "constructor"/"__proto__"/"toString" bị bỏ; dáng chỉ nhận trong danh sách đã biết', () => {
  for (const bad of ['constructor', '__proto__', 'toString', '_hidden', 'prototype']) {
    const s = cleanState({ p: [0, 0, 0], r: 0, v: 0, c: bad, o: bad });
    assert.deepEqual(s.slice(6), [0, 0], bad);
  }
  assert.deepEqual(cleanState({ p: [0, 0, 0], r: 0, v: 0, c: 'sit_idle', o: 'peace' }).slice(6), ['sit_idle', 'peace']);
  assert.deepEqual(cleanState({ p: [0, 0, 0], r: 0, v: 0, c: 'talk', o: 'moonwalk' }).slice(6), ['talk', 0]);
  for (const p of POSES) assert.equal(cleanState({ p: [0, 0, 0], r: 0, v: 0, o: p })[7], p);
});

test('emote: "constructor"/"toString" không lọt qua danh sách', () => {
  for (const e of ['constructor', 'toString', '__proto__', 'length']) assert.equal(parseClient(JSON.stringify({ t: 'emote', e })).ok, false, e);
});

test('lời chào có khoá __proto__ ở gốc không làm bẩn gì và vẫn được đọc đúng', () => {
  const r = parseClient('{"t":"hello","v":1,"name":"An","look":{"gender":"m"},"__proto__":{"t":"chat","name":"X"}}');
  assert.deepEqual(r, { ok: true, msg: { t: 'hello', name: 'An', look: { gender: 'm' } } });
});
