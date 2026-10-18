// Auto-rescue torture test: drop the Rocket car from many heights, angles and speeds.
// PASS = lands on its wheels, upright, with touchdown sink rate under 4 m/s.  Run: node test/rescue-check.mjs
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from '../src/vehicle.js';
import { buildWorld } from '../src/world.js';
await RAPIER.init();
const DT = 1 / 120;
const qAxis = (ax, deg) => { const h = (deg * Math.PI) / 360, l = Math.hypot(...ax); return { x: (ax[0] / l) * Math.sin(h), y: (ax[1] / l) * Math.sin(h), z: (ax[2] / l) * Math.sin(h), w: Math.cos(h) }; };
const cases = [];
for (const h of [5, 8, 12, 20, 35]) for (const [name, ax, deg] of [['level', [1, 0, 0], 0], ['roll 45', [0, 0, 1], 45], ['roll 90', [0, 0, 1], 90], ['roll 135', [0, 0, 1], 135], ['upside down', [0, 0, 1], 180], ['nose down 90', [1, 0, 0], -90], ['tail down 60', [1, 0, 0], 60], ['diagonal 150', [1, 0, 1], 150]])
  for (const vy of [0, -10]) cases.push({ h, name, rot: qAxis(ax, deg), vy, spin: [0, 0, 0] });
for (let i = 0; i < 16; i++) cases.push({ h: 8 + (i % 4) * 6, name: `tumbling #${i}`, rot: qAxis([Math.sin(i), 1.3, Math.cos(i * 2)], 40 * i), vy: -(i % 3) * 4, spin: [Math.sin(i) * 3, 1.5, Math.cos(i) * 3], vx: (i % 2) * 12 });
// Physics bound: is a rescue possible at all? Turning past ~60 degrees costs time (lift is useless while flipped),
// then the car must stop from the speed it reached, at <= 80 % of its best deceleration (60 kN lift on 2.3 t).
const tiltOf = (q) => Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z)))) * 57.3;
function feasible(c) {
  const g = 9.81, aMax = 0.8 * (60000 / 2300 - g), tilt = tiltOf(c.rot), spin = Math.hypot(...c.spin);
  const tf = (tilt > 60 ? 0.35 + 0.35 * (tilt / 180) : 0.15) + 0.1 * spin;
  const v0 = -c.vy, v1 = v0 + g * tf, h1 = c.h - (v0 * tf + 0.5 * g * tf * tf);
  return h1 > 0.3 + (v1 * v1) / (2 * aMax);
}
let pass = 0, fail = 0, minFail = Infinity, impossible = 0, savedAnyway = 0;
for (const c of cases) {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); w.timestep = DT; buildWorld(RAPIER, w);
  const v = new Vehicle(RAPIER, w, 'rocket');
  v.reset([300, c.h + 0.5, 300], 0, { rot: c.rot, vel: [c.vx || 0, c.vy, 0], spin: c.spin });
  v.step(DT); w.step();
  let touchV = null, t = 0;
  while (t < 12) {
    const vyBefore = v.body.linvel().y; const cBefore = v.contacts;
    v.step(DT); w.step(); t += DT;
    if (touchV === null && cBefore === 0 && v.contacts > 0) touchV = -vyBefore;
    if (touchV !== null && t > 1 && v.speed < 0.3) break;
  }
  const up = v.telemetry().upY, ok = touchV !== null && touchV < 4 && up > 0.85, can = feasible(c);
  if (!can) { impossible++; if (ok) savedAnyway++; continue; }
  if (ok) pass++; else { fail++; minFail = Math.min(minFail, c.h); }
  if (!ok || process.argv.includes('-v')) console.log(`${ok ? 'PASS' : 'FAIL'}  h=${c.h} m  ${c.name}  vy0=${c.vy}  touchdown=${touchV?.toFixed(2)} m/s  upright=${up.toFixed(2)}  air used=${(300 - v.gas).toFixed(0)} kg`);
}
console.log(`\n${pass}/${pass + fail} physically possible rescues passed${fail ? `, lowest failing height ${minFail} m` : ''}`);
console.log(`${impossible} cases are physically impossible (too low and too fast to flip and stop); ${savedAnyway} of those were saved anyway.`);
process.exit(fail ? 1 : 0);
