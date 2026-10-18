// App shell: renderer + environment, fixed-step loop, input, cameras, HUD, "How it works" view, data tools.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from './vehicle.js';
import { buildWorld, SPAWNS, LOOP, KICK } from './world.js';
import { buildCar } from './car.js';
import { SCENES } from './scenes.js';
import { P, THRUSTERS } from './params.js';

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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x141821, 90, 420);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
const controls = new OrbitControls(camera, canvas);
controls.enabled = false; controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;

// sky: night gradient with a warm horizon glow, like the reveal photo
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `varying vec3 p; void main(){
    float h = max(p.y, 0.0);
    vec3 zen = vec3(0.012,0.02,0.045), mid = vec3(0.05,0.08,0.14), hor = vec3(0.55,0.27,0.13);
    vec3 c = mix(mid, zen, smoothstep(0.05, 0.6, h));
    c = mix(c, hor, exp(-h * 22.0) * 0.85);
    if (p.y < 0.0) c = vec3(0.06,0.05,0.05);
    gl_FragColor = vec4(c, 1.0); }`,
}));
scene.add(sky);
{ // stars
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * Math.PI * 2, h = 0.08 + Math.random() * 0.92, r = 560;
    const s = Math.sqrt(1 - h * h); pos.set([Math.cos(u) * s * r, h * r, Math.sin(u) * s * r], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false })));
}
{ // distant mountain silhouettes
  const seg = 160, pos = [];
  let h = 20;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2; h = Math.max(6, Math.min(48, h + (Math.random() - 0.5) * 14));
    const x = Math.cos(a) * 380, z = Math.sin(a) * 380;
    pos.push(x, -2, z, x, h, z);
  }
  const idx = []; for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0b0d12, side: THREE.DoubleSide, fog: false })));
}
scene.add(new THREE.HemisphereLight(0x7b8fbf, 0x3a2c22, 1.0));
const key = new THREE.DirectionalLight(0xffe7cf, 2.4);
key.position.set(-30, 45, 35); key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 140 });
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x9fc4ff, 1.1); rim.position.set(30, 20, -40); scene.add(rim);

function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rep) t.repeat.set(...rep); t.anisotropy = 4; return t;
}
const noise = (g, w, h, base, n, a) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,220' : '0,0,0'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const desert = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
  new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => noise(g, w, h, '#3a3029', 9000, 0.22), [90, 90]), roughness: 1 }));
desert.rotation.x = -Math.PI / 2; desert.receiveShadow = true; scene.add(desert);
const asphalt = canvasTex(256, 256, (g, w, h) => noise(g, w, h, '#17181b', 5000, 0.12));
const slab = (w, l, x, z, lines) => {
  const t = asphalt.clone(); t.needsUpdate = true; t.repeat.set(w / 3, l / 3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); m.receiveShadow = true; scene.add(m);
  if (lines) for (const lx of [-w / 2 + 0.4, w / 2 - 0.4]) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(0.15, l), new THREE.MeshBasicMaterial({ color: 0xd8dde3 }));
    ln.rotation.x = -Math.PI / 2; ln.position.set(x + lx, 0.02, z); scene.add(ln);
  }
};
slab(70, 70, 0, 0, false);                 // main test pad (hover pad + ramp approach)
slab(12, 140, KICK.x, -20, true);          // kickflip lane
slab(14, 420, -60, -120, true);            // drag strip
slab(8, 60, 0, -40, true);                 // ramp approach
const hoverRing = new THREE.Mesh(new THREE.RingGeometry(3.7, 4, 48), new THREE.MeshBasicMaterial({ color: 0x5cc8ff }));
hoverRing.rotation.x = -Math.PI / 2; hoverRing.position.set(0, 0.03, 20); scene.add(hoverRing);

function label3d(text, pos, color = '#eef1f4') {
  const t = canvasTex(512, 112, (g) => {
    g.fillStyle = 'rgba(8,10,14,.82)'; g.beginPath(); g.roundRect(4, 8, 504, 96, 22); g.fill();
    g.fillStyle = color; g.font = '600 50px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 58);
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
const concrete = new THREE.MeshStandardMaterial({ color: 0xa9adb3, roughness: 0.75, metalness: 0.05, flatShading: true });
for (const s of shapes) {
  const car = KICK.cars.find((c) => c.name === s.label);
  if (car) { parkedCar(car, s.pos); label3d(s.label, [s.pos[0] + 4.6, s.size[1] + 0.9, s.pos[2]]); continue; }
  const mat = s.color === 0x8a939c ? concrete : new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7, flatShading: true });
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s.size), mat);
  m.position.set(...s.pos); m.quaternion.set(s.quat.x, s.quat.y, s.quat.z, s.quat.w);
  m.castShadow = m.receiveShadow = true; scene.add(m);
}
label3d('Reveal ramp', [LOOP.x, 2 * LOOP.R + 2.4, LOOP.z0 - 2], '#5cc8ff');
label3d('Kickflip lane', [KICK.x, 2.2, 18], '#5cc8ff');
label3d('0–60 strip', [-60, 1.6, 58], '#5cc8ff');
// floodlight towers (visual)
for (const [x, z] of [[12, -50], [-12, -70], [52, -45], [-48, 40], [20, 30]]) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 12, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f35 }));
  pole.position.set(x, 6, z); scene.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff3dc }));
  head.position.set(x, 12, z); scene.add(head);
}

// ================= car + overlays =================
const car = buildCar();
scene.add(car.group);
car.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
const blob = (() => {
  const t = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; scene.add(m); return m;
})();
const FORCE_COLORS = { gravity: 0xffffff, suspension: 0x55e09a, tyre: 0xffd84f, drag: 0x9aa4b1, fan: 0x2ec4c4, thruster: 0xff8a3d };
const arrows = Array.from({ length: 40 }, () => {
  const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xffffff);
  a.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 10; });
  a.visible = false; scene.add(a); return a;
});
const noDepth = (m) => { m.material.depthTest = false; m.renderOrder = 11; return m; };
const comMark = noDepth(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffd400 })));
scene.add(comMark);
const contactMarks = v.wheels.map(() => { const m = noDepth(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0x55e09a }))); scene.add(m); return m; });
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
    m.material.color.setHex(w.slip > 0.95 ? 0xff5a5a : w.slip > 0.6 ? 0xffb547 : 0x55e09a);
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
  $('t-level').classList.toggle('on', v.mode === 'STABILIZE'); $('t-unl').classList.toggle('on', !!v.unlimited);
  ['t-hover', 't-level', 't-unl'].forEach((id) => ($(id).disabled = !v.hasThrusters));
  thrDots.forEach((d, i) => d.ring.setAttribute('stroke', latched[i] ? '#5cc8ff' : 'rgba(255,255,255,.35)'));
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
  Object.entries({ fill: 'rgba(255,255,255,.05)', stroke: 'rgba(255,255,255,.3)', 'stroke-width': 1.5 }).forEach(([k, val]) => body.setAttribute(k, val));
  svg.appendChild(body);
  const cab = document.createElementNS(NS, 'polygon');
  cab.setAttribute('points', [[-0.44, -0.95], [0.44, -0.95], [0.5, 1.0], [0.1, 2.0], [-0.1, 2.0], [-0.5, 1.0]].map(([x, z]) => `${x * S},${z * S}`).join(' '));
  cab.setAttribute('fill', 'rgba(0,0,0,.45)'); svg.appendChild(cab);
}
const thrDots = THRUSTERS.map((t, i) => {
  const lateral = t.dir[0] !== 0, cx = (t.pos[0] + t.dir[0] * 0.35) * S, cy = t.pos[2] * S;
  const g = document.createElementNS(NS, 'g'); g.classList.add('dot');
  const glow = document.createElementNS(NS, 'circle'); glow.setAttribute('cx', cx); glow.setAttribute('cy', cy); glow.setAttribute('r', 0); glow.setAttribute('fill', 'rgba(255,138,61,.35)');
  const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', t.max > 15000 ? 7 : 5.5);
  ring.setAttribute('fill', '#141920'); ring.setAttribute('stroke-width', 1.5);
  const tx = document.createElementNS(NS, 'text'); tx.textContent = t.id.slice(1); tx.setAttribute('x', cx); tx.setAttribute('y', cy + 3); tx.setAttribute('text-anchor', 'middle');
  Object.entries({ 'font-size': 7.5, fill: '#cfd6de', 'font-family': 'Consolas, monospace', 'pointer-events': 'none' }).forEach(([k, val]) => tx.setAttribute(k, val));
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
  const series = [{ d: buf, col: '#5cc8ff' }]; if (runs.length) series.push({ d: runs[runs.length - 1].samples, col: '#c393ff' });
  let lo = Infinity, hi = -Infinity; for (const s of series) for (const t of s.d) { lo = Math.min(lo, t[k]); hi = Math.max(hi, t[k]); }
  if (!isFinite(lo)) return; if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  g.font = '10px Consolas, monospace'; g.fillStyle = '#5d6672'; g.strokeStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i <= 4; i++) { const yy = 8 + (i * (H - 22)) / 4; g.beginPath(); g.moveTo(32, yy); g.lineTo(W, yy); g.stroke(); g.fillText((hi - (i * (hi - lo)) / 4).toFixed(hi - lo < 10 ? 1 : 0), 0, yy + 3); }
  for (const s of series) {
    if (!s.d.length) continue;
    const t0 = s === series[0] ? s.d[s.d.length - 1].t - 30 : s.d[0].t;
    g.strokeStyle = s.col; g.lineWidth = 1.6; g.beginPath();
    s.d.forEach((t, i) => { const x = 32 + ((t.t - t0) / 30) * (W - 32), yy = 8 + ((hi - t[k]) / (hi - lo)) * (H - 22); i ? g.lineTo(x, yy) : g.moveTo(x, yy); });
    g.stroke();
  }
  g.fillStyle = '#5cc8ff'; g.fillText(recording ? 'recording' : 'live, last 30 s', 36, H - 2);
  if (series[1]) { g.fillStyle = '#c393ff'; g.fillText('purple: ' + runs[runs.length - 1].name, 140, H - 2); }
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

// ================= per-frame HUD =================
let uiT = 0, fps = 60, fA = 0, fN = 0;
function caption(t) {
  const flowS = t.massFlow > 0 ? (v.gas / Math.max(t.massFlow, 1e-6)).toFixed(1) : '—';
  const pw = (Math.abs(v.input.throttle) * Math.min(P.wheelTorque.v / P.wheelRadius.v, (P.peakPower.v * 1000) / Math.max(t.speed, 1)) * t.speed) / 1000;
  return {
    power: `<b>Battery → 3 motors → wheels.</b> One motor drives the front axle and one drives each rear wheel. Total wheel torque is capped at 10,000 N·m <span class="tag R">R</span> and power at ~1,040 kW <span class="tag E">E</span>. Above about 130 km/h, power is the limit instead of torque.<div class="live">now: ${pw.toFixed(0)} kW to the road · ${t.kmh.toFixed(0)} km/h</div>`,
    air: `<b>Tank → valves → nozzles.</b> 600 L of air <span class="tag R">R</span> at about 690 bar <span class="tag E">E</span>. A nozzle's push = air flow × exhaust speed (~700 m/s <span class="tag E">E</span>), so 1 kg/s of air gives 0.7 kN. Below 20 % pressure the regulator can't hold full thrust <span class="tag H">H</span>.<div class="live">now: ${t.massFlow.toFixed(1)} kg/s → ${t.thrustkN.toFixed(1)} kN · ${t.gasKg.toFixed(0)} kg left${t.massFlow > 0 ? ` · empty in ${flowS} s` : ''}</div>`,
    fans: `<b>Fans pull air out from under the car.</b> Lower pressure underneath, higher on top, so the car is pressed onto any surface, even a ceiling. Up to 2 g <span class="tag R">R</span>, but only while the underbody is sealed. Lift it more than ~0.3 m off the surface and suction fades.<div class="live">now: ${t.fankN.toFixed(1)} kN = ${(t.fankN * 1000 / (t.mass * 9.81)).toFixed(2)} g · seal ${(t.seal * 100).toFixed(0)} %</div>`,
    all: `<b>Three systems, one battery.</b> Yellow = electric power to the motors. Blue = compressed air to the 10 thrusters. Cyan = fan suction. Each flow moves only while that system is working.<div class="live">${t.kmh.toFixed(0)} km/h · thrust ${t.thrustkN.toFixed(1)} kN · suction ${t.fankN.toFixed(1)} kN</div>`,
  }[car.view] || 'Pick a system above.';
}
function updateHUD(dt) {
  fA += dt; fN++; if (fA > 0.5) { fps = fN / fA; fA = fN = 0; }
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
  const mode = { MANUAL: activeScene ? 'AUTOPILOT' : 'DRIVING', STABILIZE: 'AUTO-LEVEL', HOVER: `HOVER · holding ${v.altTarget.toFixed(1)} m` }[v.mode];
  $('modepill').innerHTML = `${config === 'rocket' ? 'ROCKET' : 'PERFORMANCE'} · ${mode}${v.fansOn ? ' · FANS ON' : ''}${v.ctrl?.saturated ? ' · <span style="color:var(--bad)">AT THRUST LIMIT</span>' : ''}${paused ? ' · PAUSED' : ''}<span style="color:var(--faint)"> · ${fps.toFixed(0)} fps</span>`;
  $('thr-total').textContent = `${t.thrustkN.toFixed(1)} kN`;
  thrDots.forEach((d, i) => { const f = v.thrust[i] / THRUSTERS[i].max; d.glow.setAttribute('r', f > 0.01 ? 7 + 9 * f : 0); d.ring.setAttribute('fill', f > 0.01 ? '#ff8a3d' : '#141920'); });
  if (tab === 'systems') $('caption').innerHTML = caption(t);
  if (tab === 'data') {
    TEL.forEach(([, f, u], i) => ($('tv' + i).textContent = `${f(t)} ${u}`));
    $('events').innerHTML = v.events.slice(-10).reverse().map((e) => `${e.t.toFixed(1)} s · ${e.text}`).join('<br>');
    drawGraph();
  }
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
window.lab = { v, car, camera, setCam, setView, startScene, go, shot: (x, y, z) => { fixedOff.set(x, y, z); camMode = 'fixed'; camPos.copy(car.group.position).add(fixedOff); look.copy(car.group.position); } }; // debug hook
