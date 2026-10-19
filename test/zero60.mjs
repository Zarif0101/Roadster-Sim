// 0-60 mph per trim, with and without the suction fans (fans add tyre load). Boost thrusters fire where fitted.
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from '../src/vehicle.js';
import { buildWorld, SPAWNS } from '../src/world.js';
await RAPIER.init(); const DT = 1 / 120;
for (const trim of ['performance', 'thrust', 'rocket']) for (const fans of [false, true]) {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); w.timestep = DT; buildWorld(RAPIER, w);
  const v = new Vehicle(RAPIER, w, trim); v.reset(SPAWNS.drag.pos, 0); v.fansOn = fans;
  for (let i = 0; i < 120; i++) { v.step(DT); w.step(); }
  v.launchT = v.time; v.input.throttle = 1; if (v.hasThrusters) v.manual[0] = v.manual[1] = 1;
  for (let i = 0; i < 720 && v.t60 === null; i++) { v.step(DT); w.step(); }
  console.log(`${trim.padEnd(11)} fans ${fans ? 'on ' : 'off'}: 0-60 mph ${v.t60?.toFixed(2)} s`);
}
