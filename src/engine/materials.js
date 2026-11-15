// Vật liệu PBR dùng chung. Màu từng khối nằm ở màu đỉnh, nên mỗi "loại" vật liệu chỉ là một lệnh vẽ cho mỗi vùng.
import * as THREE from 'three';
import { texSet, grungeTex } from './textures.js';
import { Q } from './util.js';
import { PENCIL_ON } from './pencil/style.js';
import { pencilKind, pencilGlass } from './pencil/pencil.js';

// uniform toàn cục gắn vào mọi shader có vá
export const U = {
  uTime: { value: 0 }, uWet: { value: 0 }, uRain: { value: 0 }, uGrunge: { value: grungeTex },
  uWindT: { value: 0 }, uWind: { value: 0.35 }, uNight: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uHeight: { value: null },
};

const VARY = 'varying vec3 vWPos; varying vec3 vWNrm;';
const VERT_SET = `
{ vec4 tpP = vec4( transformed, 1.0 ); vec3 tpN = objectNormal;
#ifdef USE_INSTANCING
  tpP = instanceMatrix * tpP; tpN = mat3( instanceMatrix ) * tpN;
#endif
  vWPos = ( modelMatrix * tpP ).xyz; vWNrm = normalize( mat3( modelMatrix ) * tpN ); }`;
const FRAG_HEAD = `${VARY}
uniform sampler2D uGrunge; uniform float uWet; uniform float uTime; uniform float uRain;
float tpPuddle = 0.0; float tpRefl = 0.0;
#ifdef TP_VIS
uniform sampler2D uHeight;
float tpRoof( vec2 q ) { return 59.0 - textureLod( uHeight, vec2( ( q.x + 130.0 ) / 260.0, 1.0 - ( q.y + 75.0 ) / 220.0 ), 0.0 ).x * 79.0; }
#endif`;
const FRAG_COLOR = `
#ifdef TP_WALL
if ( abs( vWNrm.y ) < 0.5 ) {
  vec2 gu = vec2( dot( vWPos.xz, vec2( abs( vWNrm.z ), abs( vWNrm.x ) ) ), vWPos.y );
  vec4 g1 = texture2D( uGrunge, gu * 0.11 );
  vec4 g2 = texture2D( uGrunge, gu * 0.031 + 0.37 );
  float streak = texture2D( uGrunge, vec2( gu.x * 0.35, gu.y * 0.06 ) ).b;
  float damp = smoothstep( 1.3, 0.0, vWPos.y ) * ( 0.35 + g2.g );
  float stain = smoothstep( 0.45, 0.8, g2.a ) * 0.5;
  float under = smoothstep( 0.55, 0.0, fract( ( vWPos.y - 0.15 ) / 4.2 ) ) * step( 4.0, vWPos.y ) * g1.g;
  float k = clamp( damp * 0.7 + stain * 0.5 + streak * 0.22 * g2.r + under * 0.35, 0.0, 0.8 ) * TP_WEATHER;
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.42, 0.40, 0.33 ), k );
  diffuseColor.rgb *= 0.84 + 0.3 * g1.r * g2.g * 2.0;
  diffuseColor.rgb *= 1.0 - 0.18 * uWet * g2.g;
}
#endif
#ifdef TP_GROUND
if ( vWNrm.y > 0.7 ) {
  vec4 g1 = texture2D( uGrunge, vWPos.xz * 0.045 );
  vec4 g2 = texture2D( uGrunge, vWPos.xz * 0.013 + 0.21 );
  diffuseColor.rgb *= ( 0.74 + 0.42 * g2.r ) * ( 0.9 + 0.2 * g1.g );
  float pm = g1.a * 0.6 + g2.g * 0.4;
  tpPuddle = smoothstep( 0.66 - 0.2 * uWet, 0.72 - 0.16 * uWet, pm ) * uWet;
  diffuseColor.rgb *= mix( 1.0, 0.5, max( uWet * 0.75, tpPuddle ) );
}
#endif`;
const FRAG_ROUGH = `
#ifdef TP_GROUND
roughnessFactor = mix( roughnessFactor * mix( 1.0, 0.45, uWet ), 0.03, tpPuddle );
#endif`;
const FRAG_NORMAL = `
#if defined( TP_GROUND ) && defined( USE_NORMALMAP_TANGENTSPACE )
{
  vec3 flatN = nonPerturbedNormal;
  if ( uRain > 0.01 && tpPuddle > 0.01 ) {
    vec2 cell = floor( vWPos.xz * 2.2 ), f = fract( vWPos.xz * 2.2 ) - 0.5;
    float h = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    float t = fract( uTime * 0.9 + h * 7.0 ), d = length( f + ( h - 0.5 ) * 0.4 );
    float ring = sin( ( d - t * 0.5 ) * 60.0 ) * smoothstep( 0.06, 0.0, abs( d - t * 0.5 ) ) * ( 1.0 - t ) * uRain;
    flatN = normalize( flatN + vec3( normalize( f + 1e-4 ) * ring * 0.35, 0.0 ).xzy * 0.0 + ( viewMatrix * vec4( normalize( f + 1e-4 ).x * ring * 0.3, 0.0, normalize( f + 1e-4 ).y * ring * 0.3, 0.0 ) ).xyz );
  }
  normal = normalize( mix( normal, flatN, tpPuddle ) );
}
#endif`;

// three ghi đè envMapIntensity bằng scene.environmentIntensity khi dùng scene.environment → tự nhân hệ số trong shader
const FRAG_ENV = `
#ifdef TP_ENV
  #if defined( USE_ENVMAP ) && defined( RE_IndirectDiffuse )
  iblIrradiance *= TP_ENV;
  #endif
  #if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  radiance *= TP_ENV;
  #endif
#endif
#if defined( TP_VIS ) && defined( USE_ENVMAP )
{ // độ thấy trời: nhìn ra TP_VIS hướng quanh điểm, mái/tường càng cao so với khoảng cách thì càng che
  vec3 tpP = vWPos + vWNrm * 0.3; float tpV = 0.0, tpW = 0.0;
  for ( int i = 0; i < TP_VIS; i++ ) {
    float a = ( float( i ) + 0.35 ) * 6.2831853 / float( TP_VIS ); vec2 dir = vec2( cos( a ), sin( a ) );
    float w = 0.3 + max( 0.0, dot( dir, vWNrm.xz ) );
    float o1 = clamp( 1.0 - ( tpRoof( tpP.xz + dir * 1.3 ) - tpP.y - 0.2 ) / 2.2, 0.0, 1.0 );
    float o2 = clamp( 1.0 - ( tpRoof( tpP.xz + dir * 4.5 ) - tpP.y - 0.2 ) / 7.0, 0.0, 1.0 );
    tpV += min( o1, o2 ) * w; tpW += w;
  }
  tpV /= tpW;
  tpV *= mix( 1.0, 0.5, smoothstep( 0.5, 1.4, tpRoof( tpP.xz ) - tpP.y ) );
  #if defined( RE_IndirectDiffuse )
  iblIrradiance *= mix( 0.2, 1.0, tpV );
  #endif
  #if defined( RE_IndirectSpecular )
  radiance *= mix( 0.3, 1.0, tpV );
  #endif
}
#endif`;
const FRAG_OUT = `
#ifdef TP_GROUND
tpRefl = max( tpPuddle * 0.95, uWet * 0.3 );
#endif
#ifdef TP_REFL
tpRefl = max( tpRefl, TP_REFL * ( 1.0 - roughnessFactor ) );
#endif
gl_FragColor.a = 1.0 - tpRefl;`;
function patch(m, defines) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uGrunge: U.uGrunge, uWet: U.uWet, uTime: U.uTime, uRain: U.uRain, uHeight: U.uHeight });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VARY).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_SET);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + defines + '\n' + FRAG_HEAD)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n' + FRAG_ENV)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n' + FRAG_OUT);
  };
  m.customProgramCacheKey = () => 'tp|' + defines;
}

// loại vật liệu: tex = bộ texture, w = độ phong hoá tường, g = mặt đất đọng nước
const KINDS = {
  paint:     { tex: 'plaster', rough: 1, w: 1 },
  paintIn:   { tex: 'plaster', rough: 1 },
  concrete:  { tex: 'concrete', rough: 1, w: 0.8, g: true },
  pavers:    { tex: 'pavers', rough: 1, g: true },
  brickPave: { tex: 'brickPave', rough: 1, g: true },
  asphalt:   { tex: 'asphalt', rough: 1, g: true },
  court:     { tex: 'court', rough: 1, g: true },
  roofTile:  { tex: 'roofTile', rough: 1 },
  floorTile: { tex: 'floorTile', rough: 1, refl: 1 },
  wallTile:  { tex: 'wallTile', rough: 1, refl: 0.8 },
  wood:      { tex: 'wood', rough: 1 },
  bark:      { tex: 'bark', rough: 1 },
  grass:     { tex: 'grass', rough: 1 },
  metalCorr: { tex: 'metalCorr', rough: 1, metal: 0.6 },
  sand:      { tex: 'sand', rough: 1 },
  brick:     { tex: 'brick', rough: 1, w: 0.6 },
  granite:   { tex: 'granite', rough: 1, refl: 1 },
  fabric:    { tex: 'fabric', rough: 1, side: THREE.DoubleSide },
  flat:      { rough: 0.78 },
  plastic:   { rough: 0.38 },
  gloss:     { rough: 0.14, refl: 0.8 },
  rubber:    { rough: 0.95 },
  steel:     { rough: 0.32, metal: 1 },
  metalPaint:{ rough: 0.42, metal: 0.25 },
  gold:      { rough: 0.28, metal: 1 },
  foliage:   { rough: 0.85 },
};

const cache = new Map();
/** Vật liệu theo loại (dùng màu đỉnh). */
export function kindMat(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const k = KINDS[kind]; if (!k) throw new Error('Không có loại vật liệu: ' + kind);
  const p = { vertexColors: true, roughness: k.rough, metalness: k.metal || 0, side: k.side || THREE.FrontSide };
  let meters = 1;
  if (k.tex) { const t = texSet(k.tex); p.map = t.map; p.normalMap = t.normalMap; p.roughnessMap = t.roughnessMap; meters = t.meters; if (t.scan) { p.aoMap = t.aoMap; p.aoMapIntensity = 0.9; p.color = new THREE.Color().setRGB(t.gain[0], t.gain[1], t.gain[2]); if (k.metal) p.metalnessMap = t.aoMap; } }
  const m = new THREE.MeshStandardMaterial(p); m.userData.meters = meters; m.name = kind;
  patch(m, (Q.ao > 0 && !k.side ? `#define TP_VIS ${Q.ao >= 12 ? 6 : 4}\n` : '') + (k.refl ? `#define TP_REFL ${k.refl.toFixed(2)}\n` : '') + (k.env ? `#define TP_ENV ${k.env.toFixed(2)}
` : '') + (k.w ? `#define TP_WALL\n#define TP_WEATHER ${k.w.toFixed(2)}\n` : '') + (k.g ? '#define TP_GROUND\n' : ''));
  if (PENCIL_ON) pencilKind(m, kind);      // kiểu chì màu (bản thử): màu phẳng + nét, bỏ phần vá phong hoá
  cache.set(kind, m); return m;
}
export const kindMeters = (kind) => (KINDS[kind] && KINDS[kind].tex ? texSet(KINDS[kind].tex).meters : 1);

// kính: phản chiếu môi trường, hơi xanh
export const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3436, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.42, envMapIntensity: 2.2, ior: 1.52, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
// vật phát sáng (bóng đèn, màn LED): màu đỉnh × cường độ
if (PENCIL_ON) pencilGlass(glassMat);
export const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
export const glowDim = { value: 1 };
glowMat.onBeforeCompile = (sh) => { sh.uniforms.uGlow = glowDim; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uGlow;'); };

/** Vật liệu có ảnh canvas (biển hiệu): hơi nhám, không dùng màu đỉnh */
export function signMat(tex, o = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? 0.6, metalness: 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide, emissive: o.glow ? 0xffffff : 0x000000, emissiveMap: o.glow ? tex : null, emissiveIntensity: o.glow || 0 });
}
