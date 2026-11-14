// "Lớp mình": tên người chơi, tên lớp, khoá và danh sách lớp do người chơi tự nhập. Dữ liệu chỉ nằm trong localStorage của máy
// người chơi (khoá tp2_class) — không gửi đi đâu, không ghi ra console (tên bạn bè là dữ liệu riêng tư).
import { CLASS_DEFAULT, SAMPLE_ROSTER } from './reunion_data.js';

const KEY = 'tp2_class', MAX_NAME = 40, MAX_LINES = 60, MAX_TEXT = 6000;
const clip = (s, n) => Array.from(String(s ?? '').replace(/\s+/g, ' ').trim()).slice(0, n).join('').trim();      // cắt theo điểm mã, không làm vỡ emoji

export function loadClass() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { console.warn('[ngày về] không đọc được danh sách lớp đã lưu, dùng mặc định'); }
  return { me: clip(raw.me, MAX_NAME), cls: clip(raw.cls, 20) || CLASS_DEFAULT.cls, year: clip(raw.year, 24) || CLASS_DEFAULT.year, list: String(raw.list ?? '').slice(0, MAX_TEXT) };
}
export function saveClass(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { console.warn('[ngày về] trình duyệt không cho lưu danh sách lớp'); return false; }
}
const GENDER = { nam: 'm', 'nữ': 'f', nu: 'f', trai: 'm', 'gái': 'f' };
/**
 * Đọc danh sách: mỗi dòng "Tên", "Tên, nam|nữ" hoặc "Tên, nam|nữ, ghi chú". Bỏ dòng trống, cắt khoảng trắng, tên tối đa 40 ký tự,
 * tối đa 60 dòng. Giới tính không ghi thì để null (KHÔNG đoán từ tên) — nơi dùng sẽ lấy theo vai mẫu.
 * Trả về [{ name, g: 'm' | 'f' | null, note }]; danh sách trống thì trả về danh sách mẫu.
 */
export function parseRoster(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const parts = line.split(/[,;]/).map(s => clip(s, 80)).filter(Boolean); if (!parts.length) continue;
    let g = null; const notes = [];
    for (const s of parts.slice(1)) { const k = GENDER[s.toLowerCase()]; if (k && !g) g = k; else notes.push(s); }
    out.push({ name: clip(parts[0], MAX_NAME), g, note: clip(notes.join(', '), MAX_NAME) });
    if (out.length >= MAX_LINES) break;
  }
  return out.length ? out : parseRoster(SAMPLE_ROSTER);
}
export const isSample = (c) => !c.list.trim() || c.list.trim() === SAMPLE_ROSTER;

/**
 * Dựng biểu mẫu "Lớp mình" (dùng ở màn bắt đầu và ở hộp sửa trong lúc chơi). data = { me, cls, year, list } bị sửa tại chỗ;
 * onChange() gọi mỗi khi người chơi sửa xong một ô. Trả về phần tử DOM.
 */
export function buildClassForm(data, onChange) {
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = mk('div', 'rvForm');
  const field = (label, key, max, ph) => {
    const row = mk('label', 'row'), inp = mk('input'); inp.type = 'text'; inp.maxLength = max; inp.value = data[key]; inp.placeholder = ph; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.addEventListener('change', () => { data[key] = clip(inp.value, max); inp.value = data[key]; onChange(); });
    row.append(mk('span', null, label), inp); box.appendChild(row); return inp;
  };
  field('Tên bạn', 'me', MAX_NAME, 'tên gọi trong lớp'); field('Lớp', 'cls', 20, CLASS_DEFAULT.cls); field('Khoá', 'year', 24, CLASS_DEFAULT.year);
  const ta = mk('textarea'); ta.rows = 6; ta.maxLength = MAX_TEXT; ta.spellcheck = false; ta.value = data.list; ta.placeholder = 'Mỗi dòng một bạn, ví dụ:\nMinh, nam, lớp trưởng\nHoa, nữ\nTuấn';
  const count = mk('span', 'count');
  const sync = () => { const n = data.list.trim() ? parseRoster(data.list).length : 0; count.textContent = n ? `${n} bạn · 7 bạn đầu sẽ có mặt, các bạn còn lại được cô điểm danh` : 'Đang để trống: dùng danh sách mẫu (tên hư cấu)'; };
  ta.addEventListener('change', () => { data.list = ta.value.slice(0, MAX_TEXT); sync(); onChange(); }); ta.addEventListener('input', () => { data.list = ta.value.slice(0, MAX_TEXT); sync(); });
  const sample = mk('button', null, 'Dùng danh sách mẫu'); sample.type = 'button';
  sample.addEventListener('click', () => { sample.blur(); ta.value = data.list = SAMPLE_ROSTER; sync(); onChange(); });
  const foot = mk('div', 'foot'); foot.append(sample, count);
  box.append(mk('div', 'lbl', 'Danh sách lớp'), ta, foot,
    mk('p', 'help', 'Mỗi dòng một bạn: “Tên”, “Tên, nam” hoặc “Tên, nữ, ghi chú” (ghi chú như lớp trưởng, hay đi muộn…). Không ghi nam/nữ thì trò chơi tự xếp theo vai mẫu. Danh sách chỉ lưu trên máy này.'));
  sync();
  return box;
}
