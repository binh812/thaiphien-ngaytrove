// Giao diện của "Ngày về": bảng chương trình, khung thoại, chữ nổi trên đầu nhân vật, màn mờ chuyển cảnh, thanh tiến độ, âm thanh tổng hợp.
// Mọi chữ đưa vào trang đều qua textContent (tên trong danh sách lớp do người chơi gõ, không được thành mã HTML).
import * as THREE from 'three';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/** người chơi đang gõ chữ (ô nhập, vùng soạn, hộp chọn) — KHÔNG tính thanh trượt, ô đánh dấu, nút: chúng giữ focus sau khi bấm nhưng không nhận chữ.
 *  MỘT hàm dùng chung cho mọi module của Ngày về và sân trường (cùng quy tắc với player.js). */
export const typing = () => { const a = document.activeElement; if (!a) return false; if (a.isContentEditable || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true; return a.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit|reset|color|file)$/.test(a.type); };
const MIN_READ = 0.28;      // giây tối thiểu một câu phải hiện trước khi nhận phím "tiếp" (khỏi lỡ tay bấm trôi hai câu)

/** tiếng vỗ tay, tiếng màn trập: tổng hợp bằng WebAudio (không có tệp âm thanh nào); trình duyệt chưa cho phát thì im lặng bỏ qua */
function makeSfx(allowed) {
  let ac = null, buf = null, warned = false;
  function ready() {
    if (!allowed()) return false;      // chưa bấm "Vào trường": chưa có cử chỉ người dùng, không tạo AudioContext
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { if (!warned) { warned = true; console.warn('[ngày về] trình duyệt không có WebAudio, bỏ tiếng vỗ tay'); } return false; }
      ac = new AC(); buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac.state === 'running';
  }
  function burst(when, dur, freq, vol) {
    const t = ac.currentTime + when, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.9; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t, Math.random() * 0.9); s.stop(t + dur + 0.02);
  }
  return {
    /** secs giây vỗ tay của khoảng people người, vol 0..1 */
    clap(secs = 2, people = 6, vol = 0.5) { if (vol < 0.02 || !ready()) return; const n = Math.round(secs * people * 3.2); for (let i = 0; i < n; i++) { const w = Math.random() * secs; burst(w, 0.035, 1500 + Math.random() * 1800, vol * 0.22 * Math.min(1, (secs - w) / (secs * 0.35))); } },
    /** tiếng "ting" hai nốt (nhặt kỷ niệm, ghi sổ) */
    ting(vol = 0.4) { if (!ready()) return; [[880, 0], [1318, 0.09]].forEach(([f, w]) => { const t = ac.currentTime + w, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(vol * 0.3, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.5); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.55); }); },
    /** gảy một hợp âm: freqs = tần số các dây (Hz), rải cách nhau 45 ms */
    chord(freqs, vol = 0.3) { if (vol < 0.02 || !ready()) return; freqs.forEach((f, i) => { const t = ac.currentTime + i * 0.045, o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(vol * 0.16, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 1.7); }); },
    /** một tiếng ngắn trượt từ tần số f0 tới f1 (Hz) trong dur giây — phản hồi cho các trò (campus_fx.js) */
    blip(f0, f1, dur = 0.1, vol = 0.25, type = 'triangle') { if (vol < 0.02 || !ready()) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); g.gain.setValueAtTime(vol * 0.3, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.05); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.08); },
    shutter(vol = 0.5) { if (vol < 0.02 || !ready()) return; burst(0, 0.03, 3200, vol * 0.5); burst(0.09, 0.05, 1800, vol * 0.4); },
  };
}

/** giao diện dùng chung cho mọi module (Ngày về, đời sống sân trường): chỉ dựng một lần */
export function getUI(ctx) { return ctx.rvUI || (ctx.rvUI = makeUI(ctx)); }

function makeUI(ctx) {
  const root = el('div'); root.id = 'rv'; document.body.appendChild(root);
  const stopEv = (node) => { for (const ev of ['mousedown', 'wheel', 'touchstart']) node.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); };

  /* ----- bảng chương trình ----- */
  const board = el('div', 'rvBoard hidden'), bTitle = el('h3'), bSub = el('div', 'rvSub'), bList = el('ol'), bFoot = el('div', 'rvFoot');
  const bEdit = el('button', null, 'Sửa danh sách lớp'), bReset = el('button', null, 'Làm lại từ đầu');
  const bNote = el('div', 'rvNote');
  bFoot.append(bEdit, bReset); board.append(bTitle, bSub, bList, bNote, bFoot); root.appendChild(board); stopEv(board);
  // màn hẹp (điện thoại dọc): bảng mặc định thu gọn còn một dòng (chặng hiện tại + khoảng cách), chạm để mở/thu
  const narrow = matchMedia('(max-width: 520px)'); if (narrow.matches) board.classList.add('mini');
  board.addEventListener('click', (e) => { if (e.target.closest('button')) return; if (narrow.matches || board.classList.contains('mini')) board.classList.toggle('mini'); });
  const rows = new Map();
  const boardApi = {
    el: board, onEdit: null, onReset: null,
    /** dòng phụ dưới danh sách chặng (bộ đếm kỷ niệm…) */
    note(text) { if (bNote.textContent !== text) bNote.textContent = text; },
    toggle(force) { const show = force ?? board.classList.contains('hidden'); board.classList.toggle('hidden', !show); return show; },
    /** stages: [{ id, nm, done, cur, dist }] — dist (m) hoặc null */
    render(title, sub, stages) {
      if (bTitle.textContent !== title) bTitle.textContent = title; if (bSub.textContent !== sub) bSub.textContent = sub;
      for (const s of stages) {
        let r = rows.get(s.id);
        if (!r) { r = { li: el('li'), nm: el('span', 'nm', s.nm), d: el('span', 'd') }; r.li.append(r.nm, r.d); bList.appendChild(r.li); rows.set(s.id, r); }
        r.li.className = s.done ? 'done' : s.cur ? 'cur' : '';
        const d = s.done ? '✓' : s.dist != null ? Math.round(s.dist) + ' m' : ''; if (r.d.textContent !== d) r.d.textContent = d;
      }
    },
  };
  bEdit.addEventListener('click', () => { bEdit.blur(); if (boardApi.onEdit) boardApi.onEdit(); });
  bReset.addEventListener('click', () => { bReset.blur(); if (boardApi.onReset) boardApi.onReset(); });

  /* ----- khung thoại ----- */
  const dlg = el('div', 'rvDlg hidden'), dName = el('div', 'who'), dText = el('div', 'txt'), dOpts = el('div', 'opts'), dHint = el('div', 'hint'), dSkip = el('button', 'skip', 'Bỏ qua tiết học');
  dlg.append(dName, dText, dOpts, dHint, dSkip); root.appendChild(dlg); stopEv(dlg);
  let pending = null, shownAt = 0, onSkip = null;      // pending = { n (số lựa chọn, 0 = chỉ bấm tiếp), done(i) }
  /** ô gõ tự do không được giữ focus khi khung đã trả lời xong hoặc bị ẩn (nếu không phím di chuyển sẽ bị coi là đang gõ) */
  function dropFocus() { const a = document.activeElement; if (a && dlg.contains(a) && a.blur) a.blur(); }
  function finish(i) { const p = pending; if (!p) return; pending = null; dropFocus(); p.done(i); }
  function show(name, text, opts, o) {
    if (pending) finish(null);      // còn cuộc thoại đang chờ: kết thúc gọn (bên gọi nhận null) rồi mới hiện cái mới, không đè lên
    dName.textContent = name || ''; dName.classList.toggle('hidden', !name); dText.textContent = text; dOpts.textContent = '';
    (opts || []).forEach((o, i) => { const b = el('button', null, `${i + 1}. ${o}`); b.addEventListener('click', () => { b.blur(); finish(i); }); dOpts.appendChild(b); });
    if (o && o.input) addInput(o.input);
    dHint.textContent = opts && opts.length ? 'Phím 1' + (opts.length > 1 ? '–' + opts.length : '') + ' hoặc bấm vào câu trả lời' : 'Enter / Space / bấm vào đây để tiếp';
    dlg.classList.remove('hidden'); shownAt = performance.now();
    if (opts && opts.length && document.pointerLockElement) document.exitPointerLock();      // có lựa chọn thì thả chuột ra để bấm được
    return new Promise((res) => { pending = { n: opts ? opts.length : 0, done: res }; });
  }
  /** ô "Nói gì đó…": gõ tự do (tuỳ chọn). Nội dung chỉ trả về cho bên gọi để khớp từ khoá, không lưu, không ghi log */
  function addInput(cfg) {
    const row = el('div', 'say'), inp = el('input'), send = el('button', null, cfg.send || 'Nói'); inp.type = 'text'; inp.maxLength = cfg.max || 80; inp.placeholder = cfg.placeholder || ''; inp.autocomplete = 'off'; inp.spellcheck = false;
    const go = () => { const v = inp.value.trim(); if (v) finish({ said: v }); };
    // Enter lúc bộ gõ tiếng Việt/tiếng Nhật còn đang soạn (isComposing, keyCode 229) là để chốt chữ, chưa phải gửi câu. keyup không chặn: người chơi nhả phím đi lại khi đang gõ thì player.js vẫn phải biết
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.isComposing || e.keyCode === 229) return; if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); go(); } else if (e.code === 'Escape') inp.blur(); });
    send.addEventListener('click', () => { send.blur(); go(); }); row.append(inp, send); dOpts.appendChild(row);
  }
  dlg.addEventListener('click', (e) => { if (e.target.closest('button') || e.target.closest('input')) return; if (pending && !pending.n && performance.now() - shownAt > MIN_READ * 1000) finish(0); });
  dSkip.addEventListener('click', () => { dSkip.blur(); if (onSkip) onSkip(); });
  addEventListener('keydown', (e) => {
    if (!pending || e.repeat || typing()) return;
    if (performance.now() - shownAt < MIN_READ * 1000) return;
    if (pending.n) { const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); if (m && +m[1] <= pending.n) { e.preventDefault(); e.stopImmediatePropagation(); finish(+m[1] - 1); } }
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); finish(0); }      // phím đã dùng để bấm tiếp: module đăng ký sau (bóng rổ, đá cầu) không nhận nữa
  });
  const dialog = {
    /** một câu thoại; trả về Promise xong khi người chơi bấm tiếp */
    say: (name, text) => show(name, text, null),
    /** câu hỏi có lựa chọn; trả về Promise<số thứ tự lựa chọn> */
    choose: (name, text, opts, o) => show(name, text, opts, o),      // o.input = { placeholder, send, max }: thêm ô gõ tự do, khi đó kết quả có thể là { said }
    /** đóng khung. Nếu đang có câu khác chờ người chơi (cuộc thoại mới vừa thay cuộc cũ, bên cũ dọn dẹp muộn) thì không đóng, trừ khi force */
    close(force) { if (pending && !force) return; dropFocus(); dlg.classList.add('hidden'); pending = null; },
    /** nút "Bỏ qua": fn = null thì ẩn nút */
    skippable(fn) { onSkip = fn; dSkip.classList.toggle('hidden', !fn); },
    get open() { return !dlg.classList.contains('hidden'); },
    /** đang chờ người chơi (để kịch bản thử tự bấm): số lựa chọn, 0 = chờ bấm tiếp, -1 = không chờ */
    get waiting() { return pending ? pending.n : -1; },
    answer(i) { finish(i); },
  };
  dialog.skippable(null);

  /* ----- tấm thẻ giữa màn hình (sổ đầu bài, màn kết) ----- */
  const card = el('div', 'rvCard hidden'), cBox = el('div', 'box'); card.appendChild(cBox); root.appendChild(card); stopEv(card);
  let cardDone = null;
  function showCard(title, sub, lines, btn) {
    cBox.textContent = ''; cBox.append(el('h2', null, title), el('div', 'rvSub', sub)); for (const l of lines) cBox.appendChild(el('p', null, l));
    const b = el('button', 'primary', btn); cBox.appendChild(b); card.classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock();
    return new Promise((res) => { cardDone = () => { cardDone = null; card.classList.add('hidden'); res(); }; b.addEventListener('click', () => cardDone && cardDone()); });
  }

  /* ----- màn mờ chuyển cảnh ----- */
  const fadeEl = el('div', 'rvFade'); root.appendChild(fadeEl);
  const FADE_MS = 450;
  const fade = (on) => new Promise((res) => { fadeEl.classList.toggle('on', on); setTimeout(res, FADE_MS); });

  /* ----- thanh tiến độ + chú thích ảnh ----- */
  const prog = el('div', 'rvProg hidden'), pLabel = el('span'), pBar = el('i'); { const bar = el('div', 'bar'); bar.appendChild(pBar); prog.append(pLabel, bar); } root.appendChild(prog);
  function progress(label, k) { prog.classList.toggle('hidden', k == null); if (k == null) return; if (pLabel.textContent !== label) pLabel.textContent = label; pBar.style.width = Math.round(Math.min(1, k) * 100) + '%'; }
  const cap = el('div', 'rvCap hidden'); root.appendChild(cap);
  function caption(text) { cap.classList.toggle('hidden', !text); cap.textContent = text || ''; }

  /* ----- chữ nổi trên đầu nhân vật ----- */
  const bubbles = [], v = new THREE.Vector3();
  /** at: Vector3 hoặc hàm trả về Vector3 (đỉnh đầu người nói); secs giây */
  function bubble(at, text, secs = 2.5, cls = '') { const e = el('div', 'rvBub ' + cls, text); root.appendChild(e); bubbles.push({ e, at, t: secs }); }
  const placed = [];      // các chữ nổi đã đặt trong khung hình này: [x, y] (px)
  function update(dt) {
    const cam = ctx.camera, W = innerWidth, H = innerHeight; placed.length = 0;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.t -= dt; if (b.t <= 0) { b.e.remove(); bubbles.splice(i, 1); continue; }
      v.copy(typeof b.at === 'function' ? b.at() : b.at); const dist = v.distanceTo(cam.position); v.project(cam);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && dist < 40;      // sau lưng máy quay hoặc quá xa thì ẩn
      b.e.style.display = on ? '' : 'none'; if (!on) continue;
      const x = (v.x + 1) / 2 * W; let y = (1 - v.y) / 2 * H;
      for (let k = 0; k < placed.length; k++) if (Math.abs(placed[k][0] - x) < 190 && Math.abs(placed[k][1] - y) < 34) { y = placed[k][1] - 36; k = -1; }      // đè lên chữ nổi khác thì đẩy lên trên một dòng
      placed.push([x, y]);
      b.e.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; b.e.style.opacity = Math.min(1, b.t * 3);
    }
  }

  return { board: boardApi, dialog, card: showCard, cardClose: () => cardDone && cardDone(), fade, progress, caption, bubble, update, sfx: makeSfx(() => !!(ctx.player && ctx.player.st.started)), root, el, stopEv };
}
