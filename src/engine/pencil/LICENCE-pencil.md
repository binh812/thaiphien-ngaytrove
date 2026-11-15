# Ghi công: kiểu vẽ "chì màu"

Mã trong thư mục này (`pencil.js`, `page.js`) phỏng theo và có chép/chỉnh sửa từ khối **Coloured pencil** của Patch:

- Nguồn: https://patch.gg/blendi/coloured-pencil (commit `0400f90`), các tệp `src/pencil.js` và `src/page.js`
  ("Written by Patch for this block").
- Giấy phép mã: **MIT**. Hình ảnh do mã vẽ ra: CC0 1.0.

Ghi chú về nguồn (kiểm ngày 15/11/2026): tệp gốc chỉ ghi "Written by Patch for this block", không có dòng bản quyền và
không ghi năm; dòng "Copyright (c) Patch (patch.gg)" trong văn bản MIT bên dưới là do dự án này suy ra từ trang nguồn,
không phải chép nguyên văn. Mã commit đầy đủ (do bên soát mã cung cấp, lấy từ trang commits của kho):
`0400f90d08ca97aae11edb41e3ff3af830acc8c7` (tải qua `git.patch.gg/blendi/coloured-pencil/raw/<hash>/…`).
Bản gốc viết cho three.js 0.186.1; ở đây chạy trên r187.

Phần lấy từ bản gốc: các hàm GLSL `pcHash`, `pcHash3`, `pcNoise`, `pcTooth`, `pcStroke`, `pcStrokes`, `pcDraw`
(nét chì theo đường đồng mức của hai "trường" trên bề mặt, mật độ theo đạo hàm màn hình, bốn lớp chì) và lượt
"trang giấy" (viền chì than từ độ sâu bằng phép thử đồng phẳng, thớ giấy, đốm giấy trắng, mép tranh mờ, màu giấy).

Phần sửa cho dự án Thái Phiên: tính hai trường ngay trong vertex shader thay cho thuộc tính đỉnh `hatch`; vá các
shader dựng sẵn của three (ShaderLib) thay vì dùng vật liệu riêng; chuẩn hoá độ sáng theo đèn HDR của dự án;
màu phẳng từ mip nhỏ nhất của ảnh quét; bầu trời vẽ; đọc bộ đệm màu + độ sâu sẵn có của pipeline.

```
MIT License

Copyright (c) Patch (patch.gg) — Coloured pencil block

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
