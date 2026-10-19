// Cold-gas thrusters fed from a nitrogen COPV tank.
// Tank: real-gas density (NIST table at 293 K), adiabatic blowdown so the gas cools as it empties.
// Regulator: holds nozzle chamber pressure at its set point until the tank falls below it.
// Nozzle: choked flow, thrust = Cf * p_c * A_t (momentum + pressure terms of a fixed-expansion nozzle).
import { P } from '../params.js';

const v = (k) => P[k].v;
export const N2 = { R: 296.8, g: 1.4 };
const cv = N2.R / (N2.g - 1);
const G = N2.g, gm = (G + 1) / (G - 1);
const GAMMA = Math.sqrt(G) * Math.pow(2 / (G + 1), (G + 1) / (2 * (G - 1))); // 0.6847 for N2

// NIST WebBook, nitrogen at 293.15 K: [density kg/m3, compressibility Z]
const ZT = [[0, 1], [114.84, 1.001], [218.54, 1.052], [302.44, 1.14], [368.11, 1.249], [420.21, 1.368], [462.65, 1.491], [498.15, 1.615], [560, 1.86]];
export function Z(rho) {
  for (let i = 1; i < ZT.length; i++) if (rho <= ZT[i][0]) { const [a, za] = ZT[i - 1], [b, zb] = ZT[i]; return za + ((zb - za) * (rho - a)) / (b - a); }
  return ZT[ZT.length - 1][1];
}
export const pressure = (m, T, V) => { const rho = m / V; return Z(rho) * rho * N2.R * T; };
export function massAt(p, T, V) { let lo = 0, hi = 600 * V; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (pressure(m, T, V) < p) lo = m; else hi = m; } return (lo + hi) / 2; }

// Thrust coefficient of a nozzle with a fixed expansion ratio eps, running at chamber pressure pc.
// The exit pressure ratio follows from eps; when pc drops, the nozzle over-expands and loses thrust.
export function exitRatio(eps) { // isentropic area-Mach relation, solved for supersonic pe/pc
  let lo = 1e-6, hi = 0.5283;
  for (let i = 0; i < 80; i++) {
    const r = Math.sqrt(lo * hi), M2 = (2 / (G - 1)) * (Math.pow(r, -(G - 1) / G) - 1);
    const A = (1 / Math.sqrt(M2)) * Math.pow((2 / (G + 1)) * (1 + ((G - 1) / 2) * M2), gm / 2);
    if (A > eps) lo = r; else hi = r;
  }
  return Math.sqrt(lo * hi);
}
export function Cf(pc, eps, pa = 101325) {
  const pe = exitRatio(eps);
  const mom = Math.sqrt(((2 * G * G) / (G - 1)) * Math.pow(2 / (G + 1), gm) * (1 - Math.pow(pe, (G - 1) / G)));
  return Math.max(0, mom + (pe - pa / pc) * eps);
}
export const cStar = (T) => Math.sqrt(N2.R * T) / GAMMA;

// Tank state for a configuration. Volume in litres.
export function newTank(litres) {
  const V = litres / 1000, T = 293.15;
  return { V, T, m: litres > 0 ? massAt(v('tankPressure') * 1e5, T, V) : 0, p: litres > 0 ? v('tankPressure') * 1e5 : 0, m0: 0 };
}

// Advance the tank by dt with total commanded design thrust Fcmd (N, sum of cmd*max over nozzles).
// Returns { avail, mdot, ve }: avail scales every nozzle's thrust right now (1 = full design thrust).
export function tankStep(tk, Fcmd, unlimited, dt) {
  const pSet = v('regPressure') * 1e5, eps = v('nozzleEps');
  if (tk.m <= 0.01 && !unlimited) { tk.p = 0; return { avail: 0, mdot: 0, ve: 0 }; }
  tk.p = unlimited ? v('tankPressure') * 1e5 : pressure(tk.m, tk.T, tk.V);
  const pc = Math.min(pSet, tk.p * 0.97); // regulator drop
  const cfNow = Cf(pc, eps), cfDes = Cf(pSet, eps);
  const avail = Math.max(0, (cfNow * pc) / (cfDes * pSet));
  const Tc = unlimited ? 293.15 : tk.T; // regulator throttling is ~isenthalpic; NIST J-T coefficient is small here, so T is carried through
  const ve = cfNow * cStar(Tc);                 // effective exhaust speed, m/s
  const mdot = ve > 1 ? (Fcmd * avail) / ve : 0;
  if (!unlimited) {
    const dm = Math.min(tk.m, mdot * dt);
    // adiabatic blowdown with slow wall heating: m cv dT = -dm Z R T (gas left behind does the work; h - u = p/rho) + h A (Tw - T) dt
    tk.T += (-dm * Z(tk.m / tk.V) * N2.R * tk.T + v('tankHA') * (293.15 - tk.T) * dt) / Math.max(1, (tk.m - dm) * cv);
    tk.T = Math.max(90, tk.T);
    tk.m -= dm;
  }
  return { avail, mdot, ve };
}
