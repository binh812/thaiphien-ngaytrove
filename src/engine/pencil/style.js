// Kiểu vẽ của trò chơi: 'real' (tả thực, mặc định) hoặc 'pencil' (chì màu — bản thử).
// Chọn bằng ?style=pencil hoặc nút "Kiểu vẽ" trong bảng Tab (lưu localStorage tp2_style); đổi kiểu phải nạp lại trang
// vì kiểu chì màu vá mã shader của three trước khi vật liệu đầu tiên được biên dịch.
const KEY = 'tp2_style';
const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; /* trình duyệt chặn lưu trữ: coi như chưa chọn */ } };

export const STYLE = (() => {
  const s = new URLSearchParams(location.search).get('style') || read();
  return s === 'pencil' ? 'pencil' : 'real';
})();
export const PENCIL_ON = STYLE === 'pencil';

/** lưu lựa chọn rồi nạp lại trang với kiểu mới */
export function setStyle(style) {
  try { localStorage.setItem(KEY, style); } catch (e) { console.warn('Không lưu được kiểu vẽ', e); }
  const u = new URL(location.href); u.searchParams.set('style', style); location.href = u.toString();
}
