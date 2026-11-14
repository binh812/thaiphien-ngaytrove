// Điểm vào: dựng cảnh, vòng lặp, nối các hệ con.
import * as THREE from 'three';
import { Q, QNAME, param, paramNum } from './engine/util.js';
import { Builder } from './engine/builder.js';
import { loadScans } from './engine/textures.js';
import { createPipeline } from './engine/render.js';
import { createSky } from './engine/sky.js';
import { buildGround, buildBlocks } from './world/campus.js';
import { prepare as prepareTrees, init as initTrees } from './world/trees.js';
import * as gate from './world/gate.js';
import * as halls from './world/halls.js';
import * as garden from './world/garden.js';
import * as yard from './world/yard.js';
import * as service from './world/service.js';
import * as street from './world/street.js';
import { init as initPhysics } from './game/physics.js';
import { init as initProps } from './game/props.js';
import { init as initPlayer } from './game/player.js';
import { init as initPeople } from './game/people.js';
import { humansLoading } from './game/human.js';
import { init as initEffects } from './game/effects.js';
import { init as initUI } from './game/ui.js';
import { init as initReunion } from './game/reunion.js';
import { init as initCampus } from './game/campus_life.js';
import { init as initNet } from './net/index.js';

const $ = (id) => document.getElementById(id);
const setLoad = (p, msg) => { $('loadBar').style.width = Math.round(p * 100) + '%'; $('loadMsg').textContent = msg; return new Promise(r => setTimeout(r, 0)); };

async function boot() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.12, 4000);
  const pipeline = createPipeline($('app'), scene, camera);
  const sky = createSky(scene, pipeline.renderer, pipeline);
  sky.state.hour = paramNum('t', 15.6); sky.setWeather(param('w', 'clear')); Object.assign(sky.state.w, { ...sky.state.w });

  await setLoad(0.08, 'Nạp vật liệu…'); const scanInfo = await loadScans(); await sky.ready; window.__scans = scanInfo;
  await setLoad(0.15, 'Dựng nền sân và các khối nhà…');
  const B = new Builder();
  buildGround(B);
  const blocks = buildBlocks(B);
  const steps = [[gate, 'cổng trường, tường rào…'], [halls, 'nhà thi đấu, hội trường…'], [garden, 'vườn hoa, tượng đài…'], [yard, 'sân khấu, sân thể thao…'], [service, 'nhà xe, căng tin…'], [street, 'phố Đà Nẵng…']];
  for (let i = 0; i < steps.length; i++) { await setLoad(0.2 + i * 0.05, 'Dựng ' + steps[i][1]); steps[i][0].build(B, { blocks, scene }); }
  prepareTrees(B);
  await setLoad(0.6, 'Gộp hình học…');
  const zones = B.build(scene);
  const ctx = { scene, camera, pipeline, sky, B, blocks, zones, updaters: [] };
  const inits = [[initTrees, 'Trồng cây…'], [initPhysics, 'Khởi động vật lý…'], [initProps, 'Bày đồ vật…'], [initPlayer, 'Nhân vật…'], [initPeople, 'Thầy cô, học sinh…'], [initEffects, 'Hiệu ứng, âm thanh…'], [initUI, 'Giao diện…'], [initReunion, 'Lớp mình, ngày hội…'], [initCampus, 'Góc kỷ niệm, sân trường…'], [initNet, 'Chơi cùng bạn bè…']];
  for (let i = 0; i < inits.length; i++) { await setLoad(0.65 + i * 0.035, inits[i][1]); await inits[i][0](ctx); }

  // máy quay thử nghiệm: ?cam=x,y,z&look=x,y,z
  const cam = param('cam', ''), look = param('look', '');
  if (cam) { camera.position.fromArray(cam.split(',').map(Number)); camera.lookAt(...(look ? look.split(',').map(Number) : [0, 2, 0])); ctx.fixedCam = true; }
  else if (!ctx.player) { camera.position.set(-20, 38, 70); camera.lookAt(10, 0, 0); }

  // mười mô hình người (mỗi tệp ~8 MB) nạp, giải mã và đẩy ảnh lên GPU ngay trong màn hình chờ; trước đây việc này diễn ra
  // sau khi vào chơi và làm trang đứng hình khoảng 4 giây
  await setLoad(0.97, 'Nạp mô hình người…');
  const timedOut = await Promise.race([Promise.all([...humansLoading]).then(() => false), new Promise(r => setTimeout(() => r(true), 30000))]);
  if (timedOut) console.warn('[người] nạp mô hình quá 30 giây, vào chơi trước; các mô hình còn lại sẽ hiện dần');
  scene.traverse((o) => { if (o.isSkinnedMesh && o.material) for (const k of ['map', 'normalMap', 'roughnessMap']) if (o.material[k]) pipeline.renderer.initTexture(o.material[k]); });

  const clock = new THREE.Clock(); let acc = 0, frames = 0;
  const fail = (e) => { console.error(e); $('loading').classList.remove('hidden'); $('start').classList.add('hidden'); $('loadMsg').textContent = 'Lỗi khi chạy: ' + (e && e.message ? e.message : e) + ' — hãy tải lại trang.'; };
  function loop() {
    try { frame(); } catch (e) { fail(e); return; }
    requestAnimationFrame(loop);
  }
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    for (const u of ctx.updaters) u(dt);
    sky.update(dt, camera);
    // nội thất chỉ vẽ khi ở gần
    for (const [name, g] of zones) if (name.startsWith('in')) { const b = blocks[name.slice(2)]; if (b) g.visible = ctx.fixedCam || camera.position.distanceToSquared(b.center || (b.center = b.at(0, -6, 4))) < (Q.interior + b.L / 2) ** 2; }
    pipeline.render(dt, sky.sun, sky.state.lightDir);
    acc += dt; frames++;
    if (acc > 0.5) { const i = pipeline.renderer.info.render; $('stats').textContent = `${Math.round(frames / acc)} FPS · ${i.calls} lệnh vẽ · ${(i.triangles / 1e6).toFixed(2)} tr tam giác · ${QNAME}`; acc = 0; frames = 0; }
  }
  window.__tp = ctx;
  try { frame(); frame(); } catch (e) { fail(e); return; }      // vẽ thử sau màn hình chờ: biên dịch vật liệu xong rồi mới cho vào chơi
  await setLoad(1, 'Xong'); $('loading').classList.add('hidden');
  if (param('ui', '1') !== '0' && ctx.ui) ctx.ui.showStart(); else if (ctx.ui) ctx.ui.hideAll();
  clock.getDelta(); loop();
  document.title = 'Thái Phiên – Ngày trở về'; window.__ready = true;
}
boot().catch((e) => { console.error(e); $('loading').classList.remove('hidden'); $('loadMsg').textContent = 'Lỗi khởi động: ' + (e && e.message ? e.message : e); });
