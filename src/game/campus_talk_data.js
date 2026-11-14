// Chuyện trò theo chủ đề với nhân vật trong trường + các ý định khi người chơi gõ tự do (dữ liệu cho campus_talk.js). Lời văn tự viết, tên hư cấu.
// Cấu trúc chủ đề và nút kịch bản: xem đầu reunion_talk_data.js. Ký hiệu riêng ở đây:
//   {minh} người chơi tự xưng với nhân vật (cháu/em/anh/chị/tôi)
//   {toi} nhân vật tự xưng (cô/thầy/bác/bà/em/tôi) · {ban} đại từ gọi người chơi (em | anh/chị | ông/bà) · {goi} gọi kèm tên · {ong} người chơi gọi nhân vật
//   {kyniem} tên góc kỷ niệm gần nhất chưa nhặt · {gio} giờ trong game · {cau} kỷ lục đá cầu
import { n, p, c } from './reunion_talk_data.js';

export const HELLO = {
  elder: [{ t: 'Ơ, {goi} đấy à? Lại đây nói chuyện với {toi} một lúc.', first: 'Chào {goi}. Cựu học sinh về thăm trường phải không? Nhìn dáng là {toi} biết.', morning: 'Sáng ra đã thấy {goi} rồi. Về sớm thế là quý trường lắm đấy.', rain: 'Mưa thế này mà {goi} vẫn đi quanh trường à? Đứng vào đây cho đỡ ướt.', night: 'Tối rồi mà {goi} chưa về à? Thôi, ở lại chơi cho trọn.', wearClass: 'Mặc áo lớp thế kia thì đúng là đi họp lớp rồi. Chào {goi}!', wearAodai: 'Áo dài đẹp quá. {toi} nhìn cứ tưởng cô giáo mới về trường.', often: '{goi} lại ghé à? {toi} sắp thuộc mặt hơn cả học sinh đang học rồi đấy.' }],
  young: [{ t: 'Em chào {goi} ạ!', first: 'Em chào {ban} ạ! {ban} là cựu học sinh về thăm trường ạ?', rain: 'Em chào {goi} ạ! Mưa to quá, {ban} đứng vào đây đi ạ.', night: 'Em chào {goi} ạ! Tối rồi mà trường vẫn vui {ban} nhỉ.', wearClass: 'Áo lớp của {ban} đẹp thế ạ! Lớp em cũng đang đòi in áo.', wearAodai: 'Áo dài của {ban} đẹp quá ạ!', often: 'Lại là {goi} ạ! Em với {ban} sắp thành bạn thân rồi.' }],
};
export const BACK = { elder: ['Còn muốn hỏi gì nữa không {ban}?', '{toi} còn rảnh, cứ hỏi.', 'Thế còn chuyện gì nữa nào?'], young: ['{ban} hỏi gì nữa không ạ?', 'Em còn rảnh ạ, {ban} cứ hỏi.', '{ban} muốn nghe chuyện gì nữa ạ?'] };
export const BYE = { elder: [{ t: 'Ừ, đi chơi tiếp đi. Lúc nào về nhớ ghé chào {toi} một câu.', night: 'Ừ, khuya thì về cẩn thận nhé {ban}.' }], young: [{ t: 'Em chào {ban} ạ! {ban} đi chơi vui nhé!', night: 'Em chào {ban} ạ! Tối {ban} ra lửa trại chơi nhé!' }] };
export const MENU = { bye: 'Chào nhé', order: 'Gọi món', stop: 'Thôi, {ong} về chỗ đi nhé', input: 'Nói gì đó…', send: 'Nói' };

/** "trường bây giờ khác xưa": ba kiểu cho người lớn, ba kiểu cho học sinh */
export const THEN = {
  elderA: { id: 'then', title: 'Trường bây giờ khác xưa không {ong}?', kw: ['khác xưa', 'ngày xưa'], script: [
    n('Khác chứ. Tường sơn lại, sân lát lại, lớp nào cũng có máy chiếu. Chỉ có học trò là vẫn thế, vẫn chạy khi nghe trống.'), p('Thế cái gì {ong} thấy tiếc nhất?'),
    n('Tiếc hàng ghế đá cũ. Ghế mới đẹp hơn, nhưng ghế cũ có khắc tên của bao nhiêu lứa.'),
    c('{ban} về thấy lạ hay thấy quen?', ['Quen, như chưa đi đâu', [n('Thế là trường còn giữ được hồn. {toi} nghe thế là mừng.')], 'thay_quen'], ['Lạ, phải nhìn kỹ mới nhận ra', [n('Cứ đi một vòng đi, tới cầu thang với gốc xoài là nhận ra ngay thôi.')]])],
    again: [n({ t: 'Trường thì năm nào cũng sửa một ít. {toi} chỉ mong đừng ai sửa cái trống.', f_thay_quen: '{ban} bảo về thấy quen, {toi} kể lại cho mấy thầy cô, ai cũng vui.' })] },
  elderB: { id: 'then', title: 'Học trò bây giờ thế nào {ong}?', kw: ['học trò', 'học sinh', 'khác xưa'], script: [
    n('Bây giờ chúng nó giỏi hơn các {ban} ngày xưa, cái gì cũng tra được trong điện thoại. Nhưng chữ thì xấu đi nhiều.'), p('Thế còn nghịch thì sao ạ?'),
    n('Nghịch thì kém xa. Ngày xưa các {ban} trèo cây, đá bóng vỡ kính. Giờ chúng nó nghịch trong màn hình, yên tĩnh đến phát lo.'),
    c('Ngày xưa {ban} thuộc loại nào?', ['Ngoan, thật đấy ạ', [n('Ai về thăm trường cũng nói thế. {toi} nghe quen lắm rồi.')]], ['Nghịch có tiếng', [n('Thế mới nhớ trường mà về. Đứa ngoan quá nhiều khi lại đi biệt.')], 'nhan_nghich'])],
    again: [n({ t: 'Học trò lứa nào cũng có cái hay của lứa ấy. {toi} quý cả.', f_nhan_nghich: 'Đứa nghịch có tiếng lại về thăm đây rồi. Đừng trèo cây nữa nhé, lớn rồi.' })] },
  elderC: { id: 'then', title: 'Chỗ này ngày xưa trông thế nào ạ?', kw: ['chỗ này', 'ngày xưa', 'khác xưa'], script: [
    n({ t: 'Chỗ {toi} đứng đây ngày xưa đất còn lổn nhổn, mưa xuống là lội.', rain: 'Mưa như hôm nay mà là ngày xưa thì chỗ này thành ao rồi, học trò xắn quần lội vào lớp.' }), p('Giờ thì sạch đẹp quá rồi.'),
    n('Đẹp, nhưng {toi} vẫn nhớ cái cảnh cả trường lội nước mà cười như được mùa.'),
    c('{ban} có nhớ trận mưa nào ở trường không?', ['Có, hôm ấy được nghỉ thể dục', [n('Đấy, nhớ nhất toàn là những hôm được nghỉ. Học trò nào cũng thế.')]], ['Không nhớ mưa, chỉ nhớ nắng sân trường', [n('Nắng thì vẫn thế. Trưa nào cũng vàng rực cả cái sân này.')]])],
    again: [n('Trường đổi thay nhiều, nhưng đứng đúng chỗ cũ nhìn lên thì trời vẫn y nguyên.')] },
  youngA: { id: 'then', title: 'Trường bây giờ có vui không em?', kw: ['vui không'], script: [
    n('Vui lắm ạ! Nhất là dịp này, trường cho bọn em nghỉ hai tiết để đón các {ban}.'), p('Ngày xưa bọn anh chị cũng mong được nghỉ thế.'),
    n('Thầy cô kể khoá các {ban} nghịch lắm, có thật không ạ?'),
    c('Kể em nghe một chuyện đi ạ?', ['Bọn anh chị từng trốn tiết ra bờ hồ', [n('Thật ạ? Thế mà thầy cô cứ bảo ngày xưa ai cũng ngoan. Em phải kể lại cho cả lớp.')], 'ke_tron_tiet'], ['Không, bọn anh chị ngoan lắm', [n('Em không tin đâu ạ, {ban} cười thế kia cơ mà.')]])],
    again: [n({ t: 'Trường em vui nhất là giờ ra chơi ạ, {ban} cứ ra sân là thấy.', f_ke_tron_tiet: 'Chuyện trốn tiết ra bờ hồ của {ban}, em kể cho lớp em rồi. Cả lớp bảo khoá {khoa} đỉnh thật.' })] },
  youngB: { id: 'then', title: 'Các em bây giờ học có vất không?', kw: ['vất', 'bài tập', 'thi cử'], script: [
    n('Vất lắm ạ. Sáng học, chiều học thêm, tối làm đề. Em chỉ mong đến giờ thể dục.'), p('Ngày xưa cũng thế thôi, chỉ không có điện thoại.'),
    n('Không có điện thoại thì các {ban} hỏi bài nhau kiểu gì ạ?'),
    c('Em tò mò thật đấy ạ.', ['Đạp xe sang nhà nhau', [n('Ôi, thế thì thân nhau lắm nhỉ. Bọn em toàn nhắn tin, có đứa ngồi cạnh nhau vẫn nhắn.')]], ['Chép bài nhau đầu giờ', [n('Cái đấy thì bây giờ vẫn thế ạ! Truy bài mười lăm phút là chép được cả trang.')], 'chep_bai'])],
    again: [n({ t: 'Em vừa làm xong đề Toán, sai mất ba câu. {ban} đừng hỏi câu nào ạ.', f_chep_bai: '{ban} bảo ngày xưa chép bài đầu giờ, em yên tâm hẳn. Truyền thống của trường mình.' })] },
  youngC: { id: 'then', title: 'Em thích gì nhất ở trường?', kw: [], script: [
    n('Em thích nhất hành lang tầng hai ạ. Đứng đấy nhìn xuống là thấy hết sân trường.'), p('Ngày xưa anh chị cũng hay đứng đấy.'),
    n('Thật ạ? Thế chắc lan can ấy có dấu tay của các {ban}.'),
    c('{ban} ngày xưa đứng đấy nhìn gì ạ?', ['Nhìn xem ai đi muộn', [n('Giống hệt bọn em! Sáng nào cũng có vài bạn chạy thục mạng qua cổng.')]], ['Nhìn một người', [n('Ôi… em hiểu rồi ạ. Em không hỏi nữa đâu.')], 'nhin_mot_nguoi'])],
    again: [n({ t: 'Tí {ban} lên hành lang tầng hai nhà A mà xem, gió mát lắm ạ.', f_nhin_mot_nguoi: 'Em vẫn chưa kể với ai chuyện {ban} đứng hành lang nhìn một người đâu ạ.' })] },
};

/** lời nhờ / gợi ý dẫn tới một hoạt động trong game */
export const TIP = {
  trong: { id: 'tip', game: 'trong', title: 'Có việc gì cho {minh} làm không {ong}?', kw: ['trống', 'đánh trống', 'có việc gì', 'giúp gì'], script: [
    n('Có đấy. Cái trống trường cạnh nhà A kia, lâu lắm chưa có cựu học sinh nào đánh cho ra hồn.'), p({ t: 'Đánh thế nào cho đúng ạ?', young: 'Đánh thế nào cho đúng nhỉ?' }),
    n('Ba hồi chín tiếng. Hồi dài thì đánh dồn, tiếng lẻ thì dõng dạc. Đứng gần trống bấm E là được.'),
    c('{ban} ngày xưa đã được đánh trống bao giờ chưa?', ['Chưa, chỉ dám nhìn', [n('Thế thì hôm nay đánh bù. Không ai ghi sổ đâu.')]], ['Rồi, bị phạt vì đánh trộm', [n('Ha ha, hôm nay thì được đánh công khai. Đánh to vào cho cả trường nghe.')], 'danh_trom'])],
    again: [n({ t: 'Trống vẫn đợi đấy. Đánh xong quay lại kể {toi} nghe tiếng có còn vang không.', f_danh_trom: 'Đứa đánh trộm trống năm xưa đã đánh lại chưa đấy?' })] },
  xoai: { id: 'tip', game: 'xoai', title: 'Cây xoài kia còn ra quả không?', kw: ['xoài', 'khều', 'dép', 'rung cây'], script: [
    n('Sai lắm. Cây xoài trước sân khấu ấy, năm nào cũng trĩu quả mà chưa quả nào kịp chín.'), p('Vẫn bị khều như ngày xưa à?'),
    n('Vẫn thế. Đứng gần cây bấm E là rung, bấm R là ném dép khều. Nhớ nhặt dép lại, kẻo đi chân đất về.'),
    c('Ngày xưa {ban} khều bằng gì?', ['Bằng dép', [n('Dân trong nghề rồi. Thế thì vào khều thử xem tay còn chuẩn không.')]], ['Bằng thước kẻ nối dài', [n('Sáng tạo đấy. Giờ thì cứ dép mà ném, đơn giản nhất.')]])],
    again: [n('Xoài rụng thì nhặt lên bằng chuột trái nhé. Chua, nhưng chua kiểu nhớ đời.')] },
  cau: { id: 'tip', game: 'cau', title: 'Giờ ra chơi bọn trẻ chơi gì?', kw: ['đá cầu', 'quả cầu', 'ra chơi'], script: [
    n('Đá cầu là nhất. Cạnh sân bóng rổ lúc nào cũng có một nhóm tâng cầu, vui lắm.'), p('Người lớn vào đá cùng được không?'),
    n({ t: 'Được chứ, lại gần bấm E là vào vòng. Chúng nó còn thích ấy, có người để trêu.', cauPro: 'Được chứ. Mà nghe nói có người tâng được {cau} lần liên tiếp rồi, có phải {ban} không đấy?' }),
    c('{ban} đá cầu có khá không?', ['Ngày xưa nhất lớp', [n('Thế thì vào cho chúng nó biết thế nào là lứa trước.')], 'cau_gioi'], ['Chân gỗ lắm', [n('Chân gỗ đá mới vui, cả vòng được cười.')]])],
    again: [n({ t: 'Nhóm đá cầu vẫn ở cạnh sân bóng rổ đấy.', f_cau_gioi: '“Nhất lớp” đã vào đá chưa? Kỷ lục bây giờ là {cau} lần đấy.' })] },
  lua: { id: 'tip', game: 'lua', title: 'Tối nay trường có gì không?', kw: ['tối nay', 'lửa trại', 'lửa', 'đêm nay'], script: [
    n({ t: 'Có lửa trại. Bảy rưỡi tối, góc sân phía tây cạnh sân bóng rổ, có cả đàn hát.', night: 'Lửa trại đang cháy đấy, góc sân phía tây cạnh sân bóng rổ. Ra mà ngồi.' }), p({ t: 'Ai tới cũng ngồi được ạ?', young: 'Ai tới cũng ngồi được à?' }),
    n('Ai cũng được. Có gốc cây làm ghế, lại gần bấm C là ngồi. Lớp nào về đông thì ngồi kín cả vòng.'),
    c('{ban} có định ở lại tới tối không?', ['Có, lâu lắm mới về', [n('Thế thì đúng rồi. Về thăm trường mà chưa ngồi quanh lửa thì chưa trọn.')], 'o_lai_toi'], ['Chắc phải về sớm', [n('Tiếc nhỉ. Thôi thì ngồi một lúc lấy hơi ấm rồi hẵng về.')]])],
    again: [n({ t: 'Lửa trại bảy rưỡi tối nhé, đừng quên.', night: 'Lửa đang đượm đấy, ra đi kẻo hết chỗ.', f_o_lai_toi: '{ban} bảo ở lại tới tối cơ mà. Lửa trại chờ đấy.' })] },
  kyniem: { id: 'tip', game: 'kyniem', title: 'Mấy cái khung ảnh vàng là gì thế?', kw: ['khung ảnh', 'kỷ niệm', 'góc kỷ niệm'], script: [
    n('Là góc kỷ niệm đấy. Trường đặt mười hai chỗ, mỗi chỗ một mẩu chuyện của học trò cũ.'), p('Thế nhặt ở đâu?'),
    n({ t: 'Gần đây nhất còn một cái ở chỗ {kyniem}. Lại gần bấm E là xem được. Bấm M thì thấy cả danh sách.', memAll: 'Mà {toi} thấy {ban} nhặt đủ cả mười hai góc rồi còn gì. Giỏi thật, ít người đi hết lắm.' }),
    c('{ban} nhớ nhất chỗ nào trong trường?', ['Cầu thang', [n('Cầu thang thì ai cũng có một chuyện. Chỗ ấy cũng có một góc kỷ niệm đấy.')]], ['Căng tin', [n('Biết ngay. Căng tin cũng có một góc, đọc xong lại thấy đói.')]], ['Cổng trường', [n('Cổng trường là nơi bắt đầu với kết thúc của mọi chuyện. Có một góc ở ngay đấy.')]])],
    again: [n({ t: 'Còn góc kỷ niệm ở chỗ {kyniem} chưa nhặt kìa.', memAll: 'Đủ mười hai góc rồi, {ban} là người hoài niệm chính hiệu.' })] },
  bongro: { id: 'tip', game: 'bongro', title: 'Sân bóng rổ còn đông không?', kw: ['bóng rổ', 'ném rổ'], script: [
    n('Chiều nào cũng kín. Sân ở phía tây, bóng để sẵn trên sân, ai tới cũng ném được.'), p('Ném thế nào ấy nhỉ, lâu quá rồi.'),
    n('Nhìn vào quả bóng, chuột trái để nhặt. Ngắm rổ, giữ chuột trái lấy lực rồi thả ra là ném. Bấm B thì nhồi bóng, bấm E dưới rổ thì thi ném sáu mươi giây.'),
    c('{ban} ngày xưa chơi vị trí gì?', ['Chuyên ngồi ngoài cổ vũ', [n('Cổ vũ cũng là một vị trí. Giờ vào ném thử một quả cho biết.')]], ['Ném ba điểm', [n('Ghê nhỉ. Thế thì đứng xa vào mà ném cho chúng nó xem.')], 'ba_diem'])],
    again: [n({ t: 'Sân bóng rổ ở phía tây đấy, bóng vẫn để sẵn.', f_ba_diem: '“Chuyên gia ba điểm” ném được quả nào chưa đấy?' })] },
};

/** chủ đề về việc của từng người + phân công hai chủ đề còn lại (then: kiểu "khác xưa", tip: hoạt động gợi ý) */
export const NPC = {
  guard: { then: 'elderA', tip: 'trong', job: { id: 'job', title: 'Bác gác cổng lâu chưa ạ?', kw: ['gác cổng', 'bảo vệ', 'lâu chưa', 'nghề'], script: [
    n('Lâu đến mức học trò ngày xưa giờ dắt con vào nhập học, vẫn chào bác y như cũ.'), p('Bác nhớ hết mặt học sinh ạ?'),
    n('Mặt thì nhớ, tên thì chịu. Bác nhớ theo kiểu: đứa này hay đi muộn, đứa kia hay quên thẻ xe.'),
    c('Thế bác đoán xem ngày xưa cháu thuộc kiểu nào?', ['Hay đi muộn', [n('Bác biết ngay mà. Cái dáng chạy qua cổng ấy bác nhìn quen lắm.')], 'di_muon'], ['Hay quên thẻ xe', [n('Thế thì chắc bác cho nợ không ít lần đâu. Hôm nay khỏi cần thẻ.')]]),
    n('Gác cổng không phải để cấm ai đâu cháu. Là để có người nhìn theo lúc các cháu ra về.')],
    again: [n({ t: 'Bác vẫn ngồi đây thôi. Cổng này mở đến tối, cứ thong thả.', f_di_muon: 'Đứa hay đi muộn hôm nay lại đến sớm, bác phải ghi vào sổ mới được.' })] } },
  xoi: { then: 'elderC', tip: 'kyniem', job: { id: 'job', title: 'Cô bán xôi ở đây lâu chưa ạ?', kw: ['bán xôi', 'xôi', 'lâu chưa', 'nghề'], script: [
    n('Gánh xôi này theo cô từ hồi tóc còn xanh. Bao nhiêu lứa học trò ăn xôi cô mà lớn.'), p('Cô có bí quyết gì không ạ?'),
    n('Nếp cái hoa vàng, đồ hai lửa, hành phi phải phi sáng nào dùng sáng ấy. Thế thôi, không có gì bí.'),
    c('Ngày xưa {ban} hay ăn xôi gì?', ['Xôi xéo', [n('Xôi xéo thêm nhiều hành, đúng không? Đứa nào cũng xin thêm hành.')], 'xoi_xeo'], ['Xôi lạc', [n('Xôi lạc rắc muối vừng. Món ấy đứa hiền hay ăn.')]]),
    n('Học trò có đứa nợ cô từ lớp 10, ra trường mười năm quay lại trả. Cô bảo: cô quên rồi, nó bảo: con không quên.')],
    again: [n({ t: 'Xôi vẫn nóng đấy. Ăn thì bảo cô một tiếng.', f_xoi_xeo: 'Xôi xéo nhiều hành của {ban} đây, cô nhớ rồi.' })] } },
  trada: { then: 'elderB', tip: 'lua', job: { id: 'job', title: 'Quán bà đông khách không ạ?', kw: ['quán cơm', 'trà đá', 'đông khách', 'nghề'], script: [
    n('Đông nhất là lúc tan học. Một ấm trà, chục cái ghế, mà chuyện thì đủ cho cả con phố.'), p('Bà nghe được nhiều chuyện lắm nhỉ.'),
    n('Chuyện gì của trường này bà cũng biết trước cả phòng giáo viên. Nhưng bà không kể đâu, nghề nó thế.'),
    c('Bà đoán {ban} ngày xưa hay ngồi quán nào?', ['Quán bà chứ đâu', [n('Khéo mồm thế. Thôi, cốc trà này bà rót đầy.')], 'kheo_mom'], ['Quán bên kia đường', [n('Bà biết ngay. Bên ấy có hướng dương ngon hơn, bà không giận đâu.')]])],
    again: [n({ t: 'Ngồi xuống đi, trà mới pha. Chuyện thì để uống xong hẵng kể.', f_kheo_mom: 'Đứa khéo mồm lại ra rồi. Ngồi đi, cốc này bà vẫn rót đầy.' })] } },
  mc: { then: 'elderA', tip: 'lua', job: { id: 'job', title: 'Cô dẫn chương trình cả ngày ạ?', kw: ['dẫn chương trình', 'mc', 'văn nghệ', 'nghề'], script: [
    n('Từ sáng tới giờ. Giọng cô khản rồi, nhưng thấy các em về đông là lại nói được.'), p('Tiết mục nào cô thích nhất?'),
    n({ t: 'Tốp múa của các em lớp 11. Tập có ba buổi mà đều tăm tắp, hơn hẳn thời cô đi học.', doneShow: 'Em xem rồi còn gì, tốp múa áo dài trắng ấy. Cô thấy em đứng dưới vỗ tay to lắm.' }),
    c('Hay cô mời {ban} lên phát biểu một câu nhé?', ['Thôi cô ơi, em run lắm', [n('Run là phải. Đứng trên này nhìn xuống sân trường, ai mà không run.')]], ['Được ạ, em xin một câu', [n('Thế nói ngắn thôi nhé: “Em về rồi đây ạ.” Thế là đủ, cả sân trường hiểu.')], 'phat_bieu'])],
    again: [n({ t: 'Chương trình còn dài, {ban} cứ đứng dưới sân mà xem.', f_phat_bieu: 'Câu “Em về rồi đây ạ” của {ban}, cô vẫn để dành cho phần cuối chương trình.' })] } },
  su: { then: 'elderC', tip: 'kyniem', job: { id: 'job', title: 'Thầy vẫn dạy Sử ạ?', kw: ['dạy sử', 'lịch sử', 'môn sử', 'nghề'], script: [
    n('Vẫn dạy. Thầy đứng lớp bao nhiêu năm, năm nào cũng có đứa hỏi: học Sử để làm gì hả thầy.'), p('Thầy trả lời thế nào ạ?'),
    n('Thầy bảo: để lúc đi xa còn biết đường mà nhớ. Như các em hôm nay về trường, cũng là đang ôn Sử đấy.'),
    c('Em còn nhớ được bài nào không?', ['Trận Bạch Đằng năm 938', [n('Tốt. Người Hải Phòng mà quên Bạch Đằng thì thầy buồn lắm.')], 'nho_938'], ['Em nhớ thầy hơn nhớ bài', [n('Câu ấy thì thầy chấm điểm mười. Nhưng về vẫn phải đọc lại sách đấy nhé.')]])],
    again: [n({ t: 'Bức tượng kia là nhà yêu nước Thái Phiên, trường mình mang tên cụ. Đi qua nhớ đứng lại một chút.', f_nho_938: 'Em nào nhớ năm 938 đấy nhỉ? Thầy vẫn kể với lớp bây giờ là học trò cũ còn thuộc bài.' })] } },
  td: { then: 'elderB', tip: 'bongro', job: { id: 'job', title: 'Thầy vẫn bắt chạy vòng sân ạ?', kw: ['thể dục', 'nghề'], script: [
    n('Vẫn. Nhưng giờ chạy hai vòng chúng nó đã kêu, ngày xưa các em chạy năm vòng còn đòi đá bóng.'), p('Bọn em ngày xưa cũng kêu đấy thầy.'),
    n('Kêu, nhưng vẫn chạy. Thầy đứng bấm giờ, đứa nào chạy tắt qua gốc cây thầy biết hết.'),
    c('Giờ em còn tập tành gì không?', ['Sáng nào cũng đi bộ', [n('Tốt. Tuổi các em bây giờ, đi bộ đều là quý hơn vàng.')], 'di_bo'], ['Dạ… tập bấm điều khiển tivi', [n('Thế thì hôm nay ra sân ném vài quả bóng rổ đi, coi như kiểm tra lại thể lực.')]])],
    again: [n({ t: 'Khởi động kỹ rồi hẵng chơi nhé, cổ chân các em không còn như xưa đâu.', f_di_bo: 'Vẫn đi bộ buổi sáng đấy chứ? Giữ lấy, thầy mừng.' })] } },
  cangtin: { then: 'elderA', tip: 'xoai', job: { id: 'job', title: 'Căng tin giờ bán gì cô?', kw: ['căng tin', 'bán gì', 'bánh mì', 'nghề'], script: [
    n('Vẫn bánh mì, mì tôm trứng, sữa đậu. Thêm trà sữa vì bọn trẻ đòi, chứ cô thì vẫn thích pha trà đá.'), p('Ra chơi vẫn chen nhau như xưa ạ?'),
    n('Chen chứ. Mười lăm phút mà cả trường đổ về đây, cô bán không kịp thở.'),
    c('Ngày xưa {ban} có ghi sổ nợ ở căng tin không?', ['Có, cuối tháng mới trả', [n('Đấy. Sổ nợ căng tin là quyển sổ dày nhất trường, hơn cả sổ đầu bài.')], 'ghi_no'], ['Không, em trả sòng phẳng', [n('Hiếm đấy. Học trò như thế cô nhớ mặt lắm.')]])],
    again: [n({ t: 'Bánh mì vừa ra lò đấy, ăn thì bảo cô.', f_ghi_no: 'Khách ghi sổ ngày xưa đây rồi. Hôm nay trả tiền ngay cô mới bán nhé.' })] } },
  saodo: { then: 'youngB', tip: 'trong', job: { id: 'job', title: 'Làm sao đỏ có vất không em?', kw: ['sao đỏ', 'ghi sổ', 'nề nếp', 'vất'], script: [
    n('Vất lắm ạ. Ghi tên bạn nào là bạn ấy giận em cả tuần.'), p('Ngày xưa sao đỏ cũng bị giận thế.'),
    n('Nhưng không ghi thì cô lại bảo em bao che. Em đứng giữa khổ lắm ạ.'),
    c('{ban} ngày xưa có bị sao đỏ ghi tên không ạ?', ['Tuần nào cũng có', [n('Thế thì {ban} đừng giận các bạn sao đỏ nữa nhé, bọn em cũng chỉ làm nhiệm vụ thôi ạ.')], 'bi_ghi'], ['Chưa bao giờ', [n('Em ngưỡng mộ quá ạ. Lớp em mà có một bạn như {ban} thì em đỡ khổ.')]])],
    again: [n({ t: 'Hôm nay em không ghi tên ai ạ, ngày vui mà.', f_bi_ghi: '{ban} bảo tuần nào cũng bị ghi tên, em kể cho các bạn đi muộn lớp em, các bạn ấy mừng lắm.' })] } },
  xoai: { then: 'youngA', tip: 'xoai', job: { id: 'job', title: 'Em đứng canh cây xoài à?', kw: ['canh cây', 'xoài', 'đứng đây'], script: [
    n('Em không canh đâu ạ, em chờ xoài rụng. Canh là việc của bác bảo vệ.'), p('Thế đã được quả nào chưa?'),
    n('Được hai quả, chua rụng răng. Nhưng em vẫn chờ, biết đâu quả sau ngọt.'),
    c('{ban} có mẹo gì không ạ?', ['Ném dép vào chùm thấp nhất', [n('Em thử rồi, dép mắc luôn trên cành. Phải rung cây mới rơi xuống ạ.')]], ['Rung cây lúc không ai để ý', [n('Chuẩn ạ! Lại gần gốc bấm E là rung được. {ban} đúng là dân có kinh nghiệm.')], 'meo_rung'])],
    again: [n({ t: 'Em vẫn chờ quả ngọt ạ. Chắc chờ đến lúc ra trường.', f_meo_rung: 'Mẹo rung cây của {ban} hiệu quả thật ạ, chỉ có điều rụng toàn quả chua.' })] } },
  ro1: { then: 'youngC', tip: 'bongro', job: { id: 'job', title: 'Đội bóng rổ của em mạnh không?', kw: ['đội bóng', 'bóng rổ', 'giải trường'], script: [
    n('Lớp em vào bán kết giải trường ạ! Thua đúng một quả ở giây cuối.'), p('Tiếc thế. Ai ném quả cuối?'),
    n('Em ạ. Trượt vành. Em mất ngủ ba đêm.'),
    c('{ban} có lời khuyên gì không ạ?', ['Ném thêm một trăm quả mỗi chiều', [n('Vâng ạ! Em sẽ ném đến khi nào nhắm mắt cũng vào.')], 'tram_qua'], ['Thua một quả thì năm sau thắng lại', [n('{ban} nói giống thầy thể dục thế ạ. Năm sau em nhất định thắng.')]])],
    again: [n({ t: 'Em đang tập ném phạt ạ, {ban} vào ném cùng không?', f_tram_qua: 'Hôm nay em ném được sáu mươi quả rồi ạ, còn bốn mươi quả nữa theo lời {ban} dặn.' })] } },
  ro2: { then: 'youngA', tip: 'cau', job: { id: 'job', title: 'Em chơi bóng rổ lâu chưa?', kw: ['bóng rổ', 'lâu chưa'], script: [
    n('Từ lớp 6 ạ. Nhưng em thấp, toàn phải chuyền cho bạn cao ném.'), p('Chuyền hay cũng quý lắm.'),
    n('Thầy cũng bảo thế ạ. Nhưng ghi điểm thì mới được các bạn nữ để ý…'),
    c('{ban} bảo em phải làm sao ạ?', ['Cứ chuyền thật đẹp, khắc có người để ý', [n('Em tin {ban} ạ. Em sẽ chuyền đẹp nhất trường.')], 'chuyen_dep'], ['Tập bật nhảy đi', [n('Em nhảy dây mỗi tối rồi ạ. Chưa cao thêm nhưng dây thì đứt hai cái.')]])],
    again: [n({ t: 'Em vừa chuyền một đường qua háng đối thủ ạ, {ban} không thấy thì tiếc quá.', f_chuyen_dep: 'Em vẫn nhớ lời {ban}: chuyền thật đẹp. Hôm nay em được khen một lần rồi ạ.' })] } },
  bong: { then: 'youngB', tip: 'bongro', job: { id: 'job', title: 'Sân cỏ này hay đá lắm à?', kw: ['sân cỏ', 'đá bóng', 'bóng đá'], script: [
    n('Chiều nào cũng đá ạ, lớp nọ thách lớp kia. Thua thì khao nước.'), p('Ngày xưa bọn anh chị đá trên sân đất, ngã là trầy hết.'),
    n('Sân đất ạ? Thế mà các {ban} vẫn đá ạ?'),
    c('Thật không ạ?', ['Đá chứ, trầy đầu gối suốt', [n('Nể thật ạ. Bọn em ngã trên cỏ đã kêu ầm lên rồi.')]], ['Đá cả chân đất nữa cơ', [n('Chân đất ạ?! Em phải kể cho đội em, chứ chúng nó đòi giày đinh mới chịu đá.')], 'chan_dat'])],
    again: [n({ t: 'Bóng ở kia ạ, {ban} lại gần bấm F là sút được.', f_chan_dat: 'Em kể chuyện {ban} đá chân đất, cả đội em im lặng một phút để tưởng tượng ạ.' })] } },
  nhay: { then: 'youngC', tip: 'cau', job: { id: 'job', title: 'Em tập nhảy xa để thi à?', kw: ['nhảy xa', 'thi cử'], script: [
    n('Vâng ạ, tuần sau kiểm tra thể dục. Em toàn giẫm vạch.'), p('Giẫm vạch thì không tính nhỉ.'),
    n('Không tính ạ. Mà em cứ chạy tới nơi là quên mất vạch ở đâu.'),
    c('{ban} ngày xưa nhảy được bao xa ạ?', ['Xa lắm, nhưng toàn ngã ngồi', [n('Giống em! Ngã ngồi thì bị đo từ chỗ mông chạm cát, thiệt lắm ạ.')]], ['Chỉ nhớ cát vào đầy giày', [n('Cái đấy thì đến giờ vẫn thế ạ. Về nhà đổ ra cả nắm cát.')], 'cat_giay'])],
    again: [n({ t: 'Em vừa nhảy được ba mét rưỡi ạ, không giẫm vạch!', f_cat_giay: '{ban} nhắc cát trong giày, em về đổ ra được hẳn một nắm thật ạ.' })] } },
  guong: { then: 'youngA', tip: 'kyniem', job: { id: 'job', title: 'Em đứng đây đợi ai à?', kw: ['đợi ai', 'đứng đây', 'gương'], script: [
    n('Em đợi bạn em ạ, bạn ấy chỉnh tóc lâu lắm.'), p('Ngày xưa làm gì có gương to thế này.'),
    n('Không có gương thì các {ban} chỉnh tóc kiểu gì ạ?'),
    c('Em tò mò thật ạ.', ['Soi vào cửa kính lớp học', [n('Ôi, bọn em thỉnh thoảng vẫn soi cửa kính ạ. Cô đi qua tưởng bọn em nhìn bảng chăm lắm.')]], ['Chẳng chỉnh gì, cứ thế mà chạy', [n('Thế mới là học sinh chứ ạ. Bạn em mà nghe được chắc ngất.')], 'khong_chinh'])],
    again: [n({ t: 'Bạn em vẫn chưa ra ạ. Em đợi quen rồi.', f_khong_chinh: 'Em kể với bạn em là ngày xưa các {ban} không cần gương, bạn ấy bảo: “thời ấy khổ thật”.' })] } },
  ba1: { then: 'youngC', tip: 'lua', job: { id: 'job', title: 'Sắp ra trường rồi, em thấy sao?', kw: ['ra trường', 'lớp 12', 'thi cử'], script: [
    n('Em vừa mong vừa sợ ạ. Mong thi xong, mà sợ không còn được mặc áo dài tới trường.'), p('Ra trường rồi mới thấy nhớ.'),
    n('Nhìn các {ban} về thăm, em tự hỏi hai mươi năm nữa lớp em có về đủ không.'),
    c('{ban} nghĩ có về đủ không ạ?', ['Chỉ cần có một đứa chịu đứng ra gọi', [n('Thế thì em sẽ làm đứa đứng ra gọi ạ. Em ghi lại số điện thoại cả lớp từ bây giờ.')], 'dung_ra_goi'], ['Không đủ đâu, nhưng vẫn vui', [n('Vâng… Thiếu thì nhắc tên, giống lớp {ban} hôm nay ạ.')]])],
    again: [n({ t: 'Em vẫn đang nghĩ chuyện hai mươi năm nữa ạ.', f_dung_ra_goi: 'Em bắt đầu ghi số điện thoại cả lớp rồi ạ, để sau này còn gọi nhau về như lớp {ban}.' })] } },
  ba2: { then: 'youngB', tip: 'cau', job: { id: 'job', title: 'Mai kiểm tra mà còn đứng đây à?', kw: ['kiểm tra', 'ôn bài', 'môn toán'], script: [
    n('Em ôn rồi ạ… ôn được cái mục lục.'), p('Mục lục thì có gì mà ôn?'),
    n('Thì để biết mình chưa học những chương nào ạ. Nhiều lắm.'),
    c('{ban} có bí kíp gì không ạ?', ['Học nhóm với đứa giỏi nhất', [n('Bạn giỏi nhất lớp em đang giận em vì em mượn vở không trả ạ.')]], ['Ngủ sớm, sáng dậy học', [n('Sáng em dậy không nổi ạ. Nhưng em sẽ thử, vì {ban} đã nói.')], 'ngu_som'])],
    again: [n({ t: 'Em ôn tới chương hai rồi ạ! Còn sáu chương nữa.', f_ngu_som: 'Em thử ngủ sớm theo lời {ban} rồi ạ. Ngủ thì được, còn dậy sớm thì chưa.' })] } },
  ba3: { then: 'youngA', tip: 'xoai', job: { id: 'job', title: 'Em vừa ở căng tin ra à?', kw: ['căng tin', 'bánh mì', 'đội bóng'], script: [
    n('Vâng ạ, mà hết bánh mì mất rồi. Em xếp hàng mười phút, tới lượt thì bạn đứng trước mua cái cuối cùng.'), p('Đau nhỉ.'),
    n('Đau hơn điểm kém ạ. Điểm kém còn gỡ được, bánh mì thì phải chờ tới mai.'),
    c('Ngày xưa {ban} có bị thế không ạ?', ['Có, nên toàn chạy từ trước khi trống đánh', [n('Chạy trước trống ạ? Thầy cô không mắng ạ? Thôi em hiểu rồi, là có mắng.')], 'chay_truoc'], ['Không, anh chị mang cơm nắm', [n('Cơm nắm muối vừng ạ? Nghe ngon thế. Mai em bảo mẹ làm thử.')]])],
    again: [n({ t: 'Mai em sẽ xếp hàng sớm hơn ạ.', f_chay_truoc: 'Em định áp dụng chiêu chạy trước trống của {ban}, nhưng lớp em ở tận tầng ba ạ.' })] } },
  chunhiem: { then: 'elderB', tip: 'trong', job: { id: 'job', title: 'Cô còn nhớ lớp em không ạ?', kw: ['nhớ lớp', 'chủ nhiệm', 'lớp em', 'cô còn nhớ'], script: [
    n({ t: 'Nhớ chứ. Lớp {lop}, khoá {khoa}. Cái lớp làm cô bạc tóc sớm nhất.', doneLesson: 'Vừa ngồi sinh hoạt với các em xong, cô nhớ lại hết. Lớp {lop} vẫn ồn y như cũ.' }), p('Bọn em nghịch thế cơ ạ?'),
    n('Nghịch, nhưng thương nhau. Có đứa ốm là cả lớp chép bài hộ, chữ mười mấy kiểu trong một quyển vở.'),
    c('Em có muốn biết ngày xưa cô phê gì trong học bạ của em không?', ['Có ạ', [n('“Thông minh, tốt bụng, cần bớt nói chuyện riêng.” Câu ấy cô phê cho gần nửa lớp, nhưng với em là cô viết thật lòng nhất.')], 'hoc_ba'], ['Thôi cô ơi, em sợ lắm', [n('Sợ gì, toàn lời tốt cả. Cô phê nghiêm thế thôi chứ lúc viết là cô cười.')]]),
    n('Đi dạy bao nhiêu năm, cô chỉ mong học trò về thăm mà còn gọi được tên nhau.')],
    again: [n({ t: 'Lớp các em hôm nay về đông, cô vui lắm. Nhớ dặn mấy đứa vắng là cô hỏi thăm.', f_hoc_ba: '“Cần bớt nói chuyện riêng” — cô thấy tới giờ em vẫn chưa sửa được đâu nhé.' })] } },
};

/**
 * Ý định khi người chơi gõ tự do (xem campus_talk_match.js). kw = từ khoá VIẾT CÓ DẤU; cls = hạng ưu tiên: 'act' lời rủ/tạm biệt · 'clear' ý rõ ràng · 'gen' chung;
 * re = câu đáp theo vai (elder | young | mate) — vai nào cũng phải có; act = hành động kèm theo; topic = [id chủ đề] chạy thay câu đáp nếu nhân vật có;
 * game = trò được nhắc (khớp với TIP.game để chạy đúng chủ đề gợi ý của trò đó).
 * Học sinh không đi theo người lớn lạ, không bàn chuyện ngoại hình/yêu đương: các câu đáp 'young' lễ phép và lái về chuyện trường lớp.
 */
export const INTENTS = [
  { id: 'bye', cls: 'act', kw: ['tạm biệt', 'chào nhé', 'đi đây', 'về đây', 'bái bai', 'bye', 'đi nhé', 'hẹn gặp lại'], act: 'bye', re: { elder: ['Ừ, đi nhé. Nhớ ghé lại chào {toi}.'], young: ['Em chào {ban} ạ!'], mate: ['Ừ, đi tiếp thôi.'] } },
  { id: 'stop', cls: 'act', kw: ['thôi nhé', 'thôi về chỗ', 'về chỗ đi', 'không cần theo', 'không cần đi cùng'], act: 'unfollow', re: { elder: ['Ừ, thế {toi} về chỗ nhé.'], young: ['Vâng ạ, em chào {ban} ạ.'], mate: ['Thôi gì mà thôi, lớp mình đi đâu cũng đi cùng nhau.'] } },
  { id: 'photo', cls: 'act', kw: ['chụp ảnh', 'chụp chung', 'chụp một kiểu', 'chụp hình', 'chụp cái ảnh', 'selfie'], act: 'photo', re: { elder: ['Chụp chứ! Đứng sát vào đây. Bấm P để lấy máy ảnh ra nhé.'], young: ['Vâng ạ! Em đứng nghiêm chỉnh đây, {ban} bấm P lấy máy ảnh ra ạ.'], mate: ['Chụp! Cả lớp vào dáng đi. Bấm P lấy máy ra.'] } },
  { id: 'follow', cls: 'act', kw: ['đi cùng', 'đi với', 'đi theo', 'dẫn đường', 'đi dạo', 'đi chơi cùng', 'dẫn cháu', 'dẫn em'], act: 'follow', re: { elder: ['Được, {toi} đi cùng một quãng. Chân {toi} chậm, đi từ từ thôi nhé.'], young: ['Em không đi được ạ, em sắp phải vào lớp rồi. {ban} nhờ bác bảo vệ dẫn đường giúp nhé.'], mate: ['Thì tôi vẫn đang đi theo {x} đây còn gì.'] } },
  { id: 'order', cls: 'clear', kw: ['gọi món', 'muốn mua', 'mua nước', 'mua xôi', 'mua bánh', 'cho cháu cái', 'cho cháu một', 'cho em cái', 'cho em một', 'cho tôi một', 'một gói', 'một cốc', 'một cái bánh', 'bao nhiêu tiền', 'giá bao nhiêu', 'bao nhiêu một', 'bán cho'], act: 'order',
    re: { elder: ['Mua bán thì ra căng tin hoặc hàng quán ngoài cổng nhé, {toi} không bán gì đâu.'], young: ['Em không bán gì ạ. {ban} ra căng tin hoặc quán ngoài cổng nhé.'], mate: ['Tôi có bán gì đâu. Ra quán ngoài cổng, tôi đi cùng.'] } },
  { id: 'name', cls: 'clear', kw: ['tên gì', 'tên là gì', 'là ai', 'bạn là ai', 'tên bác', 'tên cô', 'tên thầy', 'tên em'], re: { elder: ['Mọi người ở đây gọi {toi} là {toi} {ten}.'], young: ['Em tên là {ten} ạ.'], mate: ['Hỏi tên tôi à? {ten} đây! Bao năm không gặp là quên luôn hả?'] } },
  { id: 'age', cls: 'clear', kw: ['bao nhiêu tuổi', 'mấy tuổi', 'tuổi'], re: { elder: ['Tuổi {toi} thì đừng hỏi. Cứ biết là {toi} thấy mấy lứa học trò lớn lên rồi.'], young: ['Em đang tuổi học trò ạ, chưa tới mười tám.'], mate: ['Bằng tuổi {x} chứ mấy. Chỉ là tôi trông trẻ hơn thôi.'] } },
  { id: 'grade', cls: 'clear', kw: ['học lớp mấy', 'lớp mấy', 'học lớp nào'], re: { elder: ['{toi} thì hết tuổi ngồi lớp lâu rồi. Còn {ban}, ngày xưa học lớp nào?'], young: ['Em học ở trường mình ạ. Lớp em ở dãy nhà đằng kia.'], mate: ['Lớp {lop} chứ lớp nào. Hỏi thế mà cũng hỏi.'] } },
  { id: 'time', cls: 'clear', kw: ['mấy giờ', 'giờ rồi', 'bây giờ là mấy'], re: { elder: ['Khoảng {gio} rồi đấy.'], young: ['Khoảng {gio} ạ.'], mate: ['{gio} rồi. Ngày xưa giờ này là đang mong trống.'] } },
  { id: 'weather', cls: 'clear', kw: ['thời tiết', 'trời mưa', 'trời nắng', 'trời đẹp', 'mưa', 'nắng', 'lạnh', 'nóng', 'rét'], re: { elder: [{ t: 'Trời hôm nay đẹp, đúng trời họp lớp.', rain: 'Mưa thế này sân trơn lắm, đi cẩn thận nhé.', night: 'Tối nay trời trong, ra lửa trại ngồi là đẹp.' }], young: [{ t: 'Trời đẹp {ban} nhỉ, bọn em được ra sân cả buổi.', rain: 'Mưa to quá ạ, bọn em mất giờ thể dục rồi.', night: 'Tối nay nhiều sao lắm ạ.' }], mate: [{ t: 'Trời thế này mà ngồi trong lớp thì phí, ngày xưa tôi toàn nhìn ra cửa sổ.', rain: 'Mưa thế này ngày xưa là mừng, khỏi phải tập thể dục giữa giờ.', night: 'Tối mát thật. Lửa trại mà thêm ấm trà nữa là hết ý.' }] } },
  { id: 'sorry', cls: 'clear', kw: ['xin lỗi'], re: { elder: ['Không sao. Ở trường này lỗi gì rồi cũng được tha.'], young: ['Không sao đâu ạ!'], mate: ['Xin lỗi chuyện gì? Chuyện mượn thước không trả, hay chuyện ăn hết xôi?'] } },
  { id: 'eat', cls: 'gen', kw: ['ăn gì', 'đi ăn', 'uống nước', 'uống gì', 'đói quá', 'ăn sáng', 'ăn xôi', 'khát nước', 'khao'], re: {
    elder: [{ t: 'Đói thì ra hàng xôi, hàng trà đá ngoài cổng, hoặc căng tin trong trường. Gọi món rồi ngồi xuống là có người mang ra.', noXoi: 'Đói thì ra hàng trà đá ngoài cổng, hoặc vào căng tin trong trường. Gọi món rồi ngồi xuống là có người mang ra.' }],
    young: [{ t: 'Căng tin ở phía đông ạ, ngoài cổng thì có xôi với trà đá. {ban} gọi món rồi ngồi xuống là được ạ.', noXoi: 'Căng tin ở phía đông ạ, ngoài cổng thì có trà đá. {ban} gọi món rồi ngồi xuống là được ạ.' }],
    mate: [{ t: 'Đi! Ra cổng gọi xôi với trà đá, ngồi ghế nhựa như ngày xưa.', noXoi: 'Đi! Ra cổng làm cốc trà đá, ngồi ghế nhựa như ngày xưa.' }] } },
  { id: 'job', cls: 'gen', kw: ['làm nghề gì', 'nghề gì', 'làm gì', 'công việc', 'làm việc gì'], topic: ['job', 'viec'], re: { elder: ['Việc của {toi} thì quanh quẩn ở trường này thôi, ngày nào cũng thế mà không chán.'], young: ['Em là học sinh ạ, việc của em là đi học.'], mate: ['Vẫn đi làm kiếm cơm như mọi người thôi.'] } },
  { id: 'school', cls: 'gen', kw: ['trường mình', 'về trường', 'trường này', 'thái phiên', 'lịch sử trường', 'trường bây giờ'], topic: ['then', 'truong'], re: { elder: ['Trường mình ở 258 Đà Nẵng, bao nhiêu lứa học trò đi qua cái cổng kia rồi.'], young: ['Trường em vui lắm ạ, {ban} cứ đi một vòng là thấy.'], mate: ['Trường mình thì vẫn là trường mình thôi. 258 Đà Nẵng, nhắm mắt cũng tìm được.'] } },
  { id: 'where', cls: 'gen', kw: ['ở đâu', 'đường nào', 'đi đâu', 'chỗ nào', 'tìm đường', 'đường tới', 'đường đến', 'tìm'], re: { elder: ['{ban} muốn tìm chỗ nào? Cổng, căng tin, sân khấu, trống trường, cây xoài, sân bóng rổ, nhà xe… cứ nói tên.'], young: ['{ban} tìm chỗ nào ạ? {ban} bấm M là có bảng dịch chuyển đấy ạ.'], mate: ['Tìm đâu? Bấm M ra bảng dịch chuyển, hoặc nói tên chỗ tôi chỉ cho.'] } },
  { id: 'praise', cls: 'gen', kw: ['đẹp quá', 'xinh', 'giỏi', 'tuyệt vời', 'hay quá', 'đáng yêu', 'trẻ thế', 'đẹp thế'], re: { elder: ['Khéo nói thế. {toi} già rồi, nhưng nghe vẫn thích.'], young: ['Em cảm ơn {ban} ạ. Trường mình dịp này trang trí cũng đẹp lắm, {ban} đi một vòng xem ạ.'], mate: ['Khen thế là định vay tiền hả? Nhưng mà cảm ơn, tôi nhận.'] } },
  { id: 'tease', cls: 'gen', kw: ['béo', 'già', 'lùn', 'hói đầu', 'xấu', 'ngố', 'hâm'], re: { elder: ['Ơ hay, trêu cả {toi} à? Học trò cũ có khác, gan thật.'], young: ['Dạ… {ban} đừng trêu em ạ. {ban} hỏi em chuyện trường lớp đi ạ.'], mate: ['Này, nhìn lại mình đi đã nhé. Bụng ai to hơn bụng ai?'] } },
  { id: 'love', cls: 'gen', kw: ['người yêu', 'thích ai', 'yêu ai', 'có gấu', 'có bạn trai', 'có bạn gái', 'lấy chồng', 'lấy vợ'], re: { elder: ['Chuyện ấy thì {toi} xin không trả lời. Học trò hỏi thế là hư đấy nhé.'], young: ['Dạ, chuyện ấy em xin phép không trả lời ạ. Bọn em còn phải lo thi cử.'], mate: ['Hỏi thế là muốn khơi chuyện cũ hả? Cả lớp đang nghe đấy, cẩn thận.'] } },
  { id: 'health', cls: 'gen', kw: ['khoẻ không', 'sức khoẻ', 'có khoẻ', 'còn khoẻ', 'ốm'], re: { elder: ['{toi} vẫn khoẻ, còn đứng được cả ngày đây. Cảm ơn {ban} hỏi thăm.'], young: ['Em khoẻ ạ! Em vừa chạy ba vòng sân xong.'], mate: ['Khoẻ. Chỉ có cái lưng là hay nhắc mình không còn mười bảy.'] } },
  { id: 'remember', cls: 'gen', kw: ['nhớ không', 'còn nhớ', 'nhớ tôi', 'nhớ cháu', 'nhớ em', 'nhận ra'], re: { elder: ['Mặt thì quen lắm. {toi} nhớ dáng đi trước, tên thì từ từ {toi} nhớ ra.'], young: ['Em mới gặp {ban} hôm nay thôi ạ, nhưng em sẽ nhớ!'], mate: ['Quên sao được. {x} có thay đổi gì đâu, vẫn cái kiểu cười ấy.'] } },
  { id: 'thanks', cls: 'gen', kw: ['cảm ơn', 'cám ơn', 'thank'], re: { elder: ['Có gì đâu. Về thăm trường là {toi} vui rồi.'], young: ['Không có gì ạ!'], mate: ['Ơn huệ gì, bạn bè với nhau.'] } },
  { id: 'cau', cls: 'gen', kw: ['đá cầu', 'tâng cầu', 'quả cầu'], game: 'cau', re: { elder: ['Đá cầu thì ra cạnh sân bóng rổ, lúc nào cũng có một nhóm. Lại gần bấm E là vào vòng.'], young: ['Nhóm đá cầu ở cạnh sân bóng rổ ạ, {ban} lại gần bấm E là vào đá cùng được.'], mate: ['Ra cạnh sân bóng rổ, có bọn trẻ đang tâng cầu. Ai để rơi thì khao trà đá.'] } },
  { id: 'ro', cls: 'gen', kw: ['bóng rổ', 'ném rổ'], game: 'bongro', re: { elder: ['Sân bóng rổ ở phía tây, bóng để sẵn. Cầm bóng lên, giữ chuột trái lấy lực rồi thả ra là ném.'], young: ['Sân bóng rổ ở phía tây ạ. {ban} cầm bóng, giữ chuột trái lấy lực rồi thả ra là ném ạ.'], mate: ['Sân bóng rổ phía tây. Ném trượt thì đừng đổ tại tuổi nhé.'] } },
  { id: 'bong', cls: 'gen', kw: ['đá bóng', 'bóng đá', 'sút bóng'], re: { elder: ['Sân cỏ ở phía bắc, sau nhà C. Bóng nằm sẵn đấy, lại gần bấm F là sút.'], young: ['Sân cỏ ở phía bắc ạ, bóng có sẵn, {ban} lại gần bấm F là sút được.'], mate: ['Sân cỏ phía bắc. Sút nhẹ thôi, đầu gối mình không còn như xưa.'] } },
  { id: 'play', cls: 'gen', kw: ['chơi gì', 'trò gì', 'nhảy dây', 'chơi trò'], re: { elder: ['Ra sân mà chơi: đá cầu cạnh sân bóng rổ, ném rổ, hay tối thì ngồi lửa trại.'], young: ['{ban} ra sân đi ạ! Có đá cầu, bóng rổ, tối còn có lửa trại ạ.'], mate: ['Ra sân! Đá cầu, ném rổ, ai thua khao trà đá.'] } },
  { id: 'laugh', cls: 'gen', kw: ['haha', 'hihi', 'hehe', 'buồn cười', 'vui quá'], re: { elder: ['Cười được thế là tốt. Trường này vốn lắm tiếng cười.'], young: ['Hì, {ban} vui tính thế ạ.'], mate: ['Cười gì, kể tôi nghe với.'] } },
  { id: 'hello', cls: 'gen', kw: ['xin chào', 'chào', 'hello', 'alo', 'hi'], re: { elder: ['Chào {goi}. Hỏi gì cứ hỏi.'], young: ['Em chào {ban} ạ!'], mate: ['Chào gì nữa, chào từ sáng rồi. Nói chuyện chính đi.'] } },
];
/** các cách hỏi đường: có một trong các cụm này mà nhắc tới một chỗ ở PLACES thì chắc chắn là hỏi đường */
export const WHERE = ['ở đâu', 'đường nào', 'chỗ nào', 'đường tới', 'đường đến', 'tìm đường', 'đi tới', 'đi đến', 'tìm', 'ở chỗ nào', 'lối nào'];
/** hỏi đường: từ khoá chỗ → câu chỉ đường (có thể có biến thể theo ngữ cảnh) */
export const PLACES = [
  [['cổng trường', 'cổng'], 'Cổng trường ở phía nam, cuối con đường nhựa giữa sân.'], [['căng tin', 'căn tin'], 'Căng tin ở phía đông, cạnh nhà để xe, đi qua trống trường là thấy.'],
  [['sân khấu', 'văn nghệ'], 'Sân khấu dựng trước nhà A, phía đông sân trường, có màn hình lớn.'], [['trống trường', 'cái trống', 'trống'], 'Trống trường đặt ở hành lang đầu nhà A, gần căng tin.'],
  [['cây xoài', 'xoài'], 'Cây xoài ở ngay trước sân khấu, có bồn gạch tròn.'], [['sân bóng rổ'], 'Sân bóng rổ ở phía tây sân trường.'], [['nhà xe', 'để xe', 'nhà để xe'], 'Nhà để xe ở góc đông, sau căng tin.'],
  [['tượng đài', 'vườn hoa', 'tượng'], 'Vườn hoa với tượng đài ở phía nam, giữa hội trường và nhà thi đấu.'], [['nhà vệ sinh', 'vệ sinh', 'wc'], 'Nhà vệ sinh ở góc đông bắc, sau nhà A.'], [['lớp học', 'lớp cũ', 'phòng học'], 'Lớp học thì nhà A, B, C đều có. Lớp cũ của các bạn là phòng tầng trệt nhà A, sát trống trường.'],
  [['lửa trại'], 'Lửa trại buổi tối ở góc sân phía tây, cạnh sân bóng rổ.'], [['sân cỏ', 'sân bóng đá'], 'Sân cỏ ở phía bắc, sau nhà C.'],
  [['hàng xôi', 'sữa chua', 'trà đá', 'quán nước', 'quán'], { t: 'Hàng xôi với trà đá ngay ngoài cổng; quán sữa chua thì bên kia đường.', noXoi: 'Trà đá ngay ngoài cổng; quán sữa chua thì bên kia đường.' }],
];
export const DEFLECT = {
  elder: ['Câu này khó, {toi} chịu. Hỏi {toi} chuyện trường lớp thì {toi} biết.', '{toi} nghe chưa rõ. Hay {ban} chọn một chuyện ở dưới kia mà hỏi.', 'Ừ thì… chuyện ấy để hôm khác. Giờ nói chuyện trường mình đi.'],
  young: ['Em không biết trả lời sao ạ… {ban} hỏi chuyện khác đi ạ.', 'Câu này cô chưa dạy ạ. {ban} chọn chuyện ở dưới kia nhé.', 'Em chịu ạ! {ban} hỏi em chuyện trường thì em biết.'],
  mate: ['{x} nói gì tôi chả hiểu, y như hồi trả bài miệng. Chọn chuyện khác đi.', 'Câu này phải hỏi lớp trưởng. Còn tôi thì cứ chuyện ngày xưa mà kể.', 'Nói lại xem nào? Hay là chọn một chuyện ở dưới kia cho nhanh.'],
};
/** nhân vật trường đi cùng người chơi một quãng */
export const WALK = { secs: 60, done: { elder: 'Thôi, {toi} về chỗ đây. Đi chơi vui nhé.', young: 'Em về chỗ đây ạ. {ban} đi chơi vui nhé!' } };
