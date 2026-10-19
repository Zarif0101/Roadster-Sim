// Aerodynamics and suction fans. Pure maths, no three.js.
import { P } from '../params.js';

const v = (k) => P[k].v;
export const RHO = 1.225;

// Active rear wing (Tesla patent US 2026/0285418): stowed flush in road mode, flat in DRS,
// steep in high-downforce mode. Deploys in < 3 s; angle changes in < 0.25 s.
export const WING_MODES = { road: { deploy: 0, aoa: 0 }, drs: { deploy: 1, aoa: 0 }, high: { deploy: 1, aoa: 1 } };
export function newWing() { return { mode: 'road', deploy: 0, aoa: 0, auto: true }; }

// Choose the mode the way the patent describes: flush at low speed, flat on straights,
// high downforce under braking, in fast corners, while airborne or with the fans on.
export function wingLogic(w, s) {
  if (w.auto) {
    const fast = s.speed > 19.4, hard = s.brake > 0.2 || Math.abs(s.latG) > 0.5;
    w.mode = s.airborne || s.fans ? 'high' : !fast ? 'road' : hard ? 'high' : 'drs';
  }
  const t = WING_MODES[w.mode];
  const step = (x, to, rate) => x + Math.max(-rate, Math.min(rate, to - x));
  w.deploy = step(w.deploy, t.deploy, s.dt / 2.5);
  w.aoa = w.deploy > 0.95 ? step(w.aoa, t.aoa, s.dt / 0.22) : step(w.aoa, 0, s.dt / 0.22);
}

// Body + wing forces in the car frame for airspeed u (m/s along -fwd). Wing downforce is
// calibrated to the patent's 700 kg at top speed in high mode.
export function aeroForces(w, u, ride) {
  const q = 0.5 * RHO * u * u;
  const ge = 1 + v('groundEffect') * Math.max(0, Math.min(1, (0.25 - ride) / 0.15)); // closer to the road, more suction
  const wingCl = w.deploy * (0.12 + 0.88 * w.aoa) * v('wingClA');
  const wingCd = w.deploy * (0.010 + 0.025 * w.aoa) * v('frontalArea');
  return {
    drag: q * (v('cd') * v('frontalArea') + wingCd),
    bodyDown: q * v('bodyClA') * ge, // split front/rear by the caller
    wingDown: q * wingCl,            // acts at the rear axle
  };
}

// Suction fans: fan curve dP = dP0 (1 - (Q/Qmax)^2) balanced against leakage under the skirts,
// Q = Cd * perimeter * gap * sqrt(2 dP / rho). Force = dP * sealed area. Solved by bisection.
export function fanSuction(level, gap) {
  if (level <= 0.001) return { dP: 0, Q: 0, force: 0, kw: 0, seal: 0 };
  const k = v('fanForce') / 2; // fanDP / fanQmax are sized for the reported 2 g; the slider scales the fan set
  const dP0 = v('fanDP') * 1000 * k * level * level, Qmax = v('fanQmax') * Math.sqrt(k) * level;
  const g = Math.max(v('skirtLeak'), gap - v('skirtReach'));
  const leak = 0.6 * v('skirtPerim') * g;
  let lo = 0, hi = dP0;
  for (let i = 0; i < 40; i++) {
    const dP = (lo + hi) / 2, Q = leak * Math.sqrt((2 * dP) / RHO), fanP = dP0 * (1 - (Q / Qmax) ** 2);
    if (fanP > dP) lo = dP; else hi = dP;
  }
  const dP = lo, Q = leak * Math.sqrt((2 * dP) / RHO);
  return { dP, Q, force: dP * v('skirtArea'), kw: (dP * Q) / 0.6 / 1000, seal: dP / Math.max(1, dP0) };
}
