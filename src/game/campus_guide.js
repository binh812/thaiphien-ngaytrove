// Hệ chỉ dẫn theo ngữ cảnh ở sân trường — để người mới biết có gì để chơi và bấm gì:
//   (a) thẻ nhỏ khi lại gần một hoạt động lần đầu; bảng phím của trò đang chơi (mờ sau 8 giây, hiện lại khi bấm sai nhiều hoặc bấm ?)
//   (b) chỉ dẫn từng bước cho lần chơi đầu mỗi trò, tự qua bước khi làm đúng, có nút bỏ qua, nhớ vào tp2_campus
//   (c) gợi ý ngay dưới hồng tâm theo vật đang cầm / vật đang nhìn
//   (d) phím ? (hoặc F1, nút ?) mở bảng trợ giúp đầy đủ
//   (e) nhãn nổi trên mỗi điểm hoạt động trong 25 m (tắt được trong bảng Tab) và mục "Hoạt động" trên bảng dịch chuyển (M)
// Module chỉ ĐỌC trạng thái các trò (không sửa luật chơi); lời ở campus_guide_data.js.
import * as THREE from 'three';
import { typing } from './reunion_ui.js';
import { SPOTS, KEYS, STEPS, TEXT, HELP, HELP_TOUCH, TOUCH_WORDS } from './campus_guide_data.js';

const CARD_LEAVE = 4, FOOD_NAMES = { hoasua: 'Quán sữa chua', xoi: 'Hàng xôi', trada: 'Trà đá', cangtin: 'Căng tin' };
const AIM_SIDE = 0.75, BASE_SIDE = 0.45, AIM_BACK = 0.9;      // m: lệch vai thêm khi ngắm (cộng vào 0,45 m sẵn có của player.js), lùi thêm
const NEAR_R = 7, CARD_SECS = 7, CARD_TIMES = 3, DIM_AFTER = 8, MARK_MIN = 4.5, MARK_MAX = 25, TICK = 0.2, PICK_RANGE = 3.4, PICK_MASS = 12;

export function initGuide(K) {
  const { ctx, ui, state, save, D } = K, { player, phys } = ctx, st = player.st, G = state.guide, el = ui.el;
  const touch = document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches, ti = touch ? 1 : 0;
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), promptEl = document.getElementById('prompt');
  // máy cảm ứng: mọi lời hiện ra (toast, thanh, chữ nổi, câu thoại) đổi tên phím thành tên nút
  if (touch) { const fix = (s) => { if (typeof s !== 'string') return s; for (const [re, to] of TOUCH_WORDS) s = s.replace(re, to); return s; }; ui.wording = fix; if (ctx.ui && ctx.ui.toast) { const t0 = ctx.ui.toast.bind(ctx.ui); ctx.ui.toast = (s, ...a) => t0(fix(s), ...a); } }
  let now = 0, tick = 0;

  /* ----- các điểm hoạt động: { id, x, y, z, tp: [x, z, yaw] chỗ đứng khi dịch chuyển tới, live(): đang có không } ----- */
  const spots = [];
  const add = (id, x, z, tp, live, y = 0, label) => spots.push({ id, x, y, z, tp, live, label: label || SPOTS[id].name });
  { const c = D.CAU.at; add('cau', c[0], c[1], [c[0], c[1] + 4.2, Math.PI]); }
  for (const h of ctx.hoops || []) { const s = h.z < 0 ? 1 : -1; add('hoop', h.x, h.z + s * 1.2, [h.x, h.z + s * 5, s > 0 ? Math.PI : 0]); }
  if (K.goal) { const s = K.goal.spot; add('goal', s[0], s[1], [s[0] + 3, s[1], -Math.PI / 2]); }
  { const r = D.ROPE.at; add('rope', r[0], r[1], [r[0], r[1] + 3.4, Math.PI]); }
  { const d = (ctx.B.spots || []).find(s => s.type === 'drum'); if (d) add('drum', d.x, d.z, [d.x - 1.6, d.z + 0.3, Math.PI / 2]); }
  if (ctx.mango) add('mango', ctx.mango.x, ctx.mango.z, [ctx.mango.x + 2.1, ctx.mango.z - 1, -Math.PI / 2]);
  for (const v of (K.food && K.food.vendors) || []) if (v.pos) add('food', v.pos.x, v.pos.z, [v.pos.x - 0.4, v.pos.z + 1.6, Math.PI], null, v.pos.y, FOOD_NAMES[v.id]);
  { const f = D.FIRE.at; add('fire', f[0], f[1], [f[0] + 3, f[1], -Math.PI / 2], () => !!(K.night && K.night.on)); }

  /* ----- khung chỉ dẫn (thẻ hoạt động / bảng phím + bước) ----- */
  const box = el('div', 'clGuide'), aim = el('div', 'clAim'), helpBtn = el('button', 'clHelpBtn', '?'), marksEl = el('div', 'clMarks');
  helpBtn.title = TEXT.helpTitle; ui.root.append(marksEl, box, aim, helpBtn);
  const row = (k, text) => { const r = el('div', 'r'); r.append(el('kbd', null, k), el('span', null, text)); return r; };
  let shown = '', shownAt = 0, mode = null, step = 0, card = null, cardUntil = 0;
  function render(key, build) { if (key === shown) return; shown = key; box.textContent = ''; if (key) build(); box.classList.toggle('on', !!key); shownAt = now; }
  const narrow = matchMedia('(max-width: 520px)');
  function drawKeys() {
    const P = KEYS[mode], S = STEPS[mode], teach = S && !G.done[mode] && step < S.length;
    // màn hẹp: nút trên màn hình đã có nhãn nên không lặp lại bảng phím — chỉ MỘT dòng bước hiện tại + nút bỏ qua; học xong thì không hiện gì
    if (narrow.matches) { render(teach ? 'n:' + mode + ':' + step : '', () => { const s = el('div', 'step one'); s.append(el('b', null, `${step + 1}/${S.length}`), el('span', null, S[step][ti])); const b = el('button', null, TEXT.skip); b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); finish(mode); }); s.appendChild(b); box.appendChild(s); }); return; }
    render('k:' + mode + ':' + (teach ? step : 'x'), () => {
      box.appendChild(el('h4', null, P.title));
      if (teach) { const s = el('div', 'step'); s.append(el('b', null, `${TEXT.step} ${step + 1}/${S.length}`), el('span', null, S[step][ti])); const b = el('button', null, TEXT.skip); b.addEventListener('click', (e) => { e.stopPropagation(); b.blur(); finish(mode); }); s.appendChild(b); box.appendChild(s); }
      for (const [k, t, text] of P.rows) if (!(touch && t === '—')) box.appendChild(row(touch ? t : k, text));
      box.appendChild(row(TEXT.more[ti], TEXT.more[2]));
    });
  }
  function drawCard(sp) { const S = SPOTS[sp.id]; render('c:' + sp.id, () => { box.append(el('h4', null, S.icon + ' ' + S.name), el('div', 'line', ui.wording(S.line)), row(S.key[ti], S.key[2])); }); }
  function finish(m) { if (G.done[m]) return; G.done[m] = true; save(); shown = ''; if (ctx.ui) ctx.ui.toast(TEXT.done, 2); }
  ui.stopEv(box);

  /* ----- điều kiện qua bước của từng trò (đọc trạng thái, không điều khiển) ----- */
  let base = 0;      // mốc đếm lúc vào trò (điểm bóng rổ)
  const PASS = {
    cau: [() => K.cau.mine || K.cau.hits > 0, () => K.cau.hits >= 1, () => K.cau.hits >= 3],
    hoop: [() => K.hoop.charging, () => !!K.hoop.last && !K.hoop.charging, () => K.hoop.rec.pts > base],
    pen: [() => K.goal.charging, () => !!K.goal.pen && K.goal.pen.phase !== 'aim'],
    rope: [() => K.rope.count >= 1, () => K.rope.count >= 3],
  };
  const heldBall = () => !!(st.held && st.held.body.userData && st.held.body.userData.ball === 'basket');
  function modeNow() {
    if (st.game === 'cau' || st.game === 'pen' || st.game === 'rope') return st.game;
    if (heldBall() || K.hoop.dribbling) return 'hoop';
    if (K.play.holding) return 'plane';
    return null;
  }

  /* ----- gợi ý dưới hồng tâm ----- */
  function aimText() {
    if (st.game || st.locked || st.photo || st.pinned || K.hoop.charging || K.goal.charging) return '';
    if (heldBall()) return TEXT.ball[ti]; if (K.play.holding) return TEXT.plane[ti]; if (st.held) return touch ? TEXT.held : '';      // vật khác đang cầm: dòng gợi ý sẵn có của người chơi đã nói (trên cảm ứng nó ghi tên phím nên thay bằng tên nút)
    if (promptEl && promptEl.dataset.m) return '';      // đang có lời mời bấm E: chỉ một gợi ý hành động một lúc
    if (K.goal.near()) return TEXT.shoot[ti];
    const o = st.fp ? tmp.set(player.pos.x, player.pos.y + 0.72, player.pos.z) : tmp.copy(ctx.camera.position), hit = phys.cast(o, player.viewDir(dir), st.fp ? PICK_RANGE : PICK_RANGE + 5, 0xffff0002);
    if (!hit || !hit.body || !hit.body.isDynamic() || hit.body.mass() > PICK_MASS || Math.hypot(o.x + dir.x * hit.toi - player.pos.x, o.z + dir.z * hit.toi - player.pos.z) > PICK_RANGE) return '';
    const u = hit.body.userData; return u && u.occupied ? '' : u && u.ball ? TEXT.pick[ti] : TEXT.pickAny[ti];
  }

  /* ----- nhãn nổi trên điểm hoạt động ----- */
  for (const sp of spots) { const S = SPOTS[sp.id]; sp.el = el('div', 'clMark', S.icon + ' ' + sp.label); sp.el.style.display = 'none'; marksEl.appendChild(sp.el); }
  function tickMarks(quiet) {
    const p = player.pos, feet = player.holder.position.y, on = G.marks !== 'off' && !quiet;
    for (const sp of spots) {
      const d = Math.hypot(sp.x - p.x, sp.z - p.z); let vis = on && d > MARK_MIN && d < MARK_MAX && Math.abs(sp.y - feet) < 3 && (!sp.live || sp.live());
      if (vis) { tmp.set(sp.x, sp.y + 2.5, sp.z).project(ctx.camera); vis = tmp.z < 1 && Math.abs(tmp.x) < 0.96 && Math.abs(tmp.y) < 0.9; }
      if (vis) sp.el.style.transform = `translate(-50%,-50%) translate(${((tmp.x + 1) / 2 * innerWidth).toFixed(0)}px,${((1 - tmp.y) / 2 * innerHeight).toFixed(0)}px)`;
      const disp = vis ? '' : 'none'; if (sp.el.style.display !== disp) sp.el.style.display = disp;
    }
  }

  /* ----- bảng trợ giúp đầy đủ ----- */
  let modal = null;
  function closeHelp() { if (!modal) return; modal.remove(); modal = null; K.unlock('help'); }
  function openHelp() {
    if (modal) { closeHelp(); return; } if (st.game) { nudge(); return; }      // đang trong trò: hiện lại bảng phím của trò đó
    if (!st.started || st.photo || !K.lock('help')) return;
    try {
      if (document.pointerLockElement) document.exitPointerLock();
      modal = el('div', 'rvModal clHelp'); const b = el('div', 'box'), grid = el('div', 'grid'), close = el('button', 'primary', TEXT.close);
      for (const [name, rows] of touch ? [HELP_TOUCH, ...HELP] : HELP) { const g = el('div', 'grp'); g.appendChild(el('h4', null, name)); for (const [k, text] of rows) g.appendChild(row(k, text)); grid.appendChild(g); }
      close.addEventListener('click', closeHelp); b.append(el('h2', null, TEXT.helpTitle), grid, close); modal.appendChild(b); ui.stopEv(modal); ui.root.appendChild(modal);
    } catch (e) { if (modal) modal.remove(); modal = null; K.unlock('help'); console.error('[chỉ dẫn] không mở được bảng trợ giúp:', e); }
  }
  helpBtn.addEventListener('click', (e) => { e.stopPropagation(); helpBtn.blur(); openHelp(); });
  addEventListener('keydown', (e) => {
    if (e.repeat || typing() || !st.started) return;
    if (e.key === '?' || e.code === 'F1') { e.preventDefault(); openHelp(); } else if (modal && e.code === 'Escape') closeHelp();
  });
  /** hiện rõ lại bảng phím (trò chơi gọi khi người chơi bấm sai mấy lần liền) */
  function nudge() { shownAt = now; box.classList.remove('dim'); }

  /* ----- bảng Tab: bật/tắt nhãn nổi; bảng M: mục các hoạt động ----- */
  { const panel = document.getElementById('panel');
    if (panel) { const seg = el('span'), bx = el('div', 'seg'); seg.appendChild(bx); const opts = [['off', TEXT.off], ['on', TEXT.on]], btns = opts.map(([k, nm]) => { const b = el('button', (G.marks === 'off' ? 'off' : 'on') === k ? 'on' : '', nm); b.addEventListener('click', () => { G.marks = k; save(); btns.forEach((x, i) => x.classList.toggle('on', opts[i][0] === k)); }); bx.appendChild(b); return b; }); panel.append(el('h3', null, TEXT.marks), seg); }
    const map = document.getElementById('mapPanel');
    if (map) {
      const list = el('div', 'clMem'); list.appendChild(el('h3', null, TEXT.mapTitle));
      for (const sp of spots) {
        const S = SPOTS[sp.id], same = spots.filter(q => q.label === sp.label), b = el('button', 'clLoc', S.icon + ' ' + sp.label + (same.length > 1 ? ' ' + (same.indexOf(sp) + 1) : ''));
        b.addEventListener('click', (e) => { e.stopPropagation(); if (st.locked || st.game) { if (ctx.ui) ctx.ui.toast(TEXT.busy, 2.5); return; } K.fx.clear(); player.teleport(sp.tp[0], sp.y + 0.1, sp.tp[1], sp.tp[2]); if (ctx.ui) { ctx.ui.toast(TEXT.went + sp.label); ctx.ui.toggle('mapPanel', false); } });
        list.appendChild(b);
      }
      map.insertBefore(list, map.children[1] || null);      // ngay dưới tiêu đề bảng, không phải cuộn mới thấy
    } }

  let side = 0, aimOn = false;
  function update(dt) {
    now += dt; tick += dt;
    // đang ngắm (cầm bóng rổ, lấy lực sút, cầm máy bay giấy): xin máy quay lệch vai và lùi thêm để thân người không che đích; trả về mượt
    { const want = st.fp || st.photo || st.locked ? 0 : heldBall() || K.hoop.charging ? AIM_SIDE : K.goal.charging ? AIM_SIDE * 0.8 : K.play.holding ? AIM_SIDE * 0.7 : 0; side += (want - side) * (1 - Math.exp(-6 * dt));
      if (side > 0.02 && ctx.cam && ctx.cam.askSide) { ctx.cam.askSide(BASE_SIDE + side); ctx.cam.askDist(st.dist + side * AIM_BACK); } }
    const panelOpen = ['panel', 'mapPanel'].some(id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); });
    const quiet = !st.started || st.builder || st.photo || document.body.classList.contains('rvCine') || panelOpen || (st.locked && st.locked !== 'help') || !!modal;
    tickMarks(quiet || !!st.game);
    helpBtn.classList.toggle('on', !!st.started && !st.builder && !st.photo && !document.body.classList.contains('rvCine'));
    // dòng gợi ý chung của người chơi ("Chuột trái: ném · Q: thả") sai với bóng rổ/máy bay giấy, và sai tên nút trên cảm ứng: ẩn ngay trong khung đó
    document.body.classList.toggle('clNoPrompt', aimOn || K.hoop.charging || K.goal.charging || !!K.play.holding || (!!st.held && (touch || heldBall())));
    if (tick < TICK) return; tick = 0;
    box.classList.toggle('hide', quiet); box.classList.toggle('dim', now - shownAt > DIM_AFTER);
    const a = quiet ? '' : aimText(); if (aim.textContent !== a) aim.textContent = a; aim.classList.toggle('on', !!a);
    // MỘT gợi ý hành động một lúc: gợi ý dưới hồng tâm đang hiện (hoặc đang lấy lực) thì ẩn dòng gợi ý chung của người chơi và dòng phím C/R
    aimOn = !!a;
    if (quiet) return;
    const m = modeNow();
    if (m !== mode) { mode = m; step = 0; base = K.hoop.rec.pts; shown = ''; }
    if (mode) {
      const S = STEPS[mode], P = PASS[mode];
      if (S && !G.done[mode]) { while (step < S.length && P[step]()) { step++; shownAt = now; } if (step >= S.length) finish(mode); }
      drawKeys(); return;
    }
    // không ở trong trò nào: thẻ của hoạt động gần nhất chưa giới thiệu (mỗi lần chơi một lần, tối đa CARD_TIMES lần qua các lần chơi)
    if (card && (now > cardUntil || Math.hypot(player.pos.x - cardAt.x, player.pos.z - cardAt.z) > CARD_LEAVE)) card = null;      // hết giờ hoặc người chơi đã đi khỏi chỗ đó
    if (!card) {
      const p = player.pos; let best = null, bd = NEAR_R;
      for (const sp of spots) { if (sp.told || (G.seen[sp.id] || 0) >= CARD_TIMES || (sp.live && !sp.live())) continue; const d = Math.hypot(sp.x - p.x, sp.z - p.z); if (d < bd && Math.abs(sp.y - player.holder.position.y) < 2.5) { bd = d; best = sp; } }
      if (!best) { const extra = K.roomAt() ? 'class' : K.play.seatNear() ? 'seat' : (K.frames || []).some(f => !f.gone && f.g.position.distanceToSquared(p) < 36) ? 'memory' : null; if (extra && !told[extra] && (G.seen[extra] || 0) < CARD_TIMES) best = { id: extra }; }
      if (best) { card = best; cardUntil = now + CARD_SECS; cardAt.x = player.pos.x; cardAt.z = player.pos.z; for (const sp of spots) if (sp.id === best.id) sp.told = true; told[best.id] = true; G.seen[best.id] = (G.seen[best.id] || 0) + 1; save(); }
    }
    if (card) drawCard(card); else render('', null);
  }
  const told = {}, cardAt = { x: 0, z: 0 };
  return { update, nudge, openHelp, closeHelp, spots, get mode() { return mode; }, get step() { return step; }, get shown() { return shown; }, get helpOpen() { return !!modal; } };
}
