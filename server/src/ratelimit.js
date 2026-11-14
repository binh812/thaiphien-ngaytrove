// Giới hạn tần suất kiểu cửa sổ trượt. Thuần, nhận thời gian (ms) từ bên ngoài để thử được.

/**
 * rules = [[số tin tối đa, cửa sổ ms], …] — mọi luật phải cùng thoả. Ví dụ chat: [[1, 1000], [5, 10000]].
 * allow(now) trả về true và ghi nhận nếu được phép; false nếu vượt (KHÔNG ghi nhận lần bị chặn).
 */
export function createLimiter(rules) {
  const longest = Math.max(...rules.map((r) => r[1]));
  let stamps = [];
  return {
    allow(now) {
      stamps = stamps.filter((t) => now - t < longest);
      for (const [max, win] of rules) {
        let n = 0;
        for (const t of stamps) if (now - t < win) n++;
        if (n >= max) return false;
      }
      stamps.push(now);
      return true;
    },
  };
}
