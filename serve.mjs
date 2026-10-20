// Zero-dependency dev server for the multi-file version. Usage: node serve.mjs, then open http://localhost:8080
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.cwd(), port = +process.env.PORT || 8080;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).split(String.fromCharCode(92)).join('/').replace(/^(\/\.\.)+/, '');
  // dev-only: pages can POST a screenshot to /__shot/<name>; saved as shots/<name>.png (gitignored)
  if (req.method === 'POST' && path.startsWith('/__shot/')) {
    const name = path.slice(8).replace(/[^\w-]/g, '').slice(0, 60) || 'shot', chunks = [];
    for await (const c of req) chunks.push(c);
    await mkdir(join(root, 'shots'), { recursive: true }); await writeFile(join(root, 'shots', name + '.png'), Buffer.concat(chunks));
    res.writeHead(204); return res.end();
  }
  try {
    const file = path === '/' ? 'index.html' : path;
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Roadster Lab at http://localhost:${port}`));
