// Lời và số liệu cho nếp sinh hoạt thường ngày ở sân trường (campus_daily.js): lời đáp khi được vẫy tay, lối đi tuần của vài nhân vật,
// hai bạn ngồi ghế đá, và các mẩu chuyện nhân vật nói với nhau. Mọi câu đều tự viết, hư cấu; không nhắc tên riêng nào ngoài những thứ có thật
// trong cảnh ở cả hai mức đồ hoạ (cây xoài, trống trường, ghế đá, căng tin, sân bóng rổ, sân khấu văn nghệ).

/** lời đáp khi người chơi vẫy tay (H): young = học sinh, elder = thầy cô/cô bác, mate = bạn cùng lớp. {ac} = anh/chị theo nhân vật người chơi */
export const WAVE = {
  young: ['Em chào {ac} ạ!', 'Chào {ac} ạ!', '{Ac} ơi, bên này ạ!'],
  elder: ['Ừ, chào em nhé!', 'Chào em, về chơi vui nhé!', 'Ừ, ừ, chào em!'],
  mate: ['Đây, đây!', 'Vẫy gì mà nhiệt tình thế!', 'Ơi, thấy rồi!'],
  hint: 'H: vẫy tay chào',
};

/**
 * Lối đi của vài nhân vật trong trường (id ở people.js): các điểm [x, z] lần lượt ghé qua rồi về chỗ cũ; rest = [ít nhất, nhiều nhất] giây đứng
 * lại mỗi điểm. Điểm nào bị vật cản chắn lối đi thẳng thì lượt đó bỏ qua (campus_daily.js dò tia trước khi đi). low = có chạy ở mức đồ hoạ thấp.
 */
export const ROUTES = [
  // aside: chỗ lánh ra khi lớp chụp ảnh kỷ yếu ở cổng (sau lưng máy ảnh)
  { id: 'guard', low: true, rest: [7, 14], pts: [[43.8, 46.6], [45.6, 48.6]], aside: [44.4, 45.0] },
  { id: 'nhay', low: true, rest: [8, 16], pts: [[-3.6, -39.2], [-3.6, -41.4]] },
  { id: 'saodo', low: false, rest: [8, 15], pts: [[38.1, 45.2], [35.2, 46.4]] },
  { id: 'guong', low: false, rest: [8, 16], pts: [[46.5, -40.2], [46.5, -44.5]] },
];
/** người bán hàng thỉnh thoảng lau dọn/xếp đồ ở quầy (clip interact) */
export const TIDY = { ids: ['trada', 'xoi', 'cangtin'], every: [11, 22], secs: 2 };

/** hai bạn học sinh ngồi ghế đá (chỉ ở mức đồ hoạ cao): ghế gần điểm near nhất */
export const BENCH = {
  near: [20, 35.78],
  looks: [
    { gender: 'f', outfit: 'white', age: 'teen', hair: 'bob', skin: 0, face: 2, height: 1.56, build: 0 },
    { gender: 'f', outfit: 'jacket', age: 'teen', hair: 'long', skin: 1, face: 4, height: 1.59, build: 0 },
  ],
};

/**
 * Mẩu chuyện nền giữa hai nhân vật đứng gần nhau khi người chơi ở gần. Khoá = hai vai (m: bạn cùng lớp · s: học sinh · e: thầy cô ·
 * v: bác bảo vệ/người bán hàng), vai đứng trước nói câu đầu, hai người nói xen kẽ. {tc}/{Tc} = thầy|cô, {vb}/{Vb} = bác|bà|cô của người kia.
 */
export const CHATS = {
  ss: [
    ['Mai kiểm tra mười lăm phút Lý đấy, cậu ôn chưa?', 'Chưa. Tớ định tối nay ôn, mà tối nào tớ cũng định thế.', 'Thế ra chơi tớ giảng cho bài con lắc.', 'Nhất cậu. Tớ bao trà đá.'],
    ['Hôm nay nhiều anh chị khoá trước về trường thế nhỉ.', 'Họp lớp đấy. Hai chục năm nữa bọn mình cũng thế.', 'Lúc ấy cậu nhớ gọi tớ, đừng có lơ.', 'Lơ sao được, cậu còn nợ tớ cái bút.'],
    ['Cậu trực nhật hôm nay đúng không? Bảng chưa lau kìa.', 'Tớ lau rồi, tại phấn nó bám.', 'Phấn nào bám thành chữ “kiểm tra miệng” được?', '…Để tớ lau lại.'],
    ['Ra căng tin không? Tớ đói lả rồi.', 'Còn năm phút nữa là trống đấy.', 'Năm phút là đủ một cái bánh mì.', 'Ừ thì đi. Mà chạy nhé!'],
    ['Sổ đầu bài hôm nay lớp mình được mấy điểm?', 'Chín. Mất một điểm vì có đứa cười trong giờ.', 'Đứa nào?', 'Cậu chứ ai.'],
  ],
  se: [
    ['Em chào {tc} ạ!', 'Ừ, chào em. Bài hôm qua làm xong chưa?', 'Dạ… em làm gần xong rồi ạ.', '“Gần xong” của em là mới chép đề chứ gì.', '{Tc} tinh thế ạ.'],
    ['{Tc} ơi, hôm nay các anh chị cựu học sinh về đông quá ạ.', 'Ừ. Ngày xưa các anh chị ấy cũng nghịch y như các em.', 'Thật ạ? Thế mà giờ trông ai cũng nghiêm.', 'Nghiêm được đến lúc gặp lại nhau thôi em ạ.'],
  ],
  sv: [
    ['{Vb} ơi, hôm nay cổng mở đến mấy giờ ạ?', 'Đến tối. Ngày hội trường mà, cứ thong thả.', 'Thế cháu ở lại xem văn nghệ được không ạ?', 'Được, nhưng nhớ báo bố mẹ một câu.'],
    ['Cháu chào {vb} ạ!', 'Ừ, ngoan. Hôm nay khách đông, đi đứng cẩn thận nhé.', 'Vâng ạ. {Vb} có cần cháu phụ gì không ạ?', 'Có lòng thế là quý rồi. Đi chơi đi.'],
  ],
  mm: [
    ['Sân trường bé đi hay là mình to ra nhỉ?', 'Mình to ra. Bề ngang là chính.', 'Nói thế mà nghe được à.', 'Thì tôi nói tôi mà.'],
    ['Cái ghế đá vẫn còn kìa.', 'Ngày xưa ngồi đấy chép bài nhau suốt.', 'Chép của tôi chứ của ai.', 'Chép xong vẫn sai, thế mới tài.'],
    ['Lát chụp ảnh nhớ đứng thẳng lên đấy.', 'Bao nhiêu năm rồi vẫn bị nhắc đứng thẳng.', 'Tại bao nhiêu năm rồi vẫn đứng lệch.', 'Lệch cho có nét riêng.'],
    ['Nghe tiếng trống mà giật cả mình.', 'Phản xạ bao năm chưa mất, cứ tưởng vào lớp muộn.', 'Giờ có muộn cũng chẳng ai ghi sổ.', 'Thế mới thấy nhớ cái sổ.'],
    ['Căng tin còn bán bánh mì không nhỉ?', 'Còn. Lúc nãy tôi ngó rồi.', 'Thế lát rủ cả lớp ra làm một vòng.', 'Ai đến sau người ấy trả tiền nhé.'],
  ],
  ms: [
    ['Các em sắp vào giờ chưa?', 'Dạ chưa ạ, bọn em đang ra chơi. Anh chị về họp lớp ạ?', 'Ừ, lâu lắm rồi mới về đấy.', 'Thế ạ! Trường có khác nhiều không ạ?', 'Khác nhiều. Chỉ có tiếng trống là y nguyên.'],
    ['Giờ các em còn chào cờ sáng thứ Hai không?', 'Có ạ, tuần nào cũng xếp hàng ạ.', 'Thế là vẫn như bọn anh chị ngày xưa.', 'Thế ngày xưa anh chị có trốn không ạ?', 'Câu này thì… xin không trả lời.'],
  ],
  me: [
    ['Em chào {tc} ạ. Em là học sinh cũ của trường mình.', 'Ừ, quý hoá quá. Các em về đông đủ thế này là vui rồi.', 'Trường khang trang hơn hồi bọn em nhiều quá ạ.', 'Trường thì mới, còn nghịch thì khoá nào cũng như khoá nào.'],
    ['{Tc} ơi, học trò bây giờ có ngoan hơn bọn em không ạ?', 'Ngoan hơn thì chưa chắc, nhưng lý sự thì giỏi hơn.', 'Thế là vẫn giống bọn em rồi ạ.', 'Ừ. Cho nên thầy cô mới nhớ lâu.'],
  ],
  mv: [
    ['{Vb} vẫn khoẻ chứ ạ?', 'Khoẻ. Thấy các anh chị về là {vb} khoẻ ra.', 'Bọn cháu về làm ồn cả sân, {vb} đừng trách nhé.', 'Ồn thế mới ra ngày hội. Cứ tự nhiên.'],
    ['Hôm nay chắc {vb} bận lắm ạ?', 'Bận mà vui. Cả năm mới có một ngày thế này.', 'Lát xong việc {vb} ra xem văn nghệ với bọn cháu nhé.', 'Ừ, để {vb} xem đã. Có lòng là quý rồi.'],
  ],
};
