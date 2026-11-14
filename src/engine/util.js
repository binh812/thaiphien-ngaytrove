// Tiện ích dùng chung: số ngẫu nhiên có seed, nội suy, tham số URL
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

const qs = new URLSearchParams(location.search);
export const param = (k, d) => (qs.has(k) ? qs.get(k) : d);
export const paramNum = (k, d) => { const v = parseFloat(qs.get(k)); return Number.isFinite(v) ? v : d; };

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// Mức đồ họa: ?q=low|medium|high|ultra
const QUAL = {
  low:    { dpr: 1,    msaa: 0, shadow: 2048, ao: 0,  vol: 0,  bloom: false, grass: 0.25, tex: 256, leafK: .5, interior: 26, aniso: 4 },
  medium: { dpr: 1.25, msaa: 2, shadow: 4096, ao: 8,  vol: 10, bloom: true,  grass: 0.5,  tex: 512, leafK: .75, interior: 40, aniso: 8 },
  high:   { dpr: 1.5,  msaa: 4, shadow: 4096, ao: 12, vol: 16, bloom: true,  grass: 1,    tex: 512, leafK: 1, interior: 70, aniso: 16 },
  ultra:  { dpr: 2,    msaa: 4, shadow: 8192, ao: 16, vol: 24, bloom: true,  grass: 1.5,  tex: 1024, leafK: 1.3, interior: 120, aniso: 16 },
};
let stored = null; try { stored = localStorage.getItem('tp2_quality'); } catch (e) { /* trình duyệt chặn lưu trữ */ }
export const QNAME = (() => {
  const q = param('q', stored || 'auto');
  if (QUAL[q]) return q;
  return 'low';      // mặc định mức thấp nhất để máy thường chạy mượt; người chơi tự nâng trong bảng Tab (lựa chọn được lưu)
})();
export const Q = QUAL[QNAME];
