// App shell: physics loop, renderer, landing showroom, HUD, stunts, challenges, lab, replay, photo mode, tour.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '../vendor/rapier.mjs';
import { Vehicle } from './vehicle.js';
import { buildWorld, SPAWNS, LOOP, KICK } from './world.js';
import { buildCar } from './car.js';
import { SCENES } from './scenes.js';
import { P, THRUSTERS, TRIMS, CG } from './params.js';
import * as claims from './physics/claims.js';
import { Environments, ENVS } from './render/env.js';
import { buildWorldView } from './render/worldview.js';
import { Pipeline } from './render/post.js';
import { PRESETS, guessTier, AutoScaler } from './render/quality.js';
import { canvasTex } from './render/tex.js';
import { Effects } from './render/fx.js';
import { Audio } from './audio.js';
import { Replay } from './replay.js';
import { CHALLENGES, saveBest, bestOf, medal } from './challenges.js';
import * as lab from './lab.js';

const DT = 1 / 120;
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);
const DEFAULTS = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.v]));
const store = { get: (k, d) => { try { return localStorage.getItem('roadster.' + k) ?? d; } catch { return d; } }, set: (k, x) => { try { localStorage.setItem('roadster.' + k, x); } catch {} } };

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -P.gravity.v, z: 0 });
world.timestep = DT;
const shapes = buildWorld(RAPIER, world);
const v = new Vehicle(RAPIER, world, 'rocket');

// ================= renderer, worlds, quality =================
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 6000);
const controls = new OrbitControls(camera, canvas);
controls.enabled = false; controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495;
const envs = new Environments(renderer, scene);
const pipeline = new Pipeline(renderer, scene, camera);
const scaler = new AutoScaler(55);
const gpu = guessTier(renderer);
let qName = store.get('quality', 'auto'), preset = PRESETS[qName === 'auto' ? gpu.tier : qName] || PRESETS.medium, envName = store.get('env', 'saltflat');
const view = buildWorldView(scene, shapes);
const fx = new Effects(scene);
const audio = new Audio(); audio.volume = +store.get('volume', 0.7);
const replay = new Replay();
const car = buildCar(); scene.add(car.group);

function applyQuality(name) {
  qName = name; preset = PRESETS[name === 'auto' ? gpu.tier : name];
  scaler.scale = preset.pr[1]; renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pr[1]));
  renderer.shadowMap.enabled = !!preset.shadow;
  fx.density = preset.particles;
  setEnv(shownEnv(), false);
  pipeline.build(preset, innerWidth, innerHeight);
  scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
  store.set('quality', name); sync();
}
// The landing page always uses the showroom; the simulator uses the chosen world.
const shownEnv = () => (where === 'landing' ? 'showroom' : envName);
function setEnv(name, remember = true) {
  const e = envs.set(name, preset); pipeline.setBloom(e.bloom); view.root.visible = e.world;
  P.gravity.v = e.gravity; world.gravity = { x: 0, y: -e.gravity, z: 0 }; // Mars: 3.71 m/s²
  fx.dusty = name === 'saltflat' || name === 'mars'; fx.setGround(name === 'mars' ? 0x9a5634 : 0xcdbb9e);
  if (remember) { envName = name; store.set('env', name); }
  sync();
}

// ================= overlays: contact shadow, forces, centre of mass =================
const blob = (() => {
  const t = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; scene.add(m); return m;
})();
const FORCE_COLORS = { gravity: 0xc6cbd1, suspension: 0x44d39a, tyre: 0xf2b33d, drag: 0x7c8590, fan: 0x3fc6d6, thruster: 0xe31937 };
const arrows = Array.from({ length: 48 }, () => {
  const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, 0xffffff);
  a.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 10; });
  a.visible = false; scene.add(a); return a;
});
const noDepth = (m) => { m.material.depthTest = false; m.renderOrder = 11; return m; };
const comMark = noDepth(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xe31937 }))); scene.add(comMark);
const contactMarks = v.wheels.map(() => { const m = noDepth(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x44d39a }))); scene.add(m); return m; });
const ov = { forces: false, com: false, contacts: false };

// ================= state =================
let where = 'landing', config = 'rocket', spawnKey = 'pad', paused = false, activeScene = null, sceneKey = null, sceneT = 0;
let camMode = 'chase', units = store.get('units', 'kmh'), challenge = null, photo = false, tour = null, simClock = 0;
const keys = new Set(), latched = new Array(THRUSTERS.length).fill(false);
const buf = []; const BUF_MAX = 600;
let recording = null; const runs = []; let stepCount = 0;

function resetAll(key = spawnKey) {
  spawnKey = key;
  const sp = SPAWNS[key];
  v.setConfig(config); v.reset(sp.pos, sp.yaw);
  Object.assign(v.input, { throttle: 0, brake: 0, steer: 0, pitchCmd: 0, yawCmd: 0 });
  latched.fill(false); v.manual.fill(0); v.override = null; v.wing.auto = true;
  buf.length = 0; fx.clear(); car.setDoors(false); sync();
}
function startScene(k) {
  const sc = SCENES[k];
  endChallenge(); if (activeScene) stopScene('');
  config = sc.config; resetAll(sc.spawn);
  for (let i = 0; i < 90; i++) { v.step(DT); world.step(); }
  activeScene = sc; sceneKey = k; sceneT = 0; sc.start(v);
  closeDrawer();
  camMode = { ramp: 'stuntRamp', kickflip: 'stuntKick', hover: 'chase', launch: 'chase' }[k]; sync();
  banner(`<b>Autopilot · ${sc.title}</b><small>${sc.desc} Any drive key takes over.</small>`);
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
  endChallenge(); if (activeScene) stopScene('');
  config = 'rocket'; resetAll('pad'); v.autoRescue = true;
  v.reset([0, d.h, 20], 0, { rot: d.rot, spin: d.spin });
  camMode = 'side'; closeDrawer(); sync();
  banner(`<b>Auto-rescue · ${d.title}</b><small>Nobody is steering. The controller turns the car upright with the lift jets, then brakes the fall.</small>`, 6000);
}
function stopScene(msg) {
  if (!activeScene) return;
  activeScene = null; v.override = null;
  Object.assign(v.input, { throttle: 0, brake: 0, steer: 0 }); v.manual.fill(0);
  if (camMode.startsWith('stunt')) camMode = 'chase';
  banner(msg, 4500); if (recording) stopRecording(); sync();
}

// ================= challenges =================
const ringMat = (lit) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: lit ? 0xe31937 : 0x3a3f46, emissiveIntensity: lit ? 2.5 : 0.6 });
let chalObjs = [];
function startChallenge(c) {
  if (activeScene) stopScene(''); endChallenge();
  config = c.config; v.setConfig(config); v.unlimited = false; v.autoRescue = true;
  const ctx = {
    addRing: (p, lit) => { const m = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.09, 12, 48), ringMat(lit)); m.position.set(...p); m.rotation.y = Math.PI / 2 * (p[0] > 10 && p[0] < 20 ? 1 : 0); scene.add(m); chalObjs.push(m); return m; },
    lightRing: (i, lit) => { if (ctx.rings?.[i]) ctx.rings[i].material = ringMat(lit); },
  };
  resetAll('pad'); c.setup(v, ctx);
  challenge = { c, t: 0, ctx };
  closeDrawer(); camMode = 'chase'; $('result').style.display = 'none';
  $('chal').style.display = 'block'; $('chal-t').textContent = c.title; $('chal-s').textContent = c.goal;
  replay.clear(); sync();
}
function endChallenge() {
  if (!challenge) return;
  chalObjs.forEach((o) => scene.remove(o)); chalObjs = [];
  challenge = null; v.unlimited = false; v.autoRescue = true; $('chal').style.display = 'none';
}
function finishChallenge(res) {
  const c = challenge.c;
  endChallenge();
  const box = $('result'); box.style.display = 'block';
  if (res.fail) { $('res-m').textContent = 'NOT COMPLETED'; $('res-t').textContent = c.title; $('res-s').textContent = '–'; $('res-d').textContent = res.fail; }
  else {
    const m = medal(c, res.score), b = saveBest(c.id, res.score, c.low);
    $('res-m').textContent = m ? `${m.toUpperCase()} MEDAL` : 'COMPLETED';
    $('res-t').textContent = c.title;
    $('res-s').innerHTML = `${res.score.toFixed(2)}<small style="font:13px var(--mono);color:var(--faint);margin-left:8px">${c.unit}</small>`;
    $('res-d').textContent = `${res.text}. ${b.better ? 'New personal best.' : `Best: ${b.best.toFixed(2)} ${c.unit}.`} Medals at ${c.medals.join(' / ')} ${c.unit}.`;
  }
  $('res-again').onclick = () => { $('result').style.display = 'none'; startChallenge(c); };
  buildChallengeList();
}
function buildChallengeList() {
  $('chal-list').innerHTML = '';
  for (const c of CHALLENGES) {
    const b = bestOf(c.id), d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<b>${c.title}</b><p>${c.goal}</p><span class="best">${b != null ? `Best ${b.toFixed(2)} ${c.unit}${medal(c, b) ? ' · ' + medal(c, b) : ''}` : 'Not tried yet'} · ${TRIMS[c.config].name}</span><button class="go">Start</button>`;
    d.querySelector('button').onclick = () => startChallenge(c);
    $('chal-list').appendChild(d);
  }
}

// ================= input =================
const TAKEOVER = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyH', 'KeyG', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);
const need = (what) => {
  if (what === 'lift' ? v.hasLift : v.hasThrusters) return true;
  toast(what === 'lift' ? 'Hover needs the lift jets: switch to the Rocket trim (top bar).' : 'No thrusters on the Performance trim: switch to Thrust or Rocket.'); return false;
};
function toggleHover() { if (!need('lift')) return; if (v.mode === 'HOVER') v.mode = 'MANUAL'; else { v.mode = 'HOVER'; v.altTarget = Math.max(2.5, v.height + 1); } sync(); }
function toggleLevel() { if (!need('lift')) return; v.mode = v.mode === 'STABILIZE' ? 'MANUAL' : 'STABILIZE'; sync(); }
function toggleFans() { v.fansOn = !v.fansOn; sync(); }
function toggleDoors() { if (v.speed > 1) return toast('Doors open only when stopped.'); car.setDoors(!car.doorsOpen); audio.servo(car.doorsOpen); }
addEventListener('keydown', (e) => {
  audio.start();
  if (where !== 'sim' || ['INPUT', 'SELECT'].includes(e.target.tagName)) return;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
  if (tour && !e.repeat) { stopTour(); return; }
  if (e.code === 'Tab' && !e.repeat) setLive(!liveOpen);
  keys.add(e.code);
  if (e.repeat) return;
  if (replay.playing) { if (e.code === 'KeyV' || e.code === 'Escape') exitReplay(); return; }
  if (photo) { if (e.code === 'KeyK' || e.code === 'Escape') exitPhoto(); return; }
  if (activeScene && TAKEOVER.has(e.code)) stopScene('<b>You have control.</b><small>Autopilot off. R resets.</small>');
  switch (e.code) {
    case 'KeyR': stopScene(''); if (challenge) startChallenge(challenge.c); else { resetAll(); toast('Reset: car, gas, battery, fans and modes'); } break;
    case 'KeyH': toggleHover(); break;
    case 'KeyG': toggleLevel(); break;
    case 'KeyF': toggleFans(); break;
    case 'KeyO': toggleDoors(); break;
    case 'KeyC': { const o = ['chase', 'cockpit', 'side', 'orbit', 'top']; setCam(o[(o.indexOf(camMode) + 1) % o.length]); toast('Camera: ' + camMode); break; }
    case 'KeyP': paused = !paused; toast(paused ? 'Paused (P)' : 'Running'); break;
    case 'KeyV': startReplay(); break;
    case 'KeyK': enterPhoto(); break;
    case 'KeyT': startTour(); break;
    case 'KeyM': toast(audio.toggleMute() ? 'Sound off (M)' : 'Sound on'); break;
    case 'Escape': $('help').style.display = 'none'; if (challenge) { endChallenge(); toast('Challenge stopped'); } closeDrawer(); break;
  }
  if (e.code.startsWith('Digit') || e.code.startsWith('Shift')) need('any');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('pointerdown', () => audio.start());
document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });

// gamepad: left stick steers, right trigger accelerates, left trigger brakes; A hover, B fans, RB boost, Y camera
const padPrev = [];
function gamepad() {
  const gp = navigator.getGamepads?.()[0]; if (!gp) return null;
  const pressed = (i) => gp.buttons[i]?.pressed, edge = (i) => { const p = pressed(i), was = padPrev[i]; padPrev[i] = p; return p && !was; };
  if (edge(0)) toggleHover(); if (edge(1)) toggleFans(); if (edge(3)) { const o = ['chase', 'cockpit', 'side', 'orbit', 'top']; setCam(o[(o.indexOf(camMode) + 1) % o.length]); }
  const dz = (x) => (Math.abs(x) < 0.12 ? 0 : x);
  return { steer: -dz(gp.axes[0]), thr: gp.buttons[7]?.value || 0, brk: gp.buttons[6]?.value || 0, boost: pressed(5), up: -dz(gp.axes[3] || 0) };
}
function applyInputs() {
  const k = (c) => keys.has(c), i = v.input, gp = gamepad();
  const fwd = k('KeyW') || k('ArrowUp'), back = k('KeyS') || k('ArrowDown'), left = k('KeyA') || k('ArrowLeft'), right = k('KeyD') || k('ArrowRight');
  const steer = (left ? 1 : 0) - (right ? 1 : 0) + (gp?.steer || 0);
  if (v.mode === 'HOVER') {
    i.pitchCmd = (fwd ? 1 : 0) - (back ? 1 : 0) + (gp?.thr || 0) - (gp?.brk || 0); i.yawCmd = steer;
    i.throttle = 0; i.steer = 0; i.brake = k('Space') ? 1 : 0;
    if (k('KeyE') || (gp?.up || 0) > 0.3) v.altTarget = Math.min(30, v.altTarget + 2 * DT);
    if (k('KeyQ') || (gp?.up || 0) < -0.3) v.altTarget = Math.max(-0.5, v.altTarget - 2 * DT);
  } else {
    i.pitchCmd = 0; i.yawCmd = 0; i.steer = Math.max(-1, Math.min(1, steer));
    i.throttle = Math.max(fwd ? 1 : 0, gp?.thr || 0); i.brake = Math.max(k('Space') ? 1 : 0, gp?.brk || 0);
    if (back) { if (v.vLong > 1) i.brake = 1; else i.throttle = -1; }
  }
  if (v.hasThrusters) { const boost = k('ShiftLeft') || k('ShiftRight') || gp?.boost; THRUSTERS.forEach((t, n) => { v.manual[n] = k('Digit' + t.key) || latched[n] || (boost && n < 2) ? 1 : 0; }); }
  else v.manual.fill(0);
}
let lastContacts = 4, lastVy = 0;
function simStep() {
  if (activeScene) {
    const done = activeScene.update(v, sceneT, DT); sceneT += DT;
    if (done) { const t = activeScene.title; stopScene(`<b>${t} complete</b><small>You have control. V replays it, R resets.</small>`); }
  } else if (!tour?.auto) applyInputs();
  v.step(DT); world.step(); stepCount++; simClock += DT;
  if (lastContacts === 0 && v.contacts > 0) audio.thump(Math.min(1, -lastVy / 8));
  lastContacts = v.contacts; lastVy = v.body.linvel().y;
  if (challenge) {
    challenge.t += DT;
    const r = challenge.c.update(v, challenge.t, challenge.ctx, DT);
    if (stepCount % 12 === 0) $('chal-s').textContent = r.text || '';
    if (r.done) finishChallenge(r);
  }
  if (stepCount % 2 === 0) replay.record(v, simClock);
  if (stepCount % 6 === 0) {
    const t = v.telemetry(); buf.push(t); if (buf.length > BUF_MAX) buf.shift();
    if (recording && recording.samples.length < 12000) recording.samples.push(t);
  }
}

// ================= cameras =================
const camPos = new THREE.Vector3(6, 3, 28), look = new THREE.Vector3(0, 0.6, 20);
let flat = new THREE.Vector3(0, 0, -1), landingA = 0.6, shake = 0;
function setCam(m) { camMode = m; controls.enabled = m === 'orbit'; if (m === 'orbit') controls.target.copy(car.group.position); camera.fov = m === 'cockpit' ? 68 : 50; camera.updateProjectionMatrix(); sync(); }
function updateCamera(dt, src) {
  const p = car.group.position, f = new THREE.Vector3(src.fwd?.[0] ?? 0, 0, src.fwd?.[2] ?? -1);
  if (f.length() > 0.3) flat.lerp(f.normalize(), 1 - Math.exp(-dt * 3)).normalize();
  const right = new THREE.Vector3(-flat.z, 0, flat.x);
  if (camMode === 'orbit') { controls.target.lerp(p, 0.15); controls.update(); return; }
  if (camMode === 'fixed2') return;
  if (camMode === 'landing') { // slow turntable orbit, car composed on the right third
    landingA += dt * 0.08;
    camera.position.set(p.x + Math.cos(landingA) * 7.2, 1.25 + Math.sin(landingA * 0.7) * 0.25, p.z + Math.sin(landingA) * 7.2);
    const toCar = new THREE.Vector3().subVectors(p, camera.position).setY(0).normalize(), side = new THREE.Vector3(-toCar.z, 0, toCar.x);
    camera.lookAt(p.x - side.x * 1.6, 0.55, p.z - side.z * 1.6); return;
  }
  if (camMode === 'cockpit') {
    const q = car.group.quaternion, head = new THREE.Vector3(-0.38, 0.56, -0.2).applyQuaternion(q).add(p);
    camera.position.copy(head); camera.lookAt(new THREE.Vector3(-0.38, 0.4, -8).applyQuaternion(q).add(p)); return;
  }
  let target;
  const spd = src.speed || 0;
  if (camMode === 'chase') target = p.clone().addScaledVector(flat, -6.8 - spd * 0.025).add(new THREE.Vector3(0, 1.9, 0));
  else if (camMode === 'side') target = p.clone().addScaledVector(right, 7.5).addScaledVector(flat, 1.5).add(new THREE.Vector3(0, 1.3, 0));
  else if (camMode === 'top') target = p.clone().add(new THREE.Vector3(0.01, 22, 0));
  else if (camMode === 'stuntRamp') target = new THREE.Vector3(LOOP.x + 22, 7, LOOP.z0 + 6);
  else target = new THREE.Vector3(KICK.x + 19, 5, KICK.rowEnd + 9);
  camPos.lerp(target, 1 - Math.exp(-dt * (camMode.startsWith('stunt') ? 2 : 6)));
  if (camPos.y < 0.5) camPos.y = 0.5;
  camera.position.copy(camPos);
  shake = Math.max(shake * Math.exp(-dt * 6), Math.min(0.06, Math.abs(src.accel ? src.accel.reduce((s, x) => s + x * x, 0) ** 0.5 / 9.81 - 1 : 0) * 0.012));
  if (camMode === 'chase') camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
  look.lerp(p.clone().addScaledVector(flat, camMode === 'chase' ? 2 : 0).add(new THREE.Vector3(0, 0.6, 0)), 1 - Math.exp(-dt * 10));
  camera.lookAt(look);
  const fov = camMode === 'chase' ? 50 + Math.min(14, spd * 0.12) : 50; // a touch of speed in the field of view
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
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
    m.material.color.setHex(w.slip > 1.05 ? 0xe31937 : w.slip > 0.7 ? 0xf2b33d : 0x44d39a);
  });
}
const labelEls = car.labels.map((l) => { const el = document.createElement('div'); el.className = 'plabel'; el.textContent = l.name; $('labels').appendChild(el); return { ...l, el }; });
function updateLabels() {
  for (const l of labelEls) {
    const show = where === 'sim' && l.views.includes(car.view);
    if (!show) { l.el.style.display = 'none'; continue; }
    l.obj.getWorldPosition(tmp); tmp.project(camera);
    if (tmp.z > 1) { l.el.style.display = 'none'; continue; }
    l.el.style.display = 'block'; l.el.style.left = ((tmp.x + 1) / 2) * innerWidth + 'px'; l.el.style.top = ((1 - tmp.y) / 2) * innerHeight + 'px';
  }
}

// ================= screens =================
function go(to) {
  const from = where; where = to;
  $('landing').classList.toggle('hidden', to !== 'landing');
  $('hud').style.display = to === 'sim' ? 'block' : 'none';
  if (to === 'landing') { stopTour(); exitReplay(); exitPhoto(); endChallenge(); if (activeScene) stopScene(''); config = 'rocket'; resetAll('pad'); camMode = 'landing'; reveal.t = 0; setEnv('showroom', false); }
  else {
    setEnv(envName, false); v.wing.auto = true; car.setDoors(false);
    if (from === 'landing') { camMode = 'chase'; camPos.set(car.group.position.x + 2, 2.5, car.group.position.z + 9); }
    if (!go.seen) { go.seen = true; $('help').style.display = 'flex'; }
  }
  keys.clear(); sync();
}
$$('[data-go]').forEach((b) => (b.onclick = () => { audio.start(); go(b.dataset.go); }));
$$('[data-scroll]').forEach((b) => (b.onclick = () => $(b.dataset.scroll).scrollIntoView({ behavior: 'smooth' })));
$('btn-help').onclick = () => ($('help').style.display = 'flex');
$('help-close').onclick = () => ($('help').style.display = 'none');
let tab = null;
function openTab(t) {
  tab = tab === t ? null : t;
  $('drawer').classList.toggle('open', !!tab);
  $$('#drawer [data-pane]').forEach((p) => (p.style.display = p.dataset.pane === tab ? 'block' : 'none'));
  $$('#rail [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'systems' && car.view === 'exterior') setView('all');
  if (tab === 'chal') buildChallengeList();
}
const closeDrawer = () => { if (tab) openTab(tab); };
$$('#rail [data-tab]').forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
$$('[data-cfg]').forEach((b) => (b.onclick = () => { stopScene(''); endChallenge(); config = b.dataset.cfg; resetAll(); toast({ performance: 'Performance: 2 seats, suction fans, no thrusters', thrust: 'Thrust: rear cold-gas boost, 300 L tank, 2 seats', rocket: 'Rocket: all ten thrusters, 600 L tank, 1 seat' }[config]); }));
$$('[data-scene]').forEach((b) => (b.onclick = () => startScene(b.dataset.scene)));
$$('[data-drop]').forEach((b) => (b.onclick = () => startDrop(b.dataset.drop)));
$$('[data-cam]').forEach((b) => (b.onclick = () => setCam(b.dataset.cam)));
$$('[data-spawn]').forEach((b) => (b.onclick = () => { stopScene(''); endChallenge(); resetAll(b.dataset.spawn); }));
$$('[data-view]').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$$('[data-ov]').forEach((b) => (b.onclick = () => { ov[b.dataset.ov] = !ov[b.dataset.ov]; sync(); }));
$$('[data-q]').forEach((b) => (b.onclick = () => applyQuality(b.dataset.q)));
$$('[data-env]').forEach((b) => (b.onclick = () => setEnv(b.dataset.env)));
$('btn-exitview').onclick = () => setView('exterior');
$('t-fans').onclick = toggleFans; $('t-hover').onclick = toggleHover; $('t-level').onclick = toggleLevel;
$('t-unl').onclick = () => { v.unlimited = !v.unlimited; sync(); };
$('t-rescue').onclick = () => { v.autoRescue = !v.autoRescue; sync(); toast(v.autoRescue ? 'Auto-rescue on: falls are caught' : 'Auto-rescue off: you are on your own'); };
for (const [id, k, label] of [['t-tc', 'tc', 'Traction control'], ['t-abs', 'abs', 'ABS'], ['t-esc', 'esc', 'Stability control'], ['t-regen', 'regen', 'Regen braking']])
  $(id).onclick = () => { v[k] = !v[k]; sync(); toast(`${label} ${v[k] ? 'on' : 'off'}${!v[k] && k !== 'regen' ? ': the car will slide when you push it' : ''}`); };
$('t-covers').onclick = () => { car.covers = !car.covers; car.setCovers(car.covers); sync(); };
$('t-units').onclick = () => { units = units === 'kmh' ? 'mph' : 'kmh'; store.set('units', units); sync(); };
$('tod').oninput = (e) => { envs.setTime(+e.target.value); sync(); };
$('vol').value = audio.volume; $('vol').oninput = (e) => { audio.setVolume(+e.target.value); store.set('volume', e.target.value); sync(); };
function setView(view) { car.setView(view); sync(); }
function sync() {
  $$('[data-cfg]').forEach((b) => b.classList.toggle('on', b.dataset.cfg === config));
  $$('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === camMode));
  $$('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === car.view));
  $$('[data-ov]').forEach((b) => b.classList.toggle('on', ov[b.dataset.ov]));
  $$('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === qName));
  $$('[data-env]').forEach((b) => b.classList.toggle('on', b.dataset.env === envName));
  $('t-fans').classList.toggle('on', v.fansOn); $('t-hover').classList.toggle('on', v.mode === 'HOVER');
  $('t-level').classList.toggle('on', v.mode === 'STABILIZE'); $('t-unl').classList.toggle('on', !!v.unlimited); $('t-rescue').classList.toggle('on', !!v.autoRescue);
  ['t-hover', 't-level', 't-rescue'].forEach((id) => ($(id).disabled = !v.hasLift)); $('t-unl').disabled = !v.hasThrusters;
  for (const [id, k] of [['t-tc', 'tc'], ['t-abs', 'abs'], ['t-esc', 'esc'], ['t-regen', 'regen']]) $(id).classList.toggle('on', !!v[k]);
  $('t-covers').classList.toggle('on', !!car.covers); $('t-units').textContent = `Units: ${units === 'kmh' ? 'km/h' : 'mph'}`;
  $('q-note').textContent = `${qName === 'auto' ? `Auto picked ${PRESETS[gpu.tier].label}` : PRESETS[qName].label} · GPU: ${gpu.name.replace(/ANGLE \(|\)|Direct3D.*$/g, '').slice(0, 60) || 'unknown'}`;
  $('tod-row').style.display = envName === 'saltflat' ? 'block' : 'none'; $('tod').value = envs.time;
  const h = 6 + envs.time * 12; $('tod-v').textContent = `${Math.floor(h)}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  $('vol-v').textContent = `${Math.round(audio.volume * 100)} %`;
}
let toastT, bannerT;
function toast(m) { const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (t.style.opacity = 0), 2600); }
function banner(html, ms) {
  const b = $('banner'); clearTimeout(bannerT);
  if (!html) { b.style.display = 'none'; return; }
  b.innerHTML = html; b.style.display = 'block'; if (ms) bannerT = setTimeout(() => (b.style.display = 'none'), ms);
}
let liveOpen = store.get('live', 'open') !== 'closed';
function setLive(open) { liveOpen = open; $('live').classList.toggle('collapsed', !open); $('live-tab').style.display = open ? 'none' : 'block'; store.set('live', open ? 'open' : 'closed'); }
$('live-close').onclick = () => setLive(false); $('live-tab').onclick = () => setLive(true); setLive(liveOpen);
$('chal-quit').onclick = () => { endChallenge(); toast('Challenge stopped'); };
$('res-close').onclick = () => ($('result').style.display = 'none');
$('res-replay').onclick = () => { $('result').style.display = 'none'; startReplay(20); };
$('nozz').innerHTML = THRUSTERS.map((t) => `<i title="${t.id} ${t.name}"><b></b></i>`).join('');
const nozzEls = [...$('nozz').querySelectorAll('b')];

// ================= Lab: recording, parameters, controller, explorer, wind =================
function startRecording(name = 'Manual run') {
  recording = { name, started: new Date().toISOString(), config, scene: sceneKey, world: envName, unlimitedGas: v.unlimited, samples: [],
    params: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, { value: p.v, unit: p.unit, tag: p.tag, source: p.src }])) };
  $('btn-rec').textContent = '■ Stop'; $('btn-rec').classList.add('on');
}
function stopRecording() {
  if (!recording) return; recording.events = v.events.slice(); runs.push(recording); if (runs.length > 5) runs.shift();
  recording = null; $('btn-rec').textContent = '● Record'; $('btn-rec').classList.remove('on');
}
$('btn-rec').onclick = () => (recording ? stopRecording() : startRecording());
const dl = (name, data, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const lastRun = () => recording || runs[runs.length - 1];
$('btn-csv').onclick = () => {
  const r = lastRun(); if (!r || !r.samples.length) return toast('Record a run first, or play a stunt.');
  const cols = ['t', 'kmh', 'accel', 'latG', 'height', 'x', 'y', 'z', 'pitch', 'roll', 'yawRate', 'mass', 'gasKg', 'pressureBar', 'tankK', 'thrustkN', 'massFlow', 'fankN', 'fanKW', 'seal', 'downforcekN', 'soc', 'packV', 'packKW', 'contacts', 'mode', 'wing'];
  const head = ['# Roadster Lab: SIMULATED DATA, not measured on a real car', `# run: ${r.name}; ${r.started}; trim ${r.config}; world ${r.world}; unlimited gas ${r.unlimitedGas}`,
    ...Object.entries(r.params).map(([k, p]) => `# ${k} = ${p.value} ${p.unit} [${p.tag}] ${p.source}`),
    '# units: t s, kmh km/h, accel/latG g, height/x/y/z m, pitch/roll deg, yawRate deg/s, mass/gasKg kg, pressureBar bar, tankK K, thrustkN/fankN/downforcekN kN, massFlow kg/s, fanKW/packKW kW, soc %, packV V'];
  dl(`roadster-${Date.now()}.csv`, [...head, cols.join(','), ...r.samples.map((s) => cols.map((c) => (typeof s[c] === 'number' ? +s[c].toFixed(4) : s[c])).join(','))].join('\n'), 'text/csv');
};
$('btn-json').onclick = () => { const r = lastRun(); if (!r) return toast('Record a run first.'); dl(`roadster-${Date.now()}.json`, JSON.stringify({ note: 'Simulated data, not real-world measurement', ...r }, null, 1), 'application/json'); };
const TAGNAME = { R: 'REPORTED', E: 'ESTIMATE', H: 'HYPOTHETICAL' };
function slider(host, k, onChange) {
  const p = P[k], d = document.createElement('div'); d.className = 'param';
  d.innerHTML = `<div class="top"><span>${k} <span class="tag ${p.tag}">${TAGNAME[p.tag]}</span></span><b class="mono pv"></b></div><input type="range" min="${p.edit[0]}" max="${p.edit[1]}" step="${(p.edit[1] - p.edit[0]) / 200}" value="${p.v}"><div class="src">${p.src}</div>`;
  const out = d.querySelector('.pv'), inp = d.querySelector('input');
  const show = () => { const mod = Math.abs(p.v - DEFAULTS[k]) > 1e-9; out.textContent = `${(+p.v).toFixed(p.v < 10 ? 2 : 0)} ${p.unit}${mod ? ' · changed' : ''}`; out.style.color = mod ? 'var(--warn)' : ''; };
  inp.oninput = () => { p.v = +inp.value; onChange && onChange(k); show(); refreshClaims(); };
  d.refresh = () => { inp.value = p.v; show(); };
  show(); host.appendChild(d); return d;
}
const sliders = [];
function applyParam(k) { if (k === 'gravity') world.gravity = { x: 0, y: -P.gravity.v, z: 0 }; if (k === 'massDry') v.updateMass(true); }
function buildParams() {
  $('params').innerHTML = ''; $('gains').innerHTML = ''; $('wind').innerHTML = ''; sliders.length = 0;
  for (const k of ['attKp', 'attKd', 'altKp', 'vzKp']) sliders.push(slider($('gains'), k));
  for (const k of ['windSpeed', 'windGust']) sliders.push(slider($('wind'), k));
  for (const [k, p] of Object.entries(P)) if (p.edit && !['attKp', 'attKd', 'altKp', 'vzKp', 'windSpeed', 'windGust'].includes(k)) sliders.push(slider($('params'), k, applyParam));
  const t = document.createElement('table'); t.className = 'tel';
  t.innerHTML = Object.entries(P).filter(([, p]) => !p.edit).map(([k, p]) => `<tr><td title="${p.src}">${k} <span class="tag ${p.tag}">${p.tag}</span></td><td>${p.v} ${p.unit}</td></tr>`).join('');
  $('params').appendChild(t);
}
$('btn-preset').onclick = () => { for (const k in DEFAULTS) P[k].v = DEFAULTS[k]; P.gravity.v = ENVS[envName].gravity; applyParam('gravity'); applyParam('massDry'); sliders.forEach((s) => s.refresh()); refreshClaims(); toast('All parameters restored'); };
buildParams();
$('btn-gust').onclick = () => {
  if (!v.hasLift) { config = 'rocket'; resetAll('pad'); }
  stopScene(''); endChallenge(); v.mode = 'HOVER'; v.altTarget = 4; v.unlimited = true;
  const old = P.windGust.v; P.windGust.v = 12; sync();
  banner('<b>Gust test</b><small>Hovering at 4 m while random 12 m/s gusts push the car. Watch the controller hold position and attitude.</small>', 9000);
  setTimeout(() => { P.windGust.v = old; v.unlimited = false; sliders.forEach((s) => s.refresh()); }, 10000);
};
function plot(cv, series, opts) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, padL = 52, padB = 30;
  g.clearRect(0, 0, W, H); g.font = '20px Consolas, monospace';
  const xs = series.flatMap((s) => s.pts.map((p) => p.x)), ys = series.flatMap((s) => s.pts.map((p) => p.y)).concat(opts.target != null ? [opts.target] : []);
  if (!xs.length) return;
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); if (y1 - y0 < 1e-6) { y1 += 1; y0 -= 1; } const yp = (y1 - y0) * 0.08; y0 -= yp; y1 += yp;
  const X = (x) => padL + ((x - x0) / (x1 - x0 || 1)) * (W - padL - 12), Y = (y) => 10 + ((y1 - y) / (y1 - y0)) * (H - padB - 10);
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.fillStyle = '#69707a';
  for (let i = 0; i <= 4; i++) { const yy = 10 + (i * (H - padB - 10)) / 4; g.beginPath(); g.moveTo(padL, yy); g.lineTo(W, yy); g.stroke(); g.fillText((y1 - (i * (y1 - y0)) / 4).toFixed(y1 - y0 < 10 ? 1 : 0), 4, yy + 6); }
  g.fillText(opts.xLabel || '', padL, H - 6);
  if (opts.target != null) { g.strokeStyle = 'rgba(242,179,61,.6)'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(padL, Y(opts.target)); g.lineTo(W, Y(opts.target)); g.stroke(); g.setLineDash([]); }
  if (opts.markX != null) { g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(X(opts.markX), 10); g.lineTo(X(opts.markX), H - padB); g.stroke(); }
  for (const s of series) { g.strokeStyle = s.color; g.lineWidth = 3; g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.stroke(); if (s.dots) { g.fillStyle = s.color; s.pts.forEach((p) => { g.beginPath(); g.arc(X(p.x), Y(p.y), 5, 0, 7); g.fill(); }); } }
}
$('btn-step').onclick = () => {
  const kind = $('step-kind').value, r = lab.stepResponse(RAPIER, kind), m = r.metrics, u = lab.STEPS[kind].unit;
  plot($('step-plot'), [{ pts: r.series.map((s) => ({ x: s.t, y: s.y })), color: '#e31937' }], { target: r.target, xLabel: 'time, s' });
  const vals = [`${m.rise.toFixed(2)} s`, `${m.overshoot.toFixed(1)} %`, `${m.settle.toFixed(2)} s`, `${m.error.toFixed(2)} ${u}`];
  $$('#step-metrics b').forEach((b, i) => (b.textContent = vals[i]));
};
$('ex-param').innerHTML = lab.PARAMS.map((k) => `<option value="${k}">${k} (${P[k].unit})</option>`).join('');
$('ex-metric').innerHTML = Object.entries(lab.METRICS).map(([k, m]) => `<option value="${k}">${m.label} (${m.unit})</option>`).join('');
$('btn-ex').onclick = async () => {
  const pk = $('ex-param').value, mk = $('ex-metric').value; $('btn-ex').disabled = true; $('btn-ex').textContent = 'Running…';
  const res = await lab.sweep(RAPIER, pk, mk, 7, (pts) => plot($('ex-plot'), [{ pts: pts.filter((p) => p.y != null), color: '#e31937', dots: true }], { xLabel: `${pk}, ${P[pk].unit} · ${lab.METRICS[mk].label}`, markX: P[pk].v }));
  plot($('ex-plot'), [{ pts: res.points.filter((p) => p.y != null), color: '#e31937', dots: true }], { xLabel: `${pk}, ${P[pk].unit} · ${lab.METRICS[mk].label}, ${lab.METRICS[mk].unit}`, markX: res.base });
  $('btn-ex').disabled = false; $('btn-ex').textContent = 'Sweep';
};

const TEL = [
  ['Speed', (t) => t.kmh.toFixed(1), 'km/h'], ['Acceleration', (t) => t.accel.toFixed(2), 'g'], ['Lateral', (t) => t.latG.toFixed(2), 'g'], ['Height', (t) => Math.max(0, t.height).toFixed(2), 'm'],
  ['Pitch / roll', (t) => `${t.pitch.toFixed(0)} / ${t.roll.toFixed(0)}`, '°'], ['Yaw rate', (t) => t.yawRate.toFixed(0), '°/s'],
  ['Mass', (t) => t.mass.toFixed(0), 'kg'], ['Gas', (t) => t.gasKg.toFixed(1), 'kg'], ['Tank', (t) => `${t.pressureBar.toFixed(0)} bar · ${t.tankK.toFixed(0)}`, 'K'],
  ['Thrust', (t) => t.thrustkN.toFixed(1), 'kN'], ['Gas flow', (t) => t.massFlow.toFixed(1), 'kg/s'], ['Suction', (t) => `${t.fankN.toFixed(1)} · ${t.fanKW.toFixed(0)} kW`, 'kN'],
  ['Skirt seal', (t) => (t.seal * 100).toFixed(0), '%'], ['Downforce', (t) => t.downforcekN.toFixed(2), 'kN'], ['Wing', (t) => `${t.wing} ${(t.wingDeploy * 100).toFixed(0)} %`, ''],
  ['Battery', (t) => `${t.soc.toFixed(1)} % · ${t.packV.toFixed(0)} V`, ''], ['Pack power', (t) => t.packKW.toFixed(0), 'kW'], ['Wheel loads', (t) => t.loads.map((x) => x.toFixed(1)).join(' '), 'kN'],
  ['Tyre use', (t) => t.slips.map((x) => x.toFixed(2)).join(' '), '× peak'], ['0–60 mph', (t) => (t.t60 ? t.t60.toFixed(2) : '–'), 's'],
  ['Controller', () => (v.ctrl?.active ? `${v.ctrl.attErrDeg.toFixed(0)}° off level${v.ctrl.saturated ? ', at limit' : ''}` : 'off'), ''],
];
$('tel').innerHTML = TEL.map(([k], i) => `<tr><td>${k}</td><td id="tv${i}"></td></tr>`).join('');
const GVARS = { kmh: 'Speed km/h', latG: 'Lateral g', height: 'Height m', thrustkN: 'Thrust kN', gasKg: 'Gas kg', pressureBar: 'Tank bar', tankK: 'Tank K', fankN: 'Suction kN', packKW: 'Pack kW', accel: 'Accel g', pitch: 'Pitch °', roll: 'Roll °' };
$('gvar').innerHTML = Object.entries(GVARS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
function drawGraph() {
  const k = $('gvar').value, s = [{ pts: buf.map((t) => ({ x: t.t, y: t[k] })), color: '#eceef0' }];
  if (runs.length) { const r = runs[runs.length - 1], t0 = r.samples[0]?.t || 0, now = buf.length ? buf[buf.length - 1].t : 0; s.push({ pts: r.samples.map((t) => ({ x: now - 30 + (t.t - t0), y: t[k] })), color: '#e31937' }); }
  plot($('graph'), s, { xLabel: runs.length ? 'white: live · red: ' + runs[runs.length - 1].name : 'live, last 60 s' });
}

// ================= replay + photo mode =================
function startReplay(sec = 12) {
  if (photo) exitPhoto();
  if (!replay.start(sec)) return toast('Nothing recorded yet: drive for a few seconds first.');
  paused = true; closeDrawer(); document.body.classList.add('cine'); $('replaybar').style.display = 'flex'; $('rp-play').textContent = 'Pause'; replay.speed = +$('rp-speed').value; fx.clear();
}
function exitReplay() {
  if (!replay.playing) return;
  replay.stop(); paused = false; document.body.classList.remove('cine'); $('replaybar').style.display = 'none'; fx.clear(); if (camMode === 'fixed2') camMode = 'chase';
}
let rpPaused = false;
$('btn-replay').onclick = () => startReplay(12);
$('rp-play').onclick = () => { rpPaused = !rpPaused; $('rp-play').textContent = rpPaused ? 'Play' : 'Pause'; };
$('rp-speed').onchange = (e) => (replay.speed = +e.target.value);
$('rp-slow').onclick = () => { replay.autoSlow = !replay.autoSlow; $('rp-slow').classList.toggle('on', replay.autoSlow); };
$('rp-pos').oninput = (e) => { replay.f = +e.target.value * (replay.n - 1); };
$('rp-exit').onclick = exitReplay;
let photoPrevCam = 'chase';
function enterPhoto() {
  if (replay.playing) exitReplay();
  photo = true; paused = true; photoPrevCam = camMode; setCam('orbit'); closeDrawer(); document.body.classList.add('photo'); $('photobar').style.display = 'flex';
  if (!pipeline.composer) toast('Depth of field needs Medium graphics or higher.');
}
function exitPhoto() {
  if (!photo) return;
  photo = false; paused = false; document.body.classList.remove('photo'); $('photobar').style.display = 'none';
  if (pipeline.dof) pipeline.dof.enabled = false; $('ph-dof').classList.remove('on'); setEnv(shownEnv(), false); setCam(photoPrevCam === 'orbit' ? 'chase' : photoPrevCam);
}
$('btn-photo').onclick = enterPhoto; $('ph-exit').onclick = exitPhoto;
$('ph-dof').onclick = () => { if (!pipeline.dof) return; pipeline.dof.enabled = !pipeline.dof.enabled; $('ph-dof').classList.toggle('on', pipeline.dof.enabled); };
$('ph-focus').oninput = (e) => { if (pipeline.dof) pipeline.dof.uniforms.focus.value = +e.target.value; };
$('ph-exp').oninput = (e) => (renderer.toneMappingExposure = +e.target.value);
$('ph-save').onclick = () => { pipeline.render(1 / 60); canvas.toBlob((b) => dl(`roadster-${Date.now()}.png`, b)); toast('Saved PNG'); };

// ================= presenter tour =================
const TOUR = [
  { k: '1 / 7 · The car', t: 'Rebuilt from the reveal photos', p: 'Measured from Tesla\'s side, top and rear images: 4.52 m long, 2.00 m wide, 1.19 m tall, 2.93 m wheelbase. Scissor doors, star wheels, a wing that hides in the deck.', dur: 9,
    run: () => { setEnv('showroom', false); config = 'rocket'; resetAll('pad'); camMode = 'landing'; car.setDoors(true); v.wing.auto = false; v.wing.mode = 'high'; } },
  { k: '2 / 7 · Reveal stunt', t: 'Up the wall on fan suction', p: 'The fans pull 36 kN through sealed skirts: 1.6 times the car\'s weight, so it can hang upside down. Then it lets go, flips with the lift jets and lands.', dur: 19,
    run: () => { setEnv('night', false); car.setDoors(false); startScene('ramp'); } },
  { k: '3 / 7 · Kickflip', t: 'A jump over five parked Teslas', p: 'Lift jets carry part of the weight while the side nozzles spin the car a full turn in the air. Auto-rescue levels it before touchdown.', dur: 11,
    run: () => { setEnv('saltflat', false); startScene('kickflip'); } },
  { k: '4 / 7 · Inside', t: 'Every flow follows the physics', p: 'Nitrogen leaves the COPV tanks at up to 690 bar. As the tank empties, it cools by over 100 kelvin and the nozzles lose pressure, so only about 60 % of the gas is usable for hovering.', dur: 11,
    run: () => { startScene('hover'); setView('air'); } },
  { k: '5 / 7 · Claims, tested', t: '0–60 mph in 0.81 s needs 3.4 g', p: 'Tyres alone give 1.2 g. Fans add grip, but the 10,000 N·m torque cap holds the wheels to 1.6 g. Only the rear thrusters close the gap: this model does it in 0.85 s.', dur: 9,
    run: () => { setView('exterior'); startScene('launch'); } },
  { k: '6 / 7 · Robotics', t: 'The same controller flies a drone', p: 'Attitude is a PD loop feeding a thrust mixer. The Lab runs step tests on it and measures rise time, overshoot and settling, exactly as you would tune a quadcopter.', dur: 8,
    run: () => { stopScene(''); openTab('lab'); $('btn-step').click(); } },
  { k: '7 / 7 · Mars', t: 'Same car, 38 % of the gravity', p: 'On Mars the lift jets need less than half the thrust to hover, so the same tank lasts far longer. Your turn: Challenges are on the left.', dur: 12,
    run: () => { closeDrawer(); setEnv('mars', false); startScene('hover'); } },
];
function startTour() {
  if (tour) return; exitReplay(); exitPhoto(); endChallenge();
  tour = { i: -1, t: 0, auto: false }; nextTourStep(); $('tourcap').style.display = 'block';
}
function nextTourStep() {
  tour.i++; tour.t = 0;
  if (tour.i >= TOUR.length) return stopTour(true);
  const s = TOUR[tour.i]; $('tour-k').textContent = `Presenter tour · ${s.k}`; $('tour-t').textContent = s.t; $('tour-p').textContent = s.p; s.run();
}
function stopTour(done) {
  if (!tour) return; tour = null; $('tourcap').style.display = 'none'; closeDrawer(); setView('exterior'); car.setDoors(false); v.wing.auto = true;
  if (activeScene) stopScene(''); setEnv(envName, false); camMode = 'chase';
  toast(done ? 'Tour finished: you have control' : 'Tour stopped');
}
$('btn-tour').onclick = startTour;

// ================= landing: showroom reveal + claims =================
const reveal = { t: 0 };
function landingUpdate(dt) {
  reveal.t += dt; const t = reveal.t % 22;
  envs.spot.intensity = envs.spotBase * Math.min(1, 0.1 + reveal.t / 3); // lights come up on load
  car.setDoors(t > 4 && t < 12); if (Math.abs(t - 4) < dt || Math.abs(t - 12) < dt) audio.servo(t < 8);
  v.wing.auto = false; v.wing.mode = t > 6 && t < 16 ? 'high' : 'road';
  if (Math.floor(reveal.t * 4) !== Math.floor((reveal.t - dt) * 4)) {
    const p = v.tank.p / 1e5, thr = THRUSTERS.reduce((s, x) => s + x.max, 0) * v.availNow * P.thrustScale.v / 1000;
    $('ro-tank').innerHTML = `${p.toFixed(0)}<small>bar</small>`; $('ro-gas').innerHTML = `${v.gas.toFixed(0)}<small>kg N₂</small>`;
    $('ro-thr').innerHTML = `${thr.toFixed(0)}<small>kN</small>`; $('ro-mass').innerHTML = `${Math.round(v.mass).toLocaleString('en')}<small>kg</small>`;
    $('ro-wing').textContent = v.wing.deploy > 0.95 ? 'Deployed' : v.wing.deploy > 0.02 ? 'Moving' : 'Stowed'; $('ro-doors').textContent = car.doorsOpen ? 'Open' : 'Closed';
  }
}
let model060 = null;
function refreshClaims() {
  const z = claims.zeroToSixty(), ts = claims.topSpeed(), rg = claims.range(), hv = claims.hover(), ce = claims.ceiling();
  const rows = [
    { c: '0–60 mph in 0.81 s', n: model060 ? `${model060.toFixed(2)}<small>s, Thrust trim</small>` : `${z.need.toFixed(2)}<small>g needed</small>`, d: z.verdict, run: () => { go('sim'); startScene('launch'); } },
    { c: 'Over 230 mph', n: `${ts.mph.toFixed(0)}<small>mph, power-limited</small>`, d: ts.verdict, run: () => { go('sim'); config = 'performance'; resetAll('drag'); banner('<b>Top speed run</b><small>Hold W on the drag strip. The wing goes flat (DRS) on the straight; the limiter stops at 250 mph.</small>', 7000); } },
    { c: '300 miles of range', n: `${rg.steadyMi.toFixed(0)}<small>mi at 65 mph</small>`, d: rg.verdict, run: null },
    { c: 'Short flights on cold gas', n: `${hv.seconds.toFixed(1)}<small>s of hover</small>`, d: hv.verdict, run: () => { go('sim'); startScene('hover'); } },
    { c: 'Hangs upside down', n: `${ce.margin.toFixed(2)}<small>× weight</small>`, d: ce.verdict, run: () => { go('sim'); startScene('ramp'); } },
  ];
  $('claimrows').innerHTML = '';
  for (const r of rows) {
    const d = document.createElement('div'); d.className = 'claim';
    d.innerHTML = `<div class="c">${r.c}</div><div class="n">${r.n}</div><div class="d">${r.d}</div><div class="r">${r.run ? '<button>Run it →</button>' : '<span class="k">Model only</span>'}</div>`;
    if (r.run) d.querySelector('button').onclick = r.run;
    $('claimrows').appendChild(d);
  }
}
refreshClaims();
setTimeout(() => { model060 = lab.METRICS.zero60.run(RAPIER); refreshClaims(); }, 1500);

// ================= HUD =================
const kb = (k) => `<kbd>${k}</kbd>`;
function hintText() {
  if (challenge) return `<b>${challenge.c.title}</b> ${kb('R')} restart · ${kb('Esc')} quit`;
  if (activeScene) return `<b>Autopilot</b> any drive key takes over · ${kb('V')} replay`;
  if (v.mode === 'HOVER') return `<b>Hovering</b> ${kb('W')}${kb('S')} tilt · ${kb('A')}${kb('D')} turn · ${kb('E')}${kb('Q')} height · ${kb('H')} land`;
  if (v.mode === 'STABILIZE') return `<b>Auto-level</b> keeps the car flat in the air · ${kb('G')} off`;
  const thr = v.hasLift ? ` · ${kb('Shift')} boost · ${kb('H')} hover` : v.hasThrusters ? ` · ${kb('Shift')} boost` : '';
  return `<b>Driving</b> ${kb('W')}${kb('S')} go/brake · ${kb('A')}${kb('D')} steer${thr} · ${kb('F')} fans · ${kb('V')} replay · ${kb('C')} camera`;
}
function caption(t) {
  const pw = Math.max(0, t.packKW);
  return {
    power: `<b>Battery → 3 motors → wheels.</b> One motor drives the front axle, one drives each rear wheel. Wheel torque is capped at 10,000 N·m <span class="tag R">R</span>, power at ~1,040 kW <span class="tag E">E</span>. Traction control holds each tyre at its grip peak, about 10 % slip.<div class="live">${pw.toFixed(0)} kW from the pack at ${t.packV.toFixed(0)} V · ${t.soc.toFixed(1)} % left</div>`,
    air: `<b>COPV tanks → regulator → nozzles.</b> 600 L of nitrogen <span class="tag R">R</span> at 690 bar <span class="tag E">E</span>. Thrust = C<sub>f</sub> × chamber pressure × throat area. As gas leaves, the tank cools and loses pressure; below the regulator setting the nozzles weaken.<div class="live">${t.massFlow.toFixed(1)} kg/s → ${t.thrustkN.toFixed(1)} kN · tank ${t.pressureBar.toFixed(0)} bar, ${t.tankK.toFixed(0)} K · ${t.gasKg.toFixed(0)} kg left</div>`,
    fans: `<b>Fans pull air out from under the car.</b> Force = pressure drop × sealed skirt area, balanced against air leaking in under the skirts. Up to 2 g <span class="tag R">R</span>, but lift the floor 10 cm and the seal breaks.<div class="live">${t.fankN.toFixed(1)} kN = ${(t.fankN * 1000 / (t.mass * 9.81)).toFixed(2)} g · seal ${(t.seal * 100).toFixed(0)} % · ${t.fanKW.toFixed(0)} kW</div>`,
    all: `<b>Three systems, one battery.</b> Amber: electric power to the motors. Blue: nitrogen to the ten thrusters. Teal: fan suction. Each flow moves only while its system is working.<div class="live">${t.kmh.toFixed(0)} km/h · thrust ${t.thrustkN.toFixed(1)} kN · suction ${t.fankN.toFixed(1)} kN</div>`,
  }[car.view] || 'Pick a system above.';
}
let uiT = 0, fps = 60, fA = 0, fN = 0;
const lit = (id, cls) => { const e = $(id); e.className = cls || ''; };
function updateHUD(dt) {
  fA += dt; fN++; if (fA > 0.5) { fps = fN / fA; fA = fN = 0; }
  if (qName === 'auto' && where === 'sim') { const r = scaler.sample(dt, preset.pr); if (r && Math.abs(r.pr - renderer.getPixelRatio()) > 0.02) { renderer.setPixelRatio(r.pr); resize(); } }
  uiT += dt; if (uiT < 0.1) return; uiT = 0;
  const t = v.telemetry(), sp = units === 'kmh' ? t.kmh : t.kmh / 1.609;
  $('g-speed').textContent = sp.toFixed(0); $('g-unit').textContent = units === 'kmh' ? 'KM/H' : 'MPH';
  $('g-mode').textContent = activeScene ? 'AUTOPILOT' : challenge ? 'CHALLENGE' : v.rescuing ? 'AUTO-RESCUE' : { MANUAL: v.holding ? 'HOLD' : 'DRIVE', STABILIZE: 'AUTO-LEVEL', HOVER: `HOVER ${v.altTarget.toFixed(1)} M` }[v.mode];
  if (v.hasThrusters) {
    $('g-gas').textContent = v.unlimited ? '∞' : t.gasPct.toFixed(0) + ' %'; $('g-gas-bar').style.width = (v.unlimited ? 100 : t.gasPct) + '%';
    $('g-gas-bar').style.background = t.gasPct < 25 && !v.unlimited ? 'var(--accent)' : 'var(--text)';
    $('g-gas-u').textContent = t.massFlow > 0.5 && !v.unlimited ? `${t.massFlow.toFixed(0)} kg/s · empty in ${(t.gasKg / t.massFlow).toFixed(1)} s` : `${t.pressureBar.toFixed(0)} bar · ${t.tankK.toFixed(0)} K`;
  } else { $('g-gas').textContent = '–'; $('g-gas-bar').style.width = 0; $('g-gas-u').textContent = 'no thrusters on this trim'; }
  $('g-bat').textContent = t.soc.toFixed(1) + ' %'; $('g-bat-bar').style.width = t.soc + '%'; $('g-bat-u').textContent = `${t.packKW.toFixed(0)} kW · ${t.packV.toFixed(0)} V`;
  nozzEls.forEach((b, i) => (b.style.opacity = Math.min(1, v.thrust[i] / THRUSTERS[i].max)));
  lit('l-tc', !v.tc ? 'bad' : t.tcOn ? 'on' : 'ok'); lit('l-abs', !v.abs ? 'bad' : t.absOn ? 'on' : 'ok'); lit('l-esc', !v.esc ? 'bad' : t.esc ? 'on' : 'ok');
  lit('l-hold', v.holding ? 'ok' : ''); lit('l-fans', v.fansOn ? 'on' : ''); lit('l-wing', t.wingDeploy > 0.5 ? 'ok' : ''); $('l-wing').textContent = t.wingDeploy > 0.5 ? `WING ${t.wing.toUpperCase()}` : 'WING';
  lit('l-air', t.contacts === 0 && t.height > 0.3 ? 'on' : '');
  $('stat').textContent = `${ENVS[envName].label} · ${PRESETS[qName === 'auto' ? gpu.tier : qName].label}${qName === 'auto' ? ' (auto)' : ''} · ${fps.toFixed(0)} fps${paused ? ' · PAUSED' : ''}`;
  const alerts = [];
  if (v.ctrl?.saturated) alerts.push('Thrust limit: the controller wants more push than the nozzles can give.');
  if (v.hasThrusters && !v.unlimited && t.gasPct < 25) alerts.push(t.gasPct <= 0.1 ? 'Gas tank empty: thrusters are dead. R refills.' : 'Gas low: the tank pressure is dropping below what the nozzles need.');
  if (v.upY < -0.5 && t.contacts > 0 && t.fankN < 5) alerts.push('Upside down without suction: it will fall.');
  if (!v.tc || !v.esc) alerts.push(`${!v.esc ? 'Stability control' : 'Traction control'} is off: expect slides.`);
  $('alert').style.display = alerts.length ? 'block' : 'none'; $('alert').textContent = alerts.join(' ');
  $('hint').innerHTML = hintText();
  if (liveOpen) {
    $('t-height').textContent = t.height > 150 ? '–' : Math.max(0, t.height).toFixed(1); $('t-accel').textContent = t.accel.toFixed(2);
    $('t-thrust').textContent = t.thrustkN.toFixed(1); $('t-suction').textContent = t.fankN.toFixed(1); $('t-down').textContent = t.downforcekN.toFixed(1);
    $('t-tank').textContent = v.hasThrusters ? t.pressureBar.toFixed(0) : '–'; $('t-tank-u').textContent = v.hasThrusters ? `bar · ${t.tankK.toFixed(0)} K` : 'no tank';
    drawGraph();
    if ($('tel').closest('details').open) TEL.forEach(([, f, u], i) => ($('tv' + i).textContent = `${f(t)} ${u}`));
    $('events').innerHTML = v.events.slice(-5).reverse().map((e) => `${e.t.toFixed(1)} s · ${e.text}`).join('<br>') || 'Nothing yet';
  }
  if (tab === 'systems') $('caption').innerHTML = caption(t);
}

// ================= loop =================
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); pipeline.setSize(innerWidth, innerHeight); fx.resize(innerHeight * renderer.getPixelRatio()); }
addEventListener('resize', resize);
let acc = 0, last = performance.now(), heightAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (tour) { tour.t += dt; const s = TOUR[tour.i]; if (tour.t > s.dur && (!activeScene || tour.t > s.dur + 8)) nextTourStep(); }
  if (replay.playing) {
    const { fr, rate, ended } = replay.advance(rpPaused ? 0 : dt);
    const p = fr.body.translation(), q = fr.body.rotation();
    car.group.position.set(p.x, p.y, p.z); car.group.quaternion.set(q.x, q.y, q.z, q.w);
    car.update(fr, dt * rate); fx.update(dt * rate, fr, car, heightAt); audio.update(fr, rate);
    replay.camera(camera, fr, dt); $('rp-pos').value = replay.f / Math.max(1, replay.n - 1);
    if (ended && !rpPaused) { rpPaused = true; $('rp-play').textContent = 'Play'; }
    envs.update(car.group.position, camera); pipeline.render(dt); return;
  }
  if (!paused) { acc += dt; let n = 0; while (acc >= DT && n < 12) { simStep(); acc -= DT; n++; } if (n === 12) acc = 0; }
  if (where === 'landing') landingUpdate(dt);
  const tr = v.body.translation(), q = v.body.rotation();
  car.group.position.set(tr.x, tr.y, tr.z); car.group.quaternion.set(q.x, q.y, q.z, q.w);
  car.update(v, dt);
  heightAt = tr.y - (v.height ?? 0) - CG.height;
  blob.position.set(tr.x, heightAt + 0.02, tr.z); blob.rotation.z = Math.atan2(v.fwd[0], v.fwd[2]);
  blob.visible = v.height < 25; blob.material.opacity = Math.max(0, 1 - v.height / 8) * (preset.shadow ? 0.55 : 1);
  if (!paused) fx.update(dt, v, car, heightAt);
  audio.update(v);
  envs.update(car.group.position, camera);
  updateCamera(dt, v); updateOverlays(); updateLabels();
  if (where === 'sim') updateHUD(dt);
  pipeline.render(dt);
}
applyQuality(qName);
go('landing');
resize(); sync();
$('loading').remove();
requestAnimationFrame(frame);

// debug: render one frame at w x h and post it to the dev server (serve.mjs saves shots/<name>.png)
async function snap(name, w = 1600, h = 900) {
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); pipeline.setSize(w, h);
  for (let i = 0; i < 3; i++) pipeline.render(1 / 60);
  const blob2 = await new Promise((r) => canvas.toBlob(r));
  resize(); await fetch('/__shot/' + name, { method: 'POST', body: blob2 }); return name;
}
window.lab = { frame, renderer, scene, resize, v, car, camera, envs, pipeline, applyQuality, setEnv, snap, go, startScene, startChallenge, startReplay, startTour, setView, updateCamera, simStep,
  setCamPose: (p, l) => { camMode = 'fixed2'; camera.position.set(...p); camera.lookAt(...l); }, get where() { return where; } };
