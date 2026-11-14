"""Vẽ phù hiệu ngực áo đồng phục (512 x 200 px) bằng Pillow, chạy bằng Python hệ thống (Blender không kèm Pillow).

Dùng: python -I tools/blender/make_badge.py <tệp png ra>
Phù hiệu: nền trắng viền xám nhạt, bên trái là biểu tượng cách điệu đỏ-xanh (KHÔNG phải logo thật của trường),
bên phải là dòng nhỏ "TRƯỜNG TRUNG HỌC PHỔ THÔNG" và chữ "Thái Phiên" nghiêng đậm màu xanh than.
"""
import sys

from PIL import Image, ImageDraw, ImageFont

SIZE = (512, 200)
NAVY, RED, BLUE, BORDER = (31, 42, 77), (200, 40, 45), (40, 90, 170), (176, 180, 188)
FONT_DIR = "C:/Windows/Fonts/"


def main():
    out = sys.argv[1]
    image = Image.new("RGB", SIZE, (252, 252, 250))
    draw = ImageDraw.Draw(image)
    draw.rectangle([3, 3, SIZE[0] - 4, SIZE[1] - 4], outline=NAVY, width=9)   # khung viền xanh than như tem thật
    # Biểu tượng cách điệu: quyển sách mở màu xanh, ngọn đuốc đỏ phía trên.
    draw.polygon([(40, 150), (92, 132), (144, 150), (144, 96), (92, 78), (40, 96)], fill=BLUE)
    draw.line([(92, 78), (92, 132)], fill=(252, 252, 250), width=4)
    draw.polygon([(92, 30), (112, 62), (92, 82), (72, 62)], fill=RED)
    draw.ellipse([84, 52, 100, 68], fill=(252, 222, 120))
    small = ImageFont.truetype(FONT_DIR + "arialbd.ttf", 19)
    big = ImageFont.truetype(FONT_DIR + "arialbi.ttf", 62)
    draw.text((166, 38), "TRƯỜNG TRUNG HỌC PHỔ THÔNG", font=small, fill=NAVY)
    draw.text((170, 76), "Thái Phiên", font=big, fill=NAVY)
    image.save(out)
    print("Đã vẽ phù hiệu ->", out)


if __name__ == "__main__":
    main()
