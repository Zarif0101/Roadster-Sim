// Builds RoadsterLab.html: one self-contained file (all code, libraries, physics engine and images inlined).
// Double-click it in Chrome or Edge, offline, no server. Run: node build.mjs
// Crawls the import graph from src/main.js, so new modules need no registration here.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';

const SPEC = /((?:^|[^.\w$])(?:from\s*|import\s*\(\s*|import\s+))(['"])([^'"]+)\2/g;
const file = (from, spec) => {
  if (spec === 'three') return 'vendor/three.module.js';
  if (spec.startsWith('three/addons/')) return 'vendor/addons/' + spec.slice(13);
  if (spec.startsWith('.')) return posix.normalize(posix.join(posix.dirname(from), spec));
  return null;
};
const imports = {};
const visit = (f) => {
  const key = 'app:' + f;
  if (key in imports) return key;
  imports[key] = '';
  // doc comments also contain import lines: rewrite only specifiers that point at real files
  const src = readFileSync(f, 'utf8').replace(SPEC, (m, pre, q, spec) => { const t = file(f, spec); return t && existsSync(t) ? `${pre}${q}${visit(t)}${q}` : m; });
  imports[key] = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
  return key;
};
const entry = visit('src/main.js');

let html = readFileSync('index.html', 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, () => `<script type="importmap">${JSON.stringify({ imports })}</script>`);
html = html.replace('<script type="module" src="src/main.js"></script>', `<script type="module">import "${entry}";</script>`);
html = html.replace(/url\("([^"]+\.(png|jpg))"\)/g, (_, f, ext) => `url("data:image/${ext === 'jpg' ? 'jpeg' : 'png'};base64,${readFileSync(f).toString('base64')}")`);
writeFileSync('RoadsterLab.html', html);
console.log(`RoadsterLab.html written: ${(html.length / 1e6).toFixed(1)} MB, ${Object.keys(imports).length} modules`);
