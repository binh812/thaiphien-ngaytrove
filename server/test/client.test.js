// Phép thử phần thuần của client (src/net/pure.js): tham số ?net=, lọc ngoại hình, nội suy vị trí, chọn mức dựng có trễ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localNetUrl, cleanRoom, isPublicRoom, nameKey, safeLook, snapOf, sample, pushSnap, planLod, turn, safeId, LOD_HOLD_S } from '../../src/net/pure.js';

test('?net= chỉ nhận máy cục bộ', () => {
  assert.equal(localNetUrl('ws://127.0.0.1:8788'), 'ws://127.0.0.1:8788');
  assert.equal(localNetUrl('ws://localhost:8788/'), 'ws://localhost:8788');
  assert.equal(localNetUrl('wss://localhost:8788/x?y=1'), 'wss://localhost:8788');
  assert.equal(localNetUrl('ws://[::1]:8788'), 'ws://[::1]:8788');
});

test('?net= trỏ ra ngoài bị bỏ: workers.dev, tên miền lạ, mẹo giả localhost, giao thức khác', () => {
  const bad = [
    'wss://evil.workers.dev', 'wss://thaiphien-room.someone.workers.dev', 'wss://example.com', 'ws://192.168.1.5:8788', 'ws://10.0.0.1',
    'ws://localhost.evil.example', 'ws://127.0.0.1.evil.example', 'ws://evil.example/127.0.0.1', 'ws://localhost@evil.example', 'ws://127.0.0.1:80@evil.example',
    'ws://user:pass@localhost:8788', 'http://localhost:8788', 'https://127.0.0.1', 'javascript:alert(1)', 'localhost:8788', '//localhost', '', null, undefined, 42,
    'ws://0.0.0.0:8788', 'ws://127.1:8788'.replace('127.1', '128.0.0.1'), 'ws://[::2]:8788',
  ];
  for (const b of bad) assert.equal(localNetUrl(b), '', String(b));
});

test('mã phòng và phòng chung', () => {
  assert.equal(cleanRoom(' K7M2QX '), 'k7m2qx');
  for (const b of ['ab', 'phòng', 'a b c', '-abc', 'x'.repeat(17), null]) assert.equal(cleanRoom(b), '', String(b));
  for (const p of ['san-truong', 'san-truong-2', 'san-truong-4']) assert.equal(isPublicRoom(p), true, p);
  for (const p of ['san-truong-abc', 'san-truong-22', 'san-truongx', 'xsan-truong', 'k7m2qx', 'san-truong-']) assert.equal(isPublicRoom(p), false, p);
});

test('nameKey: cùng một tên dù khác hoa/thường, khoảng trắng, dạng chữ', () => {
  assert.equal(nameKey('  Bình   12A1 '), nameKey('bình 12a1'));
  assert.equal(nameKey('Bi' + String.fromCodePoint(0x300) + 'nh'), nameKey('Bình'));
  assert.notEqual(nameKey('Bình'), nameKey('Binh'));
});

test('safeLook: chỉ lấy khoá riêng đã biết, đúng kiểu; bỏ tên thuộc tính của Object', () => {
  const raw = JSON.parse('{"gender":"f","skin":2,"hair":"constructor","top":"__proto__","outfit":"aodai","height":99,"build":7.5,"topColor":"red","shoesColor":"#A1b2C3","__proto__":{"glasses":3},"evil":"<img>","head":"toString"}');
  assert.deepEqual(safeLook(raw), { skin: 2, outfit: 'aodai', shoesColor: '#A1b2C3', gender: 'f', height: 1.95 });
  assert.deepEqual(safeLook(null), { gender: 'm' });
  assert.deepEqual(safeLook([1, 2]), { gender: 'm' });
  assert.deepEqual(safeLook(Object.create({ gender: 'f', skin: 3 })), { gender: 'm' });      // thuộc tính thừa kế không được tính
  assert.equal(safeId('constructor'), false);
});

test('snapOf: sai dạng trả về null; clip/dáng trùng tên thuộc tính của Object bị bỏ', () => {
  assert.equal(snapOf([1, 2, 3, 0], 0), null);
  assert.equal(snapOf([1, 2, NaN, 0, 0], 0), null);
  assert.equal(snapOf([1, 2, '3', 0, 0], 0), null);
  assert.equal(snapOf('abc', 0), null);
  assert.deepEqual(snapOf([1, 2, 3, 0.5, 1.2, 1, 'constructor', 'toString'], 9), { t: 9, x: 1, y: 2, z: 3, r: 0.5, v: 1.2, a: true, c: null, o: null });
  assert.deepEqual(snapOf([1, 2, 3, 0.5, 1.2, 0, 'sit_idle', 'peace'], 9), { t: 9, x: 1, y: 2, z: 3, r: 0.5, v: 1.2, a: false, c: 'sit_idle', o: 'peace' });
});

const at = (t, x, extra = {}) => ({ t, x, y: 0, z: 0, r: 0, v: 1, a: false, c: null, o: null, ...extra });

test('sample: nội suy tuyến tính giữa hai mẫu kề nhau', () => {
  const S = [at(0, 0), at(100, 1), at(200, 2)];
  assert.equal(sample(S, 50).x, 0.5);
  assert.equal(sample(S, 150).x, 1.5);
  assert.equal(S.length, 2);      // mẫu đã qua bị bỏ dần
});

test('sample: trước mẫu đầu thì đứng ở mẫu đầu; hết mẫu thì đứng ở mẫu cuối; hàng rỗng trả về null', () => {
  assert.equal(sample([at(100, 5)], 0).x, 5);
  assert.equal(sample([at(0, 0), at(100, 1)], 999).x, 1);
  assert.equal(sample([], 10), null);
});

test('sample: góc quay đi theo đường ngắn qua ±π; dáng/clip lấy theo mẫu gần hơn', () => {
  const S = [at(0, 0, { r: 3.0, o: 'peace' }), at(100, 0, { r: -3.0, o: 'heart' })];
  const mid = sample(S, 50).r;
  assert.ok(Math.abs(Math.abs(mid) - Math.PI) < 0.01, 'góc giữa ' + mid);      // không quay ngược qua 0
  assert.equal(sample([...S], 20).o, 'peace');
  assert.equal(sample([...S], 80).o, 'heart');
  assert.ok(Math.abs(turn(0, Math.PI / 2, 0.5) - Math.PI / 4) < 1e-9);
});

test('sample: hai mẫu cách nhau quá 8 m (dịch chuyển) thì không trượt qua sân', () => {
  const S = [at(0, 0), at(100, 30)];
  assert.equal(sample(S, 50).x, 0);
  assert.equal(sample(S, 100).x, 30);
});

test('pushSnap: sau quãng đứng yên, mẫu cũ được chèn lại sát trước mẫu mới nên không trượt chậm suốt quãng nghỉ', () => {
  const S = [at(0, 0)];
  pushSnap(S, at(10000, 1));
  assert.deepEqual(S.map((s) => [s.t, s.x]), [[0, 0], [9900, 0], [10000, 1]]);
  assert.equal(sample(S, 5000).x, 0);       // giữa quãng nghỉ vẫn đứng yên
  assert.equal(sample(S, 9950).x, 0.5);
  const T = [at(0, 0)]; pushSnap(T, at(100, 1));
  assert.equal(T.length, 2);                // nhịp bình thường: không chèn thêm
  const big = []; for (let i = 0; i < 100; i++) pushSnap(big, at(i * 100, i));
  assert.ok(big.length <= 24);
});

const P = (id, dist, mode = 'off', age = 99, hidden = false) => ({ id, dist, mode, age, hidden });
const plan = (list, max = 2, range = 45) => Object.fromEntries(planLod(list, max, range));

test('planLod: người gần nhất được dựng đầy đủ, còn lại là khối đơn giản, ngoài tầm thì ẩn', () => {
  assert.deepEqual(plan([P('a', 5), P('b', 10), P('c', 20), P('d', 60), P('e', null)]), { a: 'full', b: 'full', c: 'stub', d: 'off', e: 'off' });
});

test('planLod: người bị ẩn luôn tắt, kể cả đang trong thời gian giữ mức', () => {
  assert.deepEqual(plan([P('a', 5, 'full', 0.1, true), P('b', 6)]), { a: 'off', b: 'full' });
});

test('planLod: hạng 2↔3 đổi chỗ sát nhau không làm đổi mức (cần gần hơn hẳn 15%)', () => {
  const base = [P('a', 5, 'full'), P('b', 10, 'full'), P('c', 10.5, 'stub')];
  assert.deepEqual(plan(base), { a: 'full', b: 'full', c: 'stub' });
  assert.deepEqual(plan([P('a', 5, 'full'), P('b', 10, 'full'), P('c', 9.5, 'stub')]), { a: 'full', b: 'full', c: 'stub' });      // c gần hơn 5%: chưa đổi
  assert.deepEqual(plan([P('a', 5, 'full'), P('b', 10, 'full'), P('c', 8.4, 'stub')]), { a: 'full', b: 'stub', c: 'full' });      // gần hơn 16%: đổi
});

test('planLod: mức vừa đổi được giữ tối thiểu 3 giây', () => {
  assert.deepEqual(plan([P('a', 5, 'full'), P('b', 20, 'full', 1), P('c', 8, 'stub', 1)]), { a: 'full', b: 'full', c: 'stub' });
  assert.deepEqual(plan([P('a', 5, 'full'), P('b', 20, 'full', LOD_HOLD_S + 0.1), P('c', 8, 'stub', LOD_HOLD_S + 0.1)]), { a: 'full', b: 'stub', c: 'full' });
});

test('planLod: sát mép tầm nhìn — vào ở 45 m, ra ở 45 m × 1,15; đi qua đi lại quanh 45 m không bật tắt liên tục', () => {
  assert.equal(plan([P('a', 46, 'off')]).a, 'off');
  assert.equal(plan([P('a', 44.9, 'off')]).a, 'full');
  assert.equal(plan([P('a', 46, 'full')]).a, 'full');
  assert.equal(plan([P('a', 51, 'full')]).a, 'full');
  assert.equal(plan([P('a', 52, 'full')]).a, 'off');
  // mô phỏng 40 nhịp dao động 44↔46 m: chỉ dựng đúng một lần
  let mode = 'off', builds = 0, age = 99;
  for (let i = 0; i < 40; i++) { const next = plan([P('a', i % 2 ? 46 : 44, mode, age)]).a; if (next !== mode) { if (next === 'full') builds++; mode = next; age = 0; } else age += 0.5; }
  assert.equal(builds, 1);
});

test('planLod: mô phỏng hai người tranh hạng cuối, khoảng cách dao động ±3% — không dựng lại lần nào sau lần đầu', () => {
  const st = { a: { mode: 'off', age: 99 }, b: { mode: 'off', age: 99 }, c: { mode: 'off', age: 99 } };
  let changes = 0;
  for (let i = 0; i < 60; i++) {
    const d = { a: 3, b: 10 * (i % 2 ? 1.03 : 0.97), c: 10 * (i % 2 ? 0.97 : 1.03) };
    const out = plan(Object.keys(st).map((id) => P(id, d[id], st[id].mode, st[id].age)));
    for (const id in st) { if (out[id] !== st[id].mode) { if (i > 0) changes++; st[id] = { mode: out[id], age: 0 }; } else st[id].age += 0.5; }
  }
  assert.equal(changes, 0);
  assert.equal(Object.values(st).filter((s) => s.mode === 'full').length, 2);
});
