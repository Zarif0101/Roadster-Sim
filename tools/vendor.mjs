// Copies every three.js addon that src/ imports (plus their own dependencies) from
// node_modules/three/examples/jsm into vendor/addons, keeping folder layout.
// Run after adding a new `three/addons/...` import: node tools/vendor.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const JSM = 'node_modules/three/examples/jsm/', OUT = 'vendor/addons/';
const SPEC = /(?:from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\1/g;
const specs = (src) => [...src.matchAll(SPEC)].map((m) => m[2]);

const seeds = new Set();
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (p.endsWith('.js')) for (const s of specs(readFileSync(p, 'utf8'))) if (s.startsWith('three/addons/')) seeds.add(s.slice(13));
});
walk('src');

const done = new Set();
const copy = (rel) => {
  if (done.has(rel)) return; done.add(rel);
  const src = readFileSync(JSM + rel, 'utf8');
  mkdirSync(dirname(OUT + rel), { recursive: true });
  writeFileSync(OUT + rel, src);
  for (const s of specs(src)) {
    // doc comments also contain import lines, so only follow specifiers that are real files
    const dep = s.startsWith('three/addons/') ? s.slice(13) : s.startsWith('.') ? posix.normalize(posix.join(posix.dirname(rel), s)) : null;
    if (dep && existsSync(JSM + dep)) copy(dep);
  }
};
if (!existsSync(JSM)) throw new Error('run npm install first');
[...seeds].forEach(copy);
console.log(`vendored ${done.size} addon files:\n  ` + [...done].sort().join('\n  '));
