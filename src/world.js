// Test playground: physics colliders + a list of shapes for the renderer.
// No three.js import so it also runs headless in Node.

export const LOOP = { R: 6, z0: -60, x: 0, width: 5, segs: 48, ceilLen: 14 };
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
    box([0.6, 2 * r + 1.2, 0.6], [x + sx * (width / 2 + 0.5), r + 0.6, z0 - r], undefined, 0x2b3138);
    box([0.6, 2 * r + 1.2, 0.6], [x + sx * (width / 2 + 0.5), r + 0.6, z0 + ceilLen], undefined, 0x2b3138);
  }

  // Kickflip lane: kicker ramp + row of parked vehicles
  const a = (KICK.angle * Math.PI) / 180, L = KICK.len;
  const h = L * Math.sin(a);
  box([5, 0.4, L], [KICK.x, h / 2 - 0.2 * Math.cos(a), KICK.zStart - (L * Math.cos(a)) / 2 + 0.2 * Math.sin(a)], qX(a), 0xc9a227, 'Kicker');
  let z = KICK.zStart - L * Math.cos(a) - 5;
  for (const c of KICK.cars) {
    z -= c.W / 2;
    box([c.L, c.H, c.W], [KICK.x, c.H / 2, z], undefined, c.color, c.name);
    z -= c.W / 2 + 0.6;
  }
  KICK.rowEnd = z;

  // a few obstacles on the test pad
  box([2, 1, 2], [-20, 0.5, -20], undefined, 0xe06a2a);
  box([2, 1, 2], [-24, 0.5, -30], undefined, 0xe06a2a);
  box([10, 3, 0.5], [-30, 1.5, 10], undefined, 0x3a4450, 'Wall');

  return shapes;
}

// Named start poses: [x, y, z], yaw (0 = facing -Z)
export const SPAWNS = {
  pad: { pos: [0, 0.6, 20], yaw: 0 },
  loop: { pos: [0, 0.6, -5], yaw: 0 },
  kick: { pos: [KICK.x, 0.6, 30], yaw: 0 },
  drag: { pos: [-60, 0.6, 60], yaw: 0 },
};
