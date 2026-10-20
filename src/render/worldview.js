// Visuals for the static test world built in world.js (physics colliders live there).
import * as THREE from 'three';
import { LOOP, KICK, PARK } from '../world.js';
import { canvasTex, grain, labelSprite } from './tex.js';

export function buildWorldView(scene, shapes) {
  const root = new THREE.Group(); scene.add(root);
  const concreteTex = canvasTex(512, 512, (g, w, h) => grain(g, w, h, '#a4a7aa', { fine: 0.1, blot: 0.12, seed: 21 }));
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.78, color: 0xffffff });
  const darkConcrete = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.8, color: 0x6c7075 });
  const asphalt = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => grain(g, w, h, '#2a2b2d', { fine: 0.14, blot: 0.06, seed: 22 }), { repeat: [2, 30] }), roughness: 0.86 });
  const paintW = new THREE.MeshStandardMaterial({ color: 0xc9cbcd, roughness: 0.7 });
  const led = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff1e2a, emissiveIntensity: 3 });
  const labels = [];
  const label = (t, p, opt) => { const s = labelSprite(t, opt); s.position.set(...p); root.add(s); labels.push(s); return s; };

  // lanes: asphalt strips with painted edge lines
  const lane = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), asphalt); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); m.receiveShadow = true; root.add(m);
    for (const lx of [-w / 2 + 0.35, w / 2 - 0.35]) { const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.15, l), paintW); ln.rotation.x = -Math.PI / 2; ln.position.set(x + lx, 0.01, z); ln.receiveShadow = true; root.add(ln); }
  };
  lane(12, 140, KICK.x, -20); lane(14, 420, -60, -120); lane(9, 70, 0, -35);
  for (const x of PARK.lanes) lane(8, 110, x, -30);
  // hover pad: painted ring and cross
  const pad = new THREE.Mesh(new THREE.RingGeometry(3.75, 4, 96), paintW); pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.012, 20); root.add(pad);
  for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 2.4), paintW); b.rotation.set(-Math.PI / 2, 0, r); b.position.set(0, 0.012, 20); root.add(b); }

  // parked vehicles (kickflip lane): extruded side profiles with a dark glasshouse; rough but recognisable
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0c0f, metalness: 0.6, roughness: 0.08, clearcoat: 1 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.9 });
  const PROFILES = {
    'Model 3': { body: [[0, 0.3], [0.1, 0.62], [0.9, 0.8], [3.7, 0.86], [4.6, 0.7], [4.7, 0.3]], roof: [[1.4, 0.82], [2.0, 1.4], [3.2, 1.45], [4.1, 0.9]] },
    'Model Y': { body: [[0, 0.32], [0.1, 0.66], [0.9, 0.86], [3.7, 0.95], [4.7, 0.8], [4.75, 0.32]], roof: [[1.3, 0.88], [1.95, 1.58], [3.6, 1.6], [4.55, 1.0]] },
    'Cybercab': { body: [[0, 0.3], [0.2, 0.7], [3.9, 0.75], [4.2, 0.3]], roof: [[0.6, 0.72], [1.5, 1.38], [3.2, 1.4], [4.1, 0.8]] },
  };
  function parked(c, pos) {
    const g = new THREE.Group(), paint = new THREE.MeshPhysicalMaterial({ color: c.color, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
    const ext = (pts, depth, mat, z0, bevel = 0.06) => { const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a - c.L / 2, b))); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 }), mat); m.position.z = z0; g.add(m); return m; };
    if (c.name === 'Cybertruck') {
      const s = [[0, 0.4], [0.05, 0.95], [2.2, 1.9], [c.L, 1.15], [c.L, 0.4]];
      const m = ext(s, c.W - 0.1, new THREE.MeshStandardMaterial({ color: 0xa8adb2, metalness: 0.9, roughness: 0.35, flatShading: true }), -c.W / 2 + 0.05, 0.01);
      ext([[1.1, 1.38], [2.2, 1.86], [3.4, 1.55], [3.3, 1.3]], c.W - 0.06, glass, -c.W / 2 + 0.03, 0.005); m.castShadow = true;
    } else if (c.name === 'Semi') {
      ext([[0, 0.6], [0, 3.1], [0.5, 3.7], [2.6, 3.7], [2.6, 0.6]], c.W - 0.2, paint, -c.W / 2 + 0.1, 0.08);
      ext([[0.02, 2.2], [0.35, 3.3], [0.4, 3.3], [0.1, 2.2]], c.W - 0.3, glass, -c.W / 2 + 0.15, 0.01);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(c.L - 2.7, 0.35, c.W * 0.7), new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.6 })); bed.position.set(1.4, 0.95, 0); g.add(bed);
    } else {
      const p = PROFILES[c.name]; ext(p.body, c.W - 0.16, paint, -c.W / 2 + 0.08); ext(p.roof, c.W - 0.36, glass, -c.W / 2 + 0.18, 0.08);
    }
    const r = c.name === 'Semi' ? 0.5 : 0.36;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.26, 24).rotateX(Math.PI / 2), tyre); w.position.set(sx * (c.L / 2 - (c.name === 'Semi' ? 1 : 0.85)), r, sz * (c.W / 2 - 0.14)); g.add(w); }
    g.position.set(pos[0], 0, pos[2]); g.rotation.y = 0; g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); root.add(g);
  }

  const cone = new THREE.MeshStandardMaterial({ color: 0xec5a1c, roughness: 0.55 });
  for (const s of shapes) {
    if (s.label === 'cone' || s.label === 'Slalom') {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.72, 20), cone); m.position.set(s.pos[0], 0.36, s.pos[2]); m.castShadow = true; root.add(m);
      if (s.label === 'Slalom') label('Slalom', [s.pos[0] + 1.6, 2.2, s.pos[2] + 4]);
      continue;
    }
    const pc = KICK.cars.find((c) => c.name === s.label);
    if (pc) { parked(pc, s.pos); label(s.label, [s.pos[0] + 4.6, s.size[1] + 0.9, s.pos[2]], { scale: 0.8 }); continue; }
    const mat = s.color === 0x8a939c ? concrete : s.color === 0x2f3338 ? darkConcrete : s.color === 0x4a5058 ? darkConcrete : new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(...s.size), mat);
    m.position.set(...s.pos); m.quaternion.set(s.quat.x, s.quat.y, s.quat.z, s.quat.w); m.castShadow = m.receiveShadow = true; root.add(m);
    if (s.label && !['Ceiling section', 'Kicker', 'Wall'].includes(s.label)) label(s.label, [s.pos[0], Math.max(2.2, s.pos[1] + s.size[1] / 2 + 1.4), s.pos[2] + (s.label === 'Quarter pipe' ? 3 : 4)], { scale: 0.85 });
  }

  // reveal ramp dressing (photo #02): white centre stripe and red LED strips along both edges, up and over
  const { R, z0, x, width, ceilLen } = LOOP;
  const loopPts = (off) => { const pts = []; for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI; pts.push(new THREE.Vector3(x + off, R - R * Math.cos(t) + 0.02 * Math.cos(t), z0 - R * Math.sin(t) + 0.02 * Math.sin(t))); } pts.push(new THREE.Vector3(x + off, 2 * R - 0.02, z0 + ceilLen)); return pts; };
  for (const off of [-width / 2 + 0.06, width / 2 - 0.06]) root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loopPts(off)), 160, 0.045, 6), led));
  const stripe = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loopPts(-0.6)), 160, 0.012, 3); root.add(new THREE.Mesh(stripe, paintW));
  const red = new THREE.PointLight(0xff2030, 40, 30, 2); red.position.set(x, R, z0 - R + 2); root.add(red);

  label('Test park', [PARK.lanes[4], 3.2, 6]);
  label('Reveal ramp', [LOOP.x, 2 * LOOP.R + 2.6, LOOP.z0 - 2]);
  label('Kickflip lane', [KICK.x, 2.2, 18]);
  label('0–60 strip', [-60, 1.6, 58]);
  return { root, labels };
}
