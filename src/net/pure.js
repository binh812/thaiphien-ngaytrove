// Phần thuần của lớp mạng phía client: không import gì, không đụng DOM/three — để thử được bằng node --test (server/test/client.test.js).

const ID = /^[a-z0-9_]{1,24}$/i, COLOR = /^#[0-9a-f]{6}$/i;
/** mã định danh an toàn để tra bảng: không bắt đầu bằng "_", không trùng tên thuộc tính có sẵn của Object ("constructor", "toString"…) */
export const safeId = (v) => typeof v === 'string' && ID.test(v) && v[0] !== '_' && !(v in Object.prototype) && v !== 'prototype';

/** mã phòng hợp lệ (cùng luật với máy chủ) hoặc '' */
export function cleanRoom(raw) { const s = String(raw || '').trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{2,15}$/.test(s) ? s : ''; }
/** phòng chung và các phòng chung phụ do trò chơi tự mở (san-truong, san-truong-2 … -9); mã người chơi tự gõ kiểu "san-truong-abc" KHÔNG phải phòng chung */
export const isPublicRoom = (room) => /^san-truong(-\d)?$/.test(room);

/**
 * Tham số ?net= chỉ dùng để THỬ trên máy mình: chỉ nhận ws:// hoặc wss:// trỏ về localhost / 127.0.0.1 / [::1]. Trả về gốc URL hoặc ''.
 * Máy chủ thật chỉ lấy từ SERVER_URL trong config.js — liên kết lạ không thể kéo người chơi sang máy chủ khác.
 */
export function localNetUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let u;
  try { u = new URL(raw); } catch (e) { return ''; }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return '';
  if (u.username || u.password) return '';
  const h = u.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' ? u.origin : '';
}

/** tên dùng để so khi ẩn người: gộp dạng chữ, chữ thường, một dấu cách */
export const nameKey = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** không tin cả máy chủ: chỉ lấy các trường ngoại hình đã biết, đúng kiểu (máy chủ thật đã lọc; đây là lớp chắn thứ hai) */
export function safeLook(raw) {
  const out = {}, r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, own = (k) => Object.hasOwn(r, k);
  for (const k of ['skin', 'hairColor', 'build', 'face', 'glasses']) if (own(k) && Number.isInteger(r[k]) && r[k] >= 0 && r[k] < 10) out[k] = r[k];
  for (const k of ['hair', 'outfit', 'age', 'top', 'bottom', 'shoes']) if (own(k) && safeId(r[k])) out[k] = r[k];
  for (const k of ['topColor', 'bottomColor', 'shoesColor']) if (own(k) && typeof r[k] === 'string' && COLOR.test(r[k])) out[k] = r[k];
  if (own('head') && (typeof r.head === 'string' ? safeId(r.head) : Number.isInteger(r.head) && r.head >= 0 && r.head < 100)) out.head = r.head;
  out.gender = own('gender') && r.gender === 'f' ? 'f' : 'm';
  if (own('height') && Number.isFinite(r.height)) out.height = Math.max(1.4, Math.min(1.95, r.height));
  return out;
}

/** một mẫu trạng thái từ mảng [x, y, z, r, v, a, c, o] của máy chủ, gắn thời điểm nhận t; null nếu sai dạng */
export function snapOf(s, t) {
  if (!Array.isArray(s) || s.length < 5) return null;
  for (let i = 0; i < 5; i++) if (typeof s[i] !== 'number' || !Number.isFinite(s[i])) return null;
  return { t, x: s[0], y: s[1], z: s[2], r: s[3], v: s[4], a: !!s[5], c: safeId(s[6]) ? s[6] : null, o: safeId(s[7]) ? s[7] : null };
}
/** quay góc from về phía to theo đường ngắn nhất, k = 0..1 */
export const turn = (from, to, k) => { const d = Math.atan2(Math.sin(to - from), Math.cos(to - from)); return from + d * k; };

export const GAP_MS = 250, TELEPORT = 8, MAX_SNAPS = 24;
/**
 * Thêm mẫu mới vào hàng đệm S (sửa tại chỗ). Người đứng yên không gửi gì; khi họ đi tiếp, chèn lại mẫu cũ sát trước mẫu mới
 * để không trượt chậm suốt quãng nghỉ.
 */
export function pushSnap(S, s) {
  const last = S[S.length - 1];
  if (last && s.t - last.t > GAP_MS) S.push({ ...last, t: s.t - 100 });
  S.push(s); while (S.length > MAX_SNAPS) S.shift();
}
/**
 * Vị trí tại thời điểm rt (đã lùi một quãng đệm): nội suy giữa hai mẫu kề nhau; hết mẫu thì đứng ở mẫu cuối.
 * Bỏ dần các mẫu đã qua khỏi S (sửa tại chỗ). Hai mẫu cách nhau quá TELEPORT mét thì nhảy thẳng, không trượt qua sân.
 */
export function sample(S, rt) {
  if (!S.length) return null;
  while (S.length > 2 && S[1].t <= rt) S.shift();
  const a = S[0], b = S[1];
  if (!b || rt <= a.t) return a;
  if (rt >= b.t) return b;
  if (Math.hypot(b.x - a.x, b.z - a.z) > TELEPORT) return a;
  const k = (rt - a.t) / (b.t - a.t), m = k < 0.5 ? a : b;
  return { t: rt, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, r: turn(a.r, b.r, k), v: a.v + (b.v - a.v) * k, a: m.a, c: m.c, o: m.o };
}

export const LOD_HOLD_S = 3, LOD_MARGIN = 0.15;
/**
 * Chọn mức dựng cho từng người: 'full' (mô hình đầy đủ, tối đa maxFull người gần nhất), 'stub' (khối đơn giản), 'off' (ẩn).
 * list = [{ id, dist (m, null = chưa có vị trí), mode (mức hiện tại), age (giây kể từ lần đổi mức gần nhất), hidden }].
 * Có trễ để không dựng/huỷ liên tục ở ranh giới: (1) mức đang hiện ('full'/'stub') được giữ tối thiểu LOD_HOLD_S giây;
 * (2) người đang 'full' chỉ bị thay khi người khác gần hơn hẳn 15%; (3) vào tầm ở range, ra khỏi tầm ở range × 1,15.
 * Trả về Map id → mức.
 */
export function planLod(list, maxFull, range) {
  const out = new Map(), live = [];
  for (const r of list) {
    const inRange = r.dist != null && r.dist <= (r.mode === 'off' ? range : range * (1 + LOD_MARGIN));
    if (r.hidden || r.dist == null) { out.set(r.id, 'off'); continue; }
    if (!inRange && !(r.mode !== 'off' && r.age < LOD_HOLD_S)) { out.set(r.id, 'off'); continue; }
    live.push(r);
  }
  let quota = maxFull; const free = [];
  for (const r of live) {      // người đang trong thời gian giữ mức: để nguyên
    if (r.mode !== 'off' && r.age < LOD_HOLD_S) { out.set(r.id, r.mode); if (r.mode === 'full') quota--; } else free.push(r);
  }
  free.sort((a, b) => a.dist * (a.mode === 'full' ? 1 - LOD_MARGIN : 1) - b.dist * (b.mode === 'full' ? 1 - LOD_MARGIN : 1));
  for (const r of free) { if (quota > 0) { quota--; out.set(r.id, 'full'); } else out.set(r.id, 'stub'); }
  return out;
}
