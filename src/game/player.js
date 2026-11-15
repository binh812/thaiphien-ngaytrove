// Nhân vật: di chuyển bằng bộ điều khiển nhân vật Rapier, máy quay thứ nhất/thứ ba, nhặt – ném – đá vật thể, tương tác.
import * as THREE from 'three';
import { clamp, isTouch, param } from '../engine/util.js';
import { U } from '../engine/materials.js';
import { buildHuman, animateHuman, DEFAULT_LOOK } from './human.js';
import { init as initCamRig } from './camrig.js';

export function loadLook() { try { return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem('tp2_char') || '{}') }; } catch (e) { console.warn('Không đọc được nhân vật đã lưu', e); return { ...DEFAULT_LOOK }; } }


export function init(ctx) {
  const { phys, camera, scene } = ctx, dom = ctx.pipeline.renderer.domElement;
  initCamRig(ctx);
  let body = buildHuman(loadLook()); const holder = new THREE.Group(); holder.add(body.g); scene.add(holder);
  let lookSeq = 0;
  /** đổi ngoại hình: giữ hình cũ tới khi mô hình mới nạp xong (không chớp qua hình tạm); lần gọi sau thắng lần gọi trước */
  function setLook(look) {
    const next = buildHuman(look), seq = ++lookSeq;
    next.ready.then(() => { if (seq !== lookSeq) { next.dispose(); return; } holder.remove(body.g); body.dispose(); body = next; holder.add(body.g); });
    try { localStorage.setItem('tp2_char', JSON.stringify(look)); } catch (e) { console.warn('Không lưu được nhân vật', e); } }
  const pos = new THREE.Vector3(41, 0.16 + phys.HH + phys.R, 62.5), keys = {}, st = { yaw: Math.PI, pitch: 0.12, vy: 0, grounded: false, fp: param('fp', '0') === '1', dist: 4.2, speed: 0, held: null, heldT: 0, bob: 0, step: 0, photo: false, started: false };
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), mv = { x: 0, z: 0 }, joy = { x: 0, y: 0, id: null };
  phys.pbody.setTranslation(pos, true); holder.rotation.y = st.yaw;
  const locked = () => document.pointerLockElement === dom;

  let turn = null;      // đang xoay dần hướng nhìn (turnTo)
  /** xoay hướng nhìn dần về yaw trong secs giây thay vì quay phắt (ngồi xuống ghế); chuột vẫn cộng thêm được; "giảm chuyển động" thì cắt thẳng */
  function turnTo(yaw, secs = 0.8) { let d = yaw - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); if (ctx.cam.reduced) { st.yaw += d; turn = null; ctx.cam.cut(); } else turn = { d, t: 0, secs: Math.max(secs, 0.05) }; }
  function teleport(x, y, z, yaw) { pos.set(x, y + phys.HH + phys.R + 0.05, z); st.vy = 0; turn = null; if (yaw != null) { st.yaw = yaw; holder.rotation.y = yaw; } phys.pbody.setTranslation(pos, true); phys.world.propagateModifiedBodyPositionsToColliders(); if (st.held) drop(); ctx.cam.cut(); visCut = true; }
  function viewDir(out) { const cp = Math.cos(st.pitch); return out.set(Math.sin(st.yaw) * cp, -Math.sin(st.pitch), Math.cos(st.yaw) * cp); }
  function eye(out) { return out.set(pos.x, pos.y + (st.pinned && st.clip ? 0.27 : 0.72), pos.z); }      // đang ngồi (bị ghim + clip ngồi): tầm mắt thấp hơn 0,45 m

  /* ----- nhặt / ném / đá ----- */
  function drop() { if (!st.held) return; st.held.body.setGravityScale(1, true); st.held = null; }
  function grabOrThrow() {
    if (st.locked || st.game || st.photo) return;      // st.game: đang trong một trò chơi nhỏ (đá cầu…) — module đó tự nhận phím; đang chụp ảnh thì chuột/chạm là của máy ảnh
    if (st.handUse) { st.handUse(); return; }      // tay đang cầm thứ của module khác (máy bay giấy): chuột trái dùng thứ đó
    if (st.held) { const b = st.held.body, m = b.mass(), d = viewDir(tmp), v = clamp(13 - m * 0.6, 5, 13) * (0.55 + Math.min(1, st.heldT / 0.8) * 0.45); b.setGravityScale(1, true); b.setLinvel({ x: d.x * v, y: d.y * v + 2.2, z: d.z * v }, true); b.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 6 }, true); st.held = null; st.gest = { type: 'throw', t: 0, dur: 0.5 }; if (ctx.audio) ctx.audio.whoosh(); return; }
    // tầm với tính từ mắt / điểm tựa vai (không phải từ máy quay đã bị tường đẩy vào); tia dừng ở tường nên không nhặt xuyên tường
    // (có ?cam thì giàn không chạy nên tự tính điểm tựa từ chỗ đứng; người đứng chắn không chặn tầm với, giống tia máy quay)
    const o = st.fp ? eye(tmp2) : ctx.fixedCam ? tmp2.set(pos.x, pos.y + 0.62, pos.z).addScaledVector(right, CAM_SIDE) : tmp2.copy(ctx.cam.base.pivot), d = viewDir(tmp), hit = phys.cast(o, d, st.fp ? 3.2 : 3.4, 0xffff0003, undefined, notNpc);
    if (!hit || !hit.body || !hit.body.isDynamic() || hit.body.mass() > 12 || (hit.body.userData && hit.body.userData.occupied)) return;      // ghế đang có người ngồi thì không nhấc
    st.held = { body: hit.body }; st.heldT = 0; hit.body.wakeUp();
    { const t = hit.body.translation(); st.gest = { type: 'reach', t: 0, dur: 0.4, at: new THREE.Vector3(t.x, t.y, t.z) }; }      // tay với tới món đồ rồi mới cầm lên
  }
  function kick() {
    if (st.locked || st.photo || st.pinned || st.game) return;
    if (st.kickHook && st.kickHook()) return;      // module khác nhận cú đá này (sút bóng lấy lực ở sân cỏ)
    const d = tmp.set(Math.sin(st.yaw), 0, Math.cos(st.yaw)); let best = null, bd = 1.7;
    phys.world.bodies.forEach((b) => { if (!b.isDynamic() || b.mass() > 14 || (b.userData && b.userData.occupied)) return; const t = b.translation(), dx = t.x - pos.x, dz = t.z - pos.z, dy = t.y - (pos.y - 0.6); if (Math.abs(dy) > 0.9) return; const dist = Math.hypot(dx, dz); if (dist < bd && (dx * d.x + dz * d.z) / (dist + 1e-4) > 0.35) { bd = dist; best = b; } });
    if (!best) return; const m = best.mass(), p = 7.5 + st.speed * 0.9; best.wakeUp(); best.applyImpulse({ x: d.x * m * p, y: m * (2.6 + Math.sin(st.pitch) * -3), z: d.z * m * p }, true); st.kick = 1; if (ctx.audio) ctx.audio.thud(0.8);
  }
  function nearest() { let best = null, bd = 1e9; for (const it of ctx.interact || []) { const d = Math.hypot(it.x - pos.x, it.z - pos.z); if (d < it.r && Math.abs(it.y - pos.y) < 2.4 && d < bd) { bd = d; best = it; } } return best; }
  function use() { if (st.locked || st.photo || st.game) return; const it = nearest(); if (it) it.fn(); }

  /* ----- điều khiển ----- */
  const typing = () => { const a = document.activeElement; return !!a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && a.type !== 'range'; };
  addEventListener('keydown', (e) => {
    if (typing()) return; keys[e.code] = true;
    if (e.code === 'KeyP') { if (!st.locked) ctx.ui && ctx.ui.photo(); return; }
    if (st.photo || !st.started || st.locked) return;      // st.locked: kịch bản (hội thoại, tiết học) đang giữ người chơi, không nhận hành động                       // chế độ chụp ảnh dùng Q/E để bay, không kích hoạt hành động
    if (e.code === 'Space') { e.preventDefault(); jump(); } else if (e.code === 'KeyV') st.fp = !st.fp; else if (e.code === 'KeyE') use(); else if (e.code === 'KeyF') kick(); else if (e.code === 'KeyQ') drop();
    else if (e.code === 'Tab') { e.preventDefault(); ctx.ui && ctx.ui.toggle('panel'); } else if (e.code === 'KeyM') ctx.ui && ctx.ui.toggle('mapPanel');
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; }); addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  // tay đang cầm bóng rổ/máy bay giấy (st.handUse) thì Space là của món đó, không nhảy
  function jump() { if (st.grounded && !st.locked && !st.pinned && !st.game && !st.handUse) { st.vy = 4.7; st.grounded = false; } }
  dom.addEventListener('mousedown', (e) => { if (!st.started) return; if (!locked() && !isTouch) { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => ctx.ui && ctx.ui.toast('Chưa khoá được chuột – thử bấm lại sau giây lát')); return; } if (e.button === 0) grabOrThrow(); else if (e.button === 2) drop(); });
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  const aim = () => st.photo ? ctx.cam.free : st;      // đang chụp ảnh: chuột/chạm xoay máy ảnh, không xoay hướng nhìn của nhân vật
  addEventListener('mousemove', (e) => { if (!locked()) return; const o = aim(); o.yaw -= e.movementX * 0.0023; o.pitch = clamp(o.pitch + e.movementY * 0.0023, -1.35, 1.35); });
  addEventListener('wheel', (e) => { if (st.started) st.dist = clamp(st.dist + Math.sign(e.deltaY) * 0.5, 1.6, 9); }, { passive: true });
  if (isTouch) {
    document.body.classList.add('touch'); const J = document.getElementById('joy'), K = document.getElementById('knob'); let look = null;
    const jm = (t) => { const r = J.getBoundingClientRect(); let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; K.style.transform = `translate(${x * 34}px,${y * 34}px)`; };
    J.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; joy.id = t.identifier; jm(t); e.preventDefault(); }, { passive: false });
    addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === joy.id) jm(t); else if (look && t.identifier === look.id) { const o = aim(); o.yaw -= (t.clientX - look.x) * 0.005; o.pitch = clamp(o.pitch + (t.clientY - look.y) * 0.005, -1.3, 1.3); look.x = t.clientX; look.y = t.clientY; } } }, { passive: true });
    const touchUp = (e) => { for (const t of e.changedTouches) { if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; K.style.transform = ''; } if (look && t.identifier === look.id) look = null; } };
    addEventListener('touchend', touchUp); addEventListener('touchcancel', touchUp);
    dom.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY }; }, { passive: true });
    document.getElementById('tJump').addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }); document.getElementById('tUse').addEventListener('touchstart', (e) => { e.preventDefault(); if (nearest()) use(); else kick(); }); document.getElementById('tThrow').addEventListener('touchstart', (e) => { e.preventDefault(); grabOrThrow(); });
  }

  /* ----- giữ vật đang cầm ----- */
  const HOLD_CARRY = [1.1, 0.2], HOLD_AIM = [1.7, 0.27], AIM_RIGHT = 0.07, heldAt = new THREE.Vector3();      // [cao so với bàn chân ở người 1,68 m, ra trước mặt] (m): ôm trước bụng / đưa lên trước trán (lệch về vai phải AIM_RIGHT) lúc lấy lực
  /** nửa bề ngang của vật đang cầm (m, tối đa 0,3): vật càng to thì giữ càng xa thân và hai tay càng mở rộng */
  const heldSize = (b) => { const sh = b.collider(0).shape; return Math.min(0.3, sh.radius ?? (sh.halfExtents ? Math.max(sh.halfExtents.x, sh.halfExtents.z) : 0.12)); };
  phys.onStep(() => {
    if (!st.held) return; const b = st.held.body, t = b.translation(), d = viewDir(tmp), o = st.fp ? eye(tmp2) : tmp2.set(pos.x, pos.y + 0.45, pos.z), k = st.fp ? 1.25 : 1.05;
    let tx = o.x + d.x * k, ty = o.y + d.y * k - (st.fp ? 0.12 : 0), tz = o.z + d.z * k;
    if (!st.fp && body.rig) {      // góc ba: vật nằm trong hai bàn tay (trước bụng; đang lấy lực ném rổ thì trên trán) chứ không lơ lửng cách người 1 m
      const hy = holder.rotation.y, fx = Math.sin(hy), fz = Math.cos(hy), hs = (body.look.height || 1.68) / 1.68, size = heldSize(b), aimR = st.aim != null ? AIM_RIGHT : 0;
      const up = st.aim != null ? HOLD_AIM : HOLD_CARRY, fw = up[1] + (st.aim != null ? 0 : size); tx = holder.position.x + fx * fw - fz * aimR; ty = holder.position.y + up[0] * hs; tz = holder.position.z + fz * fw + fx * aimR;
    }
    let vx = (tx - t.x) * 16, vy = (ty - t.y) * 16, vz = (tz - t.z) * 16; const l = Math.hypot(vx, vy, vz);
    if (l > 14) { vx *= 14 / l; vy *= 14 / l; vz *= 14 / l; } if (Math.hypot(tx - t.x, ty - t.y, tz - t.z) > 2.6) { drop(); return; }
    b.setGravityScale(0, true); b.setLinvel({ x: vx, y: vy, z: vz }, true); const av = b.angvel(); b.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);
  });

  const des = { x: 0, y: 0, z: 0 };
  // ACCEL_*/DECEL (m/s²): tăng tốc khi đi / khi chạy, giảm tốc và đổi hướng — đi đạt 1,5 m/s sau ~0,19 s, chạy đạt 4,2 m/s sau ~0,32 s, đang chạy buông phím dừng sau ~0,26 s (~55 cm), đang đi ~0,1 s (~7 cm).
  // TURN_MAX (rad/s): thân xoay theo hướng đi nhanh nhất chừng này (trước: quay 180° có khung tới 31 rad/s, bàn chân không bước kịp).
  const ACCEL_WALK = 8, ACCEL_RUN = 13, DECEL = 16, TURN_MAX = 9;
  // ----- nền dưới chân -----
  // GROUND_PUSH: vận tốc ép xuống (m/s) khi đang chạm đất, chỉ để bộ điều khiển còn nhận ra mặt nền. Trước đây ép 1,5 m/s: bằng đúng tốc độ đi, nên khi đi lên
  // cầu thang (mặt va chạm dốc 30°) phần ép xuống nuốt gần hết phần đi tới — giữ W 3,6 s chỉ lên được 0,6 m, nhân vật đứng dáng nghỉ.
  // CLIMB_COS: dốc thoai hơn 50° (như setMaxSlopeClimbAngle ở physics.js) thì đi song song mặt dốc. GROUND_EASE: nhịp làm mượt cao độ hiển thị (1/s).
  const GROUND_PUSH = 0.25, CLIMB_COS = Math.cos(50 * Math.PI / 180), CC_OFFSET = 0.02, GROUND_EASE = 28, GROUND_TRUST = 0.15;
  const gRay = new phys.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), ground = { hit: false, y: 0, nx: 0, ny: 1, nz: 0 };
  let visY = pos.y - phys.HH - phys.R, visWant = visY, visE = 0, visCut = true;      // cao độ hiển thị của gốc nhân vật; visCut: lần cập nhật tới đặt thẳng (dịch chuyển tức thời), không trượt dần
  /** mặt nền (tĩnh hoặc vật thể động) ngay dưới tâm nhân vật: cao độ và pháp tuyến; dò từ 0,5 m trên đế tới 0,6 m dưới đế */
  function probeGround() {
    gRay.origin.x = pos.x; gRay.origin.y = pos.y - phys.HH - phys.R + 0.5; gRay.origin.z = pos.z;
    const h = phys.world.castRayAndGetNormal(gRay, 1.1, true, undefined, 0xffff0003, phys.pcol, undefined, notNpc);
    ground.hit = !!h; if (h) { ground.y = gRay.origin.y - (h.timeOfImpact ?? h.toi); ground.nx = h.normal.x; ground.ny = h.normal.y; ground.nz = h.normal.z; }
    return ground;
  }
  const fRay = new phys.RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  /** cao độ mặt nền dưới một điểm của bàn chân (rigged.js dùng để đặt chân lên bậc thang/mặt dốc: r.groundAt); null nếu không có nền trong tầm ±0,45 m */
  function footGround(p) {
    fRay.origin.x = p.x; fRay.origin.y = p.y + 0.45; fRay.origin.z = p.z;
    const h = phys.world.castRay(fRay, 0.9, true, undefined, 0xffff0003, phys.pcol, undefined, notNpc);
    return h ? fRay.origin.y - (h.timeOfImpact ?? h.toi) : null;
  }
  function update(dt) {
    if (st.held) st.heldT += dt;
    if (turn) { const s = (k) => k * k * (3 - 2 * k), a = s(turn.t / turn.secs); turn.t = Math.min(turn.secs, turn.t + dt); st.yaw += turn.d * (s(turn.t / turn.secs) - a); if (turn.t >= turn.secs) turn = null; }
    // hướng di chuyển
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x, iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    if (!st.started || st.photo || st.locked) ix = iz = 0;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const run = keys.ShiftLeft || keys.ShiftRight || il > 0.92 && joy.id !== null, target = (run ? 4.2 : 1.5) * Math.min(1, il);
    fwd.set(Math.sin(st.yaw), 0, Math.cos(st.yaw)); right.set(-fwd.z, 0, fwd.x);
    // Vận tốc ngang tiến về vận tốc muốn có với gia tốc CÓ HẠN (học từ player.js của "Patch's starter man"): trước đây bám theo hàm mũ (nhịp 12/s) nên khung đầu tiên
    // sau khi bấm chạy tăng tốc tới ~46 m/s², hoạt hoạ không kịp đổi clip (bàn chân trượt lúc đổi đi ↔ chạy). Trên không giữ cách cũ (điều khiển yếu, nhịp 3/s).
    { const tx = (fwd.x * iz + right.x * ix) * target, tz = (fwd.z * iz + right.z * ix) * target, dx = tx - mv.x, dz = tz - mv.z, dl = Math.hypot(dx, dz);
      if (!st.grounded) { const k = 1 - Math.exp(-dt * 3); mv.x += dx * k; mv.z += dz * k; }
      else if (dl > 1e-6) { const a = target > Math.hypot(mv.x, mv.z) + 0.05 ? (run ? ACCEL_RUN : ACCEL_WALK) : DECEL, s = Math.min(1, a * dt / dl); mv.x += dx * s; mv.z += dz * s; } }
    st.vy = Math.max(-30, st.vy - 12.5 * dt);
    des.x = mv.x * dt; des.y = st.vy * dt; des.z = mv.z * dt;
    // đang chạm đất: thay phần rơi bằng độ lên/xuống của chính mặt nền theo hướng đi (đi song song mặt dốc — bộ điều khiển Rapier chiếu chuyển động ngang lên mặt dốc
    // nên nếu chỉ đưa chuyển động ngang thì lên dốc 30° mất 1/4 tốc độ) cộng một chút ép xuống. Nhảy (st.vy > 0) và rơi tự do giữ nguyên như cũ.
    // Phần ép xuống không để cố định: bộ điều khiển muốn đế nang cách mặt nền đúng CC_OFFSET; vừa đi ngang vừa ép xuống thì nang lún dần vào khoảng hở đó, tới lúc
    // phép dò của nó báo "đã chạm" ngay từ đầu và trả dịch chuyển 0 cho cả khung (khựng 1–2 khung, đo được 4 lần mỗi 5 giây chạy trên nền phẳng). Nên chỉnh thẳng
    // khoảng hở dưới tâm nang về mức nó phải có trên mặt nền đang đứng: (CC_OFFSET + R)/ny − R (nền phẳng: 2 cm; dốc 30°: 6,5 cm vì đáy nang tròn chạm dốc ở bên cạnh).
    if (!st.pinned && st.grounded && st.vy <= 0) {
      const g = probeGround();
      if (g.hit && g.ny > CLIMB_COS) des.y = -(g.nx * des.x + g.nz * des.z) / g.ny + clamp((CC_OFFSET + phys.R) / g.ny - phys.R - (pos.y - phys.HH - phys.R - g.y), -2 * GROUND_PUSH * dt, 0.01);
      else des.y = -GROUND_PUSH * dt;
    }
    if (st.pinned) { mv.x = mv.z = 0; st.vy = 0; st.speed = 0; st.grounded = true; }      // st.pinned: kịch bản ghim người chơi tại chỗ (ngồi trên ghế băng trong lớp) — không trọng lực, không va chạm, nếu không sẽ bị đẩy lên mặt ghế
    else {
      phys.cc.computeColliderMovement(phys.pcol, des, undefined, 0x0004fffb);
      const m = phys.cc.computedMovement(); pos.x += m.x; pos.y += m.y; pos.z += m.z; st.grounded = phys.cc.computedGrounded();
      if (st.grounded && st.vy < 0) st.vy = -1.5; if (m.y < des.y * 0.3 && st.vy > 0) st.vy = 0;
      if (pos.y < -20) teleport(41, 0.2, 60, Math.PI);
      st.speed = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    }
    phys.pbody.setTranslation(pos, true); phys.world.propagateModifiedBodyPositionsToColliders();   // khối va chạm theo ngay, không chờ bước vật lý kế tiếp
    // thân nhân vật
    // Cao độ hiển thị: bộ điều khiển giữ đế nang cách nền CC_OFFSET (2 cm) lúc đứng, lúc đi/chạy lại xê dịch −1..+3 cm theo từng khung và trên mặt dốc thì đáy nang
    // tròn chạm dốc ở bên cạnh nên tâm đáy hở thêm 4–6 cm → vẽ gốc nhân vật ở đúng mặt nền dò được dưới chân, làm mượt theo thời gian. Trên không, bị ghim (ngồi ghế,
    // kịch bản đặt chỗ) hoặc mặt nền dò được lệch quá GROUND_TRUST so với nang (đứng mép bậc) thì theo nang. Máy quay và va chạm vẫn dùng pos.
    // Làm mượt bằng độ lệch tạm visE (tắt dần): mặt nền đổi cao độ đều theo bước đi (dốc, cầu thang) thì gốc theo ngay không trễ; chỉ khi nó nhảy bậc (mép vỉa hè,
    // đổi nguồn nền ↔ nang, chạm đất sau khi rơi) thì cú nhảy được dồn vào visE rồi tan trong ~0,1 s.
    { const feet = pos.y - phys.HH - phys.R; let want = st.pinned ? feet : feet - CC_OFFSET;
      if (!st.pinned && st.grounded) { const g = probeGround(); if (g.hit && Math.abs(g.y - want) < GROUND_TRUST) want = g.y; }
      const jump = want - visWant, moved = Math.hypot(des.x, des.z);
      if (visCut || !st.grounded || Math.abs(jump + visE) > 0.3) visE = 0; else { if (Math.abs(jump) > moved * 1.2 + 0.004) visE -= jump; visE *= Math.exp(-dt * GROUND_EASE); }
      visWant = want; visY = want + visE; visCut = false; }
    holder.position.set(pos.x, visY, pos.z); holder.visible = !st.fp || st.photo;
    if (st.speed > 0.3) { const a = Math.atan2(mv.x, mv.z); let d = a - holder.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); holder.rotation.y += clamp(d * Math.min(1, dt * 10), -TURN_MAX * dt, TURN_MAX * dt); } else if ((st.fp || st.held || (ctx.campus && ctx.campus.play && ctx.campus.play.holding)) && !st.pose) holder.rotation.y = st.yaw;      // đang cầm vật / máy bay giấy: thân quay theo hướng nhìn (hướng sẽ ném)
    // tạo dáng chụp ảnh: quay người về phía máy ảnh, nhìn vào ống kính, cười; bước đi thì thôi dáng
    if (st.pose && !st.photo && il > 0.1) st.pose = null;
    if (st.pose) { const a = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z); let d = a - holder.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); holder.rotation.y += d * Math.min(1, dt * 6); }
    body.pose = st.pose || null; body.clip = st.clip || null; body.kick = st.kick || 0; body.kickKind = st.kickKind || null; body.kickWind = st.kickWind || 0; body.kickLead = st.kickLead ?? null; body.kickAt = st.kickAt || null; body.jumpKind = st.game === 'rope' ? 'rope' : null; body.aim = st.aim ?? null; body.hold = st.held ? 'carry' : ctx.campus && ctx.campus.play && ctx.campus.play.holding ? 'plane' : null;
    if (st.held) { const t = st.held.body.translation(); body.holdAt = heldAt.set(t.x, t.y, t.z); body.holdR = heldSize(st.held.body); } else body.holdAt = null;      // rigged.js: bàn tay bám đúng vật đang cầm
    body.armsDown = !!st.armsDown; body.eat = st.eat || 0; body.gest = st.gest || null; body.lookAt = st.pose || st.photo ? camera.position : st.lookAt || null;      // st.lookAt: điểm trò chơi muốn đầu nhìn theo (quả cầu)
    body.smile = st.pose ? 0.75 : null;
    if (body.rig) body.rig.groundAt = st.pinned ? null : footGround;
    body.fine = !!(st.photo || st.builder);      // chụp ảnh / màn tạo nhân vật: máy ảnh có thể bay xa nhưng nhân vật của mình vẫn phải được chỉnh dáng kỹ
    animateHuman(body, st.speed, dt, !st.grounded, !!st.held, performance.now() / 1000);
    if (st.gest && st.gest.t >= st.gest.dur) st.gest = null;      // st.gest = { type, t, dur }: cử chỉ tay ngắn (vẫy, ném, gõ trống…), tự hết
    U.uPlayer.value.set(pos.x, pos.y - phys.HH - phys.R, pos.z);
    // bước chân
    if (st.grounded && st.speed > 0.8) { st.step += st.speed * dt; if (st.step > (run ? 1.1 : 0.75)) { st.step = 0; if (ctx.audio) ctx.audio.step(pos); } }
    // gợi ý tương tác
    if (ctx.ui) { const it = nearest(); ctx.ui.prompt(st.locked ? '' : st.held ? 'Chuột trái: ném · Q: thả' : it ? `E · ${it.label}` : ''); }
    ctx.cam.commit(dt);      // máy quay: giàn (camrig.js) gọi camPlayer hoặc chế độ đang giành quyền rồi ghi một lần
  }
  // máy quay góc ba chỉ vướng vật tĩnh; nang tĩnh duy nhất trong cảnh là người (spawnNpc ở people.js) nên bỏ qua nang: người đi ngang sau lưng không làm máy quay giật vào
  const CAM_SIDE = 0.45, CAM_MASK = 0xffff0001, notNpc = (c) => c.shape.type !== phys.RAPIER.ShapeType.Capsule, camO = new THREE.Vector3(), camUp = new THREE.Vector3();
  let camDist = 0, camSide = 0, eyeH = 0.72, camHide = false;
  /** chế độ máy quay mặc định, chỉ điền tư thế vào out: xoay quanh lúc tạo nhân vật / góc nhìn thứ nhất / góc ba sau vai */
  function camPlayer(dt, out) {
    const d = viewDir(tmp);
    if (st.builder) { st.spin = (st.spin || 0) + dt * 0.35; holder.visible = true; holder.rotation.y = st.yaw + Math.PI + Math.sin(st.spin) * 0.6; const hy = pos.y - phys.HH - phys.R; out.pos.set(pos.x - Math.sin(st.yaw) * 2.5 + Math.cos(st.yaw) * 0.75, hy + 1.25, pos.z - Math.cos(st.yaw) * 2.5 - Math.sin(st.yaw) * 0.75); out.dir.set(pos.x + Math.cos(st.yaw) * 0.75, hy + 0.95, pos.z - Math.sin(st.yaw) * 0.75).sub(out.pos); return; }
    // tầm mắt (so với tâm nang) hạ/nâng dần khi ngồi xuống, đứng dậy; nhún bước chân và rung là độ lệch tạm do giàn cộng (out.shake)
    const eh = eye(out.pos).y - pos.y; eyeH = out.cut ? eh : eyeH + (eh - eyeH) * (1 - Math.exp(-10 * dt)); out.shake = true;
    if (st.fp) { st.bob += st.speed * dt * 1.9; out.pos.y = pos.y + eyeH; out.dir.copy(d); }
    else {
      // góc ba sau vai, không xuyên tường: hh/hw = nửa cao/rộng của mặt cắt gần
      const hh = Math.tan(camera.fov * Math.PI / 360) * camera.near, hw = hh * camera.aspect, ease = 1 - Math.exp(-8 * dt), pv = out.pivot.set(pos.x, pos.y + 0.62, pos.z);
      // (1) điểm tựa lệch vai phải: dò từ tâm đầu sang phải, vướng tường thì rút độ lệch cho mặt cắt gần còn nằm ngoài tường
      // (chừa thêm 0,1 m: khung cửa, gờ tường nhô 5 cm không được nằm đúng trên tia góc, kẻo tia lúc chạm lúc không)
      let side = Math.max(CAM_SIDE, out.minSide || 0); const hs = phys.cast(pv, right, side + hw + 0.1, CAM_MASK, undefined, notNpc); if (hs) side = Math.max(0, hs.toi - hw - 0.1);      // out.minSide: trò chơi xin lệch vai thêm (ngắm rổ)
      camSide = out.cut || side < camSide ? side : camSide + (side - camSide) * ease; pv.addScaledVector(right, camSide);
      // (2) lùi ra sau: tia tâm + bốn tia qua bốn góc mặt cắt gần
      const back = tmp2.copy(d).multiplyScalar(-1), far = Math.max(st.dist, out.minDist), reach = Math.max(far, out.cut ? 0 : camDist) + 0.3; camUp.crossVectors(right, d);      // out.minDist: trò chơi nhỏ xin lùi thêm (nhảy dây trên màn dọc); reach: dò tới cả chỗ máy quay đang đứng khi nó còn trượt về gần
      const hc = phys.cast(pv, back, reach, CAM_MASK, undefined, notNpc); let corner = Infinity, nC = 0;
      for (let i = 1; i < 5; i++) { camO.copy(pv).addScaledVector(right, i & 1 ? hw : -hw).addScaledVector(camUp, i & 2 ? hh : -hh); const hit = phys.cast(camO, back, reach, CAM_MASK, undefined, notNpc); if (hit) { nC++; if (hit.toi < corner) corner = hit.toi; } }
      // (3) tường (tia tâm vướng VÀ hai tia dò rộng cách hai bên 0,6 m cũng vướng): co tức thời, máy quay không được nằm sau tường. Vật hẹp (cột, thân cây,
      // khung cửa) thì co nhanh nhưng không giật; chỉ MỘT góc vướng thì bỏ qua để máy quay lướt qua cột. Hết vướng thì giãn ra từ từ
      let wide = !!hc; for (let s = -1; wide && s <= 1; s += 2) { camO.copy(pv).addScaledVector(right, s * 0.6); wide = !!phys.cast(camO, back, reach, CAM_MASK, undefined, notNpc); }
      const wall = wide ? Math.max(0.15, hc.toi - 0.1) : Infinity, near = Math.min(hc ? hc.toi : Infinity, nC > 1 ? corner : Infinity), want = Math.min(far, Math.max(0.15, near - 0.1));
      if (out.cut) camDist = want; else if (want < camDist) camDist -= Math.min((camDist - want) * (1 - Math.exp(-28 * dt)), 22 * dt); else camDist += (want - camDist) * ease;
      camDist = Math.min(camDist, wall);
      // quá sát thì ẩn thân kẻo lưng che kín màn hình (vùng trễ 0,07 m để thân không nhấp nháy khi đi dọc tường)
      camHide = camDist < 0.6 + (CAM_SIDE - camSide) * 1.2 + (camHide ? 0.07 : 0); if (camHide) holder.visible = false;
      out.pos.copy(pv).addScaledVector(back, camDist); out.dir.copy(d); out.dist = camDist;
    }
  }
  ctx.cam.setMode('player', camPlayer);
  ctx.cam.addOffset((dt, o) => { if (st.fp) o.y += Math.sin(st.bob * 2) * 0.022 * Math.min(1, st.speed / 3); });      // nhún theo bước chân ở góc nhìn thứ nhất
  ctx.player = { get body() { return body; }, pos, st, teleport, turnTo, update, holder, jump, kick, use, grabOrThrow, viewDir, setLook, getLook: () => ({ ...body.look }), setPose: (name) => { st.pose = name || null; } };
  ctx.updaters.unshift(update);
}
