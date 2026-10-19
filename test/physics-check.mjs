// Realism benchmark: the simulated car against real-world reference values for high-performance road cars.
// Run: node test/physics-check.mjs   (add -v for the "claims, tested" report)
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from '../src/vehicle.js';
import { P } from '../src/params.js';
import * as tyre from '../src/physics/tyre.js';
import { aeroForces, newWing, wingLogic } from '../src/physics/aero.js';
import { massAt } from '../src/physics/coldgas.js';
import { ALL } from '../src/physics/claims.js';
await RAPIER.init();
const DT = 1 / 120;
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) fails++; };
const flat = (cfg = 'performance', slopeDeg = 0) => {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); w.timestep = DT;
  const a = (slopeDeg * Math.PI) / 180;
  w.createCollider(RAPIER.ColliderDesc.cuboid(9000, 0.5, 9000).setTranslation(0, -0.5, 0).setRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }));
  return { w, v: new Vehicle(RAPIER, w, cfg) };
};
const run = (s, sec, f) => { for (let i = 0; i < Math.round(sec * 120); i++) { f && f(i * DT); s.v.step(DT); s.w.step(); } };

// Tyre curve shape: peak slip where real road tyres peak
check('tyre peak slip ratio', tyre.PEAK.x.at > 0.08 && tyre.PEAK.x.at < 0.13, `${(tyre.PEAK.x.at * 100).toFixed(1)} % (real: 8–13 %)`);
check('tyre peak slip angle', Math.atan(tyre.PEAK.y.at) * 57.3 > 5 && Math.atan(tyre.PEAK.y.at) * 57.3 < 9, `${(Math.atan(tyre.PEAK.y.at) * 57.3).toFixed(1)}° (real: 5–9°)`);

// Braking 100-0 km/h with ABS: performance cars on summer tyres stop in ~30-36 m
{ const s = flat(); s.v.reset([0, 0.6, 0], 0, { vel: [0, 0, -27.78] }); run(s, 0.3); const z0 = s.v.body.translation().z; let t = 0;
  do { s.v.input.brake = 1; s.v.step(DT); s.w.step(); t += DT; } while (s.v.speed > 0.3 && t < 10);
  const d = Math.abs(s.v.body.translation().z - z0);
  check('braking 100–0 km/h, ABS', d > 28 && d < 37, `${d.toFixed(1)} m (real hypercars: 30–36 m)`); }

// Steady cornering at full steering, 30 m/s: road tyres give ~1.0-1.2 g with little body sideslip
{ const s = flat(); s.v.reset([0, 0.6, 0], 0, { vel: [0, 0, -30] }); run(s, 8, () => { s.v.input.throttle = Math.max(0, Math.min(1, 0.5 * (30 - s.v.vLong))); s.v.input.steer = 1; });
  const lin = s.v.body.linvel(), w = s.v.body.angvel(), spd = Math.hypot(lin.x, lin.y, lin.z), lat = (spd * Math.abs(w.y)) / 9.81;
  const beta = Math.atan2(lin.x * s.v.right[0] + lin.z * s.v.right[2], s.v.vLong) * 57.3;
  check('skidpad at 108 km/h', lat > 0.95 && lat < 1.25 && Math.abs(beta) < 5, `${lat.toFixed(2)} g, sideslip ${beta.toFixed(1)}° (real: 1.0–1.2 g, small sideslip)`); }

// Step steer at 25 m/s: yaw rate settles, no lasting slide
{ const s = flat(); s.v.reset([0, 0.6, 0], 0, { vel: [0, 0, -25] }); let peak = 0;
  run(s, 3, (t) => { s.v.input.throttle = Math.max(0, Math.min(1, 0.5 * (25 - s.v.vLong))); s.v.input.steer = t > 0.2 ? 0.5 : 0; peak = Math.max(peak, Math.abs(s.v.body.angvel().y)); });
  const end = Math.abs(s.v.body.angvel().y);
  check('step steer overshoot', peak / end < 1.3, `peak/steady yaw rate ${(peak / end).toFixed(2)} (well-damped road car: < 1.3)`); }

// Parked on a 25 degree slope (steeper than most streets): vehicle hold keeps it there
for (const [deg, yaw] of [[25, 0], [25, 1]]) {
  const s = flat('performance', deg), a = (deg * Math.PI) / 180, qy = { x: 0, y: Math.sin(yaw * 0.785), z: 0, w: Math.cos(yaw * 0.785) };
  const qx = { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) };
  const q = { w: qx.w * qy.w - qx.x * qy.x - qx.y * qy.y - qx.z * qy.z, x: qx.w * qy.x + qx.x * qy.w + qx.y * qy.z - qx.z * qy.y,
    y: qx.w * qy.y - qx.x * qy.z + qx.y * qy.w + qx.z * qy.x, z: qx.w * qy.z + qx.x * qy.y - qx.y * qy.x + qx.z * qy.w }; // slope tilt * heading
  s.v.reset([0, 0.75 / Math.cos(a), 0], 0, { rot: q }); run(s, 3); const p0 = s.v.body.translation(); run(s, 5); const p1 = s.v.body.translation();
  const d = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  check(`parked on ${deg}° slope, ${yaw ? 'diagonal' : 'facing down'}`, d < 0.05, `moved ${(d * 100).toFixed(1)} cm in 5 s (no creeping)`);
}

// 0-60 mph, wheels only: tri-motor EVs on road tyres run 2.1-2.6 s without rollout
{ const s = flat(); s.v.reset([0, 0.6, 0], 0); run(s, 1); s.v.launchT = s.v.time; let i = 0;
  while (s.v.t60 === null && i++ < 1200) { s.v.input.throttle = 1; s.v.step(DT); s.w.step(); }
  check('0–60 mph, wheels only', s.v.t60 > 2.0 && s.v.t60 < 2.7, `${s.v.t60.toFixed(2)} s (Model S Plaid ≈ 2.3 s without rollout)`); }

// Coast-down from 100 km/h without regen: drag + rolling resistance only
{ const s = flat(); s.v.regen = false; s.v.reset([0, 0.6, 0], 0, { vel: [0, 0, -27.78] }); run(s, 5);
  const dv = 100 - s.v.speed * 3.6;
  check('coast-down 100 km/h, 5 s', dv > 3 && dv < 8, `lost ${dv.toFixed(1)} km/h (drag + rolling resistance ≈ 0.025 g)`); }

// Tank fill from NIST data, wing calibration, defaults
check('600 L N₂ at 690 bar', Math.abs(massAt(690e5, 293.15, 0.6) - 297) < 3, `${massAt(690e5, 293.15, 0.6).toFixed(1)} kg (NIST density ≈ 495 kg/m³)`);
{ const w = newWing(); w.mode = 'high'; w.auto = false; w.deploy = 1; w.aoa = 1; const f = aeroForces(w, 102.8, 0.2);
  check('wing downforce at top speed', Math.abs(f.wingDown / 9.81 - 700) < 25, `${(f.wingDown / 9.81).toFixed(0)} kg (patent: up to 700 kg)`); }
{ const w = newWing(); let t = 0; while (w.deploy < 0.999 && t < 5) { wingLogic(w, { speed: 40, brake: 0, latG: 0, airborne: false, fans: false, dt: DT }); t += DT; }
  check('wing deploy time + DRS on straights', t < 3 && w.mode === 'drs', `${t.toFixed(2)} s to deploy (patent: < 3 s), mode ${w.mode}`);
  wingLogic(w, { speed: 40, brake: 1, latG: 0, airborne: false, fans: false, dt: DT });
  check('wing high-downforce under braking', w.mode === 'high', `mode ${w.mode}`); }
check('no wind by default', P.windSpeed.v === 0 && P.windGust.v === 0, `wind ${P.windSpeed.v} m/s, gusts ${P.windGust.v} m/s`);

const claims = ALL();
if (process.argv.includes('-v')) for (const c of claims) console.log(`\n${c.claim}\n  ${c.verdict}${c.rows ? '\n  ' + c.rows.map(([k, x]) => `${k}: ${x.toFixed(2)} g`).join(' | ') : ''}`);
check('claims report builds', claims.length === 5 && claims.every((c) => c.verdict), `${claims.length} claims`);
process.exit(fails ? 1 : 0);
