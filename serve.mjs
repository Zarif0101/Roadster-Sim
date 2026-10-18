// Zero-dependency static server (fallback when Python is not installed). Usage: node serve.mjs
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const root = process.cwd(), port = +process.env.PORT || 8080;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/save?name=')) { // dev helper: save a canvas capture to shots/
    const name = req.url.slice(11).replace(/[^\w-]/g, ''), chunks = [];
    for await (const c of req) chunks.push(c);
    await mkdir('shots', { recursive: true });
    await writeFile(`shots/${name}.jpg`, Buffer.from(Buffer.concat(chunks).toString().split(',')[1], 'base64'));
    res.end('ok'); return;
  }
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).split(String.fromCharCode(92)).join('/').replace(/^(\/\.\.)+/, '');
  try {
    const body = await readFile(join(root, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, 'localhost', () => console.log(`Roadster Lab at http://localhost:${port}`));
