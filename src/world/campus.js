// Mặt bằng tổng thể: nền sân, đường, các khối nhà học. (Các công trình khác nằm ở các tệp world/*.js)
import * as THREE from 'three';
import { makeBlock, C } from './blocks.js';

const CL = 'class', ST = 'stair', OF = 'office';

/** Mặt vát nối hai cao độ (vát vỉa ở lối xe ra vào): có cả hình lẫn khối va chạm, để người đi lên xuống êm thay vì vấp bậc 15 cm */
function slope(B, kind, x1, x2, zHi, yHi, zLo, yLo) {
  const a = [x1, yHi, zHi], b = [x2, yHi, zHi], c = [x2, yLo, zLo], d = [x1, yLo, zLo];
  const tri = zLo < zHi ? [a, b, c, a, c, d] : [a, c, b, a, d, c];                    // pháp tuyến luôn hướng lên
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); g.computeVertexNormals();
  B.geo(kind, 0xffffff, g);
  B.ramp([a, b, c, d, [x1, -0.3, zHi], [x2, -0.3, zHi], [x2, -0.3, zLo], [x1, -0.3, zLo]]);
}

export function buildGround(B) {
  const NS = { s: false };
  B.box('grass', 0xffffff, -260, 260, -0.6, -0.03, -260, 260, NS);
  B.box('pavers', 0xffffff, -63.4, 73.4, -0.5, 0, -48.4, 54.6, NS);                 // sân trường
  B.box('asphalt', 0xffffff, 37.5, 44.5, -0.3, 0.02, -36, 61, NS);                  // đường nội bộ qua cổng
  for (let z = -35; z < 54; z += 3.3) B.box('court', 0xf2f2f2, 40.92, 41.07, 0.02, 0.026, z, z + 1.1, { s: false, ns: true });
  B.box('brickPave', 0xffffff, -125, 125, -0.3, 0.14, 54.8, 61, NS);                // vỉa hè trước cổng
  B.box('asphalt', 0xffffff, 37.5, 44.5, -0.3, 0.15, 54.6, 61.2, NS);
  slope(B, 'asphalt', 37.5, 44.5, 61.2, 0.15, 61.58, 0); slope(B, 'asphalt', 37.5, 44.5, 54.6, 0.15, 54.1, 0.02);   // vát hai đầu đoạn qua cổng (đầu trong dừng trước đường quét của cánh cổng ở z = 54)
  B.box('asphalt', 0xffffff, -125, 125, -0.4, 0.0, 61, 75, NS);                     // đường Đà Nẵng
  B.box('brickPave', 0xffffff, -125, 125, -0.3, 0.14, 75, 81.5, NS);                // vỉa hè đối diện
  B.box('asphalt', 0xffffff, 58, 65, -0.3, 0.012, 74.9, 130, NS);                   // phố Trần Quốc Toản
  for (const [a, b] of [[-125, 37.5], [44.5, 125]]) B.box('granite', 0xbdb6a6, a, b, 0, 0.16, 60.85, 61.1, NS);
  for (const [a, b] of [[-125, 58], [65, 125]]) B.box('granite', 0xbdb6a6, a, b, 0, 0.16, 74.9, 75.15, NS);
  for (let x = -122; x < 124; x += 6) B.box('court', 0xf2f2f2, x, x + 3, 0, 0.006, 67.9, 68.1, { s: false, ns: true });
  for (let i = 0; i < 13; i++) B.box('court', 0xf2f2f2, 37.2, 40.2, 0, 0.007, 61.6 + i, 62.1 + i, { s: false, ns: true });   // vạch qua đường
  B.solid(-130, 130, -2, 0, -130, 140);                                             // mặt đất va chạm
}

export function buildBlocks(B) {
  const A = makeBlock(B, { code: 'A', title: 'NHÀ A', ox: 49, oz: -11, r: -Math.PI / 2, F: 3, pots: true, facade: 'arcade', openU: [-5, 17], roomW: 8.8, rooms: [CL, ST, CL, CL, ST, CL], names: { 1: { 2: '12A1' } } });
  const Bn = makeBlock(B, { code: 'B', title: 'NHÀ B', ox: -9.96, oz: 12, r: Math.PI, F: 2, roomW: 10.56, rooms: [CL, ST, CL, CL, CL, CL, CL, ST, CL], facade: 'arcade', pots: true, roof: 'red' });
  const Cb = makeBlock(B, { code: 'C', title: 'NHÀ C', ox: -12.72, oz: -21, r: 0, F: 2, roomW: 10.56, rooms: [CL, ST, CL, CL, CL, CL, ST, CL], facade: 'arcade', panels: true, noHedge: true, baseStripe: true, roof: 'red' });
  const P = makeBlock(B, { code: 'P', title: 'BAN GIÁM HIỆU', ox: 49, oz: 41, r: -Math.PI / 2, F: 2, rooms: [ST, OF, OF], colColor: 0xf2efe6, rail: 'balusters', names: { 0: { 1: 'PHÒNG HỌP', 2: 'PHÒNG HIỆU TRƯỞNG' }, 1: { 1: 'PHÒNG GIÁO VIÊN', 2: 'PHÒNG TRUYỀN THỐNG' } } });
  return { A, B: Bn, C: Cb, P, C_: C };
}
