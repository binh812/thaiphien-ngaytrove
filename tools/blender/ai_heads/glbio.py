"""Đọc/ghi tệp .glb ở mức nhị phân (không qua Blender) để thay kết cấu và toạ độ đỉnh mà giữ nguyên mọi cấu trúc khác."""
import json
import struct

import numpy as np

_DTYPE = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class Glb:
    def __init__(self, path: str):
        with open(path, "rb") as f:
            data = f.read()
        magic, _version, _length = struct.unpack("<III", data[:12])
        if magic != 0x46546C67:
            raise ValueError("Không phải tệp glb: %s" % path)
        json_len = struct.unpack("<I", data[12:16])[0]
        self.json = json.loads(data[20:20 + json_len])
        start = 20 + json_len
        bin_len = struct.unpack("<I", data[start:start + 4])[0]
        self.bin = bytearray(data[start + 8:start + 8 + bin_len])
        self.new_images = {}      # chỉ số ảnh -> (bytes, mime)

    def _view_array(self, view_index: int, byte_offset: int, component: int, count: int) -> np.ndarray:
        view = self.json["bufferViews"][view_index]
        start = view.get("byteOffset", 0) + byte_offset                # sao ra mảng riêng: không giữ tham chiếu vào self.bin (để còn nối thêm dữ liệu)
        return np.frombuffer(bytes(self.bin[start:start + count * np.dtype(_DTYPE[component]).itemsize]), dtype=_DTYPE[component], count=count)

    def accessor(self, index: int) -> np.ndarray:
        """Đọc một accessor (kể cả loại thưa `sparse` mà Blender dùng cho morph target). Kết quả loại thưa là bản sao."""
        acc = self.json["accessors"][index]
        width = _WIDTH[acc["type"]]
        if "bufferView" in acc:
            view = self.json["bufferViews"][acc["bufferView"]]
            if "byteStride" in view and view["byteStride"] not in (0, np.dtype(_DTYPE[acc["componentType"]]).itemsize * width):
                raise ValueError("accessor xen kẽ (byteStride) chưa hỗ trợ")
            array = self._view_array(acc["bufferView"], acc.get("byteOffset", 0), acc["componentType"], acc["count"] * width)
        else:
            array = np.zeros(acc["count"] * width, dtype=_DTYPE[acc["componentType"]])
        if "sparse" in acc:
            sparse = acc["sparse"]
            array = array.copy().reshape(acc["count"], width)
            rows = self._view_array(sparse["indices"]["bufferView"], sparse["indices"].get("byteOffset", 0), sparse["indices"]["componentType"], sparse["count"])
            values = self._view_array(sparse["values"]["bufferView"], sparse["values"].get("byteOffset", 0), acc["componentType"], sparse["count"] * width)
            array[rows.astype(np.int64)] = values.reshape(sparse["count"], width)
            return array if width > 1 else array[:, 0]
        return array.reshape(acc["count"], width) if width > 1 else array

    def make_dense(self, index: int, values: np.ndarray) -> None:
        """Thay dữ liệu của một accessor bằng mảng đặc mới (nối vào cuối buffer, bỏ phần `sparse`): dùng để ghi morph target."""
        acc = self.json["accessors"][index]
        stored = np.ascontiguousarray(values, dtype=_DTYPE[acc["componentType"]])
        if stored.shape != (acc["count"], _WIDTH[acc["type"]]):
            raise ValueError("Sai kích thước khi ghi accessor %d" % index)
        while len(self.bin) % 4:
            self.bin.append(0)
        self.json["bufferViews"].append({"buffer": 0, "byteOffset": len(self.bin), "byteLength": stored.nbytes})
        self.bin += stored.tobytes()
        acc.pop("sparse", None)
        acc["bufferView"], acc["byteOffset"] = len(self.json["bufferViews"]) - 1, 0
        acc["min"], acc["max"] = [float(v) for v in stored.min(axis=0)], [float(v) for v in stored.max(axis=0)]

    def add_accessor(self, values: np.ndarray) -> int:
        """Thêm một accessor VEC3 float32 mới; mảng toàn 0 thì không cần dữ liệu (accessor không bufferView = toàn 0 theo chuẩn glTF)."""
        stored = np.ascontiguousarray(values, dtype=np.float32)
        self.json["accessors"].append({"componentType": 5126, "count": int(stored.shape[0]), "type": "VEC3"})
        index = len(self.json["accessors"]) - 1
        if np.abs(stored).max() > 0:
            self.make_dense(index, stored)
        return index

    def morph_accessor(self, mesh: dict, primitive: dict, name: str, attribute: str = "POSITION") -> int:
        return primitive["targets"][mesh["extras"]["targetNames"].index(name)][attribute]

    def write_accessor(self, index: int, values: np.ndarray) -> None:
        acc = self.json["accessors"][index]
        view = self.json["bufferViews"][acc["bufferView"]]
        offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        stored = np.ascontiguousarray(values, dtype=_DTYPE[acc["componentType"]])
        if stored.size != acc["count"] * _WIDTH[acc["type"]]:
            raise ValueError("Sai kích thước khi ghi accessor %d: %d giá trị, cần %d" % (index, stored.size, acc["count"] * _WIDTH[acc["type"]]))
        raw = stored.tobytes()
        self.bin[offset:offset + len(raw)] = raw
        if "min" in acc and acc["type"] == "VEC3":
            acc["min"], acc["max"] = [float(v) for v in stored.min(axis=0)], [float(v) for v in stored.max(axis=0)]

    def mesh(self, name: str) -> dict:
        for mesh in self.json["meshes"]:
            if mesh["name"] == name:
                return mesh
        raise KeyError(name)

    def material_name(self, primitive: dict) -> str:
        return self.json["materials"][primitive["material"]]["name"]

    def image_bytes(self, index: int) -> bytes:
        view = self.json["bufferViews"][self.json["images"][index]["bufferView"]]
        offset = view.get("byteOffset", 0)
        return bytes(self.bin[offset:offset + view["byteLength"]])

    def material_image(self, material: str, slot: str = "baseColorTexture") -> int:
        for mat in self.json["materials"]:
            if mat["name"] == material:
                info = mat["pbrMetallicRoughness"].get(slot) or mat.get(slot)
                return self.json["textures"][info["index"]]["source"]
        raise KeyError(material)

    def replace_image(self, index: int, data: bytes, mime: str = "image/jpeg") -> None:
        self.new_images[index] = (data, mime)

    def save(self, path: str) -> None:
        """Dựng lại toàn bộ buffer theo từng bufferView (ảnh thay thế chèn vào đúng chỗ ảnh cũ). Chỉ gọi MỘT lần: sau khi ghi,
        byteOffset trong self.json đã đổi nên đối tượng này không còn đọc/ghi lại được."""
        if getattr(self, "_saved", False):
            raise RuntimeError("Glb.save chỉ được gọi một lần cho mỗi đối tượng")
        self._saved = True
        out = bytearray()
        image_views = {image["bufferView"]: i for i, image in enumerate(self.json["images"])}
        for index, view in enumerate(self.json["bufferViews"]):
            offset = view.get("byteOffset", 0)
            chunk = bytes(self.bin[offset:offset + view["byteLength"]])
            if index in image_views and image_views[index] in self.new_images:
                chunk, mime = self.new_images[image_views[index]]
                self.json["images"][image_views[index]]["mimeType"] = mime
            while len(out) % 4:
                out.append(0)
            view["byteOffset"], view["byteLength"] = len(out), len(chunk)
            out += chunk
        while len(out) % 4:
            out.append(0)
        self.json["buffers"][0]["byteLength"] = len(out)
        text = json.dumps(self.json, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        text += b" " * (-len(text) % 4)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, 28 + len(text) + len(out)))
            f.write(struct.pack("<II", len(text), 0x4E4F534A) + text)
            f.write(struct.pack("<II", len(out), 0x004E4942) + bytes(out))
