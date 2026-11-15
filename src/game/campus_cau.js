// Đá cầu: quả cầu bay thật (trọng lực + cản lớn kiểu lông vũ), cả vòng chuyền qua lại, người chơi được nhận cầu đều đặn.
// MỘT phím chính: F (hoặc chuột trái) = đá chuyền, tự chọn bạn kế tiếp trong vòng — không cần ngắm, không cần xoay máy.
//   Space = tâng tại chỗ (giữ cầu cho mình) · giữ F tới lúc chạm cầu = đá bổng thật cao cho bạn đứng xa nhất.
// Bấm sớm vẫn được: khi cầu đang bay tới mình, lệnh đá được GIỮ CHỜ và chân tự ra lúc cầu xuống tới tầm (không phải canh đúng khung hình).
// Cầu chạm đất là mất lượt; đếm số chạm liên tiếp của cả vòng, kỷ lục lưu máy. Chân vung bằng trường kick của rigged.js.
import * as THREE from 'three';
import { Q } from '../engine/util.js';
import { typing } from './reunion_ui.js';
import { KICK_LEAD } from './rigged.js';

const RADIUS = 2.2, DRAG = 1.5, GRAV = 9.0, FOOT = 0.3, KID_REACH = 0.8, KID_SPEED = 3.0;
const REACH = 1.6, REACH_LO = 0.05, REACH_HI = 1.7;      // tầm chân người chơi (m): rộng rãi, cầu còn cao ngang ngực vẫn đá được
// vận tốc đứng ban đầu (m/s): chuyền, tâng tại chỗ, đá bổng, cú các bạn chuyền cho nhau, và cú các bạn đá CHO NGƯỜI CHƠI (bay ~1,8 giây)
const KICKS = { pass: 7.0, lob: 7.4, far: 10.5, kid: 7.4, serve: 11.2 };
const BUFFER = 3, HOLD_FAR = 0.3, KICK_FADE = 3.2, RESTART = 1.1, ACTIVE_R = 45, LEAVE_R = 9;
// Điểm chạm: chân ra khi cầu đã xuống tới tầm BÀN CHÂN (HIT_H mét trên nền) chứ không phải ngay khi cầu vào tầm (trước đây cầu đổi hướng ở ngang đầu trong khi chân còn dưới đất).
// Cú đá được báo trước cho rigged.js tối đa KICK_LEAD giây (lấy đà → vung) kèm chỗ cầu sẽ ở lúc chạm; cầu phát cho ai thì rơi trước mũi chân người đó FRONT mét.
const HIT_H = { pass: 0.42, lob: 0.46, far: 0.42, kid: 0.42 }, HIT_MIN = 0.05, FRONT = 0.38, SIM_H = 1 / 120;
const ME_EVERY = 2, SELF_MAX = 3, WILD = 0.08, KID_MISS = 0.1, MISS_FROM = 4, SELF_FWD = 0.3, BRAG_FROM = 3, CAM_DIST = 6.4, CAM_PITCH = 0.3, NUDGE_AFTER = 2;

export function initCau(K) {
  const { ctx, ui, D, state, save, actors } = K, { player, scene } = ctx, st = player.st, C0 = D.CAU, [cx, cz] = C0.at, tmp = new THREE.Vector3();
  const C = document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches ? { ...C0, ...C0.touch } : C0;      // máy cảm ứng: lời nhắc nói tên nút thay cho tên phím
  const kids = C.looks.slice(0, Q.grass < 0.5 ? 2 : 3).map((look) => actors.add({ x: cx, y: 0.02, z: cz, f: 0 }, look, { face: { x: cx, z: cz }, vmax: KID_SPEED, show: 60, smile: 0.5 }));
  // Các bạn chạy đón cầu KHÔNG có khối va chạm: khối cố định bị dời bằng tay sẽ hất ghế nhựa quanh đó, và ghế đang "ngủ" tựa vào người
  // sẽ treo lơ lửng khi người chạy đi (khối cố định dời đi không đánh thức vật động).
  for (const a of kids) { a.dest = { x: cx, z: cz }; actors.solid(a, false); }

  /* ----- quả cầu (to, tương phản cao), bóng tròn dưới nền, vòng báo điểm rơi, vệt chỉ hướng ----- */
  const cau = new THREE.Group();
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 12), new THREE.MeshStandardMaterial({ color: 0xd8262b, emissive: 0x5a0c0e })),
      fe = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 8, 1, true).rotateX(Math.PI).translate(0, 0.14, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x555555, side: THREE.DoubleSide }));
    cau.add(base, fe); cau.traverse((o) => { o.castShadow = true; }); } scene.add(cau);
  const flat = (geo, color, op) => { const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); m.visible = false; m.userData.noBake = true; m.renderOrder = 2; scene.add(m); return m; };
  const blob = flat(new THREE.CircleGeometry(0.16, 16), 0x000000, 0.4), mark = flat(new THREE.RingGeometry(0.34, 0.46, 28), 0xffd66a, 0.85), dot = flat(new THREE.CircleGeometry(0.1, 12), 0xffd66a, 0.85);
  const trailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), trail = new THREE.Line(trailGeo, new THREE.LineDashedMaterial({ color: 0xfff0b0, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.8 }));
  trail.visible = false; trail.frustumCulled = false; trail.userData.noBake = true; scene.add(trail);
  const COL_MINE = new THREE.Color(0x7dff8a), COL_OTHER = new THREE.Color(0xffd66a);

  const p = new THREE.Vector3(cx, 1, cz), v = new THREE.Vector3(), land = { x: cx, z: cz }, spot = { x: cx, z: cz }, ground = 0.02;
  // target/chaser/lastBy: số thứ tự người trong vòng (kids.length = người chơi); want = lệnh đá đang giữ chờ { kind, t }
  let joined = false, joinedAt = 0, dead = 0.5, touches = 0, target = -1, chaser = -1, lastBy = -1, fDown = 0, flub = false, barN = -1, barM = -1, barText = '', drops = 0, bragged = false;
  let note = '', noteT = 0, want = null, selfRun = 0, sinceMe = 0, nextKid = 0, misses = 0, hits = 0, mineNow = false;
  const ME = () => kids.length, N = () => kids.length + (joined ? 1 : 0);
  const home = (i) => { const a = i / N() * Math.PI * 2; return { x: cx + Math.sin(a) * RADIUS, z: cz + Math.cos(a) * RADIUS }; };
  const posOf = (i) => (i === ME() ? player.pos : kids[i].h.g.position);

  /* ----- đường bay: cản tuyến tính nên phương đứng và phương ngang độc lập, tính ngược được vận tốc ngang để rơi đúng chỗ ----- */
  function flightTime(y0, vy0) { let y = y0, vy = vy0, t = 0; for (; t < 6; t += 0.02) { vy += (-GRAV - DRAG * vy) * 0.02; y += vy * 0.02; if (vy < 0 && y <= ground + FOOT) break; } return t; }
  /** đá từ vị trí hiện tại của cầu tới điểm (tx, tz) với vận tốc đứng vy0; by = người đá, to = người được nhắm */
  function send(tx, tz, vy0, by, to) {
    const T = flightTime(p.y, vy0), f = (1 - Math.exp(-DRAG * T)) / DRAG; v.set((tx - p.x) / f, vy0, (tz - p.z) / f); land.x = tx; land.z = tz; lastBy = by; target = to; touches++;
    mineNow = joined && to === ME(); chaser = mineNow ? -1 : to;      // cầu của ai người ấy đón; cầu cho người chơi thì các bạn đứng yên chờ
    if (mineNow) sinceMe = 0; else sinceMe++;
    flub = chaser >= 0 && touches >= MISS_FROM && Math.random() < KID_MISS;      // thỉnh thoảng các bạn cũng đá hụt (không hụt ngay mấy chạm đầu)
    if (ctx.audio && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 14) ctx.audio.thud(0.18);
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
  /** một bạn đá: tới lượt thì trả cho người chơi (cứ ME_EVERY chạm của các bạn là một lần), không thì chuyền cho bạn khác */
  function kidKick(i) {
    let to;
    if (joined && (sinceMe >= ME_EVERY || kids.length < 2 || lastBy === ME() && Math.random() < 0.3)) to = ME();
    else { to = (i + 1 + Math.floor(Math.random() * Math.max(1, kids.length - 1))) % kids.length; if (to === i) to = joined ? ME() : (i + 1) % kids.length; }
    const q = posOf(to), mine = to === ME(), wild = mine ? 0.18 : Math.random() < WILD ? 1.2 : 0.25;      // đá cho người chơi thì cao, chậm và ít lệch
    const ry = player.holder.rotation.y, fx = mine ? Math.sin(ry) * FRONT : 0, fz = mine ? Math.cos(ry) * FRONT : 0;      // rơi trước mũi chân người chơi
    send(q.x + fx + gauss() * wild, q.z + fz + gauss() * wild, mine ? KICKS.serve : KICKS.kid, i, to);
  }
  const inReach = () => { const feet = player.holder.position.y, h = p.y - feet; return dead <= 0 && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) <= REACH && h >= REACH_LO && h <= REACH_HI && (v.y < 0 || lastBy !== ME()); };
  /* ----- lên kế hoạch cú đá: bay thử để biết bao giờ cầu xuống tới tầm chân và lúc đó nó ở đâu ----- */
  const sim = new THREE.Vector3(), simV = new THREE.Vector3(), plan = { on: false, t: 0, kind: 'pass', at: new THREE.Vector3() }; let frameDt = 1 / 60;
  const simStep = () => { simV.x += -DRAG * simV.x * SIM_H; simV.z += -DRAG * simV.z * SIM_H; simV.y += (-GRAV - DRAG * simV.y) * SIM_H; sim.addScaledVector(simV, SIM_H); };
  /** số giây tới lúc cầu ĐANG RƠI xuống tới cao độ y (0 nếu đã ở dưới; Infinity nếu quá horizon giây); vị trí lúc đó để ở sim */
  function fallTime(y, horizon) { sim.copy(p); simV.copy(v); if (simV.y < 0 && sim.y <= y) return 0; for (let t = SIM_H; t <= horizon; t += SIM_H) { simStep(); if (simV.y < 0 && sim.y <= y) return t; } return Infinity; }
  /** vị trí cầu sau t giây (để ở sim) */
  function simAfter(t) { sim.copy(p); simV.copy(v); for (let k = Math.round(t / SIM_H); k > 0; k--) simStep(); return sim; }
  /** lệnh đá đang chờ: cầu sắp xuống tới tầm chân (trong KICK_LEAD giây) và nằm trong tầm thì bắt đầu vung chân, hẹn giờ chạm */
  function tryPlan() {
    const feet = player.holder.position.y; let kind = want.kind, tc = fallTime(feet + HIT_H[kind], KICK_LEAD); if (tc === Infinity) return false;
    tc = Math.round(tc / frameDt) * frameDt;      // chạm đúng vào một khung hình (lệch nửa khung là cầu lệch chân 4 cm)
    if (tc < 0.05) tc = simAfter(0.05).y - feet >= HIT_MIN + 0.03 ? Math.max(tc, 2 * frameDt) : 0;      // bấm muộn, cầu đã thấp: vung gấp trong 3 khung; sát đất rồi thì chạm luôn
    simAfter(tc); if (Math.hypot(sim.x - player.pos.x, sim.z - player.pos.z) > REACH || !(simV.y < 0 || lastBy !== ME())) return false;
    if (kind === 'pass' && fDown && (performance.now() - fDown) / 1000 + tc >= HOLD_FAR) kind = 'far';      // giữ F tới lúc chạm = đá bổng
    plan.on = true; plan.t = tc; plan.kind = kind; plan.at.copy(sim); st.kickKind = kind === 'far' ? 'flick' : kind; st.kickLead = tc; st.kickAt = plan.at; st.kick = 1;
    if (tc <= 0) { plan.on = false; strike(kind); }
    return true;
  }
  /** chân chạm cầu thật: kind = 'pass' (bạn kế tiếp) | 'lob' (lên đầu mình) | 'far' (bổng, bạn xa nhất). Chân đã vung từ lúc lên kế hoạch (tryPlan) */
  function strike(kind) {
    want = null; hits++; misses = 0;
    if (kind === 'lob') {      // tâng tại chỗ: quá SELF_MAX cái liền thì không tính thêm vào chuỗi của cả vòng, các bạn giục chuyền
      { const ry = player.holder.rotation.y; send(player.pos.x + Math.sin(ry) * SELF_FWD, player.pos.z + Math.cos(ry) * SELF_FWD, KICKS.lob, ME(), ME()); }      // rơi lại trước mũi chân mình
      if (++selfRun > SELF_MAX) { touches--; if (K.fx.once('cauPass', 5)) say(C.passIt); }
    } else {
      selfRun = 0;
      let to = nextKid % kids.length;
      if (kind === 'far') { let bd = -1; kids.forEach((a, i) => { const d = Math.hypot(a.h.g.position.x - player.pos.x, a.h.g.position.z - player.pos.z); if (d > bd) { bd = d; to = i; } }); } else nextKid++;
      const q = kids[to].h.g.position; send(q.x + gauss() * 0.15, q.z + gauss() * 0.15, KICKS[kind], ME(), to);
    }
    K.fx.sound(kind === 'pass' ? 'tok' : kind === 'lob' ? 'tokHi' : 'tokLong'); K.fx.ring(p.x, p.y, p.z, 0xffffff, kind === 'far' ? 0.45 : 0.3, st.yaw);
    if (touches > state.cau) { if (!bragged && state.cau >= BRAG_FROM) { bragged = true; K.fx.sound('best'); K.fx.cheer(); if (ctx.ui) ctx.ui.toast(C.best, 2); } state.cau = touches; save(); K.drawHud(); }      // kỷ lục mới: báo một lần mỗi lượt
    if (touches % 5 === 0) say(C.cheer);
  }
  /** người chơi ra lệnh đá. Cầu trong tầm thì đá ngay; cầu đang bay tới mình thì giữ lệnh chờ (bấm sớm vẫn trúng); cầu của người khác thì hụt */
  function kick(kind) {
    if (!joined || st.photo || st.pinned || st.locked) return false;
    if (plan.on) return false;      // chân đang vung rồi
    if (dead <= 0 && (mineNow || inReach())) { want = { kind, t: BUFFER }; return tryPlan() && !plan.on; }      // nhận lệnh; chân tự ra khi cầu xuống tới tầm bàn chân (bấm sớm vẫn trúng)
    whiff(); return false;
  }
  /** lệnh đá hết hạn mà không chạm được cầu: vung chân hụt, báo ngắn, nhắc cách bấm sau NUDGE_AFTER lần liền */
  function whiff() {
    want = null; plan.on = false; st.kickLead = null; st.kickAt = null; st.kick = 1; misses++;
    // MỘT thông điệp hành động duy nhất nằm ở thanh dưới hồng tâm: bấm sai thì thanh đổi chữ một nhịp (không thêm chữ nổi, không thêm toast)
    if (K.fx.once('cauMiss', 0.5)) { if (ctx.audio) ctx.audio.whoosh(); note = dead > 0 ? C.wait : C.notYet; noteT = 0.9; }
    if (misses >= NUDGE_AFTER && K.guide) K.guide.nudge();
  }
  const say = (list) => { const a = kids[Math.floor(Math.random() * kids.length)]; ui.bubble(() => actors.head(a, tmp), list[Math.floor(Math.random() * list.length)], 1.8); };
  function arrange() { kids.forEach((a, i) => { a.homeAt = home(i); }); }
  function join() {
    if (joined || !K.free('cau')) return;
    const hoop = K.hoop; if (hoop) { hoop.cancel(); if (hoop.dribbling) hoop.toggleDribble(); }      // đang nhồi/lấy lực bóng rổ: cầm bóng lên, cú dịch chuyển bên dưới sẽ thả bóng xuống
    joined = true; joinedAt = performance.now(); st.game = 'cau'; document.body.classList.add('gCau'); arrange();      // st.game: player.js thôi nhảy/đá/tương tác, vẫn cho đi lại
    // xếp người chơi vào đúng một chỗ trên vòng, quay mặt vào tâm; nhìn hơi chúc xuống để thấy cả vòng và vòng báo điểm rơi
    const q = home(kids.length); player.teleport(q.x, player.holder.position.y, q.z, Math.atan2(cx - q.x, cz - q.z)); player.holder.rotation.y = st.yaw; st.pitch = Math.max(st.pitch, CAM_PITCH);
    touches = 0; barN = -1; sinceMe = ME_EVERY; misses = 0; hits = 0; want = null; fDown = 0; if (ctx.ui && !K.guide) ctx.ui.toast(C.join, 6);      // có bảng chỉ dẫn thì không cần lời vào trò dài
  }
  function leave() { if (!joined) return; joined = false; document.body.classList.remove('gCau'); if (st.game === 'cau') st.game = null; st.kick = 0; st.kickLead = null; st.kickAt = null; plan.on = false; fDown = 0; want = null; mineNow = false; ui.progress('', null); mark.visible = dot.visible = trail.visible = false; arrange(); if (ctx.ui) ctx.ui.toast(C.leave, 2); }
  const it = { x: cx, y: 0.9, z: cz, r: 3.6, label: C.label, fn: join }; ctx.interact.push(it);
  K.addHud(() => (state.cau ? `🪶 ${state.cau}` : ''));
  K.touchDefs.push({ label: () => (joined ? C.tPass : ''), fn: () => kick('pass') }, { label: () => (joined ? C.tFar : ''), fn: () => kick('far') });
  const live = () => joined && !st.photo && !st.pinned && !st.locked;
  addEventListener('keydown', (e) => {
    if (!joined || e.repeat || typing() || performance.now() - joinedAt < 300 || !live()) return;      // phím E vừa dùng để vào chơi không tính là phím thôi chơi
    if (e.code === 'KeyE' || e.code === 'Escape') leave(); else if (e.code === 'Space') { e.preventDefault(); kick('lob'); } else if (e.code === 'KeyF') { fDown = performance.now(); kick('pass'); }
  });
  addEventListener('keyup', (e) => { if (e.code === 'KeyF') fDown = 0; });
  // chuột trái cũng là phím đá chính (khi chuột đã khoá vào khung hình; player.js không nhặt/ném trong lúc st.game)
  addEventListener('mousedown', (e) => { if (e.button === 0 && live() && e.target === ctx.pipeline.renderer.domElement && (document.pointerLockElement || document.body.classList.contains('touch')) && performance.now() - joinedAt > 300) { fDown = performance.now(); kick('pass'); } });
  addEventListener('mouseup', (e) => { if (e.button === 0) fDown = 0; });
  // mất sự kiện nhả phím (Alt-Tab, đổi thẻ, mất khoá chuột): bỏ cú đang giữ và lệnh đang chờ, không tự đá khi quay lại
  const dropHold = () => { fDown = 0; want = null; plan.on = false; }; addEventListener('blur', dropHold); document.addEventListener('visibilitychange', dropHold); document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) dropHold(); });

  function update(dt) {
    if (dt > 0.004) frameDt += (Math.min(dt, 0.034) - frameDt) * 0.2;
    for (const a of kids) if (a.kick) a.kick = Math.max(0, a.kick - dt * KICK_FADE);
    if (st.kick) st.kick = Math.max(0, st.kick - dt * KICK_FADE);
    it.r = joined ? 0 : 3.6;
    const far = Math.hypot(player.pos.x - cx, player.pos.z - cz);
    if (joined && (st.locked || st.photo || st.pinned || st.game !== 'cau' || far > LEAVE_R)) leave();      // đi ra xa, mở máy ảnh, hoặc bị kịch bản khác giữ: thôi chơi
    if (far > ACTIVE_R) { cau.visible = blob.visible = false; return; }
    cau.visible = true; if (!kids[0].homeAt) arrange();
    for (const a of kids) a.look = dead > 0 ? null : p;      // đầu nhìn theo cầu
    st.lookAt = joined && dead <= 0 ? p : st.lookAt === p ? null : st.lookAt; st.kickWind = !joined || dead > 0 ? 0 : want || mineNow ? 0.4 : 0.1;      // dáng chờ cầu (rigged.js actKick): cầu của mình thì chùng gối, nhún đổi chân; cầu của bạn thì chỉ hơi chùng
    if (!plan.on && st.kickAt && (st.kick || 0) < 0.9) { st.kickAt = null; st.kickLead = null; }      // rigged.js đã nhận cú đá: thôi báo (kẻo cú sút bóng ở trò khác dùng lại đích cũ)
    if (joined && ctx.cam) ctx.cam.askDist(CAM_DIST);      // lùi máy để thấy cả vòng (xin mỗi khung; thôi xin là máy tự về)
    // lệnh đá đang chờ: cầu vào tầm thì ra chân (giữ F đủ lâu tới lúc chạm = đá bổng), hết hạn thì hụt
    // cầu bay TRƯỚC, rồi mới xét chạm: khung nào chân chạm thì khung đó cầu còn nằm ở đúng điểm chạm đã báo cho rigged.js (đổi hướng từ khung sau)
    if (dead <= 0) { v.x += -DRAG * v.x * dt; v.z += -DRAG * v.z * dt; v.y += (-GRAV - DRAG * v.y) * dt; p.addScaledVector(v, dt); }
    if (plan.on) {      // chân đang vung: tới giờ thì chạm (cầu vẫn trong tầm), không thì thành cú hụt
      plan.t -= dt; if (plan.t > dt * 0.5) plan.at.copy(simAfter(plan.t));      // dự đoán lại mỗi khung: đích của bàn chân bám theo đường bay thật
      if (plan.t <= dt * 0.5) { plan.on = false; if (dead <= 0 && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) <= REACH) strike(plan.kind); else want = null; }
    } else if (want) {
      if (dead > 0 || !(mineNow || inReach())) want = null;      // cầu đã rơi hoặc không còn là của mình: bỏ lệnh
      else tryPlan();
    }
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i], g = a.h.g.position, chase = dead <= 0 && i === chaser; let to = a.homeAt;
      if (chase) { const ox = land.x - cx, oz = land.z - cz, ol = Math.hypot(ox, oz); to = spot; if (ol > 0.3) { spot.x = land.x + ox / ol * FRONT; spot.z = land.z + oz / ol * FRONT; } else { spot.x = land.x; spot.z = land.z - FRONT; } }      // đứng lùi sau điểm rơi (phía ngoài vòng), mặt quay vào tâm: cầu rơi trước mũi chân
      if (Math.hypot(to.x - g.x, to.z - g.z) > (chase ? 0.12 : 0.25)) { a.dest.x = to.x; a.dest.z = to.z; a.to = a.dest; } else a.to = null;
      a.kickWind = dead > 0 ? 0 : chase ? 0.4 : 0.1;
      if (a.plan) {      // bạn đang vung chân: tới giờ thì chạm cầu (hoặc hụt)
        a.plan -= dt; if (a.plan <= dt * 0.5) { a.plan = 0; if (dead <= 0 && i === chaser) { if (flub) chaser = -1; else kidKick(i); } }
      } else if (chase) {
        let tc = fallTime(g.y + HIT_H.kid, KICK_LEAD);
        if (tc !== Infinity && Math.hypot(sim.x - g.x, sim.z - g.z) < KID_REACH) { tc = Math.max(2, Math.round(tc / frameDt)) * frameDt; simAfter(tc); a.plan = tc; a.kickKind = Math.random() < 0.5 ? 'pass' : 'lob'; a.kickLead = tc; a.kickAt = flub ? null : (a.kickP || (a.kickP = new THREE.Vector3())).copy(sim); a.kick = 1; }      // đá hụt: vung chân mà không đưa tới cầu, cầu rơi
      }
    }
    if (joined) { if (touches !== barN || state.cau !== barM) { barN = touches; barM = state.cau; barText = K.fill(C.streak, { n: touches, m: state.cau }); } if (noteT > 0) noteT -= dt; ui.progress(mineNow && dead <= 0 ? C.yours : noteT > 0 ? note : dead > 0 ? C.wait : barText, Math.min(1, touches / Math.max(5, state.cau))); }      // chuỗi chữ chỉ dựng lại khi số đổi
    if (dead > 0) { dead -= dt; if (dead <= 0) { const i = Math.floor(Math.random() * kids.length), g = kids[i].h.g.position; p.set(g.x, g.y + 0.5, g.z); touches = 0; kids[i].plan = 0; kids[i].kickKind = 'lob'; kids[i].kickLead = null; kids[i].kickAt = null; kids[i].kick = 1; kidKick(i); touches = 0; } cau.position.copy(p); blob.visible = mark.visible = dot.visible = trail.visible = false; return; }      // phát cầu lại
    cau.position.copy(p); cau.rotation.set(Math.atan2(-Math.hypot(v.x, v.z), -v.y), Math.atan2(v.x, v.z), 0, 'YXZ');      // đế cầu đi trước, lông theo sau (trước đây ngược: rơi mà lông chúc xuống)
    blob.visible = true; blob.position.set(p.x, ground + 0.035, p.z); blob.scale.setScalar(Math.max(0.5, 1.4 - (p.y - ground) * 0.22));      // bóng tròn ngay dưới cầu: đọc được độ cao
    if (p.y <= ground + 0.03) {      // chạm đất: mất lượt
      p.y = ground + 0.03; dead = RESTART; chaser = -1; drops++; bragged = false; mineNow = false; want = null; K.fx.puff(p.x, ground + 0.04, p.z, 'dust', 6); if (joined) { K.fx.sound('bad'); if (ctx.ui) ctx.ui.toast(K.fill(touches > 1 ? C.down : C.late, { n: touches }), 1.8); say(C.oops); if (target === ME() && !hits) { misses++; if (misses >= NUDGE_AFTER && K.guide) K.guide.nudge(); } }
      touches = 0; sinceMe = ME_EVERY; cau.rotation.set(0, 0, 0);
    }
    // vòng báo điểm rơi (xanh và đập nhịp khi cầu là của người chơi) + vệt đứt nối cầu với điểm rơi
    const show = joined && dead <= 0; mark.visible = dot.visible = show; trail.visible = show && mineNow;
    if (show) {
      const pulse = mineNow ? 1 + Math.sin(performance.now() * 0.012) * 0.12 : 0.8; mark.position.set(land.x, ground + 0.04, land.z); mark.scale.setScalar(pulse); dot.position.set(land.x, ground + 0.045, land.z);
      mark.material.color.copy(mineNow ? COL_MINE : COL_OTHER); dot.material.color.copy(mark.material.color);
      if (trail.visible) { const a = trailGeo.attributes.position; a.setXYZ(0, p.x, p.y, p.z); a.setXYZ(1, land.x, ground + 0.05, land.z); a.needsUpdate = true; trail.computeLineDistances(); }
    }
  }
  return { update, join, leave, kick, kids, get joined() { return joined; }, get touches() { return touches; }, get streak() { return touches; }, get holding() { return !!fDown; }, get waiting() { return !!want; }, get mine() { return mineNow; }, get hits() { return hits; }, get misses() { return misses; },
    get drops() { return drops; }, get target() { return target; }, get lastBy() { return lastBy; }, vel: v, shuttle: p, land, tap: () => kick('lob') };
}
