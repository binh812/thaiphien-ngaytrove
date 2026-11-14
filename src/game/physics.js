// Thế giới vật lý Rapier: va chạm tĩnh từ Builder, bộ điều khiển nhân vật, vật thể động đồng bộ với InstancedMesh.
import * as THREE from 'three';
import RAPIER from 'rapier';

export { RAPIER };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
// nhóm va chạm: 1 = tĩnh, 2 = động, 4 = nhân vật, 8 = cảm biến
export const G = { STATIC: 0x0001ffff, DYN: 0x0002ffff, PLAYER: 0x0004fffb, };

export async function init(ctx) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  let n = 0;
  for (const s of ctx.B.solids) {
    const hx = (s[1] - s[0]) / 2, hy = (s[3] - s[2]) / 2, hz = (s[5] - s[4]) / 2; if (hx < 0.004 || hy < 0.004 || hz < 0.004) continue;
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation((s[0] + s[1]) / 2, (s[2] + s[3]) / 2, (s[4] + s[5]) / 2).setCollisionGroups(G.STATIC).setFriction(0.8), fixed); n++;
  }
  ctx.B.ramps.forEach((pts, i) => { const d = RAPIER.ColliderDesc.convexHull(pts); if (!d) { console.warn('Dốc/cầu thang số', i, 'không dựng được khối va chạm'); return; } world.createCollider(d.setCollisionGroups(G.STATIC).setFriction(0.9), fixed); n++; });
  ctx.B.solids = null;

  const sets = [];     // nhóm vật thể động cùng hình
  /** Tạo nhóm vật thể động. geometry/material cho InstancedMesh; items: [{body}] */
  function propSet(geometry, material, max, o = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, max); mesh.count = 0; mesh.castShadow = o.cast !== false; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ctx.scene.add(mesh);
    const set = { mesh, items: [], dirty: true, scale: o.scale || null, max };
    set.add = (body, color, scale) => { const i = set.items.length; if (i >= max) return null; const it = { body, i, scale: scale || null, set }; set.items.push(it); mesh.count = i + 1; if (color != null) { mesh.setColorAt(i, new THREE.Color(color)); mesh.instanceColor.needsUpdate = true; } body.userData = it; write(set, it); return it; };
    sets.push(set); return set;
  }
  function write(set, it) {
    const t = it.body.translation(), r = it.body.rotation(); _p.set(t.x, t.y, t.z); _q.set(r.x, r.y, r.z, r.w); if (it.scale) _s.copy(it.scale); else _s.set(1, 1, 1);
    _m.compose(_p, _q, _s); set.mesh.setMatrixAt(it.i, _m); set.dirty = true;
  }
  /** Thân động có khối hộp/cầu/trụ. shape: ['box',hx,hy,hz] | ['ball',r] | ['cyl',hh,r] */
  function dyn(shape, x, y, z, o = {}) {
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setLinearDamping(o.ld ?? 0.08).setAngularDamping(o.ad ?? 0.35).setCanSleep(true);
    if (o.ry) bd.setRotation({ x: 0, y: Math.sin(o.ry / 2), z: 0, w: Math.cos(o.ry / 2) });
    if (o.ccd) bd.setCcdEnabled(true);
    const body = world.createRigidBody(bd);
    const cd = shape[0] === 'box' ? RAPIER.ColliderDesc.cuboid(shape[1], shape[2], shape[3]) : shape[0] === 'ball' ? RAPIER.ColliderDesc.ball(shape[1]) : RAPIER.ColliderDesc.cylinder(shape[1], shape[2]);
    if (o.offset) cd.setTranslation(...o.offset);
    cd.setMass(o.mass ?? 1).setRestitution(o.rest ?? 0.2).setFriction(o.fric ?? 0.7).setCollisionGroups(G.DYN);
    world.createCollider(cd, body); if (o.sleep !== false) body.sleep();
    return body;
  }
  function hinge(body, ax, ay, az, lim) {
    const j = world.createImpulseJoint(RAPIER.JointData.revolute({ x: ax, y: ay, z: az }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), fixed, body, true);
    if (lim) j.setLimits(lim[0], lim[1]); return j;
  }

  // nhân vật
  const cc = world.createCharacterController(0.02);
  cc.enableAutostep(0.42, 0.18, true); cc.enableSnapToGround(0.35); cc.setMaxSlopeClimbAngle(50 * Math.PI / 180); cc.setMinSlopeSlideAngle(60 * Math.PI / 180); cc.setApplyImpulsesToDynamicBodies(true); cc.setCharacterMass(55); cc.setUp({ x: 0, y: 1, z: 0 });
  const R = 0.27, HH = 0.5;                                      // viên nang cao 1,54 m
  const pbody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(41, 2, 58));
  const pcol = world.createCollider(RAPIER.ColliderDesc.capsule(HH, R).setCollisionGroups(G.PLAYER), pbody);

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  function cast(origin, dir, max, groups = 0xffff0003, exclude = pcol) {
    ray.origin.x = origin.x; ray.origin.y = origin.y; ray.origin.z = origin.z; ray.dir.x = dir.x; ray.dir.y = dir.y; ray.dir.z = dir.z;
    const hit = world.castRay(ray, max, true, undefined, groups, exclude);
    return hit ? { toi: hit.timeOfImpact ?? hit.toi, collider: hit.collider, body: hit.collider.parent() } : null;
  }

  let acc = 0;
  const listeners = [];
  function step(dt) {
    acc += dt; let k = 0;
    while (acc >= 1 / 60 && k < 3) { for (const f of listeners) f(1 / 60); world.step(); acc -= 1 / 60; k++; }
    if (k === 3) acc = 0;
    for (const set of sets) {
      for (const it of set.items) if (!it.body.isSleeping() || it.force) { write(set, it); it.force = false; }
      if (set.dirty) { set.mesh.instanceMatrix.needsUpdate = true; set.dirty = false; }
    }
  }
  ctx.phys = { world, fixed, RAPIER, propSet, dyn, hinge, cc, pbody, pcol, cast, step, onStep: (f) => listeners.push(f), R, HH, statics: n, write };
  ctx.updaters.push(step);
}
