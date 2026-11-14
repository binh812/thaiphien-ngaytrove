// Dữ liệu thuần của "Ngày về": bạn cùng lớp, lời thoại, tiết sinh hoạt, văn nghệ, các nhóm hội khác. Không có mã xử lý ở đây để bổ sung nội dung cho dễ.
// Mọi tên người đều hư cấu. Ký hiệu thay thế trong lời thoại (xem fill() ở reunion.js):
//   {me} tên người chơi · {em} "em <tên>" (cô gọi) · {x} ông|bà · {ac}/{Ac} anh|chị · {lop} tên lớp · {khoa} khoá
//   {quang}…{long} tên bạn đang giữ vai đó · {@quang}… "thằng|cái <tên>" · {vang} tên một bạn vắng mặt · {n} tên đang được gọi
// Câu là chuỗi, hoặc { t, alt }: alt dùng khi câu cần {vang} mà lớp không vắng ai.

const W = Math.PI / 2;

export const CLASS_DEFAULT = { me: '', cls: '12A12', year: '1998 – 2001' };
/** danh sách mẫu: 7 dòng đầu là các bạn có mặt (đúng thứ tự vai bên dưới), còn lại vắng — để phần điểm danh có người vắng */
export const SAMPLE_ROSTER = [
  'Quang, nam, lớp trưởng', 'Thuỷ, nữ, cây văn nghệ', 'Dũng, nam, chuyên đi muộn', 'Hương, nữ, bạn cùng bàn', 'Tùng, nam, béo', 'Ngân, nữ, thủ quỹ', 'Long, nam, cây hài',
  'Hải, nam', 'Yến, nữ', 'Cường, nam', 'Diệp, nữ', 'Khánh, nam',
].join('\n');

// ngoại hình theo vị trí vai (0..6), mỗi giới một bộ: bạn trong danh sách là nam hay nữ thì lấy bộ tương ứng. Chỉ F[1] mặc váy (váy ngồi ghế băng bị xoè)
const A = { age: 'mid', outfit: 'class' };
export const LOOKS = {
  m: [
    { ...A, gender: 'm', hair: 'side', hairColor: 0, glasses: 1, skin: 1, face: 2, height: 1.71, build: 1, stance: 'back' },
    { ...A, gender: 'm', hair: 'fringe', hairColor: 1, skin: 1, face: 5, height: 1.68, build: 0, outfit: 'classJ', stance: 'side' },
    { ...A, gender: 'm', hair: 'crew', hairColor: 0, skin: 2, face: 4, height: 1.74, build: 0, outfit: 'classJ', stance: 'side' },
    { ...A, gender: 'm', hair: 'side', hairColor: 3, glasses: 2, skin: 1, face: 1, height: 1.66, build: 1, bottom: 'khaki', stance: 'front' },
    { ...A, gender: 'm', hair: 'crew', hairColor: 0, skin: 2, face: 6, height: 1.69, build: 2, bottom: 'khaki', stance: 'side' },
    { ...A, gender: 'm', hair: 'fringe', hairColor: 0, glasses: 2, skin: 0, face: 3, height: 1.72, build: 1, stance: 'side' },
    { ...A, gender: 'm', hair: 'shaved', hairColor: 0, skin: 2, face: 0, height: 1.76, build: 1, outfit: 'classJ', stance: 'side' },
  ],
  f: [
    { ...A, gender: 'f', hair: 'bob', hairColor: 0, glasses: 1, skin: 0, face: 2, height: 1.58, build: 1, stance: 'front' },
    { ...A, gender: 'f', hair: 'long', hairColor: 1, skin: 0, face: 4, height: 1.6, build: 0, outfit: 'classS', stance: 'front' },
    { ...A, gender: 'f', hair: 'pony', hairColor: 0, skin: 1, face: 5, height: 1.62, build: 0, outfit: 'classJ', stance: 'side' },
    { ...A, gender: 'f', hair: 'bob_bangs', hairColor: 2, skin: 0, face: 1, height: 1.56, build: 0, outfit: 'classJ', stance: 'side' },
    { ...A, gender: 'f', hair: 'pixie', hairColor: 0, skin: 1, face: 6, height: 1.55, build: 2, stance: 'side' },
    { ...A, gender: 'f', hair: 'braid', hairColor: 0, glasses: 2, skin: 1, face: 3, height: 1.54, build: 1, stance: 'front' },
    { ...A, gender: 'f', hair: 'pixie', hairColor: 4, skin: 0, face: 0, height: 1.61, build: 1, outfit: 'classJ', stance: 'side' },
  ],
};

/**
 * Bảy vai bạn cùng lớp. id dùng trong ký hiệu thay thế; g = giới mặc định của vai (khi danh sách không ghi giới);
 * spot = chỗ đứng tụ tập phía trong cổng; seat = [cột, hàng] trong lớp (xem SEATS ở reunion_lesson.js);
 * greet = câu chào lần đầu; say = các câu sau; roll = đáp khi cô điểm danh.
 */
export const MATES = [
  { id: 'quang', g: 'm', role: 'lớp trưởng', spot: [40.4, 51.2, 2.9], seat: [1, 0],
    greet: '{me}! Đúng giờ thế, khác hẳn ngày xưa nhỉ. Tôi điểm danh từ sáng, giờ mới thấy mặt {x}.',
    say: ['Bao nhiêu năm rồi mà tôi vẫn thuộc sĩ số lớp mình. Thuộc hơn cả số điện thoại nhà tôi.',
      'Ngày xưa tôi ghi tên {x} vào sổ nói chuyện riêng mấy lần, đừng để bụng nhé. Tại {@long} xui đấy.',
      { t: '{vang} nhắn là bận không về được, dặn cả lớp chụp ảnh thì chừa một chỗ, về ghép sau.', alt: 'Hôm nay lớp mình về gần đủ, hiếm có đấy. Phải chụp cái ảnh cho ra hồn.' }],
    roll: 'Có ạ! Thưa cô, lớp có mặt gần đủ, mấy bạn vắng đều có lý do ạ.' },
  { id: 'thuy', g: 'f', role: 'cây văn nghệ', spot: [39.2, 49.3, 1.2], seat: [3, 0],
    greet: 'Ối giời ơi {me}! Trông vẫn thế, chỉ có cái bụng là khác thôi. Đùa đấy, lại đây xem nào!',
    say: ['Hội diễn năm lớp 11 lớp mình hát tốp ca, {@tung} quên lời đứng há mồm. Thế mà vẫn được giải khuyến khích.',
      'Con tôi giờ học lớp 10 rồi. Nó xem băng hội diễn cũ xong bảo: thế này mà cũng dám lên sân khấu á?',
      'Tí nữa ra sân khấu xem văn nghệ đi. Xem các em nó múa, lại nhớ cái hồi mình tập đến khản cả giọng.'],
    roll: 'Dạ có em!' },
  { id: 'dung', g: 'm', role: 'chuyên đi muộn', spot: [41.6, 47.6, -0.3], seat: [0, 1],
    greet: '{me} à! May quá, tưởng tôi lại là người đến cuối. Hôm nay tôi đến sớm hẳn… năm phút.',
    say: ['Ngày xưa sao đỏ thuộc mặt tôi hơn tôi thuộc bài. Cứ thấy bóng tôi ngoài cổng là rút sổ ra sẵn.',
      'Trống vào lớp đánh xong tôi mới tới cổng, tuần nào cũng làm lớp mình mất điểm thi đua. Giờ nghĩ lại vẫn thấy có lỗi.',
      'Giờ tôi đi làm chưa muộn buổi nào đâu nhé. Tại cơ quan không có trống.'],
    roll: 'Em thưa cô, em xin phép vào lớp… Em bị tắc đường ạ.' },
  { id: 'huong', g: 'f', role: 'bạn cùng bàn', spot: [40.3, 48.4, 0.4], seat: [3, 1],
    greet: '{me}! Bạn cùng bàn của tôi đây rồi. Vẫn nhớ cái vạch phấn chia đôi bàn chứ? Lấn sang là tôi đập thước kẻ đấy.',
    say: ['Quyển lưu bút {x} viết cho tôi, tôi vẫn giữ. Chữ xấu như gà bới mà đọc lại vẫn rơm rớm.',
      'Hồi ấy {x} toàn chép bài tôi môn Văn, tôi chép bài {x} môn Toán. Công bằng, không ai nợ ai.',
      'Bút máy của tôi ngày xưa hay tắc mực, vẩy một cái là áo trắng của {@quang} bàn trên thành áo hoa. Đến giờ vẫn chưa biết là tôi đâu, đừng mách.'],
    roll: 'Có em ạ. Thưa cô, bạn bên cạnh em lại quên mang vở.' },
  { id: 'tung', g: 'm', role: 'béo', spot: [42.1, 49.2, -1.3], seat: [2, 0],
    greet: 'A, {me}! Ăn sáng chưa? Chưa thì tí ra cổng làm gói xôi, tôi ngửi thấy mùi hành phi từ nãy rồi.',
    say: ['Quán xôi cổng trường ngày xưa cho tôi ghi sổ đến cuối tháng. Ra trường rồi tôi vẫn mơ thấy bị đòi nợ.',
      'Giờ ra chơi có mười lăm phút mà tôi kịp ăn bánh mì, uống trà đá, lại còn đá được nửa hiệp. Bây giờ leo ba tầng cầu thang đã thở.',
      'Bác sĩ bảo tôi kiêng đồ nếp. Nhưng về trường mà không ăn xôi thì về làm gì, {x} bảo có đúng không?'],
    roll: 'Có… có em ạ!' },
  { id: 'ngan', g: 'f', role: 'thủ quỹ', spot: [38.9, 51.6, 2.2], seat: [0, 0],
    greet: '{me} đây rồi! Nói trước nhé, quỹ lớp năm cuối {x} còn thiếu hai nghìn. Tôi vẫn ghi sổ đấy.',
    say: ['Ngày xưa thu quỹ khó hơn đòi nợ. Cứ thấy tôi cầm sổ đi xuống là cả dãy bàn cuối kéo nhau đi vệ sinh.',
      'Tôi vẫn giữ quyển sổ quỹ bìa xanh. Tiền liên hoan cuối năm còn thừa đúng năm nghìn rưỡi, chưa biết chia thế nào.',
      { t: '{vang} vừa chuyển khoản góp quỹ họp lớp, nhắn thêm: “người không về được nhưng tiền thì về”.', alt: 'Họp lớp năm nay tôi thu bằng chuyển khoản. Tiến bộ thật, hết đường khất.' }],
    roll: 'Có em. Thưa cô, cuối giờ em xin năm phút thu quỹ ạ.' },
  { id: 'long', g: 'm', role: 'cây hài', spot: [41.4, 50.6, -2.4], seat: [1, 1],
    greet: 'Ôi {me}! Tưởng ai, hoá ra đồng bọn trốn tiết năm xưa. Hôm nay đi cổng chính đàng hoàng thế?',
    say: ['Tiết năm thứ bảy là tôi buồn ngủ nhất. Có hôm cô gọi lên bảng, tôi đứng dậy thưa luôn: “Dạ, cho cháu xin thêm bát nữa ạ”.',
      'Băng cát-xét tôi thu bài hát tặng một người lớp bên, thu đè lên băng tiếng Anh của bố. Bao nhiêu năm rồi bố tôi vẫn chưa tha.',
      'Con tôi giờ mà trốn tiết là tôi biết ngay. Kinh nghiệm đầy mình, giấu sao được.'],
    roll: 'Có mặt! À quên… Có em ạ.' },
];
/** câu người chơi buột miệng khi gặp một bạn có ghi chú/biệt danh trong danh sách ({n} tên, {note} ghi chú) */
export const NOTE_GREET = 'A, {n} — {note} của lớp mình đây rồi!';
export const GATE = {
  allMet: 'Đủ mặt cả rồi! Cả lớp đi cùng nhau nào — về lớp cũ, ra sân xem văn nghệ, chụp ảnh kỷ yếu, thứ tự tuỳ {x}.',
  hintFirst: 'Lớp mình đang đứng phía trong cổng. Lại gần từng bạn, bấm E để chào.',
};

export const TEACHER = 'Cô Thanh – chủ nhiệm', TEACHER_ID = 'chunhiem';      // tên hiện trong khung thoại; nhân vật lấy theo id trong CAST của people.js
export const LESSON = {
  doorLabel: 'Vào lớp cũ – bắt đầu tiết sinh hoạt', doorWait: 'Lớp cũ của mình (gặp đủ các bạn ở cổng rồi hãy vào)',
  intro: [['co', 'Các em vào lớp cả rồi đấy à. Ngồi đúng chỗ cũ cả nhé — cô vẫn nhớ sơ đồ lớp.'],
    ['co', 'Hôm nay không học bài mới. Cô điểm danh, rồi kiểm tra miệng một tí cho đỡ nhớ nghề.']],
  rollStart: ['co', 'Lớp {lop}, khoá {khoa}. Cô điểm danh.'],
  late: [['long', 'Thưa cô, {dung} đang trên đường ạ. Từ hồi lớp 12.'], ['dung', null], ['co', 'Bao nhiêu năm rồi vẫn tắc đúng một chỗ đấy. Về chỗ đi em.']],
  afterRoll: { tung: ['co', 'Em nuốt hết đi rồi hãy thưa.'] },
  // các kiểu xử lý bạn vắng (xoay vòng): mỗi kiểu là vài câu [ai nói, câu]
  absent: [
    [['quang', 'Thưa cô, bạn {n} vắng có phép ạ. Bạn ấy gửi lời chào cô.']],
    [['long', '{n} đang đi họp cô ạ. Họp phụ huynh cho con.']],
    [['co', '{n}… vắng. Vẫn như xưa, cứ hôm nào vui là vắng.']],
    [['ngan', '{n} xin phép cô, tí bạn ấy gọi video ạ. Quỹ thì bạn ấy nộp rồi.']],
    [['tung', 'Dạ có ạ!'], ['co', 'Em thưa hộ bạn từ năm lớp 10, đến giờ vẫn chưa bỏ được à?']],
  ],
  rollSkim: ['co', 'Danh sách dài quá, những bạn còn lại cô đánh dấu sau. Ai vắng thì các em nhắn là cô hỏi thăm.'],
  rollMe: { ask: 'Và người cuối cùng… {em}.', opts: [
    { t: 'Có em ạ!', re: [['co', 'Ừ. To, rõ ràng. Hồi xưa mà được thế thì tốt.']] },
    { t: 'Dạ… có ạ. (lí nhí)', re: [['co', 'Vẫn lí nhí như ngày nào. Ngẩng mặt lên cô xem lớn thế nào rồi.']] },
    { t: 'Có mặt! Em đi học đầy đủ, chưa nghỉ buổi nào suốt… hôm nay ạ.', laugh: true, re: [['co', 'Suốt hôm nay. Được, cô ghi nhận.']] },
  ] },
  quizStart: ['co', 'Bây giờ kiểm tra miệng. Cô gọi ai người ấy trả lời, không nhắc bài. {em}, mời em.'],
  // ok = vị trí đáp án đúng; right/wrong = phản ứng; pick[i] = phản ứng riêng khi chọn đáp án i (thay cho wrong)
  quiz: [
    { q: 'Khởi động nhé. Mười lăm nhân mười lăm bằng bao nhiêu? Không bấm máy.', opts: ['215', '225', '255'], ok: 1,
      right: [['co', 'Đúng. Vẫn còn dùng được.'], ['tung', 'Tính tiền xôi thì bạn ấy nhanh lắm cô ạ.']],
      wrong: [['co', '225 em ạ. Thôi, lỗi tại cái điện thoại.'], ['long', 'Thưa cô, bạn ấy quen tính có máy rồi ạ.']] },
    { q: '“Chí Phèo” là truyện của nhà văn nào?', opts: ['Nam Cao', 'Ngô Tất Tố', 'Vũ Trọng Phụng'], ok: 0,
      right: [['co', 'Nam Cao. Câu “Ai cho tao lương thiện?” thì chắc ai cũng còn nhớ.'], ['huong', 'Ngày xưa bạn ấy chép văn của em đấy cô.']],
      wrong: [['co', 'Nam Cao chứ. Bài này ngày xưa cô giảng hai tiết liền đấy.'], ['thuy', 'Cô ơi, hồi đó bạn ấy toàn ngồi vẽ vào sách Văn.']] },
    { q: 'Ngô Quyền đánh tan quân Nam Hán trên sông Bạch Đằng năm nào?', opts: ['1288', '981', '938'], ok: 2,
      right: [['co', 'Năm 938. Người Hải Phòng mà quên Bạch Đằng thì gay.']],
      wrong: [['co', 'Năm 938. Còn 1288 là trận của Trần Hưng Đạo, cũng trên sông ấy.'], ['quang', 'Thưa cô, bạn ấy nhớ nhầm sang đề khác ạ.']] },
    { q: 'Con sông nào chảy qua thành phố mình, ngày xưa muốn sang bên kia phải đi phà Bính?', opts: ['Sông Hương', 'Sông Cấm', 'Sông Hàn'], ok: 1,
      right: [['co', 'Sông Cấm. Ngày xưa chờ phà, bây giờ thì cầu to rồi.'], ['dung', 'Em đi muộn mấy lần cũng tại chờ phà đấy cô.']],
      wrong: [['co', 'Sông Cấm! Em đi xa lâu quá rồi đấy.']] },
    { q: 'Định luật Ôm cho đoạn mạch: cường độ dòng điện I bằng gì?', opts: ['U nhân R', 'U chia R', 'R chia U'], ok: 1,
      right: [['co', 'I bằng U chia R. Tốt, hoá ra chưa trả hết cho thầy dạy Lý.']],
      wrong: [['co', 'U chia R em ạ. Thôi, điện nhà hỏng thì gọi thợ vậy.'], ['long', 'Bạn ấy chỉ nhớ định luật “ôm” cặp chạy thôi cô ạ.']] },
    { q: 'Mười lăm phút đầu giờ, trước khi trống vào tiết một, cả lớp làm gì?', opts: ['Truy bài', 'Tập thể dục giữa giờ', 'Ăn nốt gói xôi'], ok: 0,
      right: [['co', 'Truy bài. Mà dãy cuối thì cô biết thừa là truy cái gì.']],
      wrong: [['co', 'Truy bài em ạ. Thể dục là giữa giờ cơ.']],
      pick: { 2: [['tung', 'Đấy, có phải mình em đâu cô!'], ['co', 'Đáp án là truy bài. Nhưng em nói thật, cô cho qua.']] } },
    { q: 'Đội sao đỏ đi các lớp đầu giờ để chấm cái gì?', opts: ['Chấm bài kiểm tra', 'Chấm nề nếp: đi muộn, đồng phục, vệ sinh lớp', 'Chấm xem lớp nào vui nhất'], ok: 1,
      right: [['co', 'Đúng rồi. Và lớp mình tuần nào cũng bị trừ điểm vì ai thì các em tự biết.'], ['dung', 'Em xin lỗi cả lớp. Muộn bao nhiêu năm, nhưng em xin lỗi thật.']],
      wrong: [['co', 'Chấm nề nếp em ạ. Lớp mình tuần nào cũng mất điểm thi đua vì khoản đi muộn.']] },
    { q: 'Câu này ngoài sách giáo khoa. Băng cát-xét bị rối, muốn quay lại cho gọn thì dùng cái gì?', opts: ['Cái bút chì', 'Cái thước kẻ', 'Cục tẩy'], ok: 0,
      right: [['co', 'Bút chì. Cô cũng quay mòn mấy cái đấy.'], ['thuy', 'Băng nhạc của em toàn bị các bạn mượn rồi làm rối cô ạ.']],
      wrong: [['co', 'Bút chì em ơi. Chắc em chỉ quen nghe đĩa.']] },
    { q: 'Trường mình ở số nhà bao nhiêu, đường Đà Nẵng?', opts: ['285', '258', '528'], ok: 1,
      right: [['co', '258 Đà Nẵng. Đi đâu thì đi, nhớ đường về là được.']],
      wrong: [['co', '258. Thế mà sáng nay vẫn tìm được đường về, giỏi.']] },
    { q: 'Câu cuối. Trường mình thành lập năm nào?', opts: ['1945', '1960', '1975'], ok: 1,
      right: [['co', 'Năm 1960. Lúc các em vào lớp 10, trường đã có mấy chục lứa học trò đi qua rồi.']],
      wrong: [['co', 'Năm 1960. Không sao, miễn là nhớ đường về.']] },
  ],
  noteAfter: 5,      // xen chuyện chuyền giấy sau câu hỏi thứ mấy
  note: {
    pre: [['co', 'Khoan. {long}, em vừa chuyền cái gì cho {huong} đấy?'], ['long', 'Dạ không… không có gì ạ.'], ['co', 'Một mảnh giấy. Cô nhìn thấy rồi. Của ai thì đứng lên.']],
    ask: 'Cả lớp im phăng phắc. Mảnh giấy đang nằm ngay dưới ngăn bàn mình…',
    opts: [
      { t: 'Đứng lên nhận thay: “Thưa cô, của em ạ.”', tag: 'nhận tội thay bạn', re: [['co', 'Của em? Thế em đọc to lên cho cả lớp nghe.'], ['me', '(mở giấy) “Tí tan học ra quán xôi, {tung} khao.”'], ['tung', 'Ơ, tôi khao bao giờ?!'], ['co', 'Nhận tội thay bạn, vẫn nghĩa hiệp như xưa. Cô phạt cả ba đứa: tí nữa mời cô đi cùng.']] },
      { t: 'Ngồi im, nhìn ra cửa sổ.', tag: 'làm ngơ', re: [['long', 'Thưa cô… của em ạ. Em rủ các bạn tí ra quán xôi.'], ['co', 'Bao nhiêu năm rồi {long} vẫn chuyền giấy. Bây giờ có điện thoại rồi cơ mà em?'], ['long', 'Dạ, điện thoại em hết pin ạ.']] },
      { t: 'Tố luôn: “Thưa cô, của bạn {long} ạ!”', tag: 'tố bạn', re: [['long', 'Ơ kìa! Đồng bọn mà thế à?'], ['huong', 'Ngày xưa bạn ấy cũng tố em y như thế đấy cô.'], ['co', 'Thôi, cô không phạt ai. Nhưng {em} tí nữa phải khao cả lớp vì tội tố bạn.']] },
    ],
  },
  book: {
    title: 'SỔ ĐẦU BÀI', sub: 'Tiết sinh hoạt · lớp {lop} · khoá {khoa}',
    marks: [[9, 'Lớp nhớ bài tốt, mất trật tự vừa phải.', 'Tốt'], [6, 'Lớp có nhớ bài, nói chuyện riêng nhiều.', 'Khá'], [0, 'Lớp quên gần hết kiến thức, nhưng nhớ đủ mặt nhau.', 'Khá (cô châm chước)']],
  },
  closing: [['co', 'Thôi, cô không hỏi nữa. Cô ghi sổ đầu bài nhé.']],
  closing2: [
    ['co', 'Cô đi dạy mấy chục năm, lớp nào ra trường cô cũng dặn đúng một câu: sống cho tử tế, và nhớ đường về.'],
    ['co', 'Điểm cao điểm thấp ngày xưa, giờ chẳng ai hỏi lại nữa. Nhưng hôm nay các em ngồi đủ ở đây, với cô thế là điểm mười.'],
    ['co', 'Trống rồi đấy. Cả lớp nghỉ. Lần sau về, nhớ gọi cả những bạn hôm nay vắng.'],
    ['quang', 'Cả lớp… đứng! Chúng em chào cô ạ!'],
  ],
  done: 'Hết tiết. Trống trường vừa điểm — cả lớp ra hành lang rồi.',
};

export const SHOW = {
  comments: [['thuy', 'Ngày xưa lớp mình múa còn đều hơn!'], ['tung', 'Vỗ tay to lên, mỏi tay tí tôi khao trà đá!'], ['huong', 'Xem các em mà nhớ hồi mười bảy tuổi quá.']],
  done: 'Xem xong tiết mục văn nghệ chào mừng 20/11.',
  // người biểu diễn: z dọc sân khấu (sân khấu quay mặt về phía tây, -x)
  performers: [
    { gender: 'f', outfit: 'aodai', age: 'teen', hair: 'long', skin: 0, face: 1, height: 1.58, build: 0 },
    { gender: 'f', outfit: 'aodai', age: 'teen', hair: 'braid', skin: 0, face: 3, height: 1.6, build: 0 },
    { gender: 'f', outfit: 'aodai', age: 'teen', hair: 'pony', skin: 1, face: 5, height: 1.56, build: 0 },
    { gender: 'm', outfit: 'white', age: 'teen', hair: 'fringe', skin: 1, face: 2, height: 1.72, build: 0 },
  ],
  // các "động tác" lặp vòng: f = đội hình (độ lệch [dx, dz] so với tâm cho từng người), p = dáng từng người (null = đứng tự nhiên), s = số giây
  figures: [
    { s: 5, f: [[0, -2.1], [0, -0.7], [0, 0.7], [0, 2.1]], p: ['wave', 'wave', 'wave', 'wave'] },
    { s: 5, f: [[0.5, -1.8], [-0.4, -0.6], [-0.4, 0.6], [0.5, 1.8]], p: ['grace', 'cheer', 'cheer', 'hips'] },
    { s: 5, f: [[-0.4, -1.5], [0.5, -0.5], [0.5, 0.5], [-0.4, 1.5]], p: ['heart', 'grace', 'grace', 'heart'] },
    { s: 5, f: [[0, -2.1], [0, -0.7], [0, 0.7], [0, 2.1]], p: ['cheer', 'bigheart', 'bigheart', 'cheer'] },
    { s: 4, f: [[0.2, -1.2], [-0.5, -0.4], [-0.5, 0.4], [0.2, 1.2]], p: [null, 'wave', 'wave', null] },
  ],
  audience: [
    { x: 35.2, z: -8.4, look: { gender: 'm', outfit: 'teacher', age: 'old', hair: 'side', hairColor: 3, skin: 1, face: 4, height: 1.67, build: 1, stance: 'back' } },
    { x: 36.3, z: -6.9, look: { gender: 'f', outfit: 'aodaiL', age: 'adult', hair: 'bob', skin: 0, face: 2, height: 1.57, build: 0, stance: 'front' } },
    { x: 34.6, z: -3.1, look: { gender: 'f', outfit: 'jacket', age: 'teen', hair: 'pony', skin: 0, face: 6, height: 1.56, build: 0 } },
    { x: 35.5, z: -2.2, look: { gender: 'm', outfit: 'jacket', age: 'teen', hair: 'crew', skin: 2, face: 1, height: 1.7, build: 0 } },
    { x: 36.4, z: -9.8, look: { gender: 'm', top: 'polo', topColor: '#6b6f78', bottom: 'khaki', shoes: 'dress', age: 'mid', hair: 'crew', skin: 2, face: 3, height: 1.7, build: 2 } },
    { x: 34.3, z: -7.2, look: { gender: 'f', outfit: 'white', age: 'teen', hair: 'bob_bangs', skin: 1, face: 5, height: 1.55, build: 0 } },
  ],
};

export const PHOTO = {
  label: 'Chụp ảnh kỷ yếu cả lớp', call: ['quang', 'Hàng trước ngồi xuống! Hàng sau sát vào! Cười lên nào!'],
  tip: 'Cả lớp xếp hàng rồi. Bay máy bằng WASD/chuột, phím số đổi dáng, Enter lưu ảnh, P xong.', done: 'Có ảnh kỷ yếu rồi!',
  caption: 'Lớp {lop} · khoá {khoa} · ngày về',
};

export const BYE = {
  label: 'Chia tay cả lớp', hint: 'Xong cả rồi. Ra phía trong cổng trường để chia tay lớp mình.',
  lines: [
    ['quang', 'Thôi, lớp trưởng xin phép cho lớp giải tán. Sang năm vẫn ngày này, vẫn cổng này. Ai đến muộn thì… vẫn chờ.'],
    ['tung', 'Về cẩn thận nhé. À, gói xôi tôi cầm hộ {x} rồi. Ăn hộ luôn rồi.'],
    ['long', { t: '{vang} vừa gọi video, hứa sang năm nhất định về. Tôi ghi âm lại làm bằng chứng rồi.', alt: null }],
    ['ngan', 'Quỹ lớp vẫn còn thừa, sang năm họp tiếp. Không ai được vắng đâu đấy.'],
    ['huong', 'Về nhé {me}. Lần sau nhớ mang quyển lưu bút, tôi viết nốt trang còn dở.'],
  ],
  title: 'Hẹn ngày trở lại',
  text: 'Sân trường vẫn thế, hàng cây vẫn thế. Chỉ có lũ học trò ngày ấy là đã khác — mà vẫn nhận ra nhau từ rất xa.',
  sign: 'Lớp {lop} · khoá {khoa} · THPT Thái Phiên, 258 Đà Nẵng, Hải Phòng', again: 'Ở lại dạo chơi thêm',
};

export const STAGES = [
  { id: 'gate', nm: 'Gặp lại lớp mình ở cổng trường' },
  { id: 'lesson', nm: 'Về lớp cũ' },
  { id: 'show', nm: 'Ra sân dự văn nghệ chào mừng' },
  { id: 'photo', nm: 'Chụp ảnh kỷ yếu cả lớp' },
  { id: 'bye', nm: 'Chia tay' },
];

const polo = (gender, color, o) => ({ gender, top: 'polo', topColor: color, bottom: gender === 'f' ? 'jeans' : 'khaki', shoes: 'sneakers', age: 'mid', ...o });
/**
 * Các nhóm hội khác đang chụp ảnh. at = tâm hàng người, f = hướng cả hàng quay mặt (rad), cam = chỗ người cầm máy đứng,
 * y = cao độ nền ước lượng (sẽ dò lại), members = ngoại hình (người cuối là người cầm máy), poses = hai lượt dáng.
 */
export const GROUPS = [
  { id: 'k95', nm: 'Khoá 1995 – 1998', at: [34.8, 56.6], f: 0, cam: [34.8, 59.9], y: 0.14,
    hello: ['Khoá 95–98 đây em ơi! Khoá em là khoá nào?', 'Bọn chị ra trường lâu đến mức con sắp thi vào trường rồi đấy.'],
    ask: 'Em ơi, chụp giúp bọn chị một kiểu đủ cả hội được không?', thanks: 'Cảm ơn em nhé! Tay nghề được đấy, không ai nhắm mắt.',
    calls: ['Sát vào nào!', 'Đổi kiểu đi!'], chat: ['Đẹp đấy!', 'Gửi vào nhóm nhé!'],
    members: [
      polo('f', '#7a2d3a', { hair: 'bob', skin: 0, face: 3, height: 1.56, build: 1, glasses: 2 }), polo('m', '#7a2d3a', { hair: 'side', hairColor: 3, skin: 1, face: 5, height: 1.7, build: 2 }),
      polo('f', '#7a2d3a', { hair: 'pony', skin: 1, face: 6, height: 1.58, build: 1, bottom: 'trousers' }), polo('m', '#7a2d3a', { hair: 'crew', skin: 2, face: 1, height: 1.68, build: 1, glasses: 1 }),
    ],
    poses: [['peace', 'thumb', 'heart'], ['cheer', 'cross', 'peace2']] },
  { id: 'k02', nm: 'Khoá 2002 – 2005', at: [-9.7, 37.0], f: W, cam: [-6.2, 37.0], y: 0,
    hello: ['Khoá 2002–2005 chào {ac} ạ! {Ac} khoá nào đấy ạ?', 'Bọn em chụp mãi chưa được tấm nào đủ người mở mắt.'],
    ask: '{Ac} ơi, chụp hộ bọn em một tấm đủ cả nhóm với ạ?', thanks: 'Bọn em cảm ơn {ac} ạ! Tấm này chắc chắn lên ảnh bìa.',
    calls: ['Nhìn vào đây nào!', 'Thêm kiểu nữa!'], chat: ['Xem nào xem nào!', 'Lại nhắm mắt rồi!'],
    members: [
      { gender: 'f', top: 'aodai', topColor: '#3fa7a0', bottom: 'aodai', shoes: 'heels', age: 'adult', hair: 'long', skin: 0, face: 2, height: 1.59, build: 0 },
      polo('m', '#2f6b4f', { age: 'adult', hair: 'fringe', skin: 1, face: 4, height: 1.73, build: 1 }),
      { gender: 'f', top: 'aodai', topColor: '#b79ad6', bottom: 'aodai', shoes: 'heels', age: 'adult', hair: 'braid', skin: 1, face: 0, height: 1.57, build: 0 },
      polo('m', '#2f6b4f', { age: 'adult', hair: 'shaved', skin: 2, face: 6, height: 1.75, build: 1, bottom: 'jeans' }),
    ],
    poses: [['grace', 'thumb', 'heart'], ['peace', 'hips', 'grace']] },
];
