// Electric powertrain: three motors (front axle, rear-left, rear-right), each with a
// constant-torque then constant-power curve at the wheel, fed by a battery whose voltage sags
// under load. Plus regen, traction control and ABS. Pure maths, no three.js.
import { P } from '../params.js';

const v = (k) => P[k].v;

// Wheel-level torque/power split: front motor drives FL+FR through an open diff, each rear motor one wheel.
export const MOTORS = [
  { id: 'front', wheels: [0, 1], tShare: 0.3, pShare: 0.3 },
  { id: 'rearL', wheels: [2], tShare: 0.35, pShare: 0.35 },
  { id: 'rearR', wheels: [3], tShare: 0.35, pShare: 0.35 },
];

export function newBattery() { return { soc: 1, volts: v('packVolt'), amps: 0, kw: 0, limited: false }; }

// Max torque one motor can put through its wheels at wheel speed omega (rad/s).
export function motorLimit(m, omega) {
  const T = v('wheelTorque') * m.tShare, Pw = v('peakPower') * 1000 * m.pShare;
  return Math.min(T, Pw / Math.max(Math.abs(omega), 1e-3));
}

// Battery: open-circuit voltage falls with charge; current from P = V*I - I^2*R.
// Returns the fraction of the requested electrical power the pack can actually deliver.
export function battery(b, kwReq, dt) {
  const R = v('packRes'), Voc = v('packVolt') * (0.88 + 0.12 * b.soc), Pmax = Math.min(v('packPower') * 1000, (Voc * Voc) / (4 * R) * 0.95);
  let Pw = kwReq * 1000, scale = 1;
  if (Pw > Pmax) { scale = Pmax / Pw; Pw = Pmax; }
  if (Pw < -v('regenPower') * 1000) { scale = (-v('regenPower') * 1000) / Pw; Pw = -v('regenPower') * 1000; }
  const I = (Voc - Math.sqrt(Math.max(0, Voc * Voc - 4 * R * Pw))) / (2 * R);
  b.amps = I; b.volts = Voc - I * R; b.kw = Pw / 1000; b.limited = scale < 0.999;
  if (b.soc > 0 || Pw < 0) b.soc = Math.max(0, Math.min(1, b.soc - (Voc * I * dt) / (v('packKWh') * 3.6e6)));
  return b.soc <= 0 && Pw > 0 ? 0 : scale;
}

// Per-wheel drive torque for this step. thr: -1..1. Regen on lift-off slows the car like a Tesla
// in standard stopping mode. (Traction control and ABS act inside the tyre sub-step, see tyre.js.)
export function driveTorques(veh, thr) {
  const out = [0, 0, 0, 0];
  for (const m of MOTORS) {
    const om = m.wheels.reduce((s, i) => s + veh.wheels[i].omega, 0) / m.wheels.length;
    const lim = motorLimit(m, om);
    let T = 0;
    if (thr > 0) T = thr * lim;
    else if (thr < 0) T = thr * lim * 0.35; // reverse gear (the car turns forward 'negative throttle' into braking)
    else if (veh.regen && om > 2) T = -Math.min(lim, (v('regenG') * veh.mass * 9.81 * v('wheelRadius')) * m.tShare) * Math.min(1, (om - 2) / 6);
    for (const i of m.wheels) out[i] = T / m.wheels.length;
  }
  return out;
}

// Brake torque per wheel (magnitude), split by brake bias, plus any stability-control brake request.
export function brakeTorques(brake, extra) {
  const bias = v('brakeBias'), Tmax = v('brakeTorque');
  return [0, 1, 2, 3].map((i) => brake * Tmax * (i < 2 ? bias : 1 - bias) * 2 + (extra ? extra[i] : 0));
}
