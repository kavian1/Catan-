// Hexaterra — motor de juego compartido entre el navegador y el servidor.
// Todo el estado de la partida es JSON plano; el servidor es la única fuente de verdad.

export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const RES_NAME = { wood: 'Madera', brick: 'Arcilla', sheep: 'Lana', wheat: 'Trigo', ore: 'Mineral' };
export const TERRAIN_NAME = { wood: 'Bosque', brick: 'Cantera', sheep: 'Pradera', wheat: 'Campo', ore: 'Montaña', desert: 'Desierto' };
export const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};
export const PIECES = { road: 15, settlement: 5, city: 4 };
export const DEV_TYPES = ['knight', 'road', 'plenty', 'monopoly', 'vp'];
export const DEV_NAME = { knight: 'Soldado', road: 'Constructor de caminos', plenty: 'Abundancia', monopoly: 'Monopolio', vp: 'Punto de victoria' };
export const DEV_DESC = {
  knight: 'Mueve al bandido a otro terreno y roba una carta a un jugador con edificios en él. Suma para el Ejército más grande.',
  road: 'Construye gratis 2 caminos.',
  plenty: 'Toma del banco 2 cartas de recurso a tu elección.',
  monopoly: 'Elige un recurso: todos los demás jugadores te entregan todas sus cartas de ese tipo.',
  vp: 'Vale 1 punto de victoria. Permanece oculta y cuenta automáticamente.',
};
export const COLORS = [
  { id: 'red', name: 'Rojo', hex: '#e2453c' },
  { id: 'blue', name: 'Azul', hex: '#3a7be0' },
  { id: 'orange', name: 'Naranja', hex: '#f39228' },
  { id: 'white', name: 'Blanco', hex: '#f4f0e6' },
  { id: 'green', name: 'Verde', hex: '#36a85a' },
  { id: 'purple', name: 'Morado', hex: '#9a5ad8' },
];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export class GameError extends Error {
  constructor(msg) { super(msg); this.name = 'GameError'; }
}
function fail(msg) { throw new GameError(msg); }

export const zeroRes = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const total = (r) => RES.reduce((s, k) => s + ((r && r[k]) || 0), 0);
export const hasRes = (have, need) => RES.every((k) => ((have && have[k]) || 0) >= ((need && need[k]) || 0));
export function resList(r) {
  const parts = RES.filter((k) => r[k] > 0).map((k) => `${r[k]} ${RES_NAME[k]}`);
  return parts.length ? parts.join(', ') : 'nada';
}
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const isInt = (x) => Number.isInteger(x);

// ---------------------------------------------------------------- geometría
// Hexágonos con punta arriba en coordenadas axiales (q, r).
// Para que los vértices compartidos coincidan exactamente usamos una rejilla entera:
// X en unidades de √3/2 y Y en unidades de 1/2 (radio del hexágono = 1).
const SQ3_2 = Math.sqrt(3) / 2;
const CORNERS = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
export const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function hexCenter(h) { return { x: (2 * h.q + h.r) * SQ3_2, y: 1.5 * h.r }; }

const topoCache = new Map();
export function topology(hexes) {
  const key = hexes.map((h) => h.q + ',' + h.r).join(';');
  const hit = topoCache.get(key);
  if (hit) return hit;
  const vertices = [], edges = [], vIndex = new Map(), eIndex = new Map();
  const hexVerts = [], hexEdges = [];
  hexes.forEach((h, hi) => {
    const X = 2 * h.q + h.r, Y = 3 * h.r;
    const vs = CORNERS.map(([dx, dy]) => {
      const k = (X + dx) + ',' + (Y + dy);
      let id = vIndex.get(k);
      if (id === undefined) {
        id = vertices.length;
        vIndex.set(k, id);
        vertices.push({ id, x: (X + dx) * SQ3_2, y: (Y + dy) / 2, hexes: [], edges: [], adj: [] });
      }
      vertices[id].hexes.push(hi);
      return id;
    });
    hexVerts.push(vs);
    const es = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.min(vs[i], vs[(i + 1) % 6]), b = Math.max(vs[i], vs[(i + 1) % 6]);
      const k = a + '-' + b;
      let id = eIndex.get(k);
      if (id === undefined) {
        id = edges.length;
        eIndex.set(k, id);
        edges.push({ id, a, b, hexes: [] });
        vertices[a].edges.push(id); vertices[b].edges.push(id);
        vertices[a].adj.push(b); vertices[b].adj.push(a);
      }
      edges[id].hexes.push(hi);
      es.push(id);
    }
    hexEdges.push(es);
  });
  const t = { vertices, edges, hexVerts, hexEdges };
  topoCache.set(key, t);
  return t;
}

function boardCoords(big) {
  const rows = big ? [3, 4, 5, 6, 5, 4, 3] : [3, 4, 5, 4, 3];
  const R = (rows.length - 1) / 2;
  const out = [];
  rows.forEach((len, i) => {
    const r = i - R;
    const q0 = Math.ceil(-r / 2 - (len - 1) / 2);
    for (let k = 0; k < len; k++) out.push({ q: q0 + k, r });
  });
  return out;
}

export function generateBoard(nPlayers, rng) {
  const big = nPlayers > 4;
  const coords = boardCoords(big);
  const terr = big
    ? { wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2 }
    : { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1 };
  const tiles = [];
  for (const [t, n] of Object.entries(terr)) for (let i = 0; i < n; i++) tiles.push(t);
  shuffle(tiles, rng);
  const nums = big
    ? [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12]
    : [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const hexes = coords.map((c, i) => ({ q: c.q, r: c.r, t: tiles[i], n: null }));
  const idx = new Map(hexes.map((h, i) => [h.q + ',' + h.r, i]));
  const neigh = hexes.map((h) => HEX_DIRS.map(([dq, dr]) => idx.get((h.q + dq) + ',' + (h.r + dr))).filter((x) => x !== undefined));
  const hot = (n) => n === 6 || n === 8;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const ns = shuffle(nums.slice(), rng);
    let k = 0;
    hexes.forEach((h) => { h.n = h.t === 'desert' ? null : ns[k++]; });
    let ok = true;
    for (let i = 0; i < hexes.length && ok; i++) {
      for (const j of neigh[i]) {
        const a = hexes[i].n, b = hexes[j].n;
        if (!a || !b) continue;
        // Los 6 y 8 nunca juntos; intentamos además que no se repitan números vecinos.
        if ((hot(a) && hot(b)) || (attempt < 2500 && a === b)) { ok = false; break; }
      }
    }
    if (ok) break;
  }
  // Puertos repartidos de forma uniforme por la costa.
  const T = topology(hexes);
  const coast = T.edges.filter((e) => e.hexes.length === 1);
  let cx = 0, cy = 0;
  hexes.forEach((h) => { const c = hexCenter(h); cx += c.x; cy += c.y; });
  cx /= hexes.length; cy /= hexes.length;
  const ang = (e) => {
    const a = T.vertices[e.a], b = T.vertices[e.b];
    return Math.atan2((a.y + b.y) / 2 - cy, (a.x + b.x) / 2 - cx);
  };
  coast.sort((e1, e2) => ang(e1) - ang(e2));
  const types = big
    ? ['any', 'any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'sheep', 'wheat', 'ore']
    : ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore'];
  shuffle(types, rng);
  const P = types.length, C = coast.length;
  let picks = null;
  for (let attempt = 0; attempt < 50 && !picks; attempt++) {
    const off = rng() * (C / P);
    const cand = types.map((_, i) => coast[Math.floor(off + (i * C) / P) % C]);
    const used = new Set();
    let ok = true;
    for (const e of cand) {
      if (used.has(e.a) || used.has(e.b)) { ok = false; break; }
      used.add(e.a); used.add(e.b);
    }
    if (ok) picks = cand;
  }
  const ports = picks.map((e, i) => ({ e: e.id, a: e.a, b: e.b, t: types[i], hex: e.hexes[0] }));
  const robber = hexes.findIndex((h) => h.t === 'desert');
  return { hexes, ports, robber };
}

// ---------------------------------------------------------------- consultas
export function canSettle(st, pid, v, setup) {
  const T = topology(st.hexes);
  const vx = T.vertices[v];
  if (!vx || st.buildings[v]) return false;
  if (vx.adj.some((u) => st.buildings[u])) return false;
  if (setup) return true;
  return vx.edges.some((e) => st.roads[e] === pid);
}

export function canRoad(st, pid, e) {
  const T = topology(st.hexes);
  const ed = T.edges[e];
  if (!ed || st.roads[e] !== undefined) return false;
  return [ed.a, ed.b].some((v) => {
    const b = st.buildings[v];
    if (b) return b.p === pid;
    return T.vertices[v].edges.some((x) => x !== e && st.roads[x] === pid);
  });
}

export function legalSettlements(st, pid, setup) {
  const T = topology(st.hexes);
  return T.vertices.filter((v) => canSettle(st, pid, v.id, setup)).map((v) => v.id);
}

export function legalRoads(st, pid) {
  const T = topology(st.hexes);
  if (st.phase === 'setup') {
    const s = st.setup && st.setup.v;
    if (s === null || s === undefined) return [];
    return T.vertices[s].edges.filter((e) => st.roads[e] === undefined);
  }
  return T.edges.filter((e) => canRoad(st, pid, e.id)).map((e) => e.id);
}

export function legalCities(st, pid) {
  return Object.entries(st.buildings).filter(([, b]) => b.p === pid && b.t === 's').map(([v]) => +v);
}

export function portRates(st, pid) {
  const r = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
  for (const pt of st.ports || []) {
    const own = [pt.a, pt.b].some((v) => st.buildings[v] && st.buildings[v].p === pid);
    if (!own) continue;
    if (pt.t === 'any') RES.forEach((k) => { r[k] = Math.min(r[k], 3); });
    else r[pt.t] = 2;
  }
  return r;
}

export function roadLength(st, pid) {
  const T = topology(st.hexes);
  const mine = new Set();
  for (const [e, o] of Object.entries(st.roads)) if (o === pid) mine.add(+e);
  if (!mine.size) return 0;
  const used = new Set();
  const blocked = (v) => { const b = st.buildings[v]; return !!b && b.p !== pid; };
  const dfs = (v) => {
    let best = 0;
    for (const e of T.vertices[v].edges) {
      if (!mine.has(e) || used.has(e)) continue;
      used.add(e);
      const ed = T.edges[e];
      const u = ed.a === v ? ed.b : ed.a;
      const len = 1 + (blocked(u) ? 0 : dfs(u));
      used.delete(e);
      if (len > best) best = len;
    }
    return best;
  };
  const starts = new Set();
  for (const e of mine) { starts.add(T.edges[e].a); starts.add(T.edges[e].b); }
  let best = 0;
  for (const v of starts) best = Math.max(best, dfs(v));
  return best;
}

export function victoryPoints(st, pid, withHidden) {
  let v = 0;
  for (const b of Object.values(st.buildings || {})) if (b.p === pid) v += b.t === 'c' ? 2 : 1;
  if (st.longest && st.longest.p === pid) v += 2;
  if (st.army && st.army.p === pid) v += 2;
  if (withHidden) {
    const dev = st.players[pid].dev || [];
    v += dev.filter((c) => c.t === 'vp').length;
  }
  return v;
}

export function hostIndex(st) { return st.players.findIndex((p) => p.uid === st.hostUid); }

/** Jugadores de los que se espera una acción ahora mismo. */
export function waitingOn(st) {
  if (st.phase === 'lobby') return [hostIndex(st)];
  if (st.phase === 'setup') return [st.setup.order[st.setup.i]];
  if (st.phase !== 'play') return [];
  if (st.pending && st.pending.type === 'discard') return Object.keys(st.pending.need).map(Number);
  if (st.special) return [st.special.order[st.special.i]];
  return [st.turn.p];
}

export function canPlayDev(st, pid, type) {
  if (st.phase !== 'play') return 'La partida no está en juego.';
  if (st.special || st.turn.p !== pid) return 'Solo en tu turno.';
  if (st.pending) return 'Termina antes la acción pendiente.';
  if (st.turn.devPlayed) return 'Ya jugaste una carta este turno.';
  const p = st.players[pid];
  if (!p.dev || !p.dev.some((c) => c.t === type)) return 'No tienes esa carta.';
  if (!p.dev.some((c) => c.t === type && c.n < st.turn.n)) return 'Comprada este turno.';
  if (type === 'road' && (p.pieces.road <= 0 || legalRoads(st, pid).length === 0)) return 'No puedes construir caminos.';
  return null;
}

// ---------------------------------------------------------------- creación
export function newGame(room) {
  return {
    v: 1, room, phase: 'lobby', created: Date.now(),
    settings: { vp: 10, special: true },
    players: [], hostUid: null,
    log: [], logSeq: 0, rollSeq: 0, tradeSeq: 0,
  };
}

function cleanName(s) {
  return String(s ?? '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function log(st, text, opts = {}) {
  const e = { id: ++st.logSeq, text };
  if (opts.by !== undefined) e.by = opts.by;
  if (opts.priv) e.priv = opts.priv;
  if (opts.kind) e.kind = opts.kind;
  st.log.push(e);
  if (st.log.length > 160) st.log.splice(0, st.log.length - 160);
}

export function addPlayer(st, rawName, uid) {
  if (st.phase !== 'lobby') fail('La partida ya ha empezado. Pide al anfitrión una revancha para entrar.');
  if (st.players.length >= MAX_PLAYERS) fail('La sala está llena (máximo 6 jugadores).');
  const base = cleanName(rawName);
  if (!base) fail('Escribe tu nombre.');
  let name = base, k = 2;
  while (st.players.some((q) => q.name.toLowerCase() === name.toLowerCase())) name = `${base.slice(0, 13)} ${k++}`;
  const color = COLORS.find((c) => !st.players.some((q) => q.color === c.id)).id;
  st.players.push({ uid, name, color });
  if (!st.hostUid) st.hostUid = uid;
  log(st, `${name} se ha unido a la sala`);
  return st.players.length - 1;
}

function startGame(st, rng) {
  const n = st.players.length;
  if (n < MIN_PLAYERS) fail('Se necesitan al menos 2 jugadores.');
  shuffle(st.players, rng);
  const big = n > 4;
  st.players = st.players.map((q) => ({
    uid: q.uid, name: q.name, color: q.color,
    res: zeroRes(), dev: [], played: {}, knights: 0, pieces: { ...PIECES },
  }));
  Object.assign(st, generateBoard(n, rng));
  const B = big ? 24 : 19;
  st.bank = { wood: B, brick: B, sheep: B, wheat: B, ore: B };
  const counts = big
    ? { knight: 20, vp: 5, road: 3, plenty: 3, monopoly: 3 }
    : { knight: 14, vp: 5, road: 2, plenty: 2, monopoly: 2 };
  const deck = [];
  for (const [t, c] of Object.entries(counts)) for (let i = 0; i < c; i++) deck.push(t);
  st.devDeck = shuffle(deck, rng);
  st.buildings = {};
  st.roads = {};
  st.phase = 'setup';
  const order = st.players.map((_, i) => i);
  st.setup = { order: [...order, ...order.slice().reverse()], i: 0, v: null };
  st.turn = { p: 0, n: 0, rolled: false, devPlayed: false };
  st.pending = null; st.trade = null; st.special = null; st.dice = null;
  st.longest = { p: null, len: 0 };
  st.army = { p: null, size: 0 };
  st.winner = null;
  st.log = [];
  log(st, `¡Empieza la partida! Orden de juego: ${st.players.map((p) => p.name).join(', ')}.`);
  log(st, `${st.players[0].name} coloca su primer poblado.`, { kind: 'turn' });
}

// ---------------------------------------------------------------- reglas
function pay(st, p, cost) {
  for (const k of RES) { const n = cost[k] || 0; p.res[k] -= n; st.bank[k] += n; }
}

function pendingMsg(st) {
  switch (st.pending && st.pending.type) {
    case 'discard': return 'Esperando a que se descarten cartas.';
    case 'robber': return 'Primero hay que mover al bandido.';
    case 'steal': return 'Primero elige a quién robar.';
    case 'roads': return 'Primero coloca los caminos gratis.';
    default: return 'Hay una acción pendiente.';
  }
}

function mainCtx(st, pid) {
  if (st.phase !== 'play') fail('La partida no está en juego.');
  if (st.special) fail('Estamos en la fase de construcción especial.');
  if (st.turn.p !== pid) fail('No es tu turno.');
  if (st.pending) fail(pendingMsg(st));
  if (!st.turn.rolled) fail('Primero tienes que tirar los dados.');
}

function buildCtx(st, pid) {
  if (st.phase !== 'play') fail('Ahora no se puede construir.');
  if (st.special) {
    if (st.special.order[st.special.i] !== pid) fail('No es tu turno.');
    return;
  }
  mainCtx(st, pid);
}

function vertexArg(st, v) {
  if (!isInt(v) || v < 0 || v >= topology(st.hexes).vertices.length) fail('Posición inválida.');
  return v;
}
function edgeArg(st, e) {
  if (!isInt(e) || e < 0 || e >= topology(st.hexes).edges.length) fail('Posición inválida.');
  return e;
}
function parseRes(x) { if (!RES.includes(x)) fail('Recurso inválido.'); return x; }
function parseResObj(o) {
  if (!o || typeof o !== 'object') fail('Recursos inválidos.');
  const r = zeroRes();
  for (const k of RES) {
    const n = o[k] ?? 0;
    if (!isInt(n) || n < 0 || n > 99) fail('Cantidad inválida.');
    r[k] = n;
  }
  return r;
}

function hexLabel(st, hi) {
  const h = st.hexes[hi];
  return h.n ? `${TERRAIN_NAME[h.t]} (${h.n})` : TERRAIN_NAME[h.t];
}

function produce(st, sum) {
  const T = topology(st.hexes);
  const gains = st.players.map(() => zeroRes());
  st.hexes.forEach((h, hi) => {
    if (h.n !== sum || hi === st.robber || h.t === 'desert') return;
    for (const v of T.hexVerts[hi]) {
      const b = st.buildings[v];
      if (b) gains[b.p][h.t] += b.t === 'c' ? 2 : 1;
    }
  });
  const short = [];
  for (const k of RES) {
    const want = gains.reduce((s, g) => s + g[k], 0);
    if (!want) continue;
    if (want > st.bank[k]) {
      const who = gains.filter((g) => g[k] > 0);
      if (who.length === 1) who[0][k] = st.bank[k];
      else { gains.forEach((g) => { g[k] = 0; }); short.push(RES_NAME[k]); }
    }
    gains.forEach((g, i) => { st.players[i].res[k] += g[k]; st.bank[k] -= g[k]; });
  }
  let any = false;
  gains.forEach((g, i) => {
    if (total(g)) { any = true; log(st, `${st.players[i].name} recibe ${resList(g)}.`, { kind: 'gain' }); }
  });
  if (short.length) log(st, `El banco no tiene suficiente ${short.join(' ni ')}: nadie lo recibe.`);
  if (!any && !short.length) log(st, 'Nadie produce nada.');
}

function updateLongest(st) {
  const L = st.players.map((_, i) => roadLength(st, i));
  const cur = st.longest.p;
  const max = Math.max(...L);
  let next;
  if (cur !== null && L[cur] >= 5 && L[cur] >= max) next = cur;
  else {
    const top = L.map((l, i) => i).filter((i) => L[i] === max && max >= 5);
    next = top.length === 1 ? top[0] : null;
  }
  if (next !== cur) {
    if (next === null) log(st, `${st.players[cur].name} pierde la Ruta más larga y queda sin dueño.`);
    else log(st, `${st.players[next].name} consigue la Ruta más larga (${L[next]} tramos): +2 puntos.`, { kind: 'award' });
  }
  st.longest = { p: next, len: next === null ? 0 : L[next] };
}

function updateArmy(st, pid) {
  const k = st.players[pid].knights;
  const cur = st.army.p;
  if (cur === pid) { st.army.size = k; return; }
  if (k >= 3 && (cur === null || k > st.players[cur].knights)) {
    st.army = { p: pid, size: k };
    log(st, `${st.players[pid].name} consigue el Ejército más grande (${k} soldados): +2 puntos.`, { kind: 'award' });
  }
}

function checkWin(st, pid) {
  if (st.phase !== 'play') return;
  const vp = victoryPoints(st, pid, true);
  if (vp >= st.settings.vp) {
    st.phase = 'ended';
    st.winner = pid;
    st.pending = null; st.trade = null; st.special = null;
    log(st, `🏆 ¡${st.players[pid].name} gana la partida con ${vp} puntos!`, { kind: 'win' });
  }
}

function nextTurn(st) {
  st.special = null;
  st.trade = null;
  const t = st.turn;
  t.p = (t.p + 1) % st.players.length;
  t.n++;
  t.rolled = false;
  t.devPlayed = false;
  log(st, `Turno de ${st.players[t.p].name}.`, { kind: 'turn' });
  checkWin(st, t.p);
}

function doSteal(st, pid, vi, rng) {
  const p = st.players[pid], victim = st.players[vi];
  const pool = [];
  RES.forEach((k) => { for (let i = 0; i < victim.res[k]; i++) pool.push(k); });
  if (!pool.length) return;
  const k = pool[Math.floor(rng() * pool.length)];
  victim.res[k]--; p.res[k]++;
  log(st, `${p.name} roba una carta a ${victim.name}.`, {
    by: pid,
    priv: { [pid]: `Robas 1 ${RES_NAME[k]} a ${victim.name}.`, [vi]: `${p.name} te roba 1 ${RES_NAME[k]}.` },
  });
}

function requireHost(st, pid) { if (st.players[pid].uid !== st.hostUid) fail('Solo el anfitrión puede hacer eso.'); }
function requireLobby(st) { if (st.phase !== 'lobby') fail('La partida ya ha empezado.'); }

const ACTIONS = {
  // ---------------- sala de espera
  color(st, pid, a) {
    requireLobby(st);
    const c = COLORS.find((x) => x.id === a.color);
    if (!c) fail('Color inválido.');
    if (st.players.some((q, i) => i !== pid && q.color === c.id)) fail('Ese color ya está cogido.');
    st.players[pid].color = c.id;
  },
  settings(st, pid, a) {
    requireLobby(st); requireHost(st, pid);
    if (a.vp !== undefined) {
      if (!isInt(a.vp) || a.vp < 5 || a.vp > 20) fail('Puntos inválidos.');
      st.settings.vp = a.vp;
    }
    if (a.special !== undefined) st.settings.special = !!a.special;
  },
  kick(st, pid, a) {
    requireLobby(st); requireHost(st, pid);
    const i = st.players.findIndex((q) => q.uid === a.uid);
    if (i < 0 || i === pid) fail('Jugador inválido.');
    const [q] = st.players.splice(i, 1);
    log(st, `${q.name} ha sido expulsado de la sala.`);
  },
  leave(st, pid) {
    requireLobby(st);
    const [q] = st.players.splice(pid, 1);
    if (st.hostUid === q.uid) st.hostUid = st.players[0] ? st.players[0].uid : null;
    log(st, `${q.name} ha salido de la sala.`);
  },
  start(st, pid, a, rng) {
    requireLobby(st); requireHost(st, pid);
    startGame(st, rng);
  },
  rematch(st, pid) {
    if (st.phase !== 'ended') fail('La partida no ha terminado.');
    requireHost(st, pid);
    const keep = st.players.map((q) => ({ uid: q.uid, name: q.name, color: q.color }));
    for (const k of ['hexes', 'ports', 'robber', 'bank', 'devDeck', 'buildings', 'roads', 'setup', 'turn', 'pending', 'trade', 'special', 'dice', 'longest', 'army', 'winner']) delete st[k];
    st.players = keep;
    st.phase = 'lobby';
    st.log = [];
    log(st, '¡Revancha! Esperando a que el anfitrión empiece.');
  },

  // ---------------- construcción
  settlement(st, pid, a) {
    const v = vertexArg(st, a.v);
    const p = st.players[pid];
    if (st.phase === 'setup') {
      const s = st.setup;
      if (s.order[s.i] !== pid) fail('No es tu turno.');
      if (s.v !== null) fail('Ahora coloca un camino.');
      if (!canSettle(st, pid, v, true)) fail('No puedes construir ahí: debe haber al menos dos tramos hasta otro edificio.');
      st.buildings[v] = { p: pid, t: 's' };
      p.pieces.settlement--;
      s.v = v;
      const second = s.i >= st.players.length;
      if (second) {
        const T = topology(st.hexes);
        const g = zeroRes();
        for (const hi of T.vertices[v].hexes) {
          const h = st.hexes[hi];
          if (h.t !== 'desert' && st.bank[h.t] > 0) { g[h.t]++; st.bank[h.t]--; }
        }
        RES.forEach((k) => { p.res[k] += g[k]; });
        log(st, `${p.name} coloca su segundo poblado y recibe ${resList(g)}.`);
      } else log(st, `${p.name} coloca un poblado.`);
      return;
    }
    buildCtx(st, pid);
    if (p.pieces.settlement <= 0) fail('No te quedan poblados (mejora alguno a ciudad).');
    if (!hasRes(p.res, COSTS.settlement)) fail('No tienes recursos suficientes.');
    if (!canSettle(st, pid, v, false)) fail('No puedes construir un poblado ahí.');
    pay(st, p, COSTS.settlement);
    st.buildings[v] = { p: pid, t: 's' };
    p.pieces.settlement--;
    log(st, `${p.name} construye un poblado.`, { by: pid });
    updateLongest(st);
  },

  road(st, pid, a) {
    const e = edgeArg(st, a.e);
    const p = st.players[pid];
    const T = topology(st.hexes);
    if (st.phase === 'setup') {
      const s = st.setup;
      if (s.order[s.i] !== pid) fail('No es tu turno.');
      if (s.v === null) fail('Primero coloca un poblado.');
      const ed = T.edges[e];
      if (ed.a !== s.v && ed.b !== s.v) fail('El camino debe salir de tu nuevo poblado.');
      if (st.roads[e] !== undefined) fail('Ya hay un camino ahí.');
      st.roads[e] = pid;
      p.pieces.road--;
      s.v = null;
      s.i++;
      if (s.i >= s.order.length) {
        st.phase = 'play';
        st.setup = null;
        st.turn = { p: 0, n: 1, rolled: false, devPlayed: false };
        log(st, `¡Colocación terminada! Turno de ${st.players[0].name}.`, { kind: 'turn' });
      } else {
        st.turn.p = s.order[s.i];
        const second = s.i >= st.players.length;
        log(st, `${st.players[s.order[s.i]].name} coloca su ${second ? 'segundo' : 'primer'} poblado.`, { kind: 'turn' });
      }
      return;
    }
    const free = !!(st.pending && st.pending.type === 'roads' && st.turn.p === pid && !st.special && st.phase === 'play');
    if (!free) buildCtx(st, pid);
    if (p.pieces.road <= 0) fail('No te quedan caminos.');
    if (!free && !hasRes(p.res, COSTS.road)) fail('No tienes recursos suficientes.');
    if (!canRoad(st, pid, e)) fail('El camino debe conectar con tus caminos o edificios.');
    if (!free) pay(st, p, COSTS.road);
    st.roads[e] = pid;
    p.pieces.road--;
    if (free) {
      st.pending.left--;
      if (st.pending.left <= 0 || p.pieces.road <= 0 || legalRoads(st, pid).length === 0) st.pending = null;
    }
    log(st, `${p.name} construye un camino${free ? ' gratis' : ''}.`, { by: pid });
    updateLongest(st);
  },

  skipRoads(st, pid) {
    if (!st.pending || st.pending.type !== 'roads' || st.turn.p !== pid) fail('No tienes caminos gratis.');
    st.pending = null;
  },

  city(st, pid, a) {
    const v = vertexArg(st, a.v);
    const p = st.players[pid];
    buildCtx(st, pid);
    const b = st.buildings[v];
    if (!b || b.p !== pid || b.t !== 's') fail('Solo puedes mejorar tus propios poblados.');
    if (p.pieces.city <= 0) fail('No te quedan ciudades.');
    if (!hasRes(p.res, COSTS.city)) fail('No tienes recursos suficientes.');
    pay(st, p, COSTS.city);
    b.t = 'c';
    p.pieces.city--;
    p.pieces.settlement++;
    log(st, `${p.name} convierte un poblado en ciudad.`, { by: pid });
  },

  buyDev(st, pid) {
    const p = st.players[pid];
    buildCtx(st, pid);
    if (!st.devDeck.length) fail('No quedan cartas de progreso.');
    if (!hasRes(p.res, COSTS.dev)) fail('No tienes recursos suficientes.');
    pay(st, p, COSTS.dev);
    const t = st.devDeck.pop();
    p.dev.push({ t, n: st.turn.n });
    log(st, `${p.name} compra una carta de progreso.`, { by: pid, priv: { [pid]: `Has comprado: ${DEV_NAME[t]}.` } });
  },

  // ---------------- dados y bandido
  roll(st, pid, a, rng) {
    if (st.phase !== 'play' || st.special) fail('Ahora no se puede tirar.');
    if (st.turn.p !== pid) fail('No es tu turno.');
    if (st.pending) fail(pendingMsg(st));
    if (st.turn.rolled) fail('Ya has tirado los dados.');
    const d1 = 1 + Math.floor(rng() * 6), d2 = 1 + Math.floor(rng() * 6);
    const sum = d1 + d2;
    st.dice = [d1, d2];
    st.rollSeq = (st.rollSeq || 0) + 1;
    st.turn.rolled = true;
    log(st, `${st.players[pid].name} saca un ${sum} (${d1} + ${d2}).`, { by: pid, kind: 'roll' });
    if (sum === 7) {
      const need = {};
      st.players.forEach((q, i) => { const t = total(q.res); if (t > 7) need[i] = Math.floor(t / 2); });
      const names = Object.keys(need).map((i) => st.players[i].name);
      if (names.length) {
        st.pending = { type: 'discard', need };
        log(st, `¡Un 7! ${names.join(', ')} ${names.length > 1 ? 'deben' : 'debe'} descartar la mitad de sus cartas.`);
      } else {
        st.pending = { type: 'robber' };
        log(st, '¡Un 7! Nadie tiene más de 7 cartas.');
      }
    } else produce(st, sum);
  },

  discard(st, pid, a) {
    const pd = st.pending;
    if (!pd || pd.type !== 'discard' || pd.need[pid] === undefined) fail('No tienes que descartar.');
    const r = parseResObj(a.res);
    const p = st.players[pid];
    if (total(r) !== pd.need[pid]) fail(`Debes descartar exactamente ${pd.need[pid]} cartas.`);
    if (!hasRes(p.res, r)) fail('No tienes esas cartas.');
    pay(st, p, r);
    delete pd.need[pid];
    log(st, `${p.name} descarta ${resList(r)}.`, { by: pid });
    if (!Object.keys(pd.need).length) st.pending = { type: 'robber' };
  },

  robber(st, pid, a, rng) {
    const pd = st.pending;
    if (!pd || pd.type !== 'robber' || st.turn.p !== pid || st.phase !== 'play') fail('Ahora no puedes mover al bandido.');
    const h = a.hex;
    if (!isInt(h) || h < 0 || h >= st.hexes.length) fail('Terreno inválido.');
    if (h === st.robber) fail('El bandido debe moverse a otro terreno.');
    st.robber = h;
    const T = topology(st.hexes);
    const cands = [...new Set(T.hexVerts[h].map((v) => st.buildings[v]).filter((b) => b && b.p !== pid).map((b) => b.p))]
      .filter((i) => total(st.players[i].res) > 0);
    log(st, `${st.players[pid].name} mueve al bandido a ${hexLabel(st, h)}.`, { by: pid });
    if (cands.length === 0) { st.pending = null; log(st, 'No hay nadie a quien robar.'); }
    else if (cands.length === 1) { st.pending = null; doSteal(st, pid, cands[0], rng); }
    else st.pending = { type: 'steal', from: cands };
  },

  steal(st, pid, a, rng) {
    const pd = st.pending;
    if (!pd || pd.type !== 'steal' || st.turn.p !== pid) fail('Ahora no puedes robar.');
    if (!pd.from.includes(a.target)) fail('No puedes robar a ese jugador.');
    st.pending = null;
    doSteal(st, pid, a.target, rng);
  },

  // ---------------- cartas de progreso
  playDev(st, pid, a) {
    const t = a.card;
    if (!['knight', 'road', 'plenty', 'monopoly'].includes(t)) fail('Carta inválida.');
    const why = canPlayDev(st, pid, t);
    if (why) fail(why);
    const p = st.players[pid];
    let r1, r2, mono;
    if (t === 'plenty') {
      r1 = parseRes(a.res); r2 = parseRes(a.res2);
      const need = zeroRes(); need[r1]++; need[r2]++;
      if (!hasRes(st.bank, need)) fail('El banco no tiene esos recursos.');
    }
    if (t === 'monopoly') mono = parseRes(a.res);
    const idx = p.dev.findIndex((c) => c.t === t && c.n < st.turn.n);
    p.dev.splice(idx, 1);
    st.turn.devPlayed = true;
    p.played[t] = (p.played[t] || 0) + 1;
    if (t === 'knight') {
      p.knights++;
      log(st, `${p.name} juega un Soldado.`, { by: pid });
      updateArmy(st, pid);
      st.pending = { type: 'robber' };
    } else if (t === 'road') {
      log(st, `${p.name} juega Constructor de caminos.`, { by: pid });
      st.pending = { type: 'roads', left: Math.min(2, p.pieces.road) };
    } else if (t === 'plenty') {
      p.res[r1]++; st.bank[r1]--; p.res[r2]++; st.bank[r2]--;
      const g = zeroRes(); g[r1]++; g[r2]++;
      log(st, `${p.name} juega Abundancia y toma ${resList(g)}.`, { by: pid });
    } else if (t === 'monopoly') {
      let got = 0;
      st.players.forEach((q, i) => { if (i !== pid) { got += q.res[mono]; q.res[mono] = 0; } });
      p.res[mono] += got;
      log(st, `${p.name} juega Monopolio de ${RES_NAME[mono]} y se lleva ${got}.`, { by: pid });
    }
  },

  // ---------------- comercio
  bankTrade(st, pid, a) {
    mainCtx(st, pid);
    const g = parseRes(a.give), r = parseRes(a.get);
    if (g === r) fail('Elige recursos distintos.');
    const p = st.players[pid];
    const rate = portRates(st, pid)[g];
    if (p.res[g] < rate) fail(`Necesitas ${rate} de ${RES_NAME[g]}.`);
    if (st.bank[r] < 1) fail('El banco no tiene ese recurso.');
    p.res[g] -= rate; st.bank[g] += rate;
    p.res[r]++; st.bank[r]--;
    log(st, `${p.name} cambia ${rate} ${RES_NAME[g]} por 1 ${RES_NAME[r]} (${rate === 4 ? 'banco' : 'puerto ' + rate + ':1'}).`, { by: pid });
  },

  offer(st, pid, a) {
    mainCtx(st, pid);
    const give = parseResObj(a.give), get = parseResObj(a.get);
    if (!total(give) || !total(get)) fail('Debes ofrecer y pedir al menos una carta.');
    if (RES.some((k) => give[k] && get[k])) fail('No puedes ofrecer y pedir el mismo recurso.');
    const p = st.players[pid];
    if (!hasRes(p.res, give)) fail('No tienes esas cartas.');
    st.tradeSeq = (st.tradeSeq || 0) + 1;
    st.trade = { id: st.tradeSeq, from: pid, give, get, resp: {} };
    log(st, `${p.name} ofrece ${resList(give)} a cambio de ${resList(get)}.`, { by: pid, kind: 'offer' });
  },

  respond(st, pid, a) {
    const tr = st.trade;
    if (!tr || tr.id !== a.id) fail('Esa oferta ya no existe.');
    if (tr.from === pid) fail('No puedes responder a tu propia oferta.');
    if (a.accept) {
      if (!hasRes(st.players[pid].res, tr.get)) fail('No tienes las cartas que pide.');
      tr.resp[pid] = 'yes';
    } else tr.resp[pid] = 'no';
  },

  confirmTrade(st, pid, a) {
    mainCtx(st, pid);
    const tr = st.trade;
    if (!tr || tr.id !== a.id || tr.from !== pid) fail('Esa oferta ya no existe.');
    const o = a.with;
    if (!isInt(o) || tr.resp[o] !== 'yes') fail('Ese jugador no ha aceptado.');
    const p = st.players[pid], q = st.players[o];
    if (!hasRes(p.res, tr.give)) fail('Ya no tienes las cartas ofrecidas.');
    if (!hasRes(q.res, tr.get)) fail(`${q.name} ya no tiene esas cartas.`);
    for (const k of RES) {
      p.res[k] += tr.get[k] - tr.give[k];
      q.res[k] += tr.give[k] - tr.get[k];
    }
    st.trade = null;
    log(st, `${p.name} comercia con ${q.name}: da ${resList(tr.give)} y recibe ${resList(tr.get)}.`, { by: pid, kind: 'trade' });
  },

  cancelTrade(st, pid) {
    if (!st.trade || st.trade.from !== pid) fail('No tienes ninguna oferta abierta.');
    st.trade = null;
  },

  // ---------------- fin de turno
  endTurn(st, pid) {
    mainCtx(st, pid);
    st.trade = null;
    const n = st.players.length;
    if (st.settings.special && n >= 5) {
      st.special = { order: Array.from({ length: n - 1 }, (_, k) => (pid + 1 + k) % n), i: 0 };
      log(st, `Fase de construcción especial: ${st.players[st.special.order[0]].name} puede construir.`, { kind: 'special' });
    } else nextTurn(st);
  },

  pass(st, pid) {
    const sp = st.special;
    if (!sp || sp.order[sp.i] !== pid) fail('No es tu turno.');
    sp.i++;
    if (sp.i >= sp.order.length) nextTurn(st);
  },
};

export function applyAction(st, pid, a, rng = Math.random) {
  if (!a || typeof a.type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, a.type)) fail('Acción desconocida.');
  if (!st.players[pid]) fail('No estás en esta partida.');
  ACTIONS[a.type](st, pid, a, rng);
  if (st.phase === 'play' && !st.special) checkWin(st, st.turn.p);
}

/** Vista filtrada del estado para un jugador: oculta las cartas de los demás y el mazo. */
export function viewFor(st, pid) {
  const reveal = st.phase === 'ended';
  const v = JSON.parse(JSON.stringify(st));
  delete v.devDeck;
  v.deckCount = st.devDeck ? st.devDeck.length : 0;
  v.you = pid;
  if (st.phase !== 'lobby') {
    v.players = st.players.map((p, i) => {
      const o = {
        uid: p.uid, name: p.name, color: p.color, knights: p.knights, pieces: { ...p.pieces }, played: { ...p.played },
        resCount: total(p.res), devCount: p.dev.length, roadLen: roadLength(st, i),
        vp: victoryPoints(st, i, i === pid || reveal),
      };
      if (i === pid || reveal) { o.res = { ...p.res }; o.dev = p.dev.map((c) => ({ ...c })); }
      return o;
    });
  }
  v.log = st.log.slice(-80).map((e) => {
    const mine = !!(e.priv && e.priv[pid] !== undefined);
    const o = { id: e.id, text: mine ? e.priv[pid] : e.text };
    if (mine) o.priv = true;
    if (e.by !== undefined) o.by = e.by;
    if (e.kind) o.kind = e.kind;
    return o;
  });
  return v;
}
