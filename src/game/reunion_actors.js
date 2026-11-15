// Diễn viên của "Ngày về": nhân vật phụ biết đi tới đích có dò vật cản, quay mặt/nhìn theo chỉ định, tạo dáng, phát clip phụ.
// Dựng và di chuyển dùng chung hàm với people.js (spawnNpc, floorY, stepToward, turnTo) để mọi nhân vật cùng một cỡ va chạm, một cách đặt chân.
import * as THREE from 'three';
import { animateHuman, buildHuman } from './human.js';
import { spawnNpc, floorY, stepToward, turnTo, shadowLod, viewCone, SHADOW_NEAR, SHADOW_PHOTO, CULL_FROM } from './people.js';

const SHOW = 90, ANIM = 45;                   // m: xa hơn thì ẩn / thôi hoạt hoạ (giống people.js); tầm bóng thật và nón nhìn dùng chung với people.js
const PROBE = [0, 0.7, -0.7, 1.4, -1.4];      // các góc lệch (rad) thử lần lượt khi hướng thẳng bị chắn
const KNEE = 0.35, CHEST = 1.0, AHEAD = 0.32, MAX_STEP = 0.32, KEEP = 0.7;      // cao độ hai tia dò, tầm dò trước mặt, chênh nền đi được, khoảng giữ với người chơi

export function makeActors(ctx) {
  const { phys, player } = ctx, list = [], eye = new THREE.Vector3(), fw = new THREE.Vector3(), dir = { x: 0, y: 0, z: 0 }, org = { x: 0, y: 0, z: 0 };
  let t = 0, frame = 0, snapped = false;
  const footGround = (p) => floorY(phys, p.x, p.y - 0.15, p.z);      // nền tĩnh dưới một điểm của bàn chân (bỏ qua nang người), dò từ 0,45 m trên tới 0,75 m dưới

  /**
   * Thêm một diễn viên tại c = { x, y, z, f }. Các trường điều khiển (đặt trực tiếp):
   *   to { x, z, y? } đích đang đi tới (null = đứng yên) · vmax tốc độ tối đa · probe: dò vật cản và nền khi đi (người đi theo) hay đi thẳng (trên sân khấu)
   *   face: góc (rad) | 'player' | 'cam' | { x, z } hướng thân khi đứng · look: null | 'player' | 'cam' | Vector3 hướng đầu
   *   show: tầm hiện riêng (m) · pose mã dáng chụp ảnh · kick 0..1 đưa chân tâng cầu · clip tên clip phụ ('talk', 'sit_idle') · smile 0..1 | null · holding giơ tay phải (cầm máy) · off: ẩn hẳn
   */
  function add(c, look, o = {}) {
    const a = Object.assign(spawnNpc(ctx, c, look), { to: null, vmax: 1.4, probe: false, face: c.f || 0, look: null, clip: null, smile: null, holding: false, off: false, speed: 0, stuck: 0, heading: c.f || 0, acc: 0, k: list.length, ...o });
    a.h.phase = Math.random() * 6; list.push(a); return a;
  }
  /** đặt hẳn sang chỗ khác (không đi bộ) */
  function place(a, x, y, z, f) {
    const g = a.h.g; g.position.set(x, y, z); if (f != null) { g.rotation.y = f; a.heading = f; if (typeof a.face === 'number') a.face = f; }
    a.col.setTranslation({ x, y: y + 0.8, z }); a.to = null; a.stuck = 0; a.speed = 0;
  }
  /** bật/tắt khối va chạm: người đang đi theo thì tắt, nếu không sẽ chắn lối người chơi ở cửa và hành lang hẹp */
  function solid(a, on) { if (a.col.isEnabled() !== on) a.col.setEnabled(on); }
  /** thay ngoại hình (đổi giới tính trong danh sách lớp): giữ hình cũ tới khi mô hình mới nạp xong */
  function relook(a, look) {
    const next = buildHuman(look), seq = a.lookSeq = (a.lookSeq || 0) + 1;
    next.ready.then(() => {
      if (seq !== a.lookSeq) { next.dispose(); return; }
      const old = a.h; next.g.position.copy(old.g.position); next.g.rotation.y = old.g.rotation.y; next.g.visible = old.g.visible; next.phase = old.phase;
      ctx.scene.remove(old.g); old.dispose(); a.h = next; ctx.scene.add(next.g);
    });
  }
  /** điểm ngay trên đầu (để đặt chữ nổi) */
  function head(a, out) { const g = a.h.g.position; return out.set(g.x, g.y + (a.clip && a.clip.startsWith('sit') ? 1.32 : (a.h.look.height || 1.65) + 0.2), g.z); }

  function clear(a, dx, dz, len) {
    const g = a.h.g.position; dir.x = dx; dir.z = dz; org.x = g.x; org.z = g.z;
    for (const hy of [KNEE, CHEST]) { org.y = g.y + hy; if (phys.cast(org, dir, len, 0xffff0001, a.col)) return false; }
    return true;
  }
  /** đi một bước về a.to; có a.probe thì thử lách sang hai bên khi bị chắn, không bước ra chỗ hẫng/bậc cao, không chen vào người chơi. Trả về tốc độ (m/s) */
  function advance(a, dt) {
    const g = a.h.g.position, to = a.to, mx = to.x - g.x, mz = to.z - g.z, dist = Math.hypot(mx, mz);
    if (dist < 0.05 || !(dt > 0)) return 0;
    const v = Math.min(a.vmax, dist * 3 + 0.4); a.heading = Math.atan2(mx, mz);
    if (!a.probe) return stepToward(a, to.x, to.z, to.y ?? g.y, v, dt);
    const step = Math.min(dist, v * dt), p = player.pos, feet = player.holder.position.y, near0 = (g.x - p.x) ** 2 + (g.z - p.z) ** 2;
    for (const ang of PROBE) {
      const h = a.heading + ang, dx = Math.sin(h), dz = Math.cos(h); if (!clear(a, dx, dz, step + AHEAD)) continue;
      const nx = g.x + dx * step, nz = g.z + dz * step, fy = floorY(phys, nx, g.y, nz, a.col); if (fy === null || Math.abs(fy - g.y) > MAX_STEP) continue;
      const near = (nx - p.x) ** 2 + (nz - p.z) ** 2; if (near < KEEP * KEEP && near < near0 && Math.abs(g.y - feet) < 1.5) continue;
      g.x = nx; g.z = nz; g.y += (fy - g.y) * Math.min(1, dt * 30); a.col.setTranslation({ x: nx, y: fy + 0.8, z: nz });      // lên/xuống vỉa hè: gốc trượt tới cao độ mới trong ~0,07 s (không nhảy cả người 14 cm trong một khung); từng bàn chân bám nền thật nhờ rig.groundAt a.heading = h; a.stuck = Math.max(0, a.stuck - dt * 2);
      return step / dt;
    }
    a.stuck += dt; return 0;
  }
  function update(dt) {
    if (!snapped && t > 0) {      // sau bước vật lý đầu tiên mới dò tia được: đặt chân từng người đúng mặt nền
      for (const a of list) { const g = a.h.g.position, fy = floorY(phys, g.x, g.y, g.z, a.col); if (fy !== null && Math.abs(fy - g.y) > 0.01) place(a, g.x, fy, g.z); }
      snapped = true;
    }
    t += dt; frame++; const p = player.pos, cam = ctx.camera.position; ctx.camera.getWorldDirection(fw);
    // Lưới có xương tắt frustumCulled (rigged.js) nên three vẽ cả người ngoài khung hình; đo được ~0,6 ms/người → tự loại theo nón nhìn của máy quay.
    const cosCone = viewCone(ctx.camera), shadowR = player.st.photo ? SHADOW_PHOTO : SHADOW_NEAR;
    for (const a of list) {
      const obj = a.h.g, g = obj.position; if (a.off) { obj.visible = false; continue; }
      const speed = a.speed = a.to ? advance(a, dt) : 0, dc = Math.hypot(g.x - cam.x, g.y - cam.y, g.z - cam.z);
      const ahead = ((g.x - cam.x) * fw.x + (g.y + 0.9 - cam.y) * fw.y + (g.z - cam.z) * fw.z) / (dc || 1);      // cos góc lệch so với trục nhìn
      obj.visible = dc < (a.show || SHOW) && (dc < CULL_FROM || ahead > cosCone); if (!obj.visible) continue;
      const f = a.face, want = speed ? a.heading : typeof f === 'number' ? f : f === 'player' ? Math.atan2(p.x - g.x, p.z - g.z) : f === 'cam' ? Math.atan2(cam.x - g.x, cam.z - g.z) : Math.atan2(f.x - g.x, f.z - g.z);
      turnTo(a.h, want, speed ? 8 : 4, dt);
      if (a.h.rig && a.probe && !a.h.rig.groundAt) { a.h.rig.groundAt = footGround; a.h.rig.stepReach = 0.2; }      // người đi theo người chơi qua bậc, vỉa hè: chân đặt theo nền thật dưới từng bàn chân (như người chơi)
      const h = a.h, lk = a.look; h.pose = speed ? null : a.pose; h.clip = speed ? null : a.clip; h.smile = a.smile; h.kick = a.kick || 0; h.kickKind = a.kickKind || null; h.kickWind = a.kickWind || 0; h.kickLead = a.kickLead ?? null; h.kickAt = a.kickAt || null; h.armsDown = !!a.armsDown;
      h.lookAt = speed || !lk ? null : lk === 'player' ? eye.set(p.x, p.y + 0.72, p.z) : lk === 'cam' ? cam : lk;
      shadowLod(a.h, dc < shadowR);
      if (dc >= ANIM) continue;
      // Đo được: phần tốn nhất của mỗi nhân vật là CPU chỉnh xương sau khi trộn clip (~0,5 ms/người/khung), không phải vẽ. Nên người đứng yên
      // (đung đưa rất chậm) chỉ cập nhật vài khung một lần, dồn dt lại; người đang bước ở gần mới cập nhật mọi khung. a.k so le để chia đều tải.
      const behind = ahead < cosCone, every = a.kick || a.kickWind > 0.2 ? 1 : speed ? (dc > 20 || behind ? 2 : 1) : behind ? 8 : dc > 25 ? 6 : dc > 10 ? 4 : 2;
      a.acc += dt; if ((frame + a.k) % every) continue;
      animateHuman(h, speed, a.acc, false, a.holding && !speed, t + h.phase); a.acc = 0;
    }
  }
  return { list, add, place, solid, relook, head, update };
}
