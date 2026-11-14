# Nguồn và giấy phép — assets/people

Các tệp `.glb` trong thư mục này được dựng bằng script trong `tools/blender/` từ những nguồn sau.

## Lưới người, bộ xương, da, tóc, mắt, răng, lông mày, lông mi, quần áo, giày

| Nhóm | Tài nguyên đã dùng | Nguồn | Giấy phép |
|---|---|---|---|
| Lưới gốc, target hình thể, bộ xương `mixamo` và trọng số | dữ liệu kèm MPFB2 v2.0.18 (`data/3dobjs`, `data/targets`, `data/rigs/standard`) | https://github.com/makehumancommunity/mpfb2 (thẻ `v2.0.18`) | Tài nguyên: CC0 1.0 (`LICENSE.ASSETS.md` của MPFB2). Mã MPFB2: GPL-3.0-or-later — chỉ dùng làm công cụ, không phân phối kèm game |
| Da | `young_asian_male`, `young_asian_female`, `middleage_asian_male`, `middleage_asian_female` | MakeHuman Community 1.3.0 | CC0 1.0 |
| Tóc | `short01`, `short02`, `short04`, `long01`, `ponytail01`, `bob02` | MakeHuman Community 1.3.0 | CC0 1.0 |
| Mắt, răng, lông mày, lông mi | `eyes/low-poly` + `brown`, `teeth_base`, `eyebrow001/002/005`, `eyelashes01` | MakeHuman Community 1.3.0 | CC0 1.0 |
| Quần áo | `male_casualsuit03`, `male_casualsuit04`, `male_casualsuit05`, `male_elegantsuit01`, `female_casualsuit01`, `female_elegantsuit01` | MakeHuman Community 1.3.0 | CC0 1.0 |
| Giày | `shoes01`, `shoes03`, `shoes05`, `shoes06` | MakeHuman Community 1.3.0 | CC0 1.0 |
| Bộ áo dài (`top`, `bottom`, `shoes` của `f_aodai.glb`) | dựng theo thủ tục: thân áo, quần, giày vải từ lưới trợ giúp `helper-tights` của lưới gốc MakeHuman; hai tà, nẹp khuy, xương tà là hình tự dựng; kết cấu lụa (màu + normal map) tự sinh bằng numpy (`tools/blender/people_aodai.py`, `people_textures.py`) | lưới gốc trong MPFB2 + tự tạo | CC0 1.0 |
| Áo đồng phục (`top` của `f_white.glb`, `m_white.glb`) | dựng theo thủ tục từ lưới trợ giúp `helper-tights` (`tools/blender/people_uniform.py`); atlas kết cấu tự vẽ. Phù hiệu vẽ bằng Pillow (`tools/blender/make_badge.py`): chữ "Thái Phiên" dựng bằng phông Arial của Windows, biểu tượng là hình cách điệu tự vẽ, KHÔNG phải logo thật của trường | lưới gốc trong MPFB2 + tự tạo | CC0 1.0 (phần tự tạo); tên trường thuộc về nhà trường |
| `f_aodai_teacher.glb` | cùng cách dựng với bộ áo dài, kiểu "teacher" (dáng suông, tay loe, vải thêu hoa tự sinh bằng numpy) | lưới gốc trong MPFB2 + tự tạo | CC0 1.0 |
| Shape key khuôn mặt và biểu cảm (`face_1..6`, `age_teen`, `age_old`, `smile`, `brow_up`) cùng nét mặt/vóc người gốc | tổ hợp các target chi tiết và đơn vị biểu cảm của MakeHuman trong `data/targets/` (head, forehead, eyes, nose, mouth, chin, cheek, ears, neck, torso, arms, hands, feet, legs, hip, buttocks, stomach, expression/units/asian) kèm MPFB2 (`tools/blender/people_faces.py`) | MPFB2 v2.0.18 | CC0 1.0 |

Tài nguyên MakeHuman Community 1.3.0 lấy từ gói nguồn trên PPA chính thức của dự án:
`https://ppa.launchpadcontent.net/makehuman-official/makehuman-community/ubuntu/pool/main/m/makehuman-community/makehuman-community_1.3.0+20240427162744.orig.tar.gz`
(cùng nội dung với gói "makehuman_system_assets" trên https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html).
Tệp `makehuman/license.txt` trong gói ghi: tài nguyên (lưới gốc, proxy, target, kết cấu, quần áo, tư thế) phát hành theo
CC0 1.0 Universal; từng tệp `.mhmat` cũng ghi "explicitly released as CC0 in september 2020"
(bản quyền lúc phát hành: Data Collection AB, Joel Palmius, Jonas Hauquier).

Không dùng tài nguyên CC-BY nào.

## Hoạt hoạ — `anims.glb`

| Clip | Nguồn chuyển động | Ghi chú giấy phép |
|---|---|---|
| `idle`, `walk`, `run`, `agree`, `headShake` | `examples/models/gltf/Xbot.glb` trong kho https://github.com/mrdoob/three.js (nhánh `dev`), chuyển sang bộ xương của bộ người này bằng `tools/blender/make_anims.py` | Kho three.js theo giấy phép MIT. Chuyển động gốc là của Mixamo (Adobe); Xbot.glb KHÔNG phải CC0. Điều khoản Mixamo cho dùng miễn phí bản quyền trong sản phẩm, kể cả thương mại, nhưng không cho phân phối lại dữ liệu chuyển động như một kho tài nguyên độc lập. Nếu cần toàn bộ là CC0 thì bỏ `anims.glb` và dùng hoạt hoạ thủ tục. |

Chỉ dữ liệu chuyển động (phép quay xương) được lấy từ Xbot; lưới và kết cấu của Xbot không có trong thư mục này.

## Hoạt hoạ giấy phép mở — `anims.glb` (và bản sao `anims_cc0.glb`), dáng chụp ảnh `poses.glb`

| Clip | Nguồn chuyển động | Giấy phép |
|---|---|---|
| `sprint`, `walk_formal`, `talk`, `sit_idle`, `sit_talk`, `sit_down`, `stand_up`, `interact`, `pick_up` | Quaternius, "Universal Animation Library" bản Standard (`UAL1_Standard.glb`), trang gốc https://quaternius.com/packs/universalanimationlibrary.html, tải miễn phí qua https://quaternius.itch.io/universal-animation-library; chuyển sang bộ xương của bộ người này bằng `tools/blender/make_anims.py --set cc0` | CC0 1.0 (tệp `License.txt` trong gói ghi "CC0 1.0 Universal (CC0 1.0) Public Domain Dedication") |
| `walk`, `run`, `walk_f` | CMU Graphics Lab Motion Capture Database (http://mocap.cs.cmu.edu), các clip 07_01 (walk), 35_17 (run/jog), 07_04 (slow walk); bản BVH do Bruce Hahne (cgspeed) chuyển, lấy từ https://github.com/una-dinosauria/cmu-mocap; cắt một chu kỳ, khâu kín, chuyển sang bộ xương của bộ người này | Điều khoản trên trang CMU: "The motion capture data may be copied, modified, or redistributed without permission." Ghi công theo đề nghị của CMU: "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." |
| `idle`, `agree`, `headShake` | tự tạo bằng mã (dáng đứng buông tay + nhịp thở, gật/lắc đầu) | CC0 1.0 |

Tư thế ngón tay và cổ tay là tự tạo bằng mã. `poses.glb` (24 clip `pose_*`) tự tạo hoàn toàn bằng mã (`tools/blender/make_poses.py`), CC0 1.0.

Bản hoạt hoạ Mixamo cũ (mục dưới) không còn nằm trong thư mục này; bản lưu ở `.tools/build/anims_mixamo.glb`.

## Công cụ (không nằm trong sản phẩm)

- Blender 4.5.16 LTS (GPL), bản zip portable trong `.tools/blender/`.
- MPFB2 v2.0.18 (mã GPL-3.0-or-later).

## Vòng 14 (khuôn mặt, tóc, kính, áo lớp)

- Tóc `hair_*`: lưới và kết cấu tóc CC0 của MakeHuman (bob01, bob02, braid01, long01, ponytail01, short01, short02, short03), đã chỉnh hình và xám hoá bằng script;
  riêng `crew` và `shaved` là lưới vỏ + atlas sợi tóc tự dựng bằng script.
- Kính `glasses_*`, chân váy, áo phông lớp, cổ áo: lưới dựng theo thủ tục bằng script trong `tools/blender/` (tự tạo).
- Kết cấu tự vẽ bằng script: atlas sợi tóc, kết cấu mắt, bộ kết cấu `head` (màu vẽ thêm trên nền ảnh da CC0 của MakeHuman,
  normal, AO-nhám), bảng màu kính, atlas áo phông lớp (logo tròn "THÁI PHIÊN" và hình cô giáo áo dài đỏ là hình tự vẽ cách điệu,
  không sao chép logo hay hình in thật).
- Không dùng ảnh người thật nào làm kết cấu; ảnh mẫu chỉ để tham khảo kiểu dáng chung.
- Da, mắt, răng, lông mày, lông mi, giày, quần: tài nguyên CC0 của MakeHuman như các vòng trước.

## Thử nghiệm đầu chiếu từ bản vẽ (14/11/2026) — chỉ tệp `m_wardrobe_ai.glb` và `f_wardrobe_ai.glb`

- Kết cấu da đầu–cổ (vật liệu `head` và phần atlas `body` thuộc lưới `skin_head`) được chiếu từ một bản vẽ ba góc (trước, nghiêng, sau)
  do công cụ AI tạo sinh vẽ theo mô tả nhân vật HƯ CẤU (một đàn ông và một phụ nữ Việt khoảng 42 tuổi, mỗi người một bản vẽ); không dựa trên ảnh hay danh tính người thật nào.
  Bản vẽ nguồn và cấu hình: `tools/blender/ai_heads/` (không nằm trong sản phẩm); script: `tools/blender/project_head.py`.
- Lưới, xương, tên morph và các kết cấu khác lấy từ `m_wardrobe.glb` / `f_wardrobe.glb` (MakeHuman CC0 + tự dựng như các vòng trước). Chỉnh bằng script:
  đỉnh vùng mặt dịch tối đa 5 mm, môi khép thêm 0,6 mm, hàm răng thu ngang 12%, tóc theo morph `age_teen`, lông mày giảm độ đục còn 45%,
  kết cấu mắt thêm bóng mi, normal/ORM của `head` làm phẳng sát ranh với `body`.
- Mặt thêm (14/11/2026): thư mục `heads/m2/`, `heads/f2/` (kết cấu `head.jpg`, `body.jpg`, `head_n.jpg`) và morph `head_2` trong hai tệp `*_wardrobe_ai.glb`
  được làm cùng cách, từ hai bản vẽ ba góc khác cũng do công cụ AI tạo sinh vẽ theo mô tả nhân vật HƯ CẤU (nam khoảng 28 tuổi, nữ khoảng 27 tuổi);
  không dựa trên ảnh hay danh tính người thật nào. Bản vẽ nguồn: `tools/blender/ai_heads/m2_head_sheet.png`, `f2_head_sheet.png`; đóng gói: `tools/blender/pack_head.py`.
