// Instant replay: a 60 s ring buffer of the full visual state (pose, wheels, thrust, wing, fans),
// played back through the same car model and effects, with auto-cut cinematic cameras.
import * as THREE from 'three';
import { WHEELS } from './params.js';

const S = 62, HZ = 60, MAX = 60 * HZ;
export class Replay {
  constructor() { this.buf = new Float32Array(MAX * S); this.n = 0; this.head = 0; this.playing = false; this.f = 0; this.speed = 1; this.autoSlow = true; this.shot = 0; this.shotT = 0; }
  clear() { this.n = 0; this.head = 0; }
  record(v, t) {
    const o = this.head * S, b = this.buf, p = v.body.translation(), q = v.body.rotation(), l = v.body.linvel();
    b[o] = t; b.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w, l.x, l.y, l.z], o + 1);
    v.wheels.forEach((w, i) => {
      b[o + 11 + i] = w.comp; b[o + 15 + i] = w.steer || 0; b[o + 19 + i] = w.spin; b[o + 23 + i] = w.slip || 0; b[o + 27 + i] = w.contact ? 1 : 0;
      if (w.point) b.set(w.point, o + 31 + i * 3);
    });
    b.set(v.thrust, o + 43);
    b[o + 53] = v.fanLevel; b[o + 54] = v.wing.deploy; b[o + 55] = v.wing.aoa; b[o + 56] = v.input.brake > 0.05 || v.holding ? 1 : 0;
    b[o + 57] = v.speed; b[o + 58] = v.height; b[o + 60] = v.massFlow || 0; b[o + 61] = v.input.throttle;
    this.head = (this.head + 1) % MAX; this.n = Math.min(MAX, this.n + 1);
  }
  get duration() { return this.n / HZ; }
  idx(k) { return ((this.head - this.n + Math.max(0, Math.min(this.n - 1, k))) % MAX + MAX) % MAX; }
  start(fromSeconds) { if (this.n < 30) return false; this.playing = true; this.f = Math.max(0, this.n - (fromSeconds ?? 12) * HZ); this.shotT = 0; this.track = null; return true; }
  stop() { this.playing = false; }
  // Vehicle-shaped view of frame f, so car.update() and the effects can draw it unchanged.
  frame(f = this.f) {
    const o = this.idx(Math.floor(f)) * S, b = this.buf;
    const wheels = WHEELS.map((w, i) => ({ ...w, comp: b[o + 11 + i], steer: b[o + 15 + i], spin: b[o + 19 + i], slip: b[o + 23 + i], contact: b[o + 27 + i] > 0.5, point: [b[o + 31 + i * 3], b[o + 32 + i * 3], b[o + 33 + i * 3]], omega: b[o + 57] / 0.335 }));
    const pos = { x: b[o + 1], y: b[o + 2], z: b[o + 3] }, rot = { x: b[o + 4], y: b[o + 5], z: b[o + 6], w: b[o + 7] }, lin = { x: b[o + 8], y: b[o + 9], z: b[o + 10] };
    return { wheels, thrust: Array.from(b.subarray(o + 43, o + 53)), fanLevel: b[o + 53], wing: { deploy: b[o + 54], aoa: b[o + 55] }, speed: b[o + 57], height: b[o + 58], massFlow: b[o + 60],
      input: { brake: b[o + 56], throttle: b[o + 61] }, holding: false, steerAngle: b[o + 15], contacts: wheels.filter((w) => w.contact).length, battery: { kw: 0 },
      body: { translation: () => pos, rotation: () => rot, linvel: () => lin }, t: b[o] };
  }
  advance(dt) {
    const fr = this.frame(), air = fr.contacts === 0 && fr.height > 0.6;
    const rate = this.speed * (this.autoSlow && air ? 0.35 : 1);
    this.f = Math.min(this.n - 1, this.f + dt * HZ * rate); this.shotT += dt;
    return { fr, rate, ended: this.f >= this.n - 1 };
  }
  // Cinematic cameras: cut every few seconds between trackside, low chase, orbit, drone and wheel shots.
  camera(cam, fr, dt) {
    const p = new THREE.Vector3(fr.body.translation().x, fr.body.translation().y, fr.body.translation().z);
    const q = new THREE.Quaternion(fr.body.rotation().x, fr.body.rotation().y, fr.body.rotation().z, fr.body.rotation().w);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0; if (fwd.lengthSq() < 0.01) fwd.set(0, 0, -1); fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (this.shotT > 3.8) { this.shot = (this.shot + 1) % 5; this.shotT = 0; this.track = null; }
    let pos, look = p.clone().add(new THREE.Vector3(0, 0.5, 0));
    switch (this.shot) {
      case 0: if (!this.track || this.track.distanceTo(p) > 40) this.track = p.clone().addScaledVector(fwd, 14 + fr.speed * 0.6).addScaledVector(right, 7).setY(1.1); pos = this.track; break;
      case 1: pos = p.clone().addScaledVector(fwd, -6.5).addScaledVector(right, 1.2).setY(Math.max(0.45, p.y * 0.4 + 0.5)); look = p.clone().addScaledVector(fwd, 4).setY(p.y + 0.3); break;
      case 2: { const a = this.shotT * 0.45; pos = p.clone().add(new THREE.Vector3(Math.cos(a) * 8, 2.4, Math.sin(a) * 8)); break; }
      case 3: pos = p.clone().addScaledVector(fwd, -9).setY(p.y + 16); break;
      default: pos = p.clone().addScaledVector(right, -2.4).addScaledVector(fwd, 2.2).setY(Math.max(0.35, p.y - 0.1)); look = p.clone().addScaledVector(fwd, -1.5).setY(p.y);
    }
    cam.position.lerp(pos, this.shotT < 0.05 ? 1 : 1 - Math.exp(-dt * 8)); cam.lookAt(look);
  }
}
