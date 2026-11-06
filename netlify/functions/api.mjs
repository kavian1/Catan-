// Función de Netlify: toda la API del juego en /api/*.
// El estado de cada sala se guarda en Netlify Blobs con escrituras condicionales (ETag),
// así dos jugadores que actúan a la vez nunca se pisan.
import { getStore } from '@netlify/blobs';
import { handle } from '../../src/handler.js';

function blobStore() {
  const store = getStore({ name: 'hexaterra-rooms', consistency: 'strong' });
  return {
    async get(key) {
      const r = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      return r ? { data: r.data, etag: r.etag } : null;
    },
    async create(key, data) {
      const r = await store.setJSON(key, data, { onlyIfNew: true });
      return r.modified;
    },
    async update(key, data, etag) {
      const r = await store.setJSON(key, data, { onlyIfMatch: etag });
      return r.modified;
    },
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  let body = null;
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { body = {}; }
  }
  const out = await handle(blobStore(), {
    method: req.method,
    route,
    query: Object.fromEntries(url.searchParams),
    token: req.headers.get('x-token') || '',
    body,
  });
  return new Response(JSON.stringify(out.body), {
    status: out.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export const config = { path: '/api/*' };
