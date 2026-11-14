"""Vẽ hai hình in của áo lớp (tự vẽ, không sao chép logo thật) bằng Pillow, chạy bằng Python hệ thống.

Dùng: python -I tools/blender/make_tee_art.py <logo.png> <art.png> <R> <G> <B>
- logo (512 x 512): hình tròn viền xanh, ngọn đuốc đỏ cách điệu, chữ "THÁI PHIÊN".
- art (512 x 640): cô giáo áo dài đỏ cách điệu + dòng chữ "Tôi chưa… thấy lớp nào nghịch như cái lớp này?".
Nền cả hai là đúng màu vải áo (R G B, 0–255) để miếng in liền với thân áo.
"""
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = "C:/Windows/Fonts/"
BLUE, RED, DARK, SKIN, WHITE = (28, 78, 160), (214, 40, 46), (40, 36, 40), (250, 214, 180), (255, 255, 255)


def logo(path, cloth):
    image = Image.new("RGB", (512, 512), cloth)
    draw = ImageDraw.Draw(image)
    draw.ellipse([56, 56, 456, 456], fill=WHITE, outline=BLUE, width=26)
    draw.ellipse([104, 104, 408, 408], outline=BLUE, width=5)
    draw.polygon([(240, 300), (272, 300), (264, 372), (248, 372)], fill=BLUE)          # cán đuốc
    draw.polygon([(256, 130), (306, 226), (282, 296), (230, 296), (206, 226)], fill=RED)   # ngọn lửa
    draw.polygon([(256, 190), (280, 240), (268, 286), (244, 286), (232, 240)], fill=(255, 196, 60))
    font = ImageFont.truetype(FONT_DIR + "arialbd.ttf", 46)
    text = "THÁI PHIÊN"
    width = draw.textlength(text, font=font)
    draw.rectangle([256 - width / 2 - 14, 372, 256 + width / 2 + 14, 430], fill=BLUE)
    draw.text((256 - width / 2, 376), text, font=font, fill=WHITE)
    image.save(path)


def art(path, cloth):
    image = Image.new("RGB", (512, 640), cloth)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT_DIR + "arialbd.ttf", 38)
    for row, line in enumerate(("Tôi chưa…", "thấy lớp nào", "nghịch như", "cái lớp này?")):
        draw.text((24 + 26 * (row % 2), 18 + row * 50), line, font=font, fill=DARK)
    cx = 300                                                                             # cô giáo áo dài đỏ cách điệu
    draw.polygon([(cx - 46, 400), (cx + 46, 400), (cx + 96, 612), (cx - 96, 612)], fill=RED)        # thân áo dài
    draw.polygon([(cx - 10, 500), (cx + 10, 500), (cx + 34, 612), (cx - 34, 612)], fill=(240, 240, 235))   # quần trắng giữa hai tà
    draw.polygon([(cx - 46, 404), (cx - 110, 470), (cx - 92, 488), (cx - 40, 450)], fill=RED)       # tay trái chống nạnh
    draw.polygon([(cx + 46, 404), (cx + 118, 372), (cx + 126, 394), (cx + 44, 446)], fill=RED)      # tay phải giơ
    draw.ellipse([cx + 112, 356, cx + 142, 386], fill=SKIN)
    draw.ellipse([cx - 62, 268, cx + 62, 400], fill=SKIN)                                 # mặt
    draw.pieslice([cx - 70, 252, cx + 70, 392], 180, 360, fill=DARK)                      # tóc
    draw.ellipse([cx - 30, 226, cx + 30, 282], fill=DARK)                                 # búi tóc
    draw.ellipse([cx - 34, 330, cx - 14, 350], fill=DARK)
    draw.ellipse([cx + 14, 330, cx + 34, 350], fill=DARK)
    draw.line([(cx - 44, 318), (cx - 10, 326)], fill=DARK, width=6)                       # mày cau
    draw.line([(cx + 44, 318), (cx + 10, 326)], fill=DARK, width=6)
    draw.arc([cx - 22, 362, cx + 22, 392], 200, 340, fill=DARK, width=6)                  # miệng mếu
    draw.ellipse([cx - 60, 348, cx - 40, 364], fill=(248, 160, 150))
    draw.ellipse([cx + 40, 348, cx + 60, 364], fill=(248, 160, 150))
    image.save(path)


def main():
    cloth = tuple(int(c) for c in sys.argv[3:6])
    logo(sys.argv[1], cloth)
    art(sys.argv[2], cloth)
    print("Đã vẽ hình in áo lớp ->", sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
