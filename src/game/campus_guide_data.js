// Lời của hệ chỉ dẫn (campus_guide.js). Mỗi dòng phím: [phím trên bàn phím/chuột, phím trên máy cảm ứng (tên nút), việc làm].
// Mọi câu ngắn, tự viết; không nhắc tên riêng nhân vật nào.

/** thẻ nhỏ hiện khi lại gần một hoạt động lần đầu, và nhãn nổi trong cảnh / mục trên bảng dịch chuyển (M) */
export const SPOTS = {
  cau: { icon: '🪶', name: 'Đá cầu', line: 'Vào vòng đá chuyền với các bạn.', key: ['E', 'nút E', 'vào vòng'] },
  hoop: { icon: '🏀', name: 'Bóng rổ', line: 'Nhìn vào quả bóng cam rồi nhặt lên, ném vào rổ.', key: ['Chuột trái', 'nút ◎', 'nhặt bóng'] },
  goal: { icon: '⚽', name: 'Sân cỏ', line: 'Lại gần bóng, giữ F để sút. Chấm trắng: đá phạt đền 5 quả.', key: ['Giữ F', 'giữ nút E', 'lấy lực sút'] },
  rope: { icon: '🪢', name: 'Nhảy dây', line: 'Hai bạn quay dây, vào giữa mà nhảy.', key: ['E', 'nút E', 'vào nhảy'] },
  drum: { icon: '🥁', name: 'Trống trường', line: 'Đánh một hồi trống vào lớp.', key: ['E', 'nút E', 'đánh trống'] },
  mango: { icon: '🥭', name: 'Cây xoài', line: 'Rung cây hoặc ném dép khều quả.', key: ['E · R', 'nút E · Ném dép', 'rung · ném dép'] },
  food: { icon: '🍜', name: 'Quán ăn', line: 'Gọi món rồi tìm ghế ngồi, món được mang ra.', key: ['E', 'nút E', 'gọi món'] },
  fire: { icon: '🔥', name: 'Lửa trại', line: 'Đêm hội: ngồi xuống gốc cây quanh lửa.', key: ['C', 'nút Ngồi', 'ngồi xuống'] },
  memory: { icon: '📷', name: 'Góc kỷ niệm', line: 'Khung ảnh vàng xoay xoay: lại gần mà xem. Có 12 góc khắp trường.', key: ['E', 'nút E', 'xem'] },
  seat: { icon: '🪑', name: 'Ghế ngồi', line: 'Ghế đá, ghế nhựa, ghế băng đều ngồi được.', key: ['C', 'nút Ngồi', 'ngồi xuống'] },
  class: { icon: '🏫', name: 'Lớp học', line: 'Sổ đầu bài trên bàn giáo viên, giấy gấp máy bay ở bàn giữa lớp.', key: ['E', 'nút E', 'mở sổ · lấy giấy'] },
};

/** bảng phím hiện suốt lúc đang chơi một trò */
export const KEYS = {
  cau: { title: '🪶 Đá cầu', rows: [['F / Chuột trái', 'Đá chuyền', 'đá chuyền khi cầu tới (vòng xanh)'], ['Space', 'Tâng', 'tâng tại chỗ'], ['Giữ F', 'Đá bổng', 'đá bổng cho bạn đứng xa'], ['E', 'Thôi đá', 'thôi chơi']] },
  hoop: { title: '🏀 Bóng rổ', rows: [['Giữ chuột trái', 'giữ ◎', 'lấy lực — thả ra để ném'], ['Chấm xanh', 'Chấm xanh', 'thả lúc này là vào rổ'], ['B', 'Nhồi bóng', 'nhồi bóng khi đi'], ['Q', '—', 'thả bóng xuống']] },
  pen: { title: '⚽ Phạt đền', rows: [['Giữ F', 'giữ E', 'lấy lực — thả ra để sút'], ['Chuột', 'vuốt màn hình', 'xoay người chọn góc sút'], ['E', 'Thôi phạt đền', 'thôi đá']] },
  rope: { title: '🪢 Nhảy dây', rows: [['Space', 'Nhảy', 'nhảy khi dây sắp chạm đất'], ['E', 'Thôi nhảy', 'thôi chơi']] },
  plane: { title: '✈ Máy bay giấy', rows: [['Chuột trái', 'nút ◎', 'phóng theo hướng nhìn'], ['Chuột', 'vuốt màn hình', 'ngước lên cho bay xa']] },
};

/** chỉ dẫn từng bước cho lần chơi đầu: [lời cho bàn phím, lời cho cảm ứng] — điều kiện qua bước nằm ở campus_guide.js */
export const STEPS = {
  cau: [['Chờ cầu bay tới bạn — vòng tròn dưới đất chuyển xanh.', 'Chờ cầu bay tới bạn — vòng tròn dưới đất chuyển xanh.'], ['Bấm F (bấm sớm cũng được) để đá chuyền.', 'Bấm nút “Đá chuyền”.'], ['Đá thêm hai quả nữa cho quen chân.', 'Đá thêm hai quả nữa cho quen chân.']],
  hoop: [['Quay về phía rổ rồi GIỮ chuột trái.', 'Quay về phía rổ rồi GIỮ nút ◎.'], ['Ngước máy lên; chấm chuyển xanh thì THẢ.', 'Vuốt ngước lên; chấm chuyển xanh thì THẢ.'], ['Ném tới khi vào một quả.', 'Ném tới khi vào một quả.']],
  pen: [['Xoay chuột chọn góc khung thành, GIỮ F lấy lực.', 'Vuốt chọn góc, GIỮ nút E lấy lực.'], ['THẢ ra để sút — sút vào góc, xa thủ môn.', 'THẢ ra để sút — sút vào góc, xa thủ môn.']],
  rope: [['Nhìn dây: bấm Space ngay trước khi dây chạm đất.', 'Nhìn dây: bấm “Nhảy” ngay trước khi dây chạm đất.'], ['Giữ nhịp, nhảy liền ba cái.', 'Giữ nhịp, nhảy liền ba cái.']],
};
export const TEXT = { skip: 'Bỏ qua', step: 'Bước', done: 'Thuộc bài rồi!', more: ['?', 'nút ?', 'xem tất cả phím'], marks: 'Biển chỉ dẫn hoạt động', off: 'Tắt', on: 'Bật', mapTitle: 'Hoạt động trong trường', busy: 'Đang dở tay — xong việc này rồi hãy đi.', went: 'Đã tới: ',
  helpTitle: 'Trợ giúp', close: 'Đóng (Esc)', held: 'Nút ◎: ném', pick: ['Chuột trái: nhặt bóng', 'Nút ◎: nhặt bóng'], pickAny: ['Chuột trái: nhặt lên', 'Nút ◎: nhặt lên'],
  ball: ['Giữ chuột trái: lấy lực · thả: ném · B: nhồi', 'Giữ nút ◎: lấy lực · thả: ném'], plane: ['Chuột trái: phóng máy bay giấy', 'Nút ◎: phóng máy bay giấy'], shoot: ['Giữ F: lấy lực sút · thả: sút', 'Giữ nút E: lấy lực sút · thả: sút'] };

/** máy cảm ứng: đổi tên phím trong mọi lời hiện ra thành tên nút trên màn hình (áp lần lượt) */
export const TOUCH_WORDS = [
  [/Enter \/ Space \/ bấm vào đây để tiếp/g, 'Chạm vào đây để tiếp'], [/Phím 1(–\d)? hoặc bấm vào câu trả lời/g, 'Chạm vào câu trả lời'], [/^H: vẫy tay chào$/, 'Nút 👋: vẫy tay chào'],
  [/\s*[·—-]?\s*E hoặc Esc để thôi\.?/g, ''], [/\s*·\s*E:\s*thôi\.?/g, ''], [/\(C\)/g, '(nút Ngồi)'],
  [/[Gg]iữ chuột trái \(hoặc Space\)/g, 'giữ nút ◎'], [/[Cc]huột trái/g, 'nút ◎'], [/bằng chuột/g, 'bằng nút ◎'],
  [/[Gg]iữ F/g, 'giữ nút E'], [/thả F/g, 'thả nút E'], [/([Bb]ấm|rồi bấm) F\b/g, '$1 nút E'], [/([Bb]ấm) R\b/g, '$1 nút “Ném dép”'], [/([Bb]ấm) E\b/g, '$1 nút E'], [/([Bb]ấm) Space/g, '$1 nút “Nhảy”'],
  [/\s*·\s*B nhồi bóng[^·]*/g, ' · nút “Nhồi bóng” '], [/\bE dưới rổ/g, 'nút E dưới rổ'], [/\bE ở chấm/g, 'nút E ở chấm'], [/[Pp]hím (\d)/g, 'nút $1'],
];
/** nhóm đứng đầu bảng trợ giúp trên máy cảm ứng */
export const HELP_TOUCH = ['Trên màn cảm ứng', [['Cần tròn', 'đi (đẩy hết cỡ là chạy)'], ['Vuốt màn hình', 'nhìn quanh'], ['Nút ⤒', 'nhảy'], ['Nút E', 'dùng, nói chuyện, vào trò, đá'], ['Nút ◎', 'nhặt / ném — giữ để lấy lực ném rổ'], ['Nút có chữ', 'hiện theo chỗ đang đứng: Ngồi, Ném dép, Đá chuyền, Nhảy…'], ['Nút 👋', 'vẫy tay chào'], ['Nút ?', 'mở / đóng bảng này']]];
/** bảng trợ giúp đầy đủ (phím ?): [nhóm, [[phím, việc]…]] */
export const HELP = [
  ['Đi lại', [['W A S D', 'đi'], ['Shift', 'chạy'], ['Space', 'nhảy'], ['Chuột', 'nhìn quanh'], ['V', 'đổi góc nhìn'], ['M', 'dịch chuyển nhanh, xem các hoạt động'], ['Tab', 'giờ, thời tiết, đồ hoạ']]],
  ['Tay chân', [['Chuột trái', 'nhặt / ném'], ['Q', 'thả vật đang cầm'], ['E', 'dùng, vào trò, mở sổ'], ['F', 'đá'], ['C', 'ngồi xuống / đứng dậy'], ['H', 'vẫy tay chào'], ['R', 'ném dép khều xoài (gần cây)']]],
  ['Trò chuyện · chụp ảnh', [['E', 'nói chuyện với người đứng gần'], ['1–9', 'chọn câu trả lời'], ['Ô “Nói gì đó…”', 'gõ câu của mình rồi Enter'], ['J', 'chương trình Ngày về'], ['P', 'chế độ chụp ảnh'], ['G', 'rủ người quanh đó chụp cùng']]],
  ['Đá cầu', [['E', 'vào vòng'], ['F / Chuột trái', 'đá chuyền khi cầu tới mình'], ['Space', 'tâng tại chỗ'], ['Giữ F', 'đá bổng']]],
  ['Bóng rổ', [['Chuột trái', 'nhặt bóng'], ['Giữ chuột trái', 'lấy lực, thả để ném'], ['B', 'nhồi bóng'], ['E dưới rổ', 'thi ném 60 giây']]],
  ['Sân cỏ · nhảy dây', [['Giữ F', 'lấy lực sút, thả để sút'], ['E ở chấm trắng', 'đá phạt đền 5 quả'], ['E cạnh dây', 'vào nhảy dây'], ['Space', 'nhảy đúng nhịp']]],
  ['Khác', [['Đêm 19h30', 'lửa trại ở góc sân phía tây'], ['Quán ăn', 'E gọi món, C ngồi, E thưởng thức'], ['Lớp học', 'sổ đầu bài, gấp máy bay giấy'], ['?', 'mở / đóng bảng này']]],
];
