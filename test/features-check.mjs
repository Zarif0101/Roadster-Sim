// Feature checks that need no browser: replay buffer, challenge scoring, controller step test.
// Run: node test/features-check.mjs
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from '../src/vehicle.js';
import { buildWorld, SPAWNS } from '../src/world.js';
import { Replay } from '../src/replay.js';
import { CHALLENGES, medal } from '../src/challenges.js';
import { stepResponse } from '../src/lab.js';
import { P } from '../src/params.js';
await RAPIER.init();
const DT = 1 / 120;
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) fails++; };
const make = (cfg) => { const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); w.timestep = DT; buildWorld(RAPIER, w); return { w, v: new Vehicle(RAPIER, w, cfg) }; };

// replay: what goes in comes back out, in order, including after the ring buffer wraps
{ const { w, v } = make('rocket'); v.reset(SPAWNS.drag.pos, 0); const r = new Replay();
  for (let i = 0; i < 4000; i++) { v.input.throttle = 1; v.step(DT); w.step(); if (i % 2 === 0) r.record(v, i * DT); }
  const f = r.frame(r.n - 1), p = v.body.translation();
  check('replay round-trip', r.n === 2000 && Math.abs(f.body.translation().z - p.z) < 0.5 && f.thrust.length === 10 && f.wheels.length === 4, `frames ${r.n}, z rec ${f.body.translation().z.toFixed(2)} vs live ${p.z.toFixed(2)}`);
  check('replay time order', r.frame(0).t < r.frame(r.n - 1).t, `t ${r.frame(0).t.toFixed(2)} → ${r.frame(r.n - 1).t.toFixed(2)} s`); }

// medals follow each challenge's direction (lower is better for times, higher for holds)
{ const land = CHALLENGES.find((c) => c.id === 'land'), hold = CHALLENGES.find((c) => c.id === 'ceiling');
  check('medal thresholds', medal(land, 0.3) === 'gold' && medal(land, 2) === 'bronze' && medal(land, 9) === null && medal(hold, 13) === 'gold' && medal(hold, 4) === 'bronze', 'land 0.3/2/9 m, hold 13/4 s'); }

// the 0-60 challenge, driven by a script, scores from the live physics
{ const c = CHALLENGES.find((x) => x.id === 'launch'), { w, v } = make(c.config), ctx = {};
  c.setup(v, ctx); for (let i = 0; i < 120; i++) { v.step(DT); w.step(); }
  let res, t = 0;
  for (let i = 0; i < 1200 && !res?.done; i++) { v.input.throttle = 1; v.fansOn = true; v.manual[0] = v.manual[1] = 1; v.step(DT); w.step(); t += DT; res = c.update(v, t, ctx, DT); }
  check('0–60 challenge scores', res?.done && res.score > 0.6 && res.score < 1.2, `${res?.score?.toFixed(2)} s, medal ${medal(c, res?.score)}`); }

// flight controller step test: settles on target without big overshoot
{ const r = stepResponse(RAPIER, 'altitude');
  check('height step response', r.metrics.overshoot < 10 && Math.abs(r.metrics.error) < 0.1 && r.metrics.settle < 4, `rise ${r.metrics.rise.toFixed(2)} s, overshoot ${r.metrics.overshoot.toFixed(1)} %, settle ${r.metrics.settle.toFixed(2)} s`); }
check('no wind by default', P.windSpeed.v === 0 && P.windGust.v === 0, '');
process.exit(fails ? 1 : 0);
