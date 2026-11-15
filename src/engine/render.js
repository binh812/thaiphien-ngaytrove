// Lõi kết xuất: cảnh HDR + độ sâu → AO → ánh sáng thể tích (tia nắng, sương) → bloom → ống kính + tone map.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { Q, isTouch } from './util.js';
import { installDepthVariants } from './depthvar.js';
import { PENCIL_ON } from './pencil/style.js';
import { installPencil } from './pencil/pencil.js';
import { createPage } from './pencil/page.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const DEPTH_FN = `
uniform sampler2D tDepth; uniform mat4 uProjInv; uniform mat4 uProj;
vec3 viewPos( vec2 uv ) { float d = textureLod( tDepth, uv, 0.0 ).x; vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return v.xyz / v.w; }
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }`;

const AO_FS = `
varying vec2 vUv; uniform vec2 uRes; uniform float uRadius; uniform float uFrame; uniform sampler2D tScene;
${DEPTH_FN}
void main() {
  float d0 = textureLod( tDepth, vUv, 0.0 ).x;
  if ( d0 >= 0.9999 ) { gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); return; }
  vec3 p = viewPos( vUv ); vec2 px = 1.0 / uRes;
  vec3 r = viewPos( vUv + vec2( px.x, 0.0 ) ) - p, l = p - viewPos( vUv - vec2( px.x, 0.0 ) );
  vec3 u = viewPos( vUv + vec2( 0.0, px.y ) ) - p, dn = p - viewPos( vUv - vec2( 0.0, px.y ) );
  vec3 dx = abs( r.z ) < abs( l.z ) ? r : l, dy = abs( u.z ) < abs( dn.z ) ? u : dn;
  vec3 n = normalize( cross( dx, dy ) );
  // nhìn cận (chân dung) thì thu bán kính lại, nếu không các hốc nhỏ như vành tai, hốc mắt bị coi là khuất hoàn toàn và đen kịt
  float rad = uRadius * ( 0.14 + 0.46 * smoothstep( 1.0, 5.0, -p.z ) + min( -p.z, 40.0 ) * 0.035 );
  float bias = min( 0.012 * -p.z + 0.01, rad * 0.25 );     // ngưỡng tự che co theo bán kính, nếu không vật sát máy quay mất hẳn AO
  float rpx = rad * uProj[1][1] * 0.5 / -p.z;            // bán kính theo toạ độ uv (chiều dọc)
  rpx = min( rpx, 0.12 );
  float ang = ign( gl_FragCoord.xy + uFrame * 5.588 ) * 6.2831853, occ = 0.0;
  vec3 gi = vec3( 0.0 ); float gr = rad * 5.0, grpx = min( rpx * 5.0, 0.3 );
  for ( int i = 0; i < AO_N; i++ ) {
    float fi = ( float( i ) + 0.5 ) / float( AO_N ), a = ang + float( i ) * 2.399963;
    vec2 dir = vec2( cos( a ), sin( a ) ) * sqrt( fi ); dir.x *= uRes.y / uRes.x;
    vec3 v = viewPos( vUv + dir * rpx ) - p; float vv = dot( v, v );
    occ += max( 0.0, dot( n, v ) - bias ) / ( vv + 0.004 ) * smoothstep( rad * rad * 2.2, rad * rad * 0.6, vv );
    // ánh sáng hắt: mặt lân cận nằm trong bán cầu pháp tuyến rọi màu của nó sang điểm này
    vec2 gu = vUv + dir * grpx; vec3 gv = viewPos( gu ) - p; float gl2 = dot( gv, gv );
    float gw = max( 0.0, dot( n, gv ) * inversesqrt( gl2 + 1e-4 ) - 0.08 ) * smoothstep( gr * gr * 1.6, gr * gr * 0.3, gl2 ) * step( 0.0, gu.x ) * step( gu.x, 1.0 ) * step( 0.0, gu.y ) * step( gu.y, 1.0 );
    gi += min( textureLod( tScene, gu, 0.0 ).rgb, vec3( 3.0 ) ) * gw;
  }
  float ao = clamp( 1.0 - occ * ( 2.0 * 0.38 * rad / float( AO_N ) ) * 2.4, 0.0, 1.0 );
  gl_FragColor = vec4( gi * ( 2.0 / float( AO_N ) ), ao );
}`;
const AOBLUR_FS = `
varying vec2 vUv; uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 uRes;
void main() {
  float d0 = textureLod( tDepth, vUv, 0.0 ).x; vec4 sum = vec4( 0.0 ); float w = 0.0;
  for ( int y = -2; y < 2; y++ ) for ( int x = -2; x < 2; x++ ) {
    vec2 u = vUv + ( vec2( float( x ), float( y ) ) + 0.5 ) / uRes;
    float k = min( 1.0 / ( 0.0001 + abs( textureLod( tDepth, u, 0.0 ).x - d0 ) * 4000.0 ), 1.0e4 ); sum += textureLod( tAO, u, 0.0 ) * k; w += k;
  }
  gl_FragColor = sum / w;
}`;

const VOL_FS = `
precision highp sampler2DShadow;
varying vec2 vUv; uniform sampler2DShadow tShadow; uniform mat4 uShadowMat; uniform mat4 uCamWorld;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmbCol; uniform float uDensity; uniform float uLowFog; uniform float uFrame; uniform float uTime; uniform float uShadowOn;
${DEPTH_FN}
void main() {
  vec3 vp = viewPos( vUv ); float d0 = textureLod( tDepth, vUv, 0.0 ).x;
  vec3 ro = uCamWorld[3].xyz, rdv = normalize( vp ), rd = mat3( uCamWorld ) * rdv;
  float dist = d0 >= 0.9999 ? 160.0 : min( length( vp ), 160.0 );
  float stepL = dist / float( VOL_N ), jit = ign( gl_FragCoord.xy + uFrame * 3.71 );
  float cosT = dot( rd, uSunDir ), g = 0.72;
  float phase = min( 0.0795775 * ( 1.0 - g * g ) / pow( 1.0 + g * g - 2.0 * g * cosT, 1.5 ), 0.9 ) + 0.03;
  vec3 scat = vec3( 0.0 ); float T = 1.0;
  for ( int i = 0; i < VOL_N; i++ ) {
    vec3 wp = ro + rd * ( float( i ) + jit ) * stepL;
    float dens = uDensity * exp( -max( wp.y, 0.0 ) * 0.045 ) + uLowFog * exp( -max( wp.y, 0.0 ) * 0.55 ) * ( 0.75 + 0.25 * sin( wp.x * 0.11 + uTime * 0.07 ) * sin( wp.z * 0.13 - uTime * 0.05 ) );
    vec4 sc = uShadowMat * vec4( wp, 1.0 );
    float inside = step( 0.0, sc.x ) * step( sc.x, 1.0 ) * step( 0.0, sc.y ) * step( sc.y, 1.0 ) * step( sc.z, 1.0 );
    float lit = mix( 1.0, texture( tShadow, vec3( sc.xy, sc.z - 0.0015 ) ), inside * uShadowOn );
    float a = dens * stepL;
    scat += T * a * ( uSunCol * lit * phase + uAmbCol * 0.055 );
    T *= exp( -a );
  }
  gl_FragColor = vec4( scat, T );
}`;

const COMP_FS = `
varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tVol;
uniform float uAO; uniform float uVol; uniform vec2 uVolRes; uniform float uSkyGain; uniform float uGI; uniform float uCS; uniform float uSSR; uniform vec3 uSunV; uniform float uFrame;
${DEPTH_FN}
vec2 toUv( vec3 vp ) { vec4 c = uProj * vec4( vp, 1.0 ); return c.xy / c.w * 0.5 + 0.5; }
float inScreen( vec2 u ) { return step( 0.0, u.x ) * step( u.x, 1.0 ) * step( 0.0, u.y ) * step( u.y, 1.0 ); }
void main() {
  vec4 sc0 = textureLod( tScene, vUv, 0.0 ); vec3 col = sc0.rgb; float d = textureLod( tDepth, vUv, 0.0 ).x;
  vec3 p = viewPos( vUv ), ddx = dFdx( p ), ddy = dFdy( p ); vec4 g = texture2D( tAO, vUv );
  if ( d >= 0.9999 ) col *= uSkyGain;
  else {
    vec3 n = vec3( 0.0, 0.0, 1.0 ); float jit = ign( gl_FragCoord.xy + uFrame * 7.13 );
    #if defined( TP_CS ) || defined( TP_SSR )
    float edge = 0.0;
    { n = normalize( cross( ddx, ddy ) ); if ( dot( n, p ) > 0.0 ) n = -n; edge = step( 0.012 * -p.z, max( abs( ddx.z ), abs( ddy.z ) ) * max( dot( n, -normalize( p ) ), 0.15 ) ); }
    #endif
    #ifdef TP_SSR
    float refl = ( 1.0 - sc0.a ) * uSSR;
    if ( refl > 0.02 && edge < 0.5 ) {
      vec3 v = normalize( p ), r = reflect( v, n ); float t = 0.12 + 0.1 * jit, hit = 0.0, lastT = 0.0; vec2 hu = vUv;
      for ( int i = 0; i < 26; i++ ) {
        vec3 q = p + r * t; vec2 u = toUv( q ); float sz = viewPos( u ).z, dz = sz - q.z;
        float h = step( 0.0, dz ) * step( dz, 0.35 + t * 0.12 ) * inScreen( u ) * step( q.z, -0.15 ) * ( 1.0 - hit );
        hu = mix( hu, u, h ); hit = max( hit, h ); lastT = mix( lastT, t, 1.0 - hit ); t *= 1.24;
      }
      vec2 e = smoothstep( vec2( 0.0 ), vec2( 0.08 ), hu ) * smoothstep( vec2( 0.0 ), vec2( 0.08 ), 1.0 - hu );
      float fres = 0.05 + 0.95 * pow( 1.0 - max( dot( -v, n ), 0.0 ), 4.0 );
      float k = hit * e.x * e.y * refl * clamp( fres * 1.6, 0.0, 1.0 ) * step( textureLod( tDepth, hu, 0.0 ).x, 0.9998 );
      col = mix( col, min( textureLod( tScene, hu, 0.0 ).rgb, vec3( 6.0 ) ), k );
    }
    #endif
    #ifdef TP_CS
    if ( uCS > 0.0 && edge < 0.5 && dot( n, uSunV ) > 0.12 ) {
      float len = 0.03 + min( -p.z, 60.0 ) * 0.012, sh = 0.0; vec3 q0 = p + n * ( 0.03 + 0.01 * -p.z ) + uSunV * len;
      for ( int i = 0; i < 10; i++ ) {
        vec3 q = q0 + uSunV * len * ( float( i ) + jit ); vec2 u = toUv( q ); float dz = viewPos( u ).z - q.z;
        sh = max( sh, step( 0.03 + 0.008 * -p.z, dz ) * step( dz, 0.25 + 0.02 * -p.z ) * inScreen( u ) );
      }
      col *= 1.0 - 0.42 * sh * uCS;
    }
    #endif
    if ( uAO > 0.0 ) {
      float ao = mix( 1.0, g.a, uAO );
      col *= mix( vec3( 0.02, 0.025, 0.04 ), vec3( 1.0 ), ao * ao );
      float mx = max( col.r, max( col.g, col.b ) ) + 0.02;
      col += g.rgb * uGI * mix( vec3( 0.45 ), col / mx, 0.7 ) * ao;
    }
  }
  if ( uVol > 0.0 ) {
    vec2 o = 0.75 / uVolRes;
    vec4 v = ( texture2D( tVol, vUv + o ) + texture2D( tVol, vUv - o ) + texture2D( tVol, vUv + vec2( o.x, -o.y ) ) + texture2D( tVol, vUv + vec2( -o.x, o.y ) ) ) * 0.25;
    col = col * v.a + v.rgb;
  }
  gl_FragColor = vec4( max( col, 0.0 ), 1.0 );
}`;

const FINAL_FS = `
varying vec2 vUv; uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float uExposure; uniform float uTime; uniform vec2 uRes;
uniform vec3 uSunUV; uniform vec3 uSunCol; uniform float uFlare; uniform float uSat; uniform float uContrast; uniform float uVig; uniform float uGrain; uniform float uCA;
uniform float uFocus; uniform float uDof; uniform mat4 uProjInv;
#define saturate( a ) clamp( a, 0.0, 1.0 )
${THREE.ShaderChunk.tonemapping_pars_fragment}
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
float viewZ( vec2 uv ) { float d = texture2D( tDepth, uv ).x; vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 ); return -v.z / v.w; }
void main() {
  vec2 c = vUv - 0.5; float r2 = dot( c, c );
  vec3 col;
  if ( uDof > 0.0 ) {
    float z = viewZ( vUv ), coc = clamp( abs( z - uFocus ) / max( z, 0.1 ) * uDof, 0.0, 1.0 ) * 0.012; vec3 acc = vec3( 0.0 ); float a0 = hash( gl_FragCoord.xy ) * 6.283;
    for ( int i = 0; i < 16; i++ ) { float fi = ( float( i ) + 0.5 ) / 16.0, a = a0 + float( i ) * 2.399963; vec2 o = vec2( cos( a ), sin( a ) ) * sqrt( fi ) * coc; o.x *= uRes.y / uRes.x; acc += texture2D( tDiffuse, vUv + o ).rgb; }
    col = acc / 16.0;
  } else {
    vec2 ca = c * r2 * uCA;
    col = vec3( texture2D( tDiffuse, vUv - ca ).r, texture2D( tDiffuse, vUv ).g, texture2D( tDiffuse, vUv + ca ).b );
  }
  // loá ống kính: quầng, vệt ngang, bóng ma — che khuất theo độ sâu quanh mặt trời
  if ( uFlare > 0.0 && uSunUV.z > 0.0 ) {
    float occ = 0.0;
    for ( int i = 0; i < 8; i++ ) { float a = float( i ) * 0.7854; vec2 o = vec2( cos( a ), sin( a ) ) * 0.008; o.x *= uRes.y / uRes.x; vec2 s = uSunUV.xy + o; occ += ( s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 ) ? step( 0.9999, texture2D( tDepth, s ).x ) : 0.0; }
    occ = occ / 8.0 * uFlare * uSunUV.z;
    vec2 asp = vec2( uRes.x / uRes.y, 1.0 ), dv = ( vUv - uSunUV.xy ) * asp; float dl = length( dv );
    vec3 fl = uSunCol * ( 0.006 / ( dl * 14.0 + 0.25 ) + 0.16 * exp( -dl * dl * 300.0 ) );
    fl += uSunCol * 0.04 * exp( -abs( dv.y ) * 130.0 ) * exp( -abs( dv.x ) * 2.6 );
    vec2 gh = ( vUv - 0.5 ) + ( uSunUV.xy - 0.5 ) * 0.6; float gd = length( gh * asp );
    fl += vec3( 0.25, 0.5, 0.3 ) * 0.035 * smoothstep( 0.09, 0.075, gd ) * smoothstep( 0.02, 0.075, gd );
    gh = ( vUv - 0.5 ) + ( uSunUV.xy - 0.5 ) * 1.5; gd = length( gh * asp );
    fl += vec3( 0.5, 0.3, 0.6 ) * 0.025 * smoothstep( 0.16, 0.13, gd );
    col += fl * occ;
  }
  col *= uExposure;
  col *= 1.0 - uVig * smoothstep( 0.15, 0.85, r2 * 2.0 );
  col = AgXToneMapping( col );
  col = pow( col, vec3( 1.0 / 2.2 ) );
  float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( vec3( l ), col, uSat );
  col = ( col - 0.5 ) * uContrast + 0.5;
  col += ( hash( gl_FragCoord.xy + fract( uTime ) * 91.7 ) - 0.5 ) * uGrain;
  gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}`;

const sm = (fs, uniforms, defines) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, defines: defines || {}, depthTest: false, depthWrite: false });

export function createPipeline(container, scene, camera) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) throw new Error('Trình duyệt/GPU này không hỗ trợ WebGL2 với bộ đệm màu số thực, không chạy được bản đồ họa này.');
  const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; installDepthVariants();
  renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // tự tone map ở pass cuối
  renderer.info.autoReset = false;
  if (PENCIL_ON) installPencil(renderer);      // kiểu chì màu (bản thử): vá shader của three trước khi vật liệu đầu tiên biên dịch
  container.appendChild(renderer.domElement);
  const maxTex = renderer.capabilities.maxTextureSize;

  const size = new THREE.Vector2();
  const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: PENCIL_ON ? Math.max(Q.msaa, Math.min(isTouch ? 2 : 4, renderer.capabilities.maxSamples)) : Q.msaa, depthTexture: new THREE.DepthTexture(4, 4, THREE.UnsignedIntType) });
  const mkRT = (type) => new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const aoRT = mkRT(THREE.HalfFloatType), aoRT2 = mkRT(THREE.HalfFloatType), volRT = mkRT(THREE.HalfFloatType);

  const common = { tDepth: { value: sceneRT.depthTexture }, uProjInv: { value: camera.projectionMatrixInverse }, uProj: { value: camera.projectionMatrix }, uFrame: { value: 0 } };
  const aoMat = sm(AO_FS, { ...common, tScene: { value: sceneRT.texture }, uRes: { value: new THREE.Vector2() }, uRadius: { value: 0.55 } }, { AO_N: Math.max(4, Q.ao) });
  const blurMat = sm(AOBLUR_FS, { tAO: { value: aoRT.texture }, tDepth: common.tDepth, uRes: { value: new THREE.Vector2() } });
  const volMat = sm(VOL_FS, {
    ...common, tShadow: { value: null }, uShadowMat: { value: new THREE.Matrix4() }, uCamWorld: { value: camera.matrixWorld },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmbCol: { value: new THREE.Color(0.5, 0.6, 0.8) },
    uDensity: { value: 0.004 }, uLowFog: { value: 0 }, uTime: { value: 0 }, uShadowOn: { value: 1 },
  }, { VOL_N: Math.max(4, Q.vol) });
  const compDef = {}; if (Q.ao >= 12) { compDef.TP_CS = 1; compDef.TP_SSR = 1; }
  const compMat = sm(COMP_FS, { ...common, tScene: { value: sceneRT.texture }, tAO: { value: aoRT2.texture }, tVol: { value: volRT.texture }, uAO: { value: Q.ao ? 1 : 0 }, uVol: { value: Q.vol ? 1 : 0 }, uVolRes: { value: new THREE.Vector2() }, uSkyGain: { value: 1 },
    uGI: { value: 0.55 }, uCS: { value: 1 }, uSSR: { value: 1 }, uSunV: { value: new THREE.Vector3(0, 1, 0) } }, compDef);
  const finalMat = sm(FINAL_FS, {
    tDiffuse: { value: null }, tDepth: { value: sceneRT.depthTexture }, uExposure: { value: 1 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() },
    uSunUV: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uFlare: { value: 1 }, uSat: { value: 1.18 }, uContrast: { value: 1.27 },
    toneMappingExposure: { value: 1 }, uVig: { value: 0.32 }, uGrain: { value: 0.032 }, uCA: { value: 0.004 }, uFocus: { value: 6 }, uDof: { value: 0 }, uProjInv: { value: camera.projectionMatrixInverse },
  });
  const fsq = new FullScreenQuad(aoMat);
  const page = PENCIL_ON ? createPage(renderer, sceneRT, camera) : null;      // chì màu: một lượt "trang giấy" thay cả chuỗi hậu kỳ

  const composer = new EffectComposer(renderer);
  const compPass = new ShaderPass(compMat, 'tNone'); composer.addPass(compPass);
  let bloom = null;
  if (Q.bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.7, 2.4); composer.addPass(bloom); }
  const finalPass = new ShaderPass(finalMat, 'tDiffuse'); composer.addPass(finalPass);

  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h); renderer.getDrawingBufferSize(size);
    sceneRT.setSize(size.x, size.y);
    const hw = Math.max(2, size.x >> 1), hh = Math.max(2, size.y >> 1), qw = Math.max(2, size.x >> 2), qh = Math.max(2, size.y >> 2);
    aoRT.setSize(hw, hh); aoRT2.setSize(hw, hh); volRT.setSize(qw, qh);
    aoMat.uniforms.uRes.value.set(hw, hh); blurMat.uniforms.uRes.value.set(hw, hh); compMat.uniforms.uVolRes.value.set(qw, qh); finalMat.uniforms.uRes.value.set(size.x, size.y);
    composer.setPixelRatio(dpr); composer.setSize(w, h);
    camera.aspect = w / h; if (h > w * 1.15 && camera.fov < 78) camera.fov = 78; camera.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);

  let frame = 0;
  const layers = { ao: true, vol: true, bloom: true, lens: true, gi: true, cs: true, ssr: true };
  let csK = 1;
  const _v = new THREE.Vector3();
  function render(dt, sun, sunDir) {
    frame++; renderer.info.reset();
    renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
    if (page) { page.render(); return; }
    common.uFrame.value = frame % 64;
    if (Q.ao && layers.ao) {
      fsq.material = aoMat; renderer.setRenderTarget(aoRT); fsq.render(renderer);
      fsq.material = blurMat; renderer.setRenderTarget(aoRT2); fsq.render(renderer);
    }
    compMat.uniforms.uAO.value = Q.ao && layers.ao ? 1 : 0;
    const volOn = Q.vol && layers.vol && sun.shadow.map;
    if (volOn) {
      volMat.uniforms.tShadow.value = sun.shadow.map.depthTexture; volMat.uniforms.uShadowMat.value.copy(sun.shadow.matrix); volMat.uniforms.uSunDir.value.copy(sunDir);
      fsq.material = volMat; renderer.setRenderTarget(volRT); fsq.render(renderer);
    }
    compMat.uniforms.uVol.value = volOn ? 1 : 0;
    compMat.uniforms.uSunV.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    compMat.uniforms.uSSR.value = layers.ssr ? 1 : 0; compMat.uniforms.uGI.value = layers.gi ? 0.55 : 0; compMat.uniforms.uCS.value = layers.cs ? csK : 0;
    if (bloom) bloom.enabled = layers.bloom;
    // vị trí mặt trời trên màn hình cho loá ống kính
    _v.copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.3 && Math.abs(_v.y) < 1.3 ? 1 : 0;
    finalMat.uniforms.uSunUV.value.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, layers.lens ? vis : 0);
    finalMat.uniforms.uTime.value += dt; volMat.uniforms.uTime.value += dt;
    renderer.setRenderTarget(null); composer.render(dt);
  }
  const available = { ao: Q.ao > 0, vol: Q.vol > 0, bloom: !!Q.bloom, lens: true, gi: Q.ao > 0, cs: Q.ao >= 12, ssr: Q.ao >= 12 };
  return { page, renderer, render, resize, layers, available, maxTex, setContact: (k) => { csK = k; }, u: { ao: aoMat.uniforms, vol: volMat.uniforms, comp: compMat.uniforms, final: finalMat.uniforms }, bloom };
}
