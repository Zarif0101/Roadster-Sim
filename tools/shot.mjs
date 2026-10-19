// Headless screenshot + script runner for checking the app without a browser window.
// Drives a local Chromium over the DevTools protocol (Node's built-in WebSocket, no npm packages).
//   node tools/shot.mjs <url> <out.png> [width] [height] [script.js]
// The optional script runs in the page after load (top-level await allowed); its result is printed.
// Set CHROME to override the browser path.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const [url, out, W = '1366', H = '768', scriptFile] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node tools/shot.mjs <url> <out.png> [w] [h] [script.js]'); process.exit(1); }
const pw = join(homedir(), 'AppData/Local/ms-playwright');
const guess = existsSync(pw) ? readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse().map((d) => join(pw, d, 'chrome-win64/chrome.exe')).find(existsSync) : null;
const chrome = process.env.CHROME || guess;
if (!chrome) throw new Error('no Chromium found; set CHROME=path');

const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, [`--remote-debugging-port=${port}`, '--headless=new', `--window-size=${W},${H}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--no-sandbox', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shot-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(), logs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
  const nav = await send('Page.navigate', { url }); if (nav.result?.errorText) console.log('navigate:', nav.result.errorText);
  await sleep(1500);
  if (scriptFile) {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${readFileSync(scriptFile, 'utf8')} })()`, awaitPromise: true, returnByValue: true, timeout: 240000 });
    console.log('result:', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.result, null, 1));
  } else await sleep(6000);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  if (logs.length) console.log(logs.slice(0, 20).join('\n'));
  console.log('saved', out);
} finally { ws?.close(); proc.kill(); }
