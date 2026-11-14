// Nhân vật: di chuyển bằng bộ điều khiển nhân vật Rapier, máy quay thứ nhất/thứ ba, nhặt – ném – đá vật thể, tương tác.
import * as THREE from 'three';
import { clamp, isTouch, param } from '../engine/util.js';
import { U } from '../engine/materials.js';
import { buildHuman, animateHuman, DEFAULT_LOOK } from './human.js';

export function loadLook() { try { return { ...DEFAULT_LOOK, ...JSON.parse(localStorage.getItem('tp2_char') || '{}') }; } catch (e) { console.warn('Không đọc được nhân vật đã lưu', e); return { ...DEFAULT_LOOK }; } }


export function init(ctx) {
  const { phys, camera, scene } = ctx, dom = ctx.pipeline.renderer.domElement;
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

  function teleport(x, y, z, yaw) { pos.set(x, y + phys.HH + phys.R + 0.05, z); st.vy = 0; if (yaw != null) { st.yaw = yaw; holder.rotation.y = yaw; } phys.pbody.setTranslation(pos, true); phys.world.propagateModifiedBodyPositionsToColliders(); if (st.held) drop(); }
  function viewDir(out) { const cp = Math.cos(st.pitch); return out.set(Math.sin(st.yaw) * cp, -Math.sin(st.pitch), Math.cos(st.yaw) * cp); }
  function eye(out) { return out.set(pos.x, pos.y + (st.pinned && st.clip ? 0.27 : 0.72), pos.z); }      // đang ngồi (bị ghim + clip ngồi): tầm mắt thấp hơn 0,45 m

  /* ----- nhặt / ném / đá ----- */
  function drop() { if (!st.held) return; st.held.body.setGravityScale(1, true); st.held = null; }
  function grabOrThrow() {
    if (st.locked) return;
    if (st.handUse) { st.handUse(); return; }      // tay đang cầm thứ của module khác (máy bay giấy): chuột trái dùng thứ đó
    if (st.held) { const b = st.held.body, m = b.mass(), d = viewDir(tmp), v = clamp(13 - m * 0.6, 5, 13) * (0.55 + Math.min(1, st.heldT / 0.8) * 0.45); b.setGravityScale(1, true); b.setLinvel({ x: d.x * v, y: d.y * v + 2.2, z: d.z * v }, true); b.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 6 }, true); st.held = null; if (ctx.audio) ctx.audio.whoosh(); return; }
    const o = st.fp ? eye(tmp2) : tmp2.copy(camera.position), d = viewDir(tmp), hit = phys.cast(o, d, st.fp ? 3.2 : st.dist + 3.4, 0xffff0002);
    if (!hit || !hit.body || !hit.body.isDynamic() || hit.body.mass() > 12 || (hit.body.userData && hit.body.userData.occupied)) return;      // ghế đang có người ngồi thì không nhấc
    st.held = { body: hit.body }; st.heldT = 0; hit.body.wakeUp();
  }
  function kick() {
    if (st.locked || st.photo || st.pinned) return;
    const d = tmp.set(Math.sin(st.yaw), 0, Math.cos(st.yaw)); let best = null, bd = 1.7;
    phys.world.bodies.forEach((b) => { if (!b.isDynamic() || b.mass() > 14 || (b.userData && b.userData.occupied)) return; const t = b.translation(), dx = t.x - pos.x, dz = t.z - pos.z, dy = t.y - (pos.y - 0.6); if (Math.abs(dy) > 0.9) return; const dist = Math.hypot(dx, dz); if (dist < bd && (dx * d.x + dz * d.z) / (dist + 1e-4) > 0.35) { bd = dist; best = b; } });
    if (!best) return; const m = best.mass(), p = 7.5 + st.speed * 0.9; best.wakeUp(); best.applyImpulse({ x: d.x * m * p, y: m * (2.6 + Math.sin(st.pitch) * -3), z: d.z * m * p }, true); if (ctx.audio) ctx.audio.thud(0.8);
  }
  function nearest() { let best = null, bd = 1e9; for (const it of ctx.interact || []) { const d = Math.hypot(it.x - pos.x, it.z - pos.z); if (d < it.r && Math.abs(it.y - pos.y) < 2.4 && d < bd) { bd = d; best = it; } } return best; }
  function use() { if (st.locked || st.photo) return; const it = nearest(); if (it) it.fn(); }

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
  function jump() { if (st.grounded && !st.locked && !st.pinned) { st.vy = 4.7; st.grounded = false; } }
  dom.addEventListener('mousedown', (e) => { if (!st.started) return; if (!locked() && !isTouch) { const p = dom.requestPointerLock(); if (p && p.catch) p.catch(() => ctx.ui && ctx.ui.toast('Chưa khoá được chuột – thử bấm lại sau giây lát')); return; } if (e.button === 0) grabOrThrow(); else if (e.button === 2) drop(); });
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => { if (!locked()) return; st.yaw -= e.movementX * 0.0023; st.pitch = clamp(st.pitch + e.movementY * 0.0023, -1.35, 1.35); });
  addEventListener('wheel', (e) => { if (st.started) st.dist = clamp(st.dist + Math.sign(e.deltaY) * 0.5, 1.6, 9); }, { passive: true });
  if (isTouch) {
    document.body.classList.add('touch'); const J = document.getElementById('joy'), K = document.getElementById('knob'); let look = null;
    const jm = (t) => { const r = J.getBoundingClientRect(); let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2); const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; K.style.transform = `translate(${x * 34}px,${y * 34}px)`; };
    J.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; joy.id = t.identifier; jm(t); e.preventDefault(); }, { passive: false });
    addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === joy.id) jm(t); else if (look && t.identifier === look.id) { st.yaw -= (t.clientX - look.x) * 0.005; st.pitch = clamp(st.pitch + (t.clientY - look.y) * 0.005, -1.3, 1.3); look.x = t.clientX; look.y = t.clientY; } } }, { passive: true });
    const touchUp = (e) => { for (const t of e.changedTouches) { if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; K.style.transform = ''; } if (look && t.identifier === look.id) look = null; } };
    addEventListener('touchend', touchUp); addEventListener('touchcancel', touchUp);
    dom.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; if (!look) look = { id: t.identifier, x: t.clientX, y: t.clientY }; }, { passive: true });
    document.getElementById('tJump').addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }); document.getElementById('tUse').addEventListener('touchstart', (e) => { e.preventDefault(); if (nearest()) use(); else kick(); }); document.getElementById('tThrow').addEventListener('touchstart', (e) => { e.preventDefault(); grabOrThrow(); });
  }

  /* ----- giữ vật đang cầm ----- */
  phys.onStep(() => {
    if (!st.held) return; const b = st.held.body, t = b.translation(), d = viewDir(tmp), o = st.fp ? eye(tmp2) : tmp2.set(pos.x, pos.y + 0.45, pos.z), k = st.fp ? 1.25 : 1.05;
    const tx = o.x + d.x * k, ty = o.y + d.y * k - (st.fp ? 0.12 : 0), tz = o.z + d.z * k; let vx = (tx - t.x) * 16, vy = (ty - t.y) * 16, vz = (tz - t.z) * 16; const l = Math.hypot(vx, vy, vz);
    if (l > 14) { vx *= 14 / l; vy *= 14 / l; vz *= 14 / l; } if (Math.hypot(tx - t.x, ty - t.y, tz - t.z) > 2.6) { drop(); return; }
    b.setGravityScale(0, true); b.setLinvel({ x: vx, y: vy, z: vz }, true); const av = b.angvel(); b.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);
  });

  const des = { x: 0, y: 0, z: 0 };
  function update(dt) {
    if (st.held) st.heldT += dt;
    // hướng di chuyển
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x, iz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    if (!st.started || st.photo || st.locked) ix = iz = 0;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const run = keys.ShiftLeft || keys.ShiftRight || il > 0.92 && joy.id !== null, target = (run ? 4.2 : 1.5) * Math.min(1, il);
    fwd.set(Math.sin(st.yaw), 0, Math.cos(st.yaw)); right.set(-fwd.z, 0, fwd.x);
    const k = 1 - Math.exp(-dt * (st.grounded ? 12 : 3)); mv.x += ((fwd.x * iz + right.x * ix) * target - mv.x) * k; mv.z += ((fwd.z * iz + right.z * ix) * target - mv.z) * k;
    st.vy = Math.max(-30, st.vy - 12.5 * dt);
    des.x = mv.x * dt; des.y = st.vy * dt; des.z = mv.z * dt;
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
    holder.position.set(pos.x, pos.y - phys.HH - phys.R, pos.z); holder.visible = !st.fp || st.photo;
    if (st.speed > 0.3) { const a = Math.atan2(mv.x, mv.z); let d = a - holder.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); holder.rotation.y += d * Math.min(1, dt * 10); } else if ((st.fp || st.held) && !st.pose) holder.rotation.y = st.yaw;
    // tạo dáng chụp ảnh: quay người về phía máy ảnh, nhìn vào ống kính, cười; bước đi thì thôi dáng
    if (st.pose && !st.photo && il > 0.1) st.pose = null;
    if (st.pose) { const a = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z); let d = a - holder.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); holder.rotation.y += d * Math.min(1, dt * 6); }
    body.pose = st.pose || null; body.clip = st.clip || null; body.kick = st.kick || 0; body.armsDown = !!st.armsDown; body.eat = st.eat || 0; body.lookAt = st.pose || st.photo ? camera.position : null; body.smile = st.pose ? 0.75 : null;
    animateHuman(body, st.speed, dt, !st.grounded, !!st.held, performance.now() / 1000);
    U.uPlayer.value.set(pos.x, pos.y - phys.HH - phys.R, pos.z);
    // bước chân
    if (st.grounded && st.speed > 0.8) { st.step += st.speed * dt; if (st.step > (run ? 1.1 : 0.75)) { st.step = 0; if (ctx.audio) ctx.audio.step(pos); } }
    // gợi ý tương tác
    if (ctx.ui) { const it = nearest(); ctx.ui.prompt(st.locked ? '' : st.held ? 'Chuột trái: ném · Q: thả' : it ? `E · ${it.label}` : ''); }
    if (ctx.fixedCam) return;
    // máy quay
    const d = viewDir(tmp);
    if (st.photo) return;
    if (st.builder) { st.spin = (st.spin || 0) + dt * 0.35; holder.visible = true; holder.rotation.y = st.yaw + Math.PI + Math.sin(st.spin) * 0.6; const hy = pos.y - phys.HH - phys.R; camera.position.set(pos.x - Math.sin(st.yaw) * 2.5 + Math.cos(st.yaw) * 0.75, hy + 1.25, pos.z - Math.cos(st.yaw) * 2.5 - Math.sin(st.yaw) * 0.75); camera.lookAt(pos.x + Math.cos(st.yaw) * 0.75, hy + 0.95, pos.z - Math.sin(st.yaw) * 0.75); return; }
    if (st.fp) { st.bob += st.speed * dt * 1.9; eye(camera.position); camera.position.y += Math.sin(st.bob * 2) * 0.022 * Math.min(1, st.speed / 3) + (ctx.shake ? Math.sin(performance.now() * 0.05) * 0.01 * ctx.shake : 0); camera.lookAt(tmp2.copy(camera.position).add(d)); }
    else {
      const pv = tmp2.set(pos.x, pos.y + 0.62, pos.z).addScaledVector(right, 0.45); let dist = st.dist; const back = d.clone().multiplyScalar(-1), hit = phys.cast(pv, back, dist + 0.3, 0xffff0001); if (hit) dist = Math.max(0.5, hit.toi - 0.25);
      camera.position.copy(pv).addScaledVector(back, dist); camera.lookAt(pv.x + d.x * 6, pv.y + d.y * 6, pv.z + d.z * 6);
    }
    if (ctx.shake) ctx.shake = Math.max(0, ctx.shake - dt * 1.2);
  }
  ctx.player = { pos, st, teleport, update, holder, jump, kick, use, grabOrThrow, viewDir, setLook, getLook: () => ({ ...body.look }), setPose: (name) => { st.pose = name || null; } };
  ctx.updaters.unshift(update);
}
