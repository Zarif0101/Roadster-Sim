// Visual model of the 2026 Roadster, measured from the 15 Oct 2026 reveal photos (refs/, not shipped):
// side profile (#01), top view (#03), rear (#25, #02), front (#26), wheel (#24). Physics uses its own hull.
// Body = loft of hand-measured cross-sections; flat facets with knife-edge creases like the real car.
// Design frame: z = metres behind the front axle, y = metres above the road, x = half-width.
// Everything is shifted into the physics frame (origin at the centre of mass, -Z forward) at the end.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { THRUSTERS, WHEELS, SUSP_REST, CG, P } from './params.js';

const ZF = CG.fromFrontAxle, YG = CG.height;
const tz = (zd) => zd - ZF, ty = (y) => y - YG;  // design -> physics frame
const WB = 2.93, R_TYRE = 0.335;
const ARCH = [{ z: 0, r: 0.40 }, { z: WB, r: 0.415 }]; // wheel arch centre (design z) and radius
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (x, x0, x1) => Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));

// ---- Cross-sections: zd, then 12 half-section points [x, y] from the top centre round to the floor centre.
// p0 top centre | p1 central-panel edge | p2 buttress/peak inner | p3 roof edge or fender peak | p4 beltline (glass bottom)
// p5 shoulder | p6 upper side crease | p7 lower side | p8 sill top | p9 sill bottom | p10 floor edge | p11 floor centre
const ST = [
  [-0.870, [[0, 0.50], [0.36, 0.505], [0.50, 0.515], [0.56, 0.535], [0.585, 0.52], [0.60, 0.48], [0.61, 0.42], [0.60, 0.33], [0.57, 0.26], [0.54, 0.12], [0.45, 0.10], [0, 0.10]]],
  [-0.800, [[0, 0.525], [0.42, 0.53], [0.56, 0.545], [0.70, 0.60], [0.74, 0.585], [0.75, 0.53], [0.76, 0.45], [0.75, 0.34], [0.72, 0.26], [0.68, 0.11], [0.55, 0.095], [0, 0.095]]],
  [-0.650, [[0, 0.565], [0.50, 0.575], [0.60, 0.59], [0.82, 0.665], [0.87, 0.645], [0.89, 0.58], [0.90, 0.48], [0.89, 0.36], [0.86, 0.27], [0.82, 0.11], [0.65, 0.095], [0, 0.095]]],
  [-0.400, [[0, 0.625], [0.55, 0.64], [0.63, 0.655], [0.89, 0.735], [0.935, 0.71], [0.95, 0.64], [0.955, 0.53], [0.95, 0.38], [0.92, 0.27], [0.88, 0.11], [0.70, 0.095], [0, 0.095]]],
  [-0.150, [[0, 0.70], [0.58, 0.715], [0.66, 0.73], [0.92, 0.79], [0.955, 0.765], [0.965, 0.69], [0.97, 0.56], [0.965, 0.40], [0.94, 0.27], [0.90, 0.11], [0.72, 0.095], [0, 0.095]]],
  [0.020, [[0, 0.745], [0.50, 0.755], [0.68, 0.77], [0.80, 0.80], [0.93, 0.81], [0.97, 0.765], [0.975, 0.62], [0.97, 0.42], [0.945, 0.27], [0.91, 0.11], [0.73, 0.095], [0, 0.095]]],
  [0.600, [[0, 0.975], [0.42, 0.965], [0.60, 0.94], [0.72, 0.905], [0.90, 0.825], [0.97, 0.785], [0.975, 0.63], [0.97, 0.43], [0.945, 0.28], [0.915, 0.11], [0.74, 0.10], [0, 0.10]]],
  [1.230, [[0, 1.17], [0.34, 1.165], [0.52, 1.15], [0.61, 1.12], [0.885, 0.845], [0.96, 0.80], [0.965, 0.64], [0.96, 0.44], [0.94, 0.30], [0.91, 0.11], [0.74, 0.10], [0, 0.10]]],
  [1.920, [[0, 1.19], [0.33, 1.185], [0.50, 1.17], [0.57, 1.15], [0.90, 0.875], [0.955, 0.83], [0.96, 0.67], [0.955, 0.47], [0.935, 0.34], [0.905, 0.11], [0.74, 0.10], [0, 0.10]]],
  [2.000, [[0, 1.175], [0.46, 1.17], [0.53, 1.20], [0.62, 1.18], [0.90, 0.905], [0.965, 0.85], [0.97, 0.70], [0.965, 0.50], [0.945, 0.37], [0.915, 0.11], [0.74, 0.10], [0, 0.10]]],
  [2.600, [[0, 1.085], [0.40, 1.075], [0.47, 1.12], [0.64, 1.10], [0.93, 0.93], [0.99, 0.87], [0.995, 0.72], [0.99, 0.54], [0.97, 0.42], [0.94, 0.12], [0.76, 0.10], [0, 0.10]]],
  [3.270, [[0, 0.985], [0.26, 0.98], [0.40, 1.01], [0.62, 1.00], [0.93, 0.945], [0.995, 0.89], [0.995, 0.74], [0.99, 0.56], [0.97, 0.42], [0.94, 0.14], [0.76, 0.11], [0, 0.11]]],
  [3.300, [[0, 0.95], [0.30, 0.95], [0.40, 0.985], [0.62, 0.985], [0.93, 0.945], [0.99, 0.89], [0.99, 0.74], [0.985, 0.56], [0.965, 0.42], [0.935, 0.14], [0.76, 0.11], [0, 0.11]]],
  [3.560, [[0, 0.935], [0.30, 0.935], [0.40, 0.945], [0.62, 0.945], [0.88, 0.93], [0.97, 0.885], [0.98, 0.74], [0.975, 0.56], [0.955, 0.42], [0.92, 0.16], [0.74, 0.12], [0, 0.12]]],
  [3.650, [[0, 0.915], [0.30, 0.915], [0.40, 0.92], [0.62, 0.92], [0.80, 0.915], [0.855, 0.89], [0.93, 0.76], [0.95, 0.56], [0.93, 0.42], [0.88, 0.18], [0.70, 0.13], [0, 0.13]]],
];
const NP = 12;
function section(zd) {
  let i = 0; while (i < ST.length - 2 && zd > ST[i + 1][0]) i++;
  const [za, A] = ST[i], [zb, B] = ST[i + 1], t = Math.max(0, Math.min(1, (zd - za) / (zb - za)));
  const pts = A.map((p, k) => [lerp(p[0], B[k][0], t), lerp(p[1], B[k][1], t)]);
  // wheel arches: clip the lower side at the arch circle, then turn inward (wheel-well roof) and down
  let well = false;
  for (const a of ARCH) {
    const dz = zd - a.z;
    if (Math.abs(dz) >= a.r) continue;
    const ay = R_TYRE + Math.sqrt(a.r * a.r - dz * dz);
    well = true;
    const sideX = (y) => { for (let k = 5; k < 9; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; if (y <= y0 && y >= y1) return lerp(x0, x1, (y0 - y) / Math.max(1e-6, y0 - y1)); } return pts[7][0]; };
    const x = sideX(ay);
    for (let k = 5; k <= 7; k++) if (pts[k][1] < ay) pts[k] = [x, ay];
    pts[8] = [x - 0.005, ay]; pts[9] = [0.66, ay - 0.002]; pts[10] = [0.66, pts[11][1]];
  }
  return { pts, well };
}
// black lower body: front chin, sill sweeping up toward the rear wheel, black rear flanks (photos #01, #06, #25)
const sillLine = (zd) => zd < 0.36 ? (zd < -0.6 ? 0.26 : 0.27) : zd < 2.53 ? lerp(0.27, 0.43, (zd - 0.36) / 2.17) : zd < 3.0 ? lerp(0.43, 0.6, (zd - 2.53) / 0.47) : 0.6;
const doorFront = (y) => lerp(0.36, 0.02, ramp(y, 0.3, 0.85)); // door's slanted leading edge
const DOOR_REAR = 1.77;
const inDoor = (zd, y) => zd > doorFront(y) && zd < DOOR_REAR && y > sillLine(zd) + 0.015;

// material ids
const M = { paint: 0, glass: 1, black: 2, gloss: 3 };
function matFor(seg, zd, y) {
  if (seg <= 1) return zd > 0.02 && (zd < 1.96 || seg === 0) && zd < 3.27 ? M.glass : M.paint;
  if (seg === 2) return zd > 0.02 && zd < 1.96 ? M.glass : M.paint;
  if (seg === 3) {
    if (zd > 0.04 && zd < DOOR_REAR - 0.02) return M.glass;                        // door glass
    if (zd > 1.86 && zd < 2.52 && y > 0.96) return M.glass;                         // rear quarter window
    return M.paint;
  }
  if (seg >= 8) return M.black;
  return y < sillLine(zd) ? M.black : M.paint;
}

function buildShell() {
  const zs = [];
  for (let z = -0.87; z <= 3.6501; z += 0.04) zs.push(+z.toFixed(4));
  for (const a of ARCH) for (let k = -12; k <= 12; k++) zs.push(a.z + (a.r * k) / 12);       // dense arch sampling
  for (const s of ST) zs.push(s[0]);
  for (const z of [0.02, 0.04, 1.75, 1.77, 1.79, 1.86, 1.96, 2.52, 3.27]) zs.push(z);
  const zl = [...new Set(zs.map((z) => +z.toFixed(4)))].filter((z) => z >= -0.87 && z <= 3.65).sort((a, b) => a - b);
  const rings = zl.map((zd) => { const { pts, well } = section(zd); const left = pts.slice(1, NP - 1).reverse().map(([x, y]) => [-x, y]); return { zd, well, p: [...pts, ...left] }; });
  const n = rings[0].p.length;
  const groups = { body: [[], [], [], []], doorL: [[], [], [], []], doorR: [[], [], [], []] };
  const push = (g, m, a, b, c) => groups[g][m].push(...a, ...b, ...c);
  const P3 = (q, zd) => [q[0], ty(q[1]), tz(zd)];
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], zm = (A.zd + B.zd) / 2, wellSeg = A.well && B.well;
    for (let j = 0; j < n; j++) {
      const seg = j < NP - 1 ? j : n - 1 - j, side = j < NP - 1 ? 1 : -1;
      const a = A.p[j], b = A.p[(j + 1) % n], c = B.p[(j + 1) % n], d = B.p[j];
      const ym = (a[1] + b[1] + c[1] + d[1]) / 4;
      let m = matFor(seg, zm, ym);
      if (wellSeg && seg >= 7) m = M.black;
      const g = seg >= 3 && seg <= 7 && inDoor(zm, ym) ? (side > 0 ? 'doorR' : 'doorL') : 'body';
      const va = P3(a, A.zd), vb = P3(b, A.zd), vc = P3(c, B.zd), vd = P3(d, B.zd);
      push(g, m, va, vc, vb); push(g, m, va, vd, vc);
    }
  }
  // end caps: nose (black chin below 0.26) and tail (black band, painted panel, black diffuser zone)
  for (const [R, front] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    const cy = R.p.reduce((s, q) => s + q[1], 0) / n, C = [0, cy];
    for (let j = 0; j < n; j++) {
      const a = R.p[j], b = R.p[(j + 1) % n], ym = (a[1] + b[1] + cy) / 3;
      const m = front ? (ym < 0.27 ? M.black : M.paint) : (ym > 0.86 || ym < 0.61 ? M.black : M.paint);
      const tri = [P3(C, R.zd), P3(a, R.zd), P3(b, R.zd)];
      if (front) push('body', m, tri[0], tri[2], tri[1]); else push('body', m, tri[0], tri[1], tri[2]);
    }
  }
  const make = (arrs) => {
    const g = new THREE.BufferGeometry(), pos = []; let off = 0;
    arrs.forEach((arr, m) => { pos.push(...arr); g.addGroup(off, arr.length / 3, m); off += arr.length / 3; });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return toCreasedNormals(g, (24 * Math.PI) / 180); // non-indexed input: normals are written in place, groups kept
  };
  return { body: make(groups.body.map((a) => a)), doorL: make(groups.doorL), doorR: make(groups.doorR) };
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const plateTex = () => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#e8e9ea'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c4c7ca'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#9da2a8'; g.font = '700 150px "Bahnschrift", "DIN Alternate", "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('RDSTR', w / 2, h / 2 + 6); // embossed, same colour family as the plate (photo #25)
});
const carbonTex = () => { const t = canvasTex(64, 64, (g, w) => { for (let y = 0; y < w; y += 8) for (let x = 0; x < w; x += 8) { const o = ((x + y) / 8) % 2; const gr = g.createLinearGradient(x, y, o ? x + 8 : x, o ? y : y + 8); gr.addColorStop(0, '#1b1c1e'); gr.addColorStop(0.5, '#2c2d30'); gr.addColorStop(1, '#151618'); g.fillStyle = gr; g.fillRect(x, y, 8, 8); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t; };
const sidewallTex = () => canvasTex(1024, 64, (g, w, h) => {
  g.fillStyle = '#121214'; g.fillRect(0, 0, w, h); g.fillStyle = '#26272a'; g.font = '600 30px "Segoe UI", sans-serif'; g.textBaseline = 'middle';
  for (const x of [40, 552]) g.fillText('P ZERO  ·  265/30 ZR20', x, h / 2);
});
function flowTexture(color) {
  return canvasTex(64, 8, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 8); const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.7, color); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 64, 8); }, false);
}

export function buildCar() {
  const group = new THREE.Group();
  // ---------- materials ----------
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xe9e8e3, metalness: 0.0, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.25, sheenColor: 0xfff6ea, iridescence: 0.12, iridescenceIOR: 1.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x3b2618, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.86, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0f1012, metalness: 0.2, roughness: 0.62 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x060607, metalness: 0.3, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  const carbon = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTex(), metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe4e6e8, metalness: 1, roughness: 0.12 });
  const shellMats = [paint, glass, black, gloss];
  const emis = (c, i = 3) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i });
  const { body, doorL, doorR } = buildShell();
  const shell = new THREE.Mesh(body, shellMats); group.add(shell);
  const exterior = [], X = (o) => (exterior.push(o), o);
  const add = (geo, mat, p, rot, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (rot) m.rotation.set(...rot); parent.add(m); return m; };
  const P = (x, yg, zd) => [x, ty(yg), tz(zd)]; // design -> physics

  // ---------- scissor doors: hinge near the A-pillar base, rotate up and forward (photo #01) ----------
  const HINGE = { y: 0.74, z: 0.30 };
  const doors = [doorL, doorR].map((geo, k) => {
    const pivot = new THREE.Group(); pivot.position.set(0, ty(HINGE.y), tz(HINGE.z));
    const m = new THREE.Mesh(geo, shellMats.map((mm) => (mm === glass ? glass : mm)));
    m.position.set(0, -ty(HINGE.y), -tz(HINGE.z)); pivot.add(m);
    // inner door card (black) so an open door is not see-through from inside
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.42), black);
    card.position.set((k ? 1 : -1) * 0.9 - (k ? 0.02 : -0.02) - pivot.position.x, ty(0.55) - pivot.position.y, tz(1.0) - pivot.position.z);
    card.rotation.y = Math.PI / 2; card.material.side = THREE.DoubleSide; pivot.add(card);
    group.add(pivot); return pivot;
  });
  shellMats.forEach((m) => (m.side = THREE.DoubleSide));

  // ---------- seams (panel gaps) ----------
  const seamMat = new THREE.LineBasicMaterial({ color: 0x1d1e20, transparent: true, opacity: 0.55 });
  const seam = (pts) => { const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))); const l = new THREE.Line(g, seamMat); group.add(l); X(l); };
  for (const s of [-1, 1]) {
    seam([[s * 0.952, ty(0.3), tz(0.36)], [s * 0.968, ty(0.6), tz(0.15)], [s * 0.94, ty(0.82), tz(0.03)]]);   // door front
    seam([[s * 0.956, ty(0.43), tz(1.77)], [s * 0.962, ty(0.82), tz(1.77)]]);                                 // door rear
    seam([[s * 0.6, ty(0.72), tz(-0.15)], [s * 0.63, ty(0.655), tz(-0.4)], [s * 0.57, ty(0.53), tz(-0.8)]]);   // hood edge
  }
  seam([[-0.58, ty(0.718), tz(-0.15)], [0.58, ty(0.718), tz(-0.15)]]); // cowl line

  // ---------- lights ----------
  const rearBar = X(add(new THREE.BoxGeometry(1.71, 0.022, 0.012), emis(0xff1a1a, 3.2), P(0, 0.83, 3.655)));
  X(add(new THREE.BoxGeometry(1.74, 0.06, 0.012), gloss, P(0, 0.875, 3.652)));                    // black band above
  X(add(new THREE.BoxGeometry(1.74, 0.03, 0.012), gloss, P(0, 0.80, 3.652)));
  for (const s of [-1, 1]) {
    X(add(new THREE.BoxGeometry(0.16, 0.018, 0.01), emis(0xff2020, 1.6), P(s * 0.8, 0.56, 3.66)));   // low rear markers
    X(add(new THREE.BoxGeometry(0.012, 0.025, 0.08), emis(0xff2020, 2), P(s * 0.985, 0.59, 3.18)));   // side marker behind rear arch
    X(add(new THREE.BoxGeometry(0.012, 0.03, 0.09), emis(0xff6a1a, 2), P(s * 0.972, 0.68, 0.44)));    // front side marker (photo #24)
    const wedge = new THREE.Shape([[0, 0], [0.16, 0.045], [0.15, 0.06], [0, 0.022]].map(([a, b]) => new THREE.Vector2(a, b)));
    const hl = X(add(new THREE.ExtrudeGeometry(wedge, { depth: 0.01, bevelEnabled: false }), emis(0xf4f7ff, 5), P(s * 0.66, 0.48, -0.84), [0, s > 0 ? -Math.PI / 2 - 0.35 : Math.PI / 2 + 0.35, 0]));
    if (s < 0) hl.scale.x = -1;
  }
  X(add(new THREE.BoxGeometry(1.1, 0.008, 0.01), emis(0xf2f5ff, 4), P(0, 0.503, -0.874)));     // hood leading-edge light line
  X(add(new THREE.BoxGeometry(1.2, 0.14, 0.02), gloss, P(0, 0.19, -0.873)));                     // black lower intake

  // ---------- rear: plate, nozzle bar with 4 chrome boost nozzles, diffuser with fins and 4 lower ports ----------
  X(add(new THREE.PlaneGeometry(0.305, 0.15), new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.45, metalness: 0.3 }), P(0, 0.71, 3.656)));
  X(add(new THREE.BoxGeometry(0.12, 0.025, 0.02), gloss, P(0, 0.80, 3.66)));                      // camera pod
  X(add(new THREE.BoxGeometry(1.24, 0.13, 0.14), carbon, P(0, 0.49, 3.6)));                      // nozzle bar housing
  const nozzleRings = [];
  for (const x of [-0.36, -0.12, 0.12, 0.36]) {
    const ring = X(add(new THREE.TorusGeometry(0.04, 0.007, 10, 32), chrome, P(x, 0.49, 3.675)));
    X(add(new THREE.CylinderGeometry(0.038, 0.03, 0.06, 20, 1, true).rotateX(Math.PI / 2), black, P(x, 0.49, 3.65)));
    nozzleRings.push(ring);
  }
  X(add(new THREE.BoxGeometry(1.24, 0.3, 0.5), carbon, P(0, 0.26, 3.42)));                        // diffuser body
  for (const x of [-0.6, -0.31, 0, 0.31, 0.6]) X(add(new THREE.BoxGeometry(0.012, 0.24, 0.55), carbon, P(x, 0.22, 3.45)));
  for (const x of [-0.45, -0.15, 0.15, 0.45]) X(add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x030303 }), P(x, 0.27, 3.672)));
  for (const s of [-1, 1]) X(add(new THREE.BoxGeometry(0.3, 0.16, 0.5), black, P(s * 0.8, 0.5, 3.42))); // flank pods

  // ---------- active wing: 4-bar linkage, swan-neck struts, red LED edges (photos #25, #05) ----------
  const wing = new THREE.Group();
  const foil = new THREE.Shape(); foil.moveTo(-0.15, 0); foil.bezierCurveTo(-0.1, 0.035, 0.08, 0.03, 0.16, -0.005); foil.bezierCurveTo(0.05, 0.005, -0.08, 0.002, -0.15, 0);
  add(new THREE.ExtrudeGeometry(foil, { depth: 1.79, bevelEnabled: false, curveSegments: 10 }), carbon, [0.895, 0, 0], [0, -Math.PI / 2, 0], wing); // leading edge forward
  add(new THREE.BoxGeometry(1.75, 0.008, 0.008), emis(0xff2020, 3), [0, 0.012, 0.158], null, wing);
  for (const s of [-1, 1]) {
    const ep = new THREE.Shape([[0, 0.03], [0.34, 0.02], [0.3, -0.24], [0.04, -0.17]].map(([a, b]) => new THREE.Vector2(a, b)));
    const plate = add(new THREE.ExtrudeGeometry(ep, { depth: 0.012, bevelEnabled: false }), carbon, [s * 0.9, 0, -0.17], [0, -Math.PI / 2, s * 0.32], wing);
    plate.position.x = s > 0 ? 0.906 : -0.894;
    add(new THREE.BoxGeometry(0.008, 0.2, 0.008), emis(0xff2020, 2.5), [s * 0.95, -0.12, 0.15], [0, 0, s * 0.32], wing);
  }
  const struts = [-0.44, 0.44].map((x) => {
    // swan neck: rises from the deck behind the blade, hooks over and grips its upper surface
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.32, 0.07), new THREE.Vector3(0, -0.16, 0.03), new THREE.Vector3(0, 0.02, -0.04), new THREE.Vector3(0, 0.035, 0.03)]);
    const m = add(new THREE.TubeGeometry(curve, 24, 0.012, 8), gloss, [x, 0, 0], null, wing); return m;
  });
  group.add(wing); X(wing);
  const wingRest = { y: 0.925, z: 3.43 }, wingUp = { y: 1.24, z: 3.56 };

  // ---------- wheels: aero face with 5 split-blade star spokes, low-profile tyres, discs (photo #24, #17) ----------
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.88 });
  const wallM = new THREE.MeshStandardMaterial({ color: 0xffffff, map: sidewallTex(), roughness: 0.85 });
  const faceM = new THREE.MeshPhysicalMaterial({ color: 0xdfe1e3, metalness: 0.6, roughness: 0.35, clearcoat: 0.6 });
  const spokeM = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, metalness: 0.5, roughness: 0.22, clearcoat: 1 });
  const discM = new THREE.MeshStandardMaterial({ color: 0x5c5f63, metalness: 0.85, roughness: 0.4 });
  const caliperM = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.4, roughness: 0.4 });
  const coverM = new THREE.MeshPhysicalMaterial({ color: 0xe6e6e3, metalness: 0.1, roughness: 0.3, clearcoat: 1 });
  const tyreProfile = (wid) => { const r = R_TYRE, ri = 0.257, pts = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI; pts.push(new THREE.Vector2(ri + (r - ri) * (0.55 + 0.45 * Math.sin(a)) , (Math.cos(a) * wid) / 2)); } return pts; };
  const covers = [];
  const wheels = WHEELS.map((w) => {
    const side = Math.sign(w.pos[0]), wid = w.front ? 0.265 : 0.315;
    const pivot = new THREE.Group(), spin = new THREE.Group();
    const tyre = new THREE.Mesh(new THREE.LatheGeometry(tyreProfile(wid), 48).rotateZ(Math.PI / 2), tyreM); spin.add(tyre);
    const wall = new THREE.Mesh(new THREE.RingGeometry(0.262, 0.33, 64, 1), wallM); wall.rotation.y = side * Math.PI / 2; wall.position.x = side * (wid / 2 + 0.002); spin.add(wall);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.012, 48).rotateZ(Math.PI / 2), faceM); face.position.x = side * (wid / 2 - 0.035); spin.add(face);
    for (let k = 0; k < 5; k++) for (const off of [-0.07, 0.07]) {
      const arm = new THREE.Group(); arm.rotation.x = (k * 2 * Math.PI) / 5 + off;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.026), spokeM);
      blade.position.set(side * (wid / 2 - 0.02), 0.135, 0); blade.rotation.x = -off * 2.2; arm.add(blade); spin.add(arm);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 24).rotateZ(Math.PI / 2), spokeM); cap.position.x = side * (wid / 2 - 0.01); spin.add(cap);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.02, 48).rotateZ(Math.PI / 2), coverM); cover.position.x = side * (wid / 2 - 0.005); cover.visible = false; spin.add(cover); covers.push(cover);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.028, 32).rotateZ(Math.PI / 2), discM); disc.position.x = side * 0.0; pivot.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.09), caliperM); cal.position.set(side * 0.03, 0.12, w.front ? 0.12 : -0.12); pivot.add(cal);
    pivot.add(spin); group.add(pivot);
    return { pivot, spin, def: w };
  });
  // wheel-well liners hide the inside of the body
  for (const a of ARCH) for (const s of [-1, 1]) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(a.r - 0.005, a.r - 0.005, 0.3, 32, 1, true, Math.PI * 0.5, Math.PI).rotateZ(Math.PI / 2), black);
    liner.material.side = THREE.DoubleSide; liner.position.set(s * 0.8, ty(R_TYRE), tz(a.z)); X(add(liner.geometry, black, liner.position.toArray()));
  }

  // ---------- interior: tub, seats with red stripe, yoke, dash + centre screen (photos #04, #08, #20) ----------
  const cabin = new THREE.Group(); group.add(cabin); exterior.push(cabin);
  const seatW = new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.55 }), seatB = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.7 });
  add(new THREE.BoxGeometry(1.7, 0.04, 2.1), black, P(0, 0.17, 0.85), null, cabin);           // floor
  add(new THREE.BoxGeometry(1.7, 0.55, 0.04), black, P(0, 0.45, 1.9), null, cabin);           // rear bulkhead
  add(new THREE.BoxGeometry(0.22, 0.28, 1.5), seatB, P(0, 0.33, 0.95), null, cabin);           // centre tunnel
  for (const x of [-0.4, 0.4]) {
    add(new THREE.BoxGeometry(0.5, 0.12, 0.55), seatW, P(x, 0.27, 1.25), [0.08, 0, 0], cabin);
    const back = add(new THREE.BoxGeometry(0.5, 0.75, 0.12), seatW, P(x, 0.62, 1.55), [-0.5, 0, 0], cabin);
    add(new THREE.BoxGeometry(0.12, 0.5, 0.015), emis(0xc4161c, 0.9), [0, 0.05, 0.065], null, back);
    add(new THREE.BoxGeometry(0.34, 0.16, 0.12), seatB, P(x, 1.0, 1.75), [-0.5, 0, 0], cabin);  // head rest
  }
  add(new THREE.BoxGeometry(1.6, 0.18, 0.5), seatB, P(0, 0.62, 0.38), [0.25, 0, 0], cabin);    // dash
  add(new THREE.BoxGeometry(0.42, 0.24, 0.02), emis(0x8c1410, 1.4), P(0, 0.78, 0.55), [-0.35, 0, 0], cabin); // Mars-red centre screen
  const yoke = new THREE.Group(); yoke.position.set(...P(-0.4, 0.74, 0.72)); yoke.rotation.x = -0.35; cabin.add(yoke);
  add(new THREE.TorusGeometry(0.17, 0.018, 8, 24, Math.PI), seatB, [0, -0.02, 0], [0, 0, Math.PI], yoke);
  add(new THREE.BoxGeometry(0.34, 0.03, 0.03), seatB, [0, -0.02, 0], null, yoke);

  // ---------- thruster nozzles (exhaust visuals; vapour is drawn by the effects system) ----------
  const nozM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 1, roughness: 0.25, side: THREE.DoubleSide });
  const nozzles = THRUSTERS.map((t, i) => {
    const g = new THREE.Group(), big = t.max > 15000;
    if (i >= 2) { // boost nozzles are the chrome rings above; lift and side nozzles are flush ports
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.06, 16, 1, true), nozM); g.add(noz);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.09 : 0.07, 1, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe8f3ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    flame.rotation.x = Math.PI; flame.visible = false; g.add(flame);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...t.dir).negate());
    g.position.set(...t.pos); group.add(g);
    return { g, flame, def: t };
  });

  // ---------- systems ("How it works") ----------
  const sys = new THREE.Group(); sys.visible = false; group.add(sys);
  const solid = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3, emissive: c, emissiveIntensity: e });
  const parts = {};
  parts.battery = add(new THREE.BoxGeometry(1.45, 0.13, 2.1), solid(0x2f6fd6, 0.25), P(0, 0.2, 1.0), null, sys);
  parts.motorF = add(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 16).rotateZ(Math.PI / 2), solid(0xe08a2e, 0.2), P(0, 0.32, 0.0), null, sys);
  parts.motorRL = add(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 16).rotateZ(Math.PI / 2), solid(0xe08a2e, 0.2), P(-0.32, 0.33, WB), null, sys);
  parts.motorRR = add(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 16).rotateZ(Math.PI / 2), solid(0xe08a2e, 0.2), P(0.32, 0.33, WB), null, sys);
  parts.tank = new THREE.Group(); sys.add(parts.tank); // two COPVs behind the cabin (600 L total)
  for (const x of [-0.3, 0.3]) add(new THREE.CapsuleGeometry(0.24, 0.85, 8, 20).rotateZ(Math.PI / 2), solid(0xdfe8ee, 0.15), P(x, 0.62, 2.2), [0, Math.PI / 2, 0], parts.tank);
  parts.fans = [];
  for (const [fx, fz] of [[-0.42, 2.2], [0.42, 2.2], [-0.42, 2.75], [0.42, 2.75]]) {
    const f = add(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 16), solid(0x2ec4c4, 0.4), P(fx, 0.2, fz), null, sys);
    for (let b = 0; b < 4; b++) add(new THREE.BoxGeometry(0.22, 0.012, 0.035), solid(0x0f3f3f), [0, 0.04, 0], [0, (b * Math.PI) / 4, 0], f);
    parts.fans.push(f);
  }
  const flows = [];
  const tube = (pts, color, r, kind, idx) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const tex = flowTexture(color); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(curve.getLength() * 3, 1);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95 }));
    const base = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r * 0.7, 8), new THREE.MeshBasicMaterial({ color: 0x9aa0a8 }));
    sys.add(base, m); flows.push({ m, tex, kind, idx }); return m;
  };
  const tankOut = P(0, 0.5, 2.2), manifold = P(0, 0.3, 2.6);
  THRUSTERS.forEach((t, i) => { const p = t.pos; tube([tankOut, manifold, [p[0] * 0.5, (manifold[1] + p[1]) / 2, (manifold[2] + p[2]) / 2], p], '#3e6ae1', 0.02, 'air', i); });
  const batt = P(0, 0.26, 1.0);
  tube([batt, P(0, 0.28, 0.5), P(0, 0.32, 0.15)], '#e8a400', 0.025, 'power', 0);
  tube([batt, P(-0.2, 0.28, 2.2), P(-0.32, 0.33, WB - 0.15)], '#e8a400', 0.025, 'power', 1);
  tube([batt, P(0.2, 0.28, 2.2), P(0.32, 0.33, WB - 0.15)], '#e8a400', 0.025, 'power', 2);
  for (const f of parts.fans) { const p = f.position; tube([[p.x, p.y - 0.25, p.z - 0.2], [p.x, p.y - 0.05, p.z], [p.x, p.y + 0.05, p.z + 0.5]], '#2ec4c4', 0.03, 'fan', 0); }
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body, 28), new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.35 }));
  edges.visible = false; group.add(edges);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = o !== shell; } });
  let view = 'exterior', doorK = 0, doorTarget = 0, brakeGlow = 0;
  const allShell = [paint, glass, black, gloss];
  return {
    group, shell, wheels, nozzles, parts, sys, flows, doors, wing, nozzleRings, lights: { rearBar },
    labels: [
      { name: 'Battery', obj: parts.battery, views: ['all', 'power'] },
      { name: 'Front motor', obj: parts.motorF, views: ['all', 'power'] },
      { name: 'Rear motors ×2', obj: parts.motorRR, views: ['all', 'power'] },
      { name: 'COPV tanks · 600 L N₂', obj: parts.tank, views: ['all', 'air'] },
      { name: 'Suction fans ×4', obj: parts.fans[3], views: ['all', 'fans'] },
    ],
    get view() { return view; },
    get doorsOpen() { return doorTarget > 0.5; },
    setDoors(open) { doorTarget = open ? 1 : 0; },
    setCovers(on) { covers.forEach((c) => (c.visible = on)); },
    setView(v) { // 'exterior' | 'all' | 'power' | 'air' | 'fans'
      view = v;
      const inside = v !== 'exterior';
      sys.visible = inside; edges.visible = inside; cabin.visible = !inside;
      for (const m of allShell) { m.transparent = inside || m === glass; m.opacity = inside ? 0.07 : m === glass ? 0.86 : 1; m.depthWrite = !inside; m.needsUpdate = true; }
      exterior.forEach((o) => (o.visible = !inside));
      doors.forEach((d) => (d.visible = true));
      const show = (o, on) => o.traverse((c) => c.material && (c.material.opacity = on ? 1 : 0.12, c.material.transparent = true));
      show(parts.battery, v === 'all' || v === 'power'); [parts.motorF, parts.motorRL, parts.motorRR].forEach((o) => show(o, v === 'all' || v === 'power'));
      show(parts.tank, v === 'all' || v === 'air'); parts.fans.forEach((o) => show(o, v === 'all' || v === 'fans'));
      flows.forEach((f) => (f.m.visible = v === 'all' || v === f.kind));
    },
    update(v, dt) {
      v.wheels.forEach((w, i) => {
        const vw = wheels[i];
        vw.pivot.position.set(w.pos[0], w.pos[1] - (SUSP_REST - w.comp), w.pos[2]);
        vw.pivot.rotation.y = w.steer ?? (w.front ? v.steerAngle : 0);
        vw.spin.rotation.x = -w.spin;
      });
      nozzles.forEach((n, i) => {
        const f = v.thrust[i] / n.def.max, L = 0.3 + 1.6 * f;
        n.flame.visible = f > 0.01; n.flame.scale.set(1, L, 1); n.flame.position.y = -0.03 - L / 2;
        n.flame.material.opacity = 0.12 + 0.3 * f * (0.85 + 0.15 * Math.random());
      });
      // active wing follows the physics (patent: 4-bar linkage, up and back; blade pitches for high downforce)
      const k = v.wing ? v.wing.deploy : 0, aoa = v.wing ? v.wing.aoa : 0;
      wing.position.set(0, ty(lerp(wingRest.y, wingUp.y, k)), tz(lerp(wingRest.z, wingUp.z, k)));
      wing.rotation.x = 0.03 - aoa * 0.21;
      struts.forEach((s) => { s.scale.y = Math.max(0.05, k); s.visible = k > 0.03; });
      // doors only open when stopped
      if (v.speed > 1) doorTarget = 0;
      doorK += (doorTarget - doorK) * Math.min(1, dt * 2.2);
      doors.forEach((d) => (d.rotation.x = -doorK * 1.25)); // rear of the door rises (scissor)
      brakeGlow += ((v.input.brake > 0.05 || v.holding ? 1 : 0) - brakeGlow) * Math.min(1, dt * 12);
      rearBar.material.emissiveIntensity = 2.4 + 4 * brakeGlow;
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
}
