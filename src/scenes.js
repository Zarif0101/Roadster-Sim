// Autopilot demo scenes. Each one drives the same live physics a human would;
// the script only sets inputs and controller targets. Any key press hands control back.
import { SPAWNS, LOOP, KICK } from './world.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const pos = (v) => v.body.translation();
const vel = (v) => v.body.linvel();

// Keep the car on a straight line x = x0 while driving along Z.
const laneSteer = (v, x0) => clamp(0.25 * (pos(v).x - x0) + 0.35 * vel(v).x, -1, 1);
const speedHold = (v, target) => clamp(0.5 * (target - v.vLong), -1, 1);

export const SCENES = {
  launch: {
    title: '0–60 mph launch',
    desc: 'Full throttle with fans on and both rear boost thrusters. Reported at the reveal: 0.81 s.',
    spawn: 'drag', config: 'rocket',
    start(v) { v.fansOn = true; this.ph = 'spool'; this.t0 = 0; },
    update(v, t) {
      const i = v.input;
      if (this.ph === 'spool' && t > 1.0) { this.ph = 'go'; v.launchT = v.time; v.event('Launch'); }
      if (this.ph === 'go') {
        i.throttle = 1; i.steer = laneSteer(v, SPAWNS.drag.pos[0]);
        const boost = v.speed < 26.82 ? 1 : 0;
        v.manual[0] = v.manual[1] = boost;
        if (!boost) { this.ph = 'coast'; this.tc = t; }
      }
      if (this.ph === 'coast') { i.throttle = 0; i.brake = 1; v.manual[0] = v.manual[1] = 0; i.steer = laneSteer(v, SPAWNS.drag.pos[0]); if (v.speed < 0.5) return true; }
      return false;
    },
  },

  hover: {
    title: 'Hover',
    desc: 'Lift thrusters hold 3 m, climb to 6 m and spin, then land. It auto-lands if gas drops below 30 %.',
    spawn: 'pad', config: 'rocket',
    start(v) { v.mode = 'HOVER'; v.altTarget = 3; this.ph = 'up'; },
    update(v, t) {
      const tel = v.telemetry();
      if (this.ph !== 'land' && tel.gasPct < 30) { this.ph = 'land'; v.event('Gas reserve: auto-land'); }
      if (this.ph === 'up' && t > 4) { this.ph = 'high'; v.altTarget = 5; }
      if (this.ph === 'high' && t > 6.5) { this.ph = 'spin'; v.override = { yawRate: 1.5 }; }
      if (this.ph === 'spin' && t > 9) { this.ph = 'land'; v.override = null; }
      if (this.ph === 'land') { v.altTarget = -0.5; if (v.contacts >= 3 && Math.abs(vel(v).y) < 0.3) { v.mode = 'MANUAL'; return true; } }
      return false;
    },
  },

  ramp: {
    title: 'Reveal ramp',
    desc: 'Recreates the reveal stunt: drive up a curved ramp onto the ceiling, hang upside down on fan suction, drop, flip with thrusters and land.',
    spawn: 'loop', config: 'rocket',
    start(v) { v.fansOn = true; this.ph = 'climb'; },
    update(v, t) {
      const i = v.input, p = pos(v);
      if (this.ph === 'climb') {
        i.throttle = speedHold(v, 9); i.brake = 0; i.steer = laneSteer(v, LOOP.x);
        if (v.up[1] < -0.9 && p.z > LOOP.z0 + 5) { this.ph = 'hold'; this.th = t; v.event('Upside down: fans holding'); }
      } else if (this.ph === 'hold') {
        i.throttle = 0; i.brake = 1; i.steer = 0;
        if (v.contacts < 2) { this.ph = 'drop'; v.event('Detached: suction lost'); }
        if (t - this.th > 3) { this.ph = 'drop'; v.fansOn = false; v.event('Fans off: release'); }
      } else if (this.ph === 'drop') {
        i.brake = 0; v.fansOn = false; v.mode = 'HOVER'; v.altTarget = -0.5;
        if (v.contacts >= 3 && v.up[1] > 0.8 && Math.abs(vel(v).y) < 0.5) { this.ph = 'done'; v.mode = 'MANUAL'; v.event('Landed upright'); }
      } else { i.brake = 1; if (v.speed < 0.3) return true; }
      return false;
    },
  },

  kickflip: {
    title: 'Kickflip',
    desc: 'Thrust-assisted jump over five parked vehicles with a full 360° spin in mid-air.',
    spawn: 'kick', config: 'rocket',
    start(v) { this.ph = 'run'; this.yaw = 0; },
    update(v, t, dt) {
      const i = v.input, p = pos(v);
      if (this.ph === 'run') {
        i.throttle = speedHold(v, 19); i.steer = laneSteer(v, KICK.x);
        if (v.contacts === 0 && p.z < KICK.zStart - 2) { this.ph = 'air'; v.mode = 'STABILIZE'; v.event('Take-off'); }
      } else if (this.ph === 'air') {
        i.throttle = 0; i.steer = 0;
        this.yaw += v.telemetry().yawRate / 57.3 * dt;
        v.override = { liftG: 0.5, yawRate: clamp(2.6 * (2 * Math.PI - this.yaw), -4.5, 4.5) };
        if (v.contacts >= 3 && p.z < KICK.rowEnd) { this.ph = 'out'; v.override = null; v.mode = 'MANUAL'; v.event(`Landed, spun ${(this.yaw * 57.3).toFixed(0)}°`); }
      } else { i.brake = 1; i.steer = 0; if (v.speed < 0.3) return true; }
      return false;
    },
  },
};
