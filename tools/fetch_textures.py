# Tải vật liệu quét (CC0) từ Poly Haven, thu về 3 cỡ và ghi manifest cho game.
# Dùng: python -I tools/fetch_textures.py   (chạy từ thư mục dự án; cần Pillow)
import json, os, sys, urllib.request, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tex')
RAW = os.path.join(ROOT, '.tools', 'dl', 'polyhaven')
UA = {'User-Agent': 'asset-fetch/1.0'}
# loại vật liệu trong game -> id Poly Haven; big = có thêm cỡ 2048
PICK = {
    'plaster':   ('painted_plaster_wall', True),
    'concrete':  ('concrete_wall_008', False),
    'pavers':    ('concrete_tiles_02', True),
    'brickPave': ('red_brick_pavers', True),
    'asphalt':   ('asphalt_04', True),
    'roofTile':  ('clay_roof_tiles_02', True),
    'floorTile': ('marble_tiles', False),
    'wallTile':  ('long_white_tiles', False),
    'wood':      ('wood_table_001', False),
    'bark':      ('bark_brown_02', False),
    'grass':     ('sparse_grass', False),
    'metalCorr': ('corrugated_iron_02', False),
    'sand':      ('playground_sand', False),
    'court':     ('rubberized_track', False),
    'brick':     ('red_brick_03', False),
    'granite':   ('terrazzo_tiles', False),
    'fabric':    ('cotton_jersey', False),
}
MAPS = {'col': ['Diffuse', 'diff'], 'nor': ['nor_gl'], 'arm': ['arm']}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    info = json.loads(get('https://api.polyhaven.com/assets?t=textures'))
    man = {}
    for kind, (pid, big) in PICK.items():
        files = json.loads(get('https://api.polyhaven.com/files/' + pid))
        dims = info[pid].get('dimensions') or [2000, 2000]
        entry = {'id': pid, 'meters': round(max(dims[0], dims[1]) / 1000, 3), 'sizes': [512, 1024] + ([2048] if big else [])}
        for short, keys in MAPS.items():
            key = next((k for k in keys if k in files), None)
            if not key:
                print('THIẾU', kind, pid, short, list(files.keys())); entry['missing'] = entry.get('missing', []) + [short]; continue
            res = '2k' if big else '1k'
            raw = os.path.join(RAW, f'{pid}_{short}_{res}.jpg')
            if not os.path.exists(raw):
                data = get(files[key][res]['jpg']['url'])
                with open(raw, 'wb') as f: f.write(data)
            im = Image.open(raw).convert('RGB')
            for s in entry['sizes']:
                im2 = im if im.width == s else im.resize((s, s), Image.LANCZOS)
                im2.save(os.path.join(OUT, f'{kind}_{short}_{s}.jpg'), quality=88 if short == 'nor' else 84, optimize=True)
            if short == 'col':
                px = list(im.resize((64, 64), Image.BOX).getdata())
                entry['mean'] = [round(sum(lin(p[i]) for p in px) / len(px), 4) for i in range(3)]
            if short == 'arm':
                px = list(im.resize((32, 32), Image.BOX).getdata())
                entry['rough'] = round(sum(p[1] for p in px) / len(px) / 255, 3)
        man[kind] = entry; print(kind, entry)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1)
    with open(os.path.join(OUT, 'LICENSE.md'), 'w', encoding='utf-8') as f:
        f.write('# Vật liệu quét\n\nNguồn: Poly Haven (https://polyhaven.com), giấy phép CC0 1.0.\n\n' + '\n'.join(f'- `{k}_*`: https://polyhaven.com/a/{v[0]}' for k, v in PICK.items()) + '\n')
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('tổng', round(tot / 1e6, 1), 'MB')


main()
