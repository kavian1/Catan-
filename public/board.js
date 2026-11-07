// Dibujo del tablero en pixel art (SVG) + zoom con dos dedos y arrastre.
import { topology, hexCenter, HEX_DIRS, COLORS } from './engine.js';
import { renderTerrain, INK } from './pixel.js';

const SQ3 = Math.sqrt(3);
const U = 1 / 16; // tamaño de píxel de piezas, fichas y caminos
const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;
const f = (n) => Math.round(n * 1000) / 1000;
const snap = (v) => Math.round(v / U) * U;
const pips = (n) => 6 - Math.abs(7 - n);

export class BoardView {
  constructor(svg, onTap) {
    this.svg = svg;
    this.world = svg.querySelector('#world');
    this.world.innerHTML = '<g class="terrain"></g><g class="lights"></g><g class="dyn"></g>';
    this.terrainG = this.world.querySelector('.terrain');
    this.lightG = this.world.querySelector('.lights');
    this.dynG = this.world.querySelector('.dyn');
    // gradientes de luz y viñeta (la viñeta va fuera del mundo: no se mueve con el zoom)
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `
      <radialGradient id="lg-warm"><stop offset="0" stop-color="#ffc77a" stop-opacity=".55"/><stop offset=".45" stop-color="#ff9a4f" stop-opacity=".2"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
      <radialGradient id="lg-isle"><stop offset="0" stop-color="#ffe2b8" stop-opacity=".16"/><stop offset=".7" stop-color="#ffb37a" stop-opacity=".05"/><stop offset="1" stop-color="#ffb37a" stop-opacity="0"/></radialGradient>
      <radialGradient id="lg-dark"><stop offset="0" stop-color="#12002a" stop-opacity=".6"/><stop offset="1" stop-color="#12002a" stop-opacity="0"/></radialGradient>
      <radialGradient id="lg-vig" cx=".5" cy=".5" r=".72"><stop offset=".55" stop-color="#03040f" stop-opacity="0"/><stop offset="1" stop-color="#03040f" stop-opacity=".78"/></radialGradient>`;
    svg.insertBefore(defs, this.world);
    this.vignette = document.createElementNS(ns, 'rect');
    this.vignette.setAttribute('fill', 'url(#lg-vig)');
    this.vignette.setAttribute('class', 'vignette');
    svg.appendChild(this.vignette);
    this.onTap = onTap;
    this.s = 1; this.tx = 0; this.ty = 0;
    this.layoutKey = null;
    this.terrainKey = null;
    this.ptrs = new Map();
    this.bindGestures();
  }

  // ------------------------------------------------------------ gestos
  toUser(x, y) {
    const pt = this.svg.createSVGPoint();
    pt.x = x; pt.y = y;
    return pt.matrixTransform(this.svg.getScreenCTM().inverse());
  }
  applyTransform() {
    const vb = this.vb;
    if (this.s <= 1.001) { this.s = 1; this.tx = 0; this.ty = 0; }
    else if (vb) {
      // el centro de la vista nunca puede salir del tablero
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
      this.tx = Math.min(cx - vb.x * this.s, Math.max(cx - (vb.x + vb.w) * this.s, this.tx));
      this.ty = Math.min(cy - vb.y * this.s, Math.max(cy - (vb.y + vb.h) * this.s, this.ty));
    }
    this.world.setAttribute('transform', `translate(${f(this.tx)} ${f(this.ty)}) scale(${f(this.s)})`);
  }
  zoomAt(u, s1) {
    s1 = Math.max(1, Math.min(4, s1));
    const wx = (u.x - this.tx) / this.s, wy = (u.y - this.ty) / this.s;
    this.s = s1;
    this.tx = u.x - wx * s1;
    this.ty = u.y - wy * s1;
    this.applyTransform();
  }
  resetZoom() { this.s = 1; this.tx = 0; this.ty = 0; this.applyTransform(); }

  bindGestures() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { svg.setPointerCapture(e.pointerId); } catch { /* */ }
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ptrs.size === 1) {
        this.drag = { x: e.clientX, y: e.clientY, u: this.toUser(e.clientX, e.clientY), tx: this.tx, ty: this.ty };
        this.moved = false;
        this.downTarget = e.target;
      } else if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()];
        this.pinch = {
          d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          m: this.toUser((a.x + b.x) / 2, (a.y + b.y) / 2),
          s: this.s, tx: this.tx, ty: this.ty,
        };
        this.moved = true;
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.ptrs.size >= 2 && this.pinch) {
        const [a, b] = [...this.ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const m = this.toUser((a.x + b.x) / 2, (a.y + b.y) / 2);
        const p = this.pinch;
        const s1 = Math.max(1, Math.min(4, (p.s * d) / p.d));
        const wx = (p.m.x - p.tx) / p.s, wy = (p.m.y - p.ty) / p.s;
        this.s = s1;
        this.tx = m.x - wx * s1;
        this.ty = m.y - wy * s1;
        this.applyTransform();
      } else if (this.ptrs.size === 1 && this.drag) {
        if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 8) this.moved = true;
        if (this.moved && this.s > 1.001) {
          const u = this.toUser(e.clientX, e.clientY);
          this.tx = this.drag.tx + (u.x - this.drag.u.x);
          this.ty = this.drag.ty + (u.y - this.drag.u.y);
          this.applyTransform();
        }
      }
    });
    const end = (e) => {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.delete(e.pointerId);
      if (e.type === 'pointerup' && this.ptrs.size === 0 && !this.moved && this.downTarget) {
        const t = this.downTarget.closest && this.downTarget.closest('[data-k]');
        if (t) this.onTap(t.dataset.k, +t.dataset.id);
      }
      if (this.ptrs.size < 2) this.pinch = null;
      if (this.ptrs.size === 0) { this.drag = null; this.downTarget = null; }
      else if (this.ptrs.size === 1) {
        const [p] = [...this.ptrs.values()];
        this.drag = { x: p.x, y: p.y, u: this.toUser(p.x, p.y), tx: this.tx, ty: this.ty };
      }
    };
    window.addEventListener('resize', () => this.updateVignette());
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(this.toUser(e.clientX, e.clientY), this.s * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    svg.addEventListener('dblclick', (e) => {
      e.preventDefault();
      if (this.s > 1.2) this.resetZoom();
      else this.zoomAt(this.toUser(e.clientX, e.clientY), 2);
    });
  }

  // ------------------------------------------------------------ dibujo
  layout(hexes) {
    const key = hexes.map((h) => h.q + ',' + h.r).join(';');
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const land = new Set(hexes.map((h) => h.q + ',' + h.r));
    const water = new Map();
    for (const h of hexes) {
      for (const [dq, dr] of HEX_DIRS) {
        const k = (h.q + dq) + ',' + (h.r + dr);
        if (!land.has(k)) water.set(k, { q: h.q + dq, r: h.r + dr });
      }
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const h of water.values()) {
      const c = hexCenter(h);
      x0 = Math.min(x0, c.x - SQ3 / 2); x1 = Math.max(x1, c.x + SQ3 / 2);
      y0 = Math.min(y0, c.y - 1); y1 = Math.max(y1, c.y + 1);
    }
    const pad = -0.35; // recortamos un poco el mar para aprovechar la pantalla
    this.vb = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
    this.svg.setAttribute('viewBox', `${f(this.vb.x)} ${f(this.vb.y)} ${f(this.vb.w)} ${f(this.vb.h)}`);
    // el mar pixelado se extiende mucho más allá del tablero: así no hay cortes en pantallas altas o anchas
    const m = 6;
    this.seaBox = { x: this.vb.x - m, y: this.vb.y - m, w: this.vb.w + 2 * m, h: this.vb.h + 2 * m };
    this.isle = { x: this.vb.x + this.vb.w / 2, y: this.vb.y + this.vb.h / 2, r: Math.max(this.vb.w, this.vb.h) * 0.42 };
    this.updateVignette();
    this.resetZoom();
  }

  /** La viñeta ocupa exactamente la zona visible del SVG, sea cual sea la forma de la pantalla. */
  updateVignette() {
    const vb = this.vb;
    if (!vb) return;
    const cw = this.svg.clientWidth || 1, ch = this.svg.clientHeight || 1;
    const k = Math.min(cw / vb.w, ch / vb.h);
    const w = cw / k, h = ch / k;
    if (this.vigSize === `${w}x${h}`) return;
    this.vigSize = `${w}x${h}`;
    this.vignette.setAttribute('x', f(vb.x + vb.w / 2 - w / 2));
    this.vignette.setAttribute('y', f(vb.y + vb.h / 2 - h / 2));
    this.vignette.setAttribute('width', f(w));
    this.vignette.setAttribute('height', f(h));
  }

  render(v, ui) {
    if (!v.hexes) return;
    this.layout(v.hexes);
    this.updateVignette();
    const terr = renderTerrain(v.hexes, this.seaBox);
    const tkey = v.hexes.map((h) => h.t).join('') + this.layoutKey;
    if (tkey !== this.terrainKey) {
      this.terrainKey = tkey;
      this.terrainG.setAttribute('transform', `translate(${f(terr.x0)} ${f(terr.y0)}) scale(${terr.PX})`);
      this.terrainG.innerHTML = terr.svg;
    }
    const T = topology(v.hexes);
    const gridT = `translate(${f(terr.x0)} ${f(terr.y0)}) scale(${terr.PX})`;
    const out = [];
    const sel = ui.sel;

    // luces: un resplandor cálido sobre la isla y una antorcha por cada poblado o ciudad
    const lights = [`<circle cx="${f(this.isle.x)}" cy="${f(this.isle.y)}" r="${f(this.isle.r)}" fill="url(#lg-isle)"/>`];
    for (const [vid, b] of Object.entries(v.buildings || {})) {
      const vx = T.vertices[vid];
      lights.push(`<circle cx="${f(vx.x)}" cy="${f(vx.y)}" r="${b.t === 'c' ? 1.45 : 1.05}" fill="url(#lg-warm)"/>`);
    }
    const rc = hexCenter(v.hexes[v.robber]);
    this.lightG.innerHTML = lights.join('') + `<circle class="aura" cx="${f(rc.x)}" cy="${f(rc.y)}" r=".95" fill="url(#lg-dark)"/>`;

    // terrenos que acaban de producir
    if (ui.hotNum) {
      out.push(`<g transform="${gridT}">`);
      v.hexes.forEach((h, i) => { if (h.n === ui.hotNum && i !== v.robber) out.push(`<path class="hot" d="${terr.hexPaths[i]}"/>`); });
      out.push('</g>');
    }

    // puertos
    for (const pt of v.ports) {
      const a = T.vertices[pt.a], b = T.vertices[pt.b];
      const hc = hexCenter(v.hexes[pt.hex]);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = mx - hc.x, dy = my - hc.y, dl = Math.hypot(dx, dy);
      const px = mx + (dx / dl) * 0.55, py = my + (dy / dl) * 0.55;
      out.push(this.blocks(a.x, a.y, px, py, '#9a6438', 0.08, 5, 0.04));
      out.push(this.blocks(b.x, b.y, px, py, '#9a6438', 0.08, 5, 0.04));
      const bw = pt.t === 'any' ? 0.56 : 0.66, bh = 0.4;
      const bx = snap(px - bw / 2), by = snap(py - bh / 2);
      out.push(`<rect x="${f(bx)}" y="${f(by)}" width="${bw}" height="${bh}" class="port-badge"/>`);
      if (pt.t === 'any') {
        out.push(`<text x="${f(bx + bw / 2)}" y="${f(by + bh / 2 + 0.01)}" class="port-txt">3:1</text>`);
      } else {
        out.push(`<use href="#r-${pt.t}" x="${f(bx + 0.04)}" y="${f(by + 0.07)}" width=".26" height=".26"/>`);
        out.push(`<text x="${f(bx + 0.47)}" y="${f(by + bh / 2 + 0.01)}" class="port-txt">2:1</text>`);
      }
    }

    // fichas de número
    v.hexes.forEach((h, i) => {
      if (!h.n) return;
      const c = hexCenter(h);
      const red = h.n === 6 || h.n === 8;
      const s = 11 * U;
      const x = snap(c.x - s / 2), y = snap(c.y - s / 2);
      out.push(`<g class="token${i === v.robber ? ' dim' : ''}"><use href="#px-token" x="${f(x)}" y="${f(y)}" width="${s}" height="${s}"/>`);
      out.push(`<text x="${f(x + s / 2)}" y="${f(y + s / 2 - 0.05)}" class="num${red ? ' red' : ''}">${h.n}</text>`);
      const k = pips(h.n);
      for (let j = 0; j < k; j++) {
        out.push(`<rect x="${f(x + s / 2 + (j - (k - 1) / 2) * 0.085 - 0.03)}" y="${f(y + s - 0.2)}" width=".06" height=".06" class="pip${red ? ' red' : ''}"/>`);
      }
      out.push('</g>');
    });

    // caminos
    for (const [e, o] of Object.entries(v.roads || {})) {
      const ed = T.edges[e];
      out.push(this.roadSvg(T.vertices[ed.a], T.vertices[ed.b], colorHex(v.players[o].color), ''));
    }
    if (ui.mode === 'road' && sel != null) {
      const ed = T.edges[sel];
      out.push(this.roadSvg(T.vertices[ed.a], T.vertices[ed.b], colorHex(v.players[ui.me].color), ' ghost'));
    }

    // edificios
    for (const [vid, b] of Object.entries(v.buildings || {})) {
      const ghostCity = ui.mode === 'city' && sel === +vid;
      out.push(this.buildingSvg(T.vertices[vid], ghostCity ? 'c' : b.t, colorHex(v.players[b.p].color), ghostCity ? ' ghost' : ''));
    }
    if (ui.mode === 'settlement' && sel != null) {
      out.push(this.buildingSvg(T.vertices[sel], 's', colorHex(v.players[ui.me].color), ' ghost'));
    }

    // bandido
    {
      const rh = ui.mode === 'robber' && sel != null ? sel : v.robber;
      const h = v.hexes[rh];
      const c = hexCenter(h);
      const w = 10 * U * 0.85, hh = 12 * U * 0.85;
      const ox = h.n ? -0.52 : 0;
      out.push(`<use href="#px-robber" x="${f(snap(c.x + ox - w / 2))}" y="${f(snap(c.y - hh / 2))}" width="${f(w)}" height="${f(hh)}" class="robber${rh !== v.robber ? ' ghost' : ''}"/>`);
    }

    // objetivos tocables
    const targets = ui.targets || [];
    if (ui.mode === 'robber') {
      out.push(`<g transform="${gridT}">`);
      for (const hi of targets) out.push(`<path class="tgt-hex${sel === hi ? ' on' : ''}" d="${terr.hexPaths[hi]}" data-k="h" data-id="${hi}"/>`);
      out.push('</g>');
    } else if (ui.mode === 'road') {
      for (const e of targets) {
        const ed = T.edges[e];
        const a = T.vertices[ed.a], b = T.vertices[ed.b];
        if (sel !== e) {
          for (const t of [0.3, 0.5, 0.7]) {
            const x = snap(a.x + (b.x - a.x) * t), y = snap(a.y + (b.y - a.y) * t);
            out.push(`<rect x="${f(x - 0.06)}" y="${f(y - 0.06)}" width=".12" height=".12" class="tgt-e"/>`);
          }
        }
        const ax = a.x + (b.x - a.x) * 0.2, ay = a.y + (b.y - a.y) * 0.2, bx = b.x - (b.x - a.x) * 0.2, by = b.y - (b.y - a.y) * 0.2;
        out.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" class="hit-edge" data-k="e" data-id="${e}"/>`);
      }
    } else if (ui.mode === 'settlement' || ui.mode === 'city') {
      for (const vid of targets) {
        const vx = T.vertices[vid];
        if (sel !== vid) out.push(`<rect x="${f(snap(vx.x) - 0.1)}" y="${f(snap(vx.y) - 0.1)}" width=".2" height=".2" class="tgt-v"/>`);
        out.push(`<circle cx="${f(vx.x)}" cy="${f(vx.y)}" r=".34" class="hit" data-k="v" data-id="${vid}"/>`);
      }
    }

    this.dynG.innerHTML = out.join('');
  }

  /** Línea de bloques cuadrados (efecto de escalones de píxel). */
  blocks(x1, y1, x2, y2, color, size, n, outline) {
    let o = '', i = '';
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1);
      const x = snap(x1 + (x2 - x1) * t), y = snap(y1 + (y2 - y1) * t);
      if (outline) o += `<rect x="${f(x - size / 2 - outline)}" y="${f(y - size / 2 - outline)}" width="${f(size + 2 * outline)}" height="${f(size + 2 * outline)}"/>`;
      i += `<rect x="${f(x - size / 2)}" y="${f(y - size / 2)}" width="${size}" height="${size}"/>`;
    }
    return `<g fill="${INK}">${o}</g><g fill="${color}">${i}</g>`;
  }

  roadSvg(a, b, color, cls) {
    const ax = a.x + (b.x - a.x) * 0.17, ay = a.y + (b.y - a.y) * 0.17;
    const bx = b.x - (b.x - a.x) * 0.17, by = b.y - (b.y - a.y) * 0.17;
    return `<g class="road${cls}">${this.blocks(ax, ay, bx, by, color, 0.13, 8, 0.045)}</g>`;
  }

  buildingSvg(vx, t, color, cls) {
    const w = t === 'c' ? 12 * U : 9 * U, h = t === 'c' ? 10 * U : 8 * U;
    const x = snap(vx.x - w / 2), y = snap(vx.y - h * 0.6);
    return `<use href="#${t === 'c' ? 'i-city' : 'i-house'}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" color="${color}" class="bld${cls}"/>`;
  }
}
