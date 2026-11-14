# Ghép cụm lá từ ảnh lá thật (ambientCG LeafSet022, CC0) thành thẻ lá cho tán cây.
# Ảnh ra có tông sáng trung tính (màu thật của từng loài cây do màu đỉnh nhuộm trong game).
# Dùng: python -I tools/make_leaves.py   (cần Pillow; ảnh nguồn ở .tools/dl/acg/LeafSet022)
import math, os, random
from PIL import Image, ImageEnhance, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.tools', 'dl', 'acg', 'LeafSet022')
OUT = os.path.join(ROOT, 'assets', 'tex')


def load_leaves():
    col = Image.open(os.path.join(SRC, 'LeafSet022_1K-JPG_Color.jpg')).convert('RGB')
    op = Image.open(os.path.join(SRC, 'LeafSet022_1K-JPG_Opacity.jpg')).convert('L')
    w, h = col.size
    leaves = []
    for r in range(2):
        for c in range(3):
            box = (c * w // 3, r * h // 2, (c + 1) * w // 3, (r + 1) * h // 2)
            a = op.crop(box).point(lambda v: 255 if v > 128 else 0)
            bb = a.getbbox()
            if not bb: continue
            rgb = col.crop(box).crop(bb)
            # khử gần hết sắc màu, kéo độ sáng trung bình lên ~200 để nhuộm màu được
            g = ImageOps.grayscale(rgb)
            px = [p for p, m in zip(g.getdata(), a.crop(bb).getdata()) if m]
            mean = sum(px) / len(px)
            g = g.point(lambda v, k=205.0 / mean: min(255, int(v * k)))
            tinted = Image.blend(Image.merge('RGB', (g, g, g)), ImageEnhance.Brightness(rgb).enhance(205.0 / mean), 0.25)
            leaf = tinted.convert('RGBA'); leaf.putalpha(a.crop(bb))
            leaves.append(leaf)
    return leaves


def cluster(leaves, size, n, seed):
    rnd = random.Random(seed)
    im = Image.new('RGBA', (size, size), (200, 205, 180, 0))
    items = []
    for i in range(n):
        ang = rnd.random() * math.tau
        d = 0.2 * math.sqrt(rnd.random()) * size
        items.append((d, ang, rnd.random(), rnd.random(), rnd.choice([0, 1, 2, 4, 5])))
    items.sort(key=lambda t: -t[0])                      # lá ngoài vẽ trước, lá trong đè lên
    for d, ang, r1, r2, li in items:
        leaf = leaves[li]
        length = int(size * (0.2 + 0.09 * r1))
        lw = max(4, int(leaf.width * length / leaf.height))
        l2 = leaf.resize((lw, length), Image.LANCZOS)
        l2 = ImageEnhance.Brightness(l2).enhance(0.72 + 0.4 * r2)
        # cuống lá ở đáy ảnh; xoay cho ngọn lá chĩa ra ngoài
        pad = Image.new('RGBA', (length * 2, length * 2), (0, 0, 0, 0))
        pad.alpha_composite(l2, (length - lw // 2, 0))
        rot = pad.rotate(-math.degrees(ang) - 90 + (r1 - 0.5) * 50, resample=Image.BICUBIC)
        cx, cy = size / 2 + math.cos(ang) * (d + length * 0.5), size / 2 + math.sin(ang) * (d + length * 0.5)
        im.alpha_composite(rot, (int(cx - length), int(cy - length))) if 0 <= int(cx - length) and 0 <= int(cy - length) else im.paste(rot, (int(cx - length), int(cy - length)), rot)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    leaves = load_leaves()
    cluster(leaves, 1024, 80, 5).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'leafcluster.png'), optimize=True)
    single = leaves[1].resize((int(leaves[1].width * 128 / leaves[1].height), 128), Image.LANCZOS)
    pad = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); pad.alpha_composite(single, ((128 - single.width) // 2, 0)); pad.save(os.path.join(OUT, 'leaf.png'), optimize=True)
    print('xong', len(leaves), 'lá')


main()
