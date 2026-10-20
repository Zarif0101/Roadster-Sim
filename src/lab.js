// Engineering lab: controller step responses and design-space sweeps, run on the same physics in a
// separate headless world (the live car is untouched). Results are model results, not measurements.
import { Vehicle } from './vehicle.js';
import { P } from './params.js';
import * as claims from './physics/claims.js';

const DT = 1 / 120;
function sim(R, cfg, setup, seconds, each) {
  const w = new R.World({ x: 0, y: -P.gravity.v, z: 0 }); w.timestep = DT;
  w.createCollider(R.ColliderDesc.cuboid(4000, 0.5, 4000).setTranslation(0, -0.5, 0).setFriction(1));
  const v = new Vehicle(R, w, cfg); setup(v);
  let out;
  for (let i = 0; i < seconds * 120; i++) { const t = i * DT; out = each(v, t); if (out === 'stop') break; v.step(DT); w.step(); }
  w.free();
  return v;
}

// Step tests for the flight controller: the same PD + allocation code a drone would run.
export const STEPS = {
  altitude: { label: 'Height step, 3 → 6 m', unit: 'm', target: 6 },
  attitude: { label: 'Tilt step, 0 → 20°', unit: '°', target: 20 },
};
export function stepResponse(R, kind) {
  const series = [];
  sim(R, 'rocket', (v) => { v.reset([0, 3.5, 0], 0); v.unlimited = true; v.mode = 'HOVER'; v.altTarget = 3; },
    6 + 2, (v, t) => {
      if (t < 2) return; // settle in the hover first
      const tt = t - 2;
      if (kind === 'altitude') { v.altTarget = 6; series.push({ t: tt, y: v.height }); }
      else { v.override = { tilt: (20 * Math.PI) / 180 }; series.push({ t: tt, y: -Math.asin(Math.max(-1, Math.min(1, v.fwd[1]))) * 57.3 }); }
    });
  const target = STEPS[kind].target, y0 = series[0].y, span = target - y0;
  const at = (frac) => series.find((s) => (s.y - y0) / span >= frac)?.t;
  const peak = Math.max(...series.map((s) => s.y)), last = series.slice(-60).reduce((a, s) => a + s.y, 0) / 60;
  let settle = 0; for (const s of series) if (Math.abs(s.y - target) > Math.abs(span) * 0.05) settle = s.t;
  return { series, target, y0, metrics: { rise: (at(0.9) ?? NaN) - (at(0.1) ?? NaN), overshoot: Math.max(0, ((peak - target) / span) * 100), settle, error: last - target } };
}

// Design explorer: vary one parameter and measure one result.
export const METRICS = {
  hover: { label: 'Hover time on a full tank', unit: 's', run: () => claims.hover().seconds },
  top: { label: 'Top speed from power vs drag', unit: 'mph', run: () => claims.topSpeed().mph },
  zero60: { label: '0–60 mph, Thrust trim, fans + boost', unit: 's', run: (R) => { let t60 = null; sim(R, 'thrust', (v) => { v.reset([0, 0.6, 0], 0); v.fansOn = true; }, 6, (v, t) => { if (t > 1 && v.launchT == null) v.launchT = v.time; if (t > 1) { v.input.throttle = 1; v.manual[0] = v.manual[1] = 1; } if (v.t60 != null) { t60 = v.t60; return 'stop'; } }); return t60; } },
  brake: { label: 'Braking 100–0 km/h', unit: 'm', run: (R) => { let z0 = null, d = null; sim(R, 'performance', (v) => v.reset([0, 0.6, 0], 0, { vel: [0, 0, -27.78] }), 8, (v, t) => { if (t < 0.3) return; if (z0 == null) z0 = v.body.translation().z; v.input.brake = 1; if (v.speed < 0.3) { d = Math.abs(v.body.translation().z - z0); return 'stop'; } }); return d; } },
  skid: { label: 'Cornering grip at 108 km/h', unit: 'g', run: (R) => { let g = null; sim(R, 'performance', (v) => v.reset([0, 0.6, 0], 0, { vel: [0, 0, -30] }), 7, (v, t) => { v.input.throttle = Math.max(0, Math.min(1, 0.5 * (30 - v.vLong))); v.input.steer = 1; if (t > 6.9) { const w = v.body.angvel(); g = (v.speed * Math.abs(w.y)) / 9.81; } }); return g; } },
};
export const PARAMS = ['tankPressure', 'regPressure', 'thrustScale', 'massDry', 'tyreMu', 'fanForce', 'peakPower', 'wheelTorque', 'cd', 'wingClA'];

export async function sweep(R, param, metric, points = 7, onPoint) {
  const p = P[param], base = p.v, [lo, hi] = p.edit || [base * 0.5, base * 1.5], out = [];
  try {
    for (let i = 0; i < points; i++) {
      p.v = lo + ((hi - lo) * i) / (points - 1);
      const y = METRICS[metric].run(R);
      out.push({ x: p.v, y }); onPoint && onPoint(out);
      await new Promise((r) => setTimeout(r, 0)); // keep the page responsive between runs
    }
  } finally { p.v = base; }
  return { base, points: out };
}
