// Tính chỉ số chất lượng chuyển động từ mảng mẫu (thuần tính toán, không đụng trình duyệt) — dùng bởi tools/motion_qa.mjs.
// Ý tưởng các phép đo (độ dài xương, chân xuyên đất, tốc độ chân lúc tiếp đất) tham khảo cách làm của mục QA chuyển động
// trong kho OpenDCAI/GameFactory-3A (Apache-2.0); mã ở đây viết lại từ đầu cho bộ xương và hậu xử lý của trò chơi này.
//
// Định dạng một mẫu:
//   meta:   { kind, dt, bones: [tên…], scale: [sx,sy,sz], rest: { pos: {tên: [x,y,z]}, quat: {tên: [x,y,z,w]} }, torso?: { y0, dy, rx[], zf[], zb[] }, thigh?: { top: { out, fb }, bottom: { out, fb } } }
//           kind: 'idle' | 'walk' | 'run' | 'pose' | 'sit' | 'action' | 'transition' | 'terrain' (cầu thang/dốc: thêm expectSpeed, khung có tf) | 'long' (chạy dài, dt thay đổi)
//           rest.pos ở hệ mô hình (chưa nhân tỉ lệ nhân vật); torso = biên dạng thân theo dải cao độ, y tính từ cao độ hông lúc nghỉ
//   frames: [{ t, root: [x,y,z], yaw, ground, speed? (tốc độ bộ điều khiển báo, để bắt lúc khựng), clipTime?, b: [x,y,z,…] (toạ độ thế giới, theo thứ tự meta.bones),
//              q: {tên: [x,y,z,w]} (hướng thế giới), feet: { L: { minY, probes: [x,y,z,…] }, R: {…} } }]

export const LEVEL = { OK: 'OK', WARN: 'CẢNH BÁO', ERROR: 'LỖI' };

/** ngưỡng: [cảnh báo, lỗi]; đơn vị mét, m/s, độ, tỉ lệ */
export const LIMITS = {
  penetration: [0.015, 0.03],      // đế giày chìm dưới mặt nền
  float: [0.03, 0.06],             // chân trụ lơ lửng trên nền
  slideMean: [0.25, 0.5],          // vận tốc ngang trung bình của phần đế đang chạm đất (lấy bàn chân tệ hơn)
  slideMax: [0.6, 1.2],            // đỉnh vận tốc ngang lúc chạm đất
  boneStretch: [0.02, 0.05],       // lệch chiều dài xương so với tư thế nghỉ
  leanStand: [12, 20],             // góc ngả lưng về trước khi đứng (trung bình)
  leanWalk: [15, 25],
  leanRun: [25, 35],
  hunch: [12, 22],                 // lưng trên gập thêm về trước so với tư thế nghỉ (gù)
  kneeHyper: [5, 12],              // gối gập ngược
  elbowHyper: [8, 20],             // khuỷu gập ngược
  handInBody: [0.03, 1e9],         // cổ tay lấn vào trong thân/đùi — chỉ cảnh báo: biên dạng thân/đùi là ước lượng từ lưới lúc nghỉ, sai số cỡ 2–3 cm
  headPitch: [20, 35],             // đầu cúi/ngửa
  seamExcess: [0.01, 0.03],        // bước giật ở chỗ nối vòng lặp, phần vượt mức thường của clip
  stalls: [0.5, 1.5],              // số lần nhân vật khựng giữa lúc đi/chạy trong một phép đo: 1 lần là cảnh báo, từ 2 lần là lỗi
  terrainPen: [0.03, 0.06],        // cầu thang/dốc: cổ chân hoặc mũi chân chìm dưới mặt va chạm thật ngay dưới nó
  terrainFloat: [0.07, 0.14],      // cầu thang/dốc: điểm thấp nhất của cả hai chân hở mặt va chạm (phân vị 95 theo khung)
  slopeSpeed: [0.85, 0.7],         // cầu thang/dốc: tốc độ ngang so với cùng kiểu đi trên nền phẳng — THẤP hơn mức này là cảnh báo / lỗi (người chơi phải lên được tầng)
  jerk: [0.03, 0.06],              // sai phân bậc hai lớn nhất của vị trí xương giữa các khung (đứng, đi, dáng, clip tại chỗ)
  jerkRun: [0.06, 0.1],            // như trên khi chạy / chuyển tiếp: bàn chân vung nhanh, gia tốc tự nhiên đã cỡ 4 cm/khung²
};
export const CONTACT = { height: 0.025, baseMax: 0.05, minFrames: 5, swingRatio: 1.15, vyMax: 0.15, wristRadius: 0.02, minBendForHinge: 15 };

const SEGMENTS = {
  'đùi T': ['LeftUpLeg', 'LeftLeg'], 'đùi P': ['RightUpLeg', 'RightLeg'],
  'ống chân T': ['LeftLeg', 'LeftFoot'], 'ống chân P': ['RightLeg', 'RightFoot'],
  'cánh tay T': ['LeftArm', 'LeftForeArm'], 'cánh tay P': ['RightArm', 'RightForeArm'],
  'cẳng tay T': ['LeftForeArm', 'LeftHand'], 'cẳng tay P': ['RightForeArm', 'RightHand'],
  'cột sống': ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck'], 'cổ': ['Neck', 'Head'],
};
/** số khung sau một lần khựng mà tư thế còn bị ảnh hưởng (trọng số đi/chạy tụt về đứng rồi hồi lại) — loại khỏi các số đo hoạt hoạ */
const STALL_RECOVERY = 20;
/** các xương theo dõi độ liền mạch (đủ đại diện cho thân, tay, chân) */
const TRACKED = ['Hips', 'Spine2', 'Head', 'LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];

/* ----- véc-tơ, quaternion ----- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };
const perp = (a, axis) => sub(a, scale(axis, dot(a, axis)));      // phần của a vuông góc với trục (trục đã chuẩn hoá)
const DEG = 180 / Math.PI;
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qRot(q, v) {
  const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
function percentile(values, p) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b), i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
  return s[i];
}

/** tra vị trí thế giới của một xương ở một khung; ném lỗi nếu mẫu thiếu xương (không âm thầm trả 0) */
function boneReader(sample) {
  const index = new Map(sample.meta.bones.map((nm, i) => [nm, i]));
  return {
    has: (nm) => index.has(nm),
    world(frame, nm) { const i = index.get(nm); if (i === undefined) throw new Error('Mẫu thiếu xương ' + nm); return [frame.b[i * 3], frame.b[i * 3 + 1], frame.b[i * 3 + 2]]; },
    /** hệ nhân vật: bỏ vị trí và góc quay gốc, bỏ tỉ lệ → so được với tư thế nghỉ */
    local(frame, nm) {
      const p = sub(this.world(frame, nm), frame.root), c = Math.cos(frame.yaw), s = Math.sin(frame.yaw), sc = sample.meta.scale || [1, 1, 1];
      return [(p[0] * c - p[2] * s) / sc[0], p[1] / sc[1], (p[0] * s + p[2] * c) / sc[2]];
    },
  };
}
const forwardOf = (frame) => [Math.sin(frame.yaw), 0, Math.cos(frame.yaw)];

/* ----- 1. chân với mặt nền ----- */
/**
 * Xuyên đất: độ sâu lớn nhất của điểm thấp nhất mỗi bàn chân dưới mặt nền.
 * belowRootMax: đế chân xuống thấp hơn gốc nhân vật bao nhiêu — phần chìm do chính hoạt hoạ, không phụ thuộc bộ điều khiển đặt gốc cao hay thấp.
 * Lơ lửng: đứng/đi luôn phải có một chân chạm đất → khe hở = min(hai chân), lấy lớn nhất theo khung;
 * chạy/chuyển tiếp có pha bay → mỗi chân phải chạm đất ít nhất một lần, lấy độ cao thấp nhất của từng chân.
 */
export function measureGround(sample) {
  const flying = sample.meta.kind === 'run' || sample.meta.kind === 'transition' || sample.meta.kind === 'long';
  let penMax = 0, penFoot = null, penT = null, supportGapMax = -Infinity, gapT = null, belowRootMax = 0, rootSum = 0, rootMin = Infinity, rootMax = -Infinity;
  const footMin = { L: Infinity, R: Infinity };
  for (const f of sample.frames) {
    const h = { L: f.feet.L.minY - f.ground, R: f.feet.R.minY - f.ground };
    for (const side of ['L', 'R']) {
      footMin[side] = Math.min(footMin[side], h[side]);
      if (-h[side] > penMax) { penMax = -h[side]; penFoot = side; penT = f.t; }
      belowRootMax = Math.max(belowRootMax, f.root[1] - f.feet[side].minY);
    }
    const ro = f.root[1] - f.ground; rootSum += ro; rootMin = Math.min(rootMin, ro); rootMax = Math.max(rootMax, ro);
    const gap = Math.min(h.L, h.R); if (gap > supportGapMax) { supportGapMax = gap; gapT = f.t; }
  }
  const floatMax = Math.max(0, flying ? Math.max(footMin.L, footMin.R) : supportGapMax);
  return { penMax, penFoot, penT, belowRootMax, floatMax, floatT: flying ? null : gapT, footMin, rootOffset: { mean: rootSum / sample.frames.length, min: rootMin, max: rootMax } };      // rootOffset: gốc nhân vật so với mặt nền
}

/* ----- 2. trượt chân ----- */
/**
 * Khựng: khung mà tốc độ của bộ điều khiển nhân vật tụt quá nửa chỉ trong một khung dù đang đi/chạy (nhả phím thì tốc độ giảm dần,
 * không tụt kiểu này). Trả về chỉ số các khung khựng.
 */
export function findStalls(sample) {
  const out = [], fr = sample.frames;
  for (let i = 1; i < fr.length; i++) if (fr[i - 1].speed > 1 && fr[i].speed < fr[i - 1].speed * 0.5) out.push(i);
  return out;
}
/**
 * Vận tốc ngang của các điểm dò ở đế trong lúc chúng đang chạm đất. Một điểm dò "đang chạm đất" khi nó nằm thấp (dưới ngưỡng tính
 * từ mức thấp quen thuộc của bàn chân đó) liên tục ít nhất CONTACT.minFrames khung — bỏ khung đầu và cuối của mỗi đợt (lúc đặt chân,
 * nhấc chân) — và gần đứng yên theo phương dọc. Chân đang vung lướt sát đất (đi cùng chiều và nhanh hơn thân) không tính.
 * Tính trên toạ độ thế giới — chân trụ đúng thì đứng yên dù thân đang đi. Các khung quanh lúc nhân vật khựng vẫn được tính.
 */
export function measureSlide(sample) {
  const { frames, meta } = sample, dt = meta.dt, n = frames.length, perFoot = {}, skip = new Set();      // skip để trống: các khung quanh lúc khựng KHÔNG còn bị loại (trước đây loại, làm số trượt đẹp hơn thực tế)
  const rootVel = (i) => [(frames[i + 1].root[0] - frames[i - 1].root[0]) / (2 * dt), (frames[i + 1].root[2] - frames[i - 1].root[2]) / (2 * dt)];
  for (const side of ['L', 'R']) {
    const heights = frames.map(f => f.feet[side].minY - f.ground), base = Math.min(CONTACT.baseMax, Math.max(0, percentile(heights, 0.05))), limit = base + CONTACT.height;
    const count = n ? frames[0].feet[side].probes.length / 3 : 0, need = count >= 4 ? 2 : 1, sum = new Float64Array(n), hits = new Int32Array(n);
    const at = (i, k, c) => frames[i].feet[side].probes[k * 3 + c];
    for (let k = 0; k < count; k++) {
      for (let s0 = 0; s0 < n;) {
        if (at(s0, k, 1) - frames[s0].ground > limit) { s0++; continue; }
        let e = s0; while (e + 1 < n && at(e + 1, k, 1) - frames[e + 1].ground <= limit) e++;
        if (e - s0 + 1 >= CONTACT.minFrames) for (let i = Math.max(1, s0 + 1); i <= Math.min(n - 2, e - 1); i++) {
          if (Math.abs(at(i + 1, k, 1) - at(i - 1, k, 1)) / (2 * dt) > CONTACT.vyMax) continue;
          const vx = (at(i + 1, k, 0) - at(i - 1, k, 0)) / (2 * dt), vz = (at(i + 1, k, 2) - at(i - 1, k, 2)) / (2 * dt), v = Math.hypot(vx, vz), rv = rootVel(i), rs = Math.hypot(rv[0], rv[1]);
          if (rs > 0.5 && v > rs * CONTACT.swingRatio && vx * rv[0] + vz * rv[1] > 0) continue;
          sum[i] += v; hits[i]++;
        }
        s0 = e + 1;
      }
    }
    const speeds = []; for (let i = 0; i < n; i++) if (hits[i] >= need && !skip.has(i)) speeds.push({ v: sum[i] / hits[i], t: frames[i].t });
    const vs = speeds.map(x => x.v), top = speeds.reduce((m, x) => (x.v > m.v ? x : m), { v: 0, t: null });
    perFoot[side] = { contactFrames: vs.length, mean: vs.length ? vs.reduce((x, y) => x + y, 0) / vs.length : 0, max: top.v, maxT: top.t };
  }
  const worst = perFoot.L.max >= perFoot.R.max ? 'L' : 'R';
  return { contactFrames: perFoot.L.contactFrames + perFoot.R.contactFrames, mean: Math.max(perFoot.L.mean, perFoot.R.mean), meanFoot: perFoot.L.mean >= perFoot.R.mean ? 'L' : 'R', max: perFoot[worst].max, maxFoot: worst, maxT: perFoot[worst].maxT, perFoot };
}

/* ----- 3. độ dài xương ----- */
export function measureBoneLengths(sample) {
  const R = boneReader(sample), rest = sample.meta.rest.pos, segs = {}; let maxDev = 0, worst = null, worstT = null;
  for (const [name, chain] of Object.entries(SEGMENTS)) {
    if (!chain.every(nm => R.has(nm) && rest[nm])) continue;
    let restLen = 0; for (let i = 1; i < chain.length; i++) restLen += len(sub(rest[chain[i]], rest[chain[i - 1]]));
    if (restLen < 1e-6) continue;
    let min = Infinity, max = -Infinity, dev = 0, devT = null;
    for (const f of sample.frames) {
      let l = 0; for (let i = 1; i < chain.length; i++) l += len(sub(R.local(f, chain[i]), R.local(f, chain[i - 1])));
      min = Math.min(min, l); max = Math.max(max, l);
      const d = Math.abs(l / restLen - 1); if (d > dev) { dev = d; devT = f.t; }
    }
    segs[name] = { rest: restLen, min, max, dev };
    if (dev > maxDev) { maxDev = dev; worst = name; worstT = devT; }
  }
  return { maxDev, worst, worstT, segs };
}

/* ----- 4. tư thế ----- */
/** góc ngả về trước (độ, + là ra trước) của đoạn a→b so với phương thẳng đứng, trong mặt phẳng trước–sau của nhân vật.
 * Góc ngả lưng báo ra đã trừ góc của chính đoạn hông→ngực ở tư thế nghỉ (khớp hông của bộ xương nằm lệch trước cột sống ngực sẵn ~11°). */
const forwardAngle = (a, b, fwd) => { const v = sub(b, a); return Math.atan2(dot(v, fwd), v[1]) * DEG; };
/**
 * Góc gập có dấu của khớp bản lề (gối, khuỷu): + là gập đúng chiều, − là gập ngược.
 * Chiều gập đúng lấy từ hướng thật của xương trên (đùi/cánh tay): flexRest (hệ mô hình, lúc nghỉ) quay theo độ lệch hướng hiện tại so với lúc nghỉ.
 */
function hingeBend(upper, joint, end, qWorld, qRest, flexRest) {
  const u = norm(sub(joint, upper)), l = norm(sub(end, joint)), flex = norm(perp(qRot(qMul(qWorld, qConj(qRest)), flexRest), u)), side = perp(l, u);
  const bend = Math.atan2(dot(side, flex), dot(l, u)) * DEG, total = Math.acos(Math.max(-1, Math.min(1, dot(l, u)))) * DEG;
  const dev = total > CONTACT.minBendForHinge ? Math.acos(Math.max(-1, Math.min(1, dot(norm(side), flex)))) * DEG : null;
  return { bend, total, hingeDev: dev };
}
/** độ hở (m) từ mặt ngoài cổ tay tới mặt thân, theo biên dạng thân dạng elip từng dải cao độ; âm = lấn vào thân; null = ngoài tầm cao của biên dạng */
function wristClearance(torso, wrist, hips, restHipsY) {
  const i = Math.floor((wrist[1] - hips[1] + restHipsY - torso.y0) / torso.dy);
  if (i < 0 || i >= torso.rx.length || !(torso.rx[i] > 0)) return null;
  const rz = (torso.zf[i] - torso.zb[i]) / 2, x = wrist[0] - hips[0], z = wrist[2] - hips[2] - (torso.zf[i] + torso.zb[i]) / 2;
  if (!(rz > 0)) return null;
  const r = Math.hypot(x, z), e = Math.hypot(x / torso.rx[i], z / rz);
  return (e < 1e-6 ? -Math.min(torso.rx[i], rz) : r - r / e) - CONTACT.wristRadius;
}
/**
 * Độ hở (m) từ mặt ngoài cổ tay tới mặt đùi. Đùi = ống tiết diện elip quanh trục khớp háng → gối: bán trục "ra ngoài" (out) và
 * "trước–sau" (fb) đo từ lưới ở tư thế nghỉ, nội suy từ nửa trên (top) xuống nửa dưới (bottom). side = +1 đùi trái, −1 đùi phải.
 */
function thighClearance(thigh, wrist, hip, knee, side) {
  const ax = sub(knee, hip), l2 = dot(ax, ax); if (l2 < 1e-9) return null;
  const u = norm(ax), raw = dot(sub(wrist, hip), ax) / l2, t = Math.max(0, Math.min(1, raw)), d = sub(wrist, [hip[0] + ax[0] * t, hip[1] + ax[1] * t, hip[2] + ax[2] * t]);
  const across = perp(d, u), r = len(across), beyond = raw === t ? 0 : Math.abs(dot(d, u));      // beyond: cổ tay nằm quá đầu mút của đùi (trên khớp háng / dưới gối) bao xa
  const outDir = norm(perp([side, 0, 0], u)), fbDir = norm(perp(perp([0, 0, 1], u), outDir));
  const rOut = thigh.top.out + (thigh.bottom.out - thigh.top.out) * t, rFb = thigh.top.fb + (thigh.bottom.fb - thigh.top.fb) * t, e = Math.hypot(dot(across, outDir) / rOut, dot(across, fbDir) / rFb);
  const inPlane = e < 1e-6 ? -Math.min(rOut, rFb) : r - r / e;
  return (beyond > 0 ? (inPlane > 0 ? Math.hypot(inPlane, beyond) : beyond) : inPlane) - CONTACT.wristRadius;
}
export function measurePosture(sample) {
  const R = boneReader(sample), { rest, torso, thigh } = sample.meta, restLean = forwardAngle(rest.pos.Hips, rest.pos.Spine2, [0, 0, 1]), restHunch = R.has('Spine1') && rest.pos.Spine1 ? forwardAngle(rest.pos.Spine1, rest.pos.Neck, [0, 0, 1]) - forwardAngle(rest.pos.Hips, rest.pos.Spine1, [0, 0, 1]) : 0;
  const out = { leanMean: 0, leanMax: -Infinity, leanMaxT: null, hunchMax: -Infinity, kneeHyperMax: 0, kneeHyperSide: null, kneeHyperT: null, elbowHyperMax: 0, elbowHyperSide: null, elbowHyperT: null,
    hingeDevMax: { knee: 0, elbow: 0 }, handClearMin: null, handClearSide: null, handClearT: null, headPitchMin: Infinity, headPitchMax: -Infinity, headPitchMean: 0 };
  let n = 0;
  for (const f of sample.frames) {
    const fwd = forwardOf(f), W = (nm) => R.world(f, nm); n++;
    const lean = forwardAngle(W('Hips'), W('Spine2'), fwd) - restLean; out.leanMean += lean; if (lean > out.leanMax) { out.leanMax = lean; out.leanMaxT = f.t; }
    if (R.has('Spine1')) out.hunchMax = Math.max(out.hunchMax, forwardAngle(W('Spine1'), W('Neck'), fwd) - forwardAngle(W('Hips'), W('Spine1'), fwd) - restHunch);
    if (f.q && f.q.Head && rest.quat.Head) { const d = qRot(qMul(f.q.Head, qConj(rest.quat.Head)), [0, 0, 1]), pitch = Math.asin(Math.max(-1, Math.min(1, d[1]))) * DEG; out.headPitchMin = Math.min(out.headPitchMin, pitch); out.headPitchMax = Math.max(out.headPitchMax, pitch); out.headPitchMean += pitch; }
    for (const [S, side] of [['Left', 'T'], ['Right', 'P']]) {
      if (f.q && f.q[S + 'UpLeg'] && rest.quat[S + 'UpLeg']) {
        const k = hingeBend(W(S + 'UpLeg'), W(S + 'Leg'), W(S + 'Foot'), f.q[S + 'UpLeg'], rest.quat[S + 'UpLeg'], [0, 0, -1]);
        if (-k.bend > out.kneeHyperMax) { out.kneeHyperMax = -k.bend; out.kneeHyperSide = side; out.kneeHyperT = f.t; }
        if (k.hingeDev !== null) out.hingeDevMax.knee = Math.max(out.hingeDevMax.knee, k.hingeDev);
      }
      if (f.q && f.q[S + 'Arm'] && rest.quat[S + 'Arm']) {
        const e = hingeBend(W(S + 'Arm'), W(S + 'ForeArm'), W(S + 'Hand'), f.q[S + 'Arm'], rest.quat[S + 'Arm'], [0, 0, 1]);
        if (-e.bend > out.elbowHyperMax) { out.elbowHyperMax = -e.bend; out.elbowHyperSide = side; out.elbowHyperT = f.t; }
        if (e.hingeDev !== null) out.hingeDevMax.elbow = Math.max(out.hingeDevMax.elbow, e.hingeDev);
      }
      if (torso && rest.pos.Hips) {
        const wrist = R.local(f, S + 'Hand'), cs = [wristClearance(torso, wrist, R.local(f, 'Hips'), rest.pos.Hips[1])];
        if (thigh) for (const [T, sgn] of [['Left', 1], ['Right', -1]]) cs.push(thighClearance(thigh, wrist, R.local(f, T + 'UpLeg'), R.local(f, T + 'Leg'), sgn));
        const real = cs.filter(x => x !== null), c = real.length ? Math.min(...real) : null;
        if (c !== null && (out.handClearMin === null || c < out.handClearMin)) { out.handClearMin = c; out.handClearSide = side; out.handClearT = f.t; }
      }
    }
  }
  if (n) { out.leanMean /= n; out.headPitchMean /= n; }
  if (!Number.isFinite(out.headPitchMin)) { out.headPitchMin = out.headPitchMax = out.headPitchMean = null; }
  if (!Number.isFinite(out.hunchMax)) out.hunchMax = null;
  return out;
}

/* ----- 5. tính liền mạch ----- */
/**
 * Sai phân bậc hai của vị trí xương (hệ nhân vật) giữa ba khung liền nhau: chuyển động trơn cho giá trị nhỏ, một cú giật cho đỉnh nhọn.
 * Các khung quanh lúc nhân vật khựng (findStalls) vẫn tính vào 'giật'; cờ 'khựng' ghi thêm riêng độ lớn cú giật ngay sau lúc khựng.
 * Chỗ nối vòng lặp = khung mà clipTime tụt lùi; "vượt mức" = đỉnh tại chỗ nối trừ đi mức thường (phân vị 95) của chính xương đó trong clip.
 */
export function measureContinuity(sample) {
  const R = boneReader(sample), { frames } = sample, names = TRACKED.filter(nm => R.has(nm));
  const seams = []; for (let i = 1; i < frames.length; i++) if (frames[i].clipTime != null && frames[i - 1].clipTime != null && frames[i].clipTime < frames[i - 1].clipTime - 1e-6) seams.push(i);
  const stalls = findStalls(sample), nearStall = new Set(), afterStall = new Set(); for (const i of stalls) for (let k = -2; k <= STALL_RECOVERY; k++) afterStall.add(i + k);      // nearStall để trống: cú giật quanh lúc khựng vẫn tính vào 'giật'; afterStall chỉ để ghi riêng độ lớn
  const nearSeam = new Set(); for (const s of seams) if (!nearStall.has(s)) { nearSeam.add(s - 1); nearSeam.add(s); }      // chỗ nối trùng lúc khựng: không đánh giá được, bỏ
  let stepMax = 0, jerkMax = 0, jerkBone = null, jerkT = null, seamExcess = 0, seamBone = null, seamJump = 0, stallJerk = 0;
  for (const nm of names) {
    const P = frames.map(f => R.local(f, nm)), sc = sample.meta.scale || [1, 1, 1], normal = []; let atSeam = 0;
    for (let i = 1; i < P.length; i++) stepMax = Math.max(stepMax, len(sub(P[i], P[i - 1])) * sc[1]);
    for (let i = 1; i < P.length - 1; i++) {
      const d2 = len([P[i + 1][0] - 2 * P[i][0] + P[i - 1][0], P[i + 1][1] - 2 * P[i][1] + P[i - 1][1], P[i + 1][2] - 2 * P[i][2] + P[i - 1][2]]) * sc[1];
      if (afterStall.has(i)) stallJerk = Math.max(stallJerk, d2);
      if (d2 > jerkMax) { jerkMax = d2; jerkBone = nm; jerkT = frames[i].t; }
      if (nearSeam.has(i)) atSeam = Math.max(atSeam, d2); else normal.push(d2);
    }
    if (nearSeam.size && normal.length) { const ex = atSeam - percentile(normal, 0.95); if (ex > seamExcess) { seamExcess = ex; seamBone = nm; seamJump = atSeam; } }
  }
  const cleanSeams = nearSeam.size / 2;
  return { stepMax, jerkMax, jerkBone, jerkT, seams: cleanSeams, seamExcess: cleanSeams ? seamExcess : null, seamBone, seamJump, stalls: stalls.length, stallTimes: stalls.map(i => frames[i].t), stallJerk };
}

/* ----- 6. địa hình: cầu thang, dốc ----- */
/**
 * Mẫu kind 'terrain': mỗi khung có tf = { L: [hở cổ chân, hở mũi chân], R: […] } — khoảng hở (m, âm = chìm) so với MẶT VA CHẠM THẬT ngay dưới từng điểm (đã trừ cao độ nghỉ
 * của điểm đó), null nếu dưới điểm ấy không có nền; meta.expectSpeed = tốc độ ngang của cùng kiểu đi trên nền phẳng. Chỉ xét các khung nhân vật đang ở trên dốc
 * (cao độ gốc đang đổi) — không có khung nào như thế thì xét tất cả.
 */
export function measureTerrain(sample) {
  const fr = sample.frames, on = fr.filter((f, i) => i > 0 && Math.abs(f.root[1] - fr[i - 1].root[1]) > 0.0015), use = on.length >= 10 ? on : fr;
  let penMax = 0, penT = null; const low = [];
  for (const f of use) { const cs = [...f.tf.L, ...f.tf.R].filter(v => v !== null); if (!cs.length) continue; const m = Math.min(...cs); low.push(m); if (-m > penMax) { penMax = -m; penT = f.t; } }
  const speeds = fr.slice(Math.min(30, fr.length >> 1)).map(f => f.speed), mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  return { frames: use.length, penMax, penT, floatP95: low.length ? Math.max(0, percentile(low, 0.95)) : 0, lowMedian: low.length ? percentile(low, 0.5) : 0, speedMean: mean, speedRatio: sample.meta.expectSpeed > 0 ? mean / sample.meta.expectSpeed : 1, climb: fr[fr.length - 1].root[1] - fr[0].root[1] };
}

/* ----- tổng hợp ----- */
const grade = (value, [warn, error]) => (value > error ? LEVEL.ERROR : value > warn ? LEVEL.WARN : LEVEL.OK);
const RANK = { [LEVEL.OK]: 0, [LEVEL.WARN]: 1, [LEVEL.ERROR]: 2 };
/** mức nặng tương đối của một cờ: giá trị chia cho ngưỡng lỗi (≥ 1 là lỗi) — dùng để xếp hạng */
const severity = (value, limits) => value / limits[1];

export function analyze(sample) {
  if (!sample.frames || sample.frames.length < 3) throw new Error('Mẫu quá ngắn (' + (sample.frames ? sample.frames.length : 0) + ' khung)');
  const kind = sample.meta.kind, ground = measureGround(sample), slide = measureSlide(sample), bones = measureBoneLengths(sample), posture = measurePosture(sample), continuity = measureContinuity(sample);
  const flags = [], cm = (v) => (v * 100).toFixed(1) + ' cm', at = (t) => (t == null ? '' : ` lúc t=${t.toFixed(2)}s`);
  const add = (metric, value, limits, text) => { const level = grade(value, limits); if (level !== LEVEL.OK) flags.push({ metric, level, value, limit: limits[level === LEVEL.ERROR ? 1 : 0], severity: severity(value, limits), text }); };
  const stallFlag = () => add('khựng', continuity.stalls, LIMITS.stalls, `bộ điều khiển nhân vật đứng khựng ${continuity.stalls} lần giữa lúc đang đi/chạy (t=${continuity.stallTimes.map(t => t.toFixed(2)).join(', ')}s), kéo theo cú giật ${cm(continuity.stallJerk)}/khung²`);
  const done = (extra) => { flags.sort((a, b) => b.severity - a.severity); return { level: flags.reduce((m, f) => (RANK[f.level] > RANK[m] ? f.level : m), LEVEL.OK), flags, metrics: { ground, slide, bones, posture, continuity, ...extra } }; };
  if (kind === 'terrain') {      // cầu thang/dốc: mặt nền dưới gốc không phải mặt nền dưới từng bàn chân → chỉ xét chỉ số địa hình, tốc độ và khựng
    const terrain = measureTerrain(sample);
    add('chìm (địa hình)', terrain.penMax, LIMITS.terrainPen, `cổ chân/mũi chân chìm ${cm(terrain.penMax)} dưới mặt va chạm${at(terrain.penT)}`);
    add('hở (địa hình)', terrain.floatP95, LIMITS.terrainFloat, `điểm thấp nhất của hai chân hở mặt va chạm tới ${cm(terrain.floatP95)} (phân vị 95)`);
    { const [warn, error] = LIMITS.slopeSpeed, r = terrain.speedRatio, level = r < error ? LEVEL.ERROR : r < warn ? LEVEL.WARN : LEVEL.OK; if (level !== LEVEL.OK) flags.push({ metric: 'tốc độ trên dốc', level, value: r, limit: level === LEVEL.ERROR ? error : warn, severity: error / Math.max(r, 1e-6), text: `tốc độ ngang ${terrain.speedMean.toFixed(2)} m/s, chỉ bằng ${(r * 100).toFixed(0)} % tốc độ trên nền phẳng (${sample.meta.expectSpeed} m/s)` }); }
    add('giãn xương', bones.maxDev, LIMITS.boneStretch, `${bones.worst} lệch ${(bones.maxDev * 100).toFixed(1)} % so với tư thế nghỉ${at(bones.worstT)}`);
    add('gối gập ngược', posture.kneeHyperMax, LIMITS.kneeHyper, `gối ${posture.kneeHyperSide === 'T' ? 'trái' : 'phải'} gập ngược ${posture.kneeHyperMax.toFixed(1)}°${at(posture.kneeHyperT)}`);
    stallFlag(); return done({ terrain });
  }
  if (kind === 'long') {      // chạy dài với dt thay đổi: vận tốc từng khung không so được (dt không đều) → chỉ xét xuyên đất, lơ lửng, giãn xương và khựng
    add('xuyên đất', ground.penMax, LIMITS.penetration, `đế chân ${ground.penFoot === 'L' ? 'trái' : 'phải'} chìm ${cm(ground.penMax)}${at(ground.penT)}`);
    add('lơ lửng', ground.floatMax, LIMITS.float, `chân trụ hở nền ${cm(ground.floatMax)}`);
    add('giãn xương', bones.maxDev, LIMITS.boneStretch, `${bones.worst} lệch ${(bones.maxDev * 100).toFixed(1)} % so với tư thế nghỉ${at(bones.worstT)}`);
    stallFlag(); return done({});
  }
  add('xuyên đất', ground.penMax, LIMITS.penetration, `đế chân ${ground.penFoot === 'L' ? 'trái' : 'phải'} chìm ${cm(ground.penMax)}${at(ground.penT)}; riêng hoạt hoạ đưa đế xuống dưới gốc nhân vật tới ${cm(ground.belowRootMax)}`);
  add('lơ lửng', ground.floatMax, LIMITS.float, `chân trụ hở nền ${cm(ground.floatMax)}${at(ground.floatT)}`);
  add('trượt chân (TB)', slide.mean, LIMITS.slideMean, `chân ${slide.meanFoot === 'L' ? 'trái' : 'phải'} lúc chạm đất trượt trung bình ${slide.mean.toFixed(2)} m/s`);
  add('trượt chân (đỉnh)', slide.max, LIMITS.slideMax, `chân ${slide.maxFoot === 'L' ? 'trái' : 'phải'} chạm đất trượt tới ${slide.max.toFixed(2)} m/s${at(slide.maxT)}`);
  add('giãn xương', bones.maxDev, LIMITS.boneStretch, `${bones.worst} lệch ${(bones.maxDev * 100).toFixed(1)} % so với tư thế nghỉ${at(bones.worstT)}`);
  const leanLimits = kind === 'run' || kind === 'transition' ? LIMITS.leanRun : kind === 'walk' ? LIMITS.leanWalk : LIMITS.leanStand;
  if (kind !== 'sit') {
    add('ngả lưng', kind === 'transition' ? posture.leanMax : posture.leanMean, leanLimits, `lưng ngả trước trung bình ${posture.leanMean.toFixed(1)}°, lớn nhất ${posture.leanMax.toFixed(1)}°`);
    if (posture.hunchMax !== null) add('gù lưng', posture.hunchMax, LIMITS.hunch, `lưng trên gập trước thêm ${posture.hunchMax.toFixed(1)}° so với tư thế nghỉ`);
  }
  add('gối gập ngược', posture.kneeHyperMax, LIMITS.kneeHyper, `gối ${posture.kneeHyperSide === 'T' ? 'trái' : 'phải'} gập ngược ${posture.kneeHyperMax.toFixed(1)}°${at(posture.kneeHyperT)}`);
  add('khuỷu gập ngược', posture.elbowHyperMax, LIMITS.elbowHyper, `khuỷu ${posture.elbowHyperSide === 'T' ? 'trái' : 'phải'} gập ngược ${posture.elbowHyperMax.toFixed(1)}°${at(posture.elbowHyperT)}`);
  // tay xuyên thân chỉ xét khi đứng nghỉ / đi / chạy: các dáng chụp ảnh (chống hông, khoanh tay…) cố ý đặt tay lên thân
  if (posture.handClearMin !== null && (kind === 'idle' || kind === 'walk' || kind === 'run')) add('tay xuyên thân', -posture.handClearMin, LIMITS.handInBody, `cổ tay ${posture.handClearSide === 'T' ? 'trái' : 'phải'} lấn vào thân ${cm(-posture.handClearMin)}${at(posture.handClearT)}`);
  if (posture.headPitchMin !== null && kind !== 'sit') {
    const worst = Math.max(-posture.headPitchMin, posture.headPitchMax);
    add('đầu cúi/ngửa', worst, LIMITS.headPitch, -posture.headPitchMin > posture.headPitchMax ? `đầu cúi tới ${(-posture.headPitchMin).toFixed(1)}°` : `đầu ngửa tới ${posture.headPitchMax.toFixed(1)}°`);
  }
  if (continuity.seamExcess !== null) add('giật chỗ nối vòng', continuity.seamExcess, LIMITS.seamExcess, `${continuity.seamBone} nhảy ${cm(continuity.seamJump)} ở chỗ nối vòng lặp (vượt mức thường ${cm(continuity.seamExcess)})`);
  add('giật', continuity.jerkMax, kind === 'run' || kind === 'transition' ? LIMITS.jerkRun : LIMITS.jerk, `${continuity.jerkBone} đổi vận tốc đột ngột ${cm(continuity.jerkMax)}/khung²${at(continuity.jerkT)}`);
  stallFlag();
  return done({});
}

/* ----- bảng văn bản ----- */
const COLUMNS = [
  // phép đo địa hình (cầu thang, dốc): hai cột đầu là chìm / hở so với mặt va chạm thật dưới từng bàn chân, không phải so với nền dưới gốc
  ['xuyên', 6, (m) => ((m.terrain ? m.terrain.penMax : m.ground.penMax) * 100).toFixed(1)], ['hở', 5, (m) => ((m.terrain ? m.terrain.floatP95 : m.ground.floatMax) * 100).toFixed(1)],
  ['trượt TB', 8, (m) => (m.slide.contactFrames ? m.slide.mean.toFixed(2) : '–')], ['đỉnh', 5, (m) => (m.slide.contactFrames ? m.slide.max.toFixed(2) : '–')],
  ['xương%', 6, (m) => (m.bones.maxDev * 100).toFixed(1)], ['lưng TB', 7, (m) => m.posture.leanMean.toFixed(1)], ['max', 5, (m) => m.posture.leanMax.toFixed(1)],
  ['gù', 5, (m) => (m.posture.hunchMax === null ? '–' : m.posture.hunchMax.toFixed(1))], ['gối↩', 5, (m) => m.posture.kneeHyperMax.toFixed(1)], ['khuỷu↩', 6, (m) => m.posture.elbowHyperMax.toFixed(1)],
  ['tay-thân', 8, (m) => (m.posture.handClearMin === null ? '–' : (m.posture.handClearMin * 100).toFixed(1))],
  ['đầu', 11, (m) => (m.posture.headPitchMin === null ? '–' : `${m.posture.headPitchMin.toFixed(0)}..${m.posture.headPitchMax.toFixed(0)}`)],
  ['nối', 5, (m) => (m.continuity.seamExcess === null ? '–' : (m.continuity.seamExcess * 100).toFixed(1))], ['giật', 5, (m) => (m.continuity.jerkMax * 100).toFixed(1)],
];
const LABEL_WIDTH = 34;
/** dòng tiêu đề của bảng (đơn vị: cm, m/s, %, độ) */
export function tableHeader() {
  return 'giới/ngoại hình/clip'.padEnd(LABEL_WIDTH) + COLUMNS.map(([name, w]) => name.padStart(w)).join(' ') + '  cờ';
}
/** một dòng bảng cho một mẫu đã phân tích */
export function tableRow(label, result) {
  return label.padEnd(LABEL_WIDTH).slice(0, LABEL_WIDTH) + COLUMNS.map(([, w, fn]) => fn(result.metrics).padStart(w)).join(' ') + '  ' + result.level + (result.flags.length ? ' — ' + result.flags.map(f => f.metric).join(', ') : '');
}
