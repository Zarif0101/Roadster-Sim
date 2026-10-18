// Visual model only (physics uses a simple hull). Hand-built from the 15 Oct 2026 reveal photos:
// pointed front fender peaks over a recessed hood, wrap-around dark canopy, rear glass sunk between
// faceted haunches, full-width light bars, black diffuser with 4 round outlets, swan-neck wing.
// Built in ground frame (y = height above road, -z = forward), then shifted so the origin is the CoM.
import * as THREE from 'three';
import { THRUSTERS, WHEELS, SUSP_REST } from './params.js';

const CG_H = 0.49;
const WELLS = [[-1.2, 0.43], [1.45, 0.45]]; // wheel arch centre z, radius

// Stations: z, top, p1(x,y), p2(x,y), p3(x,y) shoulder peak, hw, p4y crease, p5y side, p6(x,y) rocker, bottom
const ST = [
  [-2.25, 0.44, 0.30, 0.44, 0.55, 0.47, 0.80, 0.54, 0.86, 0.46, 0.34, 0.84, 0.22, 0.16],
  [-2.05, 0.50, 0.36, 0.50, 0.58, 0.55, 0.88, 0.76, 0.97, 0.60, 0.40, 0.95, 0.24, 0.14],
  [-1.60, 0.56, 0.40, 0.56, 0.60, 0.62, 0.89, 0.85, 1.00, 0.68, 0.40, 0.98, 0.25, 0.14],
  [-0.95, 0.70, 0.50, 0.70, 0.70, 0.76, 0.88, 0.86, 1.00, 0.72, 0.40, 0.98, 0.26, 0.14],
  [-0.20, 1.10, 0.55, 1.09, 0.80, 0.84, 0.92, 0.85, 1.00, 0.74, 0.40, 0.98, 0.26, 0.15],
  [0.35, 1.18, 0.56, 1.17, 0.82, 0.86, 0.93, 0.87, 1.01, 0.76, 0.40, 0.99, 0.27, 0.15],
  [1.00, 1.08, 0.48, 1.07, 0.70, 0.95, 0.94, 0.97, 1.04, 0.82, 0.42, 1.01, 0.28, 0.16],
  [1.60, 0.97, 0.32, 0.97, 0.58, 1.00, 0.94, 1.01, 1.04, 0.88, 0.44, 1.01, 0.30, 0.18],
  [2.00, 0.93, 0.10, 0.93, 0.52, 0.97, 0.92, 0.98, 1.02, 0.90, 0.48, 0.99, 0.36, 0.22],
  [2.25, 0.90, 0.10, 0.90, 0.52, 0.92, 0.90, 0.92, 0.98, 0.86, 0.50, 0.95, 0.40, 0.30],
];
const station = (z) => {
  let i = 0; while (i < ST.length - 2 && z > ST[i + 1][0]) i++;
  const a = ST[i], b = ST[i + 1], t = Math.min(1, Math.max(0, (z - a[0]) / (b[0] - a[0])));
  return a.map((v, k) => v + (b[k] - v) * t);
};
function halfRing(z) {
  const [, top, p1x, p1y, p2x, p2y, p3x, p3y, hw, p4y, p5y, p6x, p6y, bot] = station(z);
  const pts = [[0, top], [p1x, p1y], [p2x, p2y], [p3x, p3y], [hw, p4y], [hw - 0.02, p5y], [p6x, p6y], [p6x - 0.1, bot], [0, bot]];
  let well = false;
  for (const [wz, r] of WELLS) {
    const dz = z - wz;
    if (Math.abs(dz) < r) {
      well = true;
      const ay = Math.min(0.35 + Math.sqrt(r * r - dz * dz) + 0.03, p4y - 0.03);
      pts[5] = [hw - 0.02, ay]; pts[6] = [0.6, ay]; pts[7] = [0.6, bot + 0.02];
    }
  }
  return { pts, well };
}
// material per segment: 0 paint, 1 glass, 2 black trim
function segMat(seg, z, well) {
  if (seg === 0) return z > -0.95 && z < 2.0 ? 1 : 0;
  if (seg === 1) return z > -0.95 && z < 0.98 ? 1 : 0;
    if (seg >= 5) return 2;
  return 0;
}

function buildBody(mats) {
  const zs = [];
  for (let z = -2.25; z <= 2.2501; z += 0.05) zs.push(+z.toFixed(4));
  for (const [wz, r] of WELLS) zs.push(wz - r - 0.001, wz - r + 0.001, wz + r - 0.001, wz + r + 0.001);
  zs.sort((a, b) => a - b);
  const rings = zs.map((z) => {
    const { pts, well } = halfRing(z);
    const left = pts.slice(1, 8).reverse().map(([x, y]) => [-x, y]);
    return { z, well, p: [...pts, ...left].map(([x, y]) => [x, y - CG_H, z]) };
  });
  const n = rings[0].p.length; // 16
  const pos = [], byMat = [[], [], []];
  const tri = (m, a, b, c) => byMat[m].push(...a, ...b, ...c);
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], zm = (A.z + B.z) / 2, well = A.well && B.well;
    for (let j = 0; j < n; j++) {
      const seg = j < 8 ? j : 15 - j, m = segMat(seg, zm, well);
      const a = A.p[j], b = A.p[(j + 1) % n], c = B.p[(j + 1) % n], d = B.p[j];
      tri(m, a, c, b); tri(m, a, d, c);
    }
  }
  for (const [R, front] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    const cy = R.p.reduce((s, q) => s + q[1], 0) / n, cx = [0, cy, R.z];
    for (let j = 0; j < n; j++) {
      const a = R.p[j], b = R.p[(j + 1) % n], m = front || (a[1] + b[1] + cy) / 3 + CG_H < 0.6 ? 2 : 0;
      tri(m, cx, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  let off = 0;
  byMat.forEach((arr, m) => { pos.push(...arr); g.addGroup(off, arr.length / 3, m); off += arr.length / 3; });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mats);
}

function plateTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d'); g.fillStyle = '#e9ecef'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#2a2d31'; g.font = '700 58px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ROSTR', 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function flowTexture(color) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 8);
  const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, color); gr.addColorStop(1, '#fff');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 8);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function buildCar() {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xbfc4c9, metalness: 0.85, roughness: 0.24, flatShading: true, envMapIntensity: 1.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x120c08, metalness: 0.95, roughness: 0.05, flatShading: true, envMapIntensity: 1.8 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 0.35, roughness: 0.55, flatShading: true });
  const shellMats = [paint, glass, trim];
  shellMats.forEach((m) => (m.side = THREE.DoubleSide));
  const shell = buildBody(shellMats);
  group.add(shell);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry, 28), new THREE.LineBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.55 }));
  edges.visible = false; group.add(edges);

  const y = (h) => h - CG_H;
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
  const add = (geo, mat, p, rot, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (rot) m.rotation.set(...rot); parent.add(m); return m; };
  const exterior = []; // hidden in systems view
  const X = (m) => (exterior.push(m), m);

  // rear: black band + full-width red light bar, plate, diffuser with 4 round outlets and fins
  X(add(new THREE.BoxGeometry(1.9, 0.05, 0.03), trim, [0, y(0.875), 2.252]));
  X(add(new THREE.BoxGeometry(1.84, 0.028, 0.03), glow(0xff1e1e), [0, y(0.845), 2.258]));
  X(add(new THREE.PlaneGeometry(0.36, 0.13), new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5 }), [0, y(0.63), 2.256]));
  X(add(new THREE.BoxGeometry(1.75, 0.24, 0.3), trim, [0, y(0.3), 2.12]));
  for (let k = -3; k <= 3; k++) X(add(new THREE.BoxGeometry(0.02, 0.2, 0.4), trim, [k * 0.25, y(0.24), 2.1]));
  const outletMat = new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 1, roughness: 0.25 });
  for (const ox of [-0.55, 0.55]) { // fan exhausts (the two inner outlets are the boost thrusters, built below)
    const o = add(new THREE.CylinderGeometry(0.075, 0.085, 0.12, 16, 1, true).rotateX(Math.PI / 2), outletMat, [ox, y(0.3), 2.27]); X(o);
    X(add(new THREE.CircleGeometry(0.07, 16), glow(0x050505), [ox, y(0.3), 2.25]));
  }
  // front: thin light strip across the nose, LED wedges under the fender peaks, black lower intake
  X(add(new THREE.BoxGeometry(0.62, 0.016, 0.02), glow(0xf2f6ff), [0, y(0.49), -2.21]));
  for (const sx of [-1, 1]) X(add(new THREE.BoxGeometry(0.17, 0.03, 0.04), glow(0xffffff), [sx * 0.69, y(0.57), -2.08], [0, sx * 0.5, sx * 0.55]));
  X(add(new THREE.BoxGeometry(1.5, 0.12, 0.05), trim, [0, y(0.29), -2.23]));
  // big angled side intake behind the door (as in the side photo)
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape([[0.32, 0.40], [1.0, 0.40], [1.0, 0.80], [0.66, 0.80]].map(([a, b]) => new THREE.Vector2(a, b - CG_H)));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), trim);
    m.rotation.y = -Math.PI / 2; m.position.x = sx * 1.048;
    group.add(m); exterior.push(m);
  }
  // door seams + flush handles (subtle lines)
  for (const sx of [-1, 1]) {
    X(add(new THREE.BoxGeometry(0.006, 0.42, 0.006), trim, [sx * 1.003, y(0.58), -0.72]));
    X(add(new THREE.BoxGeometry(0.006, 0.36, 0.006), trim, [sx * 1.008, y(0.6), 0.42]));
  }

  // active rear wing: stowed flush at low speed, rises on swan-neck struts (reported active aero)
  const wing = new THREE.Group();
  const plane = add(new THREE.BoxGeometry(1.98, 0.03, 0.42), trim, [0, 0, 0], null, wing);
  plane.rotation.x = 0.1;
  add(new THREE.BoxGeometry(1.9, 0.016, 0.02), glow(0xff2a2a), [0, 0.005, 0.22], null, wing);
  for (const s2 of [-1, 1]) {
    const ep = new THREE.Shape([[0, 0], [0.5, 0.02], [0.45, -0.2], [0.05, -0.12]].map(([a, b]) => new THREE.Vector2(a, b)));
    const plate = add(new THREE.ExtrudeGeometry(ep, { depth: 0.025, bevelEnabled: false }), trim, [s2 * 0.99, 0.02, -0.25], [0, -Math.PI / 2, 0], wing);
    plate.position.x = s2 > 0 ? 1.0 : -0.975;
    add(new THREE.BoxGeometry(0.02, 0.1, 0.02), glow(0xff2a2a), [s2 * 0.995, -0.08, 0.2], null, wing);
  }
  const struts = [];
  for (const sx of [-0.45, 0.45]) {
    const st = add(new THREE.BoxGeometry(0.04, 1, 0.09), trim, [sx, -0.5, -0.1], null, wing);
    struts.push(st);
  }
  wing.position.set(0, y(0.9), 1.85); group.add(wing); X(wing);

  // wheels: low-profile tyres, black angular turbine spokes, bright lip, brake disc
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.92, flatShading: true });
  const rimM = new THREE.MeshStandardMaterial({ color: 0x1d1f22, metalness: 0.8, roughness: 0.28, flatShading: true });
  const lipM = new THREE.MeshStandardMaterial({ color: 0xd4d8dc, metalness: 1, roughness: 0.18 });
  const discM = new THREE.MeshStandardMaterial({ color: 0x4b4e52, metalness: 0.7, roughness: 0.45 });
  const wheels = WHEELS.map((w) => {
    const side = Math.sign(w.pos[0]), wid = w.front ? 0.27 : 0.33;
    const pivot = new THREE.Group(), spin = new THREE.Group();
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, wid, 28).rotateZ(Math.PI / 2), tyre));
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.02, 28).rotateZ(Math.PI / 2), rimM);
    face.position.x = side * (wid / 2 - 0.03); spin.add(face);
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.075), rimM);
      sp.position.set(side * (wid / 2 - 0.005), 0, 0);
      const arm = new THREE.Group(); arm.rotation.x = (k * Math.PI) / 3; sp.position.y = 0.12; sp.rotation.x = 0.35; arm.add(sp); spin.add(arm);
      const ln = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.2, 0.012), lipM); ln.position.set(side * (wid / 2 + 0.012), 0.13, 0.02); ln.rotation.x = 0.35; arm.add(ln);
    }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.01, 6, 32).rotateY(Math.PI / 2), lipM);
    lip.position.x = side * (wid / 2); spin.add(lip);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 24).rotateZ(Math.PI / 2), discM);
    disc.position.x = side * 0.02; pivot.add(disc);
    pivot.add(spin); group.add(pivot);
    return { pivot, spin, def: w };
  });

  // thruster nozzles + exhaust plumes
  const nozM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 1, roughness: 0.22 });
  const nozzles = THRUSTERS.map((t) => {
    const g = new THREE.Group(), big = t.max > 15000 ? 1.15 : 0.8;
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * big, 0.08 * big, 0.14, 16, 1, true), nozM);
    noz.material.side = THREE.DoubleSide;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11 * big, 1, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    flame.rotation.x = Math.PI; flame.visible = false;
    noz.add(flame); g.add(noz);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...t.dir).negate());
    g.position.set(...t.pos); group.add(g);
    return { g, flame, def: t };
  });

  // ---------- systems (shown in "How it works") ----------
  const sys = new THREE.Group(); sys.visible = false; group.add(sys);
  const solid = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3, emissive: c, emissiveIntensity: e });
  const parts = {};
  parts.battery = add(new THREE.BoxGeometry(1.42, 0.16, 2.0), solid(0x2f6fd6, 0.25), [0, y(0.24), -0.15], null, sys);
  parts.motorF = add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16).rotateZ(Math.PI / 2), solid(0xe08a2e, 0.2), [0, y(0.35), -1.2], null, sys);
  parts.motorRL = add(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 16).rotateZ(Math.PI / 2), solid(0xe08a2e, 0.2), [-0.32, y(0.36), 1.45], null, sys);
  parts.motorRR = add(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 16).rotateZ(Math.PI / 2), solid(0xe08a2e, 0.2), [0.32, y(0.36), 1.45], null, sys);
  parts.tank = add(new THREE.CapsuleGeometry(0.34, 1.0, 8, 20).rotateZ(Math.PI / 2), solid(0xdfe8ee, 0.15), [0, y(0.62), 0.78], null, sys);
  parts.fans = [];
  for (const [fx, fz] of [[-0.45, 1.0], [0.45, 1.0], [-0.45, 1.6], [0.45, 1.6]]) {
    const f = add(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 16), solid(0x2ec4c4, 0.4), [fx, y(0.2), fz], null, sys);
    for (let b = 0; b < 4; b++) add(new THREE.BoxGeometry(0.2, 0.012, 0.035), solid(0x0f3f3f), [0, 0.04, 0], [0, (b * Math.PI) / 4, 0], f);
    parts.fans.push(f);
  }
  // flows: tubes with scrolling textures (pipes tank -> nozzles, cables battery -> motors, fan ducts)
  const flows = [];
  const tube = (pts, color, r, kind, idx) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const tex = flowTexture(color); tex.repeat.set(curve.getLength() * 3, 1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, color: 0xffffff }));
    const base = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r * 0.7, 8), new THREE.MeshBasicMaterial({ color: 0x33414f }));
    sys.add(base, m); flows.push({ m, tex, kind, idx }); return m;
  };
  const tankOut = [0, y(0.5), 0.78], manifold = [0, y(0.3), 1.2];
  THRUSTERS.forEach((t, i) => {
    const p = t.pos;
    tube([tankOut, manifold, [p[0] * 0.5, (manifold[1] + p[1]) / 2, (manifold[2] + p[2]) / 2], p], '#9fd8ff', 0.022, 'air', i);
  });
  const batt = [0, y(0.3), -0.15];
  tube([batt, [0, y(0.32), -0.7], [0, y(0.35), -1.05]], '#ffd84f', 0.025, 'power', 0);
  tube([batt, [-0.2, y(0.32), 0.6], [-0.32, y(0.36), 1.3]], '#ffd84f', 0.025, 'power', 1);
  tube([batt, [0.2, y(0.32), 0.6], [0.32, y(0.36), 1.3]], '#ffd84f', 0.025, 'power', 2);
  // airflow arrows under fans (drawn as short tubes pointing down/back)
  for (const f of parts.fans) {
    const p = f.position;
    tube([[p.x, p.y - 0.25, p.z - 0.2], [p.x, p.y - 0.05, p.z], [p.x, p.y + 0.05, p.z + 0.5]], '#2ec4c4', 0.03, 'fan', 0);
  }

  let view = 'exterior', wingK = 0;
  const api = {
    group, shell, wheels, nozzles, parts, sys, flows,
    labels: [
      { name: 'Battery 200 kWh', obj: parts.battery, views: ['all', 'power'] },
      { name: 'Front motor', obj: parts.motorF, views: ['all', 'power'] },
      { name: 'Rear motors ×2', obj: parts.motorRR, views: ['all', 'power'] },
      { name: 'Air tank 600 L', obj: parts.tank, views: ['all', 'air'] },
      { name: 'Suction fans ×4', obj: parts.fans[3], views: ['all', 'fans'] },
    ],
    get view() { return view; },
    setView(v) { // 'exterior' | 'all' | 'power' | 'air' | 'fans'
      view = v;
      const inside = v !== 'exterior';
      sys.visible = inside; edges.visible = inside;
      for (const m of shellMats) { m.transparent = inside; m.opacity = inside ? 0.08 : 1; m.depthWrite = !inside; m.needsUpdate = true; }
      exterior.forEach((o) => (o.visible = !inside));
      const show = (o, on) => o.traverse((c) => c.material && (c.material.opacity = on ? 1 : 0.12, c.material.transparent = true));
      show(parts.battery, v === 'all' || v === 'power'); [parts.motorF, parts.motorRL, parts.motorRR].forEach((o) => show(o, v === 'all' || v === 'power'));
      show(parts.tank, v === 'all' || v === 'air'); parts.fans.forEach((o) => show(o, v === 'all' || v === 'fans'));
      flows.forEach((f) => (f.m.visible = v === 'all' || v === f.kind));
    },
    update(v, dt) {
      v.wheels.forEach((w, i) => {
        const vw = wheels[i];
        vw.pivot.position.set(w.pos[0], w.pos[1] - (SUSP_REST - w.comp), w.pos[2]);
        vw.pivot.rotation.y = w.front ? v.steerAngle : 0;
        vw.spin.rotation.x = -w.spin;
      });
      nozzles.forEach((n, i) => {
        const f = v.thrust[i] / n.def.max, L = 0.4 + 2.2 * f;
        n.flame.visible = f > 0.01;
        n.flame.scale.set(1, L, 1); n.flame.position.y = -0.07 - L / 2;
        n.flame.material.opacity = 0.3 + 0.55 * f * (0.85 + 0.15 * Math.random());
      });
      // wing deploys above ~70 km/h, when airborne, or with fans on
      const want = v.speed > 19 || v.contacts === 0 || v.fansOn ? 1 : 0;
      wingK += (want - wingK) * Math.min(1, dt * 3);
      wing.position.y = y(0.92 + 0.42 * wingK);
      struts.forEach((s) => { s.scale.y = 0.05 + 0.42 * wingK; s.position.y = -s.scale.y / 2; });
      // flows: speed follows the real quantities
      const thr = Math.abs(v.input.throttle);
      for (const f of flows) {
        let rate = 0;
        if (f.kind === 'air') rate = v.thrust[f.idx] / THRUSTERS[f.idx].max;
        if (f.kind === 'power') rate = thr > 0 ? thr : v.speed > 0.5 ? 0.15 : 0;
        if (f.kind === 'fan') rate = v.fanLevel;
        f.tex.offset.x -= dt * 4 * rate;
        f.m.material.opacity = view === 'exterior' ? 0 : 0.25 + 0.75 * Math.min(1, rate * 1.5);
      }
    },
  };
  return api;
}
