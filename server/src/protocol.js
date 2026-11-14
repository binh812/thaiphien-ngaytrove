// Giao thức phòng chơi: hằng số + kiểm/làm sạch mọi thứ client gửi lên. Thuần (không phụ thuộc Workers) để thử bằng node --test.
// Nguyên tắc: máy chủ KHÔNG tin client — chỉ giữ các trường đã biết, đúng kiểu, trong khoảng; phần còn lại bỏ.
import { censor, INVISIBLE } from './filter.js';

export const VERSION = 1;
export const MAX_PLAYERS = 16;
export const MAX_NAME = 20, MAX_CHAT = 120, MAX_LOOK_BYTES = 2048, MAX_RAW = 4096;
export const DEFAULT_NAME = 'Bạn cũ';
export const PUBLIC_ROOM = 'san-truong';
/** phạm vi bản đồ (m): sân trường nằm trong khoảng x −75…90, z −60…95; nới thêm một ít cho phố trước cổng */
export const BOUNDS = { x: [-130, 130], y: [-6, 45], z: [-130, 130] };
export const MAX_SPEED = 8;
export const EMOTES = ['wave', 'cheer', 'heart', 'thumb'];
/** mã đóng kết nối riêng của trò chơi (4000–4999 dành cho ứng dụng) */
export const CLOSE = { FULL: 4001, BAD: 4002, IP: 4003, FLOOD: 4008, IDLE: 4009 };
/** dáng chụp ảnh hợp lệ — trùng danh sách POSES trong src/game/human.js; thêm dáng mới ở trò chơi thì thêm ở đây */
export const POSES = ['peace', 'peace2', 'heart', 'bigheart', 'wave', 'thumb', 'hips', 'cross', 'chin', 'grace', 'cheer', 'squat'];

const ID = /^[a-z0-9_]{1,24}$/i, COLOR = /^#[0-9a-f]{6}$/i;
/** mã định danh an toàn (kiểu tóc, món đồ, clip): chữ/số/gạch dưới, không bắt đầu bằng "_", không trùng tên thuộc tính của Object
 *  ("constructor", "toString", "__proto__"…) — client tra các mã này trong bảng, tên thuộc tính có sẵn sẽ làm hỏng phép tra */
export const safeId = (v) => typeof v === 'string' && ID.test(v) && v[0] !== '_' && !(v in Object.prototype) && v !== 'prototype';
const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));
const bytes = (s) => new TextEncoder().encode(s).length;

/** mã phòng hợp lệ (chữ thường, số, gạch nối, 3–16 ký tự) hoặc null. Không có mã → phòng chung */
export function roomName(raw) {
  if (raw == null || raw === '') return PUBLIC_ROOM;
  const s = String(raw).toLowerCase();
  return /^[a-z0-9][a-z0-9-]{2,15}$/.test(s) ? s : null;
}

/** Origin có nằm trong danh sách cho phép không. Mục kết thúc bằng ":*" khớp mọi cổng (dùng cho localhost) */
export function originAllowed(origin, list) {
  if (!origin) return false;
  for (const item of String(list || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (item === origin) return true;
    if (item.endsWith(':*')) { const base = item.slice(0, -2); if (origin === base || (origin.startsWith(base + ':') && /^\d{1,5}$/.test(origin.slice(base.length + 1)))) return true; }
  }
  return false;
}

const CONTROL = /[\p{Cc}\p{Cs}\p{Co}\p{Cn}]/gu;      // ký tự điều khiển, nửa cặp thay thế lẻ, vùng dùng riêng, chưa gán → đổi thành dấu cách
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u;                 // tên/tin phải còn ít nhất một ký tự nhìn thấy được (ký tự vô hình bị xoá hẳn, xem INVISIBLE ở filter.js)

/**
 * Làm sạch chuỗi người dùng gõ: chuẩn hoá NFC, bỏ ký tự điều khiển và ký tự đổi chiều chữ/vô hình, bớt dấu chồng (zalgo),
 * gộp khoảng trắng, cắt theo điểm mã (không làm vỡ emoji).
 */
export function cleanText(raw, max) {
  if (typeof raw !== 'string') return '';
  const s = raw.slice(0, max * 8).normalize('NFC')
    .replace(INVISIBLE, '').replace(CONTROL, ' ')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, max).join('').trim();
}

/** tên hiển thị: làm sạch, lọc từ tục, rỗng thì lấy tên mặc định */
export function cleanName(raw) {
  const s = censor(cleanText(raw, MAX_NAME)).text;
  return s && /[\p{L}\p{N}]/u.test(s) ? s : DEFAULT_NAME;
}

/** tin nhắn: trả về chuỗi đã cắt ≤ 120 ký tự và đã lọc, hoặc null nếu rỗng */
export function cleanChat(raw) {
  const s = cleanText(raw, MAX_CHAT);
  return s && VISIBLE.test(s) ? censor(s).text : null;
}

// ngoại hình: [tên trường, hàm kiểm → giá trị hợp lệ hoặc undefined]
const int = (a, b) => (v) => (Number.isInteger(v) && v >= a && v <= b ? v : undefined);
const num = (a, b) => (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(clampNum(v, a, b) * 100) / 100 : undefined);
const id = (v) => (safeId(v) ? v : undefined);
const idOrInt = (v) => (typeof v === 'number' ? int(0, 99)(v) : id(v));
const color = (v) => (typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : undefined);
const LOOK_FIELDS = [
  ['gender', (v) => (v === 'm' || v === 'f' ? v : undefined)], ['skin', int(0, 9)], ['hair', id], ['hairColor', int(0, 9)], ['outfit', id],
  ['height', num(1.4, 1.95)], ['build', int(0, 2)], ['face', int(0, 9)], ['age', id], ['head', idOrInt], ['glasses', int(0, 9)],
  ['top', id], ['bottom', id], ['shoes', id], ['topColor', color], ['bottomColor', color], ['shoesColor', color],
];
/** ngoại hình nhân vật: chỉ giữ trường đã biết, đúng kiểu. Trả về null nếu không phải đối tượng hoặc quá 2 KB */
export function cleanLook(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let size;
  try { size = bytes(JSON.stringify(raw)); } catch { return null; }
  if (size > MAX_LOOK_BYTES) return null;
  const out = {};
  for (const [k, check] of LOOK_FIELDS) { if (!Object.hasOwn(raw, k)) continue; const v = check(raw[k]); if (v !== undefined) out[k] = v; }
  if (!out.gender) out.gender = 'm';
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;
/**
 * Trạng thái di chuyển { p: [x, y, z], r: hướng (rad), v: tốc độ, a: đang trên không, c: clip phụ, o: dáng chụp ảnh }.
 * Trả về mảng gọn [x, y, z, r, v, a, c, o] đã kẹp trong phạm vi bản đồ, hoặc null nếu sai dạng.
 */
export function cleanState(m) {
  const p = m.p;
  if (!Array.isArray(p) || p.length !== 3) return null;
  for (const v of [p[0], p[1], p[2], m.r, m.v]) if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const clip = safeId(m.c) ? m.c : 0, pose = POSES.includes(m.o) ? m.o : 0;
  return [
    r2(clampNum(p[0], ...BOUNDS.x)), r2(clampNum(p[1], ...BOUNDS.y)), r2(clampNum(p[2], ...BOUNDS.z)),
    r2(Math.atan2(Math.sin(m.r), Math.cos(m.r))), r2(clampNum(m.v, 0, MAX_SPEED)), m.a ? 1 : 0, clip, pose,
  ];
}

/**
 * Đọc một thông điệp thô từ client. Trả về { ok: true, msg } với msg đã làm sạch, hoặc { ok: false, why }.
 * msg.t ∈ 'hello' | 's' | 'chat' | 'emote'.
 */
export function parseClient(raw) {
  if (typeof raw !== 'string') return { ok: false, why: 'binary' };
  if (raw.length > MAX_RAW) return { ok: false, why: 'size' };
  let m;
  try { m = JSON.parse(raw); } catch { return { ok: false, why: 'json' }; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, why: 'shape' };
  switch (m.t) {
    case 'hello': {
      if (m.v !== VERSION) return { ok: false, why: 'version' };
      const look = cleanLook(m.look);
      if (!look) return { ok: false, why: 'look' };
      return { ok: true, msg: { t: 'hello', name: cleanName(m.name), look } };
    }
    case 's': { const s = cleanState(m); return s ? { ok: true, msg: { t: 's', s } } : { ok: false, why: 'state' }; }
    case 'chat': {
      if (typeof m.m !== 'string') return { ok: false, why: 'chat' };
      return { ok: true, msg: { t: 'chat', m: cleanChat(m.m) } };      // m = null: tin rỗng sau khi làm sạch, bỏ qua không phạt
    }
    case 'emote': return EMOTES.includes(m.e) ? { ok: true, msg: { t: 'emote', e: m.e } } : { ok: false, why: 'emote' };
    default: return { ok: false, why: 'type' };
  }
}
