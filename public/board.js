// Dibujo del tablero en SVG + zoom con dos dedos y arrastre.
import { topology, hexCenter, HEX_DIRS, COLORS } from './engine.js';

const SQ3 = Math.sqrt(3);
const colorHex = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).hex;
const f = (n) => Math.round(n * 1000) / 1000;

function hexPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`);
  }
  return pts.join(' ');
}

const pips = (n) => 6 - Math.abs(7 - n);
const SETTLEMENT = 'M-.25,.2 L-.25,-.07 L0,-.31 L.25,-.07 L.25,.2 Z';
const CITY = 'M-.38,.23 L-.38,-.04 L-.04,-.04 L-.04,-.23 L.17,-.42 L.38,-.23 L.38,.23 Z';

export class BoardView {
  constructor(svg, onTap) {
    this.svg = svg;
    this.world = svg.querySelector('#world');
    this.onTap = onTap;
    this.s = 1; this.tx = 0; this.ty = 0;
    this.layoutKey = null;
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
    this.water = [...water.values()];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const h of this.water) {
      const c = hexCenter(h);
      x0 = Math.min(x0, c.x - SQ3 / 2); x1 = Math.max(x1, c.x + SQ3 / 2);
      y0 = Math.min(y0, c.y - 1); y1 = Math.max(y1, c.y + 1);
    }
    // recortamos un poco el mar para aprovechar la pantalla
    const pad = -0.35;
    this.vb = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
    this.svg.setAttribute('viewBox', `${f(this.vb.x)} ${f(this.vb.y)} ${f(this.vb.w)} ${f(this.vb.h)}`);
    this.resetZoom();
  }

  render(v, ui) {
    if (!v.hexes) return;
    this.layout(v.hexes);
    const T = topology(v.hexes);
    const out = [];
    const sel = ui.sel;

    // mar
    out.push('<g class="sea">');
    for (const h of this.water) {
      const c = hexCenter(h);
      out.push(`<polygon points="${hexPoints(c.x, c.y, 1.0)}" class="water"/>`);
    }
    out.push('</g>');

    // puertos
    out.push('<g class="ports">');
    for (const pt of v.ports) {
      const a = T.vertices[pt.a], b = T.vertices[pt.b];
      const hc = hexCenter(v.hexes[pt.hex]);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = mx - hc.x, dy = my - hc.y, dl = Math.hypot(dx, dy);
      const px = mx + (dx / dl) * 0.52, py = my + (dy / dl) * 0.52;
      out.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(px)}" y2="${f(py)}" class="pier"/>`);
      out.push(`<line x1="${f(b.x)}" y1="${f(b.y)}" x2="${f(px)}" y2="${f(py)}" class="pier"/>`);
      out.push(`<circle cx="${f(px)}" cy="${f(py)}" r=".3" class="port ${pt.t}"/>`);
      if (pt.t === 'any') {
        out.push(`<text x="${f(px)}" y="${f(py + 0.01)}" class="port-txt">3:1</text>`);
      } else {
        out.push(`<use href="#r-${pt.t}" x="${f(px - 0.16)}" y="${f(py - 0.25)}" width=".32" height=".32"/>`);
        out.push(`<text x="${f(px)}" y="${f(py + 0.17)}" class="port-txt small">2:1</text>`);
      }
    }
    out.push('</g>');

    // costa (arena bajo las fichas) y terrenos
    out.push('<g class="shore">');
    v.hexes.forEach((h) => { const c = hexCenter(h); out.push(`<polygon points="${hexPoints(c.x, c.y, 1.07)}"/>`); });
    out.push('</g>');

    const DECO = [[0, -0.58], [-0.53, 0.33], [0.53, 0.33]];
    v.hexes.forEach((h, i) => {
      const c = hexCenter(h);
      const hot = ui.hotNum && h.n === ui.hotNum && i !== v.robber;
      out.push(`<polygon points="${hexPoints(c.x, c.y, 0.95)}" fill="url(#g-${h.t})" class="land${hot ? ' hot' : ''}"/>`);
      const sz = h.t === 'desert' ? 0.42 : 0.38;
      for (const [dx, dy] of DECO) {
        out.push(`<use href="#r-${h.t}" x="${f(c.x + dx - sz / 2)}" y="${f(c.y + dy - sz / 2)}" width="${sz}" height="${sz}" class="deco"/>`);
      }
      if (h.n) {
        const red = h.n === 6 || h.n === 8;
        const dim = i === v.robber ? ' dim' : '';
        out.push(`<g class="token${dim}"><circle cx="${f(c.x)}" cy="${f(c.y)}" r=".31"/>`);
        out.push(`<text x="${f(c.x)}" y="${f(c.y - 0.03)}" class="num${red ? ' red' : ''}">${h.n}</text>`);
        const k = pips(h.n);
        for (let j = 0; j < k; j++) {
          out.push(`<circle cx="${f(c.x + (j - (k - 1) / 2) * 0.065)}" cy="${f(c.y + 0.17)}" r=".022" class="pip${red ? ' red' : ''}"/>`);
        }
        out.push('</g>');
      }
    });

    // caminos
    out.push('<g class="roads">');
    for (const [e, o] of Object.entries(v.roads || {})) {
      const ed = T.edges[e];
      out.push(this.roadSvg(T.vertices[ed.a], T.vertices[ed.b], colorHex(v.players[o].color), ''));
    }
    if (ui.mode === 'road' && sel != null) {
      const ed = T.edges[sel];
      out.push(this.roadSvg(T.vertices[ed.a], T.vertices[ed.b], colorHex(v.players[ui.me].color), ' ghost'));
    }
    out.push('</g>');

    // edificios
    out.push('<g class="buildings">');
    for (const [vid, b] of Object.entries(v.buildings || {})) {
      const vx = T.vertices[vid];
      const ghostCity = ui.mode === 'city' && sel === +vid;
      out.push(this.buildingSvg(vx, ghostCity ? 'c' : b.t, colorHex(v.players[b.p].color), ghostCity ? ' ghost' : ''));
    }
    if (ui.mode === 'settlement' && sel != null) {
      out.push(this.buildingSvg(T.vertices[sel], 's', colorHex(v.players[ui.me].color), ' ghost'));
    }
    out.push('</g>');

    // bandido
    {
      const robberHex = ui.mode === 'robber' && sel != null ? sel : v.robber;
      const h = v.hexes[robberHex];
      const c = hexCenter(h);
      const ox = h.n ? -0.47 : 0;
      out.push(`<use href="#robber" x="${f(c.x + ox - 0.26)}" y="${f(c.y - 0.3)}" width=".52" height=".52" class="robber${robberHex !== v.robber ? ' ghost' : ''}"/>`);
    }

    // objetivos tocables
    const targets = ui.targets || [];
    out.push('<g class="targets">');
    if (ui.mode === 'road') {
      for (const e of targets) {
        const ed = T.edges[e];
        const a = T.vertices[ed.a], b = T.vertices[ed.b];
        const ax = a.x + (b.x - a.x) * 0.2, ay = a.y + (b.y - a.y) * 0.2, bx = b.x - (b.x - a.x) * 0.2, by = b.y - (b.y - a.y) * 0.2;
        if (sel !== e) {
          out.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" class="tgt-edge-bg"/>`);
          out.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" class="tgt-edge"/>`);
        }
        out.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" class="hit-edge" data-k="e" data-id="${e}"/>`);
      }
    } else if (ui.mode === 'settlement' || ui.mode === 'city') {
      for (const vid of targets) {
        const vx = T.vertices[vid];
        if (sel !== vid) out.push(`<circle cx="${f(vx.x)}" cy="${f(vx.y)}" r=".13" class="tgt-vert"/>`);
        out.push(`<circle cx="${f(vx.x)}" cy="${f(vx.y)}" r=".34" class="hit" data-k="v" data-id="${vid}"/>`);
      }
    } else if (ui.mode === 'robber') {
      for (const hi of targets) {
        const c = hexCenter(v.hexes[hi]);
        out.push(`<polygon points="${hexPoints(c.x, c.y, 0.86)}" class="tgt-hex${sel === hi ? ' on' : ''}" data-k="h" data-id="${hi}"/>`);
      }
    }
    out.push('</g>');

    this.world.innerHTML = out.join('');
  }

  roadSvg(a, b, color, cls) {
    const ax = a.x + (b.x - a.x) * 0.16, ay = a.y + (b.y - a.y) * 0.16;
    const bx = b.x - (b.x - a.x) * 0.16, by = b.y - (b.y - a.y) * 0.16;
    return `<g class="road${cls}"><line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" class="road-out"/>` +
      `<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" stroke="${color}" class="road-in"/></g>`;
  }

  buildingSvg(vx, t, color, cls) {
    return `<g transform="translate(${f(vx.x)} ${f(vx.y)})" class="bld${cls}"><path d="${t === 'c' ? CITY : SETTLEMENT}" fill="${color}"/></g>`;
  }
}
