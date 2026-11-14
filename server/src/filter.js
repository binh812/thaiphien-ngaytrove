// Lọc từ tục cho tên hiển thị và tin nhắn. Mô-đun thuần (không phụ thuộc Workers) để thử được bằng node --test.
// Danh sách tự soạn, gọn; chủ trương thà sót còn hơn chặn nhầm tiếng Việt không dấu thông thường
// (ví dụ "cac ban", "buoi sang", "lon bia", "deo kinh" phải đi qua nguyên vẹn).
// So khớp trên bản đã chuẩn hoá (NFKC, xoá ký tự vô hình, đổi chữ đồng hình Cyrillic/Hy Lạp về Latin); bản hiển thị giữ nguyên khi không trúng.

/** từ chỉ chặn khi viết ĐỦ DẤU — dạng không dấu của chúng trùng với từ thường dùng (các, buổi, lon/lớn, đeo, du, đi, cút/cụt, phó, điểm) */
const ACCENTED = new Set(['cặc', 'kặc', 'cẹc', 'lồn', 'buồi', 'đéo', 'đụ', 'đĩ', 'cứt', 'phò', 'điếm', 'địt', 'địtmẹ', 'đụmá', 'đụmẹ']);
/** từ trong PLAIN chỉ khớp khi KHÔNG mang dấu thanh/dấu mũ (chữ đ vẫn tính): "dit", "đit" bị bắt còn "đít" (đít chai, đít ghế) thì không */
const TONELESS = new Set(['dit', 'djt', 'ditme', 'duma', 'dume']);
/** từ chặn sau khi bỏ dấu (dạng không dấu không trùng từ thường dùng) + từ viết tắt + tiếng Anh. Không có "dick": đó còn là tên riêng */
const PLAIN = new Set([
  'dit', 'djt', 'ditme', 'duma', 'dume', 'dm', 'dmm', 'dcm', 'dcmm', 'dkm', 'dkmm', 'dmcs', 'vcl', 'vkl', 'vl', 'vcc', 'cl', 'clm', 'clgt', 'cmm', 'cmnr', 'cc', 'loz', 'lozz', 'l0n', 'lonz', 'cak', 'cax',
  'shit', 'bitch', 'asshole', 'pussy', 'cunt', 'faggot', 'whore', 'slut', 'stfu',
]);
/** tiền tố tiếng Anh (fucking, fucker, motherfucker, niggas…) */
const PREFIX = ['fuck', 'motherfuck', 'nigg', 'bitch'];
/** cụm hai từ không dấu — CHỈ xét khi cả câu không có dấu nào ("con các loại" có dấu nên không bao giờ bị bắt; dạng đủ dấu đã có ACCENTED lo) */
const PAIRS = new Set(['con cac', 'dit me', 'deo me', 'me kiep', 'bu cu']);
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', '@': 'a', $: 's' };
/** chữ Cyrillic/Hy Lạp trông giống chữ Latin → chữ Latin tương ứng (tiếng Việt không dùng các chữ này nên đổi hết không sợ nhầm) */
const HOMO_FROM = 'аеорсухіјѕкмтвнԁһӏ' + 'αοερτυκνιμχβ', HOMO_TO = 'aeopcyxijskmtbhdhl' + 'aoeptukvimxb';
const HOMO = new Map(Array.from(HOMO_FROM, (c, i) => [c, HOMO_TO[i]]));

const cp = (n) => '\\u{' + n.toString(16) + '}';
const range = (pairs) => pairs.map(([a, b]) => cp(a) + '-' + cp(b)).join('');
/** ký tự vô hình / ô trống giả / đổi chiều chữ (viết bằng mã số để tệp nguồn không chứa chính các ký tự đó) — bị XOÁ hẳn khỏi tên và tin nhắn */
export const INVISIBLE_RANGES = [
  [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180b, 0x180f], [0x200b, 0x200c], [0x200e, 0x200f], [0x2028, 0x202e],
  [0x2060, 0x206f], [0x2800, 0x2800], [0x3164, 0x3164], [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff9, 0xfffb], [0x1d173, 0x1d17a], [0xe0000, 0xe007f],
];
export const INVISIBLE = new RegExp('[' + range(INVISIBLE_RANGES) + ']', 'gu');
/** khi SO KHỚP còn bỏ thêm dấu nối không độ rộng và bộ chọn biến thể (trong bản hiển thị chúng được giữ vì emoji cần) */
const JOINERS = new RegExp('[' + range([[0x200d, 0x200d], [0xfe00, 0xfe0f], [0xe0100, 0xe01ef]]) + ']', 'gu');

/** bỏ dấu tiếng Việt, đ → d */
export function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC');
}
/** bản dùng để so khớp: NFKC (chữ toàn góc, chữ kiểu toán học → chữ thường), xoá ký tự vô hình, chữ thường, đổi chữ đồng hình */
export function canon(s) {
  const t = String(s).normalize('NFKC').replace(INVISIBLE, '').replace(JOINERS, '').toLowerCase().normalize('NFC');
  return Array.from(t, (c) => HOMO.get(c) || c).join('');
}
const squeeze = (s, keep) => s.replace(/(.)\1{2,}/gu, (m, c) => c.repeat(keep));      // "fuuuuck" → "fuck" / "fuuck"
const hasAccent = (s) => stripAccents(s) !== s;

/** các dạng chuẩn hoá của một từ: { nfc: thường + đủ dấu, plain: bỏ dấu, leet: bỏ dấu + đổi số thành chữ } — đều đã bỏ ký tự chen giữa (đ.m, d-i-t) */
function forms(token) {
  const lower = canon(token);
  const nfc = lower.replace(/[^\p{L}\p{N}]/gu, '');
  const plain = stripAccents(nfc);
  const leet = stripAccents(lower.replace(/[01345@$]/g, (c) => LEET[c]).replace(/[^\p{L}\p{N}]/gu, ''));
  const toned = nfc.replace(/đ/g, 'd') !== plain;      // còn dấu thanh hoặc dấu mũ/móc (không tính chữ đ)
  return { nfc, plain, leet, toned };
}
function badWord(token) {
  const f = forms(token);
  if (!f.nfc) return false;
  for (const keep of [0, 1, 2]) {      // 0 = nguyên dạng; 1, 2 = rút chuỗi ký tự lặp ≥ 3 về 1 hoặc 2 ký tự
    const sq = keep ? (s) => squeeze(s, keep) : (s) => s;
    if (ACCENTED.has(sq(f.nfc))) return true;
    for (const v of [sq(f.plain), sq(f.leet)]) {
      if (PLAIN.has(v) && !(f.toned && TONELESS.has(v))) return true;
      if (PREFIX.some((p) => v.startsWith(p))) return true;
    }
  }
  return false;
}
/** từ chỉ gồm đúng một chữ/số (sau khi chuẩn hoá) — dùng để gộp kiểu viết rời "d i t" */
const single = (token) => Array.from(forms(token).nfc).length === 1;

/**
 * Thay từ tục bằng "***". Trả về { text, hit } (hit = có thay ít nhất một từ).
 * Tách theo khoảng trắng; dấu câu chen giữa một từ bị bỏ khi so nên "đ.m" hay "d-i-t" vẫn bị bắt;
 * dãy từ một ký tự viết rời ("d i t", "v c l") được gộp lại để so.
 */
export function censor(input) {
  const text = String(input), parts = text.split(/(\s+)/);      // phần lẻ là khoảng trắng, giữ nguyên
  const bad = parts.map((p, i) => i % 2 === 0 && p !== '' && badWord(p));
  // dãy ≥ 2 từ một ký tự liền nhau → gộp thành một từ để so
  for (let i = 0; i < parts.length; i += 2) {
    if (!parts[i] || !single(parts[i])) continue;
    let j = i; while (j + 2 < parts.length && parts[j + 2] && single(parts[j + 2])) j += 2;
    if (j > i) { let joined = ''; for (let k = i; k <= j; k += 2) joined += parts[k]; if (badWord(joined)) for (let k = i; k <= j; k += 2) bad[k] = true; }
    i = j;
  }
  // cụm hai từ: chỉ khi cả câu viết không dấu
  if (!hasAccent(canon(text))) {
    for (let i = 0; i + 2 < parts.length; i += 2) {
      if (!parts[i] || !parts[i + 2]) continue;
      if (PAIRS.has(forms(parts[i]).plain + ' ' + forms(parts[i + 2]).plain)) { bad[i] = true; bad[i + 2] = true; }
    }
  }
  const hit = bad.some(Boolean);
  return { text: hit ? parts.map((p, i) => (bad[i] ? '***' : p)).join('') : text, hit };
}
