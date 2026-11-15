// Lượt "trang giấy" của kiểu chì màu: biến cảnh đã vẽ thành một bức vẽ trong sổ phác thảo.
//
// Phỏng theo/chép có sửa từ "Coloured pencil" của Patch, https://patch.gg/blendi/coloured-pencil (commit 0400f90, src/page.js),
// giấy phép MIT — xem LICENCE-pencil.md.
// Cảnh được vẽ thành "phần trắng của giấy còn lại sau khi chì phủ lên", kèm độ sâu. Rồi:
//   1. vẽ viền: nơi một vật kết thúc trước vật khác, hay một mặt gập góc gắt, có một nét chì than mềm — tìm chỉ từ độ sâu,
//      bằng cách hỏi tại mỗi điểm xem các điểm bên cạnh có nằm trên cùng một mặt phẳng với nó không;
//   2. đặt lên giấy: tờ giấy trắng ấm có thớ, lộ qua màu thành đốm trắng; về phía mép trang bức vẽ chưa xong, nhường chỗ cho giấy trơn.
// Khác bản gốc: không tự vẽ cảnh — đọc bộ đệm màu + depthTexture sẵn có của pipeline (render.js), thay cho cả chuỗi AO/bloom/AgX.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { U } from '../materials.js';
import { PX, pxFor } from './pencil.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const FS = /* glsl */ `
precision highp float;
uniform sampler2D tDrawn; uniform sampler2D tDepth; uniform vec2 uSize; uniform mat4 uInverse; uniform float uPixel; uniform float uScale; uniform float uNear; uniform float uDepthSteps; uniform float uNight; uniform float uRain; uniform float uTime; uniform sampler2D tSign; uniform float uSign; uniform vec4 uLights[ 8 ];      // nguồn sáng đêm: xy = vị trí trên màn hình (uv), z = bán kính quầng (theo chiều cao màn hình), w = khoảng cách tới máy quay
varying vec2 vUv;
vec3 seen( vec2 uv ) { vec4 p = uInverse * vec4( uv * 2.0 - 1.0, textureLod( tDepth, uv, 0.0 ).r * 2.0 - 1.0, 1.0 ); return p.xyz / p.w; }
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
float soft( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ), mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y ); }
void main() {
  vec2 px = gl_FragCoord.xy, t = 1.0 / uSize;
  // thớ giấy tại điểm ảnh này trên tờ giấy
  float tooth = soft( px * 0.55 / uScale ) * 0.6 + soft( px * 1.3 / uScale + 9.0 ) * 0.4;
  // --- viền ---
  float w = max( uScale, 1.0 ) * 0.85;
  vec3 P = seen( vUv ), L = seen( vUv - vec2( t.x * w, 0.0 ) ), R = seen( vUv + vec2( t.x * w, 0.0 ) ), D = seen( vUv - vec2( 0.0, t.y * w ) ), U = seen( vUv + vec2( 0.0, t.y * w ) );
  vec3 ax = abs( R.z - P.z ) < abs( P.z - L.z ) ? R - P : P - L, ay = abs( U.z - P.z ) < abs( P.z - D.z ) ? U - P : P - D;
  vec3 N = normalize( cross( ax, ay ) );
  float off = max( max( abs( dot( N, L - P ) ), abs( dot( N, R - P ) ) ), max( abs( dot( N, D - P ) ), abs( dot( N, U - P ) ) ) ) / ( min( min( -L.z, -R.z ), min( -D.z, min( -U.z, -P.z ) ) ) * uPixel * w );
  // sai số lượng tử của bộ đệm độ sâu (uDepthSteps mức, mặt cắt gần uNear): càng xa càng phải nới ngưỡng, kẻo mặt phẳng xa nổi vằn
  float rough = 5.0 * -P.z / ( uNear * uDepthSteps * uPixel );
  // (ấn không đều tay, và nhạt dần khi ra xa)
  float line = smoothstep( 0.34 + rough, 0.7 + rough * 1.5, off ) * ( 0.45 + 0.55 * soft( px * 0.035 / uScale + 4.0 ) ) * ( 0.6 + 0.5 * tooth ) * mix( 1.0, 0.45, smoothstep( 40.0, 400.0, -P.z ) );
  vec4 drawn = texture2D( tDrawn, vUv );
  line *= smoothstep( 0.2, 0.9, drawn.a ) * 0.82 + 0.18;      // alpha thấp = bên trong tán lá: viền giữa các thẻ lá chỉ vẽ phớt
  vec3 left = drawn.rgb * mix( vec3( 1.0 ), vec3( 0.2, 0.17, 0.22 ), clamp( line * 0.8, 0.0, 1.0 ) );

  // --- trang giấy ---
  vec3 col = pow( clamp( left, 0.0, 1.0 ), vec3( 1.0 / 2.2 ) );
  // đốm giấy trơn, nơi sáp bỏ qua chỗ trũng: nhiều hơn ở chỗ màu nhạt
  float bare = smoothstep( 0.62, 0.9, 1.0 - tooth ) * ( 0.25 + 0.5 * dot( col, vec3( 0.333 ) ) );
  col = mix( col, vec3( 1.0 ), bare );
  // mưa: những vệt chì xám xiên trên trang (đổi chỗ vài lần mỗi giây, như vẽ lại)
  if ( uRain > 0.02 ) {
    vec2 rp = vec2( px.x + px.y * 0.28, px.y ) / uScale; float fr = floor( uTime * 9.0 );
    float cell = floor( rp.x / 7.0 ), seg = fract( rp.y / 150.0 + hash( vec2( cell, fr ) ) );
    float streak = step( 0.86, hash( vec2( cell, fr + 3.0 ) ) ) * smoothstep( 0.0, 0.1, seg ) * smoothstep( 0.55, 0.3, seg ) * smoothstep( 3.5, 1.0, abs( fract( rp.x / 7.0 ) - 0.5 ) * 7.0 );
    col = mix( col, vec3( 0.45, 0.47, 0.55 ), streak * uRain * 0.55 * ( 0.5 + 0.6 * tooth ) );
  }
  // chữ ký góc tranh (chỉ khi lưu ảnh kỷ yếu)
  if ( uSign > 0.5 ) {
    vec2 su = ( vUv - vec2( 0.60, 0.045 ) ) / vec2( 0.36, 0.36 * 0.125 * uSize.x / uSize.y );
    if ( su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0 ) col = mix( col, vec3( 0.2, 0.19, 0.26 ), texture2D( tSign, su ).a * ( 0.55 + 0.4 * tooth ) );
  }
  // chưa vẽ xong về phía mép tờ giấy
  vec2 q = min( vUv, 1.0 - vUv ) * vec2( uSize.x / uSize.y, 1.0 ); if ( uSize.x < uSize.y ) q = min( vUv, 1.0 - vUv ) * vec2( 1.0, uSize.y / uSize.x );
  float edge = min( q.x, q.y ) + 0.035 * ( soft( px * 0.012 / uScale ) - 0.5 ) + 0.02 * ( soft( px * 0.05 / uScale ) - 0.5 );
  float done = smoothstep( 0.006, 0.05, edge );
  float grain = ( 0.97 + 0.045 * soft( px * 0.3 / uScale ) ) * ( 1.0 - 0.035 * soft( px * 0.006 / uScale + 3.0 ) );
  vec3 day = mix( vec3( 1.0 ), col, done ) * vec3( 0.975, 0.955, 0.915 ) * grain;
  float nk = smoothstep( 0.3, 0.6, uNight );      // đổi giấy nhanh quanh lúc chập tối, tránh quãng lưng chừng màu bùn
  if ( nk < 0.002 ) { gl_FragColor = vec4( day, 1.0 ); return; }
  // --- ban đêm: vẽ trên GIẤY TỐI MÀU (xanh chàm đậm) ---
  // Ngoài vùng sáng, vật chỉ là nét chì xanh sẫm hơn / sáng hơn nền một chút cùng viền phấn nhạt; trong vùng được chiếu sáng
  // (alpha của cảnh từ 1 → 2, xem pencil.js) màu thật của vật hiện lên bằng chì ấm, càng gần nguồn càng đặc và sáng.
  vec3 paperN = vec3( 0.075, 0.095, 0.20 ) * grain * ( 0.82 + 0.36 * tooth );
  float lum = dot( col, vec3( 0.3333 ) );
  vec3 dark = paperN * ( 0.5 + 1.25 * lum ) + vec3( 0.16, 0.2, 0.36 ) * smoothstep( 0.55, 1.0, lum ) * 0.22 * tooth;
  dark += vec3( 0.34, 0.4, 0.6 ) * line * 0.42;
  float g = clamp( drawn.a - 1.0, 0.0, 1.0 );
  vec3 obj = pow( col, vec3( 1.5 ) ); obj = clamp( mix( vec3( dot( obj, vec3( 0.3333 ) ) ), obj, 1.25 ), 0.0, 1.0 );
  vec3 warm = obj * vec3( 1.22, 0.97, 0.64 ) * ( 0.34 + 0.8 * g ) + vec3( 1.0, 0.86, 0.5 ) * smoothstep( 0.8, 1.0, g ) * 0.22;
  warm = min( warm, vec3( 0.98, 0.9, 0.66 ) );
  warm *= 1.0 - 0.55 * line;
  vec3 night = mix( dark, warm, smoothstep( 0.0, 0.4, g ) * ( 0.6 + 0.4 * tooth ) );
  // quầng sáng: các nét toả tròn quanh từng nguồn sáng, tâm là vị trí THẾ GIỚI của nguồn chiếu ra màn hình (không trôi khi quay máy)
  for ( int i = 0; i < 8; i++ ) {
    vec4 Lt = uLights[ i ]; if ( Lt.z <= 0.0 ) continue;
    vec2 dv = ( vUv - Lt.xy ) * vec2( uSize.x / uSize.y, 1.0 ); float r = length( dv ) / Lt.z; if ( r > 1.0 ) continue;
    float vis = ( Lt.x < 0.0 || Lt.x > 1.0 || Lt.y < 0.0 || Lt.y > 1.0 ) ? 1.0 : step( Lt.w - 0.6, -seen( Lt.xy ).z );
    float ang = atan( dv.y, dv.x ), id = float( i ) * 1.7;
    float ray = smoothstep( 0.3, 0.8, 0.5 + 0.5 * sin( ang * 23.0 + id + 2.5 * sin( ang * 5.0 + id ) ) ) * smoothstep( 0.2, 0.75, hash( vec2( floor( ang * 23.0 / 6.2832 + id ), floor( r * 5.0 ) + id ) ) + 0.35 );
    night += vec3( 1.0, 0.8, 0.42 ) * vis * ( smoothstep( 0.2, 0.0, r ) * 0.75 + ( 1.0 - r ) * ( 1.0 - r ) * ray * 0.34 * ( 0.45 + 0.7 * tooth ) );
  }
  night = mix( paperN, night, done );
  gl_FragColor = vec4( mix( day, night, nk ), 1.0 );
}`;

/**
 * @param renderer  WebGLRenderer của pipeline
 * @param sceneRT   đích vẽ cảnh sẵn có (màu "phần giấy còn trắng" + depthTexture 24 bit)
 * @param camera    máy quay của cảnh
 */
export function createPage(renderer, sceneRT, camera) {
  const size = new THREE.Vector2();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
    uniforms: { tDrawn: { value: sceneRT.texture }, tDepth: { value: sceneRT.depthTexture }, uSize: { value: size }, uInverse: { value: camera.projectionMatrixInverse }, uPixel: { value: 1 }, uScale: { value: 1 }, uNear: { value: camera.near }, uDepthSteps: { value: 16777216 }, uNight: U.uNight, uRain: U.uRain, uTime: U.uTime, tSign: { value: null }, uSign: { value: 0 }, uLights: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) } },
  });
  const quad = new FullScreenQuad(mat);
  // máy không dựng được bộ đệm HDR khử răng cưa (một số điện thoại): lùi về không MSAA thay vì màn hình đen
  if (sceneRT.samples > 0) {
    const gl = renderer.getContext(); renderer.setRenderTarget(sceneRT);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; renderer.setRenderTarget(null);
    if (!ok) { console.warn('[chì màu] không dựng được bộ đệm MSAA ×' + sceneRT.samples + ', tắt khử răng cưa'); sceneRT.samples = 0; sceneRT.dispose(); }
  }
  let signTex = null, sources = null;
  const _v = new THREE.Vector3(), near = [];
  return {
    /** chữ ký viết tay ở góc phải dưới (tên lớp – khoá – ngày); null để bỏ. Dùng khi lưu ảnh. */
    sign(text) {
      if (signTex) { signTex.dispose(); signTex = null; }
      mat.uniforms.uSign.value = text ? 1 : 0; mat.uniforms.tSign.value = null; if (!text) return;
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const g = cv.getContext('2d');
      g.font = 'italic 54px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillStyle = '#000';
      let size = 54; while (g.measureText(text).width > 1000 && size > 20) { size -= 4; g.font = `italic ${size}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`; }
      g.fillText(text, 1012, 66);
      signTex = new THREE.CanvasTexture(cv); mat.uniforms.tSign.value = signTex;
    },
    /** danh sách nguồn sáng đêm của trò chơi (ctx.nightLights: { x, y, z, power }), để vẽ quầng quanh đèn và lửa trại */
    setLights(list) { sources = list; },
    /** vẽ trang giấy ra màn hình từ cảnh vừa vẽ vào sceneRT */
    render() {
      renderer.getDrawingBufferSize(size); PX[0] = pxFor(size.x, size.y);
      const u = mat.uniforms, L = u.uLights.value;
      near.length = 0;
      if (sources && U.uNight.value > 0.05) {      // tám nguồn gần máy quay nhất, ở phía trước
        for (const s of sources) { _v.set(s.x, s.y, s.z).applyMatrix4(camera.matrixWorldInverse); const d = -_v.z; if (d > 0.3 && d < 70) near.push([d, _v.x, _v.y, s.power ?? 1]); }
        near.sort((a, b) => a[0] - b[0]);
      }
      for (let i = 0; i < 8; i++) {
        const n = near[i]; if (!n) { L[i].set(0, 0, 0, 0); continue; }
        _v.set(n[1], n[2], -n[0]).applyMatrix4(camera.projectionMatrix);
        L[i].set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, 1.9 * Math.sqrt(n[3]) * camera.projectionMatrix.elements[5] * 0.5 / n[0], n[0]);
      }
      u.uPixel.value = 2 / (camera.projectionMatrix.elements[5] * size.y); u.uScale.value = Math.min(size.x, size.y) / 1080; u.uNear.value = camera.near;
      renderer.setRenderTarget(null); quad.render(renderer);
    },
  };
}
