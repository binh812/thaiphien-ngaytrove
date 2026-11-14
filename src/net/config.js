// Cấu hình chơi nhiều người — MỘT chỗ duy nhất.
// Để rỗng = tắt mạng hoàn toàn: trò chơi chạy một mình y như cũ, không mở kết nối nào, không hiện mục "Chơi cùng bạn bè".
// Sau khi tự deploy máy chủ (xem server/README.md), điền địa chỉ vào đây, ví dụ:
//   export const SERVER_URL = 'wss://thaiphien-room.<tên-tài-khoản>.workers.dev';
// Đây là nguồn DUY NHẤT của địa chỉ máy chủ thật. Tham số ?net= trên thanh địa chỉ chỉ nhận máy cục bộ (xem localNetUrl ở pure.js).
import { cleanRoom, localNetUrl } from './pure.js';
export { cleanRoom };

export const SERVER_URL = '';

export const PUBLIC_ROOM = 'san-truong';      // phòng chung "sân trường"
export const PUBLIC_SHARDS = 4;               // phòng chung đầy (16 người) thì thử san-truong-2 … san-truong-4
export const MAX_NAME = 20, MAX_CHAT = 120;
export const SEND_HZ = 10;                    // số lần gửi vị trí mỗi giây (chỉ gửi khi có thay đổi)
export const INTERP_MS = 150;                 // người chơi khác được vẽ trễ chừng này để nội suy mượt

const qs = new URLSearchParams(location.search);
const rawNet = qs.get('net'), localUrl = localNetUrl(rawNet);
if (rawNet && !localUrl) console.warn('[mạng] bỏ qua tham số ?net=: chỉ nhận máy cục bộ (localhost, 127.0.0.1, [::1])');

/** thử nghiệm trên máy mình: ?net=ws://127.0.0.1:8788 — khi đó (và chỉ khi đó) ?ui=0 mới tự vào phòng và ?name= mới có tác dụng */
export const LOCAL_TEST = !!localUrl;
export const NET_URL = (localUrl || SERVER_URL).replace(/\/+$/, '');
export const NET_ON = !!NET_URL;
export const ROOM_PARAM = cleanRoom(qs.get('room'));
export const NAME_PARAM = LOCAL_TEST ? (qs.get('name') || '').slice(0, 60) : '';
