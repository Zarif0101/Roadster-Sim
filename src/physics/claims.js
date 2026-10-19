// "Claims, tested": checks each number from the reveal against the physics of this model.
// Pure functions of the parameters (no simulation), so the landing page can show them instantly;
// each claim also has a live test in the simulator. All results are model results, not measurements.
import { P, TRIMS, THRUSTERS } from '../params.js';
import { RHO, fanSuction } from './aero.js';
import { newTank, tankStep } from './coldgas.js';

const v = (k) => P[k].v;
const G = () => v('gravity');
const massOf = (trim) => v('massDry') + TRIMS[trim].extraMass + (TRIMS[trim].tank ? (v('gasMass') * TRIMS[trim].tank) / 600 : 0);

export function zeroToSixty() {
  const need = 26.82 / 0.81 / G();                                  // average g the claim needs
  const m = massOf('thrust'), mP = massOf('performance');
  const tyres = v('tyreMu');                                        // grip-limited, no fans
  const fanG = fanSuction(1, 0).force / (mP * G());                 // extra normal load from sealed fans
  const motor = v('wheelTorque') / v('wheelRadius') / (mP * G());   // the 10,000 N·m wheel-torque cap
  const wheels = Math.min(tyres * (1 + fanG), motor);
  const boost = (THRUSTERS[0].max + THRUSTERS[1].max) / (m * G());
  const withBoost = Math.min(tyres * (1 + fanG), v('wheelTorque') / v('wheelRadius') / (m * G())) + boost;
  return {
    claim: '0–60 mph in 0.81 s', need,
    rows: [['Tyres alone', tyres], ['Tyres + fan downforce', tyres * (1 + fanG)], ['Motor torque cap', motor], ['Wheels (best case)', wheels], ['Wheels + rear thrusters', withBoost]],
    verdict: withBoost >= need * 0.95
      ? `Only with thrusters. Wheels top out near ${wheels.toFixed(2)} g because the 10,000 N·m torque cap binds before grip does; the fans add grip the motors can't use. Rear cold-gas boost adds ${boost.toFixed(2)} g, which gets within reach of the ${need.toFixed(2)} g the claim needs.`
      : `Not reached in this model: it needs ${need.toFixed(2)} g on average; wheels plus thrusters give ${withBoost.toFixed(2)} g.`,
  };
}

export function topSpeed() {
  const m = massOf('performance'), Pw = v('peakPower') * 1000, CdA = v('cd') * v('frontalArea'), rr = v('rollRes') * m * G();
  let lo = 1, hi = 250;
  for (let i = 0; i < 60; i++) { const s = (lo + hi) / 2; if (0.5 * RHO * CdA * s ** 3 + rr * s < Pw) lo = s; else hi = s; }
  const mph = lo * 2.237;
  return { claim: 'Over 230 mph', mph, kmh: lo * 3.6,
    verdict: `Power meets drag at ${mph.toFixed(0)} mph with the wing flat, so 230 mph is easy on power alone. The limit in practice is tyres and the electronic limiter (set to ${(v('topSpeed') / 1.609).toFixed(0)} mph here).` };
}

export function range() {
  const m = massOf('performance'), u = 29.06, CdA = v('cd') * v('frontalArea');
  const F = 0.5 * RHO * CdA * u * u + v('rollRes') * m * G();
  const whPerKm = (F * 1000) / v('motorEff') / 3600 + 1500 / u / 3.6; // + 1.5 kW for cooling, cabin, electronics
  const steady = v('packKWh') * 1000 / whPerKm / 1.609, mixed = steady * 0.62;
  return { claim: '300 miles of range', steadyMi: steady, mixedMi: mixed, whPerKm,
    verdict: `At a steady 65 mph the model uses ${whPerKm.toFixed(0)} Wh/km: ${steady.toFixed(0)} mi from ${v('packKWh')} kWh. Mixed real-world driving is usually ~40 % worse (${mixed.toFixed(0)} mi). 300 mi fits easily, which hints the 2026 pack is smaller than the 2017 car's 200 kWh.` };
}

export function hover() {
  const m0 = massOf('rocket'), tk = newTank(TRIMS.rocket.tank), lift = THRUSTERS.slice(2, 6).reduce((s, t) => s + t.max, 0);
  let t = 0, used = 0;
  const dt = 0.02;
  for (; t < 60; t += dt) {
    const m = v('massDry') + TRIMS.rocket.extraMass + tk.m, need = m * G();
    const avail = tankStep(tk, 0, false, 0).avail; // query: thrust available right now
    if (avail * lift < need) break;
    used += tankStep(tk, need / Math.max(avail, 1e-6), false, dt).mdot * dt;
  }
  return { claim: 'Short flights on cold gas', seconds: t, usedKg: used, leftKg: tk.m, tankK: tk.T, startT: m0,
    verdict: `Hover lasts ${t.toFixed(1)} s on a full 600 L tank. Only ${used.toFixed(0)} kg of ${v('gasMass')} kg is usable: as the tank empties it cools to ${tk.T.toFixed(0)} K and its pressure drops below what the nozzles need, leaving ${tk.m.toFixed(0)} kg stranded.` };
}

export function ceiling() {
  const m = massOf('rocket'), F = fanSuction(1, 0).force, W = m * G();
  return { claim: 'Hangs upside down on fan suction', margin: F / W, gripMargin: (v('tyreMu') * (F - W)) / W,
    verdict: `Sealed fans pull ${(F / 1000).toFixed(1)} kN against a weight of ${(W / 1000).toFixed(1)} kN: ${(F / W).toFixed(2)}× margin upside down. If the seal breaks, suction falls off within a few centimetres and the car drops.` };
}

export const ALL = () => [zeroToSixty(), topSpeed(), range(), hover(), ceiling()];
