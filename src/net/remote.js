// Người chơi khác trong phòng: dựng bằng đúng hệ nhân vật của trò chơi (buildHuman/animateHuman như nhân vật phụ ở people.js),
// nội suy vị trí có đệm, bảng tên và chữ chat nổi trên đầu. Ở mức đồ hoạ thấp chỉ vài người gần nhất được dựng đầy đủ;
// người ở xa hơn hiện bằng khối đơn giản, ngoài tầm nhìn thì ẩn hẳn. Phần tính toán thuần nằm ở pure.js (có phép thử).
import * as THREE from 'three';
import { QNAME } from '../engine/util.js';
import { buildHuman, animateHuman } from '../game/human.js';
import { shadowLod, viewCone, SHADOW_NEAR, SHADOW_PHOTO, CULL_FROM } from '../game/people.js';
import { INTERP_MS, MAX_NAME } from './config.js';
import { safeLook, snapOf, turn, sample, pushSnap, planLod } from './pure.js';

const MAX_FULL = { low: 5, medium: 8, high: 15, ultra: 15 }[QNAME] ?? 5;      // số người dựng mô hình đầy đủ cùng lúc
const RANGE = QNAME === 'low' ? 45 : 80;                                       // m: xa hơn thì ẩn hẳn
const TAG_RANGE = 32, BUBBLE_S = 5, EMOTE_S = 2.5, LOD_EVERY = 0.5, POSE_NEAR = 9;
const EMOTE_ICON = { wave: '👋', cheer: '🙌', heart: '💛', thumb: '👍' };

const safeName = (s) => Array.from(String(s ?? '')).slice(0, MAX_NAME).join('') || 'Bạn cũ';
/**
 * Clip/dáng người khác gửi tới chỉ được dùng khi mô hình THỰC SỰ có clip đó (tra bằng Object.hasOwn — tên như "constructor" hay
 * "toString" không phải clip và từng làm hỏng hoạt hoạ); lạ thì coi như đứng yên. Mô hình chưa nạp xong thì chưa tạo dáng.
 */
function knownClip(h, name) {
  const clips = h.rig && h.rig.clips;
  if (/^(idle_|jump_)/.test(String(name))) return null;      // clip nội bộ của gait.js (đứng nghỉ, nhảy): phát qua đường tạo dáng sẽ dừng hẳn action dùng chung
  return !!name && !!clips && (Object.hasOwn(clips, name) || Object.hasOwn(clips, name + '_f')) ? name : null;
}
const knownPose = (h, id) => (id && knownClip(h, 'pose_' + id) ? id : null);

/**
 * ctx: ngữ cảnh trò chơi; isHidden(id, name): người này có đang bị người chơi ẩn không.
 * Trả về { reset(peers), join(p), leave(id), states(list, myId), say(id, text), emote(id, e), count(), list(), name(id), refresh() }.
 */
export function createRemotes(ctx, isHidden) {
  const { scene, camera, player } = ctx, recs = new Map();
  const layer = document.createElement('div'); layer.id = 'netLayer'; document.body.appendChild(layer);
  const v = new THREE.Vector3(), fw = new THREE.Vector3();
  let stubGeo = null, stubMat = null, lodT = 0, clock = 0;
  const hid = (rec) => isHidden(rec.id, rec.name);

  function add(p) {
    const id = String(p.id);
    if (recs.has(id)) remove(id);
    const rec = { id, name: safeName(p.name), look: safeLook(p.look), snaps: [], cur: null, h: null, stub: null, rot: 0, mode: 'off', modeAt: -1e9, builds: 0, bubT: 0, emote: null, emoteT: 0, dist: 1e9 };
    rec.tag = document.createElement('div'); rec.tag.className = 'ntTag'; rec.tag.textContent = rec.name; rec.tag.style.display = 'none';
    rec.bub = document.createElement('div'); rec.bub.className = 'ntBub'; rec.bub.style.display = 'none';
    layer.append(rec.tag, rec.bub);
    const s = snapOf(p.s, performance.now()); if (s) { rec.snaps.push(s); rec.rot = s.r; }
    recs.set(id, rec); lodT = LOD_EVERY;
    return rec;
  }
  function unbuild(rec) {
    if (rec.h) { scene.remove(rec.h.g); rec.h.dispose(); rec.h = null; }
    if (rec.stub) { scene.remove(rec.stub); rec.stub = null; }
  }
  function remove(id) { const rec = recs.get(id); if (!rec) return; unbuild(rec); rec.tag.remove(); rec.bub.remove(); recs.delete(id); }

  function setMode(rec, mode) {
    if (rec.mode === mode) return; rec.mode = mode; rec.modeAt = clock; unbuild(rec);
    if (mode === 'full') { rec.h = buildHuman(rec.look); rec.builds++; scene.add(rec.h.g); }
    else if (mode === 'stub') {
      if (!stubGeo) { stubGeo = new THREE.CapsuleGeometry(0.2, 1.1, 3, 8); stubMat = new THREE.MeshStandardMaterial({ color: 0x8fa3b8, roughness: 0.9 }); }
      rec.stub = new THREE.Mesh(stubGeo, stubMat); rec.stub.userData.noBake = true; scene.add(rec.stub);
    }
  }
  /** chọn ai được dựng đầy đủ (planLod ở pure.js, có trễ để không dựng/huỷ liên tục ở ranh giới); chạy 2 lần/giây */
  function lod() {
    const arr = [...recs.values()];
    for (const r of arr) r.dist = r.cur ? Math.hypot(r.cur.x - camera.position.x, r.cur.y - camera.position.y, r.cur.z - camera.position.z) : null;
    const plan = planLod(arr.map((r) => ({ id: r.id, dist: r.dist, mode: r.mode, age: clock - r.modeAt, hidden: hid(r) })), MAX_FULL, RANGE);
    for (const r of arr) setMode(r, plan.get(r.id) || 'off');
  }
  function place(el, x, y, z) {
    v.set(x, y, z).project(camera);
    if (v.z >= 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { el.style.display = 'none'; return false; }
    el.style.display = ''; el.style.transform = `translate(-50%,-100%) translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - v.y) / 2 * innerHeight).toFixed(1)}px)`;
    return true;
  }

  function update(dt) {
    clock += dt; lodT += dt;
    const rt = performance.now() - INTERP_MS, cam = camera.position, photo = player.st.photo;
    for (const rec of recs.values()) rec.cur = sample(rec.snaps, rt) || rec.cur;
    if (lodT >= LOD_EVERY) { lodT = 0; lod(); }
    const cosCone = viewCone(camera), shadowR = photo ? SHADOW_PHOTO : SHADOW_NEAR; camera.getWorldDirection(fw);
    for (const rec of recs.values()) {
      const c = rec.cur;
      if (rec.bubT > 0 && (rec.bubT -= dt) <= 0) rec.bub.style.display = 'none';
      if (rec.emoteT > 0 && (rec.emoteT -= dt) <= 0) rec.emote = null;
      if (!c || rec.mode === 'off') { rec.tag.style.display = 'none'; rec.bub.style.display = 'none'; continue; }
      const dc = Math.hypot(c.x - cam.x, c.y + 0.9 - cam.y, c.z - cam.z);
      const seen = dc < CULL_FROM || ((c.x - cam.x) * fw.x + (c.y + 0.9 - cam.y) * fw.y + (c.z - cam.z) * fw.z) / dc > cosCone;
      const clip = rec.h ? knownClip(rec.h, c.c) : null, pose = rec.h ? knownPose(rec.h, c.o || rec.emote) : null;
      // chụp ảnh chung: mình đang ở chế độ chụp ảnh và bạn đang tạo dáng gần máy ảnh → bạn quay về ống kính của mình
      const toLens = photo && pose && !clip && dc < POSE_NEAR;
      rec.rot = toLens ? turn(rec.rot, Math.atan2(cam.x - c.x, cam.z - c.z), Math.min(1, dt * 6)) : turn(rec.rot, c.r, Math.min(1, dt * 12));
      if (rec.h) {
        const h = rec.h; h.g.visible = seen;
        if (seen) {
          h.g.position.set(c.x, c.y, c.z); h.g.rotation.y = rec.rot;
          h.clip = clip; h.pose = pose; h.smile = pose ? 0.7 : null; h.lookAt = toLens ? cam : null;
          shadowLod(h, dc < shadowR);
          animateHuman(h, c.v, dt, c.a, false, clock + h.phase);
        }
      } else if (rec.stub) { rec.stub.visible = seen; rec.stub.position.set(c.x, c.y + 0.75, c.z); }
      // bảng tên + chữ nổi (ẩn ở chế độ chụp ảnh bằng CSS)
      const top = c.y + (rec.look.height || 1.68) + (clip && /^sit/.test(clip) ? -0.4 : 0.14);
      if (!seen || dc > TAG_RANGE || !place(rec.tag, c.x, top, c.z)) { rec.tag.style.display = 'none'; rec.bub.style.display = 'none'; continue; }
      if (rec.bubT > 0) place(rec.bub, c.x, top + 0.2 + dc * 0.012, c.z);
    }
  }
  ctx.updaters.push(update);

  return {
    /** vào phòng (hoặc nối lại): bỏ hết người cũ, dựng lại theo danh sách máy chủ gửi */
    reset(peers) { for (const id of [...recs.keys()]) remove(id); for (const p of Array.isArray(peers) ? peers : []) if (p && p.id != null) add(p); },
    join(p) { if (p && p.id != null) return add(p); return null; },
    leave(id) { const rec = recs.get(String(id)); if (!rec) return null; const name = rec.name; remove(rec.id); return name; },
    /** gói trạng thái gộp [[id, x, y, z, r, v, a, c, o], …] */
    states(list, myId) {
      if (!Array.isArray(list)) return;
      const now = performance.now();
      for (const row of list) {
        if (!Array.isArray(row) || row[0] === myId) continue;
        const rec = recs.get(String(row[0])), s = snapOf(row.slice(1), now); if (!rec || !s) continue;
        pushSnap(rec.snaps, s);
      }
    },
    /** chữ chat nổi trên đầu vài giây (textContent — không bao giờ chèn HTML của người khác) */
    say(id, text) { const rec = recs.get(String(id)); if (!rec || hid(rec)) return; rec.bub.textContent = text; rec.bubT = BUBBLE_S; },
    emote(id, e) { const rec = recs.get(String(id)); if (!rec || hid(rec) || !Object.hasOwn(EMOTE_ICON, e)) return; rec.emote = e; rec.emoteT = EMOTE_S; rec.bub.textContent = EMOTE_ICON[e]; rec.bubT = EMOTE_S; },
    /** người chơi vừa ẩn/hiện ai đó: áp dụng ngay, không chờ thời gian giữ mức */
    refresh() { for (const r of recs.values()) if (hid(r) || r.mode === 'off') r.modeAt = -1e9; lodT = LOD_EVERY; },
    count: () => recs.size,
    name: (id) => { const rec = recs.get(String(id)); return rec ? rec.name : null; },
    list: () => [...recs.values()].map((r) => ({ id: r.id, name: r.name, mode: r.mode, builds: r.builds, broken: !!(r.h && r.h.rigBroken), pos: r.cur ? { x: r.cur.x, y: r.cur.y, z: r.cur.z } : null, pose: r.cur ? r.cur.o : null, clip: r.h ? r.h.clip : null, shown: r.h ? r.h.pose : null, tag: r.tag.style.display !== 'none', bubble: r.bubT > 0 ? r.bub.textContent : null })),
  };
}
