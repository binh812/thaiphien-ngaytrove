// Chụp bảng các dáng chụp ảnh của một nhân vật trong trò chơi (một lần nạp trang, đổi dáng rồi chụp từng ô).
// Dùng: node tools/poses_shot.mjs <thư mục ảnh> <tên> "<look dạng JS>" [--group=1] [--cam=x,y,z] [--look=x,y,z]
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const args = process.argv.slice(2), outDir = args.shift(), name = args.shift(), look = args.shift();
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const W = 420, H = 620;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-extensions', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H },
});
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text()) || m.type() === 'warn' && /người|chụp ảnh/.test(m.text())) console.log(`  ${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => console.log('  LỖI TRANG:', String(e).slice(0, 600)));
  const cam = opt.cam || '41,1.05,58.9', lookAt = opt.look || '41,0.9,62.5';
  await page.goto(`http://127.0.0.1:8137/?ui=0&cam=${cam}&look=${lookAt}&t=10.5&w=cloudy`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true || /Lỗi/.test(document.getElementById("loadMsg").textContent)', { timeout: 120000 });
  const poses = await page.evaluate(`(async()=>{const t=window.__tp,p=t.player;t.camera.fov=30;t.camera.updateProjectionMatrix();p.setLook(${look});p.st.started=true;const R=await import('/src/game/rigged.js');return await R.poseNames()})()`);
  console.log('dáng có trong tệp:', poses.join(', '));
  await new Promise(r => setTimeout(r, 2500));
  const list = ['', ...poses];
  for (let i = 0; i < list.length; i++) {
    await page.evaluate(`window.__tp.player.setPose(${JSON.stringify(list[i] || null)})`);
    await new Promise(r => setTimeout(r, 1600));
    await page.screenshot({ path: path.join(outDir, `${name}_${String(i).padStart(2, '0')}_${list[i] || 'none'}.png`) });
  }
} finally { await browser.close(); }
