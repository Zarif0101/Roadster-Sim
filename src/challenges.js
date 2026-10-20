// Challenges: short tests of driving and piloting skill, scored from the live physics. Best scores stay in
// this browser (localStorage). Each challenge sets up the car, then update() reports progress every frame.
import * as THREE from 'three';
import { LOOP, PARK } from './world.js';

const PAD = new THREE.Vector3(0, 0, 20);
const best = () => { try { return JSON.parse(localStorage.getItem('roadster.best') || '{}'); } catch { return {}; } };
export function saveBest(id, score, lowBetter) {
  const b = best(), old = b[id];
  const better = old == null || (lowBetter ? score < old : score > old);
  if (better) { b[id] = score; try { localStorage.setItem('roadster.best', JSON.stringify(b)); } catch {} }
  return { better, best: better ? score : old };
}
export const bestOf = (id) => best()[id];
export const medal = (c, s) => { const [g, si, b] = c.medals; const ok = (x) => (c.low ? s <= x : s >= x); return ok(g) ? 'gold' : ok(si) ? 'silver' : ok(b) ? 'bronze' : null; };
const qAxis = (ax, deg) => { const h = (deg * Math.PI) / 360, l = Math.hypot(...ax); return { x: (ax[0] / l) * Math.sin(h), y: (ax[1] / l) * Math.sin(h), z: (ax[2] / l) * Math.sin(h), w: Math.cos(h) }; };

export const CHALLENGES = [
  { id: 'land', title: 'Precision landing', goal: 'Fly to the pad and land in the centre. H holds height; W/S tilt, A/D turn, Q/E height.', unit: 'm off centre', low: true, medals: [0.5, 1.5, 3], config: 'rocket',
    setup(v) { v.reset([14, 9, 34], -0.6); v.mode = 'HOVER'; v.altTarget = 8; v.autoRescue = true; },
    update(v, t) {
      const p = v.body.translation(), d = Math.hypot(p.x - PAD.x, p.z - PAD.z);
      if (t > 1.5 && v.contacts >= 3 && v.speed < 0.3) return { done: true, score: d, text: `Landed ${d.toFixed(2)} m from the centre` };
      if (t > 90) return { done: true, fail: 'Out of time' };
      return { text: `${d.toFixed(1)} m to the pad · height ${Math.max(0, v.height).toFixed(1)} m · gas ${(100 * v.gas / v.gas0).toFixed(0)} %` };
    } },
  { id: 'gates', title: 'Hover gates', goal: 'Hover through the five red rings in order, as fast as you can.', unit: 's', low: true, medals: [28, 40, 60], config: 'rocket',
    gates: [[0, 4, 4], [14, 6, -6], [28, 7.5, 6], [16, 5, 20], [2, 3.5, 30]],
    setup(v, ctx) { v.reset([0, 0.6, 20], Math.PI); v.unlimited = true; ctx.next = 0; ctx.rings = this.gates.map((g, i) => ctx.addRing(g, i === 0)); },
    update(v, t, ctx) {
      const p = v.body.translation(), g = this.gates[ctx.next];
      if (Math.hypot(p.x - g[0], p.y - g[1], p.z - g[2]) < 2.2) { ctx.lightRing(ctx.next, false); ctx.next++; if (ctx.next < this.gates.length) ctx.lightRing(ctx.next, true); }
      if (ctx.next >= this.gates.length) return { done: true, score: t, text: `All gates in ${t.toFixed(2)} s` };
      return { text: `Gate ${ctx.next + 1} of 5 · ${t.toFixed(1)} s · H to hover` };
    } },
  { id: 'ceiling', title: 'Ceiling hold', goal: 'Drive up the reveal ramp with the fans on and stay upside down as long as you can.', unit: 's upside down', low: false, medals: [12, 6, 3], config: 'rocket',
    setup(v, ctx) { v.reset([LOOP.x, 0.6, -5], 0); v.fansOn = true; ctx.hold = 0; ctx.was = false; },
    update(v, t, ctx, dt) {
      const inv = v.up[1] < -0.8 && v.contacts >= 2;
      if (inv) { ctx.hold += dt; ctx.was = true; }
      if (ctx.was && !inv && v.contacts < 2) return { done: true, score: ctx.hold, text: `Held on for ${ctx.hold.toFixed(1)} s` };
      if (t > 75) return { done: true, score: ctx.hold, text: `Time: held ${ctx.hold.toFixed(1)} s` };
      return { text: inv ? `Upside down ${ctx.hold.toFixed(1)} s · watch the suction` : 'Fans on (F) · W up the ramp, keep about 30 km/h' };
    } },
  { id: 'launch', title: '0–60 mph', goal: 'Launch from a standstill. Fans (F) add grip; Shift fires the boost thrusters.', unit: 's', low: true, medals: [0.9, 1.3, 2.2], config: 'thrust',
    setup(v, ctx) { v.reset([-60, 0.6, 60], 0); ctx.armed = true; },
    update(v, t, ctx) {
      if (ctx.armed && v.input.throttle > 0) { ctx.armed = false; v.launchT = v.time; v.t60 = null; }
      if (v.t60 != null) return { done: true, score: v.t60, text: `0–60 mph in ${v.t60.toFixed(2)} s` };
      return { text: ctx.armed ? 'Ready · press W to launch' : `${(v.speed * 2.237).toFixed(0)} mph` };
    } },
  { id: 'slalom', title: 'Slalom', goal: 'Weave through the eight cones. Every cone you hit adds 2 s.', unit: 's', low: true, medals: [10.5, 13, 17], config: 'performance',
    setup(v, ctx) { v.reset([PARK.lanes[8], 0.6, 2], 0); ctx.start = null; ctx.hit = new Set(); },
    update(v, t, ctx) {
      const p = v.body.translation();
      if (ctx.start == null && p.z < -8) ctx.start = t;
      for (let i = 0; i < 8; i++) { const cx = PARK.lanes[8] + (i % 2 ? 1.6 : -1.6), cz = -15 - i * 9; if (Math.hypot(p.x - cx, p.z - cz) < 1.25) ctx.hit.add(i); }
      if (ctx.start != null && p.z < -88) { const s = t - ctx.start + 2 * ctx.hit.size; return { done: true, score: s, text: `${s.toFixed(2)} s (${ctx.hit.size} cones hit)` }; }
      return { text: ctx.start == null ? 'Cross the start line' : `${(t - ctx.start).toFixed(1)} s · ${ctx.hit.size} cones hit` };
    } },
  { id: 'drop', title: 'Save it yourself', goal: 'Auto-rescue is off. The car drops at a bad angle: press H, fly it level and land under 4 m/s.', unit: 'm/s touchdown', low: true, medals: [1.5, 2.5, 4], config: 'rocket',
    setup(v, ctx) {
      const a = [[1, 0, 0.4], [0.3, 0, 1], [1, 0, -1]][Math.floor(Math.random() * 3)], deg = 40 + Math.random() * 50;
      v.reset([0, 16 + Math.random() * 6, 20], Math.random() * 6, { rot: qAxis(a, deg) }); v.autoRescue = false; ctx.prevVy = 0; ctx.touch = null;
    },
    update(v, t, ctx) {
      const vy = v.body.linvel().y;
      if (ctx.touch == null && v.contacts > 0 && t > 0.3) ctx.touch = -ctx.prevVy;
      ctx.prevVy = vy;
      if (ctx.touch != null && v.speed < 0.5) {
        const ok = v.up[1] > 0.85 && ctx.touch < 4;
        return ok ? { done: true, score: ctx.touch, text: `Touchdown at ${ctx.touch.toFixed(1)} m/s` } : { done: true, fail: v.up[1] < 0.85 ? 'Landed on its side' : `Too hard: ${ctx.touch.toFixed(1)} m/s` };
      }
      return { text: `${Math.max(0, v.height).toFixed(1)} m · sinking ${Math.max(0, -vy).toFixed(1)} m/s · H = hover` };
    } },
];
