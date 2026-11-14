// Dữ liệu thuần của "đời sống sân trường" (campus_life.js): góc kỷ niệm, lời bình ném dép, sổ đầu bài, câu chào. Mọi lời văn tự viết, tên hư cấu.
// Ký hiệu thay thế: {me} tên người chơi · {lop} tên lớp · {ac}/{Ac} anh|chị.

/** góc kỷ niệm: at = [x, cao độ nền ước lượng, z] (cao độ sẽ dò lại), nm = tên ngắn, t = lời hồi tưởng */
export const MEMORIES = [
  { id: 'cong', at: [41, 0.15, 57.6], nm: 'Cổng trường', t: 'Ngày ấy, cổng trường khép lại khi trống vào lớp. Đứa nào đến sau thì đứng ngoài nhìn vào, thấy sân trường rộng hơn hẳn mọi hôm.' },
  { id: 'trong', at: [50.4, 0.15, 13.6], nm: 'Trống trường', t: 'Ngày ấy, mấy tiếng trống là đủ chia một ngày thành hai nửa: nửa mong trống vào chậm thôi, nửa mong trống ra thật nhanh.' },
  { id: 'xoai', at: [33.2, 0, 6.6], nm: 'Cây xoài', t: 'Ngày ấy, xoài chưa kịp chín đã hết. Cái vị chua ấy bây giờ ra chợ mua bao nhiêu cũng không thấy lại.' },
  { id: 'hanhlang', at: [50.5, 4.35, -14], nm: 'Hành lang tầng hai', t: 'Ngày ấy, đứng ở lan can tầng hai nhìn xuống là biết hết: ai đi muộn, ai trực nhật, và ai đang đi ngang qua mà mình không dám gọi.' },
  { id: 'cauthang', at: [-40.4, 0.15, 13.4], nm: 'Cầu thang', t: 'Ngày ấy, cầu thang là nơi chạy hai bậc một khi trống vào, và đi thật chậm khi tan học cùng một người.' },
  { id: 'lop', at: [59.6, 0.15, -34.5], nm: 'Lớp học', t: 'Ngày ấy, mặt bàn nào cũng có vài dòng khắc trộm. Chữ đã mờ, nhưng đứa khắc thì vẫn nhớ mình viết cho ai.' },
  { id: 'sankhau', at: [46.6, 0.83, -7.3], nm: 'Sân khấu', t: 'Ngày ấy, đứng trên sân khấu này run đến quên cả lời. Dưới sân chẳng ai để ý, chỉ có mình nhớ mãi.' },
  { id: 'bongro', at: [-36, 0, -6.5], nm: 'Sân bóng rổ', t: 'Ngày ấy, một quả bóng mười đứa tranh. Thua thì khao trà đá, thắng thì… cũng khao, vì vui.' },
  { id: 'cangtin', at: [54.2, 0, 24.2], nm: 'Căng tin', t: 'Ngày ấy, một cái bánh chia ba. Đứa cầm bánh bao giờ cũng được phần to nhất, và bao giờ cũng cãi là không.' },
  { id: 'nhaxe', at: [66, 0, 9], nm: 'Nhà để xe', t: 'Ngày ấy, xe đạp dựng san sát, chìa khoá buộc dây dù. Có hôm ra về thấy lốp xe ai đó đã bơm hộ, chẳng để lại tên.' },
  { id: 'tuong', at: [-43.4, 0, 35.8], nm: 'Vườn tượng đài', t: 'Ngày ấy, sáng thứ hai nào cũng xếp hàng chào cờ. Nắng thì mong mau xong, bây giờ lại mong được đứng thêm một lần nữa.' },
  { id: 'pho', at: [38.5, 0.14, 77.6], nm: 'Phố trước cổng', t: 'Ngày ấy, tan học là cả con phố trước cổng thành của học trò. Một cốc nước, bốn cái ống hút, ngồi đến lúc bị gọi về.' },
];
export const MEMORY_DONE = { title: 'Đủ mười hai góc kỷ niệm', sub: 'Bộ sưu tập hoài niệm', lines: ['Mười hai mảnh, ghép lại thành ba năm. Những thứ tưởng đã quên hoá ra vẫn nằm nguyên ở đấy, chỉ chờ mình quay về nhặt.'], btn: 'Cất vào túi' };

export const SANDAL = {
  hit: ['Trúng rồi! Tay nghề này chắc luyện từ hồi lớp 10.', 'Rụng rồi kìa, nhặt nhanh kẻo đứa khác lấy mất!', 'Một phát ăn ngay, đúng là dân trong nghề.'],
  miss: ['Trượt rồi! Dép bay đẹp đấy, nhưng xoài không sợ.', 'Lệch cả mét. Nhặt dép ném lại đi ạ.', 'Suýt trúng… cái lá.'],
  stuck: ['Thôi xong, dép ở lại với cây rồi. Rung cây thử xem!', 'Dép lên cành ngồi rồi kìa. Giờ đi chân đất về à?'],
  bare: 'Cành ấy hết quả rồi, dép rơi không.',
  none: 'Hết dép rồi — nhặt dép dưới gốc cây đã.', back: 'Nhặt lại được dép.', hint: 'R · Ném dép khều xoài',
};

/** vài dòng có sẵn trong mỗi cuốn sổ đầu bài (mỗi phòng lấy ba dòng theo tên phòng) */
export const BOOK = {
  title: 'SỔ ĐẦU BÀI', label: 'Mở sổ đầu bài phòng ', placeholder: 'Viết một dòng nhận xét (tối đa 90 ký tự)…', add: 'Ghi sổ', close: 'Gấp sổ', empty: 'Chưa ai ghi gì.',
  seed: [
    'Lớp trật tự, hăng hái phát biểu. Riêng dãy cuối hăng hái hơi quá.', 'Vắng hai, không phép. Bảng lau chưa sạch.', 'Giờ Văn cả lớp im lặng — vì ngủ gật tập thể.',
    'Lớp ngoan. Có tiến bộ so với tuần trước (tuần trước rất kém).', 'Ba em quên vở, một em quên cả cặp.', 'Sĩ số đủ. Trực nhật tốt. Đề nghị không vẽ lên bàn.',
    'Lớp ồn. Lớp trưởng nhắc ba lần, lần thứ tư lớp trưởng cũng nói chuyện.', 'Giờ kiểm tra nghiêm túc. Đề nghị nghiêm túc cả lúc không kiểm tra.',
    'Có tiếng cười trong giờ. Cô hỏi cười gì, cả lớp không ai nhận.', 'Học tốt, đáng khen. Cuối giờ còn ba bạn ở lại hỏi bài.',
  ],
};

export const PLANE = {
  label: 'Lấy tờ giấy gấp máy bay', busy: 'Thả vật đang cầm trước (Q) rồi hãy lấy giấy.', short: 'Máy bay chúi xuống ngay — ra chỗ thoáng mà phi.', folding: 'Đang gấp máy bay giấy…', ready: 'Gấp xong! Ra hành lang, chuột trái để phi.', flew: 'Máy bay thứ {n} — bay được {d} m.',
};

export const SIT = { hint: 'C · Ngồi xuống', up: 'C · Đứng dậy', none: 'Chưa có ghế nào trong tầm — lại gần ghế đá, ghế nhựa hoặc ghế băng trong lớp.' };

/** câu chào khi người chơi đi ngang (thầy cô, người lớn gọi "em"; học sinh gọi "anh/chị"); bộ không tên dùng khi người chơi chưa nhập tên */
export const GREET = {
  elder: ['{me} đấy à em!', 'Chào em {me}!', 'A, {me}! Về thăm trường đấy à?', '{me} lớp {lop} phải không? Nhớ rồi!'],
  elderNoName: ['Chào em!', 'Về thăm trường đấy à em?', 'Lớp {lop} hôm nay về đông nhỉ!'],
  young: ['Em chào {ac} {me} ạ!', '{Ac} {me} ơi, lớp {lop} về đông thế ạ!', 'Chào {ac} {me}!'],
  youngNoName: ['Em chào anh chị ạ!', 'Chào {ac} ạ!', 'Anh chị lớp {lop} ạ? Em chào ạ!'],
};

/* ===== đợt 2: gọi món, đêm lửa trại, đá cầu ===== */
// món: [tên, kiểu bát đĩa ('cup' cốc | 'bowl' bát | 'plate' đĩa | 'pack' gói lá), màu]
/** quán: npc = id người bán trong CAST của people.js (không có thì dùng điểm at và tên seller); tên quán, người bán đều hư cấu */
export const VENDORS = [
  { id: 'hoasua', at: [35.3, 0.14, 79.2], seller: 'Chị Hoà – quán Hoa Sữa', greet: ['Lâu lắm mới thấy mặt! Vẫn bàn cũ nhé.', 'Khách quen đây rồi. Hôm nay nếp cẩm mới đồ, thơm lắm.'], hello: 'Ăn gì chị làm?',
    menu: [['Sữa chua nếp cẩm', 'bowl', 0x6a3a6a], ['Sữa chua trân châu', 'cup', 0xf4f0e6], ['Ca cao dầm', 'cup', 0x6a4a32], ['Nước mía', 'cup', 0xb8c860]] },
  // at/seller/greet: dùng khi người bán không có mặt (mức đồ hoạ thấp bỏ bớt nhân vật) — quầy vẫn bán được, khách tự chọn
  { id: 'xoi', npc: 'xoi', at: [52.1, 0.14, 57.6], seller: 'Hàng xôi cổng trường', greet: ['Người bán vừa chạy đi lấy thêm lá gói. Tấm bìa ghi: “Khách quen cứ tự chọn, tiền để vào hộp.”', 'Vẫn tấm bìa ấy: “Khách quen cứ tự chọn, tiền để vào hộp.”'], hello: 'Xôi gì nào? Vẫn gói lá như ngày xưa nhé.',
    menu: [['Xôi xéo', 'pack', 0xe8c23a], ['Xôi lạc', 'pack', 0xe6dcc0], ['Bánh mì trứng', 'plate', 0xd8a45a]] },
  { id: 'trada', npc: 'trada', hello: 'Ngồi đi cháu. Uống gì bà rót?',
    menu: [['Trà đá', 'cup', 0xc8963a], ['Trà chanh', 'cup', 0xd8c84a], ['Nhân trần', 'cup', 0x8a5a2a], ['Hướng dương', 'plate', 0x3a3632]] },
  { id: 'cangtin', npc: 'cangtin', hello: 'Ăn gì cô lấy? Trống vào thì nhớ trả cốc nhé.',
    menu: [['Bánh mì pa-tê', 'plate', 0xd8a45a], ['Mì tôm trứng', 'bowl', 0xe8a03a], ['Sữa đậu nành', 'cup', 0xf6f2e6], ['Trà đá', 'cup', 0xc8963a]] },
];
export const FOOD = {
  label: 'Gọi món: ', cancel: 'Thôi, lát nữa', ordered: 'Đã gọi {nm}. Tìm chỗ ngồi gần đây (C) rồi món sẽ được mang ra.', waiting: 'Món {nm} đang chờ — tìm chỗ ngồi gần quán đã.', servedElsewhere: 'Món {nm} đã mang ra ở chỗ ngồi lúc nãy rồi, ăn xong hãy gọi thêm.', gone: 'Chờ mãi không thấy khách, quán dọn món {nm} đi rồi. Gọi lại lúc nào cũng được.',
  served: '{nm} ra rồi! Bấm E để thưởng thức.', eat: 'Thưởng thức ', eating: 'Đang thưởng thức {nm}…',
  done: ['Vẫn đúng cái vị ấy.', 'Ngon như hồi còn phải góp tiền mới đủ mua.', 'Hết veo. Ngày xưa ăn chậm là mất phần.', 'Thêm suất nữa thì bác sĩ mắng, nhưng đáng.'],
  chat: [['tung', 'Cho tôi xin miếng… à thôi, gọi thêm suất nữa.'], ['huong', 'Ngày xưa cả bàn chung một cốc, giờ mỗi đứa một cốc lại thấy thiếu thiếu.'], ['long', 'Ai trả tiền đấy? Tôi để quên ví từ năm lớp 11.'], ['ngan', 'Yên tâm, tôi ghi sổ. Quỹ lớp chi.']],
};

export const FIRE = {
  at: [-32.5, -12.3], from: 19.5, until: 4,                       // giờ bắt đầu / kết thúc đêm hội
  sitters: ['ba1', 'ba2', 'ba3', 'xoai'], guitarist: 'ba2',   // id trong CAST của people.js
  start: 'Trời tối rồi — góc sân phía tây, cạnh sân bóng rổ, có lửa trại.',
  talk: ['Lửa lên rồi, ai kể chuyện ma đi!', 'Hát bài gì ai cũng thuộc ấy!', 'Khoai nướng chín chưa nhỉ?', 'Ngồi dịch vào cho ấm.', 'Sao đêm nay nhiều thế.', 'Đừng thổi, khói bay sang tớ!'],
  mates: [['thuy', 'Đêm lửa trại năm lớp 12 tôi hát lạc cả giọng, còn ai nhớ không?'], ['dung', 'Hôm ấy tôi đến muộn, lửa tàn mới tới nơi.'], ['quang', 'Sĩ số quanh lửa: đủ. Hiếm có.'], ['huong', 'Giá mà đêm nay dài thêm một tí.']],
  chords: [[220, 261.6, 329.6, 440], [174.6, 220, 261.6, 349.2], [196, 261.6, 329.6, 392], [196, 246.9, 293.7, 392]],      // La thứ, Fa, Đô, Son — vòng hợp âm chung, không phải bài hát nào
};

export const CAU = {
  at: [-31.5, -5.5], label: 'Vào đá cầu cùng', join: 'Chạy tới dưới cầu (vòng vàng là chỗ cầu rơi) rồi đá: F chuyền cho bạn · Space tâng lên đầu mình · giữ F rồi thả là búng xa. E hoặc Esc để thôi.', leave: 'Nghỉ đá cầu.',
  streak: 'Chạm liên tiếp: {n} · kỷ lục {m}', miss: 'Hụt!', wait: 'Chờ phát cầu…', best: 'Kỷ lục mới của vòng cầu!', late: 'Cầu rơi mất rồi!', down: 'Cầu rơi — cả vòng được {n} chạm.', tPass: 'Đá', tFlick: 'Búng',
  cheer: ['Đẹp!', 'Chuẩn!', 'Nữa đi!', 'Dẻo chân thế!'], oops: ['Ôi…', 'Hụt rồi!', 'Làm lại, làm lại!'],
  looks: [
    { gender: 'm', outfit: 'pe', age: 'teen', hair: 'crew', skin: 2, face: 3, height: 1.71, build: 0 },
    { gender: 'f', outfit: 'pe', age: 'teen', hair: 'pony', skin: 0, face: 5, height: 1.57, build: 0 },
    { gender: 'm', outfit: 'pe', age: 'teen', hair: 'fringe', skin: 1, face: 1, height: 1.68, build: 1 },
  ],
};

export const HOOP = {
  hint: 'Đang cầm bóng rổ: giữ chuột trái (hoặc Space) để lấy lực, thả ra để ném (chấm xanh là sẽ vào) · B nhồi bóng, đang nhồi bấm Space để cầm lên ném · E dưới rổ: thi ném 60 giây', power: 'Lực ném — thả ra để ném',
  two: '🏀 Vào! +2 điểm · chuỗi {n}', three: '🏀 Ba điểm từ {d} m! · chuỗi {n}', other: '🏀 Vào rổ!', miss: 'Trượt — mất chuỗi {n} quả.', missOne: 'Trượt rồi.',
  mode: 'Thi ném 60 giây', modeStop: 'Thôi thi ném', modeStart: 'Sáu mươi giây bắt đầu! Ném được bao nhiêu thì ném, bóng có người nhặt trả.', modeBar: 'Còn {s} giây · {n} điểm',
  modeEnd: 'Hết giờ: {n} điểm (kỷ lục {m}).', modeBest: 'Hết giờ: {n} điểm — kỷ lục mới!', tDribble: 'Nhồi bóng', tPick: 'Cầm bóng',
  pass: { young: ['Bóng này ạ!', 'Em ném trả đây ạ!', 'Bắt lấy ạ!'], mate: ['Bóng này, bắt lấy!', 'Ném thế mà cũng đòi ba điểm. Bóng đây!', 'Tôi nhặt cho lần này thôi nhé!'] },
};

export const GOAL = {
  hint: 'Sân cỏ: lại gần quả bóng, giữ F để lấy lực, thả ra để sút (ngước máy lên thì bóng bổng) · E ở chấm trắng: đá phạt đền 5 quả',
  power: 'Lực sút — thả F để sút', lost: 'Bóng lăn khỏi chân rồi — lại gần lấy lực lại.', goal: '⚽ Vào!!! Bàn thứ {n}.', cheer: ['Vào rồi!', 'Đẹp quá ạ!', 'Sút căng thế!'], save: ['Bắt được rồi nhé!', 'Còn lâu mới qua!', 'Sút nhẹ thế ạ?'],
  penLabel: 'Đá phạt đền 5 quả', penStart: 'Phạt đền 5 quả: giữ F lấy lực, thả ra để sút. Thủ môn sẽ đổ người theo bóng — sút vào góc. E hoặc Esc để thôi.',
  penBar: 'Phạt đền: quả {k}/5 · vào {n}', penIn: 'Vào! {n}/{k}', saved: 'Thủ môn bắt được. {n}/{k}', penOut: 'Ra ngoài mất rồi. {n}/{k}',
  penEnd: 'Hết loạt: vào {n}/5 (kỷ lục {m}/5).', penBest: 'Hết loạt: vào {n}/5 — kỷ lục mới!', penQuit: 'Thôi đá phạt đền.', tQuit: 'Thôi phạt đền',
};

export const ROPE = {
  at: [-26, 48.3], label: 'Vào nhảy dây', join: 'Nhảy dây: bấm Space đúng lúc dây sắp quét qua chân (nghe tiếng dây chạm đất làm nhịp). Dây quay nhanh dần. E hoặc Esc để thôi.',
  bar: 'Nhảy dây: {n} · kỷ lục {m}', trip: 'Vướng dây rồi — được {n} cái.', tripFirst: 'Vướng dây! Nhảy sớm hơn một chút.', best: 'Kỷ lục nhảy dây mới!', leave: 'Nghỉ nhảy dây.',
  tJump: 'Nhảy', tQuit: 'Thôi nhảy', cheer: ['Giỏi thế!', 'Nhanh nữa này!', 'Đừng vướng nhé!'], oops: ['Ối, vướng rồi!', 'Làm lại nào!', 'Tại dây đấy, không phải tại chân đâu.'],
  looks: [
    { gender: 'f', outfit: 'pe', age: 'teen', hair: 'pony', skin: 1, face: 2, height: 1.58, build: 0 },
    { gender: 'f', outfit: 'pe', age: 'teen', hair: 'bob', skin: 0, face: 6, height: 1.6, build: 1 },
  ],
};
