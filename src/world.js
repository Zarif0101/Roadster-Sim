// Test playground: physics colliders + a list of shapes for the renderer.
// No three.js import so it also runs headless in Node.

export const LOOP = { R: 6, z0: -60, x: 0, width: 5, segs: 48, ceilLen: 14 };
export const PARK = { lanes: [85, 97, 109, 121, 133, 145, 157, 169, 181] };
export const KICK = { x: 40, zStart: -36, len: 8, angle: 15, cars: [
  { name: 'Model 3', L: 4.7, W: 1.85, H: 1.45, color: 0xb0302a },
  { name: 'Model Y', L: 4.75, W: 1.92, H: 1.62, color: 0x2a4fb0 },
  { name: 'Cybercab', L: 4.2, W: 1.9, H: 1.4, color: 0xd9b93a },
  { name: 'Cybertruck', L: 5.7, W: 2.2, H: 1.9, color: 0x9aa0a6 },
  { name: 'Semi', L: 7.0, W: 2.6, H: 3.8, color: 0xe8e8e8 },
] };

const qX = (a) => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });

export function buildWorld(R, world) {
  const shapes = [];
  const box = (size, pos, quat = { x: 0, y: 0, z: 0, w: 1 }, color = 0x55606b, label = null, friction = 1.0) => {
    const d = R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      .setTranslation(...pos).setRotation(quat).setFriction(friction);
    world.createCollider(d);
    shapes.push({ size, pos, quat, color, label });
  };

  // ground (visual ground drawn separately)
  world.createCollider(R.ColliderDesc.cuboid(400, 0.5, 400).setTranslation(0, -0.5, 0).setFriction(1.0));

  // Reveal ramp: curved half-loop that ends upside down, then a ceiling section.
  const { R: r, z0, x, width, segs, ceilLen } = LOOP;
  const dth = Math.PI / segs, th = 0.4;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) * dth;
    const p = [x, r - r * Math.cos(t), z0 - r * Math.sin(t)];
    const n = [0, Math.cos(t), Math.sin(t)];
    box([width, th, r * dth * 1.06], [p[0], p[1] - n[1] * th / 2, p[2] - n[2] * th / 2], qX(t), 0x8a939c);
  }
  box([width, th, ceilLen], [x, 2 * r + th / 2, z0 + ceilLen / 2], undefined, 0x8a939c, 'Ceiling section');
  // support towers
  for (const sx of [-1, 1]) {
    box([0.6, 2 * r + 1.2, 0.6], [x + sx * (width / 2 + 0.5), r + 0.6, z0 - r], undefined, 0x4a5058);
    box([0.6, 2 * r + 1.2, 0.6], [x + sx * (width / 2 + 0.5), r + 0.6, z0 + ceilLen], undefined, 0x4a5058);
  }

  // Kickflip lane: kicker ramp + row of parked vehicles
  const a = (KICK.angle * Math.PI) / 180, L = KICK.len;
  const h = L * Math.sin(a);
  box([5, 0.4, L], [KICK.x, h / 2 - 0.2 * Math.cos(a), KICK.zStart - (L * Math.cos(a)) / 2 + 0.2 * Math.sin(a)], qX(a), 0x7c838c, 'Kicker');
  let z = KICK.zStart - L * Math.cos(a) - 5;
  for (const c of KICK.cars) {
    z -= c.W / 2;
    box([c.L, c.H, c.W], [KICK.x, c.H / 2, z], undefined, c.color, c.name);
    z -= c.W / 2 + 0.6;
  }
  KICK.rowEnd = z;

  // ---------- Test park: one lane per feature, all driving toward -Z ----------
  const RAMP = 0x8a939c, inc = (x, z0, L, deg, rising = true, y0 = 0, label = null, w = 5) => {
    const a = (deg * Math.PI) / 180, h = L * Math.sin(a), ny = Math.cos(a), nz = rising ? Math.sin(a) : -Math.sin(a);
    const cz = z0 - (L * Math.cos(a)) / 2, cy = rising ? y0 + h / 2 : y0 - h / 2;
    box([w, 0.4, L], [x, cy - ny * 0.2, cz - nz * 0.2], qX(rising ? a : -a), RAMP, label);
    return { z: z0 - L * Math.cos(a), y: rising ? y0 + h : y0 - h };
  };
  const solid = (x, zFrom, zTo, hgt, label) => box([5, hgt, zFrom - zTo], [x, hgt / 2, (zFrom + zTo) / 2], undefined, RAMP, label);
  const P = PARK;
  inc(P.lanes[0], -20, 8, 10, true, 0, 'Kicker 10°');
  inc(P.lanes[1], -20, 7, 20, true, 0, 'Kicker 20°');
  inc(P.lanes[2], -20, 6, 30, true, 0, 'Kicker 30°');
  { const up = inc(P.lanes[3], -15, 8, 15, true, 0, 'Table-top'); solid(P.lanes[3], up.z, up.z - 10, up.y); inc(P.lanes[3], up.z - 10, 8, 15, false, up.y); }
  { const R = 6, n = 20, x = P.lanes[4], z0 = -30; // quarter pipe, 0 to 80 degrees
    for (let i = 0; i < n; i++) { const t = ((i + 0.5) / n) * (80 * Math.PI / 180), dth = (80 * Math.PI / 180) / n;
      const p = [x, R - R * Math.cos(t), z0 - R * Math.sin(t)], nn = [0, Math.cos(t), Math.sin(t)];
      box([5, 0.4, R * dth * 1.06], [p[0], p[1] - nn[1] * 0.2, p[2] - nn[2] * 0.2], qX(t), RAMP, i === n - 1 ? 'Quarter pipe' : null); } }
  { const up = inc(P.lanes[5], -15, 15, 12, true, 0, 'Step-up + drop-off'); solid(P.lanes[5], up.z, up.z - 14, up.y); }
  for (let i = 0; i < 8; i++) box([5, 0.12, 0.5], [P.lanes[6], 0.06, -15 - i * 3], undefined, 0x2f3338, i === 0 ? 'Speed bumps' : null);
  for (let i = 0; i < 24; i++) box([5, 0.05, 0.25], [P.lanes[6], 0.025, -45 - i * 0.6], undefined, 0x2f3338, i === 0 ? 'Rumble strip' : null);
  { let z = -15, y = 0; for (let k = 0; k < 4; k++) { const a = inc(P.lanes[7], z, 6, 9, true, y, k === 0 ? 'Wave road' : null); const b = inc(P.lanes[7], a.z, 6, 9, false, a.y); z = b.z; y = b.y; } }
  for (let i = 0; i < 8; i++) box([0.45, 0.75, 0.45], [P.lanes[8] + (i % 2 ? 1.6 : -1.6), 0.375, -15 - i * 9], undefined, 0xe85d1f, i === 0 ? 'Slalom' : 'cone');

  // a few obstacles on the test pad
  box([2, 1, 2], [-20, 0.5, -20], undefined, 0x2f3338);
  box([2, 1, 2], [-24, 0.5, -30], undefined, 0x2f3338);
  box([10, 3, 0.5], [-30, 1.5, 10], undefined, 0x6b727a, 'Wall');

  return shapes;
}

// Named start poses: [x, y, z], yaw (0 = facing -Z)
export const SPAWNS = {
  pad: { pos: [0, 0.6, 20], yaw: 0 },
  loop: { pos: [0, 0.6, -5], yaw: 0 },
  kick: { pos: [KICK.x, 0.6, 30], yaw: 0 },
  drag: { pos: [-60, 0.6, 60], yaw: 0 },
  park: { pos: [121, 0.6, 25], yaw: 0 },
};
