// Chế độ ảnh dò tia (path tracing lũy tiến trên GPU) — three-gpu-pathtracer + three-mesh-bvh.
// Không sửa vòng lặp chính: trong lúc chạy, mô-đun tạm thay `ctx.pipeline.render` (main.js gọi qua thuộc tính nên thay được),
// tạm rút hết `ctx.updaters` và `ctx.sky.update` để đóng băng cảnh, rồi trả lại nguyên trạng khi stop().
// Cảnh dò tia là một Scene "bản sao" dựng riêng (dùng chung hình học/texture với cảnh thật, không đụng vào cảnh thật):
//   - bỏ cỏ, lá rụng, vòm trời, điểm/đường, vật đang ẩn;  - InstancedMesh được trải thành lưới thường (thư viện không hiểu instancing);
//   - trời: vẽ lại shader vòm trời vào ảnh equirect float làm ánh sáng môi trường; mặt trời là một đĩa sáng trong ảnh đó (bóng đổ mềm).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const SKIP_NAMES = new Set(['grass', 'litter', 'sky']);
const COPLANAR_PUSH = 0.002;
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
// cùng công thức tone map với pass cuối của src/engine/render.js (không có bloom, loá ống kính, hạt phim, sương thể tích)
const SHOW_FS = `
varying vec2 vUv; uniform sampler2D tPT; uniform float uExposure; uniform float uSat; uniform float uContrast; uniform float uVig;
vec3 aces( vec3 x ) { x *= 0.6; return clamp( ( x * ( 2.51 * x + 0.03 ) ) / ( x * ( 2.43 * x + 0.59 ) + 0.14 ), 0.0, 1.0 ); }
void main() {
  vec2 c = vUv - 0.5; float r2 = dot( c, c );
  vec3 col = max( texture2D( tPT, vUv ).rgb, 0.0 ) * uExposure;
  col *= 1.0 - uVig * smoothstep( 0.15, 0.85, r2 * 2.0 );
  col = pow( aces( col ), vec3( 1.0 / 2.2 ) );
  col = mix( vec3( dot( col, vec3( 0.2126, 0.7152, 0.0722 ) ) ), col, uSat );
  col = ( col - 0.5 ) * uContrast + 0.5;
  gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}`;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

/** Thuộc tính đỉnh → Float32 thường với đúng số thành phần (three-gpu-pathtracer gộp mọi lưới vào một mảng: lẫn kiểu Uint8 chuẩn hoá của GLB với Float32 là màu đỉnh về 0 → cảnh đen). */
function floatAttr(attr, size, fill = 1) {
  if (attr.array instanceof Float32Array && !attr.isInterleavedBufferAttribute && attr.itemSize === size && !attr.normalized) return attr;
  const n = attr.count, out = new Float32Array(n * size).fill(fill), k = Math.min(size, attr.itemSize);
  for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) out[i * size + c] = attr.getComponent(i, c);
  return new THREE.BufferAttribute(out, size);
}
/** Lưới tĩnh cho path tracer: dùng lại bộ đệm gốc khi đã là Float32, chuẩn hoá phần còn lại; SkinnedMesh được nướng theo tư thế hiện tại. */
function staticGeometry(o, realNormals) {
  const g = o.geometry, out = new THREE.BufferGeometry(), at = g.attributes;
  out.setIndex(g.index);
  if (o.isSkinnedMesh) {
    const n = at.position.count, P = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); realNormals = true;
  } else out.setAttribute('position', floatAttr(at.position, 3, 0));
  if (at.uv) out.setAttribute('uv', floatAttr(at.uv, 2, 0));
  if (at.color) out.setAttribute('color', floatAttr(at.color, 4));
  if (at.normal && !realNormals) out.setAttribute('normal', floatAttr(at.normal, 3, 0)); else out.computeVertexNormals();
  return out;
}

/** Trải một InstancedMesh thành BufferGeometry thường (vị trí, pháp tuyến, uv, màu RGBA = màu đỉnh × màu instance). */
function expandInstanced(o, useVertexColor) {
  const g = o.geometry, pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, vcol = useVertexColor ? g.attributes.color : null;
  const V = pos.count, N = o.count, idx = g.index;
  const P = new Float32Array(N * V * 3), Nn = new Float32Array(N * V * 3), Uv = new Float32Array(N * V * 2), C = new Float32Array(N * V * 4).fill(1);
  const I = new Uint32Array(N * (idx ? idx.count : V));
  const m = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = new THREE.Vector3(), ic = o.instanceColor;
  for (let i = 0; i < N; i++) {
    o.getMatrixAt(i, m); n3.getNormalMatrix(m);
    const b = i * V;
    for (let j = 0; j < V; j++) {
      v.fromBufferAttribute(pos, j).applyMatrix4(m); P[(b + j) * 3] = v.x; P[(b + j) * 3 + 1] = v.y; P[(b + j) * 3 + 2] = v.z;
      if (nrm) { v.fromBufferAttribute(nrm, j).applyMatrix3(n3).normalize(); Nn[(b + j) * 3] = v.x; Nn[(b + j) * 3 + 1] = v.y; Nn[(b + j) * 3 + 2] = v.z; }
      if (uv) { Uv[(b + j) * 2] = uv.getX(j); Uv[(b + j) * 2 + 1] = uv.getY(j); }
      let r = 1, gg = 1, bb = 1;
      if (ic) { r = ic.getX(i); gg = ic.getY(i); bb = ic.getZ(i); }
      if (vcol) { r *= vcol.getX(j); gg *= vcol.getY(j); bb *= vcol.getZ(j); }
      C[(b + j) * 4] = r; C[(b + j) * 4 + 1] = gg; C[(b + j) * 4 + 2] = bb;
    }
    if (idx) { const ib = i * idx.count; for (let j = 0; j < idx.count; j++) I[ib + j] = idx.getX(j) + b; } else for (let j = 0; j < V; j++) I[b + j] = b + j;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(Uv, 2)); out.setAttribute('color', new THREE.BufferAttribute(C, 4));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  if (!nrm) out.computeVertexNormals();
  return out;
}

/**
 * @param ctx  window.__tp
 * @param opt  { bounces=5, tiles=2, scale=1/pixelRatio, textureSize=512, sunMode='env'|'light', sunRadiusDeg=1, includeGrass=false, alphaBounces=40, leafTransmission=0,
 *               radius=Infinity (chỉ lấy vật có khối cầu bao cách camera < radius), freeze=true, filterGlossy=0.5 }
 */
export function createPathTracer(ctx, opt = {}) {
  const renderer = ctx.pipeline.renderer, gl = renderer.getContext();
  const supported = !!(renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float') && renderer.extensions.has('OES_texture_float_linear'));
  const toast = (msg, s) => { if (ctx.ui && ctx.ui.toast) ctx.ui.toast(msg, s); console.log('[dò tia] ' + msg); };
  const stats = { buildMs: 0, collectMs: 0, bvhMs: 0, triangles: 0, meshes: 0, materials: 0, textures: 0, startedAt: 0, firstSampleMs: 0, skipped: {} };

  let pt = null, active = false, starting = false, saved = null, proxy = null, owned = [], showQuad = null, envRTs = [], lastCam = new Float32Array(32), sunLight = null;

  function buildProxyScene() {
    const scene = new THREE.Scene(), mats = new Map(), cam = ctx.camera.position, radius = opt.radius ?? Infinity, skip = stats.skipped;
    const note = (k) => { skip[k] = (skip[k] || 0) + 1; };
    const sphere = new THREE.Sphere();
    const leafT = opt.leafTransmission ?? 0;      // đã thử 0.45: thư viện chỉ có truyền qua kiểu kính nên cây tối hơn chứ không sáng hơn → mặc định tắt
    const proxyMat = (m, forceVC) => {
      const key = m.uuid + (forceVC ? '|vc' : '');
      if (mats.has(key)) return mats.get(key);
      let c;
      if (m.isMeshBasicMaterial && m.vertexColors && !m.map) c = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });   // vật phát sáng: path tracer không có phát xạ theo màu đỉnh → coi như bề mặt nhám
      else if (m.alphaTest > 0 && m.side === THREE.DoubleSide && leafT > 0) {
        // lá cây: cho ánh sáng lọt qua một phần (lá mỏng), nếu không mặt dưới tán cây dày sẽ đen kịt — raster vốn giả hiệu ứng này trong shader
        c = new THREE.MeshPhysicalMaterial({ map: m.map, color: m.color, alphaTest: m.alphaTest, vertexColors: m.vertexColors, side: THREE.DoubleSide, roughness: 1, metalness: 0, transmission: leafT, thickness: 0, ior: 1.0 });
      } else { c = m.clone(); c.onBeforeCompile = () => {}; }
      if ('aoMap' in c) c.aoMap = null;                 // path tracer không dùng aoMap; bỏ để đỡ tốn lớp texture
      if (forceVC) c.vertexColors = true;
      owned.push(c); mats.set(key, c); return c;
    };
    ctx.scene.updateMatrixWorld(true);
    ctx.scene.traverse((o) => {
      if (!o.isMesh) { if (o.isPoints || o.isLine) note('điểm/đường'); return; }
      const name = o.name || '';      // lưu ý: nền bãi cỏ tên 'grass|<vùng>' vẫn giữ, chỉ bỏ cụm cỏ InstancedMesh tên đúng 'grass'
      if (SKIP_NAMES.has(name) && !(name === 'grass' && opt.includeGrass)) { note(name); return; }
      if (!shown(o)) { note('đang ẩn'); return; }
      const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m0 || m0.isShaderMaterial) { note('ShaderMaterial'); return; }
      const g = o.geometry; if (!g || !g.attributes.position) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      sphere.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (!o.isInstancedMesh) {
        const d = sphere.center.distanceTo(cam);
        if (d - sphere.radius > 1200) { note('quá xa (trăng…)'); return; }
        if (d - sphere.radius > radius) { note('ngoài bán kính'); return; }
      }
      let geo = g, forceVC = false;
      if (o.isInstancedMesh) { if (!o.count) return; geo = expandInstanced(o, !!m0.vertexColors); owned.push(geo); forceVC = !!o.instanceColor; }
      else {
        // thẻ lá (alphaTest + hai mặt): pháp tuyến gốc bị "bẻ" theo tán cây (đẹp khi raster) nhưng ngược với mặt thật → path tracer tô đen mặt dưới. Dùng pháp tuyến thật của từng thẻ.
        geo = staticGeometry(o, m0.alphaTest > 0 && m0.side === THREE.DoubleSide); owned.push(geo);
        if (o.isSkinnedMesh) stats.skinned = (stats.skinned || 0) + 1;
      }
      const mat = Array.isArray(o.material) ? o.material.map((m) => proxyMat(m, forceVC)) : proxyMat(o.material, forceVC);
      const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(o.matrixWorld);
      const triCount = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (triCount <= 2 && m0.side === THREE.FrontSide && g.attributes.normal) {
        // biển hai mặt = hai tấm phẳng một mặt trùng nhau → tia trúng mặt sau thì xuyên qua cả hai. Đẩy mỗi tấm ra 2 mm theo pháp tuyến.
        const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0).transformDirection(o.matrixWorld).multiplyScalar(COPLANAR_PUSH);
        mesh.matrix.elements[12] += n.x; mesh.matrix.elements[13] += n.y; mesh.matrix.elements[14] += n.z;
      }
      scene.add(mesh); stats.meshes++;
      stats.triangles += triCount;
    });
    stats.materials = mats.size;
    return scene;
  }

  /** Vẽ shader vòm trời của game vào ảnh equirect (theo quy ước uv của three-gpu-pathtracer). */
  function bakeSky(scene) {
    const dome = ctx.sky.sky, sun = ctx.sky.sun, dir = ctx.sky.state.lightDir.clone().normalize();
    const envI = ctx.scene.environmentIntensity ?? 1, asEnvSun = (opt.sunMode || 'env') === 'env';
    const rDeg = opt.sunRadiusDeg ?? 1, cosR = Math.cos(rDeg * Math.PI / 180), omega = 2 * Math.PI * (1 - cosR);
    const W = 2048, H = 1024;
    let fs = dome.material.fragmentShader;
    const a = 'varying vec3 vDir;', b = 'vec3 d = normalize( vDir );', c = 'gl_FragColor = vec4( col * uDim, 1.0 );';
    const ok = fs.includes(a) && fs.includes(b) && fs.includes(c);
    if (ok) {
      fs = fs.replace(a, 'varying vec2 vUv; uniform vec3 uPtSun; uniform vec3 uPtSunDir; uniform float uPtCos;')
        .replace(b, 'float ptTh = ( vUv.x - 0.5 ) * 6.2831853, ptPh = ( 1.0 - vUv.y ) * 3.14159265; vec3 d = vec3( sin( ptPh ) * cos( ptTh ), cos( ptPh ), sin( ptPh ) * sin( ptTh ) );')
        .replace(c, 'col = col * uDim + uPtSun * step( uPtCos, dot( d, uPtSunDir ) ); gl_FragColor = vec4( col, 1.0 );');
    } else {
      console.warn('[dò tia] shader vòm trời đã đổi, dùng trời gradient đơn giản');
      fs = `varying vec2 vUv; uniform vec3 uPtSun; uniform vec3 uPtSunDir; uniform float uPtCos;
        void main() { float ptTh = ( vUv.x - 0.5 ) * 6.2831853, ptPh = ( 1.0 - vUv.y ) * 3.14159265; vec3 d = vec3( sin( ptPh ) * cos( ptTh ), cos( ptPh ), sin( ptPh ) * sin( ptTh ) );
          vec3 col = mix( vec3( 0.9, 0.95, 1.0 ), vec3( 0.25, 0.45, 0.9 ), smoothstep( 0.0, 0.6, d.y ) ) * 1.6; col = mix( vec3( 0.12 ), col, smoothstep( -0.06, 0.0, d.y ) );
          gl_FragColor = vec4( col + uPtSun * step( uPtCos, dot( d, uPtSunDir ) ), 1.0 ); }`;
    }
    const sunRad = new THREE.Vector3(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(asEnvSun ? sun.intensity / (omega * Math.max(envI, 1e-3)) : 0);
    const extra = { uPtSun: { value: sunRad }, uPtSunDir: { value: dir }, uPtCos: { value: cosR } };
    const mk = (disc) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false,
      uniforms: { ...dome.material.uniforms, ...(disc ? {} : { uDisc: { value: new THREE.Vector3() } }), ...extra } });
    const rtOpt = { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    const envRT = new THREE.WebGLRenderTarget(W, H, rtOpt), bgRT = new THREE.WebGLRenderTarget(W, H, rtOpt);
    const quad = new FullScreenQuad(mk(false)), prev = renderer.getRenderTarget();
    renderer.setRenderTarget(envRT); quad.render(renderer);
    const data = new Float32Array(W * H * 4); renderer.readRenderTargetPixels(envRT, 0, 0, W, H, data);
    quad.material.dispose(); quad.material = mk(true); quad.material.uniforms.uPtSun = { value: new THREE.Vector3() };   // nền nhìn thấy: dùng đĩa mặt trời gốc của vòm trời
    renderer.setRenderTarget(bgRT); quad.render(renderer);
    renderer.setRenderTarget(prev); quad.material.dispose(); quad.dispose(); envRT.dispose();
    for (let i = 0; i < data.length; i++) if (!(data[i] < 60000)) data[i] = data[i] > 0 ? 60000 : 0;   // chặn tràn half-float / NaN
    let sum = 0; for (let i = 0; i < data.length; i += 4 * 97) sum += data[i + 1]; stats.envMean = +(sum / (data.length / (4 * 97))).toFixed(4);
    if (!(stats.envMean > 0)) console.warn('[dò tia] ảnh trời môi trường toàn màu đen — ánh sáng sẽ thiếu');
    const env = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    env.mapping = THREE.EquirectangularReflectionMapping; env.minFilter = env.magFilter = THREE.LinearFilter; env.wrapS = THREE.RepeatWrapping; env.needsUpdate = true;
    bgRT.texture.mapping = THREE.EquirectangularReflectionMapping; bgRT.texture.wrapS = THREE.RepeatWrapping;
    envRTs = [bgRT, env];
    scene.environment = env; scene.environmentIntensity = envI;
    scene.background = bgRT.texture; scene.backgroundIntensity = 1;
    if (!asEnvSun) {
      sunLight = new THREE.DirectionalLight(sun.color.clone(), sun.intensity); sunLight.position.copy(dir).multiplyScalar(300); sunLight.target.position.set(0, 0, 0);
      scene.add(sunLight, sunLight.target);
    }
  }

  function camChanged() {
    const a = ctx.camera.matrixWorld.elements, b = ctx.camera.projectionMatrix.elements; let ch = false;
    for (let i = 0; i < 16; i++) { if (Math.abs(lastCam[i] - a[i]) > 1e-6 || Math.abs(lastCam[16 + i] - b[i]) > 1e-6) ch = true; lastCam[i] = a[i]; lastCam[16 + i] = b[i]; }
    return ch;
  }

  function renderPT(dt, sun, sunDir) {
    if (!pt) return saved.render(dt, sun, sunDir);
    renderer.info.reset();
    if (camChanged()) pt.updateCamera();
    pt.renderSample();
    if (pt.samples < 1) { saved.render(dt, sun, sunDir); return; }          // đang biên dịch shader / chưa đủ một mẫu: vẫn hiện khung raster
    if (!stats.firstSampleMs) stats.firstSampleMs = Math.round(performance.now() - stats.startedAt);
    const f = ctx.pipeline.u.final, u = showQuad.material.uniforms;
    u.tPT.value = pt.target.texture; u.uExposure.value = f.uExposure.value; u.uSat.value = f.uSat.value; u.uContrast.value = f.uContrast.value; u.uVig.value = f.uVig.value;
    renderer.setRenderTarget(null); showQuad.render(renderer);
  }

  async function start() {
    if (!supported) { toast('Máy/trình duyệt này không hỗ trợ chế độ dò tia (cần WebGL2 + texture số thực).'); return false; }
    if (active || starting) return true;
    starting = true;
    try {
      toast('Dò tia: đang gom hình học và dựng BVH… (màn hình đứng vài giây)', 30);
      await nextFrame(); await nextFrame();
      const { WebGLPathTracer } = await import('three-gpu-pathtracer');
      const t0 = performance.now();
      stats.triangles = 0; stats.meshes = 0; stats.skipped = {}; owned = [];
      // đóng băng cảnh
      saved = { render: ctx.pipeline.render, updaters: ctx.updaters.splice(0), skyUpdate: ctx.sky.update };
      if (opt.freeze === false) ctx.updaters.push(...saved.updaters); else ctx.sky.update = () => {};
      proxy = buildProxyScene(); bakeSky(proxy);
      stats.collectMs = Math.round(performance.now() - t0);
      const warn = console.warn; console.warn = (...a) => { if (!String(a[0]).includes('WebGLPathTracer: This class has been deprecated')) warn.apply(console, a); };
      try { pt = new WebGLPathTracer(renderer); } finally { console.warn = warn; }
      // thư viện đọc bảng số ngẫu nhiên theo (chiều mẫu, chỉ số lần nảy) nhưng chỉ cấp 20 hàng cho chỉ số nảy → vượt 20 là mất sạch ánh sáng. Cấp bảng vuông đủ lớn.
      const strat = pt._pathTracer.material.stratifiedTexture, init0 = strat.init.bind(strat);
      strat.init = (count, depth, strata) => { const n = Math.max(count ?? 20, depth ?? 20); return init0(n, n, strata); };
      pt.renderToCanvas = false; pt.rasterizeScene = false; pt.dynamicLowRes = false; pt.renderDelay = 0; pt.fadeDuration = 0; pt.minSamples = 0;
      pt.bounces = opt.bounces ?? 5; pt.filterGlossyFactor = opt.filterGlossy ?? 0.5; pt.multipleImportanceSampling = true;
      pt.transmissiveBounces = opt.alphaBounces ?? 40;      // mỗi lần tia lọt qua chỗ trong suốt của thẻ lá (alphaTest) tốn một lượt; mặc định 10 của thư viện làm tán cây dày đen kịt
      pt.renderScale = opt.scale ?? 1 / renderer.getPixelRatio();
      const tl = opt.tiles ?? 2; pt.tiles.set(tl, tl);
      const ts = opt.textureSize ?? 512; pt.textureSize.set(ts, ts);
      const t1 = performance.now();
      pt.setScene(proxy, ctx.camera);
      stats.bvhMs = Math.round(performance.now() - t1); stats.buildMs = Math.round(performance.now() - t0);
      stats.textures = pt._pathTracer.material.textures.image ? pt._pathTracer.material.textures.image.depth : 0;
      showQuad = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: SHOW_FS, depthTest: false, depthWrite: false,
        uniforms: { tPT: { value: null }, uExposure: { value: 1 }, uSat: { value: 1 }, uContrast: { value: 1 }, uVig: { value: 0 } } }));
      camChanged(); stats.startedAt = performance.now(); stats.firstSampleMs = 0;
      ctx.pipeline.render = renderPT; active = true;
      toast(`Dò tia: ${(stats.triangles / 1e6).toFixed(2)} triệu tam giác, dựng trong ${(stats.buildMs / 1000).toFixed(1)} s — ảnh sẽ mịn dần`, 4);
      if (opt.freeze !== false) setTimeout(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('on'); }, 4000);   // updater của UI đang dừng nên tự tắt thông báo
      return true;
    } catch (e) {
      console.error(e); cleanup(); toast('Không bật được chế độ dò tia: ' + (e && e.message ? e.message : e), 6); throw e;
    } finally { starting = false; }
  }

  function cleanup() {
    if (saved) { ctx.pipeline.render = saved.render; ctx.sky.update = saved.skyUpdate; if (opt.freeze !== false) { const now = ctx.updaters.splice(0); ctx.updaters.push(...saved.updaters, ...now); } saved = null; }
    if (pt) {
      const m = pt._pathTracer && pt._pathTracer.material;
      if (m) for (const k of ['bvh', 'attributesArray', 'materialIndexAttribute', 'materials', 'textures', 'envMapInfo', 'iesProfiles', 'stratifiedTexture', 'stratifiedOffsetTexture']) { try { const v = m[k] ?? (m.uniforms[k] && m.uniforms[k].value); if (v && v.dispose) v.dispose(); } catch (e) { console.warn('[dò tia] giải phóng ' + k + ':', e.message); } }
      try { pt._lowResPathTracer.dispose(); } catch (e) { console.warn('[dò tia]', e.message); }
      try { if (pt._generator && pt._generator.geometry) pt._generator.geometry.dispose(); } catch (e) { console.warn('[dò tia]', e.message); }
      pt.dispose(); pt = null;
    }
    for (const o of owned) o.dispose(); owned = [];
    for (const t of envRTs) t.dispose(); envRTs = [];
    if (showQuad) { showQuad.material.dispose(); showQuad.dispose(); showQuad = null; }
    if (sunLight) { sunLight.dispose(); sunLight = null; }
    proxy = null; active = false;
    renderer.setRenderTarget(null);
  }

  function stop() { if (!active && !saved) return; cleanup(); toast('Đã tắt chế độ dò tia', 2); }

  return {
    supported, start, stop,
    samples: () => (pt ? Math.floor(pt.samples) : 0),
    isActive: () => active,
    /** đặt lại tích lũy (ví dụ sau khi đổi cỡ cửa sổ thủ công) */
    reset: () => { if (pt) pt.reset(); },
    stats,
    /** đối tượng WebGLPathTracer đang chạy (null khi tắt) — để tinh chỉnh nâng cao: bounces, tiles, renderScale… rồi gọi reset() */
    tracer: () => pt,
  };
}
