// Đêm hội: từ 19h30 (giờ trong game) giữa sân có lửa trại, vài học sinh ngồi quanh trên gốc cây, một bạn ôm đàn; lớp mình đi theo người chơi
// tới gần thì cũng ngồi xuống. Sáng ra mọi thứ về chỗ cũ. Không có lời bài hát nào — chỉ nốt nhạc bay và vài hợp âm tổng hợp.
import * as THREE from 'three';

const RING = 2.5, STUMPS = 12, STUMP_H = 0.46, SPARKS = 28, JOIN_R = 14, LEAVE_R = 18, HEAR = 24, OWNER = 'fire';
const CHECK = 0.5, TALK_GAP = 6, CHORD_GAP = 2.4;

export function initNight(K) {
  const { ctx, ui, D } = K, { player, scene, sky } = ctx, F = D.FIRE, [fx, fz] = F.at, tmp = new THREE.Vector3();
  const isNight = () => { const h = sky.state.hour % 24; return h >= F.from || h < F.until; };

  /* ----- đống lửa, gốc cây ngồi, cây đàn: dựng sẵn, ẩn ban ngày ----- */
  const g = new THREE.Group(); g.visible = false; g.userData.noBake = true; scene.add(g);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9 }), logGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.1, 8);
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(logGeo, wood); m.position.set(fx, 0.22, fz); m.rotation.set(Math.PI / 2 - 0.55, i * Math.PI / 2 + 0.4, 0, 'YXZ'); m.castShadow = true; g.add(m); }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), flames = [];
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.04, 0.75 - i * 0.12, 8).translate(0, 0.37, 0), flameMat); m.position.set(fx + (i - 1) * 0.11, 0.2, fz + (i % 2) * 0.1 - 0.05); g.add(m); flames.push(m); }
  const sp = new Float32Array(SPARKS * 3), seed = Array.from({ length: SPARKS }, (_, i) => [Math.random() * 6.28, 0.5 + Math.random(), i / SPARKS]);
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc060, size: 0.06, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); sparks.frustumCulled = false; g.add(sparks);
  const stumpGeo = new THREE.CylinderGeometry(0.21, 0.24, STUMP_H, 10).translate(0, STUMP_H / 2, 0), stumps = [];
  for (let i = 0; i < STUMPS; i++) { const a = i / STUMPS * Math.PI * 2, x = fx + Math.sin(a) * RING, z = fz + Math.cos(a) * RING, m = new THREE.Mesh(stumpGeo, wood); m.position.set(x, 0, z); m.castShadow = true; g.add(m); stumps.push({ x, y: 0, z, f: a + Math.PI, who: null }); }      // f: quay mặt vào lửa
  const guitar = new THREE.Group(); { const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.09), new THREE.MeshStandardMaterial({ color: 0xb8793a, roughness: 0.5 })), neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), wood); neck.position.y = 0.46; guitar.add(body, neck); } g.add(guitar);
  const light = { x: fx, y: 1.1, z: fz, power: 0.9 };      // nguồn sáng đưa vào bể đèn đêm của effects.js (không tạo thêm đèn mới)

  /* ----- ai ngồi đâu ----- */
  const guests = F.sitters.map((id, i) => ({ n: ctx.people && ctx.people.byId(id), stump: stumps[i * 3], home: null })).filter(q => q.n);
  const gtr = guests.find(q => q.n.c.id === F.guitarist);
  if (gtr) { const s = gtr.stump; guitar.position.set(s.x + Math.sin(s.f) * 0.34, 0.62, s.z + Math.cos(s.f) * 0.34); guitar.rotation.set(0.25, s.f, 1.1, 'YXZ'); } else guitar.visible = false;
  const freeStumps = () => stumps.filter(s => !s.who && !guests.some(q => q.stump === s && on));      // who = 'mate': bạn cùng lớp đang ngồi
  const unseat = () => { for (const s of stumps) s.who = null; };
  K.seatFns.push((take) => { if (on) for (const s of freeStumps()) take(s.x, s.y, s.z, s.f, { stump: true }); });
  let on = false, hosting = false, checkT = 0, talkT = 3, talkI = 0, chordT = 1, chordI = 0, t = 0, mateI = 0;
  function begin() {
    on = true; g.visible = true; if (ctx.nightLights && !ctx.nightLights.includes(light)) ctx.nightLights.push(light);
    for (const q of guests) { const s = q.stump; q.home = ctx.people.relocate(q.n, s.x, s.y, s.z, s.f); q.n.h.clip = 'sit_idle'; q.n.script = { face: s.f, look: null }; }
    if (ctx.ui && player.st.started) ctx.ui.toast(F.start, 5);
  }
  function end() {
    if (K.play.seat && K.play.seat.stump) K.play.stand();      // người chơi đang ngồi trên gốc cây: đứng dậy trước khi gốc biến mất
    on = false; g.visible = false; unseat(); if (ctx.nightLights) { const i = ctx.nightLights.indexOf(light); if (i >= 0) ctx.nightLights.splice(i, 1); }
    for (const q of guests) { q.n.h.clip = null; q.n.script = null; if (q.home) ctx.people.relocate(q.n, q.home.x, q.home.y, q.home.z, q.home.f); q.home = null; }
    if (hosting) { ctx.reunion.resume(OWNER); hosting = false; }
  }
  function update(dt) {
    checkT -= dt;
    if (checkT <= 0) {
      checkT = CHECK; const want = isNight(); if (want !== on && !player.st.locked) (want ? begin : end)();
      // lớp mình: người chơi tới gần lửa thì cả nhóm ngồi xuống các gốc còn trống, đi xa thì đứng dậy theo
      const r = ctx.reunion, d = Math.hypot(player.pos.x - fx, player.pos.z - fz);
      if (on && r && !hosting && r.mode === 'follow' && d < JOIN_R) { const mine = K.play.seat, free = freeStumps().filter(s => !mine || Math.hypot(s.x - mine.x, s.z - mine.z) > 0.3).slice(0, r.present().length); hosting = r.hangout(free.map(s => ({ x: s.x, y: s.y, z: s.z, f: s.f, clip: 'sit_idle' })), OWNER); if (hosting) for (const s of free) s.who = 'mate'; }
      else if (hosting && (d > LEAVE_R || r.mode !== 'hang')) { r.resume(OWNER); hosting = false; unseat(); }
    }
    if (!on) return; t += dt;
    const d = Math.hypot(player.pos.x - fx, player.pos.z - fz); if (d > 70) return;
    flames.forEach((m, i) => { const k = 1 + Math.sin(t * (9 + i * 3.1) + i) * 0.18 + Math.sin(t * 23.7 + i * 2) * 0.08; m.scale.set(1 + (k - 1) * 0.4, k, 1 + (k - 1) * 0.4); });
    light.power = 0.8 + Math.sin(t * 11.3) * 0.12 + Math.sin(t * 27.1) * 0.07;      // lập loè
    for (let i = 0; i < SPARKS; i++) { const [a, r0, ph] = seed[i], k = (t * 0.45 * r0 + ph) % 1; sp[i * 3] = fx + Math.sin(a + k * 2) * (0.1 + k * 0.35); sp[i * 3 + 1] = 0.4 + k * 2.4; sp[i * 3 + 2] = fz + Math.cos(a + k * 2) * (0.1 + k * 0.35); }
    sparkGeo.attributes.position.needsUpdate = true;
    if (d > HEAR || !player.st.started) return;
    chordT -= dt; if (chordT <= 0 && gtr) { chordT = CHORD_GAP; ui.sfx.chord(F.chords[chordI++ % F.chords.length], 0.5 * (1 - d / HEAR)); ui.bubble(tmp.set(gtr.stump.x, 1.5 + Math.random() * 0.2, gtr.stump.z).clone(), chordI % 2 ? '♪' : '♫', 1.6, 'big'); }
    talkT -= dt;
    if (talkT <= 0 && K.idle()) {
      talkT = TALK_GAP;
      if (hosting && talkI % 2 && ctx.reunion.mode === 'hang') { const [id, raw] = F.mates[mateI++ % F.mates.length]; ctx.reunion.bubbleAs(id, raw, 4.5); }
      else if (guests.length) { const q = guests[talkI % guests.length]; ui.bubble(K.headOf(q.n), F.talk[talkI % F.talk.length], 3.5); }
      talkI++;
    }
  }
  return { update, get on() { return on; }, get hosting() { return hosting; }, stumps, guests };
}
