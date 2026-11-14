# Tải bầu trời HDRI "puresky" (CC0) từ Poly Haven, cắt nửa trên, chuẩn hoá độ sáng và ghi manifest.
# Mã hoá: jpg = clip(L / (8 * trung bình), 0, 1) ^ (1 / 2.2)  → trong game: L = jpg^2.2 * 8 * độ sáng mong muốn.
# Dùng: python tools/fetch_skies.py   (cần opencv-python, numpy)
import json, os, urllib.request
import numpy as np
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sky')
RAW = os.path.join(ROOT, '.tools', 'dl', 'polyhaven')
UA = {'User-Agent': 'asset-fetch/1.0'}
SKIES = {
    'sunset': 'syferfontein_0d_clear_puresky',
    'golden': 'syferfontein_6d_clear_puresky',
    'low': 'syferfontein_18d_clear_puresky',
    'day': 'kloofendal_43d_clear_puresky',
    'cloudy': 'kloofendal_48d_partly_cloudy_puresky',
    'overcast': 'kloofendal_overcast_puresky',
    'misty': 'kloofendal_misty_morning_puresky',
    'night': 'qwantani_night_puresky',
}
RANGE = 8.0


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read()


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    man = {}
    for name, pid in SKIES.items():
        raw = os.path.join(RAW, pid + '_4k.hdr')
        if not os.path.exists(raw):
            files = json.loads(get('https://api.polyhaven.com/files/' + pid))
            with open(raw, 'wb') as f: f.write(get(files['hdri']['4k']['hdr']['url']))
        img = cv2.imdecode(np.fromfile(raw, dtype=np.uint8), cv2.IMREAD_UNCHANGED)   # BGR float32
        h, w = img.shape[:2]
        top = img[: h // 2].astype(np.float64)
        lum = top @ np.array([0.0722, 0.7152, 0.2126])
        # mặt trời: tâm vùng sáng nhất sau khi làm mờ
        blur = cv2.GaussianBlur(lum.astype(np.float32), (0, 0), 6)
        y, x = np.unravel_index(np.argmax(blur), blur.shape)
        peak = float(blur[y, x])
        cap = np.percentile(lum, 99.0)
        mean_l = float(np.minimum(lum, cap).mean())
        has_sun = peak > 20 * mean_l
        enc = np.clip(top / (RANGE * mean_l), 0, 1) ** (1 / 2.2)
        out8 = (enc * 255 + 0.5).astype(np.uint8)
        for width in (4096, 2048):
            im = out8 if width == w else cv2.resize(out8, (width, width // 4), interpolation=cv2.INTER_AREA)
            cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tofile(os.path.join(OUT, f'{name}_{width}.jpg'))
        mean_rgb = [float(np.minimum(top[..., c], cap).mean() / mean_l) for c in (2, 1, 0)]
        man[name] = {'id': pid, 'sunU': round((x + 0.5) / w, 4) if has_sun else None,
                     'sunEl': round(90 - (y + 0.5) / (h / 2) * 90, 2) if has_sun else None,
                     'tint': [round(v, 3) for v in mean_rgb], 'peak': round(peak / mean_l, 1)}
        print(name, man[name])
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f: json.dump(man, f, indent=1)
    with open(os.path.join(OUT, 'LICENSE.md'), 'w', encoding='utf-8') as f:
        f.write('# Bầu trời\n\nNguồn: Poly Haven (https://polyhaven.com), giấy phép CC0 1.0. Đã cắt nửa trên và chuẩn hoá độ sáng.\n\n' + '\n'.join(f'- `{k}_*`: https://polyhaven.com/a/{v}' for k, v in SKIES.items()) + '\n')
    print('tổng', round(sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1e6, 1), 'MB')


main()
