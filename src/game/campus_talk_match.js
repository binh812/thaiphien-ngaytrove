// Khớp câu người chơi gõ tự do vào chủ đề / chỗ hỏi đường / ý định. Hàm thuần (chỉ đọc dữ liệu) để thử được bằng node.
// Nguyên tắc: từ khoá viết CÓ DẤU và khớp có dấu, trọn từ ("mưa" không khớp "mua", "bàn" không khớp "bạn"); chỉ khi câu gõ hoàn toàn không dấu
// mới so bản bỏ dấu, và khi đó từ khoá một tiếng dễ nhầm bị bỏ qua. Nhiều thứ cùng khớp thì chấm điểm: lời rủ/tạm biệt > ý định rõ (tên, tuổi, giờ,
// thời tiết, xin lỗi, mua bán, hỏi đường có "ở đâu") > chủ đề nhiều tiếng > ý định chung > chủ đề một tiếng; cùng hạng thì từ khoá dài hơn thắng.
import * as D from './campus_talk_data.js';

/** bỏ dấu tiếng Việt, về chữ thường, chỉ giữ chữ và số */
export const norm = (s) => ' ' + String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
/** như norm nhưng GIỮ dấu (đưa về dạng dựng sẵn NFC, quy "oẻ/uỷ" kiểu mới về kiểu cũ để "khoẻ" = "khỏe") */
export const normVi = (s) => ' ' + String(s).toLowerCase().normalize('NFC').replace(/oà/g, 'òa').replace(/oá/g, 'óa').replace(/oả/g, 'ỏa').replace(/oã/g, 'õa').replace(/oạ/g, 'ọa').replace(/oè/g, 'òe').replace(/oé/g, 'óe').replace(/oẻ/g, 'ỏe').replace(/oẽ/g, 'õe').replace(/oẹ/g, 'ọe').replace(/uỳ/g, 'ùy').replace(/uý/g, 'úy').replace(/uỷ/g, 'ủy').replace(/uỹ/g, 'ũy').replace(/uỵ/g, 'ụy').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
// từ một tiếng mà bỏ dấu thì trùng với từ rất thông dụng khác: khi người chơi gõ không dấu thì không dùng để khớp
const AMBIG = new Set('ban con ve mua no so dep an gia loi hi muon cong trong tuong nang lanh nong tim tuoi quan lua om xau ngo ham beo lun ret gioi chao hat tho thu vang quy giup dep khao xinh'.split(' '));
const CLASS = { act: 1000, clear: 500, gen: 200 }, WHERE_BONUS = 600, TOPIC_MULTI = 300, TOPIC_ONE = 100, PLACE_MULTI = 80, PLACE_ONE = 40;      // nhắc tên chỗ mà không hỏi "ở đâu" thì xếp dưới chủ đề

/** điểm của từ khoá khớp tốt nhất trong danh sách (0 = không khớp): nhiều tiếng hơn, dài hơn thì cao hơn */
function hit(q, kws) {
  let best = 0, multi = false;
  for (const kw of kws) {
    const v = normVi(kw), a = norm(kw), words = v.trim().split(' ').length;
    const ok = q.plain ? (!(words === 1 && AMBIG.has(a.trim())) || q.a === a) && q.a.includes(a) :      // từ dễ nhầm chỉ nhận khi cả câu đúng là từ đó ("hi")
       q.v.includes(v) || (q.loose && words > 1 && q.a.includes(a));
    if (!ok) continue; const s = words * 10 + v.trim().length; if (s > best) { best = s; multi = words > 1; }
  }
  return best ? { s: best, multi } : null;
}
/**
 * desc = { kind, topics: [{ id, kw }] }. Trả về { type: 'topic', topic } | { type: 'place', line } | { type: 'intent', intent } | { type: 'deflect' }.
 * Câu gõ có dấu thì khớp có dấu; nếu không khớp được gì thì thử lại kiểu lỏng (bản bỏ dấu, chỉ từ khoá nhiều tiếng) — cho người gõ dấu không đều.
 */
export function resolveSaid(desc, said) {
  const v = normVi(said), a = norm(said), base = { v, a, plain: !/[^\x00-\x7f]/.test(v) };
  for (const q of [base, { ...base, loose: true }]) {
    let best = null; const take = (score, res) => { if (!best || score > best.score) best = { score, res }; };
    const where = hit(q, D.WHERE);
    for (const it of D.INTENTS) { const h = hit(q, it.kw); if (h) take(CLASS[it.cls] + h.s, { type: 'intent', intent: it }); }
    for (const [kws, line] of D.PLACES) { const h = hit(q, kws); if (h) take((where ? WHERE_BONUS : h.multi ? PLACE_MULTI : PLACE_ONE) + h.s, { type: 'place', line }); }
    for (const t of desc.topics) { const h = t.kw && hit(q, t.kw); if (h) take((h.multi ? TOPIC_MULTI : TOPIC_ONE) + h.s, { type: 'topic', topic: t }); }
    if (best) return best.res;
    // lượt lỏng chỉ dành cho câu gõ dấu không đều (nhiều nhất một phần ba số tiếng có dấu); câu gõ đủ dấu mà không khớp thì là không khớp
    const ws = v.trim().split(' '); if (q.plain || ws.filter(w => /[^\x00-\x7f]/.test(w)).length * 3 > ws.length) break;
  }
  return { type: 'deflect' };
}
