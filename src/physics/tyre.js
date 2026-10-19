// Tyre model: Pacejka Magic Formula with load sensitivity, combined slip and relaxation length.
// Relaxation states make the tyre behave like a stiff spring at standstill, so a parked car
// holds on a slope instead of creeping (no velocity-scaled "grip caps"). Pure maths, no three.js.
import { P } from '../params.js';

const v = (k) => P[k].v;
export const mf = (B, C, E, x) => { const bx = B * x; return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx)))); };

// Shape factors (typical dry high-performance road tyre; Pacejka, "Tyre and Vehicle Dynamics").
// Normalised so each curve peaks at 1.0 at its peak slip; the fit is checked in test/physics-check.mjs.
export const SHAPE = {
  x: { B: 15.0, C: 1.65, E: 0.3 },  // longitudinal, vs slip ratio: peak near 10 %
  y: { B: 15.5, C: 1.35, E: -0.6 }, // lateral, vs tan(slip angle): peak near 7 degrees
};
const peakOf = ({ B, C, E }) => { let best = 0, at = 0; for (let x = 0.001; x < 1; x += 0.0005) { const f = mf(B, C, E, x); if (f > best) { best = f; at = x; } } return { at, val: best }; };
export const PEAK = { x: peakOf(SHAPE.x), y: peakOf(SHAPE.y) };
const fx = (s) => mf(SHAPE.x.B, SHAPE.x.C, SHAPE.x.E, s) / PEAK.x.val;
const fy = (s) => mf(SHAPE.y.B, SHAPE.y.C, SHAPE.y.E, s) / PEAK.y.val;

// Friction coefficient falls as load rises (load sensitivity), measured against the nominal load.
export const muAt = (Fz) => v('tyreMu') * Math.max(0.6, 1 - v('tyreLoadSens') * (Fz / v('tyreFz0') - 1));

// Combined slip: normalise each slip by its peak and run both curves on the combined magnitude.
// The result can never exceed the friction ellipse.
export function forces(kappa, tanA, Fz) {
  if (Fz <= 0) return { Fx: 0, Fy: 0, util: 0, mu: 0 };
  const mu = muAt(Fz), sx = kappa / PEAK.x.at, sy = tanA / PEAK.y.at, s = Math.hypot(sx, sy);
  if (s < 1e-9) return { Fx: 0, Fy: 0, util: 0, mu };
  const D = mu * Fz;
  const Fx = D * fx(s * PEAK.x.at) * (sx / s);
  const Fy = -D * fy(s * PEAK.y.at) * (sy / s);
  return { Fx, Fy, util: Math.min(s, 1.5), mu };
}

// Per-wheel state update over one sub-step. Body motion at the contact (vx along the wheel, vy across it)
// is frozen for the sub-step; wheel spin, slip states and forces evolve. Returns forces on the car.
// w: { omega, kap, tanA, I } ; T: drive torque (N·m, + forward); Tb: brake torque magnitude (≥ 0)
// lim: optional { tc, abs } slip targets — traction control and ABS act here, at sub-step rate,
// like real systems that modulate torque and brake pressure every few milliseconds.
export function substep(w, vx, vy, Fz, T, Tb, r, dt, lim) {
  const sigX = v('relaxLong'), sigY = v('relaxLat'), avx = Math.abs(vx);
  // relaxation: sigma * d(state)/dt + |vx| * state = slip velocity
  w.kap += dt * ((w.omega * r - vx) - avx * w.kap) / sigX;
  w.tanA += dt * (vy - avx * w.tanA) / sigY;
  w.kap = Math.max(-1.2, Math.min(1.2, w.kap)); w.tanA = Math.max(-2, Math.min(2, w.tanA));
  let { Fx, Fy, util, mu } = forces(w.kap, w.tanA, Fz);
  // low-speed damping (fades out by 3 m/s) stops the standstill spring from ringing
  const fade = Math.max(0, 1 - avx / 3), m4 = Fz / 9.81; // m4: mass this tyre carries
  if (fade > 0 && Fz > 0) {
    // half-critical damping of the tyre spring k = (mu*Fz / peak slip) / sigma
    Fx -= fade * Math.sqrt((mu * Fz) / (PEAK.x.at * sigX) * m4) * (vx - w.omega * r);
    Fy -= fade * Math.sqrt((mu * Fz) / (PEAK.y.at * sigY) * m4) * vy;
    const L = mu * Fz, h = Math.hypot(Fx, Fy); if (h > L) { Fx *= L / h; Fy *= L / h; }
  }
  // wheel spin: drive torque minus road reaction minus rolling resistance, then brake as dry friction
  const Trr = v('rollRes') * Fz * r * Math.sign(w.omega);
  const base = w.omega + (dt * (-Fx * r - Trr)) / w.I; // spin with no drive and no brake
  let om = base + (dt * T) / w.I;
  w.tcOn = false; w.absOn = false;
  if (lim && lim.tc && T > 0 && vx > -0.5) { // traction control: cap wheel speed at the target slip
    const cap = (Math.max(0, vx) * (1 + lim.tc) + 1.2 * lim.tc) / r;
    if (om > cap) { om = Math.max(cap, base); w.tcOn = true; }
  }
  const dB = (Tb * dt) / w.I;
  if (Math.abs(om) <= dB) om = 0; else om -= Math.sign(om) * dB;
  if (lim && lim.abs && Tb > 0 && vx > 1.5) { // ABS: release pressure before the wheel drops below target slip
    const floor = (vx * (1 - lim.abs)) / r, before = om + dB;
    if (om < floor && before > om) { om = Math.min(before, Math.max(om, floor)); w.absOn = true; }
  }
  w.omega = om;
  return { Fx, Fy, util, mu };
}
