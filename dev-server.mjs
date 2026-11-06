// Servidor local para probar (o jugar en la misma WiFi) sin Netlify.
// Uso: node dev-server.mjs   -> http://localhost:8888
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { handle } from './src/handler.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, '.data', 'rooms.json');
const PORT = +(process.env.PORT || 8888);

// Almacén en memoria con ETags, persistido en .data/rooms.json para sobrevivir a reinicios.
class MemoryStore {
  constructor() {
    this.m = new Map();
    try {
      const saved = JSON.parse(fs.readFileSync(DATA, 'utf8'));
      for (const [k, v] of Object.entries(saved)) this.m.set(k, { json: JSON.stringify(v), ver: 1 });
    } catch { /* sin datos previos */ }
  }
  persist() {
    clearTimeout(this.t);
    this.t = setTimeout(() => {
      const out = {};
      for (const [k, v] of this.m) out[k] = JSON.parse(v.json);
      fs.mkdirSync(path.dirname(DATA), { recursive: true });
      fs.writeFileSync(DATA, JSON.stringify(out));
    }, 300);
  }
  async get(k) {
    const r = this.m.get(k);
    return r ? { data: JSON.parse(r.json), etag: String(r.ver) } : null;
  }
  async create(k, d) {
    if (this.m.has(k)) return false;
    this.m.set(k, { json: JSON.stringify(d), ver: 1 });
    this.persist();
    return true;
  }
  async update(k, d, etag) {
    const r = this.m.get(k);
    if (!r || String(r.ver) !== etag) return false;
    this.m.set(k, { json: JSON.stringify(d), ver: r.ver + 1 });
    this.persist();
    return true;
  }
}

const store = new MemoryStore();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

// Solo para pruebas locales (HEX_DEBUG=1): mezcla un parche dentro del estado de una sala.
function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepMerge(target[k], v);
    else target[k] = v;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (process.env.HEX_DEBUG === '1' && url.pathname === '/__debug/patch' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { room, patch } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const key = `room-${room}`;
    const cur = await store.get(key);
    deepMerge(cur.data.state, patch);
    cur.data.state.v++;
    await store.update(key, cur.data, cur.etag);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, v: cur.data.state.v }));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    let body = null;
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
    }
    const out = await handle(store, {
      method: req.method,
      route: url.pathname.slice(5).replace(/\/+$/, ''),
      query: Object.fromEntries(url.searchParams),
      token: req.headers['x-token'] || '',
      body,
    });
    res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(out.body));
    return;
  }
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  try {
    const st = await fsp.stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hexaterra en http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  En tu red local: http://${i.address}:${PORT}`);
  }
});
