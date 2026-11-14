// Vật liệu độ sâu cho lượt vẽ bóng, tách theo kiểu đối tượng.
// three.js dùng MỘT MeshDepthMaterial chung cho mọi vật đổ bóng; vật liệu đó đổi qua lại giữa lưới thường, lưới instanced, lưới có xương và
// lưới có morph (số morph khác nhau) nên mỗi đối tượng lại buộc tính lại tham số chương trình (getParameters/getProgram) — đo được hơn 170 lần mỗi khung ở cổng trường.
// Ở đây mỗi kiểu có một vật liệu riêng (cùng cấu hình RGBA như mặc định của three) nên chương trình không bao giờ đổi giữa các đối tượng liền nhau.
// Vật liệu cần biến thể riêng của three (alpha, dịch chuyển, cắt) vẫn đi đường mặc định.
import * as THREE from 'three';

const cache = new Map();
let installed = false;

function variant(key) {
  let m = cache.get(key);
  if (!m) { m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); m.name = 'depth_v' + key; cache.set(key, m); }
  return m;
}

export function installDepthVariants() {
  if (installed) return; installed = true;
  Object.defineProperty(THREE.Object3D.prototype, 'customDepthMaterial', {
    configurable: true,
    get() {
      if (this.isMesh !== true) return undefined;
      const m = this.material;
      if (!m || Array.isArray(m)) return undefined;
      if (m.alphaToCoverage === true || m.alphaTest > 0 || (m.displacementMap && m.displacementScale !== 0) || (m.clippingPlanes && m.clippingPlanes.length)) return undefined;
      const g = this.geometry, ma = g.morphAttributes;
      const key = (this.isSkinnedMesh ? 1 : 0) | (this.isInstancedMesh ? 2 : 0) | (this.isInstancedMesh && this.instanceColor !== null ? 4 : 0) | (ma.normal ? 8 : 0) | (ma.color ? 16 : 0) | ((ma.position ? ma.position.length : 0) << 5);
      return variant(key);
    },
    set(v) { if (v === undefined) return; /* hàm dựng Object3D gán undefined: để getter vẫn hoạt động */ Object.defineProperty(this, 'customDepthMaterial', { value: v, writable: true, configurable: true, enumerable: true }); },
  });
}
