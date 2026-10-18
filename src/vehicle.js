// Vehicle physics: raycast suspension, tyres, drag, fans, thrusters, flight controller.
// Rapier integrates the rigid body; every force below is computed here and applied
// as an impulse at its real point, so torque comes out of r × F automatically.
// No three.js import, so this file also runs headless in Node for tests.
import { P, THRUSTERS, WHEELS, SUSP_REST, FRONT_TORQUE_SHARE, INERTIA, val } from './params.js';

// ---- tiny vector helpers (arrays [x,y,z]) ----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const V = (v) => [v.x, v.y, v.z];
const O = (a) => ({ x: a[0], y: a[1], z: a[2] });
function qRot(q, v) { // rotate v by quaternion q {x,y,z,w}
  const u = [q.x, q.y, q.z], s = q.w;
  const t = mul(cross(u, v), 2);
  return add(add(v, mul(t, s)), cross(u, t));
}
const qInv = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export const vec = { add, sub, mul, dot, cross, len, norm, qRot };

export const MODES = ['MANUAL', 'STABILIZE', 'HOVER'];
const RHO = 1.225;
const BODY_HALF = [0.95, 0.33, 2.15];

export class Vehicle {
  constructor(R, world, config = 'rocket') {
    this.R = R; this.world = world;
    this.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true));
    // Collision hull: chamfered nose and tail so the car can enter curved ramps (visual mesh is separate).
    const hx = BODY_HALF[0], pts = [];
    for (const sx of [-hx, hx]) pts.push(
      sx, -0.25, -1.55,  sx, -0.25, 1.75,  sx, -0.02, -2.15,  sx, 0.02, 2.15,
      sx, 0.42, -2.1,  sx, 0.42, 2.1,  sx * 0.65, 0.72, -0.4,  sx * 0.65, 0.72, 0.9);
    this.collider = world.createCollider(
      R.ColliderDesc.convexHull(new Float32Array(pts)).setDensity(0).setFriction(0.6).setRestitution(0.1),
      this.body);
    this.wheels = WHEELS.map((w) => ({ ...w, comp: 0, prevComp: 0, contact: false, load: 0, spin: 0, slip: 0, point: null }));
    this.input = { throttle: 0, brake: 0, steer: 0, hoverUp: 0, pitchCmd: 0, yawCmd: 0 };
    this.manual = new Array(THRUSTERS.length).fill(0); // manual thruster commands 0..1
    this.thrust = new Array(THRUSTERS.length).fill(0); // actual force, N
    this.steerAngle = 0;
    this.setConfig(config);
    this.reset([0, 1, 0], 0);
  }

  setConfig(c) {
    this.config = c; // 'performance' (reported systems only) | 'rocket' (experimental thrusters)
    this.hasThrusters = c === 'rocket';
    this.mode = 'MANUAL';
  }

  reset(pos, yaw = 0, opts = {}) {
    const b = this.body;
    b.setTranslation(O(pos), true);
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    if (opts.roll) { // optional initial roll (used for inverted tests)
      const sr = Math.sin(opts.roll / 2), cr = Math.cos(opts.roll / 2), cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
      b.setRotation({ x: sy * sr, y: sy * cr, z: cy * sr, w: cy * cr }, true); // qYaw * qRoll
    }
    if (opts.rot) b.setRotation(opts.rot, true);
    b.setLinvel(O(opts.vel || [0, 0, 0]), true);
    b.setAngvel(O(opts.spin || [0, 0, 0]), true);
    this.gas = this.hasThrusters ? val('gasMass') : 0;
    this.unlimited = this.unlimited || false;
    this.fansOn = false; this.fanLevel = 0; this.rescuing = false;
    if (this.autoRescue === undefined) this.autoRescue = true;
    this.mode = 'MANUAL';
    this.altTarget = 3; this.override = null;
    this.manual.fill(0); this.thrust.fill(0);
    this.wheels.forEach((w) => { w.comp = w.prevComp = 0; w.contact = false; });
    this.prevVel = [0, 0, 0]; this.accel = [0, 0, 0];
    this.time = 0; this.t60 = null; this.launchT = null;
    this.events = [];
    this.up = [0, 1, 0]; this.fwd = [-Math.sin(yaw), 0, -Math.cos(yaw)]; this.right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    this.height = 0; this.speed = 0; this.vLong = 0; this.forces = [];
    this.updateMass(true);
  }

  get mass() { return val('massDry') + this.gas; }

  updateMass(force) {
    const m = this.mass;
    if (!force && Math.abs(m - (this._m || 0)) < 2) return;
    this._m = m;
    const k = m / 2300;
    this.body.setAdditionalMassProperties(m, { x: 0, y: 0, z: 0 },
      { x: INERTIA.x * k, y: INERTIA.y * k, z: INERTIA.z * k }, { x: 0, y: 0, z: 0, w: 1 }, true);
  }

  event(text) { this.events.push({ t: this.time, text }); if (this.events.length > 50) this.events.shift(); }

  ray(origin, dir, maxToi) {
    const R = this.R;
    const hit = this.world.castRayAndGetNormal(new R.Ray(O(origin), O(dir)), maxToi, true, undefined, undefined, undefined, this.body);
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi;
    return { toi, n: V(hit.normal), p: add(origin, mul(dir, toi)) };
  }

  // One fixed physics step. Computes all forces, applies them, records them for display.
  step(dt) {
    const b = this.body, q = b.rotation(), com = V(b.translation());
    const lin = V(b.linvel()), ang = V(b.angvel());
    const m = this.mass, g = val('gravity');
    const up = qRot(q, [0, 1, 0]), fwd = qRot(q, [0, 0, -1]), right = qRot(q, [1, 0, 0]);
    const forces = []; this.forces = forces;
    const apply = (type, F, p) => {
      b.applyImpulseAtPoint(O(mul(F, dt)), O(p), true);
      forces.push({ type, F, p });
    };
    this.time += dt;
    forces.push({ type: 'gravity', F: [0, -m * g, 0], p: com });

    // --- steering (speed-sensitive) ---
    const speed = len(lin);
    const target = this.input.steer * 0.55 / (1 + speed / 12);
    this.steerAngle += clamp(target - this.steerAngle, -2.5 * dt, 2.5 * dt);

    // --- suspension + tyres ---
    const r = val('wheelRadius'), mu = val('tyreMu');
    const maxDrive = Math.min(val('wheelTorque') / r, (val('peakPower') * 1000) / Math.max(speed, 1));
    const vLongBody = dot(lin, fwd);
    let contacts = 0;
    for (const w of this.wheels) {
      const hp = add(com, qRot(q, w.pos)), down = mul(up, -1);
      const hit = this.ray(hp, down, SUSP_REST + r);
      w.prevComp = w.comp;
      if (!hit) { w.contact = false; w.comp = 0; w.load = 0; w.point = add(hp, mul(down, SUSP_REST + r)); continue; }
      contacts++;
      w.contact = true;
      w.comp = clamp(SUSP_REST - (hit.toi - r), 0, SUSP_REST);
      w.point = hit.p;
      const cVel = (w.comp - w.prevComp) / dt;
      const kS = val('springRate') * (1 + 2 * this.fanLevel); // adaptive: stiffer under fan load
      let Fs = kS * w.comp + val('damping') * cVel;
      if (w.comp > 0.85 * SUSP_REST) Fs += 10 * kS * (w.comp - 0.85 * SUSP_REST); // bump stop
      Fs = Math.max(0, Fs);
      const n = hit.n;
      // wheel heading
      const st = w.front ? this.steerAngle : 0;
      const hb = qRot(q, [-Math.sin(st), 0, -Math.cos(st)]);
      const f = norm(sub(hb, mul(n, dot(n, hb))));
      const side = norm(cross(n, f));
      const vc = add(lin, cross(ang, sub(hit.p, com)));
      const vLong = dot(vc, f), vLat = dot(vc, side);
      const share = m / 4, N = Fs, muN = mu * N;
      // longitudinal
      let Fx = 0, th = this.input.throttle;
      if (th !== 0) {
        const axle = w.front ? FRONT_TORQUE_SHARE / 2 : (1 - FRONT_TORQUE_SHARE) / 2;
        Fx += th * maxDrive * axle * (th < 0 ? 0.3 : 1);
      }
      if (this.input.brake > 0) Fx += -Math.sign(vLong) * Math.min(this.input.brake * muN, Math.abs(vLong) * share / dt * 0.5);
      if (th === 0 && this.input.brake === 0) Fx += -vLong * 25 - Math.sign(vLong) * Math.min(0.012 * N, Math.abs(vLong) * share / dt * 0.5);
      // lateral: saturating slip-angle model, capped so it can't overshoot at low speed
      const alpha = Math.atan2(vLat, Math.abs(vLong) + 2);
      let Fy = -muN * Math.tanh(alpha / 0.08);
      const cap = Math.abs(vLat) * share / dt * 0.8;
      Fy = clamp(Fy, -cap, cap);
      // friction circle
      const Ft = Math.hypot(Fx, Fy);
      w.slip = muN > 0 ? Ft / muN : 0;
      if (Ft > muN && Ft > 0) { Fx *= muN / Ft; Fy *= muN / Ft; }
      w.load = N;
      w.spin += (vLong / r) * dt;
      apply('suspension', mul(n, Fs), hit.p);
      apply('tyre', add(mul(f, Fx), mul(side, Fy)), hit.p);
    }
    this.contacts = contacts;
    if (contacts === 0 && this.wasGrounded) this.event('Airborne');
    if (contacts > 0 && this.wasGrounded === false) this.event('Touchdown');
    this.wasGrounded = contacts > 0;

    // --- aerodynamic drag ---
    if (speed > 0.1) apply('drag', mul(lin, -0.5 * RHO * val('cd') * val('frontalArea') * speed), com);

    // --- suction fans (reported up to 2 g). Only work while the underbody is near a surface. ---
    this.fanLevel += ((this.fansOn ? 1 : 0) - this.fanLevel) * Math.min(1, dt / 0.3);
    const under = this.ray(add(com, mul(up, -0.25)), mul(up, -1), 1.2);
    this.underGap = under ? under.toi : null;
    this.seal = under ? clamp((0.8 - under.toi) / 0.5, 0, 1) : 0;
    this.fanForce = val('fanForce') * val('massDry') * g * this.fanLevel * this.seal;
    if (this.fanForce > 1) apply('fan', mul(up, -this.fanForce), add(com, mul(up, -0.25)));

    // --- thrusters ---
    this.ctrl = { active: false };
    const gas0 = val('gasMass');
    const pRatio = this.unlimited ? 1 : this.gas / gas0;
    this.pRatio = pRatio;
    const avail = this.hasThrusters && (this.unlimited || this.gas > 0) ? Math.min(1, pRatio / val('regPressure')) : 0;
    this.availNow = avail;
    // auto-rescue: falling fast or badly tilted in the air -> level the car and brake the fall
    const canRescue = this.hasThrusters && this.autoRescue && avail > 0.05;
    if (!this.rescuing && canRescue && contacts === 0 && this.mode !== 'HOVER' && this.height > 0.4 && (lin[1] < -4 || up[1] < 0.6)) {
      this.rescuing = true; this.event('Auto-rescue: levelling and braking the fall');
    }
    if (this.rescuing && ((contacts >= 3 && up[1] > 0.8) || !canRescue || this.mode === 'HOVER')) {
      this.rescuing = false; if (contacts >= 3) this.event('Auto-rescue: landed upright');
    }
    let cmd = this.manual.slice();
    if (this.hasThrusters && (this.mode !== 'MANUAL' || this.rescuing)) cmd = this.controller(cmd, { up, fwd, right, q, lin, ang, com, m, g, contacts });
    let totalF = 0;
    THRUSTERS.forEach((t, i) => {
      const F = clamp(cmd[i], 0, 1) * t.max * val('thrustScale') * avail;
      this.thrust[i] = F;
      if (F > 0) { totalF += F; apply('thruster', qRot(q, mul(t.dir, F)), add(com, qRot(q, t.pos))); }
    });
    this.totalThrust = totalF;
    this.massFlow = totalF / val('exhaustVel');
    if (!this.unlimited && this.hasThrusters) {
      const before = this.gas;
      this.gas = Math.max(0, this.gas - this.massFlow * dt);
      if (before > 0 && this.gas === 0) this.event('Gas depleted');
    }
    this.updateMass(false);

    // --- derived telemetry ---
    this.accel = mul(sub(lin, this.prevVel), 1 / dt); this.prevVel = lin;
    const ground = this.ray(com, [0, -1, 0], 200);
    this.height = ground ? ground.toi - 0.49 : 200;
    if (this.launchT !== null && this.t60 === null && speed >= 26.82) { this.t60 = this.time - this.launchT; this.event(`0–60 mph in ${this.t60.toFixed(2)} s`); }
    this.up = up; this.fwd = fwd; this.right = right; this.speed = speed; this.vLong = vLongBody;
  }

  // Flight controller: returns thruster commands (0..1) for the 10 thrusters.
  // STABILIZE: keep level + damp spin, light lift while airborne.
  // HOVER: also hold height (W/S tilt, A/D yaw). altTarget < 0 means "land".
  // RESCUE: same as a landing hover, triggered automatically when the car falls.
  // Allocation gives attitude priority: if a nozzle saturates, total lift is reduced, never the turning moment.
  controller(cmd, s) {
    const { up, fwd, q, lin, ang, m, g, contacts } = s;
    const o = this.override || {};
    const rescue = !!this.rescuing, hover = this.mode === 'HOVER' || rescue;
    const airborne = contacts === 0;
    const k = m / 2300, scale = val('thrustScale') || 1e-6, avail = Math.max(this.availNow ?? 1, 1e-6);
    const liftMax = THRUSTERS[2].max * scale * avail; // per lift nozzle, right now
    // desired "up"
    let upT = [0, 1, 0];
    const tilt = o.tilt ?? (this.mode === 'HOVER' && !rescue ? this.input.pitchCmd * 0.18 : 0);
    if (tilt) { const ff = norm([fwd[0], 0, fwd[2]]); upT = norm(add(upT, mul(ff, Math.tan(tilt)))); }
    if (rescue && up[1] > 0.5) { // lean against sideways drift so it touches down rolling straight
      const side = qRot(q, [1, 0, 0]), vs = dot(lin, side), sf = norm([side[0], 0, side[2]]);
      upT = norm(add(upT, mul(sf, clamp(-0.03 * vs, -0.2, 0.2))));
    }
    const c = clamp(dot(up, upT), -1, 1), ang0 = Math.acos(c);
    let axis = cross(up, upT);
    if (len(axis) < 1e-3) axis = ang0 > 1 ? fwd : [0, 0, 0];
    axis = norm(axis);
    const kp = rescue ? 22 : 10, kd = rescue ? 9 : 5.5;
    let alphaW = sub(mul(axis, kp * ang0), mul(ang, kd));
    alphaW = sub(alphaW, mul(up, dot(alphaW, up))); // yaw handled separately
    const aB = qRot(qInv(q), alphaW);
    const Mx = aB[0] * INERTIA.x * k, Mz = aB[2] * INERTIA.z * k;
    // vertical thrust request
    let T;
    if (hover) {
      let vT, ff = 0;
      if (rescue || this.altTarget < 0) {
        // braking profile: the fastest sink rate from which ~45 % of the spare thrust can still stop it
        // at 0.2 m, touching down at 0.8 m/s. Feed-forward the profile's own deceleration so it doesn't lag.
        const aBrake = Math.max(1.5, 0.38 * ((4 * liftMax) / m - g));
        vT = -Math.sqrt(0.64 + 2 * aBrake * Math.max(0, this.height - 0.2));
        if (lin[1] < vT + 0.5) ff = aBrake;
      } else vT = o.vy ?? clamp(1.2 * (this.altTarget - this.height), this.height < 2 ? -1.2 : -3, 3);
      const aY = ff + 4 * (vT - lin[1]) + g;
      T = up[1] > 0.25 ? (m * aY) / up[1] : 0; // tipped past ~75°: lift would push sideways or down, so only turn
    } else T = airborne ? (o.liftG ?? 0.25) * m * g : 0;
    T = clamp(T, 0, 4 * liftMax);
    // allocation over the 4 lift nozzles
    const zf = THRUSTERS[2].pos[2], zr = THRUSTERS[4].pos[2], xr = THRUSTERS[3].pos[0];
    const alloc = (Tt) => {
      const Ff = (Mx + zr * Tt) / (zr - zf), Fr = Tt - Ff;
      return [Ff / 2 - Mz / 4 / xr, Ff / 2 + Mz / 4 / xr, Fr / 2 - Mz / 4 / xr, Fr / 2 + Mz / 4 / xr];
    };
    let f = alloc(T);
    for (let it = 0; it < 12 && Math.max(...f) > liftMax && T > 0; it++) { T *= 0.85; f = alloc(T); }
    const lo = Math.min(...f);
    if (lo < 0 && up[1] > 0.25) { T = Math.min(4 * liftMax, T - 4 * lo); f = alloc(T); }
    const sat = f.some((x) => x > liftMax * 1.02 || x < -liftMax * 0.02);
    const lift = f.map((F) => F / liftMax);
    // yaw: rate target from A/D or scene override (rescue just stops the spin)
    const yawRate = dot(ang, up);
    const rT = o.yawRate ?? (this.mode === 'HOVER' && !rescue ? this.input.yawCmd * 1.2 : 0);
    const tauY = INERTIA.y * k * 4 * (rT - yawRate);
    const per = Math.abs(tauY) / (2.05 * 2 * THRUSTERS[6].max * scale * avail);
    const yawCmd = tauY > 0 ? [per, 0, 0, per] : [0, per, per, 0]; // T7+T10 = yaw left, T8+T9 = yaw right
    const out = cmd.slice();
    lift.forEach((x, i) => { out[2 + i] = Math.max(out[2 + i], clamp(x, 0, 1)); });
    yawCmd.forEach((x, i) => { out[6 + i] = Math.max(out[6 + i], clamp(x, 0, 1)); });
    if (o.boost) { out[0] = Math.max(out[0], o.boost); out[1] = Math.max(out[1], o.boost); }
    this.ctrl = { active: true, rescue, attErrDeg: (ang0 * 180) / Math.PI, Treq: T, saturated: sat || per > 1, yawRate, yawTarget: rT,
      altTarget: hover ? this.altTarget : null };
    return out;
  }

  telemetry() {
    const up = this.up || [0, 1, 0], fwd = this.fwd || [0, 0, -1];
    const pitch = Math.asin(clamp(fwd[1], -1, 1)) * 57.3;
    const roll = Math.atan2(-(this.right || [1, 0, 0])[1], up[1]) * 57.3;
    const ang = V(this.body.angvel()), pos = V(this.body.translation());
    return {
      t: this.time, speed: this.speed || 0, kmh: (this.speed || 0) * 3.6, vLong: this.vLong || 0,
      accel: len(this.accel) / val('gravity'), height: this.height, x: pos[0], y: pos[1], z: pos[2],
      pitch, roll, yawRate: dot(ang, up) * 57.3, angSpeed: len(ang) * 57.3,
      gasKg: this.gas, gasPct: this.hasThrusters ? (100 * this.gas) / val('gasMass') : 0,
      pressureBar: this.hasThrusters ? val('tankPressure') * (this.pRatio ?? 1) : 0,
      thrustkN: (this.totalThrust || 0) / 1000, massFlow: this.massFlow || 0,
      fankN: (this.fanForce || 0) / 1000, seal: this.seal || 0, contacts: this.contacts || 0,
      mass: this.mass, mode: this.mode, steerDeg: this.steerAngle * 57.3,
      loads: this.wheels.map((w) => w.load / 1000), t60: this.t60,
      saturated: this.ctrl?.saturated || false, upY: up[1],
    };
  }
}
