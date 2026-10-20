// Procedural textures (no image files, so the single-file build stays offline and small).
import * as THREE from 'three';

export function canvasTex(w, h, draw, { repeat, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  if (repeat) t.repeat.set(...repeat);
  return t;
}

// Small deterministic RNG so textures look the same every load.
export function rng(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Speckled surface (concrete, asphalt, regolith): base colour + fine grain + soft large blotches.
export function grain(g, w, h, base, { fine = 0.06, blot = 0.05, seed = 2, light = '255,250,240', dark = '0,0,0' } = {}) {
  const r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rad = (0.08 + r() * 0.25) * w, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${r() < 0.5 ? light : dark},${blot * r()})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const n = (w * h) / 6;
  for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${r() < 0.5 ? light : dark},${fine * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
}

// Dried-lakebed cracks (photos #06, #25): jittered-grid Voronoi; a crack wherever the two nearest cells tie.
// Tiles seamlessly because the cell grid wraps.
export function cracks(size = 512, cells = 9, { base = '#c8b394', edge = '#8f7a5d', seed = 7 } = {}) {
  const r = rng(seed), pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + r() * 0.7) / cells, (j + 0.15 + r() * 0.7) / cells]);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); grain(g, size, size, base, { fine: 0.07, blot: 0.08, seed });
  const img = g.getImageData(0, 0, size, size), d = img.data, [er, eg, eb] = [1, 3, 5].map((k) => parseInt(edge.slice(k, k + 2), 16));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    let d1 = 9, d2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci2 = ci + di, cj2 = cj + dj, ii = (ci2 + cells) % cells, jj = (cj2 + cells) % cells, p = pts[jj * cells + ii];
      const dx = u - (p[0] + (ci2 - ii) / cells), dy = v - (p[1] + (cj2 - jj) / cells), dd = dx * dx + dy * dy; // wrapped neighbour
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    const e = Math.sqrt(d2) - Math.sqrt(d1), k = Math.max(0, 1 - e * cells * 9);
    if (k > 0) { const o = (y * size + x) * 4, a = Math.min(1, k * 1.3); d[o] = d[o] * (1 - a) + er * a; d[o + 1] = d[o + 1] * (1 - a) + eg * a; d[o + 2] = d[o + 2] * (1 - a) + eb * a; }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Label sprite in the instrument style: uppercase, letter-spaced, dark plate, thin accent rule.
export function labelSprite(text, { accent = '#e31937', scale = 1 } = {}) {
  const t = canvasTex(512, 96, (g, w, h) => {
    g.font = '600 34px "Bahnschrift", "DIN Alternate", "Segoe UI", sans-serif';
    const label = text.toUpperCase().split('').join(String.fromCharCode(8202));
    const tw = Math.min(w - 40, g.measureText(label).width + 44), x0 = (w - tw) / 2;
    g.fillStyle = 'rgba(10,11,13,.86)'; g.fillRect(x0, 14, tw, 64);
    g.fillStyle = accent; g.fillRect(x0, 14, 4, 64);
    g.fillStyle = '#f2f3f4'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, w / 2 + 2, 47);
  }, { aniso: 4 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(3.6 * scale, 0.675 * scale, 1); s.renderOrder = 5;
  return s;
}
