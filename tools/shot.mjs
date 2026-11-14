// Chụp ảnh kiểm thử bằng Edge headless qua puppeteer-core.
// Dùng: node tools/shot.mjs <thư mục ảnh> <tên>=<query> [...] [--size=1440x810] [--wait=2500] [--eval="js chạy sau khi sẵn sàng"]
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const args = process.argv.slice(2), outDir = args.shift();
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const shots = args.filter(a => !a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; });
const [w, h] = (opt.size || '1440x810').split('x').map(Number);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-extensions', `--window-size=${w},${h}`, '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: w, height: h },
});
try {
  for (const [name, query] of shots) {
    const page = await browser.newPage();
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warn' || t.startsWith('[')) console.log(`  ${m.type()}: ${t.slice(0, 400)}`); });
    page.on('pageerror', (e) => console.log('  LỖI TRANG:', String(e).slice(0, 600)));
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:8137/?${query.includes("ui=") ? "" : "ui=0&"}${query}`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true || /Lỗi/.test(document.getElementById("loadMsg").textContent)', { timeout: 120000 });
    const msg = await page.evaluate('document.getElementById("loadMsg").textContent');
    if (opt.eval) { const r = await page.evaluate(opt.eval); if (r !== undefined) console.log('  eval →', JSON.stringify(r)); }
    await new Promise(r => setTimeout(r, Number(opt.wait || 2500)));
    if (opt.eval2) { const r = await page.evaluate(opt.eval2); if (r !== undefined) console.log('  eval2 →', JSON.stringify(r)); }
    const stats = await page.evaluate('document.getElementById("stats").textContent');
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    console.log(`${name}: ${Date.now() - t0} ms · ${msg} · ${stats}`);
    await page.close();
  }
} finally { await browser.close(); }
