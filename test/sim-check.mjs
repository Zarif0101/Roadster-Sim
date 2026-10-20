// Headless physics checks + scene dry-runs. Run: node test/sim-check.mjs
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from '../src/vehicle.js';
import { buildWorld, SPAWNS } from '../src/world.js';
import { SCENES } from '../src/scenes.js';
import { P, THRUSTERS, INERTIA } from '../src/params.js';
import { Cf, cStar } from '../src/physics/coldgas.js';
await RAPIER.init();
const DT = 1 / 120;
const make = () => {
  const world = new RAPIER.World({ x: 0, y: -P.gravity.v, z: 0 });
  world.timestep = DT;
  buildWorld(RAPIER, world);
  return { world, v: new Vehicle(RAPIER, world, 'rocket') };
};
const step = (s) => { s.v.step(DT); s.world.step(); };
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) fails++; };

// V1 free fall: drop from 30 m high, compare against 0.5 g t^2 for 1 s
{ const s = make(); s.v.reset([200, 30, 200], 0); const y0 = s.v.body.translation().y;
  for (let i = 0; i < 120; i++) step(s);
  const dy = y0 - s.v.body.translation().y, exp = 0.5 * 9.81 * 1 ** 2 - 0; // drag is tiny at <10 m/s
  check('free fall 1 s', Math.abs(dy - exp) / exp < 0.02, `dy=${dy.toFixed(3)} expected≈${exp.toFixed(3)}`); }

// Settle on ground at rest
{ const s = make(); s.v.reset(SPAWNS.pad.pos, 0); for (let i = 0; i < 360; i++) step(s);
  const t = s.v.telemetry();
  check('settles on 4 wheels', t.contacts === 4 && t.speed < 0.05, `contacts=${t.contacts} speed=${t.speed.toFixed(3)} y=${t.y.toFixed(3)} loads=${t.loads.map(x=>x.toFixed(1))}`); }

// Off-centre thruster torque: T9 (tail push left) alone, in the air, zero gravity, valve fully open
{ const s = make(); s.world.gravity = { x: 0, y: 0, z: 0 }; s.v.reset([200, 50, 200], 0); s.v.unlimited = true; s.v.autoRescue = false;
  s.v.manual[8] = 1; s.v.valve[8] = 1; step(s); const w0 = s.v.body.angvel().y; step(s); const w = s.v.body.angvel();
  // tau_y = r x F: r=(0,0,z), F=(-Fmax,0,0) -> tau_y = z*Fx = -z*Fmax -> yaw right (negative)
  const expW = ((-THRUSTERS[8].pos[2] * THRUSTERS[8].max) / (INERTIA.y * s.v.mass / 2300)) * DT;
  check('T9 yaw torque sign/size', Math.abs(w.y - w0 - expW) / Math.abs(expW) < 0.05, `dwy=${(w.y - w0).toExponential(3)} expected=${expW.toExponential(3)}`); }

// Gas use over a known firing: T1+T2 full for 1 s. Expected from choked-nozzle theory: mdot = F / (Cf * c*)
{ const s = make(); s.world.gravity = { x: 0, y: 0, z: 0 }; s.v.reset([200, 50, 200], 0); s.v.autoRescue = false;
  const g0 = s.v.gas, T0 = s.v.tank.T; s.v.manual[0] = s.v.manual[1] = 1; for (let i = 0; i < 120; i++) step(s);
  const F = THRUSTERS[0].max + THRUSTERS[1].max, ve = Cf(P.regPressure.v * 1e5, P.nozzleEps.v) * cStar((T0 + s.v.tank.T) / 2);
  const exp = (F / ve) * (1 - 0.02 / 1); // first ~20 ms the valves are still opening
  check('gas use, 1 s boost vs choked-flow theory', Math.abs(g0 - s.v.gas - exp) / exp < 0.03, `used=${(g0 - s.v.gas).toFixed(2)} kg, theory ${exp.toFixed(2)} kg, tank ${T0.toFixed(0)}->${s.v.tank.T.toFixed(0)} K`); }

// Scenes
for (const [key, sc] of Object.entries(SCENES)) {
  const s = make(); const sp = SPAWNS[sc.spawn]; s.v.setConfig(sc.config); s.v.reset(sp.pos, sp.yaw);
  for (let i = 0; i < 120; i++) step(s);
  sc.start(s.v); let t = 0, done = false, minUp = 1, maxH = 0, crashed = false;
  for (let i = 0; i < 120 * 40 && !done; i++) {
    done = sc.update(s.v, t, DT); step(s); t += DT;
    const tel = s.v.telemetry(); minUp = Math.min(minUp, tel.upY); maxH = Math.max(maxH, tel.height);
    if (tel.contacts === 0 && tel.upY < 0 && tel.height < 0.3) crashed = true;
    if (i % 120 === 0 && process.argv.includes('-v')) console.log(key, t.toFixed(1), sc.ph, `h=${tel.height.toFixed(2)} up=${tel.upY.toFixed(2)} v=${tel.speed.toFixed(1)} z=${tel.z.toFixed(1)} gas=${tel.gasPct.toFixed(0)}% c=${tel.contacts}`);
  }
  const tel = s.v.telemetry();
  check(`scene ${key}`, done && tel.upY > 0.9, `done=${done} t=${t.toFixed(1)}s upY=${tel.upY.toFixed(2)} minUp=${minUp.toFixed(2)} maxH=${maxH.toFixed(1)} gas=${tel.gasPct.toFixed(0)}% t60=${tel.t60?.toFixed(2)} events=${s.v.events.map(e=>e.text).join(' | ')}`);
}
process.exit(fails ? 1 : 0);
