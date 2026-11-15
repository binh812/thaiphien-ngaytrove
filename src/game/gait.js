// Trộn clip vận động theo tốc độ cho người có xương (rigged.js gọi): đi (CMU 07_01) ↔ chạy (CMU 35_17) chung một pha bước, pha tiến theo QUÃNG ĐƯỜNG đi được chia
// cho sải bước đã trộn — học từ animator.js của "Patch's starter man" (CC0); clip nhảy và clip đứng nghỉ thật lấy từ Universal Animation Library (CC0, anims_ual.glb).
// Đã thử pha thêm clip chạy sải dài Jog_Fwd_Loop của thư viện đó cho tốc độ 4,2 m/s (clip chạy CMU 3,0 m/s đang bị tua nhanh 1,4 lần): pha chạm đất của hai clip khác
// nhau (30 % và 17,5 % chu kỳ) nên chân trụ trượt trung bình 0,4 m/s thay vì 0,16 → bỏ, giữ clip ghi hình người thật.
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp, frac = (x) => x - Math.floor(x);
// Trọng số tắt dần theo hàm mũ không bao giờ về đúng 0, mà bộ trộn của three nội suy đủ mọi kênh của một clip hễ trọng số > 0 (đo: 6 clip "gần 0" làm mixer.update
// tốn 0,098 ms thay vì 0,024 ms mỗi người mỗi khung) → dưới W_MIN thì đặt hẳn về 0.
const W_MIN = 0.002, setW = (a, w) => a.setEffectiveWeight(w < W_MIN ? 0 : w);
const WALK_SPEED = 1.36, RUN_SPEED = 3.0;      // m/s ứng với clip đi/chạy ở nhịp gốc (đo ở cỡ m_white, xem manifest.animations)
const RUN_LEAD = 0.05;                         // clip chạy đặt chân trái muộn hơn clip đi chừng này (phần của một chu kỳ hai bước)
const START_PHASE = 0.22;                      // đứng yên rồi bước đi: vào chu kỳ ở giữa pha trụ chân trái, chân phải đang nhấc lên bước tới — vào ở pha chân trái vươn xa nhất thì bàn chân giật ra trước
const RATE = [0.6, 1.8];                       // nhịp bước được tua chậm/nhanh tối đa so với nhịp gốc đã trộn
const AIR_RATE = 0.35;                         // đang trên không mà còn trọng số chạy: chân khua chậm lại

function gaitInit(r) {
  const G = r.gait = { ph: START_PHASE, list: [] };
  for (const [name, speed, lead] of [['walk', WALK_SPEED, 0], ['run', RUN_SPEED, RUN_LEAD]]) {
    const a = r.act[name], dur = a ? a.getClip().duration : 0;
    if (dur > 0) G.list.push({ a, name, dur, stride: speed * dur, lead });
  }
  return G;
}

/**
 * Đặt trọng số và thời gian cho các clip đứng/đi/chạy của khung này. r.w = { idle, walk, run } (đã làm mượt ở animateRigged),
 * free = phần trọng số còn lại cho vận động (1 − dáng/clip phụ − nhảy). Gọi TRƯỚC mixer.update(dt).
 */
export function gaitMix(r, speed, dt, air, free) {
  const G = r.gait || gaitInit(r), w = r.w, sc = (r.g.scale.y || 1) * r.stride;      // người thấp, chân ngắn thì sải ngắn hơn → nhịp nhanh hơn ở cùng tốc độ
  idleMix(r, dt, w.idle * free);
  let sum = 0, stride = 0, nat = 0;
  for (const c of G.list) { const cw = w[c.name]; setW(c.a, cw * free); sum += cw; stride += cw * c.stride; nat += cw / c.dur; }
  if (sum < 1e-4) { G.ph = r.windK > 0.02 ? 0 : START_PHASE; return; }      // đang chờ cầu (nhún đổi chân tại chỗ): vào chu kỳ ở pha hai chân cùng chạm đất, kẻo cộng với nhịp nhún là cả hai bàn chân hở đất
  stride = stride / sum * sc; nat /= sum;
  let rate = clamp(speed / stride, RATE[0] * nat, RATE[1] * nat);      // số chu kỳ (hai bước) mỗi giây
  if (air) rate *= 1 + (AIR_RATE - 1) * (w.run / sum);
  for (const c of G.list) { c.a.time = frac(G.ph + c.lead) * c.dur; c.a.timeScale = rate * c.dur; }      // mixer.update(dt) sẽ đưa mọi clip tiến cùng một quãng pha
  G.ph = frac(G.ph + rate * dt);
}

// ----- nhảy bằng clip thật (Jump_Start / Jump_Loop / Jump_Land của Universal Animation Library) -----
// Vật lý nhảy không đổi (bấm là rời đất ngay): clip bật nhảy được phát từ sau quãng nhún (JUMP_FROM giây), chuyển dần sang clip lơ lửng, chạm đất thì phát clip tiếp đất
// từ khung chạm (LAND_FROM) ở mức LAND_W (clip gốc khuỵu rất sâu, hợp với cú rơi cao hơn cú nhảy 85 cm của ta). Đang chạy mà nhảy thì clip trên không chỉ chiếm một phần,
// phần còn lại là clip chạy đang khua chậm (sải chân trước–sau). Nhảy dây (r.jumpKind = 'rope') vẫn dùng dáng thủ tục của actJump.
const JUMP_FROM = 0.2, JUMP_RATE = 1.3, JUMP_TO_LOOP = [0.3, 0.55], LAND_FROM = 0.1, LAND_RATE = 1.5, LAND_W = 0.5, AIR_MOVE = 0.45;
const LAND_SECS = 0.5, LAND_SECS_ROPE = 0.34;      // quãng tiếp đất (giây): bằng clip / nhảy dây (thủ tục)
function airInit(r) {
  const A = r.airAct = {};
  for (const n of ['jump_start', 'jump_loop', 'jump_land']) { if (!r.clips[n]) { r.airAct = null; return null; } const a = A[n] = r.mixer.clipAction(r.clips[n]); a.play(); a.setEffectiveWeight(0); a.timeScale = n === 'jump_loop' ? 1 : 0; }
  return A;
}
/**
 * Theo dõi trạng thái trên không / tiếp đất (r.airT, r.airK, r.airV, r.land, r.landK — actJump ở rigged.js dùng tiếp) và đặt trọng số, thời gian cho ba clip nhảy.
 * Trả về phần trọng số (0..1) mà clip nhảy chiếm của khung này; đứng/đi/chạy nhận phần còn lại. Gọi TRƯỚC mixer.update(dt).
 */
export function airMix(r, dt, air, speed) {
  const rope = r.jumpKind === 'rope', A = r.airAct === undefined ? airInit(r) : r.airAct, clips = !!A && !rope;
  if (air) { r.airT += dt; r.land = 0; r.airV = Math.max(r.airV, speed); }
  else { if (r.airT > 0.14) { r.land = 1; r.landK = (rope ? 0.35 : 1) * Math.min(1, r.airT / 0.5); r.landV = r.airV; } r.airT = 0; r.airV = 0; }
  r.airK += ((air && r.airT > 0.03 ? 1 : 0) - r.airK) * (1 - Math.exp(-dt * 14));
  if (r.land > 0) r.land = Math.max(0, r.land - dt / (clips ? LAND_SECS : LAND_SECS_ROPE));
  if (!A) return 0;
  const S = THREE.MathUtils.smoothstep, mv = S(air ? r.airV : r.landV || 0, 0.8, 2.6);
  const wa = clips ? r.airK * (1 - AIR_MOVE * mv) : 0, toLoop = S(r.airT, JUMP_TO_LOOP[0], JUMP_TO_LOOP[1]);
  const wl = clips && r.land > 0 ? LAND_W * r.landK * (1 - 0.5 * mv) * S(r.land, 0, 0.45) : 0;
  const ws = air ? wa * (1 - toLoop) : 0, wo = wa - ws;      // vừa chạm đất: phần còn lại của dáng trên không tan dần qua clip lơ lửng
  setW(A.jump_start, ws); setW(A.jump_loop, wo); setW(A.jump_land, wl);
  if (ws > 0) A.jump_start.time = Math.min(A.jump_start.getClip().duration, JUMP_FROM + r.airT * JUMP_RATE);
  if (wl > 0) A.jump_land.time = Math.min(A.jump_land.getClip().duration, LAND_FROM + (1 - r.land) * LAND_SECS * LAND_RATE);
  return Math.min(1, wa + wl);
}

// ----- đứng nghỉ bằng clip thật -----
// idle_am: đứng thẳng thả lỏng, thở, đung đưa nhẹ (AM_Idle của Patch, CC0) làm nền cho mọi người; idle_fold: đứng khoanh tay (Idle_FoldArms_Loop của UAL 2) cho NPC có
// dáng cơ sở khoanh tay — rigged.js đặt r.idleWant = 'idle_fold'. Đã thử thêm biến thể nhìn quanh (Idle_LookAround): clip đó đứng choãi chân trước chân sau, mỗi lần
// đổi sang/đổi về bàn chân phải xê dịch (trượt tới 1–2 m/s ở người xa, không có neo chân) → bỏ; việc nhìn quanh, cử chỉ nhỏ vẫn do relaxPose/fidget lo.
const IDLE_CLIPS = ['idle_am', 'idle_fold'], IDLE_FADE = 1.6;      // nhịp đổi giữa hai dáng (1/s)
function idleInit(r) {
  const I = r.idles = { list: [] };
  for (const n of IDLE_CLIPS) { if (!r.clips[n]) continue; const a = r.mixer.clipAction(r.clips[n]); a.time = Math.random() * a.getClip().duration; a.play(); a.setEffectiveWeight(0); I.list.push({ n, a, w: n === IDLE_CLIPS[0] ? 1 : 0 }); }
  if (!I.list.some(v => v.n === IDLE_CLIPS[0])) I.list.length = 0;      // thiếu tệp anims_ual.glb: dùng clip idle cũ + dáng thủ tục như trước
  r.idleReal = I.list.length > 0;
  if (r.idleReal && r.act.idle) r.act.idle.setEffectiveWeight(0);
  return I;
}
function idleMix(r, dt, w) {
  const I = r.idles || idleInit(r);
  if (!r.idleReal) { if (r.act.idle) setW(r.act.idle, w); return; }
  const want = r.idleWant && I.list.some(v => v.n === r.idleWant) ? r.idleWant : IDLE_CLIPS[0], k = 1 - Math.exp(-dt * IDLE_FADE);
  let sum = 0; for (const v of I.list) { v.w += ((v.n === want ? 1 : 0) - v.w) * k; sum += v.w; }
  for (const v of I.list) setW(v.a, sum > 1e-4 ? w * v.w / sum : 0);
}

/**
 * Tạo sẵn mọi action (đi/chạy, nhảy, đứng nghỉ) cho một bộ xương vừa dựng — rigged.js gọi ngay khi dựng xong (lúc còn ở màn hình chờ). Để tới lần animateRigged đầu
 * tiên mới tạo thì khung đầu sau khi vào chơi phải gắn ~320 kênh cho mỗi người, cả lớp cùng một khung.
 */
export function animPrepare(r) { if (!r.gait) gaitInit(r); if (r.airAct === undefined) airInit(r); if (!r.idles) idleInit(r); }
