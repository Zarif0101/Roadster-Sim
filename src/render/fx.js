// Particle effects driven by the physics: cold-gas vapour (photo #19: white condensing jets and a ground
// cloud), tyre smoke from real slip, dust, and skid marks. One Points draw call for all particles.
import * as THREE from 'three';
import { THRUSTERS } from '../params.js';

const VS = `attribute float size; attribute float alpha; attribute vec3 tint; varying float vA; varying vec3 vC;
  uniform float scale;
  void main() { vA = alpha; vC = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const FS = `varying float vA; varying vec3 vC;
  void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = vA * (1.0 - r) * (1.0 - r);
    gl_FragColor = vec4(vC, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Effects {
  constructor(scene, max = 6000) {
    this.max = max; this.n = 0; this.density = 1; this.scene = scene;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max); this.drag = new Float32Array(max); this.rise = new Float32Array(max);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.tint = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { scale: { value: 600 } }, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 3; scene.add(this.points);
    this.geo = g;
    // skid marks: a ring buffer of thin dark quads laid on the ground behind slipping tyres
    this.skidMax = 3000; this.skidI = 0; this.skidPos = new Float32Array(this.skidMax * 6 * 3); this.skidA = new Float32Array(this.skidMax * 6);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage)); sg.setAttribute('alpha', new THREE.BufferAttribute(this.skidA, 1).setUsage(THREE.DynamicDrawUsage));
    this.skid = new THREE.Mesh(sg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(0.03, 0.03, 0.035, vA); }' }));
    this.skid.frustumCulled = false; scene.add(this.skid);
    this.lastMark = [null, null, null, null]; this.acc = new Float32Array(32); this.ground = { r: 0.8, g: 0.75, b: 0.68 };
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3(); this.q = new THREE.Quaternion();
  }
  setGround(hex) { const c = new THREE.Color(hex); this.ground = { r: c.r, g: c.g, b: c.b }; }
  clear() { this.n = 0; this.skidA.fill(0); this.geo.setDrawRange(0, 0); this.skid.geometry.attributes.alpha.needsUpdate = true; this.lastMark.fill(null); }

  spawn(p, v, life, s0, s1, a0, color, drag = 1.5, rise = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos.set(p, i * 3); this.vel.set(v, i * 3); this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.drag[i] = drag; this.rise[i] = rise;
    this.tint[i * 3] = color[0]; this.tint[i * 3 + 1] = color[1]; this.tint[i * 3 + 2] = color[2];
  }
  // rate-limited emission per emitter key, scaled by the quality preset's particle budget
  emit(k, rate, dt) { this.acc[k] += rate * dt * this.density; const n = Math.floor(this.acc[k]); this.acc[k] -= n; return n; }

  update(dt, v, car, heightAt) {
    const q = this.q.set(...['x', 'y', 'z', 'w'].map((c) => v.body.rotation()[c])), com = v.body.translation(), lin = v.body.linvel();
    const R = () => Math.random() - 0.5;
    // cold-gas jets: condensation vapour leaving each nozzle against the force direction
    THRUSTERS.forEach((t, i) => {
      const f = v.thrust[i] / t.max; if (f < 0.03) return;
      const exit = this.tmp.set(...t.pos).applyQuaternion(q).add(com), dir = this.tmp2.set(...t.dir).negate().applyQuaternion(q);
      const small = t.max < 5000, n = this.emit(i, (small ? 40 : 160) * f, dt);
      const ports = i < 2 ? [-0.12, 0.12] : [0]; // each boost thruster feeds two of the four rear nozzles
      for (let k = 0; k < n; k++) {
        const sp = (small ? 25 : 55) * (0.7 + 0.5 * Math.random()), off = ports[k % ports.length];
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(off);
        this.spawn([exit.x + side.x, exit.y + side.y, exit.z + side.z], [dir.x * sp + R() * 3 + lin.x, dir.y * sp + R() * 3 + lin.y, dir.z * sp + R() * 3 + lin.z], 0.5 + Math.random() * 0.5, small ? 0.06 : 0.12, small ? 0.6 : 1.4, 0.32, [0.94, 0.96, 1], 5.5, 0.3);
      }
      // jet hitting the ground: a flat, rolling cloud (photo #19)
      const h = heightAt != null ? exit.y - heightAt : 99;
      if (dir.y < -0.5 && h < 6) {
        const m = this.emit(10 + i, 90 * f * (1 - h / 6), dt);
        for (let k = 0; k < m; k++) { const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 8;
          this.spawn([exit.x, (heightAt ?? 0) + 0.15, exit.z], [Math.cos(a) * sp, 0.4 + Math.random(), Math.sin(a) * sp], 1.6 + Math.random(), 0.4, 3.2, 0.22, [0.92, 0.93, 0.95], 1.6, 0.4);
        }
      }
    });
    // tyres: smoke past the grip peak, dust kicked up on loose ground at speed, skid marks
    v.wheels.forEach((w, i) => {
      if (!w.contact || !w.point) { this.lastMark[i] = null; return; }
      const slide = Math.max(0, (w.slip || 0) - 1.05), speed = v.speed;
      if (slide > 0 && speed > 2) {
        const n = this.emit(20 + i, 70 * Math.min(1, slide * 2), dt);
        for (let k = 0; k < n; k++) this.spawn([w.point[0] + R() * 0.2, w.point[1] + 0.1, w.point[2] + R() * 0.2], [R() * 1.5 + lin.x * 0.2, 0.6 + Math.random(), R() * 1.5 + lin.z * 0.2], 1.4 + Math.random(), 0.3, 2.4, 0.28, [0.82, 0.82, 0.83], 1.2, 0.5);
      }
      if (speed > 12 && this.dusty) {
        const n = this.emit(24 + i, Math.min(30, speed * 0.6), dt), g = this.ground;
        for (let k = 0; k < n; k++) this.spawn([w.point[0], w.point[1] + 0.05, w.point[2]], [R() * 2 - lin.x * 0.05, 0.3 + Math.random() * 0.8, R() * 2 - lin.z * 0.05], 1 + Math.random(), 0.25, 1.8, 0.16, [g.r, g.g, g.b], 1.5, 0.15);
      }
      // skid mark quad from the last mark point to here
      const strength = Math.min(1, Math.max(0, (w.slip || 0) - 0.95) * 2);
      if (strength > 0.05 && speed > 1.5) {
        const p = [w.point[0], w.point[1] + 0.012, w.point[2]], last = this.lastMark[i];
        if (last && Math.hypot(p[0] - last[0], p[2] - last[2]) > 0.25) {
          const dx = p[0] - last[0], dz = p[2] - last[2], L = Math.hypot(dx, dz), hw = 0.13, nx = (-dz / L) * hw, nz = (dx / L) * hw, o = this.skidI * 18;
          this.skidPos.set([last[0] - nx, last[1], last[2] - nz, last[0] + nx, last[1], last[2] + nz, p[0] + nx, p[1], p[2] + nz, last[0] - nx, last[1], last[2] - nz, p[0] + nx, p[1], p[2] + nz, p[0] - nx, p[1], p[2] - nz], o);
          this.skidA.fill(0.55 * strength, this.skidI * 6, this.skidI * 6 + 6);
          this.skidI = (this.skidI + 1) % this.skidMax; this.lastMark[i] = p;
          this.skid.geometry.attributes.position.needsUpdate = true; this.skid.geometry.attributes.alpha.needsUpdate = true;
        } else if (!last) this.lastMark[i] = p;
      } else this.lastMark[i] = null;
    });
    // integrate and compact
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      const age = (this.age[i] += dt), t = age / this.life[i];
      if (t >= 1) continue;
      const k = Math.exp(-this.drag[i] * dt);
      for (let c = 0; c < 3; c++) { this.vel[i * 3 + c] *= k; }
      this.vel[i * 3 + 1] += this.rise[i] * dt;
      for (let c = 0; c < 3; c++) this.pos[i * 3 + c] += this.vel[i * 3 + c] * dt;
      if (heightAt != null && this.pos[i * 3 + 1] < heightAt + 0.05) { this.pos[i * 3 + 1] = heightAt + 0.05; this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]) * 0.2; }
      if (j !== i) {
        for (let c = 0; c < 3; c++) { this.pos[j * 3 + c] = this.pos[i * 3 + c]; this.vel[j * 3 + c] = this.vel[i * 3 + c]; this.tint[j * 3 + c] = this.tint[i * 3 + c]; }
        this.life[j] = this.life[i]; this.age[j] = age; this.s0[j] = this.s0[i]; this.s1[j] = this.s1[i]; this.a0[j] = this.a0[i]; this.drag[j] = this.drag[i]; this.rise[j] = this.rise[i];
      }
      this.size[j] = this.s0[j] + (this.s1[j] - this.s0[j]) * Math.sqrt(t);
      this.alpha[j] = this.a0[j] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      j++;
    }
    this.n = j;
    this.geo.setDrawRange(0, j);
    for (const a of ['position', 'size', 'alpha', 'tint']) this.geo.attributes[a].needsUpdate = true;
  }
  resize(h) { this.mat.uniforms.scale.value = h * 0.9; }
}
