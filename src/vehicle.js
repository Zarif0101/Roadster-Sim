// Vehicle physics: raycast suspension with anti-roll bars, Magic Formula tyres with wheel spin and
// relaxation, tri-motor powertrain + battery, ABS / traction control / stability control, aero with the
// active wing, suction fans, cold-gas thrusters with a blowdown tank, and the flight controller.
// Rapier integrates the rigid body; every force below is applied at its real point,
// so torque comes out of r × F automatically. No three.js import, so this also runs headless in Node.
import { P, TRIMS, THRUSTERS, WHEELS, SUSP_REST, INERTIA, val } from './params.js';
import * as tyre from './physics/tyre.js';
import { driveTorques, brakeTorques, battery, newBattery } from './physics/powertrain.js';
import { newTank, tankStep, massAt } from './physics/coldgas.js';
import { RHO, newWing, wingLogic, aeroForces, fanSuction } from './physics/aero.js';

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
const SUB = 8;              // tyre / wheel-spin sub-steps per physics step (960 Hz at 120 Hz)
const SIDE_CA = 4.5;        // m², side area × side-force coefficient (crosswind)
const TOP_CA = 7.0;         // m², plan area × drag coefficient when falling flat
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
    this.wheels = WHEELS.map((w) => ({ ...w, comp: 0, prevComp: 0, contact: false, load: 0, spin: 0, slip: 0, point: null,
      omega: 0, kap: 0, tanA: 0, I: val('wheelInertia'), tcCut: 0, absCut: 0, vx: 0, steer: 0, Fx: 0, Fy: 0 }));
    this.input = { throttle: 0, brake: 0, steer: 0, hoverUp: 0, pitchCmd: 0, yawCmd: 0 };
    this.manual = new Array(THRUSTERS.length).fill(0); // manual thruster commands 0..1
    this.thrust = new Array(THRUSTERS.length).fill(0); // actual force, N
    this.valve = new Array(THRUSTERS.length).fill(0);  // valve opening after solenoid lag
    this.steerAngle = 0;
    this.tc = true; this.abs = true; this.esc = true; this.regen = true; this.autoHold = true;
    this.setConfig(config);
    this.reset([0, 1, 0], 0);
  }

  setConfig(c) {
    this.config = TRIMS[c] ? c : 'rocket';
    this.trim = TRIMS[this.config];
    this.nozzleOn = THRUSTERS.map((_, i) => this.trim.nozzles.includes(i));
    this.hasThrusters = this.trim.nozzles.length > 0;
    this.hasLift = this.nozzleOn[2];
    this.gas0 = this.trim.tank ? massAt(val('tankPressure') * 1e5, 293.15, this.trim.tank / 1000) : 0;
    this.mode = 'MANUAL';
  }

  get gas() { return this.tank ? this.tank.m : 0; }
  set gas(m) { if (this.tank) this.tank.m = m; }

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
    this.tank = newTank(this.trim.tank);
    this.battery = newBattery();
    this.wing = newWing();
    this.unlimited = this.unlimited || false;
    this.fansOn = false; this.fanLevel = 0; this.rescuing = false; this.fan = { force: 0, kw: 0, seal: 0, dP: 0 };
    if (this.autoRescue === undefined) this.autoRescue = true;
    this.mode = 'MANUAL';
    this.altTarget = 3; this.override = null;
    this.manual.fill(0); this.thrust.fill(0); this.valve.fill(0);
    const fwdV = [-Math.sin(yaw), 0, -Math.cos(yaw)], v0 = opts.vel ? dot(opts.vel, fwdV) : 0;
    this.wheels.forEach((w) => { w.comp = w.prevComp = 0; w.contact = false; w.omega = v0 / val('wheelRadius'); w.kap = w.tanA = 0; w.tcCut = w.absCut = 0; w.I = val('wheelInertia'); });
    this.prevVel = [0, 0, 0]; this.accel = [0, 0, 0];
    this.time = 0; this.t60 = null; this.launchT = null;
    this.events = []; this.availNow = this.hasThrusters ? 1 : 0; this.pRatio = this.hasThrusters ? 1 : 0;
    this.up = [0, 1, 0]; this.fwd = fwdV; this.right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    this.height = 0; this.speed = 0; this.vLong = 0; this.forces = []; this.contacts = 0;
    this.gust = [0, 0, 0]; this.gustT = 0; this.escActive = 0; this.latG = 0; this.holding = this.autoHold && !opts.vel;
    this.updateMass(true);
  }

  get mass() { return val('massDry') + this.trim.extraMass + this.gas; }

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

  // Keyboard steering filter: full key gives the road-wheel angle that just reaches the front tyres'
  // peak grip at this speed (what a skilled driver dials in), never more than full lock.
  steerLimit(speed) {
    const L = val('wheelbase'), mu = val('tyreMu') * 0.95, g = val('gravity');
    return Math.min((val('maxSteer') * Math.PI) / 180, Math.atan((L * mu * g) / Math.max(1, speed * speed)) + 0.5 * Math.atan(tyre.PEAK.y.at));
  }

  // One fixed physics step. Computes all forces, applies them, records them for display.
  step(dt) {
    const b = this.body, q = b.rotation(), com = V(b.translation());
    const lin = V(b.linvel()), ang = V(b.angvel());
    const m = this.mass, g = val('gravity'), r = val('wheelRadius');
    const up = qRot(q, [0, 1, 0]), fwd = qRot(q, [0, 0, -1]), right = qRot(q, [1, 0, 0]);
    const forces = []; this.forces = forces;
    // Forces (not impulses): Rapier integrates added forces inside this step together with gravity.
    // Impulses land one step late, which shows up as a slow creep on slopes.
    b.resetForces(true); b.resetTorques(true);
    const apply = (type, F, p) => { b.addForceAtPoint(O(F), O(p), true); forces.push({ type, F, p }); };
    this.time += dt;
    forces.push({ type: 'gravity', F: [0, -m * g, 0], p: com });
    const speed = len(lin), vLongBody = dot(lin, fwd);

    // --- steering: speed-sensitive filter, rate-limited actuator, Ackermann geometry ---
    const target = clamp(this.input.steer, -1, 1) * this.steerLimit(Math.abs(vLongBody));
    this.steerAngle += clamp(target - this.steerAngle, -3 * dt, 3 * dt);
    const L = val('wheelbase'), tr = val('track'), d = this.steerAngle;
    const ack = (inner) => { if (Math.abs(d) < 1e-4) return d; const c = L / Math.tan(Math.abs(d)); return Math.sign(d) * Math.atan(L / (c + (inner ? -tr / 2 : tr / 2))); };
    this.wheels[0].steer = ack(d > 0); this.wheels[1].steer = ack(d < 0); // + steer = left, so left wheel is inner
    this.wheels[2].steer = this.wheels[3].steer = 0;

    // --- suspension: raycast per corner, spring + bump/rebound damper, anti-roll bars ---
    const down = mul(up, -1), kS = val('springRate') * (1 + 2 * this.fanLevel); // adaptive: stiffer under fan load
    const hits = this.wheels.map((w) => {
      const hp = add(com, qRot(q, w.pos)), hit = this.ray(hp, down, SUSP_REST + r);
      w.prevComp = w.comp;
      if (!hit) { w.contact = false; w.comp = 0; w.load = 0; w.point = add(hp, mul(down, SUSP_REST + r)); return null; }
      w.contact = true; w.comp = clamp(SUSP_REST - (hit.toi - r), 0, SUSP_REST); w.point = hit.p;
      const cv = (w.comp - w.prevComp) / dt;
      let Fs = kS * w.comp + cv * (cv > 0 ? val('dampBump') : val('dampRebound'));
      if (w.comp > 0.85 * SUSP_REST) Fs += 10 * kS * (w.comp - 0.85 * SUSP_REST); // bump stop
      w.Fs = Fs; return hit;
    });
    for (const [a, c, k] of [[0, 1, val('arbFront')], [2, 3, val('arbRear')]]) {
      if (!hits[a] || !hits[c]) continue;
      const F = k * (this.wheels[a].comp - this.wheels[c].comp);
      this.wheels[a].Fs += F; this.wheels[c].Fs -= F;
    }
    let contacts = 0;
    this.wheels.forEach((w, i) => { if (hits[i]) { contacts++; w.Fs = Math.max(0, w.Fs); w.load = w.Fs; } });
    this.contacts = contacts;
    if (contacts === 0 && this.wasGrounded) this.event('Airborne');
    if (contacts > 0 && this.wasGrounded === false) this.event('Touchdown');
    this.wasGrounded = contacts > 0;

    // --- wheel frames and contact-patch velocities ---
    const frames = this.wheels.map((w, i) => {
      const hit = hits[i]; if (!hit) return null;
      const hb = qRot(q, [-Math.sin(w.steer), 0, -Math.cos(w.steer)]), n = hit.n;
      const f = norm(sub(hb, mul(n, dot(n, hb)))), side = norm(cross(n, f));
      const vc = add(lin, cross(ang, sub(hit.p, com)));
      w.vx = dot(vc, f);
      return { f, side, n, p: hit.p, vx: w.vx, vy: dot(vc, side) };
    });

    // --- driver aids and powertrain ---
    let thr = clamp(this.input.throttle, -1, 1);
    let brake = clamp(this.input.brake, 0, 1);
    if (thr < 0 && vLongBody > 1) { brake = Math.max(brake, -thr); thr = 0; } // pedal semantics: 'back' while rolling forward = brake
    // vehicle hold: once stopped with no throttle, the brakes stay on until the driver accelerates
    if (thr !== 0) this.holding = false;
    else if (contacts >= 3 && Math.abs(vLongBody) < 1) this.holding = this.autoHold; // also catches a slow roll-back (hill hold)
    if (this.holding) brake = Math.max(brake, 0.4);
    const extra = [0, 0, 0, 0];
    this.escActive = 0;
    let thrScale = 1;
    if (this.esc && contacts >= 3 && Math.abs(vLongBody) > 4) {
      // stability control: compare yaw rate with what the steering asks for (bicycle model, grip-limited)
      const vx = Math.abs(vLongBody), yr = dot(ang, up), mu = val('tyreMu');
      let rRef = (vLongBody * d) / (L * (1 + (vx * vx) / 900));
      rRef = clamp(rRef, (-0.9 * mu * g) / vx, (0.9 * mu * g) / vx);
      const e = yr - rRef, th = 0.07 + 0.12 * Math.abs(rRef);
      if (Math.abs(e) > th) {
        const amt = Math.min(3500, 9000 * (Math.abs(e) - th)), left = (Math.abs(yr) > 0.02 ? yr : rRef) > 0;
        if (Math.abs(yr) > Math.abs(rRef)) { extra[left ? 1 : 0] += amt; thrScale = 1 - Math.min(0.8, 3 * (Math.abs(e) - th)); } // oversteer: brake outer front
        else extra[left ? 2 : 3] += amt * 0.6; // understeer: brake inner rear
        this.escActive = 1;
      }
    }
    if (vLongBody * 3.6 > val('topSpeed') && thr > 0) thrScale *= Math.max(0, 1 - (vLongBody * 3.6 - val('topSpeed')) / 5); // limiter
    let Td = driveTorques(this, thr * thrScale);
    const Tb = brakeTorques(brake, extra);
    const lim = { tc: this.tc ? 1.15 * tyre.PEAK.x.at : 0, abs: this.abs ? 1.1 * tyre.PEAK.x.at : 0 };
    // battery: electrical power for motors (+ fans) decides how much torque it can actually supply
    const eff = val('motorEff');
    const mechKW = Td.reduce((s, T, i) => s + T * this.wheels[i].omega, 0) / 1000;
    const fanKW = this.fan.kw || 0;
    const elecKW = (mechKW > 0 ? mechKW / eff : mechKW * eff) + fanKW;
    const bs = battery(this.battery, elecKW, dt);
    if (bs < 1 && mechKW > 0) Td = Td.map((T) => T * bs);

    // --- tyres: sub-stepped wheel spin + relaxation; average force over the step ---
    const h = dt / SUB;
    this.wheels.forEach((w, i) => {
      const fr = frames[i];
      if (!fr) { // in the air: wheel spins freely, slip states relax
        for (let s = 0; s < SUB; s++) {
          w.omega += (h * Td[i]) / w.I; // in the air: free spin
          const dB = (Tb[i] * h) / w.I; w.omega = Math.abs(w.omega) <= dB ? 0 : w.omega - Math.sign(w.omega) * dB;
        }
        w.kap *= 0.9; w.tanA *= 0.9; w.slip = 0; w.Fx = w.Fy = 0;
        w.spin += w.omega * dt; return;
      }
      let sx = 0, sy = 0, util = 0;
      let tcN = 0, absN = 0;
      for (let s = 0; s < SUB; s++) { const o = tyre.substep(w, fr.vx, fr.vy, w.Fs, Td[i], Tb[i], r, h, lim); sx += o.Fx; sy += o.Fy; util = o.util; tcN += w.tcOn; absN += w.absOn; }
      w.tcCut = tcN / SUB; w.absCut = absN / SUB;
      w.Fx = sx / SUB; w.Fy = sy / SUB; w.slip = util; w.spin += w.omega * dt;
      apply('suspension', mul(fr.n, w.Fs), fr.p);
      apply('tyre', add(mul(fr.f, w.Fx), mul(fr.side, w.Fy)), fr.p);
    });
    this.tcActive = this.wheels.some((w) => w.tcCut > 0.05) ? 1 : 0;
    this.absActive = this.wheels.some((w) => w.absCut > 0.05) ? 1 : 0;

    // --- aerodynamics (relative to the wind, with gusts) ---
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gustT = 0.6 + Math.random(); const gs = val('windGust'); this.gustTarget = [(Math.random() * 2 - 1) * gs, 0, (Math.random() * 2 - 1) * gs * 0.5]; }
    if (this.gustTarget) this.gust = add(this.gust, mul(sub(this.gustTarget, this.gust), Math.min(1, dt * 2)));
    const wind = add([val('windSpeed'), 0, 0], this.gust); this.windVec = wind;
    const air = sub(lin, wind), uF = dot(air, fwd), uS = dot(air, right), uU = dot(air, up);
    const ride = this.underGap ?? 0.3;
    wingLogic(this.wing, { speed: Math.max(0, uF), brake, latG: this.latG, airborne: contacts === 0 && this.height > 0.5, fans: this.fansOn, dt });
    const aero = aeroForces(this.wing, Math.max(0, uF), Math.max(0, ride - 0.24));
    if (Math.abs(uF) > 0.1) apply('drag', mul(fwd, -Math.sign(uF) * aero.drag), com);
    if (Math.abs(uS) > 0.1) apply('drag', mul(right, -0.5 * RHO * SIDE_CA * uS * Math.abs(uS)), add(com, mul(up, 0.1)));
    if (Math.abs(uU) > 0.5) apply('drag', mul(up, -0.5 * RHO * TOP_CA * uU * Math.abs(uU)), com);
    if (aero.bodyDown > 1) {
      apply('drag', mul(up, -aero.bodyDown * 0.45), add(com, mul(fwd, 1.2)));
      apply('drag', mul(up, -aero.bodyDown * 0.55), add(com, mul(fwd, -1.45)));
    }
    if (aero.wingDown > 1) apply('drag', mul(up, -aero.wingDown), add(com, add(mul(fwd, -1.9), mul(up, 0.5))));
    this.downforce = aero.bodyDown + aero.wingDown; this.dragF = aero.drag;

    // --- suction fans: fan curve against skirt leakage; only works near a surface ---
    this.fanLevel += ((this.fansOn ? 1 : 0) - this.fanLevel) * Math.min(1, dt / 0.3);
    const under = this.ray(add(com, mul(up, -0.25)), mul(up, -1), 1.2);
    this.underGap = under ? under.toi : null;
    this.fan = fanSuction(this.fanLevel, under ? under.toi : 9);
    this.seal = this.fan.seal; this.fanForce = this.fan.force;
    if (this.fanForce > 1) apply('fan', mul(up, -this.fanForce), add(com, mul(up, -0.25)));

    // --- thrusters ---
    this.ctrl = { active: false };
    const avail = this.hasThrusters ? this.availNow : 0;
    const canRescue = this.hasLift && this.autoRescue && avail > 0.05;
    if (!this.rescuing && canRescue && contacts === 0 && this.mode !== 'HOVER' && this.height > 0.4 && (lin[1] < -4 || up[1] < 0.6)) {
      this.rescuing = true; this.event('Auto-rescue: levelling and braking the fall');
    }
    if (this.rescuing && ((contacts >= 3 && up[1] > 0.8) || !canRescue || this.mode === 'HOVER')) {
      this.rescuing = false; if (contacts >= 3) this.event('Auto-rescue: landed upright');
    }
    if (!this.hasLift && this.mode !== 'MANUAL') this.mode = 'MANUAL';
    let cmd = this.manual.slice();
    if (this.hasLift && (this.mode !== 'MANUAL' || this.rescuing)) cmd = this.controller(cmd, { up, fwd, right, q, lin, ang, com, m, g, contacts });
    let Fcmd = 0;
    THRUSTERS.forEach((t, i) => {
      const want = this.nozzleOn[i] ? clamp(cmd[i], 0, 1) : 0;
      this.valve[i] += (want - this.valve[i]) * Math.min(1, dt / 0.02); // solenoid valve lag ~20 ms
      Fcmd += this.valve[i] * t.max * val('thrustScale');
    });
    const ts = this.hasThrusters ? tankStep(this.tank, Fcmd, this.unlimited, dt) : { avail: 0, mdot: 0, ve: 0 };
    let totalF = 0;
    THRUSTERS.forEach((t, i) => {
      const F = this.valve[i] * t.max * val('thrustScale') * avail;
      this.thrust[i] = F;
      if (F > 1) { totalF += F; apply('thruster', qRot(q, mul(t.dir, F)), add(com, qRot(q, t.pos))); }
    });
    const gasBefore = this.availNow;
    this.availNow = ts.avail; this.ve = ts.ve;
    this.pRatio = this.hasThrusters ? this.tank.p / (val('tankPressure') * 1e5) : 0;
    this.totalThrust = totalF;
    this.massFlow = ts.mdot;
    if (this.hasThrusters && !this.unlimited && gasBefore > 0 && this.gas <= 0.01) this.event('Gas depleted');
    this.updateMass(false);

    // --- derived telemetry ---
    this.accel = mul(sub(lin, this.prevVel), 1 / dt); this.prevVel = lin;
    this.latG += (dot(this.accel, right) / g - this.latG) * Math.min(1, dt * 8); // filtered like a real IMU readout
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
    const kp = rescue ? 2.2 * val('attKp') : val('attKp'), kd = rescue ? 1.64 * val('attKd') : val('attKd');
    let alphaW = sub(mul(axis, kp * ang0), mul(ang, kd));
    alphaW = sub(alphaW, mul(up, dot(alphaW, up))); // yaw handled separately
    const aB = qRot(qInv(q), alphaW);
    const Mx = aB[0] * INERTIA.x * k, Mz = aB[2] * INERTIA.z * k;
    // vertical thrust request
    let T;
    if (hover) {
      let vT, ff = 0;
      if (rescue || this.altTarget < 0) {
        // braking profile: the fastest sink rate from which ~55 % of the spare thrust can still stop it
        // at 0.2 m, touching down at 0.8 m/s. Feed-forward the profile's own deceleration so it doesn't lag.
        const aBrake = Math.max(1.5, 0.55 * ((4 * liftMax) / m - g));
        vT = -Math.sqrt(0.64 + 2 * aBrake * Math.max(0, this.height - 0.2));
        if (lin[1] < vT + 0.5) ff = aBrake;
      } else vT = o.vy ?? clamp(val('altKp') * (this.altTarget - this.height), this.height < 2 ? -1.2 : -3, 3);
      const aY = ff + val('vzKp') * (vT - lin[1]) + g;
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
    const g0 = this.gas0 || 1;
    return {
      t: this.time, speed: this.speed || 0, kmh: (this.speed || 0) * 3.6, vLong: this.vLong || 0,
      accel: len(this.accel) / val('gravity'), height: this.height, x: pos[0], y: pos[1], z: pos[2],
      pitch, roll, yawRate: dot(ang, up) * 57.3, angSpeed: len(ang) * 57.3,
      gasKg: this.gas, gasPct: this.hasThrusters ? (100 * this.gas) / g0 : 0,
      pressureBar: this.hasThrusters ? (this.tank.p || 0) / 1e5 : 0, tankK: this.tank ? this.tank.T : 0,
      thrustkN: (this.totalThrust || 0) / 1000, massFlow: this.massFlow || 0,
      fankN: (this.fanForce || 0) / 1000, fanKW: this.fan?.kw || 0, seal: this.seal || 0, contacts: this.contacts || 0,
      mass: this.mass, mode: this.mode, steerDeg: this.steerAngle * 57.3,
      loads: this.wheels.map((w) => w.load / 1000), slips: this.wheels.map((w) => w.slip), t60: this.t60,
      saturated: this.ctrl?.saturated || false, upY: up[1],
      soc: this.battery.soc * 100, packV: this.battery.volts, packKW: this.battery.kw,
      downforcekN: (this.downforce || 0) / 1000, wing: this.wing.mode, wingDeploy: this.wing.deploy,
      latG: this.latG || 0, esc: this.escActive || 0, tcOn: this.tcActive || 0, absOn: this.absActive || 0,
    };
  }
}
