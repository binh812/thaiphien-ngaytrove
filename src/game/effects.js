// Hiệu ứng: mưa (che bởi mái nhờ bản đồ độ cao nhìn từ trên xuống), đèn ban đêm, lá bay, âm thanh tổng hợp.
import * as THREE from 'three';
import { U } from '../engine/materials.js';
import { Q, mulberry32 } from '../engine/util.js';
import { PENCIL_ON } from '../engine/pencil/style.js';

function heightMap(ctx) {   // nướng 1 lần: độ cao mái/tán che tại mỗi điểm (x,z)
  const cam = new THREE.OrthographicCamera(-130, 130, 110, -110, 1, 80); cam.position.set(0, 60, 35); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 35); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const rt = new THREE.WebGLRenderTarget(1024, 1024, { depthTexture: new THREE.DepthTexture(1024, 1024, THREE.FloatType) });
  const r = ctx.pipeline.renderer, old = ctx.scene.overrideMaterial, hidden = [];
  ctx.scene.traverse((o) => { if (o.visible && (o.userData.noBake || o.isPoints || o.isLine || o.name === 'sky' || o.name === 'leaves' || o.name === 'fronds' || o.name === 'grass' || o.name === 'litter' || (o.material && o.material.transparent))) { o.visible = false; hidden.push(o); } });
  const vis = []; for (const [, g] of ctx.zones) { vis.push([g, g.visible]); g.visible = true; }
  ctx.scene.overrideMaterial = new THREE.MeshBasicMaterial(); if (PENCIL_ON) ctx.scene.overrideMaterial.defines = { PC_SKIP: 1 }; r.setRenderTarget(rt); r.clear(); r.render(ctx.scene, cam); r.setRenderTarget(null);
  ctx.scene.overrideMaterial = old; for (const o of hidden) o.visible = true; for (const [g, v] of vis) g.visible = v;
  U.uHeight.value = rt.depthTexture;
  return rt.depthTexture;
}

function makeRain(ctx, hTex) {
  const N = Math.round(9000 * Math.max(0.4, Q.grass)), base = new Float32Array(N * 6), end = new Float32Array(N * 2), rnd = mulberry32(3);
  for (let i = 0; i < N; i++) { const x = rnd(), y = rnd(), z = rnd(); base.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uRain: U.uRain, uWind: U.uWind, uCam: { value: new THREE.Vector3() }, tH: { value: hTex }, uLight: { value: 1 } },
    vertexShader: `attribute float aEnd; uniform float uT, uWind; uniform vec3 uCam; uniform sampler2D tH; varying float vA;
      void main() { vec3 box = vec3( 44.0, 26.0, 44.0 ); vec3 p = position * box; float sp = 15.0 + fract( position.x * 91.7 ) * 6.0; p.y -= uT * sp; p.x += uT * uWind * 4.0;
        vec3 w = uCam + mod( p - uCam, box ) - box * 0.5; w.y += 6.0;
        float roof = 60.0 - ( 1.0 + textureLod( tH, vec2( ( w.x + 130.0 ) / 260.0, 1.0 - ( w.z - 35.0 + 110.0 ) / 220.0 ), 0.0 ).x * 79.0 );
        vA = step( roof + 0.05, w.y ) * smoothstep( 22.0, 14.0, length( w.xz - uCam.xz ) );
        w.y += aEnd * 0.55; w.x += aEnd * uWind * 0.14; gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 ); }`,
    fragmentShader: 'uniform float uRain, uLight; varying float vA; void main() { if ( vA * uRain < 0.02 ) discard; gl_FragColor = vec4( vec3( 0.75, 0.8, 0.86 ) * uLight, 0.3 * vA * uRain ); }',
  });
  const m = new THREE.LineSegments(g, mat); m.frustumCulled = false; m.renderOrder = 8; m.visible = false; ctx.scene.add(m);
  return { m, mat };
}

function makeAudio(ctx) {
  let ac = null, master = null, noiseBuf = null, rainGain = null, windGain = null, birdT = 2, cricketT = 1;
  const ok = () => !!ac;
  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { if (ctx.ui) ctx.ui.toast('Trình duyệt không hỗ trợ âm thanh'); return; }
    const c = new AC(); master = c.createGain(); master.gain.value = 0.6; master.connect(c.destination);
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = (freq, q, type) => { const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const gn = c.createGain(); gn.gain.value = 0; s.connect(f); f.connect(gn); gn.connect(master); s.start(); return gn; };
    rainGain = loop(5200, 0.4, 'highpass'); windGain = loop(420, 0.6, 'lowpass'); ac = c;   // chỉ coi là sẵn sàng khi mọi nút đã dựng xong
  }
  function noise(dur, freq, q, vol, type = 'bandpass', when = 0) { if (!ok()) return; const t = ac.currentTime + when, s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  function tone(f0, f1, dur, vol, when = 0, type = 'sine') { if (!ok()) return; const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); }
  const api = {
    start, step: () => noise(0.07, 900 + Math.random() * 500, 1.2, 0.09 * (1 + U.uWet.value)), thud: (v = 0.5) => { tone(130, 50, 0.16, 0.5 * v); noise(0.05, 500, 1, 0.2 * v); }, bounce: (v) => { tone(210, 90, 0.11, Math.min(0.5, v)); noise(0.03, 1400, 2, Math.min(0.2, v * 0.4)); },
    whoosh: () => noise(0.28, 700, 0.8, 0.16), swish: () => { noise(0.3, 3200, 1.5, 0.22); }, rustle: () => { for (let i = 0; i < 5; i++) noise(0.35, 2600 + Math.random() * 2000, 0.7, 0.14, 'bandpass', i * 0.11); },
    drum: () => { for (let i = 0; i < 3; i++) { tone(96, 46, 0.7, 0.9, i * 0.5); noise(0.09, 320, 0.9, 0.5, 'lowpass', i * 0.5); } },
    update(dt) {
      if (!ok()) return; const s = ctx.sky.state;
      rainGain.gain.value += (s.w.rain * 0.16 - rainGain.gain.value) * Math.min(1, dt * 2); windGain.gain.value += (0.012 + s.w.wind * 0.05 - windGain.gain.value) * Math.min(1, dt);
      birdT -= dt; if (birdT < 0 && s.day > 0.5 && s.w.rain < 0.3) { birdT = 1.5 + Math.random() * 5; const f = 2400 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) tone(f * (1 + (i % 2) * 0.12), f * 1.25, 0.07, 0.035, i * 0.11); }
      cricketT -= dt; if (cricketT < 0 && s.night > 0.5) { cricketT = 0.35 + Math.random() * 0.4; for (let i = 0; i < 3; i++) tone(4300, 4300, 0.03, 0.02, i * 0.05, 'square'); }
    },
  };
  return api;
}

export function init(ctx) {
  const { scene, camera, B } = ctx, rnd = mulberry32(88);
  const hTex = heightMap(ctx), rain = makeRain(ctx, hTex);
  ctx.audio = makeAudio(ctx);
  // ----- đèn ban đêm: một bể đèn điểm gán cho các nguồn gần máy quay nhất -----
  const sources = B.lamps.map(l => ({ ...l })); for (const k of ['A', 'B', 'C', 'P']) for (const l of ctx.blocks[k].lights) sources.push({ x: l.x, y: l.y, z: l.z, power: 0.55, indoor: true, room: true });
  ctx.nightLights = sources;      // module khác thêm/bớt nguồn sáng đêm (đống lửa trại): { x, y, z, power }
  const POOL = Q.shadow >= 4096 ? 7 : 4, pool = []; for (let i = 0; i < POOL; i++) { const p = new THREE.PointLight(0xffe2b0, 0, 26, 1.7); scene.add(p); pool.push(p); }
  // quầng sáng quanh bóng đèn ngoài trời
  const halo = (() => { const out = sources.filter(s => !s.indoor), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out.flatMap(s => [s.x, s.y, s.z]), 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(3.2, 2.6, 1.7), size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })() })); m.frustumCulled = false; scene.add(m); return m; })();
  let lt = 0;
  // ----- lá bay -----
  const tops = (ctx.treeTops || []).filter(t => t.pal !== 'mango'), NL = tops.length ? Math.round(110 * Q.leafK) : 0, leaves = [];
  const lg = new THREE.PlaneGeometry(0.2, 0.27), lm = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }), Math.max(1, NL)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(1, 1, 1), COL = { red: [0xc2401c, 0xd65a22, 0xa83216], gold: [0xc6a830, 0xd6b83c, 0xa8902c], green: [0xa8902c, 0x8a7a2a, 0x7a9a3a] };
  const spawn = (l, top) => { const t = tops[Math.floor(rnd() * tops.length)], a = rnd() * 6.283, d = Math.sqrt(rnd()) * t.r; l.x = t.x + Math.cos(a) * d; l.z = t.z + Math.sin(a) * d; l.y = top ? t.y + rnd() * 1.6 : rnd() * (t.y + 1); l.vy = 0.55 + rnd() * 0.6; l.ph = rnd() * 6.283; l.rest = 0; l.c = COL[t.pal][Math.floor(rnd() * 3)]; };
  for (let i = 0; i < NL; i++) { const l = {}; spawn(l, false); leaves.push(l); lm.setColorAt(i, new THREE.Color(l.c)); }
  lm.count = NL; lm.frustumCulled = false; lm.castShadow = false; scene.add(lm);
  let t = 0, thunder = 6;
  ctx.updaters.push((dt) => {
    t += dt; const s = ctx.sky.state;
    // mưa
    rain.m.visible = s.w.rain > 0.02; rain.mat.uniforms.uT.value = t; rain.mat.uniforms.uCam.value.copy(camera.position); rain.mat.uniforms.uLight.value = 0.25 + s.day * 0.75;
    if (s.w.rain > 0.8) { thunder -= dt; if (thunder < 0) { thunder = 9 + Math.random() * 16; s.flash = 1; setTimeout(() => { if (ctx.audio) ctx.audio.thud(1.6); }, 700 + Math.random() * 1500); } }
    // đèn
    lt -= dt; const night = s.night, dim = Math.max(night, (1 - s.w.sun) * 0.5 * s.day);
    halo.material.opacity = night * 0.9;
    if (lt <= 0) {
      lt = 0.25; const cp = camera.position, cand = [];
      for (const src of sources) { const d2 = (src.x - cp.x) ** 2 + (src.z - cp.z) ** 2 + (src.y - cp.y) ** 2 * 2; const on = src.room ? (d2 < 14 * 14 ? 0.35 + dim * 0.65 : dim > 0.3 && d2 < 55 * 55 ? dim * 0.8 : 0) : dim > 0.25 ? dim : 0; if (on > 0) cand.push([d2 / (src.power * src.power), src, on]); }
      cand.sort((a, b) => a[0] - b[0]);
      pool.forEach((p, i) => { const c = cand[i]; if (!c) { p.intensity = 0; return; } const src = c[1]; p.position.set(src.x, src.y - (src.indoor ? 0.3 : 0.25), src.z); p.intensity = (src.indoor ? 16 : 90) * src.power * c[2]; p.distance = src.indoor ? 15 : 30; p.color.setHex(src.indoor ? 0xf4f6ff : 0xffd9a0); });
    }
    if (ctx.ledLight) ctx.ledLight.intensity = 40 * dim;
    // lá bay
    const wind = s.w.wind;
    for (let i = 0; i < NL; i++) {
      const l = leaves[i];
      if (l.rest > 0) { l.rest -= dt; if (l.rest <= 0) spawn(l, true); else continue; }
      l.y -= l.vy * dt; l.x += (Math.sin(t * 1.7 + l.ph) * 0.5 + wind * 1.6) * dt; l.z += Math.cos(t * 1.3 + l.ph * 1.7) * 0.5 * dt;
      if (l.y < 0.03) { l.y = 0.03; l.rest = 3 + rnd() * 9; e.set(-Math.PI / 2, 0, l.ph); } else e.set(t * 2.1 + l.ph, t * 1.3 + l.ph, Math.sin(t * 2 + l.ph));
      q.setFromEuler(e); m4.compose(pv.set(l.x, l.y, l.z), q, sv); lm.setMatrixAt(i, m4);
    }
    if (NL) lm.instanceMatrix.needsUpdate = true;
    // tiếng bóng nảy
    for (const b of ctx.balls || []) { const v = b.body.linvel(); if (b.pvy !== undefined && b.pvy < -1.2 && v.y > 0.3) { const tp = b.body.translation(), d = Math.hypot(tp.x - camera.position.x, tp.z - camera.position.z); if (d < 40) ctx.audio.bounce(Math.min(1, -b.pvy / 8) * (1 - d / 40)); } b.pvy = v.y; }
    ctx.audio.update(dt);
  });
}
