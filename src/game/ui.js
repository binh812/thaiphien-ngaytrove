// Giao diện: màn hình bắt đầu, bảng điều khiển (giờ, thời tiết, đồ họa), dịch chuyển, chế độ chụp ảnh, thông báo.
import * as THREE from 'three';
import { QNAME, clamp, param } from '../engine/util.js';
import { WEATHERS } from '../engine/sky.js';
import { STYLE, setStyle } from '../engine/pencil/style.js';
import { SKINS, HAIR_COLORS, HAIRS, OUTFITS, FACES, AGES, POSES, HAIR_LABELS, GLASSES } from './human.js';
import { poseNames, hairStyles, modelFiles, wardrobe, OUTFIT_PRESETS, pickHead } from './rigged.js';
import { typing } from './reunion_ui.js';      // đang gõ chữ (trò chuyện, sửa tên): phím không phải của máy ảnh

const $ = (id) => document.getElementById(id);
const LOCS = [
  ['Cổng trường', 41, 0.14, 59.5, Math.PI], ['Sân trường – khu ghế họp', -42, 0, -5, Math.PI / 2], ['Sân khấu & cột cờ', 30, 0, 0, Math.PI / 2], ['Lớp 12A1 (nhà A, tầng 2)', 50.6, 4.35, -18.55, -Math.PI / 2],
  ['Cầu thang nhà B', -40.36, 0.15, 13.6, 0], ['Vườn hoa – tượng Thái Phiên', 33.5, 0, 38, -Math.PI / 2], ['Nhà thi đấu', 29, 0, 48.2, -Math.PI / 2], ['Hội trường', -29, 0, 47.2, -Math.PI / 2],
  ['Phù điêu gốm', -24, 0, 48.3, Math.PI / 2], ['Ban giám hiệu', 47.5, 0, 41, Math.PI / 2], ['Nhà vệ sinh 5 tỏi', 45.5, 0, -42.3, Math.PI / 2], ['Căng tin', 52.5, 0, 25.2, Math.PI / 2],
  ['Sân bóng rổ', -33, 0, -4, -Math.PI / 2], ['Bãi nhảy xa & sân cỏ', -12.5, 0, -38.2, Math.PI / 2], ['Nhà để xe', 65, 0, 19, Math.PI], ['Trống trường', 49.9, 0.15, 10.9, 0],
  ['Cây xoài', 33, 0, 3, Math.PI / 2], ['Backdrop chụp ảnh', 34, 0, -27, -Math.PI / 2], ['Quán sữa chua Hoa Sữa', 35.2, 0.14, 79.2, 0], ['Sân thượng nhà A', 50.5, 12.75, -5, -Math.PI / 2],
];
const ZONES = [[-58, -32, 43, 53.6, 'Hội trường'], [-32, -10, 43, 53.6, 'Sân phù điêu'], [-10, 32, 43, 53.6, 'Nhà thi đấu'], [-58, 32, 24.6, 42.6, 'Vườn hoa'], [-52.5, -37.5, -18, 10, 'Sân bóng rổ'], [-48, -14, -46.8, -35, 'Sân cỏ'], [51, 62, 22.2, 28.2, 'Căng tin'], [51.8, 61.8, -47.4, -37.8, 'Nhà vệ sinh'], [62.6, 72.2, -36, 14.4, 'Nhà để xe']];

export function init(ctx) {
  const { sky, pipeline, player } = ctx, panel = $('panel'), map = $('mapPanel');
  let toastT = 0;
  const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  const seg = (items, cur) => `<div class="seg">${items.map(([k, n]) => `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  panel.innerHTML = `
    <h3>Thời gian</h3>
    <div class="row"><label>Giờ trong ngày</label><input id="uHour" type="range" min="0" max="24" step="0.05"><output id="oHour"></output></div>
    <div class="row"><label>Trôi thời gian</label><span id="uSpeed">${seg([[0, 'Dừng'], [60, '×60'], [600, '×600'], [3000, '×3000']], 0)}</span></div>
    <h3>Thời tiết</h3><span id="uWeather">${seg(Object.entries(WEATHERS).map(([k, v]) => [k, v.name]), sky.state.weather)}</span>
    <h3>Ống kính</h3>
    <div class="row"><label>Góc nhìn</label><input id="uFov" type="range" min="30" max="95" step="1" value="62"><output id="oFov">62°</output></div>
    <div class="row"><label>Phơi sáng</label><input id="uExp" type="range" min="0.4" max="2" step="0.02" value="1"><output id="oExp">1.00</output></div>
    <div class="row"><label>Xoá phông</label><input id="uDof" type="range" min="0" max="3" step="0.05" value="0"><output id="oDof">0</output></div>
    <h3>Lớp hiệu ứng</h3><span id="uLayers">${seg([['ao', 'Bóng khe'], ['vol', 'Tia nắng'], ['bloom', 'Quầng sáng'], ['lens', 'Loá ống kính']], '')}</span>
    <h3>Chất lượng đồ họa (tải lại trang)</h3><span id="uQ">${seg([['low', 'Thấp'], ['medium', 'Vừa'], ['high', 'Cao'], ['ultra', 'Cực cao']], QNAME)}</span>
    <h3>Kiểu vẽ (tải lại trang)</h3><span id="uStyle">${seg([['real', 'Tả thực'], ['pencil', 'Chì màu (thử)']], STYLE)}</span>`;
  if (STYLE === 'pencil') { for (const id of ['uExp', 'uDof']) $(id).closest('.row').style.display = 'none'; $('uLayers').style.display = 'none'; $('uLayers').previousElementSibling.style.display = 'none'; }      // chì màu: các mục này không có tác dụng
  map.innerHTML = '<h3>Dịch chuyển tới</h3>' + LOCS.map((l, i) => `<button class="loc" data-i="${i}">${l[0]}</button>`).join('');
  const stop = (el) => { for (const ev of ['mousedown', 'wheel', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); };
  stop(panel); stop(map);
  let expUser = 1;
  $('uHour').value = sky.state.hour; $('uHour').addEventListener('input', (e) => { sky.state.hour = +e.target.value; });
  const segClick = (id, fn) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; fn(b.dataset.k, b); });
  const only = (id, b) => { $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  segClick('uSpeed', (k, b) => { sky.state.speed = +k; only('uSpeed', b); });
  segClick('uWeather', (k, b) => { sky.setWeather(k); only('uWeather', b); });
  segClick('uLayers', (k, b) => { pipeline.layers[k] = !pipeline.layers[k]; b.classList.toggle('on', pipeline.layers[k]); });
  $('uLayers').querySelectorAll('button').forEach(b => { const ok = pipeline.available[b.dataset.k]; b.classList.toggle('on', ok); b.disabled = !ok; if (!ok) { b.style.opacity = 0.4; b.title = 'Tắt ở mức đồ họa hiện tại'; } });
  segClick('uStyle', (k) => { if (k !== STYLE) setStyle(k); });
  segClick('uQ', (k) => { try { localStorage.setItem('tp2_quality', k); } catch (e) { console.warn('Không lưu được mức đồ họa', e); } const u = new URL(location.href); u.searchParams.set('q', k); location.href = u.toString(); });
  // góc nhìn: đang chụp ảnh thì thanh trượt chỉnh ống kính máy ảnh (thoát ảnh là hết), còn lại là góc nhìn lúc chơi; giàn máy quay (camrig.js) mới ghi camera.fov
  const showFov = (v) => { $('uFov').value = v; $('oFov').textContent = Math.round(v) + '°'; };
  ctx.cam.setUserFov(+$('uFov').value);
  $('uFov').addEventListener('input', (e) => { const v = +e.target.value; if (player.st.photo) ctx.cam.free.fov = v; else ctx.cam.setUserFov(v); $('oFov').textContent = e.target.value + '°'; });
  $('uExp').addEventListener('input', (e) => { expUser = +e.target.value; sky.state.exposure = expUser; $('oExp').textContent = expUser.toFixed(2); });
  $('uDof').addEventListener('input', (e) => { pipeline.u.final.uDof.value = +e.target.value; $('oDof').textContent = (+e.target.value).toFixed(1); });
  map.addEventListener('click', (e) => { const b = e.target.closest('.loc'); if (!b) return; if (player.st.locked) { api.toast('Đang dở tay — xong việc này rồi hãy đi.', 2.5); return; } const l = LOCS[+b.dataset.i]; player.teleport(l[1], l[2], l[3], l[4]); api.toast('Đã tới: ' + l[0]); api.toggle('mapPanel', false); });

  // ----- tạo nhân vật -----
  const look = player.getLook(), bEl = $('builder'), hexs = (c) => '#' + c.toString(16).padStart(6, '0');
  const sw = (arr, cur, key) => `<div class="seg" data-key="${key}">${arr.map((c, i) => `<button class="sw ${i === cur ? 'on' : ''}" data-k="${i}" style="background:${hexs(c)}" aria-label="Màu ${i + 1}"></button>`).join('')}</div>`;
  const sg = (items, cur, key) => `<div class="seg" data-key="${key}">${items.map(([k, n]) => `<button data-k="${k}" class="${String(k) === String(cur) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  // kiểu tóc, kính, áo lớp chỉ hiện khi mô hình có (đọc từ manifest); chưa có thì giữ danh sách cũ
  let hasGlasses = false, hasClass = false, ward = null;
  // tủ đồ: chọn áo, quần/váy, giày riêng rẽ (chỉ khi mô hình tủ đồ đã có); chưa có thì vẫn chọn theo bộ như cũ
  const SLOTS = [['top', 'tops', 'Áo'], ['bottom', 'bottoms', 'Quần / váy'], ['shoes', 'shoes', 'Giày']];
  const wOf = () => { if (!ward) return null; const g = look.gender === 'f' ? 'f' : 'm'; return param('ai', '1') !== '0' && ward[g + '_ai'] || ward[g]; };      // cùng cách chọn với pickWardrobe
  /** điền món còn thiếu theo bộ gợi ý, bỏ món không hợp lệ (đổi giới, áo chỉ đi với vài kiểu quần) */
  function fixWardrobe() {
    const w = wOf(); if (!w) return; const P = OUTFIT_PRESETS[look.outfit] || {}, has = (list, id) => (w[list] || []).some(x => x.id === id);
    // bộ gợi ý cũ cần kiểu áo tủ đồ chưa có (áo khoác, thể dục, sơ mi thầy giáo) → giữ nguyên bộ đó cho tới khi người chơi tự chọn áo
    if (look.top === undefined && P.top && !has('tops', P.top)) return;
    const FALLBACK = { top: null, bottom: 'trousers', shoes: 'dress' };
    for (const [slot, list] of SLOTS) {
      const L = w[list] || []; if (L.some(x => x.id === look[slot])) continue;
      const fromPreset = look[slot] === undefined;                                     // lần đầu: lấy món + màu của bộ gợi ý
      look[slot] = has(list, P[slot]) ? P[slot] : has(list, FALLBACK[slot]) ? FALLBACK[slot] : (L[0] && L[0].id);
      if (fromPreset && P[slot + 'Color']) look[slot + 'Color'] = P[slot + 'Color']; else delete look[slot + 'Color'];
    }
    const top = (w.tops || []).find(x => x.id === look.top);
    if (top && top.bottoms && !top.bottoms.includes(look.bottom)) { look.bottom = top.bottoms[0]; delete look.bottomColor; }
  }
  function headRow() {
    const w = wOf(), hs = w && w.heads; if (!hs || hs.length < 2) return '';
    return `<div class="row"><label>Gương mặt</label>${sg(hs.map(h => [h.id, h.label || ('Mặt ' + h.id)]), (pickHead(w, look) || hs[0]).id, 'head')}</div>`;
  }
  function wardrobeRows() {
    const w = wOf(); if (!w) return null; let html = '';
    const top = (w.tops || []).find(x => x.id === look.top);
    for (const [slot, list, label] of SLOTS) {
      const L = (w[list] || []).filter(x => slot !== 'bottom' || !top || !top.bottoms || top.bottoms.includes(x.id)); if (!L.length) continue;
      html += `<div class="row"><label>${label}</label>${sg(L.map(x => [x.id, x.label || x.id]), look[slot], slot)}</div>`;
      const cur = L.find(x => x.id === look[slot]), tints = cur && !cur.baked ? [...new Set([look[slot + 'Color'], cur.tint, ...(cur.tints || [])].filter(Boolean))] : [];
      if (tints.length > 1) html += `<div class="row"><label>Màu</label><div class="seg" data-key="${slot}Color">${tints.map(t => `<button class="sw ${(look[slot + 'Color'] ?? cur.tint) === t ? 'on' : ''}" data-k="${t}" style="background:${t}" aria-label="Màu ${t}"></button>`).join('')}</div></div>`;
    }
    return html;
  }
  wardrobe().then((w) => {
    if (!w) return; ward = w;
    for (const g of ['m', 'f']) if (w[g] && w[g].hairStyles) HAIRS[g] = w[g].hairStyles.map(id => [id, HAIR_LABELS[id] || id]);      // kiểu tóc theo đúng tệp tủ đồ
    if (w.m || w.f) hasGlasses = true;
    const before = JSON.stringify(look); fixWardrobe(); if (JSON.stringify(look) !== before) player.setLook({ ...look }); drawBuilder();
  });
  Promise.all([hairStyles(), modelFiles()]).then(([hs, files]) => {
    if (hs) { for (const g of ['m', 'f']) if (hs[g]) HAIRS[g] = hs[g].map(id => [id, HAIR_LABELS[id] || id]); hasGlasses = true; }
    hasClass = files.includes('m_class') || files.includes('f_class');
    if (!HAIRS[look.gender].some(h => h[0] === look.hair)) look.hair = HAIRS[look.gender][0][0];
    drawBuilder();
  });
  function drawBuilder() {
    bEl.innerHTML = `<h3>Tạo nhân vật</h3>
      <div class="row"><label>Giới tính</label>${sg([['m', 'Nam'], ['f', 'Nữ']], look.gender, 'gender')}</div>
      <div class="row"><label>Dáng người</label>${sg([[0, 'Gầy'], [1, 'Vừa'], [2, 'Đậm']], look.build, 'build')}</div>
      <div class="row"><label>Chiều cao</label><input id="bH" type="range" min="1.48" max="1.86" step="0.01" value="${look.height}"><output id="bHo">${Math.round(look.height * 100)} cm</output></div>
      <div class="row"><label>Khuôn mặt</label>${sg(FACES, look.face ?? 0, 'face')}</div>
      <div class="row"><label>Độ tuổi</label>${sg(AGES, look.age || 'teen', 'age')}</div>
      <div class="row"><label>Màu da</label>${sw(SKINS, look.skin, 'skin')}</div>
      <div class="row"><label>Kiểu tóc</label>${sg(HAIRS[look.gender], look.hair, 'hair')}</div>
      <div class="row"><label>Màu tóc</label>${sw(HAIR_COLORS, look.hairColor, 'hairColor')}</div>
      ${headRow()}
      ${hasGlasses ? `<div class="row"><label>Kính</label>${sg(GLASSES, look.glasses ?? 0, 'glasses')}</div>` : ''}
      ${wardrobeRows() ?? `<div class="row"><label>Trang phục</label>${sg(OUTFITS[look.gender].filter(([o]) => !/^class/.test(o) || hasClass), look.outfit, 'outfit')}</div>`}`;
    $('bH').addEventListener('input', (e) => { look.height = +e.target.value; $('bHo').textContent = Math.round(look.height * 100) + ' cm'; }); $('bH').addEventListener('change', () => player.setLook({ ...look }));
  }
  bEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const key = b.parentElement.dataset.key, v = b.dataset.k; look[key] = /^(gender|hair|outfit|age|top|bottom|shoes|topColor|bottomColor|shoesColor)$/.test(key) ? v : +v;
    if (key === 'top' || key === 'bottom' || key === 'shoes') delete look[key + 'Color'];
    if (key === 'gender') { delete look.head; for (const s of ['top', 'bottom', 'shoes']) { delete look[s]; delete look[s + 'Color']; } look.hair = HAIRS[v][0][0]; if (!OUTFITS[v].some(o => o[0] === look.outfit)) look.outfit = 'white'; look.height = v === 'f' ? Math.min(look.height, 1.62) : Math.max(look.height, 1.66); }
    fixWardrobe(); player.setLook({ ...look }); drawBuilder(); });
  drawBuilder();

  const api = {
    toast(msg, s = 3) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); toastT = s; },
    prompt(msg) { const p = $('prompt'); if (p.dataset.m === msg) return; p.dataset.m = msg; p.textContent = msg; p.classList.toggle('on', !!msg); },
    toggle(id, force) { const el = $(id), show = force ?? el.classList.contains('hidden'); for (const p of [panel, map]) p.classList.add('hidden'); el.classList.toggle('hidden', !show); if (show && document.pointerLockElement) document.exitPointerLock(); },
    showStart() { $('start').classList.remove('hidden'); $('hud').classList.remove('hidden'); player.st.builder = true; ctx.cam.cut(); },
    hideAll() { $('start').classList.add('hidden'); $('hud').classList.add('hidden'); player.st.started = true; },
    /** bật/tắt chế độ chụp ảnh; from = { pos, yaw, pitch } đặt sẵn máy ảnh (ảnh kỷ yếu), bỏ trống thì bắt đầu từ góc nhìn đang có */
    photo(from) {
      const st = player.st; if ((st.locked || !st.started) && !st.photo) return;      // đang hội thoại/tiết học (st.locked) hoặc còn ở màn tạo nhân vật thì không vào chế độ chụp ảnh
      st.photo = !st.photo; document.body.classList.toggle('photo', st.photo);
      if (st.photo) {
        api.toast('Chế độ chụp ảnh: WASD bay · Q/E xuống/lên · chuột xoay · phím 1–9 tạo dáng · G chụp cùng · L đèn · Enter lưu ảnh · P thoát', 6); pipeline.u.final.uDof.value = Math.max(pipeline.u.final.uDof.value, 0);
        // máy ảnh có vị trí và góc riêng: hướng nhìn của nhân vật (st.yaw/st.pitch) giữ nguyên suốt lúc chụp và sau khi thoát
        const f = ctx.cam.free; f.pos.copy(from ? from.pos : ctx.camera.position); f.yaw = from ? from.yaw : st.yaw; f.pitch = from ? from.pitch : st.pitch; f.fov = 0; showFov(ctx.cam.playFov);      // fov 0 = chưa tự kéo: theo góc nhìn lúc chơi (xoay màn hình vẫn đúng 78°/người chơi)
        ctx.cam.setMode('photo', camPhoto); ctx.cam.commit(0);
      }
      else { ctx.cam.clearMode('photo'); showFov(ctx.cam.userFov); if (pt && pt.isActive()) pt.stop(); setPose(null); setGroup(false); }
    },
  };
  $('go').addEventListener('click', () => { $('start').classList.add('hidden'); player.st.started = true; player.st.builder = false; ctx.cam.cut(); player.holder.rotation.y = player.st.yaw; if (ctx.audio) ctx.audio.start(); const c = pipeline.renderer.domElement; lockMouse(c); });
  $('bMenu').addEventListener('click', () => api.toggle('panel')); $('bMap').addEventListener('click', () => api.toggle('mapPanel')); $('bView').addEventListener('click', () => { if (!player.st.locked) player.st.fp = !player.st.fp; }); $('bPhoto').addEventListener('click', () => api.photo());
  // dáng chụp ảnh: thanh nút ở đáy màn hình (chỉ hiện trong chế độ chụp ảnh) + phím số
  const poseBar = document.createElement('div'); poseBar.id = 'poses'; document.body.appendChild(poseBar);
  let poseList = [], group = false;
  // đèn chân dung (đèn phụ của thợ ảnh): đặt cạnh máy ảnh, hơi cao và lệch trái, không đổ bóng; làm nổi khối mặt và tạo đốm sáng trong mắt
  const fill = new THREE.PointLight(0xfff0de, 0, 6, 1.5); ctx.scene.add(fill);
  let fillOn = true, fillK = 0;
  function setFill(on) { fillOn = on; const b = poseBar.querySelector('button[data-fill]'); if (b) b.classList.toggle('on', on); }
  function setPose(id) { player.setPose(id); for (const b of poseBar.querySelectorAll('button[data-pose]')) b.classList.toggle('on', b.dataset.pose === (id || '')); }
  function setGroup(on) { group = on; const k = ctx.people ? ctx.people.poseNear(on) : 0; const b = poseBar.querySelector('button[data-group]'); if (b) b.classList.toggle('on', on); return k; }
  function toggleGroup() { const k = setGroup(!group); if (group) api.toast(k ? k + ' người đứng gần cùng tạo dáng với bạn' : 'Không có ai đứng trong vòng 7 m quanh bạn hoặc máy ảnh để chụp cùng', 3); }
  poseNames().then((have) => {
    poseList = POSES.filter(([id]) => have.includes(id));
    const KEYS = '1234567890-=';
    poseBar.innerHTML = '<button data-pose="">~ Tự nhiên</button>' + poseList.map(([id, nm], i) => '<button data-pose="' + id + '">' + (KEYS[i] || '') + ' ' + nm + '</button>').join('') + '<button data-group="1">G Chụp cùng</button><button data-fill="1" class="on">L Đèn</button><button data-save="1">Enter Lưu ảnh</button>';
    poseBar.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; b.blur(); if (b.dataset.group) toggleGroup(); else if (b.dataset.fill) setFill(!fillOn); else if (b.dataset.save) save(); else setPose(b.dataset.pose || null); });
    if (!poseList.length) console.warn('[chụp ảnh] không có dáng tạo sẵn nào (thiếu assets/people/poses.glb?)');
  });
  const POSE_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
  addEventListener('keydown', (e) => {
    if (!player.st.photo || e.repeat || e.ctrlKey || e.altKey || e.metaKey || typing()) return;
    const i = POSE_CODES.indexOf(e.code);
    if (i >= 0 && poseList[i]) setPose(poseList[i][0]); else if (e.code === 'Backquote') setPose(null); else if (e.code === 'KeyG') toggleGroup(); else if (e.code === 'KeyL') setFill(!fillOn);
  });
  // máy quay bay tự do ở chế độ chụp ảnh
  const keys = {}, v = new THREE.Vector3(), d = new THREE.Vector3(), side = new THREE.Vector3();
  /** chế độ máy quay 'photo' của giàn (camrig.js): bay theo phím, chỉ điền tư thế vào out */
  function camPhoto(dt, out) {
    const f = ctx.cam.free, sp = (keys.ShiftLeft ? 14 : 4) * dt, cp = Math.cos(f.pitch); d.set(Math.sin(f.yaw) * cp, -Math.sin(f.pitch), Math.cos(f.yaw) * cp); v.set(0, 0, 0);
    if (keys.KeyW) v.add(d); if (keys.KeyS) v.sub(d); side.set(-d.z, 0, d.x).normalize(); if (keys.KeyD) v.add(side); if (keys.KeyA) v.sub(side); if (keys.KeyE) v.y += 1; if (keys.KeyQ) v.y -= 1;
    f.pos.addScaledVector(v, sp); f.pos.y = clamp(f.pos.y, 0.3, 120); out.pos.copy(f.pos); out.dir.copy(d); out.fov = f.fov;
  }
  // ảnh dò tia lũy tiến (thử nghiệm): nạp mô-đun khi cần vì thư viện nặng
  let pt = null, ptBusy = false;
  async function togglePT() {
    if (STYLE === 'pencil') { api.toast('Chế độ dò tia không dùng với kiểu vẽ chì màu — đổi sang Tả thực trong bảng Tab.', 5); return; }
    if (ptBusy) return; ptBusy = true;
    try {
      if (pt && pt.isActive()) { pt.stop(); api.toast('Đã tắt dò tia'); return; }
      api.toast('Đang dựng cảnh dò tia, màn hình sẽ đứng khoảng nửa phút…', 30);
      if (!pt) pt = (await import('./pathtrace.js')).createPathTracer(ctx);
      if (!pt.supported) { api.toast('Máy này không chạy được chế độ dò tia'); return; }
      await pt.start(); api.toast('Dò tia đang tích luỹ – giữ yên máy quay, càng lâu ảnh càng mịn. Enter lưu ảnh, R tắt', 8);
    } catch (e) { console.error(e); api.toast('Không bật được dò tia: ' + (e.message || e), 6); if (pt && pt.isActive()) pt.stop(); }
    finally { ptBusy = false; }
  }
  addEventListener('keydown', (e) => { if (typing()) return; keys[e.code] = true; if (e.code === 'Enter' && player.st.photo) save(); if (e.code === 'KeyR' && player.st.photo) togglePT(); }); addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });      // mất focus thì không nhận được keyup: nhả hết phím bay kẻo máy ảnh trôi mãi
  function save() { requestAnimationFrame(() => { try { if (pipeline.page) { const cap = ctx.reunion && ctx.reunion.mode === 'photo' ? document.querySelector('.rvCap:not(.hidden)') : null; pipeline.page.sign((cap && cap.textContent) || 'Thái Phiên · ngày trở về · ' + new Date().toLocaleDateString('vi-VN')); }      /* chữ ký: chú thích ảnh kỷ yếu (tên lớp – khoá) khi đang chụp cả lớp, còn lại là tên trường + ngày */ pipeline.render(0, sky.sun, sky.state.lightDir); const a = document.createElement('a'); a.href = pipeline.renderer.domElement.toDataURL('image/png'); a.download = 'thai-phien-' + Date.now() + '.png'; a.click(); api.toast('Đã lưu ảnh'); } catch (e) { console.error(e); api.toast('Không lưu được ảnh: ' + e.message); } finally { if (pipeline.page) pipeline.page.sign(null); } }); }
  function lockMouse(c) { if (!c.requestPointerLock || document.body.classList.contains('touch')) return; const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => api.toast('Chưa khoá được chuột – bấm vào màn hình để xoay góc nhìn')); }

  ctx.updaters.push((dt) => {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
    if (!panel.classList.contains('hidden')) { $('oHour').textContent = fmt(sky.state.hour); if (sky.state.speed) $('uHour').value = sky.state.hour; const f = Math.round(ctx.camera.fov) + '°', o = $('oFov'); if (o.textContent !== f) o.textContent = f; }      // số góc nhìn là số đang dùng thật (màn dọc nới lên 78°)
    // tên khu vực
    const p = player.pos, y = p.y - 0.77; let name = '';
    for (const k of ['A', 'B', 'C', 'P']) { const b = ctx.blocks[k]; for (const r of b.roomNames) { if (Math.abs(y - r.y) > 1.2) continue; const a = b.W(r.u1, -12), c = b.W(r.u2, -3.2); if (p.x > Math.min(a[0], c[0]) && p.x < Math.max(a[0], c[0]) && p.z > Math.min(a[1], c[1]) && p.z < Math.max(a[1], c[1])) name = `${k === 'P' ? 'Ban giám hiệu' : 'Nhà ' + k} · ${r.nm} · Tầng ${r.k + 1}`; } }
    if (!name) { if (y > 0.6 && y < 13) name = `Tầng ${Math.floor((y - 0.15) / 4.2 + 0.3) + 1}`; else if (p.z > 54.9) name = 'Đường Đà Nẵng'; else for (const z of ZONES) if (p.x > z[0] && p.x < z[1] && p.z > z[2] && p.z < z[3]) name = z[4]; }
    const w = $('where'); if (w.dataset.n !== name) { w.dataset.n = name; w.textContent = name ? '📍 ' + name : ''; }
    // đèn chân dung theo máy ảnh; mạnh hơn khi trời tối, tắt dần khi thoát chế độ chụp
    { const want = player.st.photo && fillOn ? 1 : 0; fillK += (want - fillK) * Math.min(1, dt * 6);
      if (fillK > 0.003) { const cam = ctx.camera; cam.getWorldDirection(d); fill.position.copy(cam.position).addScaledVector(v.set(-d.z, 0, d.x).normalize(), -0.7); fill.position.y += 0.45; fill.intensity = fillK * (2.2 + 5 * (ctx.sky.state.night || 0)); }
      else if (fill.intensity) fill.intensity = 0; }
  });
  ctx.ui = api;
}
