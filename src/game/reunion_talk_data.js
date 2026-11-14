// Chuyện trò theo chủ đề với bảy bạn cùng lớp (dữ liệu cho campus_talk.js). Mọi tên, mọi chuyện đều hư cấu, tự viết.
// Một chủ đề: { id, title, kw (từ khoá không dấu để khớp khi người chơi gõ tự do), script (lần đầu), again (những lần sau) }.
// Nút kịch bản: n(câu) nhân vật nói · p(câu) người chơi nói · c(câu hỏi, [lựa chọn, [các nút tiếp], cờ?]…) người chơi chọn, có thể đặt cờ để nhớ.
// Câu có thể là chuỗi hoặc { t: mặc định, <khoá ngữ cảnh>: câu thay thế } — khoá: morning noon evening night rain wearClass wearAodai
//   first again often doneLesson doneShow donePhoto doneAll memAll full (lớp không vắng ai) f_<cờ>. Ký hiệu thay thế như reunion_data.js.
export const n = (t) => ['n', t], p = (t) => ['p', t], c = (q, ...opts) => ['c', q, opts];

export const MATE_HELLO = [
  { t: 'Gì đấy {me}? Đứng lại đây nói chuyện tí.', first: '{me}! Nói chuyện tí nào, bao năm mới gặp.', rain: 'Mưa thế này đứng sát vào đây mà nói chuyện, {me}.', night: 'Tối rồi mà chưa ai chịu về nhỉ. Nói chuyện tiếp đi {me}.', often: 'Lại {x} à? Hôm nay {x} hỏi tôi nhiều hơn cả ba năm cấp ba cộng lại.' },
];
export const MATE_BACK = ['Còn chuyện gì nữa không?', 'Hỏi tiếp đi, hôm nay tôi rảnh cả ngày.', 'Thế còn muốn nghe chuyện gì nữa?'];
export const MATE_BYE = [{ t: 'Ừ, đi tiếp thôi. Tôi theo sau đây.', doneAll: 'Ừ. Hôm nay thế là trọn vẹn rồi đấy.' }];

export const MATE_TOPICS = {
  quang: [
    { id: 'so', title: 'Cái sổ ghi tên ngày xưa', kw: ['sổ ghi tên', 'ghi tên', 'nói chuyện riêng'], script: [
      n('Nói thật nhé: quyển sổ ghi tên nói chuyện riêng ngày xưa, tên của {x} là tôi toàn ghi bằng bút chì.'), p('Bút chì á? Để làm gì?'),
      n('Để cuối tuần tẩy đi. Cô mà xem thì chỉ thấy tên {@long} viết bằng mực, đậm lắm.'),
      c('Mà {x} có biết hồi đấy ai xin tôi tẩy tên cho {x} không?',
        ['Chắc là {huong}', [n('Chuẩn. Đổi lại một gói ô mai. Tôi là lớp trưởng liêm khiết, nhưng ô mai thì là chuyện khác.')], 'biet_omai'],
        ['Tôi tự xin chứ ai', [n('Xin gì mà xin, {x} toàn đứng xa xa nhìn. {huong} mang ô mai tới đấy, giờ tôi mới khai.')]]),
      n('Thôi, bao nhiêu năm rồi, hết thời hiệu.')],
      again: [n({ t: 'Chuyện cái sổ tôi khai hết rồi. Quyển sổ thì vẫn giữ, hôm nào họp lớp mang ra đấu giá.', f_biet_omai: 'Vẫn chuyện gói ô mai à? {x} đoán trúng một lần rồi cứ nhắc mãi.' })] },
    { id: 'viec', title: 'Bây giờ làm gì rồi?', kw: ['công việc', 'nghề', 'gia đình', 'vợ', 'chồng'], script: [
      n('Tôi giờ làm quản lý kho ở cảng. Vẫn là điểm danh thôi, chỉ khác là điểm công-ten-nơ.'), p('Nghe hợp đấy.'),
      n('Ừ. Công-ten-nơ nó không cãi, không trốn tiết. Nhàn hơn làm lớp trưởng lớp mình nhiều.'),
      c('Còn {x}, dạo này thế nào?',
        ['Vẫn chạy đều, cơm áo thôi', [n('Chạy đều là tốt rồi. Tuổi mình bây giờ, không ốm, không nợ là thành đạt.')]],
        ['Đang tính đổi việc', [n('Đổi thì đổi sớm đi. Cần người viết nhận xét thì bảo tôi, kinh nghiệm phê sổ ba năm liền.')], 'doi_viec']),
      n('Nhà tôi hai đứa, đứa lớn năm nay cũng làm lớp trưởng. Tôi bảo nó: con ơi, nghề gia truyền nhưng bạc lắm.')],
      again: [n({ t: 'Vẫn cảng, vẫn công-ten-nơ. Có gì mới tôi báo cáo sau.', f_doi_viec: 'Thế vụ đổi việc của {x} tới đâu rồi? Lần sau gặp tôi hỏi tiếp đấy, tôi ghi sổ rồi.' })] },
    { id: 'vang', title: 'Mấy đứa hôm nay không về', kw: ['vắng', 'không về', 'ai chưa về'], script: [
      n({ t: '{vang} hôm nay không về được. Nhắn đúng hai chữ: “Giữ chỗ.”', full: 'Hôm nay lớp mình về đủ cả. Tôi điểm danh ba lần rồi vẫn chưa tin.' }), p('Thế còn gì nữa không?'),
      n({ t: '{vang} thì bận con thi, hứa sang năm bù. Tôi ghi vào sổ rồi, sang năm không bù tôi đọc tên trước lớp.', full: 'Chỉ thiếu mỗi tiếng trống báo vào tiết nữa thôi là đủ bộ.' }),
      c('Tôi định tối nay gọi video cho mấy đứa ở xa, {x} thấy sao?',
        ['Gọi luôn, quanh lửa trại ấy', [n('Được. Cả lớp chào một câu cho chúng nó thèm.')]],
        ['Hôm nay cứ chơi đã', [n('Cũng phải. Hôm nay ai có mặt người ấy hưởng.')]])],
      again: [n('Mấy đứa ở xa tôi nhắn hết rồi. Đứa nào không trả lời, sang năm ngồi bàn đầu.')] },
    { id: 'bimat', title: 'Lớp trưởng có bí mật gì không?', kw: ['bí mật', 'trốn tiết', 'chuyện vui'], script: [
      n('Kể {x} nghe một chuyện, đừng nói với ai. Hồi lớp 11 tôi cũng trốn tiết một lần.'), p('Lớp trưởng mà trốn tiết?'),
      n('Một lần duy nhất. Ra quán điện tử, vừa ngồi xuống thì thấy… thầy giám thị đang chơi máy bên cạnh.'),
      c('Đoán xem sau đấy thế nào?',
        ['Bị ghi sổ?', [n('Không. Thầy nhìn tôi, tôi nhìn thầy. Hai thầy trò lặng lẽ đứng dậy, mỗi người về một hướng. Không ai nhắc lại bao giờ.')]],
        ['Thầy rủ chơi chung?', [n('Giá mà thế. Thầy nhìn tôi, tôi nhìn thầy, rồi hai thầy trò lặng lẽ đi về. Từ đấy thầy chưa phạt tôi lần nào.')]])],
      again: [n('Chuyện quán điện tử á? Suỵt. Nói bé thôi.')] },
  ],
  thuy: [
    { id: 'hoidien', title: 'Hội diễn năm ấy', kw: ['hội diễn', 'văn nghệ', 'hát', 'múa'], script: [
      n('Hội diễn năm lớp 11, lớp mình hát tốp ca, {x} đứng hàng sau cùng, còn nhớ không?'), p('Nhớ chứ. Tôi có hát đâu, chỉ mấp máy mồm.'),
      n('Tôi biết thừa! Đứng trên nhìn xuống là thấy hết. {x} với {@tung} mấp máy lệch cả nhau.'),
      c('Nhưng mà tôi vẫn cảm ơn {x} một chuyện, nhớ chuyện gì không?',
        ['Vụ kéo phông màn?', [n('Đúng rồi. Phông sắp đổ, {x} đứng giữ suốt cả bài. Khán giả tưởng là dàn dựng.')], 'giu_phong'],
        ['Chịu, chả nhớ', [n('Phông sắp đổ, {x} đứng giữ suốt cả bài đấy. Người hùng thầm lặng, đến giờ vẫn thầm lặng.')]]),
      n('Giải khuyến khích năm ấy, một nửa là của cái phông.')],
      again: [n({ t: 'Tí ra sân khấu xem các em diễn, tôi chỉ cho chỗ ngày xưa {x} đứng giữ phông.', doneShow: 'Xem văn nghệ xong rồi đấy, thấy các em múa đều hơn lớp mình ngày xưa không? Đừng trả lời, tôi biết rồi.' })] },
    { id: 'viec', title: 'Giờ còn hát hò gì không?', kw: ['công việc', 'gia đình', 'còn hát'], script: [
      n('Giờ tôi dạy nhạc cho trẻ con ở nhà văn hoá. Hát thì ngày nào cũng hát, toàn bài về con vật.'), p('Từ ca sĩ của lớp thành người đi dạy à?'),
      n('Ca sĩ gì. Nhưng mà bọn trẻ nó vỗ tay thật lòng lắm, không như lớp mình ngày xưa vỗ cho xong để về.'),
      c('{x} thì sao, có còn hát không?',
        ['Chỉ hát trong nhà tắm', [n('Thế là vẫn còn nghề. Lần sau họp lớp tôi xếp {x} một tiết mục, khỏi trốn.')], 'hat_nha_tam'],
        ['Thôi, tôi nghe là chính', [n('Người nghe cũng quý chứ. Không có người nghe thì tôi hát cho ai.')]])],
      again: [n({ t: 'Lớp nhạc của tôi sắp diễn cuối năm, toàn trẻ lên năm lên sáu. Rảnh thì đến vỗ tay hộ.', f_hat_nha_tam: 'Tiết mục “hát trong nhà tắm” của {x} tôi ghi vào chương trình họp lớp sang năm rồi đấy.' })] },
    { id: 'vang', title: 'Hỏi thăm mấy bạn vắng', kw: ['vắng', 'không về'], script: [
      n({ t: 'Tôi nhớ nhất là {vang}. Ngày xưa hai đứa tôi song ca, hôm nay thiếu một bè.', full: 'Hôm nay đủ cả, tôi đếm đủ các bè rồi. Hiếm lắm đấy.' }),
      p({ t: 'Sao bạn ấy không về?', full: 'Đủ cả thì tối nay phải hát một bài chứ?' }),
      n({ t: 'Ở xa, vé tàu xe dịp này khó. Nhưng nhắn tôi quay lại hết, tối gửi cho xem.', full: 'Hát chứ. Quanh lửa trại, ai không thuộc lời thì vỗ tay, như ngày xưa.' }),
      c('Tôi quay một đoạn gửi vào nhóm lớp nhé, {x} nói một câu đi.',
        ['“Sang năm nhớ về đấy!”', [n('Ngắn gọn, đúng trọng tâm. Tôi gửi luôn.')]],
        ['“Về mà trả nợ trà đá!”', [n('Ha ha, câu này đảm bảo chúng nó trả lời ngay.')]])],
      again: [n('Đoạn quay tôi gửi vào nhóm rồi. Chưa ai trả lời, chắc đang giả vờ bận.')] },
    { id: 'bimat', title: 'Chuyện bức thư trong hộc bàn', kw: ['bức thư', 'bí mật', 'hộc bàn'], script: [
      n('Hồi lớp 12 hộc bàn tôi có một bức thư không ký tên. Chữ nắn nót lắm.'), p('Thế có biết của ai không?'),
      n('Bao năm tôi đoán mãi không ra. Chữ đẹp thế thì loại được {@dung} với {@long} rồi.'),
      c('{x} nói thật đi, có biết ai viết không?',
        ['Biết, nhưng tôi đã hứa giữ kín', [n('Trời ơi, giữ kín {nam} rồi thì giữ tiếp đi vậy. Cứ để thế cho đẹp.')], 'giu_kin'],
        ['Không phải tôi đâu nhé!', [n('Tôi có bảo {x} đâu mà giật mình thế. Thôi, cứ để là một bí mật cho đẹp.')]])],
      again: [n({ t: 'Bức thư ấy tôi vẫn kẹp trong quyển lưu bút. Không biết của ai cũng được.', f_giu_kin: '{x} vẫn giữ kín chuyện bức thư đấy chứ? Giữ tiếp nhé, tôi không muốn biết nữa đâu.' })] },
  ],
  dung: [
    { id: 'dimuon', title: 'Kỷ lục đi muộn', kw: ['đi muộn', 'sao đỏ'], script: [
      n('Kỷ lục của tôi là đi muộn mười bảy buổi trong một học kỳ. Sao đỏ phải mở riêng một trang cho tôi.'), p('Sáng nào {dung} cũng làm gì mà muộn thế?'),
      n('Chở em đi học trước, rồi xe tuột xích, rồi ăn sáng. Ba việc ấy cộng lại là vừa hết trống.'),
      c('Có lần {x} đứng cổng chờ tôi đấy, nhớ không?',
        ['Nhớ, hôm kiểm tra Toán', [n('Đúng. {x} sợ tôi bỏ kiểm tra nên đứng chờ, thành ra cả hai cùng bị ghi tên. Tôi áy náy mãi.')], 'cho_cong'],
        ['Tôi chờ {dung} bao giờ?', [n('Hôm kiểm tra Toán ấy. {x} đứng chờ, thành ra cả hai bị ghi tên. {x} quên chứ tôi không quên đâu.')]]),
      n('Món nợ ấy hôm nay tôi trả bằng cốc trà đá, được không?')],
      again: [n({ t: 'Hôm nay tôi đến trước giờ hẹn năm phút, {x} ghi nhận giúp.', f_cho_cong: 'Vụ {x} đứng cổng chờ tôi, tôi kể cho con tôi nghe suốt. Nó bảo: bạn bố tốt thế mà bố vẫn đi muộn.' })] },
    { id: 'viec', title: 'Giờ đi làm có muộn không?', kw: ['công việc', 'gia đình'], script: [
      n('Giờ tôi lái xe khách đường dài. Nghề này mà muộn là khách người ta mắng cho.'), p('Thế là hết đi muộn rồi à?'),
      n('Hết hẳn. Xe tôi chạy đúng giờ nhất bến. Thầy cô mà biết chắc không tin.'),
      c('{x} đã đi xe tôi bao giờ chưa?',
        ['Chưa, hôm nào phải thử', [n('Lên xe cứ bảo là bạn học của lái xe, tôi cho ngồi ghế đầu, nghe nhạc theo yêu cầu.')]],
        ['Đi rồi mà không biết là xe {dung}', [n('Thế thì chắc hôm ấy tôi đeo khẩu trang. Lần sau gọi một tiếng, tôi dừng xe chào cho đàng hoàng.')]])],
      again: [n('Tuần sau tôi chạy chuyến sớm, bốn giờ sáng đã dậy. Ngày xưa bảy giờ còn chưa dậy nổi.')] },
    { id: 'vang', title: 'Mấy đứa không về', kw: ['vắng', 'không về'], script: [
      n({ t: '{vang} không về à? Thế mà tôi cứ tưởng năm nay tôi không phải là đứa cuối cùng.', full: 'Đủ cả à? Thế thì tôi vẫn là đứa đến cuối. Truyền thống phải giữ.' }),
      p('Biết đâu bạn ấy đến muộn?'), n({ t: 'Muộn thì phải xin phép tôi trước, tôi giữ bản quyền đi muộn của lớp này.', full: 'Thôi được, sang năm tôi đến đầu tiên cho cả lớp sợ.' }),
      c('Hay tí tôi lấy xe đi đón, {x} đi cùng không?',
        ['Đi chứ', [n('Nói thế thôi, chứ xa lắm. Để tôi nhắn một câu, sang năm tôi chở tận nơi.')]],
        ['Thôi, để người ta tự về', [n('Ừ. Về trường là phải tự chân mình bước qua cổng mới thấy đã.')]])],
      again: [n('Tôi nhắn rồi: sang năm đứa nào không về, tôi đánh xe tới tận nhà đón.')] },
    { id: 'bimat', title: 'Đường tắt vào trường', kw: ['đường tắt', 'trèo tường', 'bí mật'], script: [
      n('Bí mật nhé: ngày xưa tôi có một lối vào trường không qua cổng.'), p('Trèo tường chứ gì?'),
      n('Trèo thì tầm thường. Tôi đi nhờ qua sân sau nhà một bác hàng xóm của trường, bác cho, với điều kiện tưới hộ giàn mướp.'),
      c('Thế nên mỗi lần đi muộn là tôi…',
        ['…tưới cả giàn mướp?', [n('Chuẩn. Giàn mướp nhà bác ấy năm đó tốt nhất phố. Tôi đi muộn nhưng có ích cho xã hội.')]],
        ['…vẫn bị sao đỏ bắt?', [n('Vẫn bị, vì vào tới sân thì trống đánh từ lâu rồi. Nhưng giàn mướp nhà bác ấy năm đó tốt nhất phố.')]])],
      again: [n('Giàn mướp giờ không còn, bác ấy cũng chuyển đi rồi. Tôi vẫn nhớ đường.')] },
  ],
  huong: [
    { id: 'cungban', title: 'Hai đứa cùng bàn', kw: ['cùng bàn', 'vạch phấn', 'ngày xưa'], script: [
      n('Cái vạch phấn chia đôi bàn, {x} còn nhớ ai kẻ không?'), p('{huong} kẻ chứ ai, tuần nào cũng kẻ lại.'),
      n('Vì {x} cứ lấn sang. Khuỷu tay {x} ngày xưa chiếm hai phần ba cái bàn.'),
      c('Mà có một lần tôi tự xoá vạch đi đấy, {x} biết hôm nào không?',
        ['Hôm tôi quên mang sách?', [n('Ừ. Xoá đi để hai đứa xem chung một quyển. Hết giờ tôi kẻ lại ngay, đừng tưởng bở.')], 'xem_chung'],
        ['Hôm kiểm tra à?', [n('Kiểm tra thì tôi kẻ đậm thêm ấy chứ. Hôm {x} quên sách cơ, hai đứa xem chung một quyển.')]]),
      n('Ngồi cùng bàn ba năm, cãi nhau nhiều hơn nói chuyện. Thế mà giờ gặp lại vui nhất.')],
      again: [n({ t: 'Bàn mình ngồi là bàn thứ hai dãy trong. Tí vào lớp tôi chỉ cho, vết mực của {x} chắc vẫn còn.', f_xem_chung: 'Quyển sách hai đứa xem chung hôm ấy, tôi vẫn nhớ {x} lật trang chậm ơi là chậm.', doneLesson: 'Vừa nãy trong lớp {x} vẫn lấn sang phần bàn tôi đấy. Bao nhiêu năm không sửa.' })] },
    { id: 'viec', title: 'Dạo này sống thế nào?', kw: ['công việc', 'gia đình', 'sống thế nào'], script: [
      n('Tôi mở một hiệu sách nhỏ gần chợ. Bán sách thì ít, bán bút thước cho học trò thì nhiều.'), p('Hợp với người ngày xưa giữ sách cẩn thận nhất lớp.'),
      n('Bọn trẻ vào mua hay hỏi mượn thước kẻ. Tôi nhìn chúng nó lại nhớ {x} mượn thước tôi ba năm không trả.'),
      c('Thước của tôi {x} còn giữ không đấy?',
        ['Vẫn còn, ở ngăn kéo', [n('Thật à? Thế giữ tiếp đi, coi như tôi gửi. Thỉnh thoảng nhìn thấy thì nhớ đứa cùng bàn.')], 'giu_thuoc'],
        ['Chắc mất từ lâu rồi…', [n('Biết ngay mà. Thôi, ra hiệu tôi lấy cái mới, tôi tính giá bạn cũ: gấp đôi.')]])],
      again: [n({ t: 'Hiệu sách vẫn thế, vắng mà vui. Hôm nào qua, tôi pha trà.', f_giu_thuoc: 'Cái thước ấy {x} mang đến hiệu tôi đi, tôi đóng khung treo lên: “hiện vật mượn không trả”.' })] },
    { id: 'vang', title: 'Hỏi thăm bạn vắng', kw: ['vắng', 'không về'], script: [
      n({ t: '{vang} không về, tiếc thật. Ngày xưa hay ngồi bàn trên quay xuống chép bài hai đứa mình.', full: 'Đủ cả, vui thật. Tôi cứ sợ thiếu một đứa là lại ngồi nhắc cả buổi.' }),
      p({ t: 'Giờ bạn ấy ở đâu?', full: 'Lần đầu đủ thế này nhỉ?' }),
      n({ t: 'Trong Nam, lập nghiệp trong ấy rồi. Mỗi năm nhắn một câu: “vẫn nhớ vở của {huong}”.', full: 'Lần đầu đấy. Tôi phải ghi ngày hôm nay vào lưu bút.' }),
      c('Tôi định gửi quà cho mấy đứa ở xa, {x} góp gì không?',
        ['Góp một tấm ảnh cả lớp', [n('Ý hay. Tí chụp ảnh kỷ yếu xong tôi rửa ra gửi luôn.')]],
        ['Góp lời nhắn', [n('Thế {x} viết vào đây, chữ xấu cũng được, chúng nó quen rồi.')]])],
      again: [n({ t: 'Quà cho mấy đứa ở xa tôi gói rồi, chỉ chờ thêm tấm ảnh cả lớp.', donePhoto: 'Ảnh kỷ yếu có rồi, mai tôi gửi cho mấy đứa ở xa ngay.' })] },
    { id: 'bimat', title: 'Trang lưu bút còn dở', kw: ['lưu bút', 'bí mật'], script: [
      n('Lưu bút của tôi có một trang {x} viết dở, mới được ba dòng thì trống đánh.'), p('Tôi viết gì ấy nhỉ?'),
      n('“Gửi đứa cùng bàn khó tính nhất trần đời. Sau này…” rồi hết. Tôi tò mò chữ “sau này” suốt {nam} nay.'),
      c('Giờ {x} viết nốt đi, “sau này” thế nào?',
        ['“…vẫn cho mượn thước nhé.”', [n('Ha ha. Được, duyệt. Đúng giọng {x} ngày xưa.')]],
        ['“…gặp lại vẫn nhận ra nhau.”', [n('…Ừ. Thì nhận ra đây còn gì. Câu này tôi chép vào cho {x}, chữ {x} xấu lắm.')], 'cau_dep']),
      n('Thế là xong một trang. Mất có {nam}.')],
      again: [n({ t: 'Trang lưu bút ấy giờ đủ rồi. Tôi vẫn để bút cạnh, biết đâu {x} muốn thêm dòng nữa.', f_cau_dep: '“Gặp lại vẫn nhận ra nhau.” Tôi chép vào rồi đấy, nắn nót hẳn hoi.' })] },
  ],
  tung: [
    { id: 'quavat', title: 'Quà vặt cổng trường', kw: ['xôi', 'quà vặt', 'cổng trường'], script: [
      n('Ngày xưa tiền ăn sáng mẹ cho, tôi chia ba: xôi, ô mai, còn lại góp mua bóng.'), p('Thảo nào quả bóng của lớp lúc nào cũng thiếu tiền.'),
      n('Tại ô mai tăng giá chứ. Mà {x} toàn ăn ké xôi của tôi còn gì.'),
      c('Nhớ không, {x} nợ tôi bao nhiêu nắm xôi?',
        ['Nợ thì trả, tí tôi khao', [n('Nói phải giữ lời đấy. Hàng xôi ngay ngoài cổng, tôi nhớ đường lắm.')], 'khao_xoi'],
        ['Ai tính toán thế bao giờ', [n('Tôi không tính, bụng tôi nó tự nhớ. Thôi, coi như lãi của {nam}, tí khao tôi một gói.')]])],
      again: [n({ t: 'Tôi vừa ngó hàng xôi ngoài cổng rồi, hành phi vẫn thơm. Lúc nào đi thì gọi.', f_khao_xoi: '{x} hứa khao xôi rồi đấy nhé. Tôi nhịn ăn sáng để dành bụng đây.' })] },
    { id: 'viec', title: 'Giờ làm gì mà vẫn mê ăn thế?', kw: ['công việc', 'gia đình', 'quán cơm'], script: [
      n('Tôi mở quán cơm bình dân. Mê ăn thì làm nghề cho ăn, hợp lý không?'), p('Hợp lý. Đông khách không?'),
      n('Đông. Bí quyết là món nào tôi cũng nếm trước. Vì thế mới ra nông nỗi này.'),
      c('Món tủ của quán tôi, đoán xem?',
        ['Xôi chứ gì', [n('Sai. Canh cua mồng tơi. Nhưng sáng thì có xôi thật, tôi nấu theo trí nhớ về hàng xôi cổng trường.')]],
        ['Canh cua?', [n('Trời, đúng luôn! Canh cua mồng tơi. {x} mà tới, tôi múc bát to nhất.')], 'canh_cua'])],
      again: [n({ t: 'Hôm nào qua quán tôi, ăn xong không phải rửa bát đâu, bạn học được miễn.', f_canh_cua: 'Bát canh cua to nhất vẫn để phần {x} đấy, tới sớm kẻo tôi ăn mất.' })] },
    { id: 'vang', title: 'Mấy đứa vắng mặt', kw: ['vắng', 'không về'], script: [
      n({ t: '{vang} không về thì ai ăn hộ phần xôi của nó? Thôi để tôi.', full: 'Đủ cả thế này thì tốn xôi lắm đây. Nhưng mà vui.' }),
      p('{tung} chỉ nghĩ đến ăn thôi à?'), n({ t: 'Ăn là nhớ đấy. Ngày xưa nó hay bẻ đôi cái bánh cho tôi, giờ tôi ăn hộ nó là đúng đạo lý.', full: 'Thì họp lớp là để ăn với nhau một bữa cho ra bữa mà.' }),
      c('Liên hoan tối nay, {x} chọn món gì?',
        ['Cứ xôi với trà đá như xưa', [n('Giản dị, tôi duyệt. Thêm đĩa lạc rang nữa là đủ lễ.')]],
        ['Cho {tung} quyết hết', [n('Giao đúng người rồi đấy. Yên tâm, không ai phải về bụng đói.')]])],
      again: [n('Thực đơn liên hoan tôi nghĩ xong rồi, chỉ chờ {@ngan} duyệt chi.')] },
    { id: 'bimat', title: 'Vụ mất hộp bánh quy', kw: ['bánh quy', 'bí mật', 'liên hoan'], script: [
      n('Liên hoan cuối năm lớp 10, lớp mình mất một hộp bánh quy. Cả lớp nghi tôi.'), p('Thì đúng là {tung} còn gì?'),
      n('Oan! Lần ấy không phải tôi. Tôi chỉ ăn hộp thứ hai thôi.'),
      c('Thủ phạm hộp thứ nhất, {x} đoán là ai?',
        ['{long}?', [n('Chuẩn không cần chỉnh. Nó giấu trong cặp, hôm sau còn mời tôi một cái, tưởng tôi không biết.')]],
        ['Chẳng lẽ là lớp trưởng?', [n('{quang} thì liêm khiết lắm, trừ ô mai. Là {@long} đấy, hôm sau còn mời tôi một cái bịt miệng.')]])],
      again: [n('Vụ hộp bánh quy khép lại nhé. Hộp thứ hai thì tôi nhận, tôi không chối.')] },
  ],
  ngan: [
    { id: 'quy', title: 'Sổ quỹ lớp', kw: ['quỹ lớp', 'sổ quỹ', 'nợ'], script: [
      n('Sổ quỹ lớp tôi vẫn giữ, bìa xanh, bọc ni-lông. Tên {x} có một dòng gạch đỏ.'), p('Gạch đỏ là sao?'),
      n('Là còn thiếu hai nghìn tiền quỹ tháng năm. Tôi không đòi, nhưng tôi không quên.'),
      c('Giờ {x} định thế nào với khoản này?',
        ['Trả ngay, cả gốc lẫn lãi', [n('Lãi thì thôi. Hai nghìn, đúng hai nghìn. Tôi xoá dòng đỏ, {x} ký vào đây.')], 'tra_quy'],
        ['Xin khất đến họp lớp sau', [n('Khất từ năm lớp 12 tới giờ đấy nhé. Được, tôi ghi thêm một dòng: “hẹn thêm lần nữa”.')]])],
      again: [n({ t: 'Dòng gạch đỏ vẫn còn đấy. Sổ tôi mang theo đây, lúc nào muốn xoá thì bảo.', f_tra_quy: 'Sổ quỹ sạch dòng đỏ rồi. {x} là người cuối cùng, tôi chờ ngày này lâu lắm.' })] },
    { id: 'viec', title: 'Giờ vẫn giữ tiền à?', kw: ['công việc', 'gia đình', 'kế toán'], script: [
      n('Tôi làm kế toán cho một xưởng may. Cả đời gắn với sổ sách, chắc tại quyển sổ quỹ lớp mình.'), p('Nghe là thấy tin tưởng.'),
      n('Sếp tôi bảo: {ngan} mà gật thì mới được chi. Tôi bảo: tôi luyện từ năm mười sáu tuổi.'),
      c('Nhà {x} ai giữ tiền?',
        ['Tôi giữ', [n('Thế thì phải có sổ. Không sổ là cuối tháng không biết tiền đi đâu, giống quỹ lớp trước khi có tôi.')]],
        ['Không phải tôi…', [n('Thế là nhà {x} có một “thủ quỹ” rồi. Cho tôi gửi lời chào đồng nghiệp.')]])],
      again: [n('Cuối năm xưởng quyết toán, tôi bận lắm. Nhưng họp lớp thì vẫn về, quỹ lớp cần người trông.')] },
    { id: 'vang', title: 'Bạn nào chưa về?', kw: ['vắng', 'không về'], script: [
      n({ t: '{vang} chưa về nhưng đã chuyển khoản góp quỹ. Người như thế vắng mặt tôi vẫn quý.', full: 'Đủ cả. Quỹ thu một lần là xong, tôi mừng nhất.' }),
      p('Còn ai nữa không?'), n({ t: '{vang} thì nhắn là sang năm về góp bù. Tôi ghi sổ rồi, không quên được đâu.', full: 'Không. Hôm nay sổ của tôi không có dòng nào phải gạch.' }),
      c('Quỹ thừa năm nay nên làm gì nhỉ?',
        ['Mua quà tặng thầy cô', [n('Tôi cũng nghĩ thế. Một lẵng hoa với tấm thiệp cả lớp cùng ký.')]],
        ['Để dành sang năm họp tiếp', [n('Cũng được. Tiền để trong quỹ tôi giữ thì không mất đi đâu một đồng.')]])],
      again: [n('Quỹ tôi vừa cộng lại, khớp từng đồng. {x} muốn xem sổ không?')] },
    { id: 'bimat', title: 'Thủ quỹ cũng có lần tiêu lạm', kw: ['bí mật', 'tiêu lạm'], script: [
      n('Tôi thú thật một chuyện: có lần tôi tiêu lạm vào quỹ lớp.'), p('{ngan} mà cũng thế á?'),
      n('Năm trăm đồng. Mua cái kẹo mút, vì hôm ấy kiểm tra Hoá khó quá, tôi cần an ủi.'),
      c('Hôm sau tôi làm gì, {x} biết không?',
        ['Bù lại ngay chứ gì', [n('Bù một nghìn. Tự phạt gấp đôi, ghi rõ trong sổ: “thủ quỹ nộp phạt”. Sổ tôi không giấu chuyện gì.')]],
        ['Giấu luôn?', [n('Giấu thì đã không phải tôi. Hôm sau tôi bù một nghìn, tự phạt gấp đôi, ghi hẳn vào sổ.')]])],
      again: [n('Cái kẹo mút năm trăm ấy là khoản chi sai duy nhất đời tôi. Đến giờ vẫn thấy ngọt.')] },
  ],
  long: [
    { id: 'trontiet', title: 'Những lần trốn tiết', kw: ['trốn tiết', 'bùng học'], script: [
      n('Hai đứa mình trốn tiết tổng cộng bốn lần, tôi nhớ đủ cả bốn.'), p('Lần nào đáng nhớ nhất?'),
      n('Lần trốn ra bờ hồ, gặp ngay cô chủ nhiệm đi chợ về qua. Tôi bảo: “Em chào cô, bọn em đi… nghiên cứu thực tế.”'),
      c('{x} lúc ấy làm gì, nhớ không?',
        ['Tôi chào rõ to rồi đứng im', [n('Đúng! {x} chào to đến mức cô giật mình. Cô bảo: “Nghiên cứu xong thì về lớp chép phạt.”')]],
        ['Tôi chạy trước', [n('Chạy đâu mà chạy, {x} đứng chào to nhất. Cô bảo nghiên cứu xong về lớp chép phạt. Đừng sửa lịch sử.')], 'sua_lich_su']),
      n('Chép phạt hai mươi lần câu “Em không trốn tiết”. Tôi chép đẹp nhất đời.')],
      again: [n({ t: 'Bờ hồ giờ kè đá đẹp rồi. Hôm nào hai đứa ra “nghiên cứu thực tế” lần nữa.', f_sua_lich_su: 'Đừng có bảo {x} chạy trước nữa nhé. Nhân chứng là tôi vẫn sống sờ sờ đây.', doneLesson: 'Vừa nãy trong lớp tôi suýt rủ {x} trốn tiết sinh hoạt. Nghề cũ khó bỏ.' })] },
    { id: 'viec', title: 'Giờ làm gì mà vui tính thế?', kw: ['công việc', 'gia đình', 'mc'], script: [
      n('Tôi làm dẫn chương trình đám cưới. Ngày xưa nói leo trong lớp, giờ nói leo có cát-xê.'), p('Đúng nghề quá rồi.'),
      n('Cô chủ nhiệm mà biết chắc bảo: “Cuối cùng cái miệng em cũng nuôi được em.”'),
      c('Đám cưới con {x} sau này, có thuê tôi không?',
        ['Thuê, nhưng phải giảm giá', [n('Giảm một nửa, kèm điều kiện tôi được kể chuyện bố mẹ nó trốn tiết.')], 'thue_mc'],
        ['Còn lâu, nó còn bé', [n('Thì tôi nhận đặt chỗ trước. Lịch tôi kín đến tận lúc nó lớn đấy.')]])],
      again: [n({ t: 'Cuối tuần này tôi dẫn hai đám. Đám nào cũng kể một chuyện cười thời đi học, khán giả thích lắm.', f_thue_mc: 'Hợp đồng dẫn đám cưới nhà {x} tôi ghi sổ rồi nhé, giảm nửa giá, có kể chuyện trốn tiết.' })] },
    { id: 'vang', title: 'Đứa nào hôm nay vắng?', kw: ['vắng', 'không về'], script: [
      n({ t: '{vang} vắng à? Tiếc nhỉ, thiếu nó là thiếu người cười to nhất lớp.', full: 'Đủ cả à? Thế thì hôm nay tôi hết cớ kể chuyện sau lưng ai rồi.' }),
      p('Thế định kể chuyện gì?'), n({ t: 'Chuyện cả lũ ngủ gật giờ thứ năm ấy. Tôi còn giữ tấm ảnh chụp trộm nửa lớp gục xuống bàn, có cả tôi.', full: 'Chuyện cả lũ ngủ gật giờ thứ năm ấy. Tôi còn giữ tấm ảnh chụp trộm nửa lớp gục xuống bàn, có cả tôi.' }),
      c('Tôi gửi ảnh ngủ gật vào nhóm lớp nhé?',
        ['Gửi đi, cho vui', [n('Gửi rồi. Ba giây nữa điện thoại tôi rung cho mà xem.')]],
        ['Thôi, giữ thể diện cho bạn', [n('{x} hiền thế. Được, tôi giữ làm của hồi môn, khi nào cần thì dùng.')]])],
      again: [n('Ảnh ngủ gật tôi vẫn giữ. Trong ảnh có những ai thì tôi không nói, {x} tự đoán.')] },
    { id: 'bimat', title: 'Ai vẽ lên bảng hôm ấy?', kw: ['vẽ bảng', 'bí mật'], script: [
      n('Vụ ai đó vẽ con mèo đeo kính lên bảng trước giờ Toán, cả lớp bị đứng mười phút, nhớ không?'), p('Nhớ. Đến giờ vẫn chưa biết ai vẽ.'),
      n('Tôi vẽ. Nhưng con mèo ấy tôi vẽ theo đơn đặt hàng.'),
      c('Đoán xem ai đặt?',
        ['{thuy}?', [n('Sai. Người đặt đang đứng ngay trước mặt tôi. {x} bảo: “vẽ gì cho đỡ buồn ngủ đi”. Đồng phạm đấy nhé.')], 'dong_pham'],
        ['Chẳng lẽ là tôi?', [n('Chính xác! {x} bảo vẽ gì cho đỡ buồn ngủ. Thế là cả lớp tỉnh hẳn, đứng mười phút.')], 'dong_pham'])],
      again: [n('Con mèo đeo kính ấy là tác phẩm đỉnh nhất đời tôi. {x} là nhà tài trợ ý tưởng.')] },
  ],
};

/** hai chủ đề chung, bạn nào cũng nói được */
export const MATE_COMMON = [
  { id: 'homnay', title: 'Hôm nay mình làm gì tiếp?', kw: ['làm gì tiếp', 'đi đâu', 'tiếp theo', 'chương trình'], script: [
    n({ t: 'Còn nhiều việc lắm: về lớp cũ, ra sân xem văn nghệ, chụp cái ảnh kỷ yếu. Thứ tự tuỳ {x}.', doneAll: 'Xong cả rồi còn gì. Giờ chỉ còn việc khó nhất: chào nhau ra về.', doneLesson: 'Lớp cũ thì về rồi. Còn văn nghệ với ảnh kỷ yếu, {x} chọn đi.' }),
    c('Mà {x} thích nhất chỗ nào trong trường?',
      ['Lớp học cũ', [n({ t: 'Tôi cũng thế. Ngồi vào bàn một cái là thấy mình mười bảy tuổi.', doneLesson: 'Vừa ngồi lại rồi đấy. Ghế băng vẫn cứng như xưa, chỉ có lưng mình là khác.' })], 'thich_lop'],
      ['Sân trường giờ ra chơi', [n('Ừ, mười lăm phút mà làm được đủ thứ. Bên kia có bọn trẻ đá cầu kìa, vào đá thử đi.')], 'thich_san'],
      ['Quán nước ngoài cổng', [n('Biết ngay. Tí xong việc cả lớp kéo ra, gọi món ngồi cho đến tối.')], 'thich_quan']),
    n({ t: 'Bấm J mà xem chương trình, lớp trưởng soạn kỹ lắm đấy.', night: 'Tối rồi, góc sân phía tây có lửa trại đấy, ra ngồi một lúc đi.' })],
    again: [n({ t: 'Cứ thong thả. Hôm nay không ai đánh trống giục mình cả.', f_thich_quan: 'Quán nước ngoài cổng vẫn chờ đấy, {x} nói thích nhất mà.', f_thich_san: 'Ra sân đá cầu với bọn trẻ đi, {x} bảo thích giờ ra chơi nhất cơ mà.', night: 'Lửa trại góc sân phía tây vẫn cháy đấy.' })] },
  { id: 'truong', title: 'Trường mình bây giờ', kw: ['khác xưa', 'thay đổi'], script: [
    n({ t: 'Trường sơn lại vàng tươi thế này, nhìn xa tôi suýt không nhận ra.', rain: 'Mưa xuống là sân trường lại bóng loáng như ngày xưa, {x} thấy không?', night: 'Ban đêm trường mình lên đèn trông lạ thật, ngày xưa có bao giờ được ở lại muộn thế này.' }),
    p('Nhưng mấy thứ cũ vẫn còn.'), n('Còn chứ. Cái trống, cây xoài, cầu thang mòn ở giữa bậc. Mấy thứ ấy mà mất thì tôi không về nữa.'),
    c('{x} nhặt được mấy góc kỷ niệm rồi?',
      ['Đang nhặt dở', [n({ t: 'Cứ đi quanh trường, chỗ nào có khung ảnh vàng xoay xoay là một góc. Bấm M xem còn thiếu chỗ nào.', memAll: 'Dở gì nữa, tôi thấy {x} nhặt đủ cả rồi còn gì. Khiêm tốn thế.' })]],
      ['Kỷ niệm thì ở trong đầu cả rồi', [n('Nói nghe sang nhỉ. Nhưng cứ nhặt đi, có cái đọc lại vẫn thấy cay cay mũi.')]])],
    again: [n({ t: 'Tôi vừa đi một vòng, cái gì cũng muốn sờ vào một cái.', memAll: 'Đủ mười hai góc kỷ niệm rồi đấy. {x} đúng là đứa hoài niệm nhất lớp.', rain: 'Mưa thế này ngày xưa là được nghỉ thể dục. Sướng nhất trần đời.' })] },
];
