// Comprueba que acciones simultáneas de varios jugadores no se pisan (control optimista con ETag).
import { handle } from '../src/handler.js';

class SlowStore {
  constructor() { this.m = new Map(); this.conflicts = 0; }
  async pause() { await new Promise((r) => setTimeout(r, Math.random() * 15)); }
  async get(k) { await this.pause(); const r = this.m.get(k); return r ? { data: JSON.parse(r.json), etag: String(r.ver) } : null; }
  async create(k, d) { await this.pause(); if (this.m.has(k)) return false; this.m.set(k, { json: JSON.stringify(d), ver: 1 }); return true; }
  async update(k, d, etag) {
    await this.pause();
    const r = this.m.get(k);
    if (!r || String(r.ver) !== etag) { this.conflicts++; return false; }
    this.m.set(k, { json: JSON.stringify(d), ver: r.ver + 1 }); return true;
  }
}
const store = new SlowStore();
const call = (route, body, token, method = 'POST', query) => handle(store, { method, route, body, token, query });
const host = await call('create', { name: 'Host' });
const room = host.body.room;
// 5 jugadores entran a la vez
const joins = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((n) => call('join', { room, name: n })));
const st = await call('state', null, host.body.token, 'GET', { room, v: 0 });
console.log('jugadores en sala:', st.body.view.players.length, '(esperado 6)');
if (st.body.view.players.length !== 6) process.exit(1);
// en otra sala, tres jugadores cambian de color a la vez a colores libres: ninguno debe perderse
const h2 = await call('create', { name: 'H2' });
const r2 = h2.body.room;
const [ja, jb] = await Promise.all(['A2', 'B2'].map((n) => call('join', { room: r2, name: n })));
const res = await Promise.all([
  call('action', { room: r2, action: { type: 'color', color: 'white' } }, h2.body.token),
  call('action', { room: r2, action: { type: 'color', color: 'green' } }, ja.body.token),
  call('action', { room: r2, action: { type: 'color', color: 'purple' } }, jb.body.token),
]);
const errs = res.filter((r) => r.status !== 200).map((r) => r.body.error);
const st2 = await call('state', null, h2.body.token, 'GET', { room: r2, v: 0 });
const colors = st2.body.view.players.map((p) => p.color);
console.log('colores:', colors.join(','), '| errores:', errs.length, '| conflictos resueltos:', store.conflicts);
if (errs.length || colors.join(',') !== 'white,green,purple') process.exit(1);
// un token inválido no puede actuar
const bad = await call('action', { room, action: { type: 'start' } }, 'nope');
console.log('token inválido ->', bad.status, bad.body.error);
// solo el anfitrión puede empezar
const notHost = await call('action', { room, action: { type: 'start' } }, joins[0].body.token);
console.log('no anfitrión ->', notHost.status, notHost.body.error);
const ok = await call('action', { room, action: { type: 'start' } }, host.body.token);
console.log('anfitrión empieza ->', ok.status, ok.body.view.phase, ok.body.view.hexes.length, 'hexágonos');
// la vista de un jugador no incluye mazo ni manos ajenas
const v = ok.body.view;
const leak = v.devDeck !== undefined || v.players.some((p, i) => i !== v.you && p.res !== undefined);
console.log('filtra información oculta:', leak);
if (leak || bad.status !== 403 || notHost.status !== 400 || ok.status !== 200) process.exit(1);
console.log('OK');
