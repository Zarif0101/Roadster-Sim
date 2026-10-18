// Builds RoadsterLab.html: one self-contained file (all code, libraries, physics engine and images inlined).
// Double-click it in Chrome or Edge, offline, no server. Run: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const mods = {
  three: 'vendor/three.module.js',
  'three/core': 'vendor/three.core.js',
  'three/addons/OrbitControls.js': 'vendor/OrbitControls.js',
  'three/addons/RoomEnvironment.js': 'vendor/RoomEnvironment.js',
  rapier: 'vendor/rapier.mjs',
  'app/main.js': 'src/main.js', 'app/vehicle.js': 'src/vehicle.js', 'app/world.js': 'src/world.js',
  'app/car.js': 'src/car.js', 'app/scenes.js': 'src/scenes.js', 'app/params.js': 'src/params.js',
};
const byFile = Object.fromEntries(Object.entries(mods).map(([k, f]) => [f, k]));
const resolve = (from, spec) => {
  const parts = from.split('/').slice(0, -1);
  for (const seg of spec.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  const key = byFile[parts.join('/')];
  if (!key) throw new Error(`unmapped import ${spec} in ${from}`);
  return key;
};
const imports = {};
for (const [key, file] of Object.entries(mods)) {
  const src = readFileSync(file, 'utf8').replace(/(from\s*|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (_, pre, q, spec) => `${pre}${q}${resolve(file, spec)}${q}`);
  imports[key] = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
}
let html = readFileSync('index.html', 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">${JSON.stringify({ imports })}</script>`);
html = html.replace('<script type="module" src="src/main.js"></script>', '<script type="module">import "app/main.js";</script>');
html = html.replace(/url\("([^"]+\.png)"\)/g, (_, f) => `url("data:image/png;base64,${readFileSync(f).toString('base64')}")`);
writeFileSync('RoadsterLab.html', html);
console.log(`RoadsterLab.html written: ${(html.length / 1e6).toFixed(1)} MB`);
