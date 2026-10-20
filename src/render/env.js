// Worlds: sky, ground, fog, lights and reflections for each environment.
//   showroom: dark studio with softboxes, like the reveal studio photos (#22, #23)
//   saltflat: dry lakebed with mountains and a physical sky + time of day (#06, #25)
//   night:    the launch site at night: stars, Milky Way, floodlights (#01, #07)
//   mars:     butterscotch sky, rust regolith, 3.71 m/s² gravity
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { canvasTex, grain, cracks, rng } from './tex.js';

// bloom: only light brighter than `bloom` (linear HDR) glows, so a daylight sky never blooms but LEDs do
export const ENVS = {
  showroom: { label: 'Showroom', gravity: 9.81, bloom: 2.6, world: false },
  saltflat: { label: 'Salt flat', gravity: 9.81, bloom: 8, world: true },
  night: { label: 'Launch site, night', gravity: 9.81, bloom: 1.8, world: true },
  mars: { label: 'Mars', gravity: 3.71, bloom: 6, world: true },
};

const domeMat = (top, horizon, bottom, glow = 0x000000) => new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) }, glow: { value: new THREE.Color(glow) } },
  vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: `uniform vec3 top, horizon, bottom, glow; varying vec3 vDir;
    void main() { float y = vDir.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.55)) : mix(horizon, bottom, pow(-y, 0.35));
      c += glow * exp(-abs(y) * 14.0); gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});

function mountains(color, seed, radius = 2200) {
  const r = rng(seed), N = 360, pos = [], col = [], c = new THREE.Color(color);
  const h = Array.from({ length: N + 1 }, (_, i) => { const a = (i / N) * Math.PI * 2; return 60 + 90 * Math.max(0, Math.sin(a * 3 + 1.3) * 0.6 + Math.sin(a * 7.1) * 0.3 + Math.sin(a * 17.3 + 2) * 0.15 + r() * 0.08); });
  h[N] = h[0];
  for (let i = 0; i < N; i++) for (const [k, top] of [[i, 0], [i + 1, 0], [i + 1, 1], [i, 0], [i + 1, 1], [i, 1]]) {
    const a = (k / N) * Math.PI * 2, rr = radius + (k % 7) * 30;
    pos.push(Math.cos(a) * rr, top ? h[k] : -5, Math.sin(a) * rr);
    const s = top ? 1 : 0.7; col.push(c.r * s, c.g * s, c.b * s);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // no depth write: ambient occlusion reads far depth badly; drawn first, everything nearer covers it
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide, depthWrite: false })); m.renderOrder = -1; return m;
}

function starfield() {
  const g = new THREE.Group(), r = rng(11);
  for (const [n, size, b] of [[5000, 1.2, 0.7], [700, 2.2, 1]]) {
    const pos = [], col = [];
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, t = r() * Math.PI * 2, y = Math.abs(u) * 0.98 + 0.02, s = Math.sqrt(1 - y * y);
      pos.push(Math.cos(t) * s * 3000, y * 3000, Math.sin(t) * s * 3000);
      const w = 0.6 + r() * 0.4, tint = r(); col.push(w * b, w * b * (0.9 + tint * 0.1), w * b * (0.85 + tint * 0.25));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true })));
  }
  // Milky Way: a band of soft glow and dense dots along a great circle, drawn into an equirect canvas
  const tex = canvasTex(2048, 1024, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h); const rr = rng(5);
    for (let i = 0; i < 1400; i++) { const x = rr() * w, y = h * 0.42 + Math.sin((x / w) * Math.PI * 2 + 0.6) * h * 0.18 + (rr() - 0.5) * h * 0.09, rad = 18 + rr() * 60, gr = c.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${200 + rr() * 40},${190 + rr() * 30},${210 + rr() * 30},${0.035 * rr()})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 26000; i++) { const x = rr() * w, y = h * 0.42 + Math.sin((x / w) * Math.PI * 2 + 0.6) * h * 0.18 + (rr() + rr() + rr() - 1.5) * h * 0.06; c.fillStyle = `rgba(255,248,240,${0.25 * rr()})`; c.fillRect(x, y, 1.2, 1.2); }
  });
  tex.wrapT = THREE.ClampToEdgeWrapping; tex.mapping = THREE.EquirectangularReflectionMapping;
  const band = new THREE.Mesh(new THREE.SphereGeometry(2900, 64, 32), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  band.rotation.z = 0.5; g.add(band);
  return g;
}

const poolTex = (rgb) => { const t = canvasTex(256, 256, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, `rgba(${rgb},0.55)`); gr.addColorStop(0.55, `rgba(${rgb},0.18)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };

export class Environments {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene; this.pmrem = new THREE.PMREMGenerator(renderer);
    this.name = null; this.time = 0.62; this.envCache = {};
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = true; scene.add(this.sun, this.sun.target);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    // overhead flood (showroom softbox / launch-site floodlight): a real light pool instead of even daylight
    this.spot = new THREE.SpotLight(0xffffff, 0, 0, 0.62, 0.75, 2); this.spot.shadow.bias = -0.0003; this.spot.shadow.normalBias = 0.03; scene.add(this.spot, this.spot.target);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial());
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; scene.add(this.ground);
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.pool.rotation.x = -Math.PI / 2; this.pool.renderOrder = 1; scene.add(this.pool);
    this.sky = new Sky(); this.sky.scale.setScalar(9000); scene.add(this.sky);
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), domeMat(0, 0, 0)); scene.add(this.dome);
    this.stars = starfield(); scene.add(this.stars);
    this.ranges = { saltflat: mountains(0x8d96a3, 3), mars: mountains(0x9b5a3a, 9), night: mountains(0x0b0c10, 4, 2600) };
    Object.values(this.ranges).forEach((m) => scene.add(m));
    this.grounds = this.makeGrounds();
  }

  makeGrounds() {
    const bump = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const salt = cracks(1024, 30, { base: '#c9b597', edge: '#b19d80' }), saltT = new THREE.CanvasTexture(salt);
    saltT.colorSpace = THREE.SRGBColorSpace; saltT.wrapS = saltT.wrapT = THREE.RepeatWrapping; saltT.anisotropy = 8;
    const rep = (t, m) => { t.repeat.set(6000 / m, 6000 / m); return t; };
    const surf = (base, opts) => canvasTex(512, 512, (g, w, h) => grain(g, w, h, base, opts));
    return {
      saltflat: new THREE.MeshStandardMaterial({ map: rep(saltT, 10), bumpMap: rep(bump(salt), 10), bumpScale: 0.8, roughness: 0.96, color: 0xe6ddd0 }),
      showroom: new THREE.MeshStandardMaterial({ map: rep(surf('#2a2c2f', { fine: 0.05, blot: 0.12, seed: 3 }), 9), roughness: 0.32, metalness: 0.0, color: 0x9a9da2 }),
      night: new THREE.MeshStandardMaterial({ map: rep(surf('#2c2d2f', { fine: 0.12, blot: 0.08, seed: 4 }), 6), roughness: 0.82, color: 0xaaaaaa }),
      mars: new THREE.MeshStandardMaterial({ map: rep(surf('#9a5634', { fine: 0.12, blot: 0.18, seed: 8, light: '255,200,150', dark: '60,20,5' }), 14), roughness: 0.97, color: 0xffffff }),
    };
  }

  // Environment (image-based) lighting from a small scene of light sources for each world.
  envMap(name) {
    if (name === 'saltflat') return this.pmrem.fromScene(this.skyScene(), 0.02).texture;
    if (this.envCache[name]) return this.envCache[name];
    const s = new THREE.Scene(), room = (c) => new THREE.Mesh(new THREE.BoxGeometry(60, 30, 60), new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide }));
    const panel = (w, h, x, y, z, k, rx = -Math.PI / 2) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 1.02), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.x = rx; s.add(m); };
    if (name === 'showroom') { s.add(room(0x050506)); panel(14, 4, 0, 12, 0, 9); panel(2, 20, -14, 6, 0, 3, 0); panel(2, 20, 14, 6, 0, 2.2, 0); panel(30, 1, 0, 4, -25, 1.6, 0); }
    if (name === 'night') { s.add(room(0x030407)); panel(6, 3, -20, 14, 10, 6); panel(6, 3, 18, 14, -12, 5); panel(40, 2, 0, 1, -29, 0.25, 0); }
    if (name === 'mars') { s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), domeMat(0x6e5141, 0xd7a375, 0x5c3420))); panel(3, 3, 10, 14, -6, 12); }
    return (this.envCache[name] = this.pmrem.fromScene(s, 0.03).texture);
  }

  skyScene() { // sky + a lakebed disc: paint and glass then show a horizon line like the daylight photos
    const s = new THREE.Scene(), sky = new Sky(); sky.scale.setScalar(1000);
    for (const k in this.sky.material.uniforms) sky.material.uniforms[k].value = this.sky.material.uniforms[k].value;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb7a486).multiplyScalar(0.55 + 0.6 * Math.max(0, this.time)) }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2; s.add(sky, ground); return s;
  }

  setTime(t) { this.time = t; if (this.name === 'saltflat') { this.applySky(); this.scene.environment = this.envMap('saltflat'); } }
  applySky() {
    const el = THREE.MathUtils.degToRad(-3 + 58 * this.time), az = THREE.MathUtils.degToRad(215);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - el, az);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir); u.turbidity.value = 4; u.rayleigh.value = 1.4 + (1 - this.time) * 1.5; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.85; u.cloudCoverage.value = 0.18;
    const low = Math.max(0, 1 - this.time * 2.2);
    this.sun.color.setRGB(1, 0.92 - 0.3 * low, 0.82 - 0.45 * low); this.sun.intensity = 0.4 + 3.2 * Math.max(0, Math.sin(el));
    this.scene.fog = new THREE.Fog(new THREE.Color().setRGB(0.72 - 0.25 * low, 0.76 - 0.32 * low, 0.82 - 0.4 * low), 350, 2600);
  }

  set(name, preset) {
    if (!ENVS[name]) name = 'saltflat';
    const s = this.scene, r = this.renderer; this.name = name;
    s.background = null; this.sky.visible = name === 'saltflat'; this.dome.visible = name !== 'saltflat'; this.stars.visible = name === 'night';
    for (const [k, m] of Object.entries(this.ranges)) m.visible = k === name;
    this.ground.material = this.grounds[name];
    this.sun.shadow.mapSize.set(preset.shadow || 512, preset.shadow || 512); this.sun.castShadow = !!preset.shadow;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.pool.visible = false; this.spot.intensity = 0; this.spot.castShadow = false;
    const flood = (I, color, angle) => { this.spot.intensity = this.spotBase = I; this.spot.color.set(color); this.spot.angle = angle; this.spot.castShadow = !!preset.shadow; this.spot.shadow.mapSize.set(preset.shadow || 512, preset.shadow || 512); if (this.spot.shadow.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; } this.sun.castShadow = false; };
    const D = this.dome.material.uniforms;
    if (name === 'showroom') {
      D.top.value.set(0x050506); D.horizon.value.set(0x0c0d0f); D.bottom.value.set(0x050506); D.glow.value.set(0x000000);
      s.fog = new THREE.FogExp2(0x08090b, 0.022); this.hemi.color.set(0xffffff); this.hemi.groundColor.set(0x111111); this.hemi.intensity = 0.15;
      this.sun.color.set(0xdfe6ff); this.sun.intensity = 0.25; this.sunDir = new THREE.Vector3(-0.15, 1, 0.25).normalize();
      flood(900, 0xffffff, 0.5); this.spotH = 14;
      this.pool.visible = true; this.pool.material.map = poolTex('255,255,255'); this.pool.scale.set(13, 13, 1);
      r.toneMappingExposure = 1.05; s.environmentIntensity = 0.9;
    } else if (name === 'saltflat') {
      this.applySky(); this.hemi.color.set(0xbfd5ff); this.hemi.groundColor.set(0xbca58a); this.hemi.intensity = 0.3;
      r.toneMappingExposure = 0.85; s.environmentIntensity = 0.85;
    } else if (name === 'night') {
      D.top.value.set(0x010206); D.horizon.value.set(0x0b0d16); D.bottom.value.set(0x020203); D.glow.value.set(0x2a140b);
      s.fog = new THREE.FogExp2(0x05060a, 0.0022); this.hemi.color.set(0x6f86b8); this.hemi.groundColor.set(0x0a0a0c); this.hemi.intensity = 0.12;
      this.sun.color.set(0x8ea6d8); this.sun.intensity = 0.18; this.sunDir = new THREE.Vector3(0.4, 1, 0.3).normalize(); // moonlight
      flood(5200, 0xffe8cf, 0.62); this.spotH = 34; // floodlight tower
      this.pool.visible = true; this.pool.material.map = poolTex('255,236,210'); this.pool.scale.set(40, 40, 1);
      r.toneMappingExposure = 1.15; s.environmentIntensity = 0.7;
    } else if (name === 'mars') {
      D.top.value.set(0x6a4c3c); D.horizon.value.set(0xd8a476); D.bottom.value.set(0x6e3a22); D.glow.value.set(0x3a1d0c);
      s.fog = new THREE.Fog(0xc99569, 250, 2200); this.hemi.color.set(0xffc89a); this.hemi.groundColor.set(0x6b3a22); this.hemi.intensity = 0.45;
      this.sun.color.set(0xffe6c8); this.sun.intensity = 2.2; this.sunDir = new THREE.Vector3(-0.5, 0.75, -0.4).normalize();
      r.toneMappingExposure = 1.0; s.environmentIntensity = 0.9;
    }
    s.environment = this.envMap(name);
    // planar reflection under glossy floors on Ultra: a mirror just below a semi-transparent floor
    if (this.mirror) { s.remove(this.mirror); this.mirror.dispose(); this.mirror = null; }
    const glossy = name === 'showroom' || name === 'night';
    this.ground.material.transparent = !!(preset.reflect && glossy); this.ground.material.opacity = preset.reflect && glossy ? 0.9 : 1; this.ground.material.needsUpdate = true;
    if (preset.reflect && glossy) {
      this.mirror = new Reflector(new THREE.PlaneGeometry(400, 400), { textureWidth: innerWidth * 0.5, textureHeight: innerHeight * 0.5, color: 0x3a3a3a });
      this.mirror.rotation.x = -Math.PI / 2; this.mirror.position.y = -0.003; s.add(this.mirror);
    }
    return ENVS[name];
  }

  update(focus, camera) {
    const d = this.sunDir || new THREE.Vector3(0, 1, 0);
    this.sun.position.copy(focus).addScaledVector(d, 60); this.sun.target.position.copy(focus);
    this.pool.position.set(focus.x, 0.004, focus.z);
    this.spot.position.set(focus.x - 4, this.spotH || 20, focus.z + 6); this.spot.target.position.copy(focus);
    this.dome.position.copy(camera.position); this.stars.position.copy(camera.position); this.sky.position.copy(camera.position);
    for (const m of Object.values(this.ranges)) m.position.set(camera.position.x, 0, camera.position.z);
    if (this.mirror) this.mirror.position.set(focus.x, -0.003, focus.z);
  }
}
