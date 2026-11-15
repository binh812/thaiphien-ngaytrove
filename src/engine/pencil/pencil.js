// Kiểu vẽ "chì màu" (bản thử) — chỉ chạy khi ?style=pencil (xem style.js).
//
// Phần GLSL vẽ nét chì (pcHash … pcDraw) phỏng theo/chép có sửa từ "Coloured pencil" của Patch,
// https://patch.gg/blendi/coloured-pencil (commit 0400f90, src/pencil.js), giấy phép MIT — xem LICENCE-pencil.md.
// Ý chính của bản gốc: mỗi bề mặt mang hai "trường" h (số đổi đều trên bề mặt), nét chì nằm theo đường đồng mức
// của chúng nên nét thuộc về vật, không trôi khi vật/máy quay chuyển động; thứ duy nhất theo mắt nhìn là SỐ nét
// (giữ cách nhau chừng ấy điểm ảnh bằng cách vẽ mọi nét, mỗi nét thứ hai, thứ tư… và nét xen giữa hiện dần).
// Bốn lớp: vàng ấm chỗ nắng → màu vật phủ nhẹ → nét cùng màu ấn mạnh dần về phía tối → nét chì tím xanh trong bóng.
//
// Khác bản gốc (để không phải dựng lại cảnh của Thái Phiên):
//  - hai trường h tính ngay trong vertex shader từ vị trí trước biến dạng (attribute position) thay cho thuộc tính đỉnh;
//  - không dùng vật liệu riêng: vá mã các shader dựng sẵn của three (ShaderLib basic/lambert/phong/standard/physical/toon)
//    MỘT lần trước khi vật liệu đầu tiên biên dịch, nên mọi vật liệu của trò chơi (kể cả do tệp khác tạo, có onBeforeCompile
//    riêng) đều ra nét chì mà không cần sửa nơi tạo; tinh chỉnh từng loại bằng material.defines (PC_*);
//  - D (0 sáng → 1 tối) chuẩn hoá theo cường độ mặt trời của dự án (đèn HDR mạnh hơn Lambert của bản gốc).
import * as THREE from 'three';

/** khoảng cách nét (điểm ảnh), dùng chung cho mọi shader; lượt trang giấy cập nhật mỗi khung theo cạnh ngắn của bộ đệm (mảng 1 phần tử: three chép uniform của ShaderLib theo tham chiếu với mảng kiểu, nên mọi vật liệu thấy cùng một giá trị) */
export const PX = new Float32Array([5]);
export const pxFor = (w, h) => Math.max(4.2, 5 * Math.min(w, h) / 1080);

export const PENCIL_GLSL = /* glsl */ `
float pcHash( float n ) { return fract( sin( n * 127.1 ) * 43758.5453 ); }
float pcHash3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float pcNoise( vec3 p ) {
  vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( pcHash3( i ), pcHash3( i + vec3( 1, 0, 0 ) ), f.x ), mix( pcHash3( i + vec3( 0, 1, 0 ) ), pcHash3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( pcHash3( i + vec3( 0, 0, 1 ) ), pcHash3( i + vec3( 1, 0, 1 ) ), f.x ), mix( pcHash3( i + vec3( 0, 1, 1 ) ), pcHash3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
// thớ giấy tại chỗ vật chạm giấy: 0 là chỗ trũng sáp bỏ qua, 1 là chỗ gồ sáp bám (ở xa, hạt nhỏ hơn điểm ảnh thì san đều)
float pcTooth( vec3 at ) {
  float fine = length( fwidth( at ) );
  return mix( 0.5, pcNoise( at * 19.0 ), clamp( 1.0 - fine * 14.0, 0.0, 1.0 ) ) * 0.6 + mix( 0.5, pcNoise( at * 47.0 + 5.0 ), clamp( 1.0 - fine * 35.0, 0.0, 1.0 ) ) * 0.4;
}
// một nét mềm rộng W điểm ảnh, cách tim nét d điểm ảnh
float pcStroke( float W, float d ) { return smoothstep( W * 0.5 + 1.0, W * 0.5 - 1.0, d ) * min( 1.0, W * 0.6 ); }
// một lớp nét theo đường đồng mức của h, phủ "cover" phần giấy: lượng sáp 0..1
float pcStrokes( float h, float cover ) {
  float g = length( vec2( dFdx( h ), dFdy( h ) ) ) + 1e-9;
  float k = -log2( g * PC_PX ), kf = floor( k ), t = k - kf, s = exp2( kf ), P = 1.0 / ( g * s ), x = h * s;
  float ic = floor( x + 0.5 ), im = floor( x ) + 0.5;
  float W = cover * P / ( 1.0 + t ) * 1.3;
  float a = pcStroke( W * ( 0.65 + 0.7 * pcHash( ic / s + 3.7 ) ), abs( x - ic ) * P ) * ( 0.55 + 0.45 * pcHash( ic / s ) );
  float b = pcStroke( W * t * ( 0.65 + 0.7 * pcHash( im / s + 3.7 ) ), abs( x - im ) * P ) * ( 0.55 + 0.45 * pcHash( im / s ) );
  return max( a, b );
}
// Phần trắng của giấy còn lại sau khi vẽ vật. local: màu chì của vật. D: 0 ngoài sáng → 1 trong tối.
vec3 pcDraw( vec3 local, float D, vec2 h, vec3 at ) {
  float tooth = pcTooth( at );
  vec2 wob = vec2( 0.012 * sin( at.x * 5.0 + at.y * 3.0 ) + 0.01 * sin( at.z * 6.3 - at.y * 4.1 ), 0.012 * sin( at.z * 4.6 + at.x * 2.7 ) + 0.01 * sin( at.y * 5.9 + at.x * 3.3 ) );
  // chì tối màu được ấn mạnh tay hơn (thêm so với bản gốc): chữ trên biển, mắt, mày, tóc còn đọc được dù đứng ngoài nắng
  float ink = 1.0 - dot( local, vec3( 0.3333 ) ); ink *= ink * PC_INK;
  // chì bóng: màu của chính vật, tối và lạnh đi
  vec3 shade = PC_SHADECOL( local );
  vec3 left = vec3( 1.0 );
  // nắng trước: vàng ấm, rất nhẹ, ở mọi chỗ ánh sáng rọi tới
  left *= mix( vec3( 1.0 ), vec3( 1.0, 0.9, 0.56 ), clamp( ( 1.0 - smoothstep( 0.0, 0.4, D ) ) * PC_YELLOW * ( 0.45 + 0.9 * tooth ), 0.0, 1.0 ) );
  // màu của vật phủ nhẹ khắp, nhạt hơn ở chỗ sáng nhất
  left *= mix( vec3( 1.0 ), local, clamp( ( ( 0.42 + 0.45 * smoothstep( 0.0, 0.7, D ) ) * PC_BASE * ( 1.0 - 0.6 * pcGround ) + 0.5 * ink + 0.55 * pcFeat ) * ( 0.5 + 0.85 * tooth ), 0.0, 1.0 ) );
  // rồi các nét cùng màu, ấn mạnh dần về phía tối
  left *= mix( vec3( 1.0 ), local, clamp( pcStrokes( h.x + wob.x, ( 0.45 + 0.4 * D ) * PC_COVER * ( 1.0 - 0.4 * pcGround ) ) * ( 1.0 - 0.35 * pcGround ) * ( 0.72 + 0.5 * D + 0.3 * ink ) * PC_STROKE * ( 1.0 - 0.75 * pcFeat ) * ( 0.55 + 0.8 * tooth ), 0.0, 1.0 ) );
  // và bắt chéo qua, nơi ánh sáng không tới, là chì bóng
  left *= mix( vec3( 1.0 ), shade, clamp( pcStrokes( h.y + wob.y, clamp( ( D - 0.24 ) * 1.35, 0.0, 0.82 ) ) * ( 0.5 + 0.75 * tooth ) * PC_SHADEK * ( 1.0 - 0.75 * pcFeat ), 0.0, 1.0 ) );
  return left;
}`;

// hướng nét mặc định: nghiêng theo tay phải (như bản gốc)
const DIR_A = 'normalize( vec3( 0.62, 1.0, 0.34 ) )', DIR_B = 'normalize( vec3( -0.78, 1.0, 0.22 ) )';

const PARS_VERT = /* glsl */ `
varying vec2 vPcH; varying vec3 vPcAt;
#ifdef PC_WORLD
  varying float vPcUp;      // 1 = mặt nằm ngang ngửa lên (sân, đường, nền)
#endif
#ifdef PC_LEAF
  attribute vec4 aCen; varying vec3 vPcNb;      // tâm + bán kính cụm lá (trees.js); pháp tuyến theo mặt cầu của cụm (không gian nhìn)
#endif
#ifndef PC_A
  #define PC_A ${DIR_A}
#endif
#ifndef PC_B
  #define PC_B ${DIR_B}
#endif`;
// hai trường h = ( p·A, p·B ) từ vị trí TRƯỚC biến dạng (xương, morph, gió): nét bám theo thân vật khi nó cử động
const VERT = /* glsl */ `
{
  vec3 pcP = position, pcA = PC_A, pcB = PC_B;
  #ifdef USE_INSTANCING
    #ifdef PC_INSTWORLD
      pcP = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;      // bản sao đứng yên (cỏ, lá rụng): nét liền mạch qua cả bãi
    #else
      vec3 pcO = instanceMatrix[ 3 ].xyz;                         // bản sao di chuyển được: chỉ lệch pha để các bản sao không giống hệt nhau
      pcP += vec3( dot( pcO, vec3( 0.37, 0.11, 0.23 ) ), dot( pcO, vec3( 0.19, 0.41, 0.07 ) ), dot( pcO, vec3( 0.13, 0.29, 0.31 ) ) );
    #endif
  #endif
  #ifdef PC_WORLD
    // hình học tĩnh đã gộp theo toạ độ thế giới: chọn hướng nét theo mặt (pháp tuyến phẳng từng mặt)
    vPcUp = step( 0.92, normal.y );
    if ( normal.y > 0.92 ) { pcA = normalize( vec3( 0.24, 0.0, 0.97 ) ); pcB = normalize( vec3( 0.92, 0.0, -0.39 ) ); }                 // sân, nền: nét nằm ngang
    else if ( normal.y > 0.25 ) { vec3 pcR = normalize( vec3( normal.z, 0.0, -normal.x ) ); pcA = pcR; pcB = normalize( pcR * 0.8 + vec3( 0.0, 0.6, 0.0 ) ); }   // mái: nét xuôi theo dốc
  #endif
  vPcH = vec2( dot( pcP, pcA ), dot( pcP, pcB ) ); vPcAt = pcP;
  #ifdef PC_LEAF
    // tán lá là những thẻ quay lung tung: trường phẳng trong không gian vật cắt mỗi thẻ ra một hướng nét khác nhau → mớ nét rối.
    // Ở đây trường tính theo độ lệch tới tâm cụm, chiếu lên mặt phẳng nhìn: mọi thẻ của một cụm chung một họ nét cong ôm khối tròn.
    // (neo vào thế giới, không theo mặt phẳng nhìn: quay máy tại chỗ nét không xoay theo)
    vec3 pcW = position - aCen.xyz;
    float pcR = max( aCen.w, 0.4 ), pcQ = dot( pcW, pcW ) / pcR;
    vPcH = vec2( dot( pcW, normalize( vec3( 0.5, 0.8, 0.33 ) ) ) + 0.7 * pcQ, dot( pcW, normalize( vec3( -0.6, 0.72, 0.3 ) ) ) + 0.7 * pcQ );
    vPcNb = normalize( mat3( viewMatrix ) * ( mat3( modelMatrix ) * pcW ) );
  #endif
}`;
const DEFAULTS = /* glsl */ `
// mặc định (vật liệu chưa phân loại: người, đồ vật, biển hiệu) — vật liệu theo loại ghi đè bằng material.defines
#ifndef PC_INK
  #define PC_INK 1.0
#endif
#ifndef PC_SAT
  #define PC_SAT 1.25
#endif
#ifndef PC_LIFT
  #define PC_LIFT 0.85
#endif
#ifndef PC_DMUL
  #define PC_DMUL 0.65
#endif
#ifndef PC_UNLIT_D
  #define PC_UNLIT_D 0.0
#endif
#ifndef PC_BASE
  #define PC_BASE 1.0
#endif
#ifndef PC_STROKE
  #define PC_STROKE 1.0
#endif
#ifndef PC_COVER
  #define PC_COVER 1.0
#endif
#ifndef PC_SHADEK
  #define PC_SHADEK 0.95
#endif
#ifndef PC_YELLOW
  #define PC_YELLOW 0.2
#endif
#ifndef PC_SHADECOL
  #define PC_SHADECOL( c ) mix( c * 0.5, vec3( 0.24, 0.2, 0.62 ), 0.55 )
#endif
float pcGround = 0.0;    // 0..1: mặt sân/đường đang phơi nắng
float pcFeat = 0.0;      // 0..1: điểm ảnh này là một nét chi tiết của ảnh da (mắt, mày, môi) — vẽ đặc tay, bớt nét gạch`;
const PARS_FRAG = /* glsl */ `
varying vec2 vPcH; varying vec3 vPcAt;
#ifdef PC_LEAF
  varying vec3 vPcNb;
#endif
#ifdef PC_WORLD
  varying float vPcUp;
#endif
uniform float uPcPx[ 1 ];
#define PC_PX uPcPx[ 0 ]
${DEFAULTS}
${PENCIL_GLSL}`;
// thay màu đã chiếu sáng bằng "phần giấy trắng còn lại"; D lấy từ tỉ lệ ánh sáng ra / màu vật, chuẩn hoá theo mặt trời
const FRAG_OUT = /* glsl */ `
#ifndef PC_SKIP
{
  vec3 pcLocal = diffuseColor.rgb;
  #ifdef PC_COLOR
    pcLocal = PC_COLOR;
  #endif
  #ifdef PC_UNLIT
    float pcD = PC_UNLIT_D;
  #else
    #if NUM_DIR_LIGHTS > 0
      float pcSun = dot( directionalLights[ 0 ].color, vec3( 0.3333 ) );
      float pcRef = pcSun * 0.3 + 0.5 * clamp( pcSun * 0.5, 0.4, 1.0 );      // nắng yếu (bình minh, hoàng hôn) thì hạ mốc, kẻo cả cảnh thành bóng tối      // ≈ độ sáng của mặt phơi nắng (đo: nắng ~2,0 · bóng đổ ~1,0 · tường khuất ~0,6)
    #else
      float pcRef = 1.0;
    #endif
    float pcLit = dot( outgoingLight, vec3( 0.3333 ) ) / max( dot( diffuseColor.rgb, vec3( 0.3333 ) ), 0.03 ) / pcRef;
    float pcD = 1.0 - clamp( pcLit, 0.0, 1.0 );
  #endif
  #ifdef PC_D
    pcD = PC_D;
  #endif
  #ifdef PC_NORM
    pcLocal = pcLocal / max( max( pcLocal.r, max( pcLocal.g, pcLocal.b ) ), 0.02 ) * PC_NORM;      // chỉ giữ sắc, bỏ độ tối của màu gốc
  #endif
  #ifdef PC_LEAF
    // lá: màu lấy theo cụm (màu đỉnh đã chuẩn hoá, bỏ ảnh lá và phần tối theo từng thẻ); sáng–tối theo mặt cầu của cụm
    #ifdef USE_COLOR
      pcLocal = vColor.rgb / max( max( vColor.r, max( vColor.g, vColor.b ) ), 0.02 ) * 0.62;
    #endif
    #if NUM_DIR_LIGHTS > 0
      pcD = mix( pcD, 1.0 - smoothstep( -0.5, 0.6, dot( normalize( vPcNb ), directionalLights[ 0 ].direction ) ), 0.88 );
    #endif
    gl_FragColor.a = 0.3;      // báo cho lượt trang giấy: trong tán lá, viền chì than giữa các thẻ lá vẽ rất nhạt
  #endif
  pcD *= PC_DMUL;
  // ban đêm (đèn chính là trăng, ngả xanh): pcGlow = vật này đang được đèn/lửa rọi tới mức nào; nét giữ mật độ vừa phải để lượt trang giấy còn thấy hình khối
  float pcGlow = 0.0;
  #if !defined( PC_UNLIT ) && NUM_DIR_LIGHTS > 0
  {
    float pcMoon = step( directionalLights[ 0 ].color.r * 1.15, directionalLights[ 0 ].color.b );
    pcGlow = pcMoon * smoothstep( 0.12, 0.8, pcLit * pcRef );
    pcD = mix( pcD, 0.5 - 0.32 * pcGlow, pcMoon );
  }
  #endif
  #ifdef PC_TINT
    pcLocal *= PC_TINT;
  #endif
  // chì màu không có sắc thật tối: nâng sáng và tăng độ tươi của màu vật
  pcLocal = pow( clamp( mix( vec3( dot( pcLocal, vec3( 0.3333 ) ) ), pcLocal, PC_SAT ), 0.0, 1.0 ), vec3( PC_LIFT ) );
  #if defined( PC_WORLD ) && !defined( PC_NOGROUND )
    // sân, đường phơi nắng: gần như để trắng giấy, nét thưa và nhạt; chỉ trong bóng đổ mới tô dày
    pcGround = vPcUp * ( 1.0 - smoothstep( 0.1, 0.45, pcD ) );
  #endif
  gl_FragColor.rgb = pcDraw( pcLocal, pcD, vPcH, vPcAt );
  // ban đêm: báo "chỗ này đang sáng" cho lượt trang giấy qua alpha (1 → 2) để nó vẽ chì sáng trên giấy tối.
  // Vật không nhận đèn và không trong suốt (bóng đèn, màn LED, trăng) luôn là 2; vật nhận đèn: theo lượng sáng thật khi đèn chính là trăng (ngả xanh).
  #ifdef OPAQUE
    #ifdef PC_UNLIT
      gl_FragColor.a = 2.0;
    #elif NUM_DIR_LIGHTS > 0
      gl_FragColor.a += pcGlow;
    #endif
  #endif
  #if defined( PC_WORLD ) && defined( PC_GRID )
  { // mạch gạch lát: nét chì mảnh theo ô (toạ độ thế giới), mờ dần khi ô nhỏ hơn vài điểm ảnh
    vec2 pcG = vPcAt.xz / PC_GRID, pcW = fwidth( pcG ), pcF = abs( fract( pcG ) - 0.5 );
    float pcJ = max( 1.0 - smoothstep( 0.0, 1.6, ( 0.5 - pcF.x ) / pcW.x ), 1.0 - smoothstep( 0.0, 1.6, ( 0.5 - pcF.y ) / pcW.y ) );
    pcJ *= vPcUp * ( 1.0 - smoothstep( 0.08, 0.3, max( pcW.x, pcW.y ) ) ) * ( 0.35 + 0.65 * pcNoise( vPcAt * 3.1 ) );
    gl_FragColor.rgb *= mix( vec3( 1.0 ), vec3( 0.42, 0.38, 0.36 ), pcJ * 0.45 );
  }
  #endif
}
#endif`;
// ảnh quét (vữa, gạch, ngói…) quá nhiễu cho chì màu: lấy màu trung bình bằng mip nhỏ nhất (bias lớn), giữ lại PC_KEEP phần hoa văn
const MAP_FROM = 'vec4 sampledDiffuseColor = texture2D( map, vMapUv );';
const MAP_TO = /* glsl */ `
  #ifdef PC_FLAT
    vec4 sampledDiffuseColor = texture2D( map, vMapUv, 12.0 );
  #elif defined( PC_SKIN )
    // da: nền là ảnh da đã làm mịn (mip nhỏ), chỉ giữ nguyên những chỗ khác hẳn nền — mắt, mày, môi, lỗ mũi
    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
    vec3 pcSoft = mix( texture2D( map, vMapUv, 4.0 ).rgb, texture2D( map, vMapUv, 12.0 ).rgb, 0.5 );      // pha thêm màu da trung bình: bớt mảng sẫm rộng (vệt râu, quầng)
    pcFeat = smoothstep( 0.08, 0.2, length( pcSoft - sampledDiffuseColor.rgb ) );
    sampledDiffuseColor.rgb = mix( pcSoft, sampledDiffuseColor.rgb, pcFeat );
  #else
    vec4 sampledDiffuseColor = texture2D( map, vMapUv );
    #ifdef PC_KEEP
      sampledDiffuseColor.rgb = mix( texture2D( map, vMapUv, 12.0 ).rgb, sampledDiffuseColor.rgb, PC_KEEP );
    #endif
  #endif`;

const LIBS = ['basic', 'lambert', 'phong', 'standard', 'physical', 'toon'];
let installed = false;

/** Vá ShaderLib của three cho kiểu chì màu. Gọi MỘT lần, trước khi vật liệu đầu tiên biên dịch. */
export function installPencil(renderer) {
  if (installed) return; installed = true;
  { const v = renderer.getDrawingBufferSize(new THREE.Vector2()); PX[0] = pxFor(v.x, v.y); }      // khoảng cách nét: 5 px ở 1080p
  const C = THREE.ShaderChunk, missing = [];
  C.pc_pars_vert = PARS_VERT; C.pc_vert = VERT; C.pc_pars_frag = PARS_FRAG; C.pc_out = FRAG_OUT;
  if (C.map_fragment.includes(MAP_FROM)) C.map_fragment = C.map_fragment.replace(MAP_FROM, MAP_TO); else missing.push('map_fragment');
  const add = (src, token, extra, name) => { if (!src.includes(token)) { missing.push(name + ':' + token); return src; } return src.replace(token, token + '\n' + extra); };
  for (const id of LIBS) {
    const lib = THREE.ShaderLib[id]; if (!lib) { missing.push(id); continue; }
    lib.uniforms.uPcPx = { value: PX };
    lib.vertexShader = add(add(lib.vertexShader, '#include <common>', '#include <pc_pars_vert>', id), '#include <begin_vertex>', '#include <pc_vert>', id);
    lib.fragmentShader = (id === 'basic' ? '#define PC_UNLIT\n' : '') + add(add(lib.fragmentShader, '#include <common>', '#include <pc_pars_frag>', id), '#include <opaque_fragment>', '#include <pc_out>', id);      // basic không có đèn: D cố định
  }
  if (missing.length) console.warn('[chì màu] bản three này đổi mã shader, chưa vá được:', missing.join(', '));
}

const vec3 = (r, g, b) => `vec3( ${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)} )`;
const define = (m, o) => { m.defines = { ...(m.defines || {}), ...o }; m.needsUpdate = true; };

// loại vật liệu của materials.js còn giữ lại chút hoa văn ảnh quét (mạch gạch, ngói, vân gỗ)
const KEEP = { brick: 0.3, brickPave: 0.4, roofTile: 0.4, pavers: 0.4, floorTile: 0.25, wallTile: 0.25, wood: 0.25, bark: 0.3, court: 0.2 };
const GRID = { pavers: 0.6, floorTile: 0.5, brickPave: 0.4 };      // cỡ ô mạch lát (m) vẽ bằng nét chì mảnh
/** Vật liệu theo loại (kindMat): bỏ bản đồ pháp tuyến/độ nhám/AO và phần vá phong hoá, chỉ còn màu phẳng + nét chì. */
export function pencilKind(m, kind) {
  m.normalMap = m.roughnessMap = m.aoMap = m.metalnessMap = null; m.metalness = 0; m.roughness = 1;
  m.onBeforeCompile = THREE.Material.prototype.onBeforeCompile; m.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
  const d = { PC_WORLD: 1, PC_INK: '0.3', PC_DMUL: '0.9', PC_LIFT: '0.75', PC_SAT: '1.8' };
  if (KEEP[kind]) d.PC_KEEP = KEEP[kind].toFixed(2); else d.PC_FLAT = 1;
  if (kind === 'grass') { d.PC_NOGROUND = 1; d.PC_SAT = '2.0'; d.PC_LIFT = '0.65'; }      // thảm cỏ: giữ xanh, không để trắng như sân lát
  if (kind === 'court') { d.PC_NOGROUND = 1; d.PC_KEEP = '0.6'; d.PC_SAT = '1.9'; d.PC_LIFT = '0.6'; d.PC_DMUL = '0.6'; }      // sân bóng rổ: giữ màu sân và vạch
  if (GRID[kind]) d.PC_GRID = GRID[kind].toFixed(2);
  if (kind === 'asphalt') { d.PC_LIFT = '0.5'; d.PC_TINT = vec3(0.86, 0.94, 1.1); d.PC_SAT = '1.0'; }      // đường nhựa: xám xanh nhạt, không xám đen
  if (kind === 'foliage') { d.PC_LIFT = '0.45'; d.PC_SAT = '1.5'; }      // lõi bụi cây, tùng: màu gốc rất sẫm → nâng lên xanh tươi
  if (kind === 'bark') { d.PC_A = 'normalize( vec3( 1.0, 0.08, 0.35 ) )'; d.PC_B = 'normalize( vec3( -0.4, 0.12, 1.0 ) )'; delete d.PC_WORLD; }      // thân cây: nét dọc thân
  define(m, d);
}
const SKIN = { PC_SKIN: 1, PC_TINT: 'vec3( 1.04, 0.965, 0.96 )', PC_DMUL: '0.4', PC_LIFT: '0.6', PC_SAT: '1.15', PC_BASE: '0.72', PC_STROKE: '0.34', PC_COVER: '0.6', PC_SHADEK: '0.5', PC_YELLOW: '0.1', PC_INK: '1.4', 'PC_SHADECOL( c )': 'mix( c * 0.62, vec3( 0.62, 0.30, 0.32 ), 0.35 )' };
const HAIR = { PC_A: 'normalize( vec3( 1.0, 0.1, 0.3 ) )', PC_B: 'normalize( vec3( -0.3, 0.15, 1.0 ) )', PC_BASE: '0.45', PC_STROKE: '1.5', PC_COVER: '1.15', PC_DMUL: '0.8', PC_INK: '0.9', PC_LIFT: '0.7' };
const SOLID = { PC_STROKE: '0.3', PC_BASE: '1.6', PC_DMUL: '0.2', PC_INK: '1.6' };
/** Vật liệu của một nhân vật có xương (rigged.js gọi ngay sau khi nhân bản vật liệu): da sáng sạch, tóc là khối sẫm có nét dọc, mắt mày vẽ đặc tay. */
export function pencilPerson(m, name) {
  if (name === 'body' || name === 'head') define(m, SKIN);
  else if (name.startsWith('hair_')) define(m, HAIR);
  else if (name === 'eyes' || name === 'eyebrows' || name === 'eyelashes' || name === 'frame') define(m, SOLID);
  else if (name === 'cornea') m.visible = false;      // lớp giác mạc chỉ để phản chiếu: không vẽ (rigged.js còn chỉnh opacity của nó sau lời gọi này, nên ẩn hẳn)
  else if (name === 'lens') define(m, { PC_COLOR: vec3(0.7, 0.85, 0.95), PC_D: '0.0', PC_STROKE: '0.3' });
}
/** Kính: xanh nhạt có nét, không phản chiếu ảnh trời. */
export function pencilGlass(m) {
  m.opacity = 0.6; m.envMapIntensity = 0; m.roughness = 1;
  define(m, { PC_COLOR: vec3(0.42, 0.66, 0.86), PC_D: '0.38', PC_SAT: '1.0' });
}

const LEAF = { PC_KEEP: '0.35', PC_DMUL: '0.55', PC_LIFT: '0.7', PC_INK: '0.0' };
const CANOPY = { PC_LEAF: 1, PC_DMUL: '1.15', PC_LIFT: '0.9', PC_SAT: '1.35', PC_INK: '0.0', PC_YELLOW: '0.32', PC_BASE: '0.9', PC_COVER: '1.1', 'PC_SHADECOL( c )': 'mix( c * 0.5, vec3( 0.16, 0.24, 0.5 ), 0.3 )' };
/** Duyệt cảnh sau khi dựng xong: chỉnh những vật liệu không đi qua kindMat (lá, cỏ, lửa…). Vật liệu chưa gặp vẫn ra nét chì với thiết lập mặc định. */
export function pencilScene(scene) {
  const seen = new Set();
  scene.traverse((o) => {
    if (o.isPoints && o.material && o.material.blending === THREE.AdditiveBlending) {      // hạt cộng màu (tàn lửa, quầng đèn, sao): cộng lên giấy trắng thì mất → tô phủ; alpha cộng dồn (1 → 2) để ban đêm lượt trang giấy vẽ thành chì sáng
      const m = o.material; m.blending = THREE.CustomBlending; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneFactor;
      const c = m.color, mx = Math.max(c.r, c.g, c.b, 1e-3); c.multiplyScalar(0.9 / mx); m.needsUpdate = true; return;
    }
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m && m.userData.pcFlame && !o.userData.pcBig) { o.userData.pcBig = true; o.geometry = o.geometry.clone().scale(1.6, 1.9, 1.6); }      // mỗi ngọn lửa to hơn cho rõ
      if (!m || seen.has(m) || m.isShaderMaterial) continue; seen.add(m);
      if (m.userData.pc) continue; m.userData.pc = true;
      if (m.blending === THREE.AdditiveBlending && o.geometry.type === 'ConeGeometry') { m.blending = THREE.NormalBlending; m.transparent = false; m.depthWrite = true; m.needsUpdate = true; m.userData.pcFlame = true; }      // ngọn lửa trại: vẽ đặc để lượt trang giấy coi là nguồn sáng (alpha 2) và toả quầng
      else if (m.blending === THREE.AdditiveBlending) { m.blending = THREE.NormalBlending; m.opacity *= 0.7; m.needsUpdate = true; }      // lửa, quầng sáng: cộng màu lên giấy trắng thì mất hình → tô phủ
      if (o.isInstancedMesh && o.name === 'grass') define(m, { PC_INSTWORLD: 1, PC_NORM: '0.6', PC_LIFT: '0.9', PC_SAT: '1.5', PC_INK: '0.0', PC_DMUL: '0.5' });
      else if (m.alphaTest > 0 && o.geometry.attributes.aCen) { m.alphaToCoverage = false; o.receiveShadow = false; define(m, CANOPY); }      // tán lá dạng thẻ (trees.js): khối tròn có nét cong; bỏ bóng tự đổ giữa các thẻ cho khối sáng–tối sạch
      else if (m.alphaTest > 0 && m.map && !o.isSkinnedMesh) define(m, o.isInstancedMesh ? { PC_INSTWORLD: 1, ...LEAF } : LEAF);      // lá: giữ cắt alpha, màu gần phẳng
    }
  });
}

/** Giao diện DOM ngả theo giấy: các bảng nền tối chữ trắng được đảo sáng (giữ sắc độ màu) thành nền ngà chữ chì đậm. Chỉ chèn khi kiểu chì màu. */
export function pencilUI() {
  const st = document.createElement('style');
  st.textContent = '.panel,.rvBoard,.rvDlg,#toast,#prompt,.clGuide,.clHint,.clHud,.clAim,.rvProg,.clMark,.clTag,.clHelpBtn,#poses button,#topbar button,#touchBtns button,.clTouch button{filter:invert(1) hue-rotate(180deg) sepia(.22) contrast(1.08)}';
  document.head.appendChild(st);
}
const SKY_VS = 'varying vec3 vDir; void main() { vDir = position; vec4 p = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const SKY_FS = /* glsl */ `
varying vec3 vDir; uniform vec3 uSun; uniform float uCover; uniform float uNight;
uniform float uPcPx[ 1 ];
#define PC_PX ( uPcPx[ 0 ] * 1.5 )
#define PC_INK 0.0
${DEFAULTS}
${PENCIL_GLSL}
float pcFbm( vec3 p ) { return pcNoise( p ) * 0.55 + pcNoise( p * 2.1 + 3.0 ) * 0.3 + pcNoise( p * 4.3 + 7.0 ) * 0.15; }
void main() {
  vec3 d = normalize( vDir );
  float up = clamp( d.y, 0.0, 1.0 );
  // mây = khoảng giấy để trắng; chân trời nhạt dần; mặt trời là một khoảng giấy trắng
  float cloud = smoothstep( 0.56 - 0.25 * uCover, 0.74 - 0.2 * uCover, pcFbm( vec3( d.x, d.y * 2.2, d.z ) * 2.6 / ( 0.35 + up ) ) );
  float sun = smoothstep( 0.90, 0.995, dot( d, uSun ) );
  float cover = mix( ( 0.34 + 0.3 * up ) * ( 1.0 - cloud ) * ( 1.0 - sun ), 0.62 - 0.25 * cloud, uNight ) * smoothstep( -0.05, 0.06, d.y );
  vec3 blue = mix( mix( vec3( 0.50, 0.68, 0.93 ), vec3( 0.36, 0.52, 0.90 ), up ), vec3( 0.22, 0.24, 0.52 ), uNight );
  float tooth = pcTooth( d * 26.0 );
  float h = dot( d, normalize( vec3( 0.62, 1.0, 0.34 ) ) ) * 9.0 + 0.05 * sin( d.x * 9.0 + d.z * 7.0 );
  vec3 left = mix( vec3( 1.0 ), blue, clamp( cover * 0.5 * ( 0.5 + 0.85 * tooth ), 0.0, 1.0 ) );
  left *= mix( vec3( 1.0 ), blue, clamp( pcStrokes( h, cover ) * 0.8 * ( 0.55 + 0.8 * tooth ), 0.0, 1.0 ) );
  // sao: vài chấm chì trắng (alpha > 1 = nguồn sáng, xem lượt trang giấy)
  vec3 sc = floor( d * 90.0 ); float star = step( 0.985, pcHash3( sc ) ) * smoothstep( 0.45, 0.1, length( fract( d * 90.0 ) - 0.5 ) ) * step( 0.05, d.y ) * ( 1.0 - cloud * 0.8 );
  gl_FragColor = vec4( left, 1.0 + star * uNight );
}`;
/** Bầu trời vẽ: giấy trắng làm mây, nét chì xanh nhạt xiên làm nền trời. Thay vật liệu của vòm trời đang hiển thị (vòm dùng để nướng IBL giữ nguyên ảnh HDRI). */
export function pencilSky(sky, renderer) {
  const uCover = { value: 0.28 }, uNight = { value: 0 };
  sky.sky.material = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uPcPx: { value: PX }, uSun: { value: sky.state.sunDir }, uCover, uNight }, side: THREE.BackSide, depthWrite: false, fog: false });
  return { update() { uCover.value = sky.state.w.cover; uNight.value = sky.state.night; } };
}
