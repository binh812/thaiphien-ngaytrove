// Giàn máy quay: NƠI DUY NHẤT ghi camera.position / hướng nhìn / fov. Module khác không ghi thẳng vào máy quay mà đăng ký một chế độ
// (setMode) — hàm chế độ chỉ điền tư thế vào `out`, commit() mới ghi. Ngoại lệ: ?cam=… trên URL (ctx.fixedCam) thì giàn không ghi gì,
// công cụ chụp ảnh tự đặt window.__tp.camera.
import * as THREE from 'three';

const PORTRAIT_FOV = 78, PORTRAIT_ASPECT = 1 / 1.15;      // màn dọc (cao > 1,15 × rộng, cùng ngưỡng với render.js): góc nhìn tối thiểu 78°

export function init(ctx) {
  const camera = ctx.camera, modes = [], offsets = [], tmp = new THREE.Vector3(), off = { y: 0, fov: 0 };
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let userFov = camera.fov, askDist = 0;
  // tư thế gốc của khung này (trước độ lệch tạm): pos, dir = hướng nhìn, pivot = điểm tựa vai (góc ba), dist = khoảng lùi thực;
  // cut = true ở khung đầu sau cut()/đổi chế độ để hàm chế độ bỏ làm mượt; hàm chế độ có thể đặt fov (0 = theo người chơi),
  // shake (true = nhận rung/nhún); minDist = khoảng lùi tối thiểu module khác xin cho khung này
  const base = { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), pivot: new THREE.Vector3(), dist: 0, cut: true, fov: 0, shake: false, minDist: 0 };
  const api = {
    base,
    // máy ảnh bay tự do của chế độ chụp ảnh (ui.js): vị trí, góc và góc nhìn RIÊNG, không dùng chung st.yaw/st.pitch của nhân vật
    free: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 0 },
    /** người dùng bật "giảm chuyển động" trong hệ điều hành: không rung, không nhún */
    get reduced() { return !!(mq && mq.matches); },
    /** owner giành máy quay bằng fn(dt, out); chế độ đặt sau cùng thắng, nhả thì chế độ trước đó chạy lại */
    setMode(owner, fn) { api.clearMode(owner); modes.push({ owner, fn }); base.cut = true; },
    /** chỉ nhả đúng chế độ của owner */
    clearMode(owner) { const i = modes.findIndex(m => m.owner === owner); if (i >= 0) { modes.splice(i, 1); base.cut = true; } },
    get mode() { return modes.length ? modes[modes.length - 1].owner : null; },
    /** khung kế nhảy thẳng tới tư thế mới (dịch chuyển, cắt cảnh) */
    cut() { base.cut = true; },
    /** độ lệch tạm fn(dt, off) cộng off.y / off.fov; tính lại mỗi khung, không lưu vào tư thế gốc; chỉ áp khi chế độ cho phép (out.shake) */
    addOffset(fn) { offsets.push(fn); },
    /** dập rung ngay (mất focus, ẩn thẻ, nhả khoá chuột) */
    clearOffsets() { ctx.shake = 0; },
    /** góc nhìn người chơi chọn ở thanh trượt */
    setUserFov(v) { userFov = v; },
    get userFov() { return userFov; },
    /** góc nhìn lúc chơi (đã tính màn dọc), chưa kể chế độ ảnh */
    get playFov() { return Math.max(userFov, camera.aspect < PORTRAIT_ASPECT ? PORTRAIT_FOV : 0); },
    /** xin máy quay góc ba lùi ít nhất d mét; phải gọi lại MỖI KHUNG, ngừng gọi là hết — không đè st.dist người chơi đã chọn */
    askDist(d) { askDist = Math.max(askDist, d); },
    /** gọi một lần mỗi khung ở cuối player.update */
    commit(dt) {
      if (ctx.shake) ctx.shake = Math.max(0, ctx.shake - dt * 1.2);      // rung tắt dần ở mọi chế độ (kể cả đang chụp ảnh, cắt cảnh) nên không dồn lại
      const m = modes[modes.length - 1]; base.minDist = askDist; askDist = 0; if (ctx.fixedCam || !m) return;
      base.fov = 0; base.shake = false; m.fn(dt, base); base.cut = false;
      off.y = 0; off.fov = 0; if (base.shake && !api.reduced) for (const f of offsets) f(dt, off);
      camera.position.copy(base.pos); camera.position.y += off.y; camera.lookAt(tmp.copy(camera.position).add(base.dir));
      const fov = (base.fov || api.playFov) + off.fov;      // chỉ ghi khi đổi: pathtrace so ma trận chiếu để biết máy quay có động không
      if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
  // rung của ctx.shake (props.js, campus_fx.js đặt 0…1): lệch dọc tới 1 cm
  api.addOffset((dt, o) => { if (ctx.shake) o.y += Math.sin(performance.now() * 0.05) * 0.01 * ctx.shake; });
  addEventListener('blur', api.clearOffsets); document.addEventListener('visibilitychange', () => { if (document.hidden) api.clearOffsets(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) api.clearOffsets(); });
  ctx.cam = api; return api;
}
