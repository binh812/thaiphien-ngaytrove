// Kiểm thử chơi nhiều người bằng hai trình duyệt Edge headless + máy chủ phòng chơi cục bộ (wrangler dev / miniflare).
// Dùng: node tools/net_test.mjs <thư mục ảnh> [--port=8789]
// Cần: máy chủ tĩnh ở http://127.0.0.1:8137 và đã `npm install` trong server/. Kịch bản tự bật/tắt wrangler dev ở cổng đã cho.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), outDir = args.find((a) => !a.startsWith('--')) || '.';
const PORT = Number((args.find((a) => a.startsWith('--port=')) || '--port=8789').slice(7));
const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');
const ROOM = 'thu' + Math.random().toString(36).slice(2, 8), WS = `ws://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') { results.push([name, !!ok]); console.log(`${ok ? 'ĐẠT ' : 'HỎNG'} · ${name}${detail ? ' · ' + detail : ''}`); }

/* ----- máy chủ phòng chơi ----- */
let srv = null;
async function startServer() {
  // mọi trình duyệt thử đều chung địa chỉ 127.0.0.1 → nới giới hạn kết nối cùng nguồn (mặc định 3) để thử được phòng đầy 16 người
  srv = spawn(`npx wrangler dev --port ${PORT} --ip 127.0.0.1 --var MAX_PER_IP:20`, { cwd: SERVER_DIR, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => { const t = String(d); if (/ERROR/.test(t)) console.log('  [wrangler]', t.trim().slice(0, 300)); });
  for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) return; } catch (e) { /* chưa lên */ } await sleep(500); }
  throw new Error('wrangler dev không lên sau 45 giây');
}
function stopServer() { if (!srv) return; try { execSync(`taskkill /pid ${srv.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { console.log('  không dừng được wrangler:', e.message); } srv = null; }

/* ----- trình duyệt ----- */
const launch = () => puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-extensions', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  defaultViewport: { width: 1280, height: 720 },
});
async function openGame(browser, tag, query) {
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || (m.type() === 'warn' && /mạng|người/.test(t))) console.log(`  [${tag}] ${m.type()}: ${t.slice(0, 300)}`); });
  page.on('pageerror', (e) => console.log(`  [${tag}] LỖI TRANG:`, String(e).slice(0, 500)));
  await page.goto(`http://127.0.0.1:8137/?q=low&${query}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true || /Lỗi/.test(document.getElementById("loadMsg").textContent)', { timeout: 180000 });
  return page;
}
const online = (page, timeout = 20000) => page.waitForFunction('window.__tp.net && window.__tp.net.status() === "online"', { timeout });
const peers = (page) => page.evaluate('window.__tp.net.remotes.list()');
const lines = (page) => page.evaluate('window.__tp.net.chat.lines()');
const waitFor = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(150); } };
async function say(page, text) { await page.keyboard.press('Enter'); await page.waitForFunction('window.__tp.net.chat.isOpen()', { timeout: 3000 }); await page.keyboard.type(text); await page.keyboard.press('Enter'); }
/** mở một WebSocket thô từ trong trang (để có Origin hợp lệ), gửi các thông điệp, trả về mã đóng và những gì nhận được */
const rawSocket = (page, room, sends, holdMs = 1500) => page.evaluate(async (url, sends, holdMs) => new Promise((resolve) => {
  const got = [], ws = new WebSocket(url); let code = null;
  ws.onmessage = (e) => got.push(String(e.data).slice(0, 200)); ws.onclose = (e) => { code = e.code; };
  ws.onopen = () => { for (const s of sends) { try { ws.send(s); } catch (e) { break; } } };
  setTimeout(() => { const c = code; try { ws.close(); } catch (e) { /* đã đóng */ } resolve({ code: c, got }); }, holdMs);
}), `${WS}/ws?room=${room}`, sends, holdMs);

let bA = null, bB = null;
try {
  await startServer(); console.log('máy chủ phòng chơi: cổng', PORT, '· phòng', ROOM);

  /* --- 0. Worker từ chối đúng --- */
  { const r = await fetch(`http://127.0.0.1:${PORT}/ws?room=${ROOM}`); check('đường /ws không nâng cấp WebSocket → 426', r.status === 426, 'mã ' + r.status); }
  { let failed = false; try { await new Promise((res, rej) => { const w = new WebSocket(`${WS}/ws?room=${ROOM}`); w.onopen = () => { w.close(); res(); }; w.onerror = () => rej(new Error('từ chối')); }); } catch (e) { failed = true; } check('kết nối không có Origin hợp lệ (từ node) bị từ chối', failed); }

  bA = await launch(); bB = await launch();
  const q = (name) => `ui=0&net=${encodeURIComponent(WS)}&room=${ROOM}&name=${encodeURIComponent(name)}`;
  const [A, B] = await Promise.all([openGame(bA, 'A', q('An')), openGame(bB, 'B', q('Bình 12A1'))]);
  await Promise.all([online(A), online(B)]);
  for (const p of [A, B]) await p.evaluate('document.getElementById("hud").classList.remove("hidden")');      // ?ui=0 ẩn HUD; bật lại để chụp chỉ báo trạng thái

  /* --- 1. thấy nhau --- */
  const seenB = await waitFor(async () => { const l = await peers(A); return l.length === 1 && l[0].pos && l[0].mode === 'full' ? l[0] : null; }, 8000);
  check('A thấy B trong phòng, có tên và nhân vật dựng đầy đủ', seenB && seenB.name === 'Bình 12A1', JSON.stringify(seenB));
  check('chỉ báo trạng thái của A ghi 2 người', /2 người/.test(await A.evaluate('document.getElementById("netStat").textContent')), await A.evaluate('document.getElementById("netStat").textContent'));

  /* --- 2. B di chuyển, A thấy vị trí đổi theo --- */
  await B.evaluate('(() => { const p = window.__tp.player, h = p.holder.position; p.teleport(h.x + 0.9, h.y, h.z - 1.6, Math.PI); })()');
  await sleep(800);
  const before = (await peers(A))[0].pos;
  await B.bringToFront(); await B.keyboard.down('KeyW'); await sleep(1600); await B.keyboard.up('KeyW'); await sleep(900);
  const after = (await peers(A))[0].pos, real = await B.evaluate('(() => { const h = window.__tp.player.holder.position; return { x: h.x, y: h.y, z: h.z }; })()');
  const moved = Math.hypot(after.x - before.x, after.z - before.z), err = Math.hypot(after.x - real.x, after.z - real.z);
  check('B đi bộ 1,6 giây → A thấy B dời chỗ', moved > 1, `dời ${moved.toFixed(2)} m`);
  check('vị trí B trên máy A khớp vị trí thật của B (lệch < 0,15 m sau khi dừng)', err < 0.15, `lệch ${err.toFixed(3)} m`);

  /* --- 3. chat hai chiều --- */
  await A.bringToFront(); await say(A, 'Chào cả lớp, ra cột cờ chụp ảnh nhé!');
  const gotB = await waitFor(async () => (await lines(B)).find((l) => l.includes('ra cột cờ')));
  check('A nhắn → B nhận trong khung chat', gotB && gotB.startsWith('An: Chào cả lớp'), gotB || '');
  const bubB = (await B.evaluate('window.__tp.net.remotes.list()'))[0];
  check('chữ nổi trên đầu A (trên máy B)', bubB && bubB.bubble && bubB.bubble.includes('ra cột cờ'), bubB && bubB.bubble);
  await A.screenshot({ path: path.join(outDir, 'net_1_A_sau_khi_nhan.png') });
  await sleep(1100);
  await B.bringToFront(); await say(B, 'Tới ngay đây');
  const gotA = await waitFor(async () => (await lines(A)).find((l) => l.includes('Tới ngay đây')));
  check('B nhắn → A nhận', gotA && gotA.startsWith('Bình 12A1: Tới ngay đây'), gotA || '');
  await sleep(400); await A.bringToFront(); await sleep(300);
  await A.screenshot({ path: path.join(outDir, 'net_2_A_bang_ten_chu_noi.png') });

  /* --- 4. lọc từ tục + cắt tin dài (gửi thẳng qua kết nối, bỏ qua giới hạn 120 ký tự của ô nhập) --- */
  await sleep(1100);
  await B.evaluate('window.__tp.net.net.send({ t: "chat", m: "địt mẹ vcl thật, fuck" })');
  const cens = await waitFor(async () => (await lines(A)).find((l) => l.includes('thật,')));
  check('từ tục bị thay bằng *** ở máy chủ', cens && cens.includes('*** mẹ *** thật, ***') && !/địt|vcl|fuck/.test(cens), cens || '');
  await sleep(1100);
  await B.evaluate('window.__tp.net.net.send({ t: "chat", m: "dài".repeat(200) })');
  const long = await waitFor(async () => (await lines(A)).find((l) => l.includes('dàidàidài')));
  const longLen = long ? Array.from(long.replace(/^Bình 12A1: /, '').replace(/Ẩn$/, '')).length : -1;
  check('tin 600 ký tự bị cắt còn 120', longLen === 120, 'độ dài ' + longLen);
  await B.evaluate('window.__tp.net.net.send({ t: "chat", m: "<img src=x onerror=window.__xss=1><b>đậm</b>" })').catch(() => {});
  await sleep(1300);
  await B.evaluate('window.__tp.net.net.send({ t: "chat", m: "<img src=x onerror=window.__xss=1><b>đậm</b>" })');
  const html = await waitFor(async () => (await lines(A)).find((l) => l.includes('<img')));
  check('thẻ HTML trong tin hiện thành chữ, không chạy', !!html && (await A.evaluate('window.__xss === undefined && document.querySelectorAll("#chat img, #netLayer img").length === 0')), html || '');

  /* --- 5. gửi chat dồn dập --- */
  await sleep(10500);      // cho cửa sổ 10 giây trôi qua để đếm cho sạch
  const n0 = (await lines(B)).length;
  await A.evaluate('(() => { for (let i = 0; i < 12; i++) window.__tp.net.net.send({ t: "chat", m: "dồn " + i }); })()');
  await sleep(1500);
  const burst = (await lines(B)).slice(n0).filter((l) => l.includes('dồn ')).length, warned = (await lines(A)).some((l) => l.includes('nhắn nhanh quá'));
  check('12 tin gửi cùng lúc: chỉ 1 tin tới B, A được nhắc chậm lại', burst === 1 && warned, `B nhận ${burst}`);
  const n1 = (await lines(B)).length;
  await A.evaluate('(async () => { for (let i = 0; i < 9; i++) { window.__tp.net.net.send({ t: "chat", m: "nhịp " + i }); await new Promise(r => setTimeout(r, 1050)); } })()');
  await sleep(500);
  const paced = (await lines(B)).slice(n1).filter((l) => l.includes('nhịp ')).length;
  check('9 tin cách nhau 1,05 giây: không quá 5 tin lọt trong 10 giây', paced >= 3 && paced <= 5, `B nhận ${paced}`);
  check('A và B vẫn còn trong phòng sau khi bị giới hạn chat', (await A.evaluate('window.__tp.net.status()')) === 'online' && (await peers(A)).length === 1);

  /* --- 6. kết nối gửi rác / gửi dồn dập bị ngắt --- */
  const junk = await rawSocket(A, ROOM, ['không phải json', '{"t":"admin"}', '[1,2,3]', '{"t":"s","p":[0,0,0],"r":0,"v":0}', 'x'.repeat(5000)]);
  check('5 thông điệp rác → máy chủ ngắt (mã 4002)', junk.code === 4002, 'mã ' + junk.code);
  const hello = JSON.stringify({ t: 'hello', v: 1, name: 'Kẻ phá', look: { gender: 'm' } });
  const flood = await rawSocket(A, ROOM, [hello, ...Array.from({ length: 300 }, (_, i) => JSON.stringify({ t: 's', p: [i, 0, 0], r: 0, v: 1 }))]);
  check('300 thông điệp trong một nhịp → máy chủ ngắt (mã 4008)', flood.code === 4008, 'mã ' + flood.code);
  const far = await rawSocket(A, ROOM, [hello, JSON.stringify({ t: 's', p: [99999, -99999, 5], r: 0, v: 500, o: '<b>' })], 900);
  const ghost = await waitFor(async () => (await lines(B)).some((l) => l.includes('Kẻ phá đã rời phòng')), 4000);
  check('người lạ vào rồi rời: B được báo, không còn bóng ma', ghost && (await peers(B)).length === 1, JSON.stringify(far.got.slice(0, 1)).slice(0, 120));

  /* --- 7. toạ độ ngoài bản đồ bị kẹp --- */
  const clampP = A.evaluate(async (url, hello) => new Promise((resolve) => {
    const ws = new WebSocket(url); ws.onopen = () => { ws.send(hello); ws.send(JSON.stringify({ t: 's', p: [99999, -99999, 5], r: 0, v: 500, o: '<b>' })); };
    setTimeout(() => { const l = window.__tp.net.remotes.list().find((r) => r.name === 'Kẻ phá'); ws.close(); resolve(l || null); }, 1200);
  }), `${WS}/ws?room=${ROOM}`, hello);
  const cl = await clampP;
  check('toạ độ 99999 bị máy chủ kẹp về mép bản đồ, dáng lạ bị bỏ', cl && cl.pos && cl.pos.x === 130 && cl.pos.y === -6 && !cl.pose, JSON.stringify(cl && cl.pos));
  await sleep(600);
  // clip không có trong mô hình + clip trùng tên thuộc tính Object: nhân vật của kẻ gửi vẫn hoạt hoạ bình thường trên máy A, không lỗi
  const errsBefore = await A.evaluate('window.__errs = window.__errs || []; (window.__errHooked || (window.__errHooked = (() => { const e = console.error; console.error = (...a) => { window.__errs.push(String(a[0])); e.apply(console, a); }; return true; })())); window.__errs.length');
  const odd = await A.evaluate(async (url, hello) => new Promise((resolve) => {
    const h = window.__tp.player.holder.position, ws = new WebSocket(url);
    ws.onopen = () => { ws.send(hello); ws.send(JSON.stringify({ t: 's', p: [h.x + 1, h.y, h.z - 2], r: 0, v: 0, c: 'no_such_clip', o: 'peace' })); setTimeout(() => ws.send(JSON.stringify({ t: 's', p: [h.x + 1, h.y, h.z - 2.01], r: 0, v: 0, c: 'constructor', o: 'toString' })), 1200); };
    setTimeout(() => { const l = window.__tp.net.remotes.list().find((r) => r.name === 'Kẻ phá'); ws.close(); resolve(l || null); }, 3200);
  }), `${WS}/ws?room=${ROOM}`, hello);
  const errsAfter = await A.evaluate('window.__errs.length');
  check('clip lạ / "constructor" / "toString": nhân vật vẫn dựng đầy đủ, không hỏng hoạt hoạ, không console.error', odd && odd.mode === 'full' && odd.broken === false && odd.clip === null && errsAfter === errsBefore, JSON.stringify(odd && { mode: odd.mode, broken: odd.broken, clip: odd.clip, shown: odd.shown }) + ` · lỗi mới: ${errsAfter - errsBefore}`);
  await sleep(600);

  /* --- 8. phòng đầy --- */
  const full = await A.evaluate(async (url, hello) => {
    const socks = [], codes = [];
    for (let i = 0; i < 16; i++) { const ws = new WebSocket(url); socks.push(ws); await new Promise((r) => { ws.onopen = r; ws.onerror = r; }); ws.send(hello); }
    const last = await new Promise((resolve) => { const ws = new WebSocket(url), got = []; ws.onmessage = (e) => got.push(e.data); ws.onclose = (e) => resolve({ code: e.code, got }); setTimeout(() => resolve({ code: 'không đóng', got }), 3000); });
    for (const ws of socks) ws.close();
    return last;
  }, `${WS}/ws?room=${ROOM}-day`, hello);
  check('người thứ 17 được báo phòng đầy rồi đóng (mã 4001)', full.code === 4001 && /"full"/.test(full.got.join('')), `mã ${full.code} · ${full.got.join('').slice(0, 60)}`);

  /* --- 9. vẫy tay + dáng chụp ảnh chung --- */
  await B.evaluate('(() => { const a = window.__tp.player; window.__tp.net.wave(); })()');
  const wav = await waitFor(async () => { const l = (await peers(A))[0]; return l && (l.pose === 'wave' || l.bubble === '👋') ? l : null; }, 3000);
  check('B vẫy tay → A thấy', !!wav, wav ? `dáng ${wav.pose} · chữ nổi ${wav.bubble}` : '');
  await sleep(3200);
  // B đứng cạnh A rồi tạo dáng "chữ V" trong chế độ chụp ảnh của B; A vào chế độ chụp ảnh và chụp chung
  const posA = await A.evaluate('(() => { const h = window.__tp.player.holder.position; return { x: h.x, y: h.y, z: h.z }; })()');
  await B.evaluate((p) => { const t = window.__tp; t.player.teleport(p.x + 0.8, p.y, p.z, Math.PI); t.ui.photo(); t.player.setPose('peace'); }, posA);
  const posed = await waitFor(async () => { const l = (await peers(A))[0]; return l && l.pose === 'peace' ? l : null; }, 4000);
  check('B chọn dáng "chữ V" → A thấy đúng dáng đó', !!posed, posed ? posed.pose : '');
  // máy ảnh đặt qua ui.photo({pos,yaw,pitch}): giàn máy quay (ctx.cam) là nơi duy nhất ghi camera, gán tay sẽ bị ghi đè
  await A.evaluate('(() => { const t = window.__tp, h = t.player.holder.position; t.ui.photo({ pos: { x: h.x + 0.4, y: h.y + 1.45, z: h.z - 3.1 }, yaw: 0, pitch: 0.1 }); t.player.setPose("heart"); })()');
  await sleep(2500);
  { const c = await A.evaluate('(() => { const t = window.__tp, h = t.player.holder.position, c = t.camera, d = c.getWorldDirection(c.position.clone()); return { photo: t.player.st.photo, off: Math.hypot(c.position.x - (h.x + 0.4), c.position.y - (h.y + 1.45), c.position.z - (h.z - 3.1)), dir: [d.x, d.y, d.z] }; })()');
    check('máy ảnh chụp chung đứng đúng chỗ đặt (lệch < 0,02 m) và nhìn về phía hai người (yaw 0, pitch 0,1)', c.photo && c.off < 0.02 && Math.abs(c.dir[0]) < 0.01 && Math.abs(c.dir[1] + Math.sin(0.1)) < 0.01 && c.dir[2] > 0.99, `lệch ${c.off.toFixed(3)} m · hướng ${c.dir.map(v => v.toFixed(3)).join(', ')}`); }
  await A.screenshot({ path: path.join(outDir, 'net_3_A_chup_anh_chung.png') });
  check('ở chế độ chụp ảnh, bảng tên và khung chat ẩn đi', await A.evaluate('getComputedStyle(document.getElementById("netLayer")).display === "none" && getComputedStyle(document.getElementById("chat")).display === "none"'));
  await A.evaluate('window.__tp.ui.photo()'); await B.evaluate('window.__tp.ui.photo()'); await sleep(600);

  /* --- 10. khung chat mở + ẩn một người --- */
  await A.bringToFront(); await A.keyboard.press('Enter'); await sleep(500);
  await A.screenshot({ path: path.join(outDir, 'net_4_A_khung_chat_mo.png') });
  await A.evaluate('document.querySelector("#chat .chatRoster button").click()'); await sleep(900);
  await B.evaluate('window.__tp.net.net.send({ t: "chat", m: "tin sau khi bị ẩn" })'); await sleep(900);
  const hid = await peers(A), hidLines = await lines(A);
  check('A ẩn B: nhân vật B không còn được vẽ, tin mới của B không hiện, tin cũ của B bị gỡ', hid[0].mode === 'off' && !hidLines.some((l) => l.includes('tin sau khi bị ẩn') || l.startsWith('Bình 12A1:')), `mode ${hid[0].mode}`);
  // B nối lại (mã phiên mới): vẫn bị ẩn theo tên hiển thị
  const oldId = hid[0].id;
  await A.evaluate('window.__tp.net.chat.system("— mốc nối lại —")');      // chỉ xét các dòng xuất hiện sau mốc này
  await B.evaluate('window.__tp.net.net.open()'); await online(B); await sleep(1500);
  await B.evaluate('window.__tp.net.net.send({ t: "chat", m: "tin sau khi nối lại" })'); await sleep(900);
  const re = await peers(A), allLines = await lines(A), reLines = allLines.slice(allLines.lastIndexOf('— mốc nối lại —') + 1);
  check('B nối lại với mã phiên mới vẫn bị ẩn (ẩn theo tên)', re.length === 1 && re[0].id !== oldId && re[0].mode === 'off' && !reLines.some((l) => l.includes('tin sau khi nối lại') || l.includes('Bình 12A1 vừa vào')), `mã cũ ${oldId} → mới ${re[0] && re[0].id} · mode ${re[0] && re[0].mode} · dòng mới: ${JSON.stringify(reLines)}`);
  await A.evaluate('document.querySelector("#chat .chatRoster button").click()'); await sleep(900);
  check('A hiện lại B', (await peers(A))[0].mode === 'full');
  await A.keyboard.press('Escape'); await sleep(300);
  check('Esc đóng khung chat', !(await A.evaluate('window.__tp.net.chat.isOpen()')));
  // đang giữ W mà mở chat: nhân vật phải dừng; nhả W trong lúc gõ rồi đóng chat: không tự đi tiếp
  await A.evaluate('window.__tp.player.st.yaw = 0');      // quay ra phía đường trống (trước đây bước chụp ảnh chung để lại yaw = 0; nay chế độ ảnh không đổi hướng nhìn của nhân vật)
  await A.bringToFront(); await A.keyboard.down('KeyW'); await sleep(700);
  const vWalk = await A.evaluate('window.__tp.player.st.speed');
  await A.keyboard.press('Enter'); await sleep(700);
  const vTyping = await A.evaluate('window.__tp.player.st.speed');
  await A.keyboard.up('KeyW'); await A.keyboard.type('w'); await A.keyboard.press('Escape'); await sleep(700);
  const p1 = await A.evaluate('(() => { const p = window.__tp.player; return { v: p.st.speed, x: p.pos.x, z: p.pos.z }; })()'); await sleep(600);
  const p2 = await A.evaluate('(() => { const p = window.__tp.player; return { v: p.st.speed, x: p.pos.x, z: p.pos.z }; })()');
  check('giữ W rồi mở chat: nhân vật dừng; nhả W lúc đang gõ, đóng chat: không tự đi', vWalk > 1 && vTyping < 0.2 && p2.v < 0.2 && Math.hypot(p2.x - p1.x, p2.z - p1.z) < 0.05, `đang đi ${vWalk.toFixed(2)} → lúc gõ ${vTyping.toFixed(2)} → sau khi đóng ${p2.v.toFixed(2)} m/s`);

  /* --- 11. B rời phòng --- */
  await bB.close(); bB = null;
  const left = await waitFor(async () => (await peers(A)).length === 0, 6000);
  check('B đóng trang → biến mất khỏi máy A, có dòng báo rời phòng', left && (await lines(A)).some((l) => l.includes('Bình 12A1 đã rời phòng')), await A.evaluate('document.getElementById("netStat").textContent'));

  /* --- 12. tắt máy chủ: trò chơi vẫn chạy; bật lại: tự nối lại --- */
  stopServer();
  const off = await waitFor(async () => (await A.evaluate('window.__tp.net.status()')) !== 'online', 8000);
  await sleep(1500);
  const f0 = await A.evaluate('window.__tp.pipeline.renderer.info.render.frame'); await sleep(1000);
  const f1 = await A.evaluate('window.__tp.pipeline.renderer.info.render.frame'), alive = await A.evaluate('document.getElementById("loading").classList.contains("hidden")');
  check('tắt máy chủ → A báo mất kết nối, trò chơi vẫn vẽ bình thường', off && f1 > f0 + 5 && alive, `${f1 - f0} khung hình/giây · ${await A.evaluate('document.getElementById("netStat").textContent')}`);
  await A.screenshot({ path: path.join(outDir, 'net_5_A_mat_ket_noi.png') });
  await startServer();
  let back = true; try { await online(A, 45000); } catch (e) { back = false; }
  check('bật lại máy chủ → A tự nối lại (lùi dần)', back, await A.evaluate('document.getElementById("netStat").textContent'));

  /* --- 13. màn bắt đầu có mục "Chơi cùng bạn bè"; không cấu hình máy chủ thì không có gì --- */
  // trước khi trang chạy: đặt sẵn một danh sách lớp có tên "bí mật" và ghi lại mọi thứ trang gửi qua WebSocket
  const S = await bA.newPage();
  await S.evaluateOnNewDocument(() => {
    localStorage.setItem('tp2_class', JSON.stringify({ me: 'Hạnh lớp phó', cls: '12A7', year: '1998 – 2001', list: 'BiMatMot, nam, lớp trưởng\nBiMatHai, nữ' }));
    window.__sent = []; const send = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { window.__sent.push(String(d)); return send.call(this, d); };
  });
  S.on('pageerror', (e) => console.log('  [S] LỖI TRANG:', String(e).slice(0, 500)));
  await S.goto(`http://127.0.0.1:8137/?q=low&net=${encodeURIComponent(WS)}&room=k7m2qx`, { waitUntil: 'load' });
  await S.waitForFunction('window.__ready === true', { timeout: 180000 });
  await sleep(1200);
  check('màn bắt đầu: có mục Chơi cùng bạn bè, mã phòng lấy từ ?room=', await S.evaluate('!!document.getElementById("netBox") && document.querySelector("#netBox input").value === "k7m2qx" && document.querySelector("#netBox .seg button.on").textContent === "Mã phòng"'));
  await S.evaluate('document.getElementById("netBox").scrollIntoView({ block: "center" })'); await sleep(300);
  await S.screenshot({ path: path.join(outDir, 'net_6_man_bat_dau.png') });
  await S.evaluate('document.getElementById("go").click()');
  let viaUi = true; try { await online(S, 15000); } catch (e) { viaUi = false; }
  await sleep(1500);
  check('bấm "Vào trường" với Mã phòng → vào đúng phòng', viaUi && (await S.evaluate('window.__tp.net.net.room()')) === 'k7m2qx');
  await S.keyboard.down('KeyW'); await sleep(700); await S.keyboard.up('KeyW'); await S.evaluate('window.__tp.net.wave()'); await sleep(500);
  const frames = await S.evaluate('window.__sent'), helloMsg = JSON.parse(frames.find((f) => f.includes('"hello"')) || '{}'), all = frames.join('\n');
  const LOOK_KEYS = ['gender', 'skin', 'hair', 'hairColor', 'outfit', 'height', 'build', 'face', 'age', 'head', 'glasses', 'top', 'bottom', 'shoes', 'topColor', 'bottomColor', 'shoesColor'];
  const kinds = [...new Set(frames.map((f) => { try { return JSON.parse(f).t; } catch (e) { return f; } }))];
  check('riêng tư: lời chào chỉ có tên hiển thị + ngoại hình; không khung nào chứa danh sách lớp, tên lớp, khoá',
    helloMsg.name === 'Hạnh lớp phó' && Object.keys(helloMsg).sort().join() === 'look,name,t,v' && Object.keys(helloMsg.look).every((k) => LOOK_KEYS.includes(k)) && !/BiMat|12A7|1998|lớp trưởng/.test(all) && kinds.every((k) => ['hello', 's', 'emote', 'chat', 'ping'].includes(k)),
    `${frames.length} khung · loại: ${kinds.join(', ')} · hello: ${JSON.stringify(helloMsg).slice(0, 200)}`);
  await S.screenshot({ path: path.join(outDir, 'net_7_sau_khi_vao_phong.png') });
  // giao kèo phím H: có ctx.campus.wave thì mô-đun mạng không tự bắt H; nút 👋 gọi campus.wave, campus gọi ctx.onWave → đúng một cái vẫy gửi đi
  await sleep(2600);
  const emotes = () => S.evaluate('window.__sent.filter((f) => f.includes("emote")).length');
  // Mô-đun sân trường (campus_daily.js) tự bắt phím H bằng listener riêng và gọi ctx.onWave → thử trên hàm THẬT của nó:
  // gỡ ctx.campus.wave đi thì listener kia vẫn còn, nên ca "không có campus.wave" không dựng được trong trang đầy đủ.
  const hasCampus = await S.evaluate('!!(window.__tp.campus && typeof window.__tp.campus.wave === "function")');
  const e0 = await emotes();
  await S.keyboard.press('KeyH'); await sleep(300);      // phím H: sân trường vẫy, mô-đun mạng KHÔNG tự bắt thêm → đúng 1 lần gửi
  const e1 = await emotes();
  await sleep(2200);
  await S.evaluate('window.__tp.net.waveButton()'); await sleep(300);      // nút 👋 đi qua campus.wave → đúng 1 lần gửi
  const e2 = await emotes();
  await sleep(2200);
  await S.evaluate('window.__cw = 0; window.__tp.campus.wave = () => { window.__cw++; }; window.__tp.net.waveButton()'); await sleep(300);      // campus quên gọi ctx.onWave: nút vẫn gửi
  const e3 = await emotes(), cw = await S.evaluate('window.__cw');
  check('phím H qua hàm vẫy thật của sân trường gửi đúng 1 lần (không gửi đôi); nút 👋 gửi đúng 1 lần; campus quên gọi onWave thì nút vẫn gửi',
    hasCampus && e1 - e0 === 1 && e2 - e1 === 1 && cw === 1 && e3 - e2 === 1 && Array.isArray(await S.evaluate('window.__tp.onWave')), `có campus.wave: ${hasCampus} · gửi: ${e1 - e0}, ${e2 - e1}, ${e3 - e2} · campus.wave giả gọi ${cw} lần`);
  // liên kết mời không bao giờ mang tham số net
  let invite = '';
  S.on('dialog', async (d) => { invite = d.defaultValue() || d.message(); await d.accept(); });
  await bA.defaultBrowserContext().overridePermissions('http://127.0.0.1:8137', ['clipboard-read', 'clipboard-write']).catch(() => {});
  await S.evaluate('document.querySelector("#netBox .row button:last-child").click()'); await sleep(600);
  if (!invite) invite = await S.evaluate('navigator.clipboard.readText()').catch(() => '');
  check('liên kết mời chỉ có ?room=, không chép ?net=', /\?room=k7m2qx$/.test(invite) && !/net=/.test(invite), invite);
  // quay lại từ bfcache: pagehide đóng kết nối, pageshow(persisted) nối lại
  await S.evaluate('window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))'); await sleep(400);
  const hiddenState = await S.evaluate('window.__tp.net.status()');
  await S.evaluate('window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))');
  let reshow = true; try { await online(S, 8000); } catch (e) { reshow = false; }
  check('pagehide đóng kết nối; pageshow từ bfcache nối lại', hiddenState === 'closed' && reshow, `${hiddenState} → ${await S.evaluate('window.__tp.net.status()')}`);
  await S.close();
  // ?net= trỏ ra ngoài (kể cả *.workers.dev) bị bỏ qua hoàn toàn, ?ui=0 không tự vào phòng nào
  for (const evil of ['wss://evil.workers.dev', 'wss://example.com', 'ws://192.168.1.9:8788']) {
    const E = await openGame(bA, 'E', `ui=0&net=${encodeURIComponent(evil)}&room=k7m2qx`);
    await sleep(800);
    const st = await E.evaluate('({ net: window.__tp.net === undefined, box: !document.getElementById("netBox"), chat: !document.getElementById("chat") })');
    check(`?net=${evil} bị bỏ qua: không kết nối, không giao diện mạng`, st.net && st.box && st.chat, JSON.stringify(st));
    await E.close();
  }
  // màn hình cảm ứng (điện thoại nằm ngang): nút chat/vẫy tay trên thanh công cụ, khung chat mở bằng chạm
  const T = await bA.newPage(); await T.setViewport({ width: 844, height: 390, hasTouch: true, isMobile: true });
  await T.goto(`http://127.0.0.1:8137/?q=low&ui=0&net=${encodeURIComponent(WS)}&room=k7m2qx&name=${encodeURIComponent('Máy cảm ứng')}`, { waitUntil: 'load' });
  await T.waitForFunction('window.__ready === true', { timeout: 180000 }); await online(T);
  await T.evaluate('document.getElementById("hud").classList.remove("hidden")');
  await T.tap('#bChat'); await sleep(500);
  const touchOpen = await T.evaluate('document.body.classList.contains("touch") && window.__tp.net.chat.isOpen() && document.activeElement === document.querySelector("#chat input")');
  await T.type('#chat input', 'nhắn từ điện thoại'); await T.tap('#chat .chatRow button'); await sleep(900);
  check('cảm ứng: chạm nút 💬 mở khung chat, chạm Gửi thì tin đi', touchOpen && (await lines(T)).some((l) => l.includes('nhắn từ điện thoại')));
  await T.screenshot({ path: path.join(outDir, 'net_8_cam_ung.png') });
  await T.close();
  const solo = await openGame(bA, 'solo', 'ui=0');
  const sent = await solo.evaluate('({ net: window.__tp.net === undefined, box: !document.getElementById("netBox"), chat: !document.getElementById("chat"), ws: performance.getEntriesByType("resource").filter((r) => /:87\\d\\d/.test(r.name)).length })');
  check('không cấu hình máy chủ: không giao diện mạng, không kết nối nào', sent.net && sent.box && sent.chat && sent.ws === 0, JSON.stringify(sent));
  await solo.close();
} catch (e) {
  check('kịch bản chạy hết không lỗi', false, String(e && e.stack ? e.stack : e).slice(0, 600));
} finally {
  if (bA) await bA.close().catch(() => {}); if (bB) await bB.close().catch(() => {});
  stopServer();
}
const bad = results.filter((r) => !r[1]);
console.log(`\n${results.length - bad.length}/${results.length} phép thử đạt${bad.length ? ' · HỎNG: ' + bad.map((r) => r[0]).join(' | ') : ''}`);
process.exit(bad.length ? 1 : 0);
