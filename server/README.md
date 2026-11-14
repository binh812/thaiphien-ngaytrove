# Máy chủ phòng chơi – Thái Phiên, Ngày trở về

Một Cloudflare Worker + một lớp Durable Object `Room` (mỗi phòng một đối tượng). Người chơi nối bằng WebSocket tới
`/ws?room=<mã>`; không có `room` thì vào phòng chung `san-truong`. Chạy được trên **gói miễn phí**.

Máy chủ chỉ chuyển tiếp: tên hiển thị, ngoại hình nhân vật, vị trí/dáng, tin nhắn. Mọi thứ client gửi lên đều bị kiểm lại
(xem `src/protocol.js`, `src/room.js`).

## Riêng tư

- **Không lưu lịch sử trò chuyện, không ghi dữ liệu người chơi xuống đĩa, không ghi log nội dung hay địa chỉ IP** (log phía Cloudflare cũng tắt trong `wrangler.jsonc`).
- **Địa chỉ IP** chỉ được dùng để đếm số kết nối cùng nguồn trong một phòng (tối đa `MAX_PER_IP`, mặc định trong mã là 3, `wrangler.jsonc` đặt 8). Máy chủ không giữ IP:
  nó giữ 6 byte đầu của SHA-256(mã phòng nội bộ + IP), trong bộ nhớ và phần đính kèm của chính kết nối đó; dấu vết này mất khi kết nối
  đóng, không gửi cho ai, không so được giữa các phòng.
- Thứ duy nhất nằm trong kho của Durable Object là giờ hẹn chuông dọn phiên chết (5 phút một lần khi phòng còn người).
- Người cùng phòng thấy: tên hiển thị, nhân vật, vị trí, tin nhắn của nhau. Danh sách lớp của người chơi không bao giờ rời máy họ.

## Thử trên máy mình (không cần tài khoản)

```bash
cd server
npm install          # chỉ cài wrangler (công cụ dev); trò chơi không dùng thư viện nào thêm
npm test             # phép thử phần thuần: lọc từ, kiểm thông điệp, giới hạn tần suất
npm run dev          # máy chủ cục bộ ở ws://127.0.0.1:8788 (đã nới MAX_PER_IP lên 16 vì mọi cửa sổ thử đều chung một địa chỉ)
```

Rồi mở trò chơi kèm tham số: `http://127.0.0.1:8137/?net=ws://127.0.0.1:8788` (thêm `&room=abc123` để chọn sẵn một phòng).
Mở hai cửa sổ là thấy nhau. Kiểm thử tự động hai trình duyệt: từ thư mục gốc chạy `node tools/net_test.mjs <thư mục ảnh>`.

Tham số `?net=` **chỉ nhận máy cục bộ** (`localhost`, `127.0.0.1`, `[::1]`). Địa chỉ máy chủ thật chỉ lấy từ `SERVER_URL` trong
`src/net/config.js` — một liên kết lạ không thể kéo người chơi sang máy chủ của người khác.

## Tự deploy (bạn làm, mất chừng 5 phút)

1. Có tài khoản Cloudflare (miễn phí, không cần thẻ).
2. `cd server` rồi `npm install`.
3. `npx wrangler login` — trình duyệt mở ra, bấm cho phép.
4. Xem lại `wrangler.jsonc`, mục `ALLOWED_ORIGINS`: phải có đúng địa chỉ trang game. Hiện là `https://binh812.github.io`
   (GitHub Pages của dự án) và máy cục bộ. Trang chuyển tên miền thì sửa ở đây. Chỉ ghi phần gốc
   (`https://tên-miền`, không có đường dẫn phía sau).
5. `npx wrangler deploy`. Lệnh in ra địa chỉ dạng `https://thaiphien-room.<tên-tài-khoản>.workers.dev`.
6. Điền địa chỉ vào **một chỗ duy nhất** ở client — `src/net/config.js`:
   ```js
   export const SERVER_URL = 'wss://thaiphien-room.<tên-tài-khoản>.workers.dev';
   ```
   (đổi `https://` thành `wss://`, không có dấu `/` cuối).
7. Thử trước khi công bố: mở trò chơi từ máy chủ tĩnh trên máy mình (`http://127.0.0.1:8137/`, nguồn này đã nằm trong
   `ALLOWED_ORIGINS`) ở hai cửa sổ, chọn "Mã phòng". Lưu ý hai cửa sổ cùng mạng tính là cùng nguồn — tối đa 3 mỗi phòng.
8. Ổn rồi thì commit và đẩy lên GitHub Pages như thường lệ.
   Để `SERVER_URL` rỗng `''` thì trò chơi tắt hẳn phần mạng, chạy một mình như trước.

Cả lớp hay ngồi chung một wifi (họp lớp ở quán, ở trường)? Nâng `MAX_PER_IP` trong `wrangler.jsonc` (ví dụ `"8"`) rồi deploy lại.

Gỡ bỏ: `npx wrangler delete`.

## Giới hạn gói miễn phí (tra tài liệu Cloudflare ngày 14/11/2026)

- Durable Objects trên gói miễn phí **bắt buộc dùng kho SQLite** → `wrangler.jsonc` khai `new_sqlite_classes` (đã làm). Mã chỉ ghi vào kho giờ hẹn chuông dọn phiên (vài trăm lần ghi mỗi ngày cho một phòng mở suốt, so với hạn mức 100.000 dòng ghi/ngày).
- 100.000 yêu cầu/ngày. Mỗi lần nối = 1 yêu cầu; thông điệp WebSocket **đến** tính 20 cái = 1 yêu cầu; thông điệp đi và ping tự trả lời không tính.
  Client gửi vị trí 10 lần/giây **chỉ khi đang cử động** → một người đi liên tục một giờ ≈ 1.800 yêu cầu. Ước lượng: khoảng 50 giờ-người
  di chuyển liên tục mỗi ngày (ví dụ 16 người chơi 3 tiếng). Vượt hạn mức thì kết nối mới bị từ chối tới 0 giờ UTC (7 giờ sáng Việt Nam); trò chơi tự về chế độ một mình.
- 13.000 GB-giây thời gian chạy/ngày. Phòng dùng WebSocket Hibernation: không ai cử động hay nhắn thì đối tượng ngủ, không tính giờ.
- Vượt hạn mức gói miễn phí không phát sinh tiền, chỉ bị từ chối.

## Máy chủ kiểm những gì

| Thứ client gửi | Xử lý |
|---|---|
| Origin | phải nằm trong `ALLOWED_ORIGINS`, không thì 403 |
| mã phòng | chữ thường, số, gạch nối, 3–16 ký tự |
| số người | tối đa 16/phòng; người thứ 17 nhận `{"t":"err","code":"full"}` rồi bị đóng (mã 4001) |
| cùng nguồn | tối đa `MAX_PER_IP` (3) kết nối cùng địa chỉ mạng mỗi phòng; vượt thì nhận `{"t":"err","code":"ip"}` rồi bị đóng (mã 4003) |
| phiên chết | không chào trong 15 giây, hoặc đã chào nhưng không ping/không gửi gì quá 90 giây → bị dọn (mã 4009) khi có người mới vào hoặc khi chuông 5 phút reo |
| tên | ≤ 20 ký tự, bỏ ký tự điều khiển, lọc từ tục; rỗng → “Bạn cũ” |
| ngoại hình | chỉ giữ trường đã biết, đúng kiểu và khoảng; toàn bộ ≤ 2 KB |
| vị trí | số hữu hạn, kẹp trong phạm vi bản đồ; tốc độ ≤ 8 m/s; dáng chụp ảnh phải nằm trong danh sách 12 dáng đã biết; tên clip chỉ gồm chữ, số, gạch dưới, không trùng tên thuộc tính của Object (`constructor`, `toString`…) |
| tin nhắn | cắt còn 120 ký tự; xoá ký tự vô hình/ô trống giả/đổi chiều chữ; phải còn ít nhất một ký tự nhìn thấy được; lọc từ tục (kể cả chữ toàn góc, chữ đồng hình Cyrillic/Hy Lạp, viết rời từng chữ); tối đa 1 tin/giây và 5 tin/10 giây |
| rác | 5 thông điệp sai dạng → ngắt (4002); hơn 25 thông điệp/giây từ một kết nối → ngắt (4008); thông điệp > 4 KB bị coi là rác |
| cả phòng | hơn 240 thông điệp/giây tính chung cả phòng → phần vượt bị bỏ (không ngắt ai) |

## Giao thức (JSON, phiên bản 1)

Client → máy chủ:

- `{"t":"hello","v":1,"name":"…","look":{…}}` — bắt buộc gửi đầu tiên, đúng một lần
- `{"t":"s","p":[x,y,z],"r":hướng,"v":tốc độ,"a":0|1,"c":clip|0,"o":dáng|0}` — vị trí chân, hướng thân (rad), đang trên không, clip phụ (ngồi…), dáng chụp ảnh
- `{"t":"chat","m":"…"}` · `{"t":"emote","e":"wave"}` (cũng nhận `cheer`, `heart`, `thumb`) · chuỗi trần `ping`

Máy chủ → client:

- `{"t":"welcome","v":1,"id","name","max","peers":[{"id","name","look","s"}]}`
- `{"t":"join","id","name","look"}` · `{"t":"leave","id"}`
- `{"t":"S","l":[[id,x,y,z,r,v,a,c,o],…]}` — trạng thái gộp, phát 10 lần/giây, chỉ gồm người vừa cử động
- `{"t":"chat","id","name","m"}` (gửi cả cho người nhắn, để họ thấy bản đã lọc) · `{"t":"emote","id","e"}`
- `{"t":"err","code":"rate"|"full"|"ip"}` · chuỗi trần `pong`

## Chống phá: bật Rate Limiting của Cloudflare cho `/ws`

Trong mã đã có: tối đa 3 kết nối cùng nguồn mỗi phòng, trần 25 thông điệp/giây mỗi kết nối, trần 240 thông điệp/giây mỗi phòng.
Thứ mã **không** chặn được: một người mở liên tục kết nối tới thật nhiều mã phòng khác nhau (mỗi mã tạo một Durable Object mới,
mỗi lần nối tốn 1 yêu cầu trong hạn mức 100.000/ngày). Muốn chặn kiểu này phải giới hạn ở tầng Cloudflare, trước khi tới Worker.

Theo tài liệu Cloudflare (tra ngày 14/11/2026), quy tắc Rate Limiting của WAF được cấu hình **theo zone** (tên miền bạn đã đưa
vào Cloudflare); gói miễn phí có 1 quy tắc, đếm theo IP, chu kỳ 10 giây, thời gian chặn 10 giây, biểu thức dùng được trường Path.
Tài liệu không nói quy tắc này áp dụng cho địa chỉ `*.workers.dev` — chưa tra cứu được; tôi hiểu là cần tên miền riêng. Các bước:

1. Có một tên miền riêng đã thêm vào Cloudflare (gói miễn phí được).
2. Gắn Worker vào tên miền con, ví dụ `room.ten-mien-cua-ban.vn`: thêm vào `wrangler.jsonc`
   `"routes": [{ "pattern": "room.ten-mien-cua-ban.vn", "custom_domain": true }]` và `"workers_dev": false`
   (tắt địa chỉ `workers.dev`, nếu không kẻ phá cứ đi đường đó để né quy tắc), rồi `npx wrangler deploy`.
   (Cú pháp `routes`/`workers_dev` ghi theo trí nhớ — kiểm lại trong tài liệu Wrangler trước khi dùng.)
3. Trong bảng điều khiển Cloudflare, mở zone đó → trang **Security rules** → **Create rule** → **Rate limiting rules**.
4. Điền: **Rule name** `ws`; điều kiện **Field** = URI Path, **Operator** = equals, **Value** = `/ws`;
   **With the same characteristics** = IP; **When rate exceeds** = 20 yêu cầu trong 10 giây (một người chơi thật chỉ nối 1 lần,
   nối lại vài lần khi rớt mạng); **Then take action** = Block; **Duration** = 10 giây → **Deploy**.
5. Đổi `SERVER_URL` trong `src/net/config.js` thành `wss://room.ten-mien-cua-ban.vn` và thêm trang game vào `ALLOWED_ORIGINS` nếu chưa có.

Chưa có tên miền riêng thì chấp nhận rủi ro dưới đây.

## Rủi ro còn lại

- **Hết hạn mức ngày.** Kẻ phá mở kết nối tới vô số mã phòng ngẫu nhiên có thể tiêu hết 100.000 yêu cầu/ngày của gói miễn phí.
  Khi đó phần chơi cùng nhau ngừng tới 0 giờ UTC (7 giờ sáng Việt Nam) hôm sau. Không mất tiền, không lộ dữ liệu, và
  **chơi một mình không bị ảnh hưởng** — trò chơi là trang tĩnh, chỉ hiện "Mất kết nối" ở góc màn hình.
- **Giới hạn theo nguồn có thể chặn nhầm** người dùng chung một địa chỉ mạng (wifi quán, mạng di động dùng chung IP): người thứ tư
  cùng mạng vào cùng một phòng sẽ bị từ chối. Nâng `MAX_PER_IP` nếu gặp.
- Kiểm Origin chỉ chặn trang web khác nhúng trò chơi; chương trình tự viết vẫn giả được Origin. Vì thế mọi dữ liệu đều được kiểm ở máy chủ.
- Ai có mã phòng đều vào được; mã 6 ký tự do trò chơi tạo là ngẫu nhiên nhưng không phải mật khẩu.
- Danh sách từ tục gọn, thà sót còn hơn chặn nhầm tiếng Việt không dấu (xem `src/filter.js`, sửa danh sách rồi `npm test`, `npx wrangler deploy`).
