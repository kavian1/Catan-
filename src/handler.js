// Lógica HTTP del servidor, independiente de dónde se guarde el estado.
// `store` debe implementar:
//   get(key)                -> { data, etag } | null
//   create(key, data)       -> true si se creó (no existía)
//   update(key, data, etag) -> true si se guardó (nadie lo cambió entretanto)
import { newGame, addPlayer, applyAction, viewFor, GameError } from '../public/engine.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
};
const makeCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)]).join('');
const makeId = () => crypto.randomUUID().replace(/-/g, '');
const keyOf = (room) => `room-${room}`;
const normRoom = (r) => String(r || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

const reply = (status, body) => ({ status, body });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(store, room) {
  if (normRoom(room).length !== 4) throw new GameError('Código de sala inválido.');
  const cur = await store.get(keyOf(normRoom(room)));
  if (!cur) throw new GameError('Esa sala no existe.');
  return cur;
}

function playerIndex(rec, token) {
  const uid = token && rec.tokens[token];
  const i = uid ? rec.state.players.findIndex((p) => p.uid === uid) : -1;
  return i;
}

/** Lee, modifica y guarda con control de concurrencia optimista (reintenta si otro escribió antes). */
async function mutate(store, room, fn) {
  const key = keyOf(normRoom(room));
  for (let attempt = 0; attempt < 10; attempt++) {
    const cur = await load(store, room);
    const rec = cur.data;
    const out = fn(rec);
    rec.state.v++;
    rec.updated = Date.now();
    if (await store.update(key, rec, cur.etag)) return { rec, out };
    await sleep(25 + Math.random() * 120);
  }
  throw new GameError('El servidor está ocupado, inténtalo otra vez.');
}

async function create(store, body) {
  for (let i = 0; i < 12; i++) {
    const room = makeCode();
    const state = newGame(room);
    const uid = makeId(), token = makeId();
    addPlayer(state, body && body.name, uid);
    const rec = { state, tokens: { [token]: uid }, updated: Date.now() };
    if (await store.create(keyOf(room), rec)) return reply(200, { room, token, view: viewFor(state, 0) });
  }
  return reply(500, { error: 'No se pudo crear la sala.' });
}

async function join(store, body) {
  const uid = makeId(), token = makeId();
  const { rec, out } = await mutate(store, body && body.room, (r) => {
    const i = addPlayer(r.state, body.name, uid);
    r.tokens[token] = uid;
    return i;
  });
  return reply(200, { room: rec.state.room, token, view: viewFor(rec.state, out) });
}

async function state(store, query, token) {
  const cur = await load(store, query.room);
  const rec = cur.data;
  const pid = playerIndex(rec, token);
  if (pid < 0) return reply(403, { error: 'Ya no formas parte de esta sala.' });
  if (String(rec.state.v) === String(query.v)) return reply(200, { same: true });
  return reply(200, { view: viewFor(rec.state, pid) });
}

async function action(store, body, token) {
  if (!body || !body.action) throw new GameError('Falta la acción.');
  const cur = await load(store, body.room);
  if (playerIndex(cur.data, token) < 0) return reply(403, { error: 'Ya no formas parte de esta sala.' });
  let pid = -1;
  const { rec } = await mutate(store, body.room, (r) => {
    pid = playerIndex(r, token);
    if (pid < 0) throw new GameError('Ya no formas parte de esta sala.');
    const uid = r.state.players[pid].uid;
    applyAction(r.state, pid, body.action, rng);
    if (body.action.type === 'leave' || body.action.type === 'kick') {
      // invalida los tokens de quien ya no está en la sala
      const alive = new Set(r.state.players.map((p) => p.uid));
      for (const [t, u] of Object.entries(r.tokens)) if (!alive.has(u)) delete r.tokens[t];
    }
    pid = r.state.players.findIndex((p) => p.uid === uid);
  });
  if (pid < 0) return reply(200, { left: true });
  return reply(200, { view: viewFor(rec.state, pid) });
}

export async function handle(store, req) {
  try {
    const { method, route } = req;
    if (route === 'create' && method === 'POST') return await create(store, req.body);
    if (route === 'join' && method === 'POST') return await join(store, req.body);
    if (route === 'state' && method === 'GET') return await state(store, req.query || {}, req.token);
    if (route === 'action' && method === 'POST') return await action(store, req.body, req.token);
    if (route === 'ping') return reply(200, { ok: true });
    return reply(404, { error: 'Ruta no encontrada.' });
  } catch (e) {
    if (e && e.name === 'GameError') return reply(400, { error: e.message });
    console.error(e);
    return reply(500, { error: 'Error interno del servidor.' });
  }
}
