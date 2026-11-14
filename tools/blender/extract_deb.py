"""Giải nén tệp .deb (ar + data.tar.*) bằng Python thuần, không cần dpkg.

Dùng: <python của Blender> -I tools/blender/extract_deb.py <tệp.deb> <thư mục đích>
"""
import io
import sys
import tarfile


def ar_members(path):
    with open(path, "rb") as f:
        if f.read(8) != b"!<arch>\n":
            raise ValueError("Không phải tệp ar: " + path)
        while True:
            head = f.read(60)
            if len(head) < 60:
                return
            name = head[:16].decode().strip().rstrip("/")
            size = int(head[48:58].decode().strip())
            pos = f.tell()
            yield name, pos, size
            f.seek(pos + size + (size % 2))


def main():
    deb, dest = sys.argv[1], sys.argv[2]
    for name, pos, size in ar_members(deb):
        if not name.startswith("data.tar"):
            continue
        with open(deb, "rb") as f:
            f.seek(pos)
            blob = io.BytesIO(f.read(size))
        mode = "r:*"
        if name.endswith(".zst"):
            # Python của Blender có sẵn mô-đun zstandard; Python 3.12 hệ thống thì không.
            import zstandard

            blob = zstandard.ZstdDecompressor().stream_reader(blob)
            mode = "r|"
        with tarfile.open(fileobj=blob, mode=mode) as tar:
            tar.extractall(dest, filter="data")
        print("Đã giải nén", name, "->", dest)
        return
    raise ValueError("Không thấy data.tar trong " + deb)


if __name__ == "__main__":
    main()
