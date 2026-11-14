// Nhân vật phụ trong trường: đứng tại chỗ, thở/đung đưa nhẹ, quay nhìn người chơi khi lại gần, bấm E để nghe một câu.
import * as THREE from 'three';
import { buildHuman, animateHuman } from './human.js';
import { G } from './physics.js';
import { mulberry32, Q } from '../engine/util.js';

const W = Math.PI / 2;
// Mọi tên và lời thoại dưới đây là hư cấu, tự viết. id dùng để nơi khác tham chiếu (không tham chiếu theo tên); quips = câu cửa miệng nổi trên đầu khi người chơi lại gần.
const CAST = [
  { id: 'guard', n: 'Bác Thìn – bảo vệ', x: 42.8, z: 50.4, f: 2.6, look: { gender: 'm', skin: 2, hair: 'crop', hairColor: 3, outfit: 'teacher', height: 1.66, build: 2 }, say: ['Cựu học sinh hả? Vào đi, vào đi. Bác gác cổng này lâu đến mức nhìn dáng đi là biết khoá nào.', 'Ngày xưa các anh chị trèo tường, giờ đi cổng chính lại còn chào bác. Thế mới gọi là trưởng thành.'], quips: ['Xe để đúng vạch nhé!', 'Cổng mở đến tối, cứ thong thả.'] },
  { id: 'xoi', n: 'Cô Sáu – xôi cổng trường', x: 52.1, y: 0.14, z: 56.4, f: 0, look: { gender: 'f', skin: 2, hair: 'pony', outfit: 'teacher', height: 1.55, build: 2 }, say: ['Xôi nóng đây! Hành phi cô cho thêm, khỏi phải xin.', 'Ăn rồi hẵng vào, bụng đói thì nhớ trường cũng chẳng ra nhớ.'], quips: ['Xôi xéo, xôi lạc, xôi gì cũng có!', 'Còn nóng, còn nóng!'] },
  { id: 'trada', n: 'Bà Tư – trà đá', x: 28, y: 0.14, z: 56.9, f: 0, look: { gender: 'f', skin: 1, hair: 'bob', outfit: 'teacher', height: 1.54, build: 1 }, say: ['Ngồi xuống làm cốc trà đã. Chuyện hai chục năm kể đứng sao hết được.', 'Hướng dương bà để sẵn, cắn hết đĩa này là nhớ lại đủ tên bạn cũ.'], quips: ['Trà đá mát lạnh đây!', 'Ghế còn trống, ngồi đi cháu!'] },
  { id: 'mc', n: 'Cô Ngọc Ánh – dẫn chương trình', x: 46.2, y: 0.83, z: -5, f: -W, look: { gender: 'f', skin: 0, hair: 'long', outfit: 'aodaiR', height: 1.6, build: 0 }, say: ['Kính mời quý thầy cô và các anh chị ổn định chỗ ngồi, chương trình xin phép được tiếp tục ạ!', 'Thử micro… một, hai, ba. Phía cuối sân nghe rõ không ạ?'], quips: ['Một… hai… ba… alo!', 'Tiết mục tiếp theo xin mời…'] },
  { id: 'su', n: 'Thầy Khoa – dạy Sử', x: -10.6, z: 39.3, f: W, look: { gender: 'm', skin: 1, hair: 'side', hairColor: 3, outfit: 'teacher', height: 1.7, build: 1 }, say: ['Bức tượng kia là nhà yêu nước Thái Phiên (1882–1916), trường mình mang tên cụ.', 'Học Sử không phải để thuộc năm tháng đâu em. Để biết mình từ đâu ra thôi.'], quips: ['Em nào nhắc lại năm 938 xem nào?', 'Lịch sử là chuyện kể có ngày tháng.'] },
  { id: 'td', n: 'Thầy Vững – dạy Thể dục', x: 0, y: 0.06, z: 45.5, f: W, look: { gender: 'm', skin: 2, hair: 'crop', outfit: 'pe', height: 1.76, build: 2 }, say: ['Khởi động kỹ vào! À quên, các anh chị giờ khởi động xong là hết giờ.', 'Bóng rổ ở sân kia, ném thử vài quả xem tay còn nhớ không.'], quips: ['Xoay cổ tay, cổ chân!', 'Hít vào… thở ra…'] },
  { id: 'cangtin', n: 'Cô Lụa – căng tin', x: 60.9, z: 25.2, f: -W, look: { gender: 'f', skin: 1, hair: 'pony', outfit: 'teacher', height: 1.56, build: 2 }, say: ['Bánh mì vừa ra lò, trà đá tự rót nhé. Ngày xưa ghi sổ, giờ thì quét mã.', 'Trống ra chơi mà vang lên là chỗ này như vỡ chợ, cô nhớ cái cảnh ấy lắm.'], quips: ['Ai bánh mì nào!', 'Xếp hàng, xếp hàng các con ơi!'] },
  { id: 'saodo', n: 'Bạn Chi – sao đỏ', x: 38.1, z: 50.3, f: Math.PI * 0.9, look: { gender: 'f', skin: 0, hair: 'pony', outfit: 'jacket', height: 1.57, build: 0 }, say: ['Em ghi sổ nề nếp ạ. Anh chị là khách thì em không ghi, nhưng đi nhẹ nói khẽ giúp em.', 'Lớp nào đi muộn nhiều nhất em nắm hết đấy ạ.'], quips: ['Bạn kia, phù hiệu đâu?', 'Mười lăm phút đầu giờ nghiêm túc nhé!'] },
  { id: 'xoai', n: 'Bạn Phong 12A4', x: 33.4, z: 4.4, f: 2.1, look: { gender: 'm', skin: 1, hair: 'short', outfit: 'white', height: 1.72, build: 0 }, say: ['Anh chị rung cây thử đi, quả nào rụng là của chung. Bấm R ném dép khều cũng được, miễn đừng để dép mắc trên cành.'], quips: ['Xoài năm nay sai quả ghê!', 'Chấm muối ớt thì hết ý.'] },
  { id: 'ro1', n: 'Bạn Nam 11A7', x: -45.6, z: -11.6, f: 0.4, look: { gender: 'm', skin: 2, hair: 'crop', outfit: 'pe', height: 1.78, build: 1 }, say: ['Vào ném với bọn em không? Nhặt bóng bằng chuột trái rồi ném thử một quả.'], quips: ['Chuyền đi, chuyền đi!', 'Ba điểm nè!'] },
  { id: 'ro2', n: 'Bạn Kiên 11A7', x: -44, z: -9, f: 3.6, look: { gender: 'm', skin: 1, hair: 'side', outfit: 'pe', height: 1.7, build: 1 }, say: ['Bọn em thua hai quả rồi, anh chị vào gỡ hộ với!'], quips: ['Kèm người, kèm người!', 'Bật cao lên!'] },
  { id: 'bong', n: 'Bạn Sơn 12A6', x: -27, y: 0.02, z: -41.5, f: W, look: { gender: 'm', skin: 2, hair: 'short', outfit: 'pe', height: 1.74, build: 1 }, say: ['Sút thử đi ạ! Đứng gần bóng rồi bấm F.'], quips: ['Chuyền cho tớ!', 'Vào… ôi, trượt.'] },
  { id: 'nhay', n: 'Bạn Vy 10A2', x: -8, z: -39, f: W, look: { gender: 'f', skin: 0, hair: 'bob', outfit: 'pe', height: 1.58, build: 0 }, say: ['Em nhảy được ba mét rưỡi… tính cả đoạn lăn.'], quips: ['Lấy đà nào!', 'Cát vào giày hết rồi.'] },
  { id: 'guong', n: 'Bạn Tú 10A5', x: 49.9, z: -40.2, f: -W, look: { gender: 'm', skin: 1, hair: 'short', outfit: 'jacket', height: 1.66, build: 1 }, say: ['Khu này mới sửa đẹp lắm ạ, gương to, bọn em toàn ra đây chỉnh tóc.'], quips: ['Trống chưa nhỉ?', 'Đợi tớ với!'] },
  { id: 'ba1', n: 'Bạn Linh 12A9', x: 12.6, z: 0.4, f: -2.2, look: { gender: 'f', skin: 0, hair: 'long', outfit: 'aodai', height: 1.6, build: 0 }, say: ['Bọn em sắp ra trường rồi. Nhìn anh chị về thăm, tự dưng thấy thương cái sân này trước.'], quips: ['Chụp chung một kiểu đi!', 'Áo dài hôm nay đẹp không?'] },
  { id: 'ba2', n: 'Bạn Đạt 12A9', x: 11.4, z: -0.6, f: 0.9, look: { gender: 'm', skin: 1, hair: 'side', outfit: 'white', height: 1.73, build: 1 }, say: ['Mai kiểm tra Toán mà em mới ôn đến… trang mục lục.'], quips: ['Cho tớ mượn vở với!', 'Đề năm ngoái có trúng không nhỉ?'] },
  { id: 'ba3', n: 'Bạn Nhi 11A3', x: 12.9, z: -0.9, f: -0.6, look: { gender: 'f', skin: 1, hair: 'pony', outfit: 'jacket', height: 1.56, build: 1 }, say: ['Ra chơi có mười lăm phút mà xếp hàng mua bánh mất mười phút, đời học sinh khổ thế đấy ạ.'], quips: ['Hết bánh mì rồi á?', 'Đói quá đi mất.'] },
  { id: 'chunhiem', n: 'Cô Thanh – chủ nhiệm', x: 36.8, z: 27.1, f: -W, look: { gender: 'f', skin: 0, hair: 'bob', outfit: 'aodaiT', height: 1.58, build: 1 }, say: ['Lớp nào cô chủ nhiệm cô cũng bảo là lớp nghịch nhất. Mà toàn nói thật.', 'Về rồi đấy à. Vào lớp đi, bàn ghế vẫn chỗ cũ.'], quips: ['Sĩ số đủ chưa lớp trưởng?', 'Trật tự nào các em.'] },
];

const DOWN = { x: 0, y: -1, z: 0 };
export const SHADOW_NEAR = 10, SHADOW_PHOTO = 25, CULL_FROM = 6;      // m: bóng thật trong tầm này (chế độ chụp ảnh: 25 m quanh máy); ngoài nón nhìn và xa hơn CULL_FROM thì không vẽ
let blobGeo = null, blobMat = null;
/**
 * Bóng theo khoảng cách cho một người có xương: real = true thì đổ bóng thật; false thì tắt (mỗi lưới có xương đổ bóng là thêm một lệnh vẽ
 * ~0,03–0,045 ms) và hiện một đĩa bóng mờ dưới chân để người không "lơ lửng". Đĩa dùng chung hình và vật liệu, không đổ/nhận bóng.
 */
export function shadowLod(h, real) {
  if (h.lodRig !== h.rig) { if (!h.rig) return; h.lodRig = h.rig; h.casters = []; h.g.traverse((o) => { if (o.isMesh && o.castShadow) h.casters.push(o); }); h.realShadow = true; }
  if (h.realShadow === real) return; h.realShadow = real; for (const o of h.casters) o.castShadow = real;
  if (!h.blob) {
    if (!blobGeo) {
      blobGeo = new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2);
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    h.blob = new THREE.Mesh(blobGeo, blobMat); h.blob.position.y = 0.025; h.blob.renderOrder = 1; h.g.add(h.blob);
  }
  h.blob.visible = !real;
}
/** cos nửa góc nón nhìn của máy quay (có lề): lưới có xương tắt frustumCulled nên phải tự loại người ngoài khung hình */
export function viewCone(camera) {
  return Math.cos(Math.min(1.5, Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.hypot(1, camera.aspect)) + 0.14));
}
/** cao độ mặt nền (khối tĩnh) ngay dưới điểm (x, z), dò quanh cao độ y ± 0,6 m; null nếu không có nền. col = khối va chạm của chính người đó (bỏ qua) */
export function floorY(phys, x, y, z, col) {
  const hit = phys.cast({ x, y: y + 0.6, z }, DOWN, 1.2, 0xffff0001, col);
  return hit ? y + 0.6 - hit.toi : null;
}
/**
 * Dựng một nhân vật phụ tại (c.x, c.y, c.z) quay mặt c.f: mô hình người + viên nang va chạm cố định. Dùng chung cho dàn nhân vật ở đây
 * và các nhân vật của ngày hội (reunion*.js) để mọi người cùng một cách dựng, một cỡ va chạm.
 */
export function spawnNpc(ctx, c, look) {
  const { phys } = ctx, h = buildHuman(look), y = c.y || 0;
  h.g.position.set(c.x, y, c.z); h.g.rotation.y = c.f || 0; ctx.scene.add(h.g);
  const col = phys.world.createCollider(phys.RAPIER.ColliderDesc.capsule(0.55, 0.24).setTranslation(c.x, y + 0.8, c.z).setCollisionGroups(G.STATIC), phys.fixed);
  return { h, c, base: c.f || 0, i: 0, col, pose: null, goal: null };
}
/** bước một đoạn về phía (tx, tz) với tốc độ v, cao độ trượt dần tới ty; kéo khối va chạm theo. Trả về tốc độ thực (m/s), 0 nếu đã tới nơi */
export function stepToward(n, tx, tz, ty, v, dt) {
  const g = n.h.g.position, mx = tx - g.x, mz = tz - g.z, dist = Math.hypot(mx, mz);
  if (dist <= 0.04 || dt <= 0) return 0;
  const step = Math.min(dist, v * dt); g.x += mx / dist * step; g.z += mz / dist * step; g.y += (ty - g.y) * Math.min(1, step / dist);
  n.col.setTranslation({ x: g.x, y: g.y + 0.8, z: g.z });
  return step / dt;
}
/** quay dần thân người về góc want (rad) */
export function turnTo(h, want, rate, dt) {
  let d = want - h.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); h.g.rotation.y += d * Math.min(1, dt * rate);
}

export function init(ctx) {
  const { phys, player } = ctx, rnd = mulberry32(9), list = Q.grass < 0.5 ? CAST.filter((_, i) => i % 2 === 0) : CAST, npcs = [];
  for (const c of list) {
    const idx = CAST.indexOf(c), teacher = c.look.outfit === 'teacher' || /^(Cô|Thầy|Bác|Bà)/.test(c.n);
    const look = { face: idx % 7, faceB: 1 + (idx * 5 + 2) % 6, faceMix: 0.2 + (idx * 37 % 30) / 100, age: /^(Bác|Bà)/.test(c.n) ? 'old' : teacher ? (idx % 2 ? 'old' : 'adult') : 'teen', ageK: 0.55 + (idx % 3) * 0.2, smile: 0.15 + (idx * 7 % 5) * 0.08, brow: 0, stance: !teacher ? (c.look.gender === 'f' && idx % 3 === 0 ? 'front' : 'side') : c.look.gender === 'f' ? 'front' : (idx % 2 ? 'back' : 'side'), ...c.look };
    const npc = Object.assign(spawnNpc(ctx, c, look), { idx, teacher }), y = c.y || 0; npc.h.phase = rnd() * 6; npcs.push(npc);
    npc.it = { x: c.x, y: y + 0.8, z: c.z, r: 2.2, label: 'Nói chuyện với ' + c.n, fn: () => { if (ctx.ui) ctx.ui.toast(`${c.n}: “${c.say[npc.i++ % c.say.length]}”`, 4.5); } };
    ctx.interact.push(npc.it);
  }
  const eye = new THREE.Vector3(), fw = new THREE.Vector3();
  const STUDENT_POSES = ['peace', 'heart', 'peace2', 'thumb', 'bigheart', 'cheer', 'wave'], TEACHER_F = ['grace', 'peace', 'heart'], TEACHER_M = ['thumb', 'cross', 'peace'];
  const TAKEN2 = 0.6 * 0.6, NEAR2 = 7 * 7, GAP = 0.74, WALK = 1.3, MAX_STEP = 0.3;      // bán kính rủ chụp (m²), khoảng cách vai–vai, tốc độ đi tới chỗ, chênh cao độ còn đi tới được
  /**
   * Chụp cùng: những người đứng trong bán kính 7 m quanh người chơi (hoặc quanh máy ảnh) đi tới xếp hàng hai bên người chơi,
   * quay về máy ảnh và tạo dáng; on = false thì ai về chỗ nấy. Người đứng ở cao độ khác (trên sân khấu, bậc thềm) tạo dáng tại chỗ.
   * Trả về số người tham gia.
   */
  function poseNear(on) {
    let k = 0; const p = player.pos, q = ctx.camera.position, feet = player.holder.position.y;
    let dx = p.x - q.x, dz = p.z - q.z; const dl = Math.hypot(dx, dz); if (dl < 0.3) { dx = 0; dz = 1; } else { dx /= dl; dz /= dl; }      // hướng máy ảnh → người chơi; hàng người xếp vuông góc với nó
    let slot = 0;
    for (const n of npcs) {
      const near = on && Math.min((n.c.x - p.x) ** 2 + (n.c.z - p.z) ** 2, (n.c.x - q.x) ** 2 + (n.c.z - q.z) ** 2) < NEAR2;
      if (!near) { n.pose = null; n.goal = null; continue; }
      const idx = n.idx, set = n.teacher ? (n.c.look.gender === 'f' ? TEACHER_F : TEACHER_M) : STUDENT_POSES; n.pose = set[idx % set.length]; k++;
      if (Math.abs(n.homeY - feet) > MAX_STEP || (n.c.x - p.x) ** 2 + (n.c.z - p.z) ** 2 >= NEAR2) { n.goal = null; continue; }
      let gx, gz;
      for (let tries = 0; tries < 16; tries++) {      // ô đã có người khác đứng (lớp đang xếp hàng chụp kỷ yếu — ctx.people.taken) thì lấy ô kế tiếp ra phía ngoài
        const side = slot % 2 ? -1 : 1, off = (Math.floor(slot / 2) + 1) * GAP, row = Math.floor(slot / 2); slot++;
        gx = p.x - dz * side * off + dx * 0.12 * row; gz = p.z + dx * side * off + dz * 0.12 * row;
        if (!(api.taken || []).some(o => o && (o.x - gx) ** 2 + (o.z - gz) ** 2 < TAKEN2)) break;
      }
      const g = n.h.g.position, wx = gx - g.x, wz = gz - g.z, wl = Math.hypot(wx, wz);
      const blocked = wl > 0.05 && phys.cast({ x: g.x, y: g.y + 0.9, z: g.z }, { x: wx / wl, y: 0, z: wz / wl }, wl + 0.25, 0xffff0001, n.col);
      const gy = floorY(phys, gx, feet, gz, n.col);
      if (blocked || gy === null || Math.abs(gy - n.homeY) > MAX_STEP) { n.goal = null; slot--; continue; }
      n.goal = { x: gx, z: gz, y: gy };
    }
    return k;
  }
  /**
   * Chuyển hẳn một người sang chỗ đứng khác (ví dụ cô chủ nhiệm lên bục giảng trong tiết học): chỗ mới thành "nhà" của người đó,
   * điểm tương tác và khối va chạm đi theo. Trả về chỗ cũ { x, y, z, f } để gọi lại khi cần đưa về.
   */
  function relocate(n, x, y, z, f) {
    const g = n.h.g.position, old = { x: n.c.x, y: n.homeY ?? g.y, z: n.c.z, f: n.base };
    n.c = { ...n.c, x, z }; n.homeY = y; n.base = f; n.goal = null; g.set(x, y, z); n.h.g.rotation.y = f;
    n.col.setTranslation({ x, y: y + 0.8, z }); Object.assign(n.it, { x, y: y + 0.8, z });
    return old;
  }
  const api = ctx.people = { poseNear, relocate, list: npcs, byId: (id) => npcs.find(n => n.c.id === id) || null, taken: null };      // taken: [{ x, z }] các chỗ đã có người đứng, poseNear tránh
  let t = 0, snapped = false;
  /** đặt chân từng người đúng mặt nền bên dưới (cao độ khai tay chỉ là ước lượng); chạy sau bước vật lý đầu tiên vì trước đó chưa dò tia được */
  function snap() {
    for (const n of npcs) {
      const y0 = n.h.g.position.y, hit = phys.cast({ x: n.c.x, y: y0 + 0.6, z: n.c.z }, DOWN, 1.2, 0xffff0001, n.col);
      if (hit && hit.toi > 0.01) n.h.g.position.y = y0 + 0.6 - hit.toi;
      if (n.homeY === undefined) n.homeY = n.h.g.position.y;
    }
  }
  ctx.updaters.push((dt) => {
    if (!snapped && t > 0) { snap(); snapped = true; }
    t += dt; const p = player.pos, cam = ctx.camera.position, cosCone = viewCone(ctx.camera), shadowR = player.st.photo ? SHADOW_PHOTO : SHADOW_NEAR; ctx.camera.getWorldDirection(fw);
    for (const n of npcs) {
      const g = n.h.g.position, d2 = (g.x - p.x) ** 2 + (g.z - p.z) ** 2, dc = Math.hypot(g.x - cam.x, g.y + 0.9 - cam.y, g.z - cam.z);
      const seen = dc < CULL_FROM || ((g.x - cam.x) * fw.x + (g.y + 0.9 - cam.y) * fw.y + (g.z - cam.z) * fw.z) / dc > cosCone;
      n.h.g.visible = d2 < 90 * 90 && seen;      // việc đi tới chỗ đứng bên dưới vẫn chạy khi không được vẽ
      // đi tới chỗ đứng chụp (hoặc về chỗ cũ)
      const tx = n.goal ? n.goal.x : n.c.x, tz = n.goal ? n.goal.z : n.c.z, ty = n.goal ? n.goal.y : n.homeY;
      const speed = n.homeY !== undefined ? stepToward(n, tx, tz, ty, WALK, dt) : 0, sc = n.script;      // n.script = { face, look }: kịch bản bên ngoài (tiết học) giữ hướng người và hướng nhìn
      const want = speed ? Math.atan2(tx - g.x, tz - g.z) : n.pose ? Math.atan2(cam.x - g.x, cam.z - g.z) : sc ? sc.face : d2 < 16 ? Math.atan2(p.x - g.x, p.z - g.z) : n.base;
      if (!n.h.g.visible) continue;
      turnTo(n.h, want, speed ? 8 : 3, dt);
      if (n.pose && !speed) { n.h.pose = n.pose; n.h.lookAt = cam; n.h.smile = 0.7; }
      else { n.h.pose = null; n.h.smile = null; n.h.lookAt = speed ? null : sc ? sc.look : d2 < 16 ? eye.set(p.x, p.y + 0.72, p.z) : null; }       // lại gần thì nhìn người chơi
      shadowLod(n.h, dc < shadowR);
      if (d2 < 45 * 45) animateHuman(n.h, speed, dt, false, false, t + n.h.phase);
    }
  });
}
