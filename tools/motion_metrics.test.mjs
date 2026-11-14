// Phép thử cho tools/motion_metrics.mjs bằng dữ liệu tổng hợp. Chạy: node --test tools/motion_metrics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, measureGround, measureSlide, measureBoneLengths, measurePosture, measureContinuity, findStalls, LEVEL, tableRow, tableHeader, measureTerrain } from './motion_metrics.mjs';

const DT = 1 / 60;
/** bộ xương nghỉ tối giản (hệ mô hình, mét): đứng thẳng, tay buông cách thân */
const REST = {
  Hips: [0, 0.95, 0], Spine: [0, 1.05, 0], Spine1: [0, 1.15, 0], Spine2: [0, 1.28, 0], Neck: [0, 1.45, 0], Head: [0, 1.55, 0],
  LeftUpLeg: [0.09, 0.9, 0], LeftLeg: [0.09, 0.5, 0], LeftFoot: [0.09, 0.08, 0], LeftToeBase: [0.09, 0.02, 0.12],
  RightUpLeg: [-0.09, 0.9, 0], RightLeg: [-0.09, 0.5, 0], RightFoot: [-0.09, 0.08, 0], RightToeBase: [-0.09, 0.02, 0.12],
  LeftArm: [0.18, 1.4, 0], LeftForeArm: [0.24, 1.13, 0], LeftHand: [0.3, 0.87, 0.02],
  RightArm: [-0.18, 1.4, 0], RightForeArm: [-0.24, 1.13, 0], RightHand: [-0.3, 0.87, 0.02],
};
const NAMES = Object.keys(REST), ID = [0, 0, 0, 1];
const QUATS = { Head: ID, LeftArm: ID, RightArm: ID, LeftUpLeg: ID, RightUpLeg: ID };
/** thân hình trụ elip rộng 16 cm, dày 10 cm từ gối tới nách */
const TORSO = { y0: 0.5, dy: 0.05, rx: Array(18).fill(0.16), zf: Array(18).fill(0.1), zb: Array(18).fill(-0.1) };
/** đùi: ống elip quanh trục háng → gối, dày 9 cm ra ngoài, 8 cm trước–sau */
const THIGH = { top: { out: 0.09, fb: 0.08 }, bottom: { out: 0.07, fb: 0.07 } };
/** bốn điểm dò ở đế mỗi bàn chân: gót → mũi, nằm trên mặt nền */
const soleProbes = (x) => [x, 0, -0.05, x, 0, 0.02, x, 0, 0.09, x, 0, 0.15];

/**
 * Dựng mẫu n khung. pose(i, t) trả về { bones?: {tên: [x,y,z]} ghi đè (hệ mô hình), root?, yaw?, feet?: {L|R: {dy, dx, dz}} dịch đế chân, clipTime?, q? }.
 * Toạ độ thế giới = gốc + quay yaw + tỉ lệ, đúng như trang thật.
 */
function makeSample({ n = 120, kind = 'idle', scale = 1, rest = REST, pose = () => ({}) } = {}) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = i * DT, p = pose(i, t), root = p.root || [0, 0, 0], yaw = p.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const toWorld = (v) => [root[0] + (v[0] * c + v[2] * s) * scale, root[1] + v[1] * scale, root[2] + (-v[0] * s + v[2] * c) * scale];
    const b = []; for (const nm of NAMES) b.push(...toWorld((p.bones && p.bones[nm]) || REST[nm]));
    const feet = {};
    for (const [side, x] of [['L', 0.09], ['R', -0.09]]) {
      const o = (p.feet && p.feet[side]) || {}, probes = soleProbes(x), out = [];
      for (let k = 0; k < probes.length; k += 3) out.push(...toWorld([probes[k] + (o.dx || 0), probes[k + 1] + (o.dy || 0), probes[k + 2] + (o.dz || 0)]));
      feet[side] = { minY: root[1] + (o.dy || 0) * scale, probes: out };
    }
    frames.push({ t, root, yaw, ground: 0, speed: p.speed ?? 0, clipTime: p.clipTime ?? null, b, q: { ...QUATS, ...(p.q || {}) }, feet });
  }
  return { meta: { kind, dt: DT, bones: NAMES, scale: [scale, scale, scale], rest: { pos: rest, quat: QUATS }, torso: TORSO, thigh: THIGH }, frames };
}
const flagNames = (r) => r.flags.map(f => f.metric);
const rotX = (deg) => { const a = deg * Math.PI / 360; return [Math.sin(a), 0, 0, Math.cos(a)]; };

test('tư thế đứng sạch: không cờ nào, mức OK', () => {
  const r = analyze(makeSample());
  assert.deepEqual(r.flags, []);
  assert.equal(r.level, LEVEL.OK);
});

test('chân chìm 4 cm là LỖI, 2 cm là CẢNH BÁO, 1 cm không bị cờ', () => {
  const sink = (d) => analyze(makeSample({ pose: (i) => ({ feet: { L: { dy: i >= 40 && i < 60 ? -d : 0 } } }) }));
  const deep = sink(0.04), flag = deep.flags.find(f => f.metric === 'xuyên đất');
  assert.equal(flag.level, LEVEL.ERROR); assert.equal(deep.level, LEVEL.ERROR);
  assert.ok(Math.abs(deep.metrics.ground.penMax - 0.04) < 1e-9); assert.equal(deep.metrics.ground.penFoot, 'L');
  assert.equal(sink(0.02).flags.find(f => f.metric === 'xuyên đất').level, LEVEL.WARN);
  assert.ok(!flagNames(sink(0.01)).includes('xuyên đất'));
});

test('độ sâu xuyên đất tính theo mặt nền của từng khung, không phải y = 0', () => {
  const s = makeSample({ pose: () => ({ root: [0, 2, 0] }) });
  for (const f of s.frames) f.ground = 2;
  assert.equal(measureGround(s).penMax, 0);
  for (const f of s.frames) f.ground = 2.05;      // nền cao hơn đế 5 cm → chìm 5 cm
  assert.ok(Math.abs(measureGround(s).penMax - 0.05) < 1e-9);
});

test('hai chân cùng hở nền 5 cm bị cờ lơ lửng; nhấc một chân còn chân kia trụ thì không', () => {
  const both = analyze(makeSample({ pose: () => ({ feet: { L: { dy: 0.05 }, R: { dy: 0.05 } } }) }));
  assert.equal(both.flags.find(f => f.metric === 'lơ lửng').level, LEVEL.WARN);
  assert.ok(Math.abs(both.metrics.ground.floatMax - 0.05) < 1e-9);
  const one = analyze(makeSample({ pose: () => ({ feet: { L: { dy: 0.3 } } }) }));
  assert.ok(!flagNames(one).includes('lơ lửng'));
});

test('chạy: có pha bay cả hai chân nhưng mỗi chân vẫn chạm đất → không cờ lơ lửng; đứng yên với đúng dữ liệu đó thì có', () => {
  const pose = (i) => ({ feet: { L: { dy: i % 40 < 10 ? 0 : 0.12 }, R: { dy: (i + 20) % 40 < 10 ? 0 : 0.12 } } });
  assert.equal(measureGround(makeSample({ kind: 'run', pose })).floatMax, 0);
  assert.ok(Math.abs(measureGround(makeSample({ kind: 'idle', pose })).floatMax - 0.12) < 1e-9);
  const never = measureGround(makeSample({ kind: 'run', pose: () => ({ feet: { L: { dy: 0.07 } } }) }));      // chân trái không bao giờ chạm đất
  assert.ok(Math.abs(never.floatMax - 0.07) < 1e-9);
});

test('chân chạm đất trượt 0,5 m/s bị bắt, đo đúng vận tốc', () => {
  const r = analyze(makeSample({ pose: (i, t) => ({ feet: { R: { dz: 0.5 * t } } }) }));
  assert.ok(flagNames(r).includes('trượt chân (TB)'));
  assert.ok(Math.abs(r.metrics.slide.perFoot.R.mean - 0.5) < 0.01, 'vận tốc đo được ' + r.metrics.slide.perFoot.R.mean);
  assert.ok(r.metrics.slide.perFoot.L.mean < 1e-9);
  assert.equal(r.metrics.slide.maxFoot, 'R');
});

test('thân đi 1,4 m/s nhưng chân trụ đứng yên trong thế giới → không trượt (đo ở toạ độ thế giới)', () => {
  // chân trụ: bù ngược chuyển động của gốc để đế đứng yên trên nền
  const s = makeSample({ kind: 'walk', pose: (i, t) => ({ root: [0, 0, 1.4 * t], feet: { L: { dz: -1.4 * t }, R: { dz: -1.4 * t } } }) });
  const m = measureSlide(s);
  assert.ok(m.contactFrames > 100); assert.ok(m.mean < 1e-9 && m.max < 1e-9);
  // ngược lại: chân dính theo thân (không bù) thì trượt đúng 1,4 m/s
  const glued = measureSlide(makeSample({ kind: 'walk', pose: (i, t) => ({ root: [0, 0, 1.4 * t] }) }));
  assert.ok(Math.abs(glued.mean - 1.4) < 0.01);
});

test('chân đang vung trên cao không tính là trượt; chân đang nhấc lên nhanh cũng không', () => {
  const swing = measureSlide(makeSample({ pose: (i, t) => ({ feet: { L: { dy: 0.1, dz: 2 * t } } }) }));
  assert.equal(swing.perFoot.L.contactFrames, 0);
  const lifting = measureSlide(makeSample({ n: 30, pose: (i, t) => ({ feet: { L: { dy: 0.4 * t, dz: 2 * t } } }) }));      // sát đất nhưng đang lên 0,4 m/s
  assert.equal(lifting.perFoot.L.contactFrames, 0);
});

test('chân lơ lửng đều 4 cm vẫn được xét trượt (ngưỡng chạm tính từ mức thấp quen thuộc của chính bàn chân)', () => {
  const m = measureSlide(makeSample({ pose: (i, t) => ({ feet: { L: { dy: 0.04, dz: 0.5 * t }, R: { dy: 0.04 } } }) }));
  assert.ok(Math.abs(m.perFoot.L.mean - 0.5) < 0.01);
});

test('xương dài thêm 5 % bị bắt; 1 % thì không; tỉ lệ nhân vật không gây báo nhầm', () => {
  const stretched = (k) => { const a = REST.LeftForeArm, h = REST.LeftHand; return [a[0] + (h[0] - a[0]) * k, a[1] + (h[1] - a[1]) * k, a[2] + (h[2] - a[2]) * k]; };
  const r = analyze(makeSample({ pose: (i) => (i === 50 ? { bones: { LeftHand: stretched(1.05) } } : {}) }));
  const flag = r.flags.find(f => f.metric === 'giãn xương');
  assert.ok(flag, 'phải có cờ giãn xương'); assert.match(flag.text, /cẳng tay T/);
  assert.ok(Math.abs(r.metrics.bones.maxDev - 0.05) < 1e-6);
  assert.ok(!flagNames(analyze(makeSample({ pose: (i) => (i === 50 ? { bones: { LeftHand: stretched(1.01) } } : {}) }))).includes('giãn xương'));
  const scaled = measureBoneLengths(makeSample({ scale: 0.9, pose: (i, t) => ({ root: [3, 1, t], yaw: 1.1 }) }));
  assert.ok(scaled.maxDev < 1e-9, 'tỉ lệ 0,9 và góc quay không được tính là giãn: ' + scaled.maxDev);
});

test('cột sống bị nén 6 % (hông nâng mà cổ giữ nguyên) là LỖI', () => {
  const spine = REST.Neck[1] - REST.Hips[1], r = analyze(makeSample({ pose: () => ({ bones: { Hips: [0, REST.Hips[1] + spine * 0.06, 0] } }) }));
  assert.equal(r.flags.find(f => f.metric === 'giãn xương').level, LEVEL.ERROR);
});

test('lưng ngả trước 20° khi đứng bị cờ; ngả sau thì không; khi chạy 20° là bình thường', () => {
  const leanBones = (deg) => { const a = deg * Math.PI / 180, out = {}; for (const nm of ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head']) { const h = REST[nm][1] - REST.Hips[1]; out[nm] = [0, REST.Hips[1] + h * Math.cos(a), h * Math.sin(a)]; } return out; };
  const fwd = analyze(makeSample({ pose: () => ({ bones: leanBones(20) }) }));
  assert.ok(flagNames(fwd).includes('ngả lưng')); assert.ok(Math.abs(fwd.metrics.posture.leanMean - 20) < 0.01);
  assert.ok(!flagNames(analyze(makeSample({ pose: () => ({ bones: leanBones(-20) }) }))).includes('ngả lưng'));
  assert.ok(!flagNames(analyze(makeSample({ kind: 'run', pose: () => ({ bones: leanBones(20) }) }))).includes('ngả lưng'));
  // quay mặt hướng khác: "về trước" phải theo hướng nhân vật, không theo trục z thế giới
  const turned = measurePosture(makeSample({ pose: () => ({ bones: leanBones(20), yaw: Math.PI / 2 }) }));
  assert.ok(Math.abs(turned.leanMean - 20) < 0.01);
});

test('gối gập ngược 10° bị cờ, gập xuôi 40° thì không', () => {
  const knee = (deg) => { const a = deg * Math.PI / 180, k = REST.LeftLeg, l = k[1] - REST.LeftFoot[1]; return { bones: { LeftFoot: [k[0], k[1] - l * Math.cos(a), l * Math.sin(a)] } }; };      // deg > 0: bàn chân ra trước gối = gập ngược
  const hyper = analyze(makeSample({ pose: () => knee(10) }));
  assert.equal(hyper.flags.find(f => f.metric === 'gối gập ngược').level, LEVEL.WARN);
  assert.ok(Math.abs(hyper.metrics.posture.kneeHyperMax - 10) < 0.01); assert.equal(hyper.metrics.posture.kneeHyperSide, 'T');
  const natural = analyze(makeSample({ pose: () => knee(-40) }));
  assert.ok(!flagNames(natural).includes('gối gập ngược')); assert.equal(natural.metrics.posture.kneeHyperMax, 0);
});

test('chiều gập của gối theo hướng thật của đùi: đùi xoay 180° quanh trục dọc thì "ra trước" trở thành gập xuôi', () => {
  const k = REST.LeftLeg, l = k[1] - REST.LeftFoot[1], a = 30 * Math.PI / 180, bones = { LeftFoot: [k[0], k[1] - l * Math.cos(a), l * Math.sin(a)] };
  const m = measurePosture(makeSample({ pose: () => ({ bones, q: { LeftUpLeg: [0, 1, 0, 0] } }) }));
  assert.equal(m.kneeHyperMax, 0);
});

test('khuỷu gập ngược 25° là LỖI', () => {
  const e = REST.RightForeArm, l = Math.hypot(...[0, 1, 2].map(i => REST.RightHand[i] - e[i])), up = [e[0] - REST.RightArm[0], e[1] - REST.RightArm[1], 0], ul = Math.hypot(...up), u = up.map(v => v / ul), a = 25 * Math.PI / 180;
  const hand = [e[0] + u[0] * l * Math.cos(a), e[1] + u[1] * l * Math.cos(a), -l * Math.sin(a)];      // cẳng tay bẻ ra sau
  const r = analyze(makeSample({ pose: () => ({ bones: { RightHand: hand } }) }));
  assert.equal(r.flags.find(f => f.metric === 'khuỷu gập ngược').level, LEVEL.ERROR);
  assert.ok(Math.abs(r.metrics.posture.elbowHyperMax - 25) < 0.01);
});

test('cổ tay nằm trong thân khi đứng nghỉ bị cờ; cùng tư thế ở dáng chụp ảnh thì không cờ', () => {
  const pose = () => ({ bones: { LeftHand: [0.1, 0.95, 0.02] } });      // thân rộng 16 cm → cổ tay ở 10 cm là lọt vào trong
  const idle = analyze(makeSample({ pose }));
  assert.equal(idle.flags.find(f => f.metric === 'tay xuyên thân').level, LEVEL.WARN);      // chỉ cảnh báo: phép đo này là ước lượng
  assert.ok(idle.metrics.posture.handClearMin < -0.03);
  const touching = analyze(makeSample({ pose: () => ({ bones: { LeftHand: [0.17, 0.95, 0.02] } }) }));      // cổ tay áp sát mặt thân (lấn ~1 cm): không cờ
  assert.ok(touching.metrics.posture.handClearMin < 0 && !flagNames(touching).includes('tay xuyên thân'));
  assert.ok(!flagNames(analyze(makeSample({ kind: 'pose', pose }))).includes('tay xuyên thân'));
  assert.ok(measurePosture(makeSample()).handClearMin > 0.05, 'tay buông cách thân phải có độ hở dương');
});

test('đầu cúi 30° bị cờ, đo đúng dấu (cúi âm, ngửa dương)', () => {
  const down = analyze(makeSample({ pose: () => ({ q: { Head: rotX(30) } }) }));
  assert.ok(flagNames(down).includes('đầu cúi/ngửa'));
  assert.ok(Math.abs(down.metrics.posture.headPitchMin + 30) < 0.01);
  const up = measurePosture(makeSample({ pose: () => ({ q: { Head: rotX(-12) } }) }));
  assert.ok(Math.abs(up.headPitchMax - 12) < 0.01);
});

test('vòng lặp trơn không bị cờ; bàn tay nhảy 5 cm ở chỗ nối vòng bị bắt đúng xương', () => {
  const loop = (pop) => (i) => { const ph = (i % 60) / 60, h = REST.LeftHand; return { clipTime: ph, bones: { LeftHand: [h[0], h[1] + 0.05 * Math.sin(ph * 2 * Math.PI) + (i >= 60 ? pop : 0), h[2]] } }; };
  const smooth = analyze(makeSample({ kind: 'pose', pose: loop(0) }));
  assert.ok(!flagNames(smooth).includes('giật chỗ nối vòng')); assert.equal(smooth.metrics.continuity.seams, 1);
  const popped = analyze(makeSample({ kind: 'pose', pose: loop(0.05) }));
  const flag = popped.flags.find(f => f.metric === 'giật chỗ nối vòng');
  assert.equal(flag.level, LEVEL.ERROR); assert.equal(popped.metrics.continuity.seamBone, 'LeftHand');
  assert.ok(popped.metrics.continuity.seamExcess > 0.04);
});

test('một cú giật 8 cm giữa clip (không ở chỗ nối) bị cờ giật; chuyển động của gốc không tính', () => {
  const r = analyze(makeSample({ kind: 'action', pose: (i) => ({ bones: i >= 70 ? { Head: [0, REST.Head[1], 0.08] } : {} }) }));
  assert.equal(r.flags.find(f => f.metric === 'giật').level, LEVEL.ERROR); assert.equal(r.metrics.continuity.jerkBone, 'Head');
  const rootOnly = measureContinuity(makeSample({ kind: 'transition', pose: (i) => ({ root: [0, 0, i >= 70 ? 3 : 0], yaw: i >= 70 ? 1 : 0 }) }));
  assert.ok(rootOnly.jerkMax < 1e-9);
});

test('mẫu hỏng thì báo lỗi rõ ràng, không trả kết quả giả', () => {
  assert.throws(() => analyze(makeSample({ n: 2 })), /quá ngắn/);
  const s = makeSample(); s.meta.bones = s.meta.bones.filter(nm => nm !== 'Spine2');
  assert.throws(() => measurePosture(s), /thiếu xương Spine2/);
});

test('cờ xếp theo mức nặng; dòng bảng có nhãn, mức và tên cờ', () => {
  const r = analyze(makeSample({ pose: (i, t) => ({ feet: { L: { dy: -0.04 }, R: { dz: 0.3 * t } } }) }));
  assert.deepEqual(flagNames(r).slice(0, 2), ['xuyên đất', 'trượt chân (TB)']);
  const row = tableRow('nam/giày tây/idle', r);
  assert.ok(row.startsWith('nam/giày tây/idle')); assert.match(row, /LỖI — xuyên đất/);
  assert.equal(tableHeader().split(/\s{2,}|\s(?=\S+$)/).length > 3, true);
});

test('chân vung lướt sát đất (cùng chiều, nhanh hơn thân) không tính là trượt; đợt chạm ngắn hơn 5 khung cũng không', () => {
  // thân đi 1,5 m/s; chân trái cách nền 1 cm và lao về trước 3,6 m/s trong thế giới = đang vung, không phải chân trụ
  const skim = measureSlide(makeSample({ kind: 'walk', pose: (i, t) => ({ root: [0, 0, 1.5 * t], feet: { L: { dy: 0.01, dz: 2.1 * t }, R: { dz: -1.5 * t } } }) }));
  assert.equal(skim.perFoot.L.contactFrames, 0); assert.ok(skim.perFoot.R.contactFrames > 100 && skim.mean < 1e-9);
  // chân chạm nền 3 khung rồi nhấc: quá ngắn để gọi là trụ
  const tap = measureSlide(makeSample({ pose: (i, t) => ({ feet: { L: { dy: i % 20 < 3 ? 0 : 0.1, dz: 0.8 * t } } }) }));
  assert.equal(tap.perFoot.L.contactFrames, 0);
  // đứng tại chỗ mà chân trượt lùi 0,8 m/s thì vẫn phải bắt (không có "thân nhanh hơn" để mà loại)
  const back = measureSlide(makeSample({ pose: (i, t) => ({ feet: { L: { dz: -0.8 * t } } }) }));
  assert.ok(Math.abs(back.perFoot.L.mean - 0.8) < 0.01);
});

test('khựng: tốc độ tụt quá nửa trong một khung bị đếm và bị cờ; giảm tốc dần khi nhả phím thì không', () => {
  const speedAt = (i) => (i === 50 || i === 51 ? 0 : 4.2);
  const s = makeSample({ kind: 'run', pose: (i, t) => ({ root: [0, 0, 4.2 * t], speed: speedAt(i), feet: { L: { dz: -4.2 * t }, R: { dz: -4.2 * t } } }) });
  assert.deepEqual(findStalls(s), [50]);
  const r = analyze(s), flag = r.flags.find(f => f.metric === 'khựng');
  assert.equal(flag.level, LEVEL.WARN); assert.equal(r.metrics.continuity.stalls, 1);
  // hai lần khựng trong một phép đo là LỖI
  const twice = analyze(makeSample({ kind: 'run', pose: (i, t) => ({ root: [0, 0, 4.2 * t], speed: i === 30 || i === 80 ? 0 : 4.2, feet: { L: { dz: -4.2 * t }, R: { dz: -4.2 * t } } }) }));
  assert.equal(twice.flags.find(f => f.metric === 'khựng').level, LEVEL.ERROR);
  const easing = makeSample({ kind: 'transition', pose: (i) => ({ speed: 4.2 * Math.exp(-i * 0.2) }) });      // mỗi khung còn 82 %
  assert.deepEqual(findStalls(easing), []);
});

test('cú giật và cú trượt ngay sau lúc khựng VẪN tính vào cờ giật/trượt (không được nấp sau cờ khựng); độ lớn cú giật ghi thêm riêng', () => {
  const pose = (stall) => (i, t) => ({ root: [0, 0, 4.2 * t], speed: stall && i === 50 ? 0 : 4.2, bones: i >= 52 && i < 56 ? { Head: [0, REST.Head[1], 0.08] } : {} });
  const withStall = analyze(makeSample({ kind: 'run', pose: pose(true) }));
  assert.ok(flagNames(withStall).includes('giật')); assert.ok(withStall.metrics.continuity.stallJerk > 0.07);
  // chân trụ trượt 2 m/s chỉ trong 10 khung ngay sau lúc khựng: trước đây các khung đó bị loại nên không ai thấy
  const slip = measureSlide(makeSample({ kind: 'run', pose: (i, t) => ({ speed: i === 50 ? 0 : 4.2, feet: { L: { dz: i > 50 && i <= 60 ? (i - 50) / 60 * 2 : i > 60 ? 10 / 60 * 2 : 0 } } }) }));
  assert.ok(slip.max > 1.5, 'trượt sau lúc khựng phải được đo: ' + slip.max);
  assert.ok(flagNames(analyze(makeSample({ kind: 'run', pose: pose(false) }))).includes('giật'), 'không khựng thì cú giật ấy phải bị cờ');
});

test('cổ tay lọt vào đùi bị cờ kể cả khi chân đã đổi chỗ so với lúc nghỉ; đùi theo xương đùi chứ không theo biên dạng nghỉ', () => {
  const hip = REST.LeftUpLeg, knee = REST.LeftLeg, mid = [(hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2, 0];
  const inside = measurePosture(makeSample({ pose: () => ({ bones: { LeftHand: [mid[0] + 0.03, mid[1], 0] } }) }));
  assert.ok(inside.handClearMin < -0.04, 'cổ tay cách trục đùi 3 cm phải là lọt sâu: ' + inside.handClearMin);
  const outside = measurePosture(makeSample({ pose: () => ({ bones: { LeftHand: [mid[0] + 0.14, mid[1], 0], RightHand: [-mid[0] - 0.14, mid[1], 0] } }) }));
  assert.ok(outside.handClearMin > 0.02 && outside.handClearMin < 0.05, 'cách trục 14 cm, đùi dày ~8 cm, cổ tay 2 cm → hở ~4 cm: ' + outside.handClearMin);
  // đùi dạng sang bên 20 cm (cả háng lẫn gối): bàn tay ở chỗ đùi cũ không còn lọt
  const moved = measurePosture(makeSample({ pose: () => ({ bones: { LeftUpLeg: [hip[0] + 0.2, hip[1], 0], LeftLeg: [knee[0] + 0.2, knee[1], 0], LeftFoot: [0.29, 0.08, 0], LeftHand: [mid[0] - 0.02, mid[1], 0.3], RightHand: [-0.3, 0.87, 0.3] } }) }));
  assert.ok(moved.handClearMin > 0.05, 'độ hở ' + moved.handClearMin);
});

test('góc ngả lưng trừ đi góc sẵn có của bộ xương lúc nghỉ; xuyên đất báo kèm phần do hoạt hoạ (so với gốc nhân vật)', () => {
  const tilted = { ...REST, Spine2: [0, 1.28, -0.06] };      // bộ xương có ngực lùi sau hông 6 cm ngay ở tư thế nghỉ (~ -10°)
  const m = measurePosture(makeSample({ rest: tilted, pose: () => ({ bones: { Spine2: tilted.Spine2 } }) }));
  assert.ok(Math.abs(m.leanMean) < 1e-6, 'đúng tư thế nghỉ thì góc ngả phải là 0: ' + m.leanMean);
  // gốc nhân vật bị đặt thấp hơn nền 2 cm, hoạt hoạ đưa đế xuống thêm 1 cm → chìm 3 cm, trong đó 1 cm do hoạt hoạ
  const g = measureGround(makeSample({ pose: () => ({ root: [0, -0.02, 0], feet: { L: { dy: -0.01 } } }) }));
  assert.ok(Math.abs(g.penMax - 0.03) < 1e-9); assert.ok(Math.abs(g.belowRootMax - 0.01) < 1e-9); assert.ok(Math.abs(g.rootOffset.mean + 0.02) < 1e-9);
});

test('cổ tay lọt vào ngực (cao hơn hẳn đùi) do biên dạng thân bắt; ngoài tầm cao của biên dạng thì không xét', () => {
  const chest = measurePosture(makeSample({ pose: () => ({ bones: { LeftHand: [0.05, 1.2, 0.03] } }) }));
  assert.ok(chest.handClearMin < -0.05, 'cổ tay giữa ngực phải lọt sâu: ' + chest.handClearMin); assert.equal(chest.handClearSide, 'T');
  const overhead = measurePosture(makeSample({ pose: () => ({ bones: { LeftHand: [0.05, 1.9, 0], RightHand: [-0.05, 1.9, 0] } }) }));
  assert.ok(overhead.handClearMin > 0.5, 'tay giơ quá đầu chỉ còn so với đùi, phải hở xa: ' + overhead.handClearMin);
});

test('clip rung mạnh đều mọi khung: chỗ nối không tệ hơn chỗ khác nên không bị cờ nối vòng', () => {
  // bàn tay lắc ±1 cm mỗi khung (sai phân bậc hai ~4 cm ở mọi khung) — chỗ nối vòng cũng chỉ như vậy
  const shake = analyze(makeSample({ kind: 'pose', pose: (i) => ({ clipTime: (i % 60) / 60, bones: { LeftHand: [REST.LeftHand[0], REST.LeftHand[1] + (i % 2 ? 0.01 : -0.01), REST.LeftHand[2]] } }) }));
  assert.ok(shake.metrics.continuity.jerkMax > 0.035); assert.ok(!flagNames(shake).includes('giật chỗ nối vòng'));
  assert.ok(Math.abs(shake.metrics.continuity.seamExcess) < 1e-6);
});

test('cờ nặng hơn đứng trước dù được xét sau', () => {
  const r = analyze(makeSample({ pose: (i, t) => ({ feet: { L: { dy: -0.02 }, R: { dz: 2 * t } } }) }));      // chìm 2 cm (cảnh báo) + trượt 2 m/s (lỗi nặng)
  assert.match(r.flags[0].metric, /^trượt chân/); assert.equal(r.flags.at(-1).metric, 'xuyên đất');
  for (let i = 1; i < r.flags.length; i++) assert.ok(r.flags[i - 1].severity >= r.flags[i].severity);
});

test('ngưỡng giật khi chạy rộng hơn khi đứng: 4,5 cm/khung² là cảnh báo lúc đứng, bình thường lúc chạy; 12 cm thì chạy cũng là LỖI', () => {
  const pop = (d) => (i) => ({ bones: i >= 70 ? { Head: [0, REST.Head[1], d] } : {} });
  assert.equal(analyze(makeSample({ kind: 'idle', pose: pop(0.045) })).flags.find(f => f.metric === 'giật').level, LEVEL.WARN);
  assert.ok(!flagNames(analyze(makeSample({ kind: 'run', pose: pop(0.045) }))).includes('giật'));
  assert.equal(analyze(makeSample({ kind: 'run', pose: pop(0.12) })).flags.find(f => f.metric === 'giật').level, LEVEL.ERROR);
});

test('địa hình: đi lên cầu thang chỉ được 31 % tốc độ nền phẳng là LỖI; chân chìm 10 cm dưới mặt thang là LỖI; đúng tốc độ và chân sát mặt thang thì sạch', () => {
  const stair = (speed, clear) => { const s = makeSample({ kind: 'terrain', pose: (i, t) => ({ root: [0, 0.58 * speed * t, speed * t], speed }) }); s.meta.expectSpeed = 1.5; for (const f of s.frames) f.tf = { L: [clear, clear + 0.01], R: [clear + 0.05, null] }; return s; };
  const stuck = analyze(stair(0.47, 0.005)), slow = stuck.flags.find(f => f.metric === 'tốc độ trên dốc');
  assert.equal(slow.level, LEVEL.ERROR); assert.ok(Math.abs(stuck.metrics.terrain.speedRatio - 0.313) < 0.01);
  assert.equal(analyze(stair(1.2, 0.005)).flags.find(f => f.metric === 'tốc độ trên dốc').level, LEVEL.WARN);
  const sunk = analyze(stair(1.48, -0.10));
  assert.equal(sunk.flags.find(f => f.metric === 'chìm (địa hình)').level, LEVEL.ERROR); assert.ok(Math.abs(measureTerrain(stair(1.48, -0.10)).penMax - 0.10) < 1e-9);
  assert.equal(analyze(stair(1.48, 0.20)).flags.find(f => f.metric === 'hở (địa hình)').level, LEVEL.ERROR);
  assert.deepEqual(flagNames(analyze(stair(1.48, 0.005))), []);
});

test('phép đo dài (dt thay đổi): chỉ xét xuyên đất, lơ lửng, giãn xương và khựng — không cờ trượt/giật vì vận tốc từng khung không so được', () => {
  const r = analyze(makeSample({ kind: 'long', n: 300, pose: (i, t) => ({ root: [0, 0, 4.2 * t], speed: i === 100 || i === 200 ? 0 : 4.2, feet: { L: { dz: 3 * t } } }) }));
  assert.deepEqual(flagNames(r), ['khựng']); assert.equal(r.level, LEVEL.ERROR);
});
