// Wheels-only 0-60 mph (no thrusters), for comparison with the 2017 claim of 1.9 s
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from '../src/vehicle.js';
import { buildWorld, SPAWNS } from '../src/world.js';
await RAPIER.init(); const DT = 1 / 120;
for (const fans of [false, true]) {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); w.timestep = DT; buildWorld(RAPIER, w);
  const v = new Vehicle(RAPIER, w, 'performance'); v.reset(SPAWNS.drag.pos, 0); v.fansOn = fans;
  for (let i = 0; i < 120; i++) { v.step(DT); w.step(); }
  v.launchT = v.time; v.input.throttle = 1;
  for (let i = 0; i < 720 && v.t60 === null; i++) { v.step(DT); w.step(); }
  console.log(`wheels only, fans ${fans ? 'on' : 'off'}: 0-60 mph ${v.t60?.toFixed(2)} s`);
}
