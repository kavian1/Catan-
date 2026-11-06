// Simula partidas completas con jugadores aleatorios y comprueba invariantes del motor.
// Uso: node test/simulate.mjs [partidas]
import * as E from '../public/engine.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function check(st, tag) {
  if (st.phase === 'lobby') return;
  const big = st.players.length > 4;
  const B = big ? 24 : 19;
  for (const k of E.RES) {
    const sum = st.bank[k] + st.players.reduce((s, p) => s + p.res[k], 0);
    if (sum !== B) throw new Error(`${tag}: recurso ${k} no se conserva (${sum})`);
    if (st.bank[k] < 0) throw new Error(`${tag}: banco negativo ${k}`);
    st.players.forEach((p) => { if (p.res[k] < 0) throw new Error(`${tag}: mano negativa`); });
  }
  const deckTotal = big ? 34 : 25;
  const devs = st.devDeck.length + st.players.reduce((s, p) => s + p.dev.length + Object.values(p.played).reduce((a, b) => a + b, 0), 0);
  if (devs !== deckTotal) throw new Error(`${tag}: cartas de progreso no cuadran (${devs})`);
  st.players.forEach((p, i) => {
    const roads = Object.values(st.roads).filter((o) => o === i).length;
    const s = Object.values(st.buildings).filter((b) => b.p === i && b.t === 's').length;
    const c = Object.values(st.buildings).filter((b) => b.p === i && b.t === 'c').length;
    if (roads + p.pieces.road !== 15) throw new Error(`${tag}: caminos no cuadran`);
    if (s + p.pieces.settlement !== 5 || c + p.pieces.city !== 4) throw new Error(`${tag}: edificios no cuadran`);
  });
  // regla de distancia
  const T = E.topology(st.hexes);
  for (const v of Object.keys(st.buildings)) {
    if (T.vertices[v].adj.some((u) => st.buildings[u])) throw new Error(`${tag}: regla de distancia rota`);
  }
}

function act(st, pid, a, rng, stats) {
  try {
    E.applyAction(st, pid, a, rng);
    stats.ok++;
    return true;
  } catch (e) {
    if (e.name !== 'GameError') throw e;
    stats.rejected++;
    return false;
  }
}

function randomRes(p, n, rng) {
  const pool = [];
  E.RES.forEach((k) => { for (let i = 0; i < p.res[k]; i++) pool.push(k); });
  const r = E.zeroRes();
  for (let i = 0; i < n; i++) { const j = Math.floor(rng() * pool.length); r[pool[j]]++; pool.splice(j, 1); }
  return r;
}

function playGame(seed, nPlayers, stats) {
  const rng = mulberry32(seed);
  const st = E.newGame('TEST');
  for (let i = 0; i < nPlayers; i++) E.addPlayer(st, 'J' + i, 'u' + i);
  E.applyAction(st, 0, { type: 'settings', vp: 10, special: true }, rng);
  E.applyAction(st, 0, { type: 'start' }, rng);
  let steps = 0;
  while (st.phase !== 'ended' && steps < 20000) {
    steps++;
    check(st, `seed ${seed} paso ${steps}`);
    if (st.phase === 'setup') {
      const pid = st.setup.order[st.setup.i];
      if (st.setup.v === null) act(st, pid, { type: 'settlement', v: pick(E.legalSettlements(st, pid, true), rng) }, rng, stats);
      else act(st, pid, { type: 'road', e: pick(E.legalRoads(st, pid), rng) }, rng, stats);
      continue;
    }
    const pd = st.pending;
    if (pd && pd.type === 'discard') {
      for (const k of Object.keys(pd.need)) {
        const i = +k;
        act(st, i, { type: 'discard', res: randomRes(st.players[i], pd.need[i], rng) }, rng, stats);
      }
      continue;
    }
    const tp = st.turn.p;
    if (pd && pd.type === 'robber') {
      const hexes = st.hexes.map((_, i) => i).filter((i) => i !== st.robber);
      act(st, tp, { type: 'robber', hex: pick(hexes, rng) }, rng, stats);
      continue;
    }
    if (pd && pd.type === 'steal') { act(st, tp, { type: 'steal', target: pick(pd.from, rng) }, rng, stats); continue; }
    if (pd && pd.type === 'roads') {
      const roads = E.legalRoads(st, tp);
      if (!roads.length || rng() < 0.05) act(st, tp, { type: 'skipRoads' }, rng, stats);
      else act(st, tp, { type: 'road', e: pick(roads, rng) }, rng, stats);
      continue;
    }
    if (st.special) {
      const sp = st.special.order[st.special.i];
      const p = st.players[sp];
      if (rng() < 0.5 && E.hasRes(p.res, E.COSTS.city) && E.legalCities(st, sp).length) act(st, sp, { type: 'city', v: pick(E.legalCities(st, sp), rng) }, rng, stats);
      else if (rng() < 0.5 && E.hasRes(p.res, E.COSTS.road) && E.legalRoads(st, sp).length) act(st, sp, { type: 'road', e: pick(E.legalRoads(st, sp), rng) }, rng, stats);
      else act(st, sp, { type: 'pass' }, rng, stats);
      continue;
    }
    const p = st.players[tp];
    // a veces se intenta una acción ilegal a propósito para comprobar que se rechaza sin romper nada
    if (rng() < 0.03) {
      const other = (tp + 1) % st.players.length;
      act(st, other, pick([{ type: 'roll' }, { type: 'endTurn' }, { type: 'road', e: 0 }, { type: 'buyDev' }], rng), rng, stats);
    }
    if (!st.turn.rolled) {
      const dev = ['knight', 'road', 'plenty', 'monopoly'].find((t) => !E.canPlayDev(st, tp, t));
      if (dev && rng() < 0.4) {
        act(st, tp, { type: 'playDev', card: dev, res: pick(E.RES, rng), res2: pick(E.RES, rng) }, rng, stats);
        stats.dev++;
      } else act(st, tp, { type: 'roll' }, rng, stats);
      continue;
    }
    // fase principal: construir, comerciar o terminar
    const options = [];
    if (E.hasRes(p.res, E.COSTS.city) && E.legalCities(st, tp).length) options.push(() => ({ type: 'city', v: pick(E.legalCities(st, tp), rng) }));
    if (E.hasRes(p.res, E.COSTS.settlement) && p.pieces.settlement > 0) {
      const ls = E.legalSettlements(st, tp, false);
      if (ls.length) options.push(() => ({ type: 'settlement', v: pick(ls, rng) }));
    }
    if (E.hasRes(p.res, E.COSTS.road) && p.pieces.road > 0 && rng() < 0.6) {
      const lr = E.legalRoads(st, tp);
      if (lr.length) options.push(() => ({ type: 'road', e: pick(lr, rng) }));
    }
    if (E.hasRes(p.res, E.COSTS.dev) && st.devDeck.length && rng() < 0.5) options.push(() => ({ type: 'buyDev' }));
    const rates = E.portRates(st, tp);
    const tradable = E.RES.filter((k) => p.res[k] >= rates[k]);
    if (tradable.length && rng() < 0.5) options.push(() => ({ type: 'bankTrade', give: pick(tradable, rng), get: pick(E.RES, rng) }));
    const dev = ['knight', 'road', 'plenty', 'monopoly'].find((t) => !E.canPlayDev(st, tp, t));
    if (dev && rng() < 0.5) options.push(() => ({ type: 'playDev', card: dev, res: pick(E.RES, rng), res2: pick(E.RES, rng) }));
    if (E.total(p.res) > 0 && rng() < 0.15) {
      // comercio entre jugadores
      const giveK = pick(E.RES.filter((k) => p.res[k] > 0), rng);
      const getK = pick(E.RES.filter((k) => k !== giveK), rng);
      const give = E.zeroRes(); give[giveK] = 1;
      const get = E.zeroRes(); get[getK] = 1;
      if (act(st, tp, { type: 'offer', give, get }, rng, stats)) {
        const id = st.trade.id;
        st.players.forEach((q, i) => { if (i !== tp) act(st, i, { type: 'respond', id, accept: rng() < 0.6 }, rng, stats); });
        const yes = Object.entries(st.trade.resp).filter(([, r]) => r === 'yes').map(([i]) => +i);
        if (yes.length && rng() < 0.8) { if (act(st, tp, { type: 'confirmTrade', id, with: pick(yes, rng) }, rng, stats)) stats.trades++; }
        else act(st, tp, { type: 'cancelTrade' }, rng, stats);
      }
      continue;
    }
    if (options.length && rng() < 0.85) {
      const a = pick(options, rng)();
      if (a.type === 'playDev') stats.dev++;
      act(st, tp, a, rng, stats);
    } else act(st, tp, { type: 'endTurn' }, rng, stats);
  }
  check(st, `seed ${seed} final`);
  // la vista de otro jugador no debe filtrar cartas ajenas mientras se juega
  return { st, steps };
}

const N = +(process.argv[2] || 300);
const stats = { ok: 0, rejected: 0, dev: 0, trades: 0 };
let ended = 0, totalSteps = 0, longest = 0, army = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const n = 2 + (g % 5); // 2..6 jugadores
  const { st, steps } = playGame(1000 + g, n, stats);
  totalSteps += steps;
  if (st.phase === 'ended') ended++;
  if (st.longest.p !== null) longest++;
  if (st.army.p !== null) army++;
  // la vista no debe filtrar mazos ni manos ajenas
  if (st.phase !== 'ended') {
    const view = E.viewFor(st, 0);
    if (view.devDeck || view.players[1].res) throw new Error('La vista filtra información oculta');
  }
}
// comprobación de privacidad en mitad de una partida
{
  const st = E.newGame('PRIV');
  E.addPlayer(st, 'A', 'a'); E.addPlayer(st, 'B', 'b');
  E.applyAction(st, 0, { type: 'start' }, mulberry32(5));
  const view = E.viewFor(st, 0);
  if (view.devDeck !== undefined || view.players[1].res !== undefined || view.players[1].dev !== undefined) throw new Error('Vista con información oculta');
  if (view.players[0].res === undefined) throw new Error('La vista propia no tiene mano');
}
console.log(`${N} partidas, ${ended} terminadas con ganador, ${(totalSteps / N).toFixed(0)} pasos de media, ${Date.now() - t0} ms`);
console.log(`acciones aceptadas ${stats.ok}, rechazadas ${stats.rejected}, cartas jugadas ${stats.dev}, intercambios ${stats.trades}`);
console.log(`Ruta más larga asignada en ${longest} partidas, Ejército más grande en ${army}`);
if (ended < N * 0.95) { console.error('Demasiadas partidas sin terminar'); process.exit(1); }
console.log('OK');
