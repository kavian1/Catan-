// Hexaterra — cliente (interfaz, red y sondeo del estado).
import * as E from './engine.js';
import { BoardView } from './board.js';
import { installSprites } from './pixel.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ri = (k, cls = '') => `<svg class="ri ${cls}" viewBox="0 0 24 24"><use href="#r-${k}"/></svg>`;
const icon = (id, cls = 'mini') => `<svg class="${cls}" viewBox="0 0 24 24"><use href="#${id}"/></svg>`;
const spr = (id) => `<svg viewBox="0 0 24 24"><use href="#${id}"/></svg>`;
const colorHex = (id) => (E.COLORS.find((c) => c.id === id) || E.COLORS[0]).hex;
const costHtml = (cost) => `<span class="cost">${E.RES.flatMap((k) => Array(cost[k] || 0).fill(ri(k))).join('')}</span>`;
const resHtml = (r) => E.RES.filter((k) => r[k] > 0).map((k) => `<b>${r[k]}</b>${ri(k)}`).join(' ') || '—';
const DEV_ICON = { knight: 'i-knight', road: 'i-road', plenty: 'i-plenty', monopoly: 'i-monopoly', vp: 'i-star' };
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const S = {
  room: null, token: null, view: null, v: 0,
  mode: null, sel: null, modeForced: false,
  sheet: null, sheetArg: null,
  form: {},
  busy: false, polling: false, pollTimer: null, pollInFlight: false, online: true,
  lastLogId: null, lastRollSeq: null, animDice: false, hotNum: null, hotUntil: 0,
  myTurn: false, needDiscard: false, needSteal: false, lastTradeId: null,
  endHidden: false, qrFor: null, wake: true, wakeLock: null,
};
let board;

// ------------------------------------------------------------ sesión
const SKEY = 'hexaterra.session';
const NKEY = 'hexaterra.name';
const store = {
  get(st, k) { try { return JSON.parse(st.getItem(k)); } catch { return null; } },
  set(st, k, v) { try { st.setItem(k, JSON.stringify(v)); } catch { /* */ } },
  del(st, k) { try { st.removeItem(k); } catch { /* */ } },
};
function saveSession(room, token, name) {
  const d = { room, token, name };
  store.set(sessionStorage, SKEY, d);
  store.set(localStorage, SKEY, d);
}
function clearSession() { store.del(sessionStorage, SKEY); store.del(localStorage, SKEY); }

// ------------------------------------------------------------ red
async function api(route, body) {
  let r;
  try {
    r = await fetch('/api/' + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-token': S.token || '' },
      body: JSON.stringify(body),
    });
  } catch {
    const e = new Error('Sin conexión con el servidor.'); e.status = 0; throw e;
  }
  const d = await r.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
  if (!r.ok || d.error) { const e = new Error(d.error || 'Error del servidor.'); e.status = r.status; throw e; }
  return d;
}
async function fetchState() {
  let r;
  try {
    r = await fetch(`/api/state?room=${encodeURIComponent(S.room)}&v=${S.v}`, { headers: { 'x-token': S.token }, cache: 'no-store' });
  } catch {
    const e = new Error('Sin conexión con el servidor.'); e.status = 0; throw e;
  }
  const d = await r.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
  if (!r.ok) { const e = new Error(d.error || 'Error del servidor.'); e.status = r.status; throw e; }
  return d;
}
const isGone = (e) => e.status === 403 || (e.status === 400 && /no existe|inválido|formas parte/i.test(e.message));

function startPolling() { stopPolling(); S.polling = true; schedulePoll(1000); }
function stopPolling() { S.polling = false; clearTimeout(S.pollTimer); }
function schedulePoll(ms) { clearTimeout(S.pollTimer); if (S.polling) S.pollTimer = setTimeout(poll, ms); }
async function poll() {
  if (!S.polling || !S.room || document.hidden || S.pollInFlight) return;
  S.pollInFlight = true;
  try {
    const d = await fetchState();
    setOnline(true);
    if (d.view) applyView(d.view);
  } catch (e) {
    S.pollInFlight = false;
    if (isGone(e)) { clearSession(); showHome(null, e.message); return; }
    setOnline(false);
  }
  S.pollInFlight = false;
  schedulePoll(S.online ? 1200 : 3000);
}
function setOnline(ok) {
  S.online = ok;
  $('#netState').classList.toggle('hidden', ok);
}

async function act(a) {
  if (S.busy) return false;
  S.busy = true;
  try {
    const d = await api('action', { room: S.room, action: a });
    if (d.left) { clearSession(); showHome(); return true; }
    applyView(d.view);
    return true;
  } catch (e) {
    toast(e.message, 'err');
    if (isGone(e)) { clearSession(); showHome(null, e.message); }
    return false;
  } finally {
    S.busy = false;
  }
}

// ------------------------------------------------------------ pantallas
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function showHome(code, msg) {
  stopPolling();
  S.room = null; S.token = null; S.view = null; S.v = 0; S.mode = null; S.sel = null;
  closeSheet();
  $('#overlay').classList.add('hidden');
  store.del(sessionStorage, SKEY);
  history.replaceState(null, '', location.pathname + (code ? `?sala=${code}` : ''));
  show('home');
  document.title = 'Hexaterra';
  $('#nameInput').value = localStorage.getItem(NKEY) || $('#nameInput').value || '';
  $('#codeInput').value = code || '';
  $('#joinBtn').textContent = code ? `Unirse a ${code}` : 'Unirse';
  $('#homeError').textContent = msg || '';
  const saved = store.get(localStorage, SKEY);
  const box = $('#resumeBox');
  if (saved && saved.room) {
    box.innerHTML = `<div class="resume-title">Tienes una partida abierta</div>
      <div class="muted small">Sala <b>${esc(saved.room)}</b> como <b>${esc(saved.name || '')}</b></div>
      <div class="btn-row"><button class="btn primary" data-do="resume">Continuar</button><button class="btn" data-do="forget">Olvidar</button></div>`;
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
  if (code) setTimeout(() => $('#nameInput').focus(), 50);
}

function enter(d, name) {
  if (name) localStorage.setItem(NKEY, name);
  S.room = d.room; S.token = d.token; S.v = 0;
  S.lastLogId = null; S.lastRollSeq = null; S.qrFor = null; S.endHidden = false;
  saveSession(d.room, d.token, name || (d.view.players[d.view.you] || {}).name);
  history.replaceState(null, '', `${location.pathname}?sala=${d.room}`);
  applyView(d.view);
  startPolling();
  keepAwake();
}

async function resume(ses) {
  S.room = ses.room; S.token = ses.token; S.v = 0;
  S.lastLogId = null; S.lastRollSeq = null; S.qrFor = null;
  try {
    const d = await fetchState();
    enter({ room: ses.room, token: ses.token, view: d.view }, ses.name);
  } catch (e) {
    if (isGone(e)) { clearSession(); showHome(null, e.message); }
    else showHome(ses.room, 'No se pudo conectar. Inténtalo de nuevo.');
  }
}

// ------------------------------------------------------------ estado recibido
function applyView(view) {
  if (S.view && S.view.room === view.room && view.v < S.v) return; // respuesta antigua
  const prev = S.view && S.view.room === view.room ? S.view : null;
  S.view = view; S.v = view.v;
  const me = view.you;

  // avisos del historial
  const maxId = view.log.length ? view.log[view.log.length - 1].id : 0;
  if (!prev || S.lastLogId === null) S.lastLogId = maxId;
  else if (maxId > S.lastLogId) {
    const fresh = view.log.filter((e) => e.id > S.lastLogId && (e.by !== me || e.priv) && e.kind !== 'turn');
    fresh.slice(-3).forEach((e) => toast(e.text, e.kind === 'win' || (e.priv && e.by === me) ? 'big' : ''));
    S.lastLogId = maxId;
  }
  // dados
  if (S.lastRollSeq !== null && view.rollSeq !== S.lastRollSeq && view.dice) {
    S.animDice = true;
    const sum = view.dice[0] + view.dice[1];
    if (sum !== 7) { S.hotNum = sum; S.hotUntil = Date.now() + 3500; setTimeout(() => S.view && render(), 3600); }
  }
  S.lastRollSeq = view.rollSeq;

  if (view.phase === 'lobby') { S.endHidden = false; S.mode = null; S.sel = null; }
  if (view.phase !== 'lobby') {
    const myTurn = (view.phase === 'play' && !view.special && view.turn.p === me) || (view.phase === 'setup' && view.setup.order[view.setup.i] === me);
    if (prev && myTurn && !S.myTurn) { toast(view.phase === 'setup' ? 'Te toca colocar' : '¡Es tu turno!', 'big'); buzz(); }
    S.myTurn = myTurn;
    const pd = view.pending;
    const needDiscard = !!(pd && pd.type === 'discard' && pd.need[me] !== undefined);
    if (needDiscard && !S.needDiscard) { buzz(); openSheet('discard'); }
    S.needDiscard = needDiscard;
    const needSteal = !!(pd && pd.type === 'steal' && view.turn.p === me);
    if (needSteal && !S.needSteal) openSheet('steal');
    S.needSteal = needSteal;
    if (view.trade && view.trade.from !== me && view.trade.id !== S.lastTradeId && prev) buzz();
    S.lastTradeId = view.trade ? view.trade.id : null;
    if (prev && prev.phase !== 'ended' && view.phase === 'ended') { S.endHidden = false; closeSheet(); }
    document.title = myTurn ? '● Tu turno · Hexaterra' : 'Hexaterra';
  }
  render();
}

function buzz() { try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch { /* */ } }

async function keepAwake() {
  if (!S.wake || S.wakeLock || document.hidden || !('wakeLock' in navigator)) return;
  try {
    S.wakeLock = await navigator.wakeLock.request('screen');
    S.wakeLock.addEventListener('release', () => { S.wakeLock = null; });
  } catch { /* no disponible */ }
}

// ------------------------------------------------------------ pintar
function render() {
  const v = S.view;
  if (!v) return;
  if (v.phase === 'lobby') { show('lobby'); renderLobby(); renderSheet(); $('#overlay').classList.add('hidden'); return; }
  show('game');
  computeMode();
  renderPlayers();
  renderStatus();
  renderBoard();
  renderDice();
  renderTradeBanner();
  renderConfirm();
  renderHand();
  renderActions();
  if (window.matchMedia('(min-width: 900px)').matches) $('#logInline').innerHTML = logHtml(60);
  renderSheet();
  renderEnd();
}

function renderLobby() {
  const v = S.view, me = v.you;
  const isHost = v.players[me] && v.players[me].uid === v.hostUid;
  $('#lobbyCode').textContent = v.room;
  renderQR();
  $('#lobbyCount').textContent = `(${v.players.length}/${E.MAX_PLAYERS})`;
  $('#lobbyPlayers').innerHTML = v.players.map((p, i) => `
    <li><span class="dot" style="background:${colorHex(p.color)}"></span>
      <span class="grow">${esc(p.name)}</span>
      ${p.uid === v.hostUid ? '<span class="tag gold">Anfitrión</span>' : ''}
      ${i === me ? '<span class="tag">Tú</span>' : ''}
      ${isHost && i !== me ? `<button class="kick" data-do="kick" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}">Expulsar</button>` : ''}
    </li>`).join('');
  $('#colorPick').innerHTML = E.COLORS.map((c) => {
    const taken = v.players.some((p, i) => i !== me && p.color === c.id);
    const mine = v.players[me].color === c.id;
    return `<button class="swatch${mine ? ' on' : ''}" style="background:${c.hex}" data-do="color" data-color="${c.id}" ${taken ? 'disabled' : ''} aria-label="${c.name}" title="${c.name}"></button>`;
  }).join('');
  const s = v.settings;
  $('#lobbySettings').innerHTML = `
    <div class="set-row"><span>Puntos para ganar</span>
      <div class="stepper">${isHost ? `<button class="round" data-do="vp" data-d="-1" ${s.vp <= 5 ? 'disabled' : ''}>−</button>` : ''}<b>${s.vp}</b>${isHost ? `<button class="round" data-do="vp" data-d="1" ${s.vp >= 20 ? 'disabled' : ''}>+</button>` : ''}</div></div>
    <div class="set-row"><span>Fase de construcción especial<br><span class="muted small">Solo se usa con 5 o 6 jugadores</span></span>
      ${isHost ? `<button class="toggle${s.special ? ' on' : ''}" data-do="special" aria-label="Activar fase especial"></button>` : `<b>${s.special ? 'Sí' : 'No'}</b>`}</div>`;
  const n = v.players.length;
  $('#startBtn').classList.toggle('hidden', !isHost);
  $('#startBtn').disabled = n < E.MIN_PLAYERS;
  $('#lobbyHint').textContent = isHost
    ? (n < 2 ? 'Necesitas al menos 2 jugadores para empezar.' : `Tablero ${n > 4 ? 'ampliado (5–6 jugadores)' : 'normal (2–4 jugadores)'}. El orden de turno se sortea al empezar.`)
    : 'Esperando a que el anfitrión empiece la partida…';
}

function shareLink() { return `${location.origin}${location.pathname}?sala=${S.room}`; }
function renderQR() {
  if (S.qrFor === S.room) return;
  const el = $('#qr');
  if (!window.QRCode) { setTimeout(() => S.view && S.view.phase === 'lobby' && renderQR(), 700); return; }
  el.innerHTML = '';
  try {
    // eslint-disable-next-line no-undef
    new QRCode(el, { text: shareLink(), width: 224, height: 224, colorDark: '#0c2233', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    S.qrFor = S.room;
  } catch { /* sin QR */ }
}

function canBuildNow() {
  const v = S.view, me = v.you;
  if (v.phase !== 'play' || v.pending) return false;
  if (v.special) return v.special.order[v.special.i] === me;
  return v.turn.p === me && v.turn.rolled;
}
function canTradeNow() {
  const v = S.view;
  return v.phase === 'play' && !v.pending && !v.special && v.turn.p === v.you && v.turn.rolled;
}

function forcedMode() {
  const v = S.view, me = v.you;
  if (v.phase === 'setup' && v.setup.order[v.setup.i] === me) return v.setup.v === null ? 'settlement' : 'road';
  if (v.phase !== 'play' || !v.pending || v.turn.p !== me) return null;
  if (v.pending.type === 'robber') return 'robber';
  if (v.pending.type === 'roads') return 'road';
  return null;
}
function computeMode() {
  const f = forcedMode();
  if (f) {
    if (S.mode !== f || !S.modeForced) { S.mode = f; S.sel = null; S.modeForced = true; }
  } else if (S.modeForced) { S.mode = null; S.sel = null; S.modeForced = false; }
  else if (S.mode && !canBuildNow()) { S.mode = null; S.sel = null; }
  if (S.mode && S.sel !== null && !targetsFor(S.mode).includes(S.sel)) S.sel = null;
}
function targetsFor(mode) {
  const v = S.view, me = v.you;
  switch (mode) {
    case 'settlement': return E.legalSettlements(v, me, v.phase === 'setup');
    case 'road': return E.legalRoads(v, me);
    case 'city': return E.legalCities(v, me);
    case 'robber': return v.hexes.map((_, i) => i).filter((i) => i !== v.robber);
    default: return [];
  }
}

function onBoardTap(kind, id) {
  if (!S.mode || !S.view) return;
  const want = S.mode === 'robber' ? 'h' : S.mode === 'road' ? 'e' : 'v';
  if (kind !== want || !targetsFor(S.mode).includes(id)) return;
  S.sel = id;
  renderBoard();
  renderConfirm();
}

async function confirmSel() {
  const m = S.mode, id = S.sel;
  if (id === null || !m) return;
  const a = m === 'robber' ? { type: 'robber', hex: id } : m === 'road' ? { type: 'road', e: id } : { type: m, v: id };
  const ok = await act(a);
  if (ok) {
    S.sel = null;
    if (!S.modeForced) S.mode = null;
    render();
  }
}

function renderPlayers() {
  const v = S.view, me = v.you, wait = E.waitingOn(v);
  const goal = Math.min(v.settings.vp, 20);
  const bar = (n) => `<div class="vpbar" title="${n} de ${v.settings.vp} puntos">${Array.from({ length: goal }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</div>`;
  $('#players').innerHTML = v.players.map((p, i) => `
    <button class="pchip${wait.includes(i) ? ' active' : ''}${i === me ? ' me' : ''}" style="--pc:${colorHex(p.color)}" data-do="sheet" data-sheet="player" data-p="${i}">
      <div class="pname">${esc(p.name)}</div>
      ${bar(p.vp)}
      <div class="pstats">
        <b class="vp">${icon('i-star')}${p.vp}</b>
        <span title="Cartas de recurso">${icon('i-cards')}${p.resCount}</span>
        <span title="Cartas de progreso">${icon('i-dev')}${p.devCount}</span>
      </div>
      <div class="badges">${p.knights ? `<span class="badge" title="Soldados jugados">${icon('i-knight')}${p.knights}</span>` : ''}${v.longest.p === i ? `<span class="badge" title="Ruta más larga">${icon('i-road')}${v.longest.len}</span>` : ''}${v.army.p === i ? '<span class="badge" title="Ejército más grande">Ejército</span>' : ''}</div>
    </button>`).join('');
}

function statusInfo() {
  const v = S.view, me = v.you, P = v.players;
  const nm = (i) => `<b>${esc(P[i].name)}</b>`;
  if (v.phase === 'ended') return { txt: `${nm(v.winner)} ha ganado la partida`, btn: '<button class="btn small primary" data-do="showEnd">Resultados</button>' };
  if (v.phase === 'setup') {
    const s = v.setup, cur = s.order[s.i], second = s.i >= P.length;
    if (cur === me) {
      return { txt: s.v === null ? `Coloca tu <b>${second ? 'segundo' : 'primer'}</b> poblado${second ? ' (recibirás sus recursos)' : ''}` : 'Coloca un <b>camino</b> junto a tu poblado' };
    }
    return { txt: `${nm(cur)} coloca su ${second ? 'segundo' : 'primer'} ${s.v === null ? 'poblado' : 'camino'}…` };
  }
  const pd = v.pending, tp = v.turn.p;
  if (pd && pd.type === 'discard') {
    if (pd.need[me] !== undefined) return { txt: `¡Un 7! Descarta <b>${pd.need[me]}</b> cartas`, btn: '<button class="btn small primary" data-do="sheet" data-sheet="discard">Descartar</button>' };
    return { txt: `Esperando descartes de ${Object.keys(pd.need).map((i) => nm(+i)).join(', ')}…` };
  }
  if (pd && pd.type === 'robber') return tp === me ? { txt: 'Toca un terreno para mover al <b>bandido</b>' } : { txt: `${nm(tp)} mueve al bandido…` };
  if (pd && pd.type === 'steal') return tp === me ? { txt: 'Elige a quién <b>robar</b>', btn: '<button class="btn small primary" data-do="sheet" data-sheet="steal">Elegir</button>' } : { txt: `${nm(tp)} elige a quién robar…` };
  if (pd && pd.type === 'roads') return tp === me ? { txt: `Coloca <b>${pd.left}</b> camino${pd.left > 1 ? 's' : ''} gratis` } : { txt: `${nm(tp)} construye caminos gratis…` };
  if (v.special) {
    const a = v.special.order[v.special.i];
    return a === me ? { txt: '<b>Construcción especial:</b> construye o compra (sin comerciar), o pasa' } : { txt: `Construcción especial: turno de ${nm(a)}` };
  }
  if (tp === me) return { txt: v.turn.rolled ? '<b>Tu turno:</b> construye, comercia o termina' : '<b>Tu turno:</b> tira los dados' };
  return { txt: `Turno de ${nm(tp)}` };
}
function renderStatus() {
  const s = statusInfo();
  $('#status').innerHTML = `<span class="txt">${s.txt}</span>${s.btn || ''}`;
}

function renderBoard() {
  const v = S.view;
  board.render(v, {
    mode: S.mode, sel: S.sel, me: v.you,
    targets: S.mode ? targetsFor(S.mode) : [],
    hotNum: S.hotUntil > Date.now() ? S.hotNum : null,
  });
}

function dieHtml(n, red) {
  return `<div class="die${red ? ' red' : ''}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
}
function renderDice() {
  const v = S.view, el = $('#dice');
  if (!v.dice) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="dice-sum">${v.dice[0] + v.dice[1]}</span>${dieHtml(v.dice[0])}${dieHtml(v.dice[1], true)}`;
  if (S.animDice) {
    S.animDice = false;
    el.classList.remove('rolling');
    void el.offsetWidth;
    el.classList.add('rolling');
  }
}

function renderTradeBanner() {
  const v = S.view, me = v.you, tr = v.trade, el = $('#tradeBanner');
  if (!tr || v.phase !== 'play' || S.sheet === 'trade') { el.classList.add('hidden'); return; }
  if (tr.from === me) {
    const yes = Object.values(tr.resp).filter((r) => r === 'yes').length;
    const answered = Object.keys(tr.resp).length;
    el.innerHTML = `<div class="tb-row">Tu oferta: das ${resHtml(tr.give)} · pides ${resHtml(tr.get)}</div>
      <div class="tb-row muted small">${yes} ${yes === 1 ? 'acepta' : 'aceptan'} · han respondido ${answered} de ${v.players.length - 1}</div>
      <div class="btn-row"><button class="btn small" data-do="cancelOffer">Retirar</button><button class="btn small primary" data-do="sheet" data-sheet="trade">Ver respuestas</button></div>`;
    el.classList.remove('hidden');
    return;
  }
  const r = tr.resp[me];
  if (r === 'no') { el.classList.add('hidden'); return; }
  const can = E.hasRes(v.players[me].res, tr.get);
  el.innerHTML = `<div class="tb-row"><b>${esc(v.players[tr.from].name)}</b>&nbsp;te da ${resHtml(tr.give)}</div>
    <div class="tb-row">si le das ${resHtml(tr.get)}</div>
    ${r === 'yes'
      ? '<div class="tb-row muted small">Has aceptado. Esperando su decisión…</div><div class="btn-row"><button class="btn small" data-do="respond" data-a="0">Retirar mi aceptación</button></div>'
      : `<div class="btn-row"><button class="btn small danger" data-do="respond" data-a="0">Rechazar</button><button class="btn small ok" data-do="respond" data-a="1" ${can ? '' : 'disabled'}>${can ? 'Aceptar' : 'No tienes esas cartas'}</button></div>`}`;
  el.classList.remove('hidden');
}

function renderConfirm() {
  const el = $('#confirmBar'), m = S.mode, v = S.view;
  if (!m) { el.classList.add('hidden'); return; }
  const what = { settlement: 'tu poblado', road: 'tu camino', city: 'la ciudad', robber: 'el bandido' }[m];
  const n = targetsFor(m).length;
  let msg;
  if (S.sel === null) {
    if (!n) msg = 'No hay ningún sitio disponible.';
    else if (m === 'robber') msg = 'Toca el terreno al que mover al bandido';
    else if (m === 'city') msg = 'Toca uno de tus poblados para mejorarlo';
    else msg = `Toca un sitio marcado para ${what}`;
  } else {
    msg = m === 'robber' ? '¿Mover al bandido aquí?' : m === 'city' ? '¿Mejorar a ciudad?' : m === 'road' ? '¿Construir el camino aquí?' : '¿Construir el poblado aquí?';
  }
  let side = '';
  if (!S.modeForced) side = '<button class="btn small" data-do="cancelMode">Cancelar</button>';
  else if (v.pending && v.pending.type === 'roads') side = '<button class="btn small" data-do="skipRoads">Terminar</button>';
  el.innerHTML = `<div class="msg">${msg}</div>${side}${S.sel !== null ? '<button class="btn primary" data-do="confirm">Confirmar</button>' : ''}`;
  el.classList.remove('hidden');
}

function renderHand() {
  const v = S.view, me = v.you, P = v.players[me];
  const rates = E.portRates(v, me);
  $('#hand').innerHTML = E.RES.map((k) => `
    <div class="rcard res-${k}${P.res[k] ? '' : ' zero'}" title="${E.RES_NAME[k]}">
      ${rates[k] < 4 ? `<span class="rate">${rates[k]}:1</span>` : ''}
      <svg viewBox="0 0 24 24"><use href="#r-${k}"/></svg>
      <div class="cnt">${P.res[k]}</div><span class="rn">${E.RES_NAME[k]}</span>
    </div>`).join('');
}

function renderActions() {
  const v = S.view, me = v.you;
  let pr = { label: 'Esperando', ic: 'i-hourglass', dis: true };
  if (v.phase === 'play') {
    if (v.special) {
      if (v.special.order[v.special.i] === me) pr = { label: 'Pasar', ic: 'i-next', dis: false };
    } else if (v.turn.p === me) {
      pr = v.turn.rolled
        ? { label: 'Terminar turno', ic: 'i-next', dis: !!v.pending }
        : { label: 'Tirar dados', ic: 'i-dice', dis: !!v.pending, pulse: !v.pending };
    }
  } else if (v.phase === 'setup') pr = { label: 'Colocación', ic: 'i-house', dis: true };
  else if (v.phase === 'ended') pr = { label: 'Resultados', ic: 'i-trophy', dis: false, act: 'showEnd' };
  const nDev = (v.players[me].dev || []).length;
  $('#actions').innerHTML = `
    <button class="act primary${pr.pulse ? ' pulse' : ''}" data-do="${pr.act || 'primary'}" ${pr.dis ? 'disabled' : ''}><span class="ic" style="color:${colorHex(v.players[me].color)}">${spr(pr.ic)}</span><span class="lbl">${pr.label}</span></button>
    <button class="act" data-do="sheet" data-sheet="build" ${canBuildNow() ? '' : 'disabled'}><span class="ic">${spr('i-hammer')}</span><span class="lbl">Construir</span></button>
    <button class="act" data-do="sheet" data-sheet="trade" ${canTradeNow() ? '' : 'disabled'}><span class="ic">${spr('i-trade')}</span><span class="lbl">Comerciar</span></button>
    <button class="act" data-do="sheet" data-sheet="cards"><span class="ic">${spr('i-dev')}</span><span class="lbl">Cartas</span>${nDev ? `<span class="count">${nDev}</span>` : ''}</button>`;
}

function logHtml(n) {
  const v = S.view;
  return `<ul class="log-list">${v.log.slice().reverse().slice(0, n).map((e) => `<li class="${e.kind || ''}">${esc(e.text)}</li>`).join('')}</ul>`;
}

function renderEnd() {
  const v = S.view, el = $('#overlay');
  if (v.phase !== 'ended' || S.endHidden) { el.classList.add('hidden'); return; }
  const isHost = v.players[v.you].uid === v.hostUid;
  const rows = v.players.map((q, i) => {
    const bs = Object.values(v.buildings).filter((b) => b.p === i);
    return {
      i, q,
      s: bs.filter((b) => b.t === 's').length,
      c: bs.filter((b) => b.t === 'c').length,
      vpc: (q.dev || []).filter((c) => c.t === 'vp').length,
    };
  }).sort((a, b) => b.q.vp - a.q.vp);
  el.innerHTML = `<div class="end-card">
    <div class="trophy">${spr('i-trophy')}</div>
    <h2>¡${esc(v.players[v.winner].name)} gana!</h2>
    <table class="score">
      <tr><th>Jugador</th><th>Pobl.</th><th>Ciud.</th><th>Ruta</th><th>Ejérc.</th><th>Cartas PV</th><th>Total</th></tr>
      ${rows.map((r) => `<tr class="${r.i === v.winner ? 'win' : ''}"><td><span class="dot" style="background:${colorHex(r.q.color)};display:inline-block;vertical-align:-3px"></span> ${esc(r.q.name)}</td>
        <td>${r.s}</td><td>${r.c * 2}</td><td>${v.longest.p === r.i ? 2 : '–'}</td><td>${v.army.p === r.i ? 2 : '–'}</td><td>${r.vpc || '–'}</td><td><b>${r.q.vp}</b></td></tr>`).join('')}
    </table>
    <div class="btn-row">${isHost ? '<button class="btn primary" data-do="rematch">Revancha</button>' : ''}<button class="btn" data-do="hideEnd">Ver tablero</button></div>
    ${isHost ? '' : '<p class="muted small">El anfitrión puede empezar una revancha con los mismos jugadores.</p>'}
    <button class="link-btn" data-do="exitToHome">Salir a la portada</button>
  </div>`;
  el.classList.remove('hidden');
}

// ------------------------------------------------------------ hojas
function steppers(form, field, vals, maxFn, have) {
  return `<div class="res-steppers">${E.RES.map((k) => `
    <div class="rstep">
      <button class="sbtn" data-do="step" data-f="${form}" data-s="${field}" data-r="${k}" data-d="1" ${vals[k] >= maxFn(k) ? 'disabled' : ''}>+</button>
      ${ri(k)}<span class="val">${vals[k]}</span>${have ? `<span class="have">tienes ${have[k]}</span>` : ''}
      <button class="sbtn" data-do="step" data-f="${form}" data-s="${field}" data-r="${k}" data-d="-1" ${vals[k] <= 0 ? 'disabled' : ''}>−</button>
    </div>`).join('')}</div>`;
}

function sheetBuild() {
  const v = S.view, me = v.you, P = v.players[me];
  if (!canBuildNow()) return '<p class="muted">Ahora no puedes construir.</p>';
  const items = [
    { what: 'road', name: 'Camino', ic: 'i-road', cost: E.COSTS.road, left: P.pieces.road, spots: E.legalRoads(v, me).length, desc: 'Amplía tu red' },
    { what: 'settlement', name: 'Poblado', ic: 'i-house', cost: E.COSTS.settlement, left: P.pieces.settlement, spots: E.legalSettlements(v, me, false).length, desc: '1 punto' },
    { what: 'city', name: 'Ciudad', ic: 'i-city', cost: E.COSTS.city, left: P.pieces.city, spots: E.legalCities(v, me).length, desc: '2 puntos, produce el doble' },
    { what: 'dev', name: 'Carta de progreso', ic: 'i-dev', cost: E.COSTS.dev, left: v.deckCount, spots: 1, desc: 'Sorpresa' },
  ];
  return `<div class="opt-list">${items.map((it) => {
    let why = '';
    if (!it.left) why = it.what === 'dev' ? 'No quedan cartas' : 'No te quedan piezas';
    else if (!E.hasRes(P.res, it.cost)) why = 'Te faltan recursos';
    else if (!it.spots) why = it.what === 'city' ? 'No tienes poblados que mejorar' : 'No hay ningún sitio válido';
    return `<button class="opt" data-do="pickBuild" data-what="${it.what}" ${why ? 'disabled' : ''} style="--pc:${colorHex(P.color)}">
      ${icon(it.ic, 'oi')}<span class="ot"><b>${it.name}</b><small>${costHtml(it.cost)} · ${it.desc} · ${it.what === 'dev' ? 'quedan' : 'te quedan'} ${it.left}</small>${why ? `<span class="why">${why}</span>` : ''}</span></button>`;
  }).join('')}</div>`;
}

function sheetTrade() {
  const v = S.view, me = v.you, P = v.players[me];
  if (!canTradeNow()) return '<p class="muted">Solo puedes comerciar en tu turno, después de tirar los dados.</p>';
  const F = S.form.trade;
  const tabs = `<div class="tabs"><button class="${F.tab === 'players' ? 'on' : ''}" data-do="tab" data-tab="players">Con jugadores</button><button class="${F.tab === 'bank' ? 'on' : ''}" data-do="tab" data-tab="bank">Banco y puertos</button></div>`;
  if (F.tab === 'bank') {
    const rates = E.portRates(v, me);
    if (F.bg && P.res[F.bg] < rates[F.bg]) F.bg = null;
    if (F.bget && (F.bget === F.bg || v.bank[F.bget] < 1)) F.bget = null;
    const ok = F.bg && F.bget;
    return tabs + `
      <h4>Das</h4>
      <div class="rpick">${E.RES.map((k) => `<button class="${F.bg === k ? 'on' : ''}" data-do="bankGive" data-r="${k}" ${P.res[k] >= rates[k] ? '' : 'disabled'}>${ri(k)}<b>${rates[k]}:1</b><span class="muted">tienes ${P.res[k]}</span></button>`).join('')}</div>
      <h4>Recibes</h4>
      <div class="rpick">${E.RES.map((k) => `<button class="${F.bget === k ? 'on' : ''}" data-do="bankGet" data-r="${k}" ${k !== F.bg && v.bank[k] > 0 ? '' : 'disabled'}>${ri(k)}<span>${E.RES_NAME[k]}</span><span class="muted">banco ${v.bank[k]}</span></button>`).join('')}</div>
      <div class="btn-row"><button class="btn primary" data-do="bankTrade" ${ok ? '' : 'disabled'}>${ok ? `Cambiar ${rates[F.bg]} ${ri(F.bg)} por 1 ${ri(F.bget)}` : 'Elige qué das y qué recibes'}</button></div>
      <p class="muted small">El banco cambia 4 cartas iguales por 1. Con un edificio en un puerto: 3:1 (puerto genérico) o 2:1 (puerto de ese recurso).</p>`;
  }
  const tr = v.trade && v.trade.from === me ? v.trade : null;
  let html = tabs;
  if (tr) {
    html += `<div class="summary">Oferta enviada: das ${resHtml(tr.give)} · pides ${resHtml(tr.get)}</div>
      <div class="resp-list">${v.players.map((q, i) => {
        if (i === me) return '';
        const r = tr.resp[i];
        return `<div class="resp"><span class="dot" style="background:${colorHex(q.color)}"></span><span class="grow">${esc(q.name)}</span>${
          r === 'yes' ? `<button class="btn small ok" data-do="confirmTrade" data-p="${i}">Intercambiar</button>` : r === 'no' ? '<span class="muted">Rechaza</span>' : '<span class="muted">Pensando…</span>'}</div>`;
      }).join('')}</div>
      <div class="btn-row"><button class="btn small danger" data-do="cancelOffer">Retirar oferta</button></div>
      <h4>Hacer otra oferta</h4>`;
  }
  const ok = E.total(F.give) > 0 && E.total(F.get) > 0 && E.hasRes(P.res, F.give);
  html += `<h4>Ofreces</h4>${steppers('trade', 'give', F.give, (k) => P.res[k])}
    <h4>Pides a cambio</h4>${steppers('trade', 'get', F.get, () => 9)}
    <div class="btn-row"><button class="btn primary" data-do="sendOffer" ${ok ? '' : 'disabled'}>${tr ? 'Enviar nueva oferta' : 'Enviar oferta a todos'}</button></div>
    <p class="muted small">Todos verán la oferta; tú eliges con quién cerrar el trato entre quienes acepten.</p>`;
  return html;
}

function sheetCards() {
  const v = S.view, me = v.you, P = v.players[me];
  const groups = {};
  for (const c of P.dev || []) (groups[c.t] = groups[c.t] || []).push(c);
  let buyWhy = '';
  if (!canBuildNow()) buyWhy = 'Solo en tu turno, después de tirar';
  else if (!v.deckCount) buyWhy = 'No quedan cartas';
  else if (!E.hasRes(P.res, E.COSTS.dev)) buyWhy = 'Te faltan recursos';
  let html = `<button class="opt" data-do="pickBuild" data-what="dev" ${buyWhy ? 'disabled' : ''}>${icon('i-dev', 'oi')}<span class="ot"><b>Comprar carta</b><small>${costHtml(E.COSTS.dev)} · quedan ${v.deckCount} en el mazo</small>${buyWhy ? `<span class="why">${buyWhy}</span>` : ''}</span></button>`;
  html += '<h4>Tus cartas</h4>';
  if (!(P.dev || []).length) html += '<p class="muted">Todavía no tienes cartas de progreso.</p>';
  else {
    html += `<div class="opt-list">${E.DEV_TYPES.filter((t) => groups[t]).map((t) => {
      const n = groups[t].length;
      const why = t === 'vp' ? '' : E.canPlayDev(v, me, t);
      return `<div class="opt devcard">${icon(DEV_ICON[t], 'oi')}<span class="ot"><b>${E.DEV_NAME[t]}${n > 1 ? ` ×${n}` : ''}</b><small>${E.DEV_DESC[t]}</small>${why ? `<span class="why">${why}</span>` : ''}</span>${
        t === 'vp' ? '' : `<button class="btn small primary" data-do="playDev" data-card="${t}" ${why ? 'disabled' : ''}>Jugar</button>`}</div>`;
    }).join('')}</div>`;
  }
  html += `<p class="muted small">Una carta por turno (también antes de tirar los dados). No puedes jugar una carta el mismo turno en que la compras. Soldados jugados: <b>${P.knights}</b>.</p>`;
  return html;
}

function sheetDiscard() {
  const v = S.view, me = v.you, pd = v.pending;
  if (!pd || pd.type !== 'discard' || pd.need[me] === undefined) return null;
  const need = pd.need[me], P = v.players[me], F = S.form.discard;
  const sel = E.total(F.res);
  return `<p>Tienes ${E.total(P.res)} cartas: devuelve <b>${need}</b> al banco.</p>
    ${steppers('discard', 'res', F.res, (k) => Math.min(P.res[k], F.res[k] + (need - sel)), P.res)}
    <div class="btn-row"><button class="btn primary" data-do="discardGo" ${sel === need ? '' : 'disabled'}>Descartar (${sel}/${need})</button></div>`;
}

function sheetSteal() {
  const v = S.view, me = v.you, pd = v.pending;
  if (!pd || pd.type !== 'steal' || v.turn.p !== me) return null;
  return `<p>Roba una carta al azar a:</p><div class="opt-list">${pd.from.map((i) => {
    const q = v.players[i];
    return `<button class="opt" data-do="steal" data-p="${i}" style="--pc:${colorHex(q.color)}">${icon('i-house', 'oi')}<span class="ot"><b>${esc(q.name)}</b><small>${q.resCount} cartas en la mano</small></span></button>`;
  }).join('')}</div>`;
}

function sheetPlenty() {
  const v = S.view;
  if (E.canPlayDev(v, v.you, 'plenty')) return null;
  const F = S.form.plenty, sel = E.total(F.res);
  return `<p>Elige 2 recursos del banco (pueden ser iguales).</p>
    ${steppers('plenty', 'res', F.res, (k) => Math.min(v.bank[k], F.res[k] + (2 - sel)))}
    <div class="btn-row"><button class="btn primary" data-do="plentyGo" ${sel === 2 ? '' : 'disabled'}>Tomar (${sel}/2)</button></div>`;
}

function sheetMonopoly() {
  const v = S.view;
  if (E.canPlayDev(v, v.you, 'monopoly')) return null;
  const F = S.form.mono;
  return `<p>Todos los demás jugadores te darán todas sus cartas del recurso que elijas.</p>
    <div class="rpick">${E.RES.map((k) => `<button class="${F.r === k ? 'on' : ''}" data-do="monoPick" data-r="${k}">${ri(k)}<span>${E.RES_NAME[k]}</span></button>`).join('')}</div>
    <div class="btn-row"><button class="btn primary" data-do="monoGo" ${F.r ? '' : 'disabled'}>${F.r ? `Monopolio de ${E.RES_NAME[F.r]}` : 'Elige un recurso'}</button></div>`;
}

function sheetPlayer() {
  const v = S.view, i = S.sheetArg, q = v.players[i];
  if (!q) return null;
  const ports = (v.ports || []).filter((pt) => [pt.a, pt.b].some((x) => v.buildings[x] && v.buildings[x].p === i));
  const portTxt = ports.length ? ports.map((pt) => (pt.t === 'any' ? '3:1' : `2:1 ${E.RES_NAME[pt.t]}`)).join(', ') : 'ninguno';
  const own = i === v.you;
  return `<div class="summary" style="border-left:6px solid ${colorHex(q.color)}">
      <b>${esc(q.name)}</b>${own ? ' (tú)' : ''}<br>
      Puntos ${own ? '' : 'visibles'}: <b>${q.vp}</b><br>
      Cartas de recurso: <b>${q.resCount}</b> · Cartas de progreso: <b>${q.devCount}</b><br>
      Soldados jugados: <b>${q.knights}</b> · Ruta actual: <b>${q.roadLen}</b> tramos<br>
      Piezas restantes: ${q.pieces.road} caminos, ${q.pieces.settlement} poblados, ${q.pieces.city} ciudades<br>
      Puertos: ${portTxt}
    </div>
    ${v.longest.p === i ? '<p>Tiene la <b>Ruta más larga</b> (+2).</p>' : ''}
    ${v.army.p === i ? '<p>Tiene el <b>Ejército más grande</b> (+2).</p>' : ''}`;
}

function sheetMenu() {
  return `<div class="summary">Sala <b style="letter-spacing:.15em">${esc(S.room)}</b></div>
    <div class="btn-row"><button class="btn" data-do="share">Compartir enlace de la sala</button></div>
    <div class="settings" style="margin-top:1rem">
      <div class="set-row"><span>Mantener la pantalla encendida</span><button class="toggle${S.wake ? ' on' : ''}" data-do="wake" aria-label="Pantalla encendida"></button></div>
    </div>
    <div class="btn-row"><button class="btn" data-do="exitToHome">Volver a la portada</button></div>
    <p class="muted small">Si cierras la página puedes volver a entrar con el mismo enlace o con «Continuar» en la portada: la partida sigue en el servidor.</p>`;
}

function sheetRules() {
  return `<div class="rules">
    <h4>Objetivo</h4>
    <p>Gana quien llegue primero a <b>10 puntos de victoria</b> (el anfitrión puede cambiarlo) durante su propio turno.</p>
    <h4>Costes</h4>
    <table class="rules-table">
      <tr><td>Camino</td><td>${costHtml(E.COSTS.road)}</td><td class="muted small">0 puntos</td></tr>
      <tr><td>Poblado</td><td>${costHtml(E.COSTS.settlement)}</td><td class="muted small">1 punto</td></tr>
      <tr><td>Ciudad</td><td>${costHtml(E.COSTS.city)}</td><td class="muted small">2 puntos (mejora un poblado)</td></tr>
      <tr><td>Carta de progreso</td><td>${costHtml(E.COSTS.dev)}</td><td class="muted small">ver abajo</td></tr>
    </table>
    <h4>Terrenos</h4>
    <ul>
      <li>${ri('wood')} Bosque → Madera · ${ri('brick')} Cantera → Arcilla · ${ri('sheep')} Pradera → Lana</li>
      <li>${ri('wheat')} Campo → Trigo · ${ri('ore')} Montaña → Mineral · ${ri('desert')} Desierto → nada</li>
    </ul>
    <h4>Colocación inicial</h4>
    <ul>
      <li>Por turnos, cada jugador coloca un poblado y un camino pegado a él. Después, en orden inverso, un segundo poblado y camino.</li>
      <li>El segundo poblado te da una carta de cada terreno que lo rodea.</li>
    </ul>
    <h4>Tu turno</h4>
    <ul>
      <li><b>Tira los dados.</b> Los terrenos con ese número producen: cada poblado vecino recibe 1 carta y cada ciudad 2.</li>
      <li><b>Comercia</b> con los demás (ellos solo pueden comerciar contigo durante tu turno) o con el banco: 4:1, o 3:1 / 2:1 si tienes un edificio en un puerto.</li>
      <li><b>Construye</b> y compra cartas de progreso, en el orden que quieras. Luego termina el turno.</li>
    </ul>
    <h4>El 7 y el bandido</h4>
    <ul>
      <li>Con un 7 nadie produce. Quien tenga más de 7 cartas devuelve la mitad (redondeando hacia abajo).</li>
      <li>Quien tiró mueve al bandido a otro terreno: ese terreno no produce mientras siga allí, y roba una carta al azar a un jugador con edificio en él.</li>
    </ul>
    <h4>Construcción</h4>
    <ul>
      <li>Regla de distancia: un poblado nunca puede estar en una esquina contigua a otro edificio.</li>
      <li>Los caminos y poblados nuevos deben conectar con tus caminos. Un edificio rival corta el paso.</li>
      <li>Cada jugador tiene 15 caminos, 5 poblados y 4 ciudades.</li>
    </ul>
    <h4>Cartas de progreso</h4>
    <ul>
      <li><b>Soldado</b> (14): mueve al bandido y roba.</li>
      <li><b>Punto de victoria</b> (5): se mantiene oculto y cuenta solo.</li>
      <li><b>Constructor de caminos</b> (2): 2 caminos gratis.</li>
      <li><b>Abundancia</b> (2): 2 recursos del banco.</li>
      <li><b>Monopolio</b> (2): todos te dan un tipo de recurso.</li>
      <li>Una por turno, nunca la que acabas de comprar. Se puede jugar antes de tirar.</li>
    </ul>
    <h4>Bonos de +2 puntos</h4>
    <ul>
      <li><b>Ruta más larga:</b> el primero con 5 o más caminos seguidos. Para quitársela hay que superarle.</li>
      <li><b>Ejército más grande:</b> el primero con 3 o más soldados jugados. También hay que superarle.</li>
    </ul>
    <h4>5 y 6 jugadores</h4>
    <p>Se usa un tablero ampliado con más recursos y cartas. Con la fase de construcción especial, tras cada turno los demás jugadores pueden construir o comprar (sin comerciar) por orden.</p>
    <h4>Probabilidades</h4>
    <p>Los puntitos bajo cada número indican lo frecuente que sale. El 6 y el 8 (en rojo) son los más probables después del 7.</p>
  </div>`;
}

function sheetLog() { return S.view ? logHtml(80) : null; }

const SHEETS = {
  build: { title: 'Construir', body: sheetBuild },
  trade: { title: 'Comerciar', body: sheetTrade },
  cards: { title: 'Cartas de progreso', body: sheetCards },
  discard: { title: 'Descartar cartas', body: sheetDiscard },
  steal: { title: 'Robar una carta', body: sheetSteal },
  plenty: { title: 'Abundancia', body: sheetPlenty },
  monopoly: { title: 'Monopolio', body: sheetMonopoly },
  player: { title: 'Jugador', body: sheetPlayer },
  menu: { title: 'Menú', body: sheetMenu },
  rules: { title: 'Cómo se juega', body: sheetRules },
  log: { title: 'Historial', body: sheetLog },
};

function openSheet(kind, arg) {
  const v = S.view;
  if (kind === 'discard' && S.form.discardSeq !== v.rollSeq) { S.form.discard = { res: E.zeroRes() }; S.form.discardSeq = v.rollSeq; }
  if (kind === 'trade' && (!S.form.trade || S.form.tradeTurn !== v.turn.n)) {
    S.form.trade = { tab: 'players', give: E.zeroRes(), get: E.zeroRes(), bg: null, bget: null };
    S.form.tradeTurn = v.turn.n;
  }
  if (kind === 'plenty') S.form.plenty = { res: E.zeroRes() };
  if (kind === 'monopoly') S.form.mono = { r: null };
  S.sheet = kind;
  S.sheetArg = arg;
  S.sheetScroll = 0;
  renderSheet();
  if (v && v.phase !== 'lobby') renderTradeBanner();
}
function closeSheet() {
  S.sheet = null;
  $('#sheet').classList.add('hidden');
  if (S.view && S.view.phase !== 'lobby' && S.view.hexes) renderTradeBanner();
}
function renderSheet() {
  const el = $('#sheet');
  if (!S.sheet) { el.classList.add('hidden'); return; }
  const def = SHEETS[S.sheet];
  const needsView = !['rules'].includes(S.sheet);
  const html = needsView && !S.view ? null : def.body();
  if (html === null) { closeSheet(); return; }
  const body = $('#sheetBody');
  const keep = el.classList.contains('hidden') ? 0 : body.scrollTop;
  $('#sheetTitle').textContent = def.title;
  body.innerHTML = html;
  el.classList.remove('hidden');
  body.scrollTop = keep;
}

// ------------------------------------------------------------ avisos
function toast(msg, cls = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, cls === 'err' ? 4200 : 3300);
}

// ------------------------------------------------------------ acciones de la interfaz
function nameValue() { return $('#nameInput').value.trim(); }
function homeErr(m) { $('#homeError').textContent = m; }

const H = {
  async create() {
    const name = nameValue();
    if (!name) return homeErr('Escribe tu nombre.');
    homeErr('');
    $('#createBtn').disabled = true;
    try { enter(await api('create', { name }), name); } catch (e) { homeErr(e.message); } finally { $('#createBtn').disabled = false; }
  },
  async join() {
    const name = nameValue();
    const room = $('#codeInput').value.trim().toUpperCase();
    if (!name) return homeErr('Escribe tu nombre.');
    if (!/^[A-Z]{4}$/.test(room)) return homeErr('El código de sala tiene 4 letras.');
    homeErr('');
    $('#joinBtn').disabled = true;
    try { enter(await api('join', { room, name }), name); } catch (e) { homeErr(e.message); } finally { $('#joinBtn').disabled = false; }
  },
  resume() { const s = store.get(localStorage, SKEY); if (s) resume(s); },
  forget() { clearSession(); showHome($('#codeInput').value.trim().toUpperCase()); },
  async share() {
    const url = shareLink();
    try {
      if (navigator.share) { await navigator.share({ title: 'Hexaterra', text: `¡Únete a mi partida de Hexaterra! Sala ${S.room}`, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch { window.prompt('Copia este enlace:', url); }
  },
  leaveLobby() { if (confirm('¿Salir de la sala?')) act({ type: 'leave' }); },
  start() { act({ type: 'start' }); },
  color(d) { act({ type: 'color', color: d.color }); },
  kick(d) { if (confirm(`¿Expulsar a ${d.name}?`)) act({ type: 'kick', uid: d.uid }); },
  vp(d) { act({ type: 'settings', vp: S.view.settings.vp + +d.d }); },
  special() { act({ type: 'settings', special: !S.view.settings.special }); },
  sheet(d) { openSheet(d.sheet, d.p !== undefined ? +d.p : undefined); },
  closeSheet() { closeSheet(); },
  center() { board.resetZoom(); },
  primary() {
    const v = S.view, me = v.you;
    if (v.phase !== 'play') return;
    if (v.special) { if (v.special.order[v.special.i] === me) act({ type: 'pass' }); return; }
    if (v.turn.p !== me) return;
    if (!v.turn.rolled) act({ type: 'roll' });
    else act({ type: 'endTurn' });
  },
  async pickBuild(d) {
    if (d.what === 'dev') { await act({ type: 'buyDev' }); return; }
    S.mode = d.what; S.sel = null; S.modeForced = false;
    closeSheet();
    render();
  },
  confirm() { confirmSel(); },
  cancelMode() { S.mode = null; S.sel = null; render(); },
  skipRoads() { act({ type: 'skipRoads' }); },
  step(d) {
    const form = S.form[d.f];
    const obj = form[d.s];
    const delta = +d.d;
    obj[d.r] = Math.max(0, obj[d.r] + delta);
    if (d.f === 'trade' && delta > 0) {
      const other = d.s === 'give' ? form.get : form.give;
      other[d.r] = 0;
    }
    renderSheet();
  },
  tab(d) { S.form.trade.tab = d.tab; renderSheet(); },
  async sendOffer() {
    const F = S.form.trade;
    if (await act({ type: 'offer', give: F.give, get: F.get })) toast('Oferta enviada a todos');
  },
  cancelOffer() { act({ type: 'cancelTrade' }); },
  async confirmTrade(d) {
    if (await act({ type: 'confirmTrade', id: S.view.trade.id, with: +d.p })) {
      S.form.trade.give = E.zeroRes(); S.form.trade.get = E.zeroRes();
      toast('¡Intercambio hecho!');
      closeSheet();
    }
  },
  respond(d) { if (S.view.trade) act({ type: 'respond', id: S.view.trade.id, accept: d.a === '1' }); },
  bankGive(d) { const F = S.form.trade; F.bg = d.r; if (F.bget === d.r) F.bget = null; renderSheet(); },
  bankGet(d) { S.form.trade.bget = d.r; renderSheet(); },
  bankTrade() { const F = S.form.trade; act({ type: 'bankTrade', give: F.bg, get: F.bget }); },
  async playDev(d) {
    if (d.card === 'plenty' || d.card === 'monopoly') { openSheet(d.card); return; }
    if (await act({ type: 'playDev', card: d.card })) closeSheet();
  },
  async plentyGo() {
    const r = S.form.plenty.res;
    const list = E.RES.flatMap((k) => Array(r[k]).fill(k));
    if (list.length === 2 && await act({ type: 'playDev', card: 'plenty', res: list[0], res2: list[1] })) closeSheet();
  },
  monoPick(d) { S.form.mono.r = d.r; renderSheet(); },
  async monoGo() { if (await act({ type: 'playDev', card: 'monopoly', res: S.form.mono.r })) closeSheet(); },
  async discardGo() { if (await act({ type: 'discard', res: S.form.discard.res })) closeSheet(); },
  async steal(d) { if (await act({ type: 'steal', target: +d.p })) closeSheet(); },
  rematch() { act({ type: 'rematch' }); },
  showEnd() { S.endHidden = false; render(); },
  hideEnd() { S.endHidden = true; render(); },
  exitToHome() {
    const code = S.room;
    showHome(null);
    if (code) homeErr('');
  },
  wake() {
    S.wake = !S.wake;
    localStorage.setItem('hexaterra.wake', S.wake ? '1' : '0');
    if (S.wake) keepAwake(); else if (S.wakeLock) { S.wakeLock.release().catch(() => {}); S.wakeLock = null; }
    renderSheet();
  },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-do]');
  if (!t || t.disabled) return;
  const fn = H[t.dataset.do];
  if (!fn) return;
  e.preventDefault();
  fn(t.dataset, t);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.sheet) closeSheet();
  if (e.key === 'Enter' && document.activeElement && ['nameInput', 'codeInput'].includes(document.activeElement.id)) {
    if ($('#codeInput').value.trim()) H.join(); else H.create();
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.room) { poll(); keepAwake(); }
});
$('#codeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
});

// ------------------------------------------------------------ arranque
function init() {
  installSprites();
  board = new BoardView($('#board'), onBoardTap);
  S.wake = localStorage.getItem('hexaterra.wake') !== '0';
  const params = new URLSearchParams(location.search);
  const sala = (params.get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const ses = store.get(sessionStorage, SKEY);
  if (ses && ses.room && (!sala || ses.room === sala)) { resume(ses); return; }
  showHome(sala);
}
init();
