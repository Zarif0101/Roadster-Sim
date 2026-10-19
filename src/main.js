// App shell: renderer + environment, fixed-step loop, input, cameras, HUD, "How it works" view, data tools.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from './vehicle.js';
import { buildWorld, SPAWNS, LOOP, KICK, PARK } from './world.js';
import { buildCar } from './car.js';
import { SCENES } from './scenes.js';
import { P, THRUSTERS } from './params.js';
import { hover as hoverClaim } from './physics/claims.js';
const HOVER_S = hoverClaim().seconds; // full-tank hover time from the blowdown model

const DT = 1 / 120;
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
const DEFAULTS = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.v]));

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -P.gravity.v, z: 0 });
world.timestep = DT;
const shapes = buildWorld(RAPIER, world);
const v = new Vehicle(RAPIER, world, 'rocket');

// ================= renderer + environment =================
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
// white studio: floor fades into an endless light-grey backdrop
const STUDIO = 0xd3d8de;
scene.background = new THREE.Color(STUDIO);
scene.fog = new THREE.Fog(STUDIO, 110, 360);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);
const controls = new OrbitControls(camera, canvas);
controls.enabled = false; controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8c9198, 1.05));
const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.position.set(-18, 40, 22); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 });
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xffffff, 0.8); rim.position.set(25, 15, -30); scene.add(rim);

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(...rep); t.anisotropy = 4; return t;
}
const noise = (g, w, h, base, n, a) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,220' : '0,0,0'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const floorTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#9ea4ac'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,45,52,.35)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,45,52,.12)'; g.lineWidth = 1;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo((i * w) / 5, 0); g.lineTo((i * w) / 5, h); g.moveTo(0, (i * h) / 5); g.lineTo(w, (i * h) / 5); g.stroke(); }
}, [90, 90]);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const slab = (w, l, x, z, lines) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshStandardMaterial({ color: 0x5b6169, roughness: 0.85 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); m.receiveShadow = true; scene.add(m);
  if (lines) for (const lx of [-w / 2 + 0.4, w / 2 - 0.4]) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.12, l), new THREE.MeshBasicMaterial({ color: 0xf2f3f5 }));
    ln.rotation.x = -Math.PI / 2; ln.position.set(x + lx, 0.02, z); scene.add(ln);
  }
};
slab(12, 140, KICK.x, -20, true);          // kickflip lane
slab(14, 420, -60, -120, true);            // drag strip
slab(8, 60, 0, -40, true);                 // ramp approach
for (const x of PARK.lanes) slab(8, 110, x, -30, true); // test park lanes
const hoverRing = new THREE.Mesh(new THREE.RingGeometry(3.7, 4, 64), new THREE.MeshBasicMaterial({ color: 0x3e6ae1 }));
hoverRing.rotation.x = -Math.PI / 2; hoverRing.position.set(0, 0.03, 20); scene.add(hoverRing);

function label3d(text, pos, color = '#ffffff') {
  const t = canvasTex(512, 112, (g) => {
    g.fillStyle = 'rgba(23,26,31,.88)'; g.beginPath(); g.roundRect(4, 8, 504, 96, 48); g.fill();
    g.fillStyle = color; g.font = '500 46px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 58);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(3.4, 0.75, 1); s.position.set(...pos); scene.add(s); return s;
}

// parked vehicles get simple but readable car shapes; everything else is a box
const glassM = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.9, roughness: 0.1 });
const tyreM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
function parkedCar(c, pos) {
  const g = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ color: c.color, metalness: 0.5, roughness: 0.35 });
  const L = c.L, W = c.W, H = c.H;
  if (c.name === 'Cybertruck') {
    const s = new THREE.Shape([[-L / 2, 0.35], [-L / 2 + 0.2, 0.95], [-0.2, H], [L / 2, 1.1], [L / 2, 0.35]].map(([a, b]) => new THREE.Vector2(a, b)));
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: c.color, metalness: 0.85, roughness: 0.3, flatShading: true }));
    m.position.z = -W / 2; g.add(m);
  } else if (c.name === 'Semi') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, H - 0.6, W), paint); cab.position.set(-L / 2 + 1.3, (H - 0.6) / 2 + 0.6, 0); g.add(cab);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, W * 0.9), glassM); ws.position.set(-L / 2 - 0.01, H - 1.0, 0); g.add(ws);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(L - 2.6, 0.5, W * 0.8), new THREE.MeshStandardMaterial({ color: 0x2a2d31 })); bed.position.set(1.3, 0.85, 0); g.add(bed);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.5, W), paint); body.position.y = 0.3 + H * 0.25; g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, H * 0.42, W * 0.86), glassM); top.position.set(0.1, 0.3 + H * 0.5 + H * 0.2, 0); g.add(top);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 16).rotateX(Math.PI / 2), tyreM);
    w.position.set(sx * (L / 2 - 0.85), 0.36, sz * (W / 2 - 0.12)); g.add(w);
  }
  g.position.set(pos[0], 0, pos[2]); g.traverse((o) => (o.castShadow = o.receiveShadow = true)); scene.add(g);
}
const concrete = new THREE.MeshStandardMaterial({ color: 0x7c838c, roughness: 0.55, metalness: 0.1, flatShading: true });
for (const s of shapes) {
  if (s.label === 'cone' || s.label === 'Slalom') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 16), new THREE.MeshStandardMaterial({ color: 0xe85d1f, roughness: 0.6 }));
    cone.position.set(s.pos[0], 0.375, s.pos[2]); cone.castShadow = true; scene.add(cone);
    if (s.label === 'Slalom') label3d('Slalom', [s.pos[0] + 1.6, 2.2, s.pos[2] + 4]);
    continue;
  }
  const car = KICK.cars.find((c) => c.name === s.label);
  if (car) { parkedCar(car, s.pos); label3d(s.label, [s.pos[0] + 4.6, s.size[1] + 0.9, s.pos[2]]); continue; }
  const mat = s.color === 0x8a939c ? concrete : new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7, flatShading: true });
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s.size), mat);
  m.position.set(...s.pos); m.quaternion.set(s.quat.x, s.quat.y, s.quat.z, s.quat.w);
  m.castShadow = m.receiveShadow = true; scene.add(m);
  if (s.label && !['Ceiling section', 'Kicker', 'Wall'].includes(s.label)) label3d(s.label, [s.pos[0], Math.max(2.2, s.pos[1] + s.size[1] / 2 + 1.4), s.pos[2] + (s.label === 'Quarter pipe' ? 3 : 4)]);
}
label3d('Test park', [PARK.lanes[4], 3.2, 6]);
label3d('Reveal ramp', [LOOP.x, 2 * LOOP.R + 2.4, LOOP.z0 - 2]);
label3d('Kickflip lane', [KICK.x, 2.2, 18]);
label3d('0–60 strip', [-60, 1.6, 58]);
// ================= car + overlays =================
const car = buildCar();
scene.add(car.group);
car.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
const blob = (() => {
  const t = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; scene.add(m); return m;
})();
const FORCE_COLORS = { gravity: 0x171a1f, suspension: 0x1a8f5a, tyre: 0xd99a00, drag: 0x8a919b, fan: 0x0aa5b5, thruster: 0xe82127 };
const arrows = Array.from({ length: 40 }, () => {
  const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xffffff);
  a.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 10; });
  a.visible = false; scene.add(a); return a;
});
const noDepth = (m) => { m.material.depthTest = false; m.renderOrder = 11; return m; };
const comMark = noDepth(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: 0x3e6ae1 })));
scene.add(comMark);
const contactMarks = v.wheels.map(() => { const m = noDepth(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1a8f5a }))); scene.add(m); return m; });
const ov = { forces: false, com: false, contacts: false };

// ================= state =================
let config = 'rocket', spawnKey = 'pad', paused = false, activeScene = null, sceneKey = null, sceneT = 0;
let camMode = 'chase', inSim = false;
const keys = new Set(), latched = new Array(THRUSTERS.length).fill(false);
const buf = []; const BUF_MAX = 600;
let recording = null; const runs = []; let stepCount = 0;

function resetAll(key = spawnKey) {
  spawnKey = key;
  const sp = SPAWNS[key];
  v.setConfig(config); v.reset(sp.pos, sp.yaw);
  Object.assign(v.input, { throttle: 0, brake: 0, steer: 0, pitchCmd: 0, yawCmd: 0 });
  latched.fill(false); v.manual.fill(0); v.override = null;
  buf.length = 0; syncButtons();
}
function startScene(k) {
  const sc = SCENES[k];
  if (activeScene) stopScene('');
  config = sc.config; resetAll(sc.spawn);
  for (let i = 0; i < 90; i++) { v.step(DT); world.step(); }
  activeScene = sc; sceneKey = k; sceneT = 0; sc.start(v);
  if (tab) openTab(tab); // close the drawer so the stunt is visible
  camMode = { ramp: 'stuntRamp', kickflip: 'stuntKick', hover: 'chase', launch: 'chase' }[k]; syncButtons();
  banner(`<b>Autopilot · ${sc.title}</b><small>${sc.desc} Press any drive key to take over.</small>`);
  startRecording(sc.title);
}
const qAxis = (ax, deg) => { const h = (deg * Math.PI) / 360, l = Math.hypot(...ax); return { x: (ax[0] / l) * Math.sin(h), y: (ax[1] / l) * Math.sin(h), z: (ax[2] / l) * Math.sin(h), w: Math.cos(h) }; };
const DROPS = {
  level: { h: 12, rot: qAxis([1, 0, 0], 0), spin: [0, 0, 0], title: 'Level drop from 12 m' },
  flip: { h: 14, rot: qAxis([0, 0, 1], 180), spin: [0, 0, 0], title: 'Upside down from 14 m' },
  nose: { h: 16, rot: qAxis([1, 0, 0], -90), spin: [0, 0, 0], title: 'Nose-down from 16 m' },
  tumble: { h: 20, rot: qAxis([0.6, 1, 0.3], 135), spin: [2.5, 1.5, -3], title: 'Tumbling from 20 m' },
};
function startDrop(k) {
  const d = DROPS[k];
  if (activeScene) stopScene('');
  config = 'rocket'; resetAll('pad'); v.autoRescue = true;
  v.reset([0, d.h, 20], 0, { rot: d.rot, spin: d.spin });
  camMode = 'side'; syncButtons(); if (tab) openTab(tab);
  banner(`<b>Auto-rescue test · ${d.title}</b><small>No one is steering. The controller levels the car with the lift nozzles, then brakes the fall.</small>`, 6000);
  startRecording('Drop: ' + d.title);
  setTimeout(() => recording && recording.name === 'Drop: ' + d.title && stopRecording(), 9000);
}
function stopScene(msg) {
  if (!activeScene) return;
  activeScene = null; v.override = null;
  Object.assign(v.input, { throttle: 0, brake: 0, steer: 0 }); v.manual.fill(0);
  if (camMode.startsWith('stunt')) camMode = 'chase';
  banner(msg, 4500); if (recording) stopRecording(); syncButtons();
}

// ================= input =================
const TAKEOVER = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyH', 'KeyG',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
const needThr = () => { if (v.hasThrusters) return true; toast('Thrusters only exist on the Rocket configuration (top left).'); return false; };
function toggleHover() { if (!needThr()) return; if (v.mode === 'HOVER') v.mode = 'MANUAL'; else { v.mode = 'HOVER'; v.altTarget = Math.max(2.5, v.height + 1); } syncButtons(); }
function toggleLevel() { if (!needThr()) return; v.mode = v.mode === 'STABILIZE' ? 'MANUAL' : 'STABILIZE'; syncButtons(); }
function toggleFans() { v.fansOn = !v.fansOn; syncButtons(); }
addEventListener('keydown', (e) => {
  if (!inSim || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
  if (e.code === 'Tab' && !e.repeat) setSide(!sideOpen);
  keys.add(e.code);
  if (e.repeat) return;
  if (activeScene && TAKEOVER.has(e.code)) stopScene('<b>You have control.</b><small>Autopilot off. R resets.</small>');
  switch (e.code) {
    case 'KeyR': stopScene(''); resetAll(); toast('Reset: car, thrusters, fans and modes'); break;
    case 'KeyH': toggleHover(); break;
    case 'KeyG': toggleLevel(); break;
    case 'KeyF': toggleFans(); break;
    case 'KeyC': setCam(['chase', 'side', 'orbit', 'top'][(['chase', 'side', 'orbit', 'top'].indexOf(camMode) + 1) % 4]); break;
    case 'KeyP': paused = !paused; toast(paused ? 'Paused (P)' : 'Running'); break;
    case 'Escape': $('help').style.display = 'none'; break;
  }
  if (e.code.startsWith('Digit') || e.code.startsWith('Shift')) needThr();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.addEventListener('click', (e) => { if (e.target.closest('button')) e.target.closest('button').blur(); });

function applyInputs() {
  const k = (c) => keys.has(c), i = v.input;
  const fwd = k('KeyW') || k('ArrowUp'), back = k('KeyS') || k('ArrowDown'), left = k('KeyA') || k('ArrowLeft'), right = k('KeyD') || k('ArrowRight');
  if (v.mode === 'HOVER') {
    i.pitchCmd = (fwd ? 1 : 0) - (back ? 1 : 0); i.yawCmd = (left ? 1 : 0) - (right ? 1 : 0);
    i.throttle = 0; i.steer = 0; i.brake = k('Space') ? 1 : 0;
    if (k('KeyE')) v.altTarget = Math.min(30, v.altTarget + 2 * DT);
    if (k('KeyQ')) v.altTarget = Math.max(-0.5, v.altTarget - 2 * DT);
  } else {
    i.pitchCmd = 0; i.yawCmd = 0; i.steer = (left ? 1 : 0) - (right ? 1 : 0);
    i.throttle = fwd ? 1 : 0; i.brake = k('Space') ? 1 : 0;
    if (back) { if (v.vLong > 1) i.brake = 1; else i.throttle = -1; }
  }
  if (v.hasThrusters) {
    const boost = k('ShiftLeft') || k('ShiftRight');
    THRUSTERS.forEach((t, n) => { v.manual[n] = k('Digit' + t.key) || latched[n] || (boost && n < 2) ? 1 : 0; });
  } else v.manual.fill(0);
}
function simStep() {
  if (activeScene) {
    const done = activeScene.update(v, sceneT, DT); sceneT += DT;
    if (done) stopScene(`<b>${activeScene.title} complete</b><small>You have control. R resets, or pick another stunt.</small>`);
  } else applyInputs();
  v.step(DT); world.step(); stepCount++;
  if (stepCount % 6 === 0) {
    const t = v.telemetry(); buf.push(t); if (buf.length > BUF_MAX) buf.shift();
    if (recording && recording.samples.length < 12000) recording.samples.push(t);
  }
}

// ================= camera =================
const camPos = new THREE.Vector3(6, 3, 28), look = new THREE.Vector3(0, 0.6, 20);
let flat = new THREE.Vector3(0, 0, -1);
const fixedOff = new THREE.Vector3(5, 1, 5);
function setCam(m) { camMode = m; controls.enabled = m === 'orbit'; if (m === 'orbit') controls.target.copy(car.group.position); syncButtons(); }
function updateCamera(dt) {
  const p = car.group.position, f = new THREE.Vector3(v.fwd[0], 0, v.fwd[2]);
  if (f.length() > 0.3) flat.lerp(f.normalize(), 1 - Math.exp(-dt * 3)).normalize();
  const right = new THREE.Vector3(-flat.z, 0, flat.x);
  if (camMode === 'orbit') { controls.target.lerp(p, 0.15); controls.update(); return; }
  let target;
  if (camMode === 'chase') target = p.clone().addScaledVector(flat, -7.2).add(new THREE.Vector3(0, 2.3, 0));
  else if (camMode === 'side') target = p.clone().addScaledVector(right, 7.5).addScaledVector(flat, 1.5).add(new THREE.Vector3(0, 1.4, 0));
  else if (camMode === 'top') target = p.clone().add(new THREE.Vector3(0.01, 20, 0));
  else if (camMode === 'fixed') target = p.clone().add(fixedOff);
  else if (camMode === 'stuntRamp') target = new THREE.Vector3(LOOP.x + 17, 5.5, LOOP.z0 + 5);
  else target = new THREE.Vector3(KICK.x + 19, 5, KICK.rowEnd + 9);
  camPos.lerp(target, camMode === 'fixed' ? 1 : 1 - Math.exp(-dt * (camMode.startsWith('stunt') ? 2 : 6)));
  if (camPos.y < 0.6) camPos.y = 0.6;
  camera.position.copy(camPos);
  look.lerp(p.clone().addScaledVector(flat, camMode === 'chase' ? 2 : 0).add(new THREE.Vector3(0, camMode === 'fixed' ? 0.1 : 0.7, 0)), camMode === 'fixed' ? 1 : 1 - Math.exp(-dt * 10));
  camera.lookAt(look);
}

// ================= overlays + labels =================
const tmp = new THREE.Vector3();
function updateOverlays() {
  let n = 0;
  if (ov.forces && v.forces) for (const f of v.forces) {
    if (n >= arrows.length) break;
    const mag = Math.hypot(...f.F); if (mag < 200) continue;
    const a = arrows[n++]; a.visible = true; a.position.set(...f.p);
    a.setDirection(tmp.set(f.F[0] / mag, f.F[1] / mag, f.F[2] / mag));
    const L = Math.min(4, Math.max(0.25, mag / 8000)); a.setLength(L, Math.min(0.35, L * 0.3), 0.14); a.setColor(FORCE_COLORS[f.type]);
  }
  for (; n < arrows.length; n++) arrows[n].visible = false;
  comMark.visible = ov.com; comMark.position.copy(car.group.position);
  v.wheels.forEach((w, i) => {
    const m = contactMarks[i]; m.visible = ov.contacts && w.contact && !!w.point; if (w.point) m.position.set(...w.point);
    m.material.color.setHex(w.slip > 0.95 ? 0xe82127 : w.slip > 0.6 ? 0xd99a00 : 0x1a8f5a);
  });
}
const labelEls = car.labels.map((l) => { const el = document.createElement('div'); el.className = 'plabel'; el.textContent = l.name; $('labels').appendChild(el); return { ...l, el }; });
function updateLabels() {
  for (const l of labelEls) {
    const show = inSim && l.views.includes(car.view);
    if (!show) { l.el.style.display = 'none'; continue; }
    l.obj.getWorldPosition(tmp); tmp.project(camera);
    if (tmp.z > 1) { l.el.style.display = 'none'; continue; }
    l.el.style.display = 'block'; l.el.style.left = ((tmp.x + 1) / 2) * innerWidth + 'px'; l.el.style.top = ((1 - tmp.y) / 2) * innerHeight + 'px';
  }
}

// ================= UI wiring =================
function go(where) {
  $('landing').classList.toggle('hidden', where !== 'landing');
  $('uses').classList.toggle('hidden', where !== 'uses');
  inSim = where === 'sim'; $('hud').style.display = inSim ? 'block' : 'none';
  if (inSim && !go.seen) { go.seen = true; $('help').style.display = 'flex'; openTab('stunts'); }
  if (!inSim) keys.clear();
}
$$('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
$('btn-help').onclick = () => ($('help').style.display = 'flex');
$('help-close').onclick = () => ($('help').style.display = 'none');
let tab = null;
function openTab(t) {
  tab = tab === t ? null : t;
  $('drawer').classList.toggle('open', !!tab);
  $$('#drawer [data-pane]').forEach((p) => (p.style.display = p.dataset.pane === tab ? 'block' : 'none'));
  $$('#rail [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'systems' && car.view === 'exterior') setView('all');
}
$$('#rail [data-tab]').forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
$$('[data-cfg]').forEach((b) => (b.onclick = () => { stopScene(''); config = b.dataset.cfg; resetAll(); toast(config === 'rocket' ? 'Rocket: reported car + our hypothetical thruster system' : 'Performance: reported systems only, no thrusters'); }));
$$('[data-scene]').forEach((b) => (b.onclick = () => startScene(b.dataset.scene)));
$$('[data-drop]').forEach((b) => (b.onclick = () => startDrop(b.dataset.drop)));
$('t-rescue').onclick = () => { v.autoRescue = !v.autoRescue; syncButtons(); toast(v.autoRescue ? 'Auto-rescue on: falls are caught automatically' : 'Auto-rescue off: you are on your own'); };
$$('[data-cam]').forEach((b) => (b.onclick = () => setCam(b.dataset.cam)));
$$('[data-spawn]').forEach((b) => (b.onclick = () => { stopScene(''); resetAll(b.dataset.spawn); }));
$('btn-reset').onclick = () => { stopScene(''); resetAll(); };
$('t-fans').onclick = toggleFans; $('t-hover').onclick = toggleHover; $('t-level').onclick = toggleLevel;
$('t-unl').onclick = () => { v.unlimited = !v.unlimited; syncButtons(); };
$$('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$('btn-exitview').onclick = () => setView('exterior');
$$('[data-ov]').forEach((b) => (b.onclick = () => { ov[b.dataset.ov] = !ov[b.dataset.ov]; syncButtons(); }));
function setView(view) { car.setView(view); syncButtons(); }
function syncButtons() {
  $$('[data-cfg]').forEach((b) => b.classList.toggle('on', b.dataset.cfg === config));
  $$('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === camMode));
  $$('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === car.view));
  $$('[data-ov]').forEach((b) => b.classList.toggle('on', ov[b.dataset.ov]));
  $('t-fans').classList.toggle('on', v.fansOn); $('t-hover').classList.toggle('on', v.mode === 'HOVER');
  $('t-level').classList.toggle('on', v.mode === 'STABILIZE'); $('t-unl').classList.toggle('on', !!v.unlimited); $('t-rescue').classList.toggle('on', !!v.autoRescue);
  ['t-hover', 't-level', 't-unl', 't-rescue'].forEach((id) => ($(id).disabled = !v.hasThrusters));
  thrDots.forEach((d, i) => d.ring.setAttribute('stroke', latched[i] ? '#3e6ae1' : 'rgba(0,0,0,.35)'));
}
let toastT, bannerT;
function toast(m) { const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (t.style.opacity = 0), 2600); }
function banner(html, ms) {
  const b = $('banner'); clearTimeout(bannerT);
  if (!html) { b.style.display = 'none'; return; }
  b.innerHTML = html; b.style.display = 'block'; if (ms) bannerT = setTimeout(() => (b.style.display = 'none'), ms);
}

// thruster map (top view)
const svg = $('thrsvg'), NS = 'http://www.w3.org/2000/svg';
const S = 50; // px per metre
{
  const outline = [[-0.86, -2.25], [-0.98, -2.0], [-1.0, -1.2], [-1.0, 1.5], [-1.04, 1.8], [-0.98, 2.25], [0.98, 2.25], [1.04, 1.8], [1.0, 1.5], [1.0, -1.2], [0.98, -2.0], [0.86, -2.25]];
  const body = document.createElementNS(NS, 'polygon');
  body.setAttribute('points', outline.map(([x, z]) => `${x * S},${z * S}`).join(' '));
  Object.entries({ fill: 'rgba(0,0,0,.03)', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.5 }).forEach(([k, val]) => body.setAttribute(k, val));
  svg.appendChild(body);
  const cab = document.createElementNS(NS, 'polygon');
  cab.setAttribute('points', [[-0.44, -0.95], [0.44, -0.95], [0.5, 1.0], [0.1, 2.0], [-0.1, 2.0], [-0.5, 1.0]].map(([x, z]) => `${x * S},${z * S}`).join(' '));
  cab.setAttribute('fill', 'rgba(0,0,0,.12)'); svg.appendChild(cab);
}
const thrDots = THRUSTERS.map((t, i) => {
  const lateral = t.dir[0] !== 0, cx = (t.pos[0] + t.dir[0] * 0.35) * S, cy = t.pos[2] * S;
  const g = document.createElementNS(NS, 'g'); g.classList.add('dot');
  const glow = document.createElementNS(NS, 'circle'); glow.setAttribute('cx', cx); glow.setAttribute('cy', cy); glow.setAttribute('r', 0); glow.setAttribute('fill', 'rgba(232,33,39,.22)');
  const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', t.max > 15000 ? 7 : 5.5);
  ring.setAttribute('fill', '#ffffff'); ring.setAttribute('stroke-width', 1.5);
  const tx = document.createElementNS(NS, 'text'); tx.textContent = t.id.slice(1); tx.setAttribute('x', cx); tx.setAttribute('y', cy + 3); tx.setAttribute('text-anchor', 'middle');
  Object.entries({ 'font-size': 7.5, fill: '#3a3f47', 'font-family': 'Consolas, monospace', 'pointer-events': 'none' }).forEach(([k, val]) => tx.setAttribute(k, val));
  const title = document.createElementNS(NS, 'title'); title.textContent = `${t.id} ${t.name}: up to ${(t.max / 1000).toFixed(0)} kN [hypothetical]. ${lateral ? 'Pushes sideways.' : t.dir[1] ? 'Pushes up (lift).' : 'Pushes forward.'} Key ${t.key}. Click to lock on/off.`;
  g.append(glow, ring, tx, title); svg.appendChild(g);
  g.onclick = () => { if (!needThr()) return; latched[i] = !latched[i]; syncButtons(); };
  return { glow, ring };
});

// parameters
function buildParams() {
  $('params').innerHTML = '';
  for (const [k, p] of Object.entries(P).filter(([, p]) => p.edit)) {
    const d = document.createElement('div'); d.className = 'param';
    d.innerHTML = `<div class="top"><span>${k} <span class="tag ${p.tag}">${{ R: 'REPORTED', E: 'ESTIMATE', H: 'HYPOTHETICAL' }[p.tag]}</span></span><b class="pv"></b></div>
      <input type="range" min="${p.edit[0]}" max="${p.edit[1]}" step="${(p.edit[1] - p.edit[0]) / 100}" value="${p.v}"><div class="src">${p.src}</div>`;
    const out = d.querySelector('.pv'), inp = d.querySelector('input');
    const show = () => { const mod = p.v !== DEFAULTS[k]; out.textContent = `${(+p.v).toFixed(p.v < 10 ? 2 : 0)} ${p.unit}${mod ? ' · changed' : ''}`; out.style.color = mod ? 'var(--warn)' : ''; };
    inp.oninput = () => { p.v = +inp.value; applyParam(k); show(); };
    show(); $('params').appendChild(d);
  }
  const t = document.createElement('table'); t.className = 'tel';
  t.innerHTML = Object.entries(P).filter(([, p]) => !p.edit).map(([k, p]) => `<tr><td>${k} <span class="tag ${p.tag}">${p.tag}</span></td><td>${p.v} ${p.unit}</td></tr>`).join('');
  $('params').appendChild(t);
}
function applyParam(k) { if (k === 'gravity') world.gravity = { x: 0, y: -P.gravity.v, z: 0 }; if (k === 'massDry') v.updateMass(true); }
$('btn-preset').onclick = () => { for (const k in DEFAULTS) P[k].v = DEFAULTS[k]; applyParam('gravity'); applyParam('massDry'); buildParams(); };
buildParams();

const TEL = [
  ['Speed', (t) => t.kmh.toFixed(1), 'km/h'], ['Acceleration', (t) => t.accel.toFixed(2), 'g'], ['Height', (t) => Math.max(0, t.height).toFixed(2), 'm'],
  ['Pitch / roll', (t) => `${t.pitch.toFixed(0)} / ${t.roll.toFixed(0)}`, '°'], ['Spin (yaw rate)', (t) => t.yawRate.toFixed(0), '°/s'],
  ['Mass incl. air', (t) => t.mass.toFixed(0), 'kg'], ['Air left', (t) => t.gasKg.toFixed(1), 'kg'], ['Tank pressure', (t) => t.pressureBar.toFixed(0), 'bar'],
  ['Thrust', (t) => t.thrustkN.toFixed(1), 'kN'], ['Air flow', (t) => t.massFlow.toFixed(1), 'kg/s'], ['Fan suction', (t) => t.fankN.toFixed(1), 'kN'],
  ['Underbody seal', (t) => (t.seal * 100).toFixed(0), '%'], ['Wheel loads', (t) => t.loads.map((x) => x.toFixed(1)).join(' '), 'kN'],
  ['0–60 mph', (t) => (t.t60 ? t.t60.toFixed(2) : '—'), 's'], ['Controller', () => (v.ctrl?.active ? `${v.ctrl.attErrDeg.toFixed(0)}° off level${v.ctrl.saturated ? ', at limit' : ''}` : 'off'), ''],
];
$('tel').innerHTML = TEL.map(([k], i) => `<tr><td>${k}</td><td id="tv${i}"></td></tr>`).join('');
const GVARS = { kmh: 'Speed km/h', height: 'Height m', thrustkN: 'Thrust kN', gasKg: 'Air left kg', pressureBar: 'Pressure bar', fankN: 'Suction kN', accel: 'Accel g', pitch: 'Pitch °', roll: 'Roll °', yawRate: 'Yaw rate °/s' };
$('gvar').innerHTML = Object.entries(GVARS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
function drawGraph() {
  const c = $('graph'), g = c.getContext('2d'), W = c.width, H = c.height, k = $('gvar').value;
  g.clearRect(0, 0, W, H);
  const series = [{ d: buf, col: '#3e6ae1' }]; if (runs.length) series.push({ d: runs[runs.length - 1].samples, col: '#e82127' });
  let lo = Infinity, hi = -Infinity; for (const s of series) for (const t of s.d) { lo = Math.min(lo, t[k]); hi = Math.max(hi, t[k]); }
  if (!isFinite(lo)) return; if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  g.font = '10px Consolas, monospace'; g.fillStyle = '#8a919b'; g.strokeStyle = 'rgba(0,0,0,.07)';
  for (let i = 0; i <= 4; i++) { const yy = 8 + (i * (H - 22)) / 4; g.beginPath(); g.moveTo(32, yy); g.lineTo(W, yy); g.stroke(); g.fillText((hi - (i * (hi - lo)) / 4).toFixed(hi - lo < 10 ? 1 : 0), 0, yy + 3); }
  for (const s of series) {
    if (!s.d.length) continue;
    const t0 = s === series[0] ? s.d[s.d.length - 1].t - 30 : s.d[0].t;
    g.strokeStyle = s.col; g.lineWidth = 1.6; g.beginPath();
    s.d.forEach((t, i) => { const x = 32 + ((t.t - t0) / 30) * (W - 32), yy = 8 + ((hi - t[k]) / (hi - lo)) * (H - 22); i ? g.lineTo(x, yy) : g.moveTo(x, yy); });
    g.stroke();
  }
  g.fillStyle = '#3e6ae1'; g.fillText(recording ? 'recording' : 'live, last 30 s', 36, H - 2);
  if (series[1]) { g.fillStyle = '#e82127'; g.fillText('red: ' + runs[runs.length - 1].name, 140, H - 2); }
}
function startRecording(name = 'Manual run') {
  recording = { name, started: new Date().toISOString(), config, scene: sceneKey, unlimitedAir: v.unlimited, samples: [],
    params: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, { value: p.v, unit: p.unit, tag: p.tag, source: p.src }])) };
  $('btn-rec').textContent = '■ Stop'; $('btn-rec').classList.add('on');
}
function stopRecording() {
  if (!recording) return; recording.events = v.events.slice(); runs.push(recording); if (runs.length > 5) runs.shift();
  recording = null; $('btn-rec').textContent = '● Record'; $('btn-rec').classList.remove('on');
}
$('btn-rec').onclick = () => (recording ? stopRecording() : startRecording());
const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const lastRun = () => recording || runs[runs.length - 1];
$('btn-csv').onclick = () => {
  const r = lastRun(); if (!r || !r.samples.length) return toast('Record a run first, or play a stunt.');
  const cols = ['t', 'kmh', 'accel', 'height', 'x', 'y', 'z', 'pitch', 'roll', 'yawRate', 'mass', 'gasKg', 'pressureBar', 'thrustkN', 'massFlow', 'fankN', 'seal', 'contacts', 'mode'];
  const head = ['# Roadster Lab: SIMULATED DATA, not measured on a real car', `# run: ${r.name}; ${r.started}; config ${r.config}; unlimited air ${r.unlimitedAir}`,
    ...Object.entries(r.params).map(([k, p]) => `# ${k} = ${p.value} ${p.unit} [${p.tag}] ${p.source}`),
    '# units: t s, kmh km/h, accel g, height/x/y/z m, pitch/roll deg, yawRate deg/s, mass/gasKg kg, pressureBar bar, thrustkN/fankN kN, massFlow kg/s, seal 0-1'];
  dl(`roadster-${Date.now()}.csv`, [...head, cols.join(','), ...r.samples.map((s) => cols.map((c) => (typeof s[c] === 'number' ? +s[c].toFixed(4) : s[c])).join(','))].join('\n'), 'text/csv');
};
$('btn-json').onclick = () => { const r = lastRun(); if (!r) return toast('Record a run first.'); dl(`roadster-${Date.now()}.json`, JSON.stringify({ note: 'Simulated data, not real-world measurement', ...r }, null, 1), 'application/json'); };

// ================= sidebar + context hints =================
const kb = (k) => `<kbd>${k}</kbd>`;
function hintText() {
  if (activeScene) return `<b>Autopilot</b> ${kb('W')} or any drive key takes over · ${kb('R')} reset`;
  if (v.mode === 'HOVER') return `<b>Hovering</b> ${kb('W')}${kb('S')} tilt · ${kb('A')}${kb('D')} turn · ${kb('E')}${kb('Q')} up / down · ${kb('H')} land and drive`;
  if (v.mode === 'STABILIZE') return `<b>Auto-level</b> keeps the car flat in the air · ${kb('G')} off`;
  const thr = v.hasThrusters ? ` · ${kb('Shift')} boost · ${kb('H')} hover` : ' · switch to <b>Rocket</b> for thrusters';
  return `<b>Driving</b> ${kb('W')}${kb('S')} go / brake · ${kb('A')}${kb('D')} steer${thr} · ${kb('F')} fans · ${kb('R')} reset · ${kb('Tab')} live panel`;
}
let sideOpen = true;
try { sideOpen = localStorage.getItem('roadster.side') !== 'closed'; } catch {}
function setSide(open) {
  sideOpen = open; $('side').classList.toggle('collapsed', !open); $('side-tab').style.display = open ? 'none' : 'flex';
  try { localStorage.setItem('roadster.side', open ? 'open' : 'closed'); } catch {}
}
$('side-close').onclick = () => setSide(false); $('side-tab').onclick = () => setSide(true);
setSide(sideOpen);

// auto quality: weak laptops drop real shadows (the soft blob shadow stays) after ~3 s below 35 fps
let slowT = 0;
function autoQuality() {
  if (!renderer.shadowMap.enabled || !inSim) return;
  slowT = fps < 35 ? slowT + 0.5 : 0;
  if (slowT >= 3) {
    renderer.shadowMap.enabled = false; key.castShadow = false;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    toast('Low frame rate: shadows turned off to keep it smooth.');
  }
}
// ================= per-frame HUD =================
let uiT = 0, fps = 60, fA = 0, fN = 0;
function caption(t) {
  const flowS = t.massFlow > 0 ? (v.gas / Math.max(t.massFlow, 1e-6)).toFixed(1) : '—';
  const pw = (Math.abs(v.input.throttle) * Math.min(P.wheelTorque.v / P.wheelRadius.v, (P.peakPower.v * 1000) / Math.max(t.speed, 1)) * t.speed) / 1000;
  return {
    power: `<b>Battery → 3 motors → wheels.</b> One motor drives the front axle and one drives each rear wheel. Total wheel torque is capped at 10,000 N·m <span class="tag R">R</span> and power at ~1,040 kW <span class="tag E">E</span>. Above about 130 km/h, power is the limit instead of torque.<div class="live">now: ${pw.toFixed(0)} kW to the road · ${t.kmh.toFixed(0)} km/h</div>`,
    air: `<b>Tank → valves → nozzles.</b> 600 L of air <span class="tag R">R</span> at about 690 bar <span class="tag E">E</span>. A nozzle's push = air flow × exhaust speed (~700 m/s <span class="tag E">E</span>), so 1 kg/s of air gives 0.7 kN. Below 20 % pressure the regulator can't hold full thrust <span class="tag H">H</span>.<div class="live">now: ${t.massFlow.toFixed(1)} kg/s → ${t.thrustkN.toFixed(1)} kN · ${t.gasKg.toFixed(0)} kg left${t.massFlow > 0 ? ` · empty in ${flowS} s` : ''}</div>`,
    fans: `<b>Fans pull air out from under the car.</b> Lower pressure underneath, higher on top, so the car is pressed onto any surface, even a ceiling. Up to 2 g <span class="tag R">R</span>, but only while the underbody is sealed. Lift it more than ~0.3 m off the surface and suction fades.<div class="live">now: ${t.fankN.toFixed(1)} kN = ${(t.fankN * 1000 / (t.mass * 9.81)).toFixed(2)} g · seal ${(t.seal * 100).toFixed(0)} %</div>`,
    all: `<b>Three systems, one battery.</b> Yellow = electric power to the motors. Blue = compressed air to the 10 thrusters. Teal = fan suction. Each flow moves only while that system is working.<div class="live">${t.kmh.toFixed(0)} km/h · thrust ${t.thrustkN.toFixed(1)} kN · suction ${t.fankN.toFixed(1)} kN</div>`,
  }[car.view] || 'Pick a system above.';
}
function updateHUD(dt) {
  fA += dt; fN++; if (fA > 0.5) { fps = fN / fA; fA = fN = 0; autoQuality(); }
  uiT += dt; if (uiT < 0.1) return; uiT = 0;
  const t = v.telemetry();
  $('g-speed').textContent = t.kmh.toFixed(0);
  $('g-height').textContent = t.height > 150 ? '—' : Math.max(0, t.height).toFixed(1);
  $('g-thrust').textContent = t.thrustkN.toFixed(1); $('g-fan').textContent = t.fankN.toFixed(1);
  if (v.hasThrusters) {
    $('g-gas').textContent = v.unlimited ? '∞' : t.gasPct.toFixed(0) + '%';
    $('g-gas-u').textContent = v.unlimited ? 'unlimited (sandbox)' : `${t.gasKg.toFixed(0)} kg · ${t.pressureBar.toFixed(0)} bar`;
    const b = $('g-gas-bar'); b.style.width = (v.unlimited ? 100 : t.gasPct) + '%';
    b.style.background = v.unlimited ? 'var(--hyp)' : t.gasPct < 20 ? 'var(--bad)' : t.gasPct < 40 ? 'var(--warn)' : 'var(--accent)';
  } else { $('g-gas').textContent = '—'; $('g-gas-u').textContent = 'no thrusters'; $('g-gas-bar').style.width = 0; }
  $('tab-speed').textContent = t.kmh.toFixed(0);
  if (v.hasThrusters && !v.unlimited && t.massFlow > 0.5) $('g-gas-t').textContent = `empty in ${(t.gasKg / t.massFlow).toFixed(1)} s`;
  else if (v.hasLift && !v.unlimited) $('g-gas-t').textContent = `≈ ${(HOVER_S * Math.max(0, (t.gasPct - 40) / 60)).toFixed(1)} s of hover`;
  else $('g-gas-t').textContent = '';
  const chip = (txt, cls = '') => `<span class="chip ${cls}">${txt}</span>`;
  const modeTxt = activeScene ? 'AUTOPILOT' : { MANUAL: 'DRIVING', STABILIZE: 'AUTO-LEVEL', HOVER: `HOVER ${v.altTarget.toFixed(1)} m` }[v.mode];
  $('chips').innerHTML = chip(config === 'rocket' ? 'ROCKET' : 'PERFORMANCE', 'on') + chip(modeTxt, v.mode !== 'MANUAL' || activeScene ? 'on' : '')
    + chip(v.fansOn ? 'FANS ON' : 'FANS OFF', v.fansOn ? 'on' : '') + (v.unlimited ? chip('UNLIMITED AIR', 'warn') : '')
    + (v.rescuing ? chip('AUTO-RESCUE', 'bad') : '') + (t.contacts === 0 ? chip('AIRBORNE', 'warn') : '') + (paused ? chip('PAUSED', 'warn') : '') + chip(`${fps.toFixed(0)} FPS`);
  const alerts = [];
  if (v.ctrl?.saturated) alerts.push('Thrust limit: the controller wants more push than the nozzles can give.');
  if (v.hasThrusters && !v.unlimited && t.gasPct < 25) alerts.push(t.gasPct <= 0.1 ? 'Air tank empty: thrusters are dead. Press R to refill.' : 'Air low: below 20 % pressure the nozzles lose thrust.');
  if (v.upY < -0.5 && t.contacts > 0 && t.fankN < 5) alerts.push('Upside down without suction: it will fall.');
  $('alert').style.display = alerts.length ? 'block' : 'none'; $('alert').textContent = alerts.join(' ');
  $('hint').innerHTML = hintText();
  $('thr-total').textContent = `${t.thrustkN.toFixed(1)} kN`;
  thrDots.forEach((d, i) => { const f = v.thrust[i] / THRUSTERS[i].max; d.glow.setAttribute('r', f > 0.01 ? 7 + 9 * f : 0); d.ring.setAttribute('fill', f > 0.01 ? '#e82127' : '#ffffff'); });
  if (sideOpen) {
    drawGraph();
    if ($('tel').closest('details').open) TEL.forEach(([, f, u], i) => ($('tv' + i).textContent = `${f(t)} ${u}`));
    $('events').innerHTML = v.events.slice(-5).reverse().map((e) => `${e.t.toFixed(1)} s · ${e.text}`).join('<br>') || 'Nothing yet';
  }
  if (tab === 'systems') $('caption').innerHTML = caption(t);
}

// ================= loop =================
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!inSim) return;
  if (!paused) { acc += dt; let n = 0; while (acc >= DT && n < 12) { simStep(); acc -= DT; n++; } if (n === 12) acc = 0; }
  const tr = v.body.translation(), q = v.body.rotation();
  car.group.position.set(tr.x, tr.y, tr.z); car.group.quaternion.set(q.x, q.y, q.z, q.w);
  car.update(v, dt);
  const gy = tr.y - (v.height ?? 0) - 0.49;
  blob.position.set(tr.x, gy + 0.03, tr.z); blob.rotation.z = Math.atan2(v.fwd[0], v.fwd[2]);
  blob.visible = v.height < 25; blob.material.opacity = Math.max(0, 1 - v.height / 8);
  key.target.position.set(tr.x, tr.y, tr.z); key.position.set(tr.x - 30, tr.y + 45, tr.z + 35);
  updateCamera(dt); updateOverlays(); updateLabels(); updateHUD(dt);
  renderer.render(scene, camera);
}
resetAll('pad'); syncButtons();
$('loading').remove();
requestAnimationFrame(frame);
window.lab = { frame, renderer, scene, resize, v, car, camera, setCam, setView, startScene, go, shot: (x, y, z) => { fixedOff.set(x, y, z); camMode = 'fixed'; camPos.copy(car.group.position).add(fixedOff); look.copy(car.group.position); } }; // debug hook
