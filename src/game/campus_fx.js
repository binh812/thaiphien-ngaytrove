// Phản hồi dùng chung cho các trò và hoạt động ở sân trường: hạt nhỏ (bụi, tia, lá), vòng lan, tiếng ngắn tổng hợp, cử chỉ mừng/tiếc,
// giới hạn tần suất và dọn dẹp. Nguyên tắc: chỉ phát khi kết quả ĐÃ XÁC NHẬN (trúng thật, vào thật), mỗi sự kiện một lần.
// Mọi hạt nằm trong MỘT đối tượng Points (mức thấp 40 hạt, mức cao 120); vòng lan là 3 lưới dùng lại. Người dùng bật "giảm chuyển động"
// (prefers-reduced-motion) thì bỏ hạt, vòng và rung máy quay — tiếng và chữ vẫn giữ. Không ghi vào máy quay: rung nhẹ đi qua ctx.shake
// (trường dùng chung sẵn có, player.js đọc).
import * as THREE from 'three';
import { Q } from '../engine/util.js';

const GRAV = { dust: -0.6, spark: -5, leaf: -1.6 }, LIFE = { dust: 0.7, spark: 0.55, leaf: 1.6 }, SPEED = { dust: 0.7, spark: 2.6, leaf: 0.9 };
const TINT = { dust: [0.5, 0.46, 0.38], spark: [1, 0.82, 0.35], leaf: [0.35, 0.6, 0.22], bad: [1, 0.35, 0.3] };
const RINGS = 3, RING_SECS = 0.45, SHAKE_MAX = 0.45, FAR = 60;
// tiếng ngắn: [tần số đầu, tần số cuối, giây, âm lượng, dạng sóng]
const SOUNDS = {
  tick: [660, 660, 0.05, 0.16, 'triangle'], tok: [300, 190, 0.07, 0.3, 'triangle'], tokHi: [420, 300, 0.07, 0.3, 'triangle'], tokLong: [240, 120, 0.12, 0.34, 'triangle'],
  good: [660, 990, 0.16, 0.26, 'sine'], best: [784, 1568, 0.3, 0.3, 'sine'], bad: [220, 130, 0.22, 0.24, 'sawtooth'], rim: [520, 480, 0.09, 0.22, 'square'], sit: [150, 90, 0.09, 0.2, 'sine'], hey: [520, 700, 0.12, 0.16, 'sine'],
};

export function initFx(K) {
  const { ctx, ui } = K, { player, scene } = ctx, st = player.st, low = Q.grass < 0.5, N = low ? 40 : 120;
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const fx = { get reduced() { return !!(mq && mq.matches) || fx.forceReduced; }, forceReduced: false, live: 0 };

  /* ----- hạt ----- */
  const pos = new Float32Array(N * 3).fill(-999), col = new Float32Array(N * 3), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  pts.frustumCulled = false; pts.visible = false; pts.userData.noBake = true; scene.add(pts);
  const P = Array.from({ length: N }, () => ({ t: 0, life: 0, vx: 0, vy: 0, vz: 0, g: 0, c: TINT.dust })); let next = 0;
  /** n hạt kiểu kind ('dust' bụi sát đất · 'spark' tia mừng · 'leaf' lá rơi) tại (x, y, z); tint = 'bad' để đổi màu báo hỏng */
  fx.puff = (x, y, z, kind = 'dust', n = 8, tint) => {
    if (fx.reduced || Math.hypot(x - player.pos.x, z - player.pos.z) > FAR) return;
    n = Math.min(low ? Math.ceil(n / 2) : n, N);
    for (let i = 0; i < n; i++) {
      const k = next; next = (next + 1) % N; const p = P[k], a = Math.random() * 6.283, s = SPEED[kind] * (0.4 + Math.random() * 0.6);
      p.t = p.life = LIFE[kind] * (0.7 + Math.random() * 0.5); p.g = GRAV[kind]; p.c = TINT[tint || kind];
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = kind === 'spark' ? 1 + Math.random() * 2 : kind === 'leaf' ? -Math.random() * 0.4 : 0.25 + Math.random() * 0.4;
      pos[k * 3] = x + (Math.random() - 0.5) * 0.12; pos[k * 3 + 1] = y + Math.random() * 0.06; pos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.12;
    }
    fx.live = Math.max(fx.live, 2);
  };

  /* ----- vòng lan ----- */
  const ringGeo = new THREE.RingGeometry(0.82, 1, 28), rings = Array.from({ length: RINGS }, () => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, opacity: 0 })); m.visible = false; m.userData.noBake = true; scene.add(m); return { m, t: 0, size: 1 }; });
  let ringI = 0;
  /** một vòng tròn lan ra rồi tắt; flat = nằm trên nền (mặc định), không thì dựng đứng quay về phía yaw */
  fx.ring = (x, y, z, color = 0xffe08a, size = 0.6, yaw = null) => {
    if (fx.reduced) return; const r = rings[ringI]; ringI = (ringI + 1) % RINGS; r.t = RING_SECS; r.size = size; r.m.visible = true; r.m.position.set(x, y, z); r.m.material.color.set(color);
    r.m.rotation.set(yaw === null ? -Math.PI / 2 : 0, yaw === null ? 0 : yaw, 0);
  };

  /* ----- tiếng ----- */
  fx.sound = (name, pitch = 1) => { const s = SOUNDS[name]; if (s) ui.sfx.blip(s[0] * pitch, s[1] * pitch, s[2], s[3], s[4]); };

  /* ----- giới hạn tần suất: once(key, gap) trả true nếu sự kiện key chưa phát trong gap giây gần đây ----- */
  const last = new Map(); let now = 0;
  fx.once = (key, gap = 0.3) => { const t = last.get(key); if (t !== undefined && now - t < gap) return false; last.set(key, now); return true; };

  /* ----- thân người và máy quay ----- */
  fx.cheer = () => { if (!st.clip || !st.pinned) st.gest = { type: 'cheer', t: 0, dur: 0.9 }; };
  fx.oops = () => { st.gest = { type: 'oops', t: 0, dur: 0.8 }; };
  /** rung nhẹ máy quay qua trường dùng chung ctx.shake (không tự ghi vào camera) */
  fx.shake = (amount) => { if (!fx.reduced) ctx.shake = Math.max(ctx.shake || 0, Math.min(SHAKE_MAX, amount)); };

  /** dọn mọi hiệu ứng đang chạy (mất focus, đổi thẻ, dịch chuyển xa, thoát trò) */
  fx.clear = () => { pos.fill(-999); geo.attributes.position.needsUpdate = true; for (const p of P) p.t = 0; for (const r of rings) { r.t = 0; r.m.visible = false; } pts.visible = false; fx.live = 0; if (ctx.shake) ctx.shake = 0; };
  addEventListener('blur', fx.clear); document.addEventListener('visibilitychange', () => { if (document.hidden) fx.clear(); });

  fx.update = (dt) => {
    now += dt;
    for (const r of rings) { if (r.t <= 0) continue; r.t -= dt; const k = 1 - Math.max(0, r.t) / RING_SECS; r.m.scale.setScalar(r.size * (0.25 + k * 0.75)); r.m.material.opacity = (1 - k) * 0.8; if (r.t <= 0) r.m.visible = false; }
    if (fx.live <= 0) { if (pts.visible) pts.visible = false; return; }
    fx.live -= dt; pts.visible = true;
    for (let k = 0; k < N; k++) {
      const p = P[k]; if (p.t <= 0) continue; p.t -= dt; const i = k * 3;
      if (p.t <= 0) { pos[i + 1] = -999; continue; }
      p.vy += p.g * dt; pos[i] += p.vx * dt; pos[i + 1] += p.vy * dt; pos[i + 2] += p.vz * dt; const f = Math.min(1, p.t / p.life * 1.6);
      col[i] = p.c[0] * f; col[i + 1] = p.c[1] * f; col[i + 2] = p.c[2] * f;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  };
  fx.count = () => P.filter(p => p.t > 0).length; fx.max = N; fx.rings = () => rings.filter(r => r.t > 0).length;
  return fx;
}
