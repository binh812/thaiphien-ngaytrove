// Quét MỌI nhân vật không phải người chơi đang có trong cảnh: điểm thấp nhất của lưới giày/bàn chân so với mặt va chạm thật ngay dưới (dò tia).
// Gọi qua: node tools/motion_qa.mjs <thư mục> --cast [--q=low|high] [--t=10.5,20.5]
// Cách làm: tìm mọi nhóm có lưới có xương trong scene (trừ người chơi) → không sót diễn viên của trò nào dù không biết nó đăng ký ở đâu. Với từng người:
// đưa người chơi + máy ảnh tới cách ~3,5 m (để người đó hiện và được hoạt hoạ kỹ), chờ, rồi lấy mẫu ~1,2 giây trong vòng lặp thật.
//   đứng/đi: chân trụ (bàn thấp hơn) hở > 3 cm = LỖI; bàn nào chìm > 3 cm = LỖI (1,5–3 cm: CẢNH BÁO)
//   ngồi/ngồi xổm (hông thấp): chỉ xét chìm của bàn chân; in thêm khoảng hông → mặt ghế để người đọc soát
// Các chặng trong một lần nạp trang: lúc mới vào (CAST people.js, lớp đứng ở cổng, diễn viên các trò) → meetAll (cả lớp đi theo) → vào tiết sinh hoạt (ngồi lớp).
// Chặng mở rộng (runExtra, một lần): lấy mẫu dày lúc đá cầu / quay dây / thủ môn, người chơi mạng giả (remote.js được bơm gói trạng thái), chụp kỷ yếu.
// Người ngồi: bàn chân so với nền thật dưới nó (bỏ qua mặt ghế phía trên cổ chân), mông so với mặt ghế (CAST_LIMITS.seat).
export const CAST_LIMITS = { float: [0.015, 0.03], pen: [0.015, 0.03], seat: [0.05, 0.22] };      // m: hở/chìm [cảnh báo, lỗi]; seat: khoảng khớp hông → mặt ghế coi là ngồi đúng

/** chạy trong trang: cài window.__cast */
function installCast() {
  const tp = window.__tp, P = tp.player, V3 = P.holder.position.constructor, v = new V3(), a = new V3(), b = new V3();
  const notCap = (c) => c.shape.type !== tp.phys.RAPIER.ShapeType.Capsule;
  const ground = (x, y, z, up = 0.35) => { const h = tp.phys.cast({ x, y: y + up, z }, { x: 0, y: -1, z: 0 }, 2.5, 0xffff0001, undefined, notCap); return h ? y + up - h.toi : null; };
  const frames = (n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const names = new Map();
  let label = function () {
    names.clear();
    for (const n of (tp.people && tp.people.list) || []) names.set(n.h.g, 'CAST · ' + (n.c.n || n.c.id || '?'));
    const acts = (tp.reunion && tp.reunion.actors && tp.reunion.actors.list) || [];
    acts.forEach((x, i) => names.set(x.h.g, 'diễn viên #' + i + (x.mate ? ' · ' + (x.mate.n || '') : '')));
    const tag = (list, t) => (list || []).forEach((x, i) => { if (x && x.h) names.set(x.h.g, t + ' #' + i); });
    const C = tp.campus || {}; tag(C.cau && C.cau.kids, 'đá cầu'); tag(C.hoop && C.hoop.kids, 'bóng rổ'); tag(C.rope && (C.rope.turners || C.rope.kids), 'quay dây'); tag(C.goal && (C.goal.kids || (C.goal.keeper ? [C.goal.keeper] : null)), 'thủ môn');
  };
  /** mọi nhóm gốc có lưới có xương, trừ người chơi */
  function humans() {
    label(); const out = [], seen = new Set();
    tp.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return; let g = o; while (g.parent && g.parent !== tp.scene) g = g.parent;
      if (g === P.holder || seen.has(g)) return; seen.add(g); out.push(g);
    });
    return out.map((g, i) => ({ i, name: names.get(g) || 'không rõ #' + i, x: g.position.x, y: g.position.y, z: g.position.z, visible: g.visible }));
  }
  let cache = [];
  function roots() { const out = [], seen = new Set(); tp.scene.traverse((o) => { if (!o.isSkinnedMesh) return; let g = o; while (g.parent && g.parent !== tp.scene) g = g.parent; if (g === P.holder || seen.has(g)) return; seen.add(g); out.push(g); }); return out; }
  function bonesOf(g) { const B = {}; g.traverse((o) => { if (o.isBone) for (const k of ['Hips', 'LeftFoot', 'RightFoot', 'LeftUpLeg', 'LeftLeg']) if (o.name.endsWith(k) && !B[k]) B[k] = o; }); return B; }
  function sampleOne(g) {
    g.updateMatrixWorld(true); const B = bonesOf(g); if (!B.Hips || !B.LeftFoot || !B.RightFoot) return null;
    const fl = B.LeftFoot.getWorldPosition(new V3()), fr = B.RightFoot.getWorldPosition(new V3()), hips = B.Hips.getWorldPosition(new V3());
    let lowL = 1e9, lowR = 1e9;
    g.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return; const n = o.geometry.attributes.position.count;
      for (let i = 0; i < n; i += 2) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); if (v.y > Math.max(fl.y, fr.y) + 0.06) continue; const dl = Math.hypot(v.x - fl.x, v.z - fl.z), dr = Math.hypot(v.x - fr.x, v.z - fr.z); if (dl < dr) { if (dl < 0.3 && v.y < lowL) lowL = v.y; } else if (dr < 0.3 && v.y < lowR) lowR = v.y; }
    });
    // tia xuất phát TRONG một khối va chạm (toi = 0: chân thò dưới gầm ghế đá/bàn học — khối va chạm là hộp đặc, hình vẽ thì rỗng gầm) → không dùng được, lấy cao độ gốc nhân vật làm nền
    let gl = ground(fl.x, fl.y, fl.z), gr = ground(fr.x, fr.y, fr.z), inside = false; if (gl === null || gr === null || lowL > 1e8 || lowR > 1e8) return null;
    if (gl > fl.y + 0.349) { gl = g.position.y; inside = true; } if (gr > fr.y + 0.349) { gr = g.position.y; inside = true; }
    // người ngồi co chân dưới mép ghế đá/ghế băng: tia từ trên cổ chân 35 cm trúng MẶT GHẾ (cao hơn cổ chân) chứ không phải nền → "chìm 40 cm" giả. Mặt trúng cao hơn cổ chân 12 cm
    // thì không phải nền của bàn chân đó: dò lại từ ngay trên cổ chân, không được thì lấy cao độ gốc nhân vật
    const under = (f, gy) => { if (gy <= f.y + 0.12) return gy; const h = tp.phys.cast({ x: f.x, y: f.y + 0.04, z: f.z }, { x: 0, y: -1, z: 0 }, 1.5, 0xffff0001, undefined, notCap); return h && h.toi > 0.001 ? f.y + 0.04 - h.toi : g.position.y; };
    gl = under(fl, gl); gr = under(fr, gr);
    const leg = B.LeftUpLeg && B.LeftLeg ? B.LeftUpLeg.getWorldPosition(a).distanceTo(B.LeftLeg.getWorldPosition(b)) + b.distanceTo(fl) : 0.8;
    const seat = ground(hips.x, hips.y, hips.z, 0);
    return { gapL: lowL - gl, gapR: lowR - gr, hip: (hips.y - Math.min(gl, gr)) / leg, seat: seat === null ? null : hips.y - seat, inside, x: g.position.x, z: g.position.z };
  }
  /** đo người thứ i của lần liệt kê gần nhất */
  async function measure(i, shots = 8, every = 5) {
    const g = cache[i]; if (!g || !g.parent) return { skip: 'đã bị gỡ' };
    const gp = g.position; let spot = null;
    for (let k = 0; k < 8 && !spot; k++) { const an = k * Math.PI / 4, x = gp.x + Math.sin(an) * 3.5, z = gp.z + Math.cos(an) * 3.5, y = ground(x, gp.y, z, 0.6); if (y !== null && Math.abs(y - gp.y) < 1.2) spot = { x, y, z, an }; }
    if (!spot) return { skip: 'không có chỗ đứng cạnh' };
    tp.fixedCam = true; P.teleport(spot.x, spot.y + 0.05, spot.z, spot.an + Math.PI);
    const cam = tp.camera, place = () => { cam.position.set(gp.x + Math.sin(spot.an) * 4.6, gp.y + 1.5, gp.z + Math.cos(spot.an) * 4.6); cam.lookAt(gp.x, gp.y + 0.9, gp.z); };
    place(); await frames(40);
    if (!g.visible) return { skip: 'ẩn (trò chơi không cho hiện lúc này)' };
    let minSup = 1e9, maxSup = -1e9, maxPen = 0, hip = 0, seat = null, n = 0, inside = 0, x0 = gp.x, z0 = gp.z, moved = 0;
    for (let s = 0; s < shots; s++) {
      place(); await frames(every); const m = sampleOne(g); if (!m) continue; n++;
      // đang CHẠY (> 2,2 m/s, đo theo quãng dời giữa hai mẫu) thì có pha bay cả hai chân rời đất: không tính "hở" ở mẫu đó
      const running = n > 1 && Math.hypot(m.x - x0, m.z - z0) / (every / 60) > 2.2;
      const sup = Math.min(m.gapL, m.gapR); minSup = Math.min(minSup, sup); if (!running) maxSup = Math.max(maxSup, sup); maxPen = Math.max(maxPen, -m.gapL, -m.gapR); hip += m.hip; if (m.inside) inside++; if (m.seat !== null) seat = m.seat;
      moved += Math.hypot(m.x - x0, m.z - z0); x0 = m.x; z0 = m.z;
    }
    if (!n) return { skip: 'không đọc được xương/nền' }; if (maxSup < -1e8) maxSup = minSup;
    return { n, floatMax: maxSup, floatMin: minSup, pen: maxPen, hip: hip / n, seat, moved, inside, pos: [+gp.x.toFixed(1), +gp.y.toFixed(2), +gp.z.toFixed(1)] };
  }
  window.__cast = { list: () => { cache = roots(); return humans(); }, measure, frames, name: (g, s) => names.set(g, s), extra: new Map(), roots };
  const label0 = label; label = function () { label0(); for (const [g, s] of window.__cast.extra) names.set(g, s); };
}

function judge(m) {
  const L = CAST_LIMITS, sit = m.hip < 0.8, flags = []; let level = 0;
  const add = (lv, s) => { level = Math.max(level, lv); flags.push(s); };
  if (m.pen > L.pen[1]) add(2, 'chìm'); else if (m.pen > L.pen[0]) add(1, 'chìm');
  if (!sit) { if (m.floatMax > L.float[1]) add(2, 'hở'); else if (m.floatMax > L.float[0]) add(1, 'hở'); }      // chân trụ (bàn thấp hơn) ở khung tệ nhất
  if (m.inside && !sit) add(1, 'chân trong khối va chạm (' + m.inside + '/' + m.n + ' mẫu)');
  // người ngồi: xét MÔNG so với mặt ghế (khớp hông cách mặt ghế 5–22 cm là ngồi đúng trên ghế; thấp hơn là lún vào ghế, cao hơn là ngồi lơ lửng). Ngồi xổm (không có ghế dưới hông) thì mặt dưới hông là nền: 15–45 cm
  if (sit && m.seat !== null) { const squat = m.seat > 0.26; if (!squat) { if (m.seat < CAST_LIMITS.seat[0] - 0.04 || m.seat > CAST_LIMITS.seat[1] + 0.08) add(2, 'mông–ghế'); else if (m.seat < CAST_LIMITS.seat[0] || m.seat > CAST_LIMITS.seat[1]) add(1, 'mông–ghế'); } }
  return { level, flags, sit };
}

/**
 * Các chặng mở rộng (một lần, ở lần nạp trang đầu): chụp kỷ yếu (cả lớp xếp hàng tạo dáng), người chơi mạng GIẢ (dựng bằng chính src/net/remote.js, tự bơm gói trạng thái:
 * một người đứng, một người đi qua lại), và lấy mẫu DÀY (mỗi 2 khung trong ~4 giây) lúc diễn viên đang làm động tác: các bạn đá cầu, hai bạn quay dây, thủ môn.
 */
async function runExtra(page, opt, rows, LV, cm, yearbook = false) {
  const put = (stage, name, m) => { const row = { q: opt.q, t: 'mở rộng', stage, name, ...m }; if (m.skip) { row.level = -1; console.log(`${stage.padEnd(16)} ${name.slice(0, 32).padEnd(32)} bỏ qua: ${m.skip}`); } else { const j = judge(m); Object.assign(row, j); console.log(`${stage.padEnd(16)} ${name.slice(0, 32).padEnd(32)} ${(j.sit ? 'ngồi' : 'đứng/đi').padEnd(8)} ${cm(m.floatMin)}..${cm(m.floatMax)} ${cm(m.pen)}   ${m.seat === null ? '    –' : cm(m.seat)}  ${m.moved.toFixed(1).padStart(5)}  ${String(m.pos).padEnd(18)} ${LV[j.level]}${j.flags.length ? ' — ' + j.flags.join(', ') : ''}`); } rows.push(row); };
  const run = async (stage, pick, shots, every) => { const list = (await page.evaluate(() => window.__cast.list())).filter(pick); for (const h of list) put(stage, h.name, await page.evaluate((i, s, e) => window.__cast.measure(i, s, e), h.i, shots, every)); return list.length; };
  if (yearbook) {      // chụp kỷ yếu: cả lớp đi theo rồi xếp hàng tạo dáng (hàng trước ngồi xổm)
    const ok = await page.evaluate(async () => { const tp = window.__tp, r = tp.reunion; if (!r || !r.startPhoto) return 'không có reunion.startPhoto'; if (r.mode !== 'follow' && r.meetAll) { r.meetAll(); await new Promise((q) => setTimeout(q, 2500)); } if (r.mode !== 'follow') return 'không vào được chế độ đi theo (mode=' + r.mode + ')'; r.startPhoto(); await new Promise((q) => setTimeout(q, 7000)); return r.mode === 'photo' ? '' : 'startPhoto không chuyển sang chế độ chụp (mode=' + r.mode + ', busy=' + r.busy + ')'; });
    if (ok) console.log('chụp kỷ yếu      bỏ qua: ' + ok); else await run('chụp kỷ yếu', (h) => h.name.startsWith('diễn viên') && h.visible, 8, 5);
    return;
  }
  console.log('\n== --cast mở rộng · q=' + opt.q + ' ==');
  // 1. động tác, lấy mẫu dày: đá cầu (các bạn tự chuyền), quay dây, thủ môn
  for (const [stage, key] of [['đá cầu (dày)', 'đá cầu'], ['quay dây (dày)', 'quay dây'], ['thủ môn (dày)', 'thủ môn']]) { const n = await run(stage, (h) => h.name.startsWith(key), 120, 2); if (!n) console.log(`${stage.padEnd(16)} (không có nhân vật nào mang nhãn "${key}" ở mức đồ hoạ này)`); }
  // 2. người chơi mạng giả
  try {
    await page.evaluate(async () => {
      const tp = window.__tp, { createRemotes } = await import('/src/net/remote.js'), R = createRemotes(tp, () => false), before = new Set(window.__cast.roots());
      const y = 0.16, look = { gender: 'f', outfit: 'classJ', height: 1.6, hair: 'long' };
      R.join({ id: 'g1', name: 'Khách đứng', look: { gender: 'm', outfit: 'white', height: 1.72, hair: 'short' }, s: [44, y, 60, 0, 0, 0, null, null] }); R.join({ id: 'g2', name: 'Khách đi', look, s: [38, y, 60, 1.57, 1.4, 0, null, null] });
      const t0 = performance.now(); window.__netFeed = setInterval(() => { const t = (performance.now() - t0) / 1000, ph = t % 8, fwd = ph < 4, x = 36 + (fwd ? ph : 8 - ph) * 1.4; R.states([['g1', 44, y, 60, 0, 0, 0, null, null], ['g2', x, y, 60, fwd ? 1.57 : -1.57, 1.4, 0, null, null]], 'me'); }, 80);
      tp.fixedCam = true; tp.player.teleport(41, 0.2, 63.5, Math.PI); tp.camera.position.set(41, 1.6, 65); tp.camera.lookAt(41, 1, 60);
      for (let k = 0; k < 200; k++) { await new Promise((r) => setTimeout(r, 100)); const fresh = window.__cast.roots().filter((g) => !before.has(g)); if (fresh.length >= 2) { fresh.forEach((g, i) => window.__cast.extra.set(g, 'mạng (giả) #' + i)); break; } }
    });
    const n = await run('người chơi mạng', (h) => h.name.startsWith('mạng'), 40, 3); if (!n) console.log('người chơi mạng  KHÔNG dựng được người chơi mạng giả (remote.js không tạo mô hình trong 20 giây)');
    await page.evaluate(() => clearInterval(window.__netFeed));
  } catch (e) { console.log('người chơi mạng  LỖI CÔNG CỤ: ' + String(e && e.message || e).slice(0, 200)); }
}

/** chạy toàn bộ phép quét; trả về mảng kết quả */
export async function runCast(browser, opt, openWithRetry) {
  const times = String(opt.t || '10.5,20.5').split(','), rows = [], LV = ['OK', 'CẢNH BÁO', 'LỖI'];
  const cm = (x) => (x * 100).toFixed(1).padStart(6);
  for (const t of times) {
    const page = await openWithRetry(browser, { ...opt, query: `ui=0&q=${opt.q}&t=${t}&w=cloudy` });
    await page.evaluate(installCast);
    await page.evaluate(() => { window.__tp.player.st.started = true; });
    const stages = [
      ['lúc mới vào', async () => {}],
      ['cả lớp đi theo', async () => { await page.evaluate(() => { const r = window.__tp.reunion; if (r && r.meetAll) r.meetAll(); }); await new Promise((r) => setTimeout(r, 2500)); }],
      ['ngồi lớp', async () => { await page.evaluate(() => { const r = window.__tp.reunion; if (r && r.lesson && r.lesson.start) { r.lesson.start(); } }); await new Promise((r) => setTimeout(r, 4000)); }],
    ];
    console.log(`\n== --cast · q=${opt.q} · t=${t} ==`);
    console.log('chặng            nhân vật                         dáng     hở(chân trụ)  chìm   hông→ghế  đi(m)  vị trí             kết luận');
    for (const [stage, enter] of stages) {
      await enter();
      const list = await page.evaluate(() => window.__cast.list());
      const only = stage === 'lúc mới vào' ? list : list.filter((h) => h.name.startsWith('diễn viên'));      // các chặng sau chỉ đo lại cả lớp
      for (const h of only) {
        const m = await page.evaluate((i) => window.__cast.measure(i), h.i);
        const row = { q: opt.q, t, stage, name: h.name, ...m };
        if (m.skip) { row.level = -1; console.log(`${stage.padEnd(16)} ${h.name.slice(0, 32).padEnd(32)} bỏ qua: ${m.skip}`); }
        else { const j = judge(m); Object.assign(row, j); console.log(`${stage.padEnd(16)} ${h.name.slice(0, 32).padEnd(32)} ${(j.sit ? 'ngồi' : 'đứng/đi').padEnd(8)} ${cm(m.floatMin)}..${cm(m.floatMax)} ${cm(m.pen)}   ${m.seat === null ? '    –' : cm(m.seat)}  ${m.moved.toFixed(1).padStart(5)}  ${String(m.pos).padEnd(18)} ${LV[j.level]}${j.flags.length ? ' — ' + j.flags.join(', ') : ''}`); }
        rows.push(row);
      }
    }
    if (t === times[0]) await runExtra(page, opt, rows, LV, cm);
    await page.close();
    if (t === times[0]) {      // chụp kỷ yếu cần trang mới: ở trang trên tiết sinh hoạt đang chạy (reunion.busy) nên startPhoto không nhận
      const p2 = await openWithRetry(browser, { ...opt, query: `ui=0&q=${opt.q}&t=${t}&w=cloudy` }); await p2.evaluate(installCast); await p2.evaluate(() => { window.__tp.player.st.started = true; });
      await runExtra(p2, opt, rows, LV, cm, true); await p2.close();
    }
  }
  const cnt = (lv) => rows.filter((r) => r.level === lv).length;
  console.log(`\n--cast: ${rows.length} lượt đo · ${cnt(0)} OK · ${cnt(1)} CẢNH BÁO · ${cnt(2)} LỖI · ${cnt(-1)} bỏ qua`);
  console.log('Văn nghệ: nhóm trên sân khấu là các "diễn viên" ở (46; 0,83) trong chặng đầu. Người chơi mạng là bản giả (bơm gói trạng thái vào remote.js), không qua máy chủ phòng. Đơn vị cm; hở = bàn chân thấp hơn so với nền dưới nó (thấp nhất..cao nhất trong ~1,2 giây).');
  return rows;
}
