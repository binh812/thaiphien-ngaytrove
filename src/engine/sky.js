// Bầu trời vật lý, mặt trời/mặt trăng theo giờ, sao, ánh sáng môi trường (PMREM) và thời tiết.
import * as THREE from 'three';
import { clamp, lerp, smooth, mulberry32, Q } from './util.js';

// Bầu trời chụp thật (HDRI Poly Haven, đã chuẩn hoá — xem tools/fetch_skies.py). Chuỗi trời quang theo độ cao mặt trời (độ).
const CLEAR_SEQ = [['night', -11], ['sunset', 0.5], ['golden', 6], ['low', 18], ['cloudy', 34]];
const SKY_MEAN = { night: 0.0035, sunset: 0.06, golden: 0.16, low: 0.44, day: 0.6, cloudy: 0.6, overcast: 0.46, misty: 0.46 };
const DOME_VS = 'varying vec3 vDir; void main() { vDir = position; vec4 p = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const DOME_FS = `
varying vec3 vDir;
uniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tC;
uniform vec4 uA; uniform vec4 uB; uniform vec4 uC;      // (sunU, độ cao mặt trời trong ảnh [rad] hoặc -1, độ sáng, trọng số)
uniform vec3 uSun; uniform float uSunEl; uniform float uSunAz; uniform vec3 uDisc; uniform vec3 uGround; uniform float uDim;
vec3 layer( sampler2D t, vec4 p, float az, float el ) {
  float e = el, u = az / 6.2831853;
  if ( p.y >= 0.0 ) {
    u = p.x + ( az - uSunAz ) / 6.2831853;
    e = el <= uSunEl ? el * p.y / uSunEl : p.y + ( el - uSunEl ) * ( 1.5707963 - p.y ) / ( 1.5707963 - uSunEl );
  }
  vec3 c = textureLod( t, vec2( u, clamp( e / 1.5707963, 0.004, 0.996 ) ), 0.0 ).rgb;
  return pow( c, vec3( 2.2 ) ) * ( 8.0 * p.z );
}
void main() {
  vec3 d = normalize( vDir );
  float el = asin( clamp( d.y, -1.0, 1.0 ) ), az = atan( d.z, d.x ), elc = max( el, 0.0 );
  vec3 col = mix( layer( tA, uA, az, elc ), layer( tB, uB, az, elc ), uB.w );
  if ( uC.w > 0.001 ) col = mix( col, layer( tC, uC, az, elc ), uC.w );
  col = mix( col, uGround, 1.0 - smoothstep( -0.06, 0.0, el ) );
  float ca = dot( d, uSun );
  col += uDisc * ( smoothstep( 0.99996, 0.99999, ca ) + 0.012 * pow( max( ca, 0.0 ), 900.0 ) ) * step( -0.02, el );
  col = mix( vec3( dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) ), col, 0.9 );
  gl_FragColor = vec4( col * uDim, 1.0 );
}`;
import { U, glowDim } from './materials.js';
import { PENCIL_ON } from './pencil/style.js';

const TILT = 0.72;                       // độ nghiêng quỹ đạo mặt trời về phía nam (rad) → trưa cao ~49°
export const WEATHERS = {
  clear:  { name: 'Nắng',  cover: 0.28, dens: 0.45, sun: 1,    haze: 0.0022, low: 0,     wet: 0, rain: 0, wind: 0.35, turb: 4.6 },
  cloudy: { name: 'Nhiều mây', cover: 0.72, dens: 0.75, sun: 0.4,  haze: 0.005,  low: 0,     wet: 0, rain: 0, wind: 0.55, turb: 5 },
  fog:    { name: 'Sương sớm', cover: 0.4,  dens: 0.5,  sun: 0.7,  haze: 0.012,  low: 0.085, wet: 0.25, rain: 0, wind: 0.12, turb: 8 },
  rain:   { name: 'Mưa',   cover: 0.98, dens: 0.95, sun: 0.1,  haze: 0.011,  low: 0.02,  wet: 1, rain: 1, wind: 0.9,  turb: 10 },
};

export function createSky(scene, renderer, pipeline) {
  const tex = {}, blank = new THREE.DataTexture(new Uint8Array([40, 60, 90, 255]), 1, 1); blank.needsUpdate = true;
  const du = { tA: { value: blank }, tB: { value: blank }, tC: { value: blank }, uA: { value: new THREE.Vector4(0, -1, 0.3, 1) }, uB: { value: new THREE.Vector4(0, -1, 0.3, 0) }, uC: { value: new THREE.Vector4(0, -1, 0.3, 0) },
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunEl: { value: 0.5 }, uSunAz: { value: 0 }, uDisc: { value: new THREE.Vector3() }, uGround: { value: new THREE.Vector3(0.1, 0.1, 0.1) }, uDim: { value: 1 } };
  const domeMat = (disc) => new THREE.ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, uniforms: disc ? du : { ...du, uDisc: { value: new THREE.Vector3() } }, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), domeMat(true)); sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const ready = (async () => {
    const r = await fetch('assets/sky/manifest.json'); if (!r.ok) throw new Error('Không nạp được assets/sky/manifest.json (HTTP ' + r.status + ')');
    const man = await r.json(), size = Q.tex >= 512 ? 4096 : 2048, loader = new THREE.TextureLoader();
    await Promise.all(Object.keys(man).filter(k => SKY_MEAN[k] !== undefined && k !== 'day').map(async (k) => {
      const t = await loader.loadAsync(`assets/sky/${k}_${size}.jpg`); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter;
      tex[k] = { t, sunU: man[k].sunU, el: man[k].sunEl != null && k !== 'night' ? Math.max(1, man[k].sunEl) * Math.PI / 180 : -1, mean: SKY_MEAN[k] ?? 0.3 };
    }));
  })();
  ready.catch(() => {});      // lỗi được báo ở chỗ await sky.ready trong main.js
  const setLayer = (slot, key, w, gain = 1) => { const e = tex[key]; if (!e) { if (!setLayer.warned) { setLayer.warned = true; console.warn('[trời] thiếu ảnh', key); } return; } du['t' + slot].value = e.t; du['u' + slot].value.set(e.sunU ?? 0, key === 'night' ? -1 : e.el, e.mean * gain, w); };
  // cảnh phụ để nướng ánh sáng môi trường: trời (không đĩa mặt trời) + mặt đất hắt sáng
  const envScene = new THREE.Scene(), envSky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), domeMat(false)); envScene.add(envSky);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x555049 }); if (PENCIL_ON) groundMat.defines = { PC_SKIP: 1 };      // cảnh nướng IBL không vẽ kiểu chì màu
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 24), groundMat); ground.rotation.x = -Math.PI / 2; ground.position.y = -2; envScene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  const sun = new THREE.DirectionalLight(0xffffff, 4); sun.name = 'sun';
  sun.castShadow = true;
  const smap = Math.min(Q.shadow, pipeline.maxTex); sun.shadow.mapSize.set(smap, smap);
  sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.05; sun.shadow.radius = Q.shadow >= 4096 ? 2.2 : 1.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8fb4ff, 0x3a3020, 0); scene.add(hemi);

  // sao
  const stars = (() => {
    const rnd = mulberry32(99), n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = rnd() * 0.98 + 0.02, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - y * y), b = 0.35 + Math.pow(rnd(), 4) * 2.2, t = rnd();
      pos.set([Math.cos(a) * r * 1500, y * 1500, Math.sin(a) * r * 1500], i * 3); col.set([b * (0.85 + 0.15 * t), b * 0.9, b * (1 - 0.15 * t)], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.frustumCulled = false; m.renderOrder = 1; scene.add(m); return m;
  })();
  const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.8) })); moon.frustumCulled = false; scene.add(moon);

  const state = {
    hour: 15.6, speed: 0, weather: 'clear', w: { ...WEATHERS.clear },
    sunDir: new THREE.Vector3(), lightDir: new THREE.Vector3(), day: 1, night: 0, flash: 0,
  };
  // khung bóng đổ phủ trọn khuôn viên (tĩnh → bóng không rung)
  const BOUNDS = new THREE.Box3(new THREE.Vector3(-72, -1, -58), new THREE.Vector3(82, 22, 84));
  const _m = new THREE.Matrix4(), _c = new THREE.Vector3(), _p = new THREE.Vector3(), lastEnvDir = new THREE.Vector3(), lastKey = { v: '' };
  let envTimer = 0;
  function fitShadow() {
    const d = state.lightDir, center = BOUNDS.getCenter(_c);
    sun.position.copy(center).addScaledVector(d, 260); sun.target.position.copy(center); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    _m.lookAt(sun.position, center, THREE.Object3D.DEFAULT_UP).invert();   // gần đúng không gian đèn (chỉ cần hướng)
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < 8; i++) {
      _p.set(i & 1 ? BOUNDS.max.x : BOUNDS.min.x, i & 2 ? BOUNDS.max.y : BOUNDS.min.y, i & 4 ? BOUNDS.max.z : BOUNDS.min.z).sub(sun.position).applyMatrix4(_m);
      x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x); y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y); z0 = Math.min(z0, -_p.z); z1 = Math.max(z1, -_p.z);
    }
    const c = sun.shadow.camera; c.left = x0; c.right = x1; c.bottom = y0; c.top = y1; c.near = Math.max(1, z0 - 5); c.far = z1 + 5; c.updateProjectionMatrix();
  }
  function bakeEnv() {
    const g = 0.05 + 0.8 * state.day * (0.35 + 0.65 * state.w.sun); groundMat.color.setRGB(g * 1.0, g * 0.93, g * 0.8);
    const rt = pmrem.fromScene(envScene, 0, 1, 2000);
    scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt;
  }
  function setWeather(name) { if (WEATHERS[name]) state.weather = name; }

  function update(dt, camera) {
    if (state.speed) state.hour = (state.hour + dt * state.speed / 3600 + 24) % 24;
    // thời tiết nội suy dần
    const tw = WEATHERS[state.weather], k = 1 - Math.exp(-dt * 0.9);
    for (const key of ['cover', 'dens', 'sun', 'haze', 'low', 'rain', 'wind', 'turb']) state.w[key] = lerp(state.w[key], tw[key], k);
    state.w.wet = lerp(state.w.wet, tw.wet, 1 - Math.exp(-dt * (tw.wet > state.w.wet ? 0.25 : 0.04)));
    // hướng mặt trời
    const a = (state.hour - 6) / 12 * Math.PI, s = state.sunDir.set(Math.cos(a), Math.sin(a) * Math.cos(TILT), Math.sin(a) * Math.sin(TILT)).normalize();
    const day = smooth(-0.06, 0.12, s.y), night = 1 - smooth(-0.14, 0.02, s.y);
    state.day = day; state.night = night;
    const useMoon = s.y < -0.02, md = _p.set(-s.x * 0.6 + 0.3, Math.max(0.35, -s.y) + 0.25, -s.z * 0.6 - 0.45).normalize();
    state.lightDir.copy(useMoon ? md : s); if (!useMoon && state.lightDir.y < 0.03) { state.lightDir.y = 0.03; state.lightDir.normalize(); }
    moon.position.copy(camera.position).addScaledVector(md, 1900); moon.visible = night > 0.05;
    stars.position.copy(camera.position); stars.material.opacity = night * (1 - state.w.cover * 0.9); stars.visible = night > 0.02;
    sky.position.copy(camera.position);
    // màu và cường độ nắng
    const el = clamp(s.y, 0, 1), warm = smooth(0.0, 0.35, el), sunK = smooth(0.0, 0.16, s.y) * state.w.sun;
    if (useMoon) { sun.color.setRGB(0.55, 0.68, 1.0); sun.intensity = 0.32 * night * (1 - state.w.cover * 0.7); }
    else { sun.color.setRGB(1, lerp(0.5, 0.95, warm), lerp(0.22, 0.86, warm)); sun.intensity = 4.4 * sunK; }
    sun.intensity += state.flash * 8; state.flash = Math.max(0, state.flash - dt * 6);
    hemi.intensity = 0.1 + night * 0.22 + day * (0.3 + (1 - state.w.sun) * 0.35); hemi.color.setRGB(lerp(0.6, 1.0, day), lerp(0.72, 0.93, day), lerp(1.0, 0.82, day)); hemi.groundColor.setRGB(lerp(0.2, 0.75, day), lerp(0.18, 0.62, day), lerp(0.14, 0.45, day));
    scene.environmentIntensity = lerp(0.6, 1.3, day) * lerp(1, 0.7, 1 - state.w.sun);
    fitShadow();
    // tham số trời: hai ảnh kề nhau theo độ cao mặt trời + một lớp thời tiết
    const overcast = clamp((state.w.cover - 0.5) * 2.2, 0, 1), elDeg = Math.asin(clamp(s.y, -1, 1)) * 180 / Math.PI;
    let i = 0; while (i < CLEAR_SEQ.length - 2 && elDeg > CLEAR_SEQ[i + 1][1]) i++;
    const ka = CLEAR_SEQ[i], kb = CLEAR_SEQ[i + 1], kt = smooth(ka[1], kb[1], elDeg);
    setLayer('A', ka[0], 1); setLayer('B', kb[0], kt);
    const dayDim = lerp(0.012, 1, smooth(-8, 14, elDeg));
    const wMist = clamp(state.w.low * 11, 0, 1) * (1 - night);
    if (overcast >= wMist) setLayer('C', 'overcast', overcast, dayDim * lerp(1, 0.45, state.w.rain)); else setLayer('C', 'misty', wMist, dayDim);
    du.uSun.value.copy(s); du.uSunEl.value = clamp(Math.asin(clamp(s.y, -1, 1)), 0.02, 1.5); du.uSunAz.value = Math.atan2(s.z, s.x);
    du.uDisc.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(useMoon ? 0 : 90 * sunK * (1 - overcast)); du.uGround.value.set(0.2, 0.19, 0.17).multiplyScalar(0.02 + day * 0.5);
    pipeline.u.comp.uSkyGain.value = 1; pipeline.setContact(useMoon ? 0 : sunK * (1 - overcast));
    // thể tích
    const vu = pipeline.u.vol; vu.uDensity.value = state.w.haze * (1 + (1 - warm) * day * 0.8); vu.uLowFog.value = state.w.low;
    vu.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity * (useMoon ? 2.5 : 0.3)); vu.uAmbCol.value.setRGB(0.55, 0.68, 0.9).multiplyScalar(0.2 + 1.4 * day * (0.4 + 0.6 * state.w.sun) + night * 0.12);
    const fu = pipeline.u.final; fu.uSunCol.value.copy(sun.color).multiplyScalar(useMoon ? 0.25 : 1.1 * sunK); fu.uFlare.value = (useMoon ? 0.4 : 1) * (1 - clamp((state.w.cover - 0.5) * 2.2, 0, 1));
    fu.uExposure.value = lerp(1.9, 1.02, day) * lerp(1, 1.25, (1 - state.w.sun) * day) * (state.exposure || 1);
    // uniform dùng chung
    U.uWet.value = state.w.wet; U.uRain.value = state.w.rain; U.uWind.value = state.w.wind; U.uNight.value = night; U.uWindT.value += dt * (0.4 + state.w.wind); U.uTime.value += dt;
    glowDim.value = lerp(1.0, 2.4, night);
    // nướng lại ánh sáng môi trường khi trời đổi đáng kể
    envTimer -= dt; const key = state.w.cover.toFixed(2) + '|' + state.w.sun.toFixed(2);
    if (envTimer <= 0 && (lastEnvDir.distanceToSquared(s) > 0.0004 || key !== lastKey.v || !envRT)) { lastEnvDir.copy(s); lastKey.v = key; envTimer = 0.4; bakeEnv(); }
  }
  return { state, sun, update, setWeather, sky, ready };
}
