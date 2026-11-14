// Chụp một loạt ngoại hình của nhân vật người chơi trong MỘT lần nạp trang (đổi look rồi chụp từng ô), ghép thành bảng.
// Dùng: node tools/looks_shot.mjs <thư mục ảnh> <tên> "<mảng look dạng JS>" [--cam=x,y,z] [--look=x,y,z] [--fov=14] [--size=420x520] [--t=10.5] [--w=cloudy] [--cols=6]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2), outDir = args.shift(), name = args.shift(), looks = args.shift();
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const [W, H] = (opt.size || '420x520').split('x').map(Number);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-extensions', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H },
});
const files = [];
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text()) || m.type() === 'warn' && /người|chụp ảnh/.test(m.text())) console.log(`  ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => console.log('  LỖI TRANG:', String(e).slice(0, 600)));
  await page.goto(`http://127.0.0.1:8137/?ui=0&q=high&cam=${opt.cam || '41,1.5,60.9'}&look=${opt.look || '41,1.5,62.5'}&t=${opt.t || '10.5'}&w=${opt.w || 'cloudy'}${opt.q ? '&' + opt.q : ''}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true || /Lỗi/.test(document.getElementById("loadMsg").textContent)', { timeout: 120000 });
  const n = await page.evaluate(`(()=>{const t=window.__tp;t.camera.fov=${Number(opt.fov || 14)};t.camera.updateProjectionMatrix();t.player.st.started=true;window.__looks=${looks};return window.__looks.length})()`);
  for (let i = 0; i < n; i++) {
    await page.evaluate(`window.__tp.player.setLook(window.__looks[${i}])`);
    await new Promise(r => setTimeout(r, i ? 1500 : 3500));
    const f = path.join(outDir, `${name}_${String(i).padStart(2, '0')}.png`); await page.screenshot({ path: f }); files.push(f);
  }
} finally { await browser.close(); }
const cols = Number(opt.cols || 6);
execFileSync('python', ['-c', `
from PIL import Image
import sys
fs=sys.argv[3:];c=int(sys.argv[2]);w,h=Image.open(fs[0]).size
s=Image.new('RGB',(w*min(c,len(fs)),h*((len(fs)+c-1)//c)))
for i,f in enumerate(fs): s.paste(Image.open(f),((i%c)*w,(i//c)*h))
s.save(sys.argv[1])`, path.join(outDir, name + '.png'), String(cols), ...files]);
console.log(name + ': ' + files.length + ' ô');
