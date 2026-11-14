// Máy chủ phòng chơi "Thái Phiên – Ngày trở về": Worker định tuyến + lớp Durable Object "Room" cho mỗi phòng (xem room.js).
import { DurableObject } from 'cloudflare:workers';
import { roomName, originAllowed } from './protocol.js';
import { makeRoom } from './room.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('Phòng chơi Thái Phiên đang chạy.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (url.pathname !== '/ws') return new Response('Không có đường này', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Cần kết nối WebSocket', { status: 426 });
    if (!originAllowed(request.headers.get('Origin'), env.ALLOWED_ORIGINS)) return new Response('Nguồn không được phép', { status: 403 });
    const room = roomName(url.searchParams.get('room'));
    if (!room) return new Response('Mã phòng không hợp lệ', { status: 400 });
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  },
};

export class Room extends makeRoom(DurableObject) {}
