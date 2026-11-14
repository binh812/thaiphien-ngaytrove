// Gọi món ở quán nước, hàng xôi, trà đá ngoài cổng và căng tin: chào → chọn món → tìm chỗ ngồi (ghế nhựa, ghế đá) → món được mang ra → E để thưởng thức.
// Cũng là nơi cho ngồi ghế nhựa: ghế là vật thể động thấp 0,3 m nên dùng dáng ngồi xổm (pose_squat, hạ tay bằng armsDown) thay cho clip ngồi ghế cao.
import * as THREE from 'three';

const STOOL_H = 0.3, NEAR_TABLE = 1.3, SERVE_R = 16, EAT_SECS = 2.6, EAT_BEATS = 3, CLEAR_SECS = 1.6, MATE_R = 3.4, CHAT_GAP = 4.5, OWNER = 'food';
const GIVE_UP_R = 25, GIVE_UP_SECS = 90, AWAY_R = 6, MOVED = 0.25;      // bỏ đi xa hơn / lâu hơn thế này thì quán huỷ đơn; ghế bị dời quá MOVED thì người ngồi đứng dậy
const upright = (b) => { const q = b.rotation(); return 1 - 2 * (q.x * q.x + q.z * q.z) > 0.9; };

export function initFood(K) {
  const { ctx, ui, D, state, save } = K, { player, scene } = ctx, st = player.st, R = () => ctx.reunion, F = D.FOOD;
  /* ----- ghế nhựa ngồi được ----- */
  const tableNear = (x, z) => { let best = null, bd = NEAR_TABLE; for (const it of (ctx.tables && ctx.tables.items) || []) { const t = it.body.translation(), d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = it; } } return best; };
  /** các ghế nhựa đang đứng thẳng, chưa ai ngồi, quanh điểm (x, z) trong bán kính r → [{ x, y (nền), z, f, clip, stool, it }] */
  function stoolsNear(x, z, r, feet) {
    const out = [];
    for (const it of (ctx.stools && ctx.stools.items) || []) {
      const t = it.body.translation(); if (it.occupied || Math.abs(t.x - x) > r || Math.abs(t.z - z) > r || Math.abs(t.y - STOOL_H / 2 - feet) > 0.25 || !upright(it.body)) continue;
      const tb = tableNear(t.x, t.z), tt = tb && tb.body.translation(); out.push({ x: t.x, y: t.y - STOOL_H / 2, z: t.z, f: tt ? Math.atan2(tt.x - t.x, tt.z - t.z) : undefined, clip: 'pose_squat', stool: true, it });
    }
    return out;
  }
  K.seatFns.push((take) => { for (const s of stoolsNear(player.pos.x, player.pos.z, 1.4, player.holder.position.y)) take(s.x, s.y, s.z, s.f, { clip: s.clip, stool: true, it: s.it }); });

  /* ----- bát đĩa ----- */
  const geos = { cup: new THREE.CylinderGeometry(0.038, 0.03, 0.11, 12).translate(0, 0.055, 0), bowl: new THREE.CylinderGeometry(0.085, 0.05, 0.06, 14).translate(0, 0.03, 0), plate: new THREE.CylinderGeometry(0.1, 0.09, 0.022, 16).translate(0, 0.011, 0), pack: new THREE.SphereGeometry(0.07, 12, 8).scale(1, 0.6, 1).translate(0, 0.04, 0) };
  const dish = new THREE.Mesh(geos.cup, new THREE.MeshStandardMaterial({ roughness: 0.5 })); dish.castShadow = true; dish.visible = false; scene.add(dish);
  // order = { v, nm, kind, color, served, t (giây chờ/bỏ đi), table (bàn đang đặt món), off [dx, dz] so với bàn }
  let order = null, eatT = 0, clearT = 0, hosting = false, chatT = 0, chatI = 0, mateSpots = [];
  const eatIt = { x: 0, y: 0, z: 0, r: 0, label: '', fn: () => { if (order && order.served && !eatT && K.idle()) eatT = 0.001; } }; ctx.interact.push(eatIt);

  async function ask(v, name, hello) {
    if (!K.idle()) return;
    if (order) { if (ctx.ui) ctx.ui.toast(K.fill(order.served ? F.servedElsewhere : F.waiting, { nm: order.nm }), 3.5); return; }
    if (!K.lock(OWNER)) return;
    try {
      if (hello) await ui.dialog.say(name, hello);      // quán không có người bán hiện hình: chào một câu rồi mới hỏi món (người bán có sẵn đã chào trong phần trò chuyện)
      const i = await ui.dialog.choose(name, v.hello, [...v.menu.map(m => m[0]), F.cancel]); if (typeof i !== 'number' || i >= v.menu.length) return;
      const [nm, kind, color] = v.menu[i]; order = { v, nm, kind, color, served: false, t: 0, table: null, off: null }; if (ctx.ui) ctx.ui.toast(K.fill(F.ordered, { nm }), 5);
    } finally { ui.dialog.close(); K.unlock(OWNER); }
  }
  for (const v of D.VENDORS) {
    const n = v.npc && ctx.people && ctx.people.byId(v.npc);
    if (n) { v.pos = n.h.g.position; v.live = true; }      // người bán có sẵn: bấm E là trò chuyện (campus_talk.js), trong đó có lựa chọn "Gọi món"
    else if (v.at) { v.pos = new THREE.Vector3(v.at[0], v.at[1], v.at[2]); let k = 0; ctx.interact.push({ x: v.at[0], y: v.at[1] + 0.8, z: v.at[2], r: 2.2, label: F.label + v.seller, fn: () => ask(v, v.seller, v.greet[k++ % v.greet.length]) }); }
    else console.warn('[sân trường] quán "' + v.id + '" không có người bán và không khai chỗ đặt quầy, bỏ quán này');
  }
  K.addHud(() => (state.food ? `🍜 ${state.food}` : ''));

  function freeMates() { for (const s of mateSpots) if (s.it) s.it.occupied = false; mateSpots = []; }
  function stopHosting() { if (hosting) { R().resume(OWNER); hosting = false; } freeMates(); }
  function serve() {
    const s = K.play.seat, tb = tableNear(s.x, s.z), f = player.holder.rotation.y; order.served = true; order.t = 0;
    dish.geometry = geos[order.kind]; dish.material.color.setHex(order.color); dish.visible = true;
    if (tb) { const t = tb.body.translation(); order.table = tb; order.off = [(s.x - t.x) * 0.3, (s.z - t.z) * 0.3]; }      // đặt lên bàn, lệch về phía người ngồi; mỗi khung đọc lại vị trí bàn (bàn là vật thể động)
    else dish.position.set(s.x + Math.sin(f) * 0.42, s.y + (s.stool ? 0.02 : 0.47), s.z + Math.cos(f) * 0.42);      // không có bàn: đặt trước mặt (dưới đất với ghế nhựa, trên mặt ghế đá)
    Object.assign(eatIt, { x: s.x, y: s.y + 0.8, z: s.z, r: 1.6, label: F.eat + order.nm }); if (ctx.ui) ctx.ui.toast(K.fill(F.served, { nm: order.nm }), 4);
    // lớp mình đang đi theo thì ngồi quanh: ghế nhựa còn trống gần đó, hết ghế thì đứng quanh bàn
    const r = R();
    if (r && r.mode === 'follow') {
      const n = r.present().length, free = stoolsNear(s.x, s.z, MATE_R, s.y).filter(q => Math.hypot(q.x - s.x, q.z - s.z) > 0.3).slice(0, n).map(q => ({ ...q, f: q.f ?? Math.atan2(s.x - q.x, s.z - q.z) }));
      const ring = []; for (let i = free.length; i < n; i++) { const a = f + Math.PI * (0.35 + 1.3 * (i - free.length + 0.5) / Math.max(1, n - free.length)), x = s.x + Math.sin(a) * 1.7, z = s.z + Math.cos(a) * 1.7; ring.push({ x, y: s.y, z, f: Math.atan2(s.x - x, s.z - z) }); }
      hosting = r.hangout([...free, ...ring], OWNER); chatT = 2; chatI = 0; if (hosting) { mateSpots = free; for (const q of free) q.it.occupied = true; }
    }
  }
  /** quán huỷ đơn (khách bỏ đi): dọn bát, báo một câu, gọi lại được ngay */
  function cancel() { const nm = order.nm; order = null; eatT = 0; st.eat = 0; ui.progress('', null); eatIt.r = 0; dish.visible = false; if (ctx.ui) ctx.ui.toast(K.fill(F.gone, { nm }), 4); }
  function update(dt) {
    if (order) {
      const p = player.pos, to = order.served ? dish.position : order.v.pos, d = Math.hypot(p.x - to.x, p.z - to.z);
      if (!order.served && K.play.sitting && !st.locked && d < SERVE_R) serve();
      else { order.t = order.served && d < AWAY_R ? 0 : order.t + dt; if (d > GIVE_UP_R || order.t > GIVE_UP_SECS) cancel(); }      // đã mang ra mà khách còn ngồi gần thì không tính giờ
    }
    if (order && order.table) { const t = order.table.body.translation(); if (upright(order.table.body)) dish.position.set(t.x + order.off[0], t.y + 0.31, t.z + order.off[1]); else { order.table = null; dish.position.y = Math.max(0.02, t.y - 0.3); } }      // bàn bị xô đổ: bát rơi xuống đất
    if (eatT && order) {
      eatT += dt; const k = eatT / EAT_SECS; ui.progress(K.fill(F.eating, { nm: order.nm }), k); st.eat = 0.5 - 0.5 * Math.cos(k * EAT_BEATS * Math.PI * 2);      // tay phải đưa lên miệng ba nhịp
      if (eatT >= EAT_SECS) { eatT = 0; st.eat = 0; ui.progress('', null); eatIt.r = 0; state.food++; save(); K.drawHud(); if (ctx.ui) ctx.ui.toast(F.done[state.food % F.done.length], 3.5); order = null; clearT = CLEAR_SECS; }
    }
    if (clearT > 0) { clearT -= dt; if (clearT <= 0 && !order) dish.visible = false; }      // bát đĩa tự dọn
    if (hosting) {
      const r = R(); chatT -= dt;
      if (chatT <= 0 && chatI < F.chat.length && r.mode === 'hang') { const [id, raw] = F.chat[chatI++]; r.bubbleAs(id, raw, 4); chatT = CHAT_GAP; }
      for (const s of mateSpots) { if (!s.it || !s.clip) continue; const t = s.it.body.translation(); if (Math.hypot(t.x - s.x, t.z - s.z) > MOVED || !upright(s.it.body)) { s.clip = null; s.it.occupied = false; } }      // ghế của bạn bị dời/đổ: bạn ấy đứng dậy
      if (!K.play.sitting || r.mode !== 'hang') stopHosting();      // người chơi đứng dậy: cả nhóm đi theo tiếp
    }
  }
  return { update, ask, stoolsNear, byNpc: (id) => D.VENDORS.find(v => v.npc === id && v.live) || null, get order() { return order; }, get hosting() { return hosting; }, dish, vendors: D.VENDORS, eat: () => eatIt.fn() };
}
