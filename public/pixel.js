// Arte pixel: sprites dibujados a mano como rejillas de caracteres y el terreno del tablero
// pintado sobre una rejilla de píxeles real (cada casilla pertenece al hexágono más cercano).
import { hexCenter } from './engine.js';

export const INK = '#2d1b4e';
const SQ3 = Math.sqrt(3);

// Paleta pastel viva
const C = {
  green: '#3fdc84', green2: '#1fae64', green3: '#a6f7c8',
  trunk: '#c9783f', trunk2: '#8a4a22',
  coral: '#ff7a59', coral2: '#e0532f', coral3: '#ffc0a8',
  white: '#ffffff', wool2: '#e3dbff', face: '#4a3b6b',
  lemon: '#ffd84d', lemon2: '#f0a92c', stem: '#7bd66f',
  rock: '#a9b2ff', rock2: '#7b84e0',
  cactus: '#4fd88a', cactus2: '#22a865', sand: '#ffd9a0',
  plum: '#4b3a75', plum2: '#36285c', pink: '#ff6fae', pink2: '#e04a8c',
  mint: '#3fe0b5', cream: '#fff6e0', paper: '#fff3d6',
  steel: '#d6d9ff', steel2: '#9aa0e8', orange: '#ffb36b', orange2: '#e0873c',
  violet: '#a66bff', violet2: '#7f45e0', red: '#ff5d7a', sky: '#6fd6ff',
};
const SHADE = 'rgba(30,10,60,.22)';

// ------------------------------------------------------------------ sprites
// '.' = transparente, 'k' = contorno. 'P' = color del jugador (currentColor), 'p' = color del jugador sombreado.
const SPRITES = {
  'r-wood': {
    pal: { G: C.green, g: C.green2, h: C.green3, b: C.trunk, B: C.trunk2 },
    rows: [
      '...kkkkkk...',
      '..kGGhhGGk..',
      '.kGGhGGGGGk.',
      'kGGGGGGGGgGk',
      'kGhGGGGGGGgk',
      'kGGGGGGGgGgk',
      'kGGGGGGGGggk',
      '.kGgGGGGggk.',
      '..kkggggkk..',
      '....kbBk....',
      '....kbBk....',
      '...kkkkkk...',
    ],
  },
  'r-brick': {
    pal: { h: C.coral3, O: C.coral, o: C.coral2 },
    rows: [
      '............',
      '...kkkkkk...',
      '...khOOOk...',
      '...kOOOok...',
      '...kooook...',
      'kkkkkkkkkkkk',
      'khOOOkkhOOOk',
      'kOOOokkOOOok',
      'kooookkooook',
      'kkkkkkkkkkkk',
      '............',
    ],
  },
  'r-sheep': {
    pal: { W: C.white, w: C.wool2, F: C.face, e: C.white },
    rows: [
      '............',
      '..kk.kk.....',
      '.kWWkWWkkkk.',
      'kWWWWWWkFFFk',
      'kWWWWWWkFeFk',
      'kWWWWWWWkFFk',
      'kWWWWWWWWkk.',
      '.kwwwwwwwk..',
      '..kFkkkFk...',
      '..kFk.kFk...',
      '..kk..kk....',
    ],
  },
  'r-wheat': {
    pal: { Y: C.lemon, y: C.lemon2, G: C.stem },
    rows: [
      '.....kk.....',
      '....kYYk....',
      '..kkkYYkkk..',
      '.kYYkYYkYYk.',
      '.kyYkYYkYyk.',
      '..kkkYYkkk..',
      '.kYYkYYkYYk.',
      '.kyYkYYkYyk.',
      '..kkkGGkkk..',
      '.....kGk....',
      '....kGk.....',
      '....kk......',
    ],
  },
  'r-ore': {
    pal: { S: C.white, L: C.rock, M: C.rock2 },
    rows: [
      '.....kk.....',
      '....kSSk....',
      '...kSSSSk...',
      '...kSLSLk...',
      '..kLLLLLMk..',
      '..kLLLLMMk..',
      '.kLLLLLLMMk.',
      '.kLLLLLMMMk.',
      'kLLLLLLLMMMk',
      'kkkkkkkkkkkk',
    ],
  },
  'r-desert': {
    pal: { C: C.cactus, c: C.cactus2, D: C.sand },
    rows: [
      '.....kk.....',
      '....kCCk....',
      '.kk.kCck....',
      'kCCkkCck....',
      'kCckkCck.kk.',
      'kCCCCCckkCCk',
      '.kkkkCCCCCk.',
      '....kCCkkk..',
      '....kCck....',
      '....kCck....',
      '..kkDDDDkk..',
      '.kDDDDDDDDk.',
    ],
  },
  'px-robber': {
    pal: { R: C.plum, r: C.plum2, e: C.pink },
    rows: [
      '...kkkk...',
      '..kRRRRk..',
      '.kRRRRRRk.',
      '.kReRReRk.',
      '.kRRRRRRk.',
      '..kRRRRk..',
      '.kRRRRRRk.',
      'kRRRRRRRRk',
      'kRrRRRRrRk',
      'kRRRRRRRRk',
      'kRRrrrrRRk',
      'kkkkkkkkkk',
    ],
  },
  'i-house': {
    pal: { W: '#fff8e0' },
    rows: [
      '....k....',
      '...kPk...',
      '..kPPPk..',
      '.kPPPPPk.',
      'kPPPPPPPk',
      '.kPWPPPk.',
      '.kPWPPpk.',
      '.kkkkkkk.',
    ],
  },
  'i-city': {
    pal: { W: '#fff8e0' },
    rows: [
      '........k...',
      '.......kPk..',
      '......kPPPk.',
      'kkkkkkPPPPPk',
      'kPPPkkPWPWPk',
      'kPWPkkPPPPPk',
      'kPWPkkPWPWPk',
      'kPPPkkPWPWPk',
      'kPPpkkPPPPpk',
      'kkkkkkkkkkkk',
    ],
  },
  'px-token': {
    pal: { T: '#f3e2bf', t: '#d9c08f' },
    rows: [
      '...kkkkk...',
      '.kkTTTTTkk.',
      '.kTTTTTTTk.',
      'kTTTTTTTTTk',
      'kTTTTTTTTTk',
      'kTTTTTTTTTk',
      'kTTTTTTTTTk',
      'kTTTTTTTTTk',
      '.kttTTTTtk.',
      '.kkttttttk.',
      '...kkkkk...',
    ],
  },
  'i-dice': {
    pal: { W: C.white, w: C.wool2, d: INK },
    rows: [
      '.kkkkkkkkkk.',
      'kWWWWWWWWWWk',
      'kWddWWWWddWk',
      'kWddWWWWddWk',
      'kWWWWWWWWWWk',
      'kWWWWddWWWWk',
      'kWWWWddWWWWk',
      'kWWWWWWWWWWk',
      'kWddWWWWddWk',
      'kWddWWWWddWk',
      'kwwwwwwwwwwk',
      '.kkkkkkkkkk.',
    ],
  },
  'i-hammer': {
    pal: { G: C.steel, g: C.steel2, b: C.orange, B: C.orange2 },
    rows: [
      '............',
      '.kkkkkkkkk..',
      '.kGGGGGGGk..',
      '.kgggGGGGk..',
      '.kkkkbbkkk..',
      '....kbbk....',
      '....kbbk....',
      '....kbbk....',
      '....kbBk....',
      '....kbBk....',
      '....kkkk....',
      '............',
    ],
  },
  'i-trade': {
    pal: { M: C.mint, N: C.pink },
    rows: [
      '........k...',
      'kkkkkkkkMk..',
      'kMMMMMMMMMk.',
      'kkkkkkkkMk..',
      '........k...',
      '............',
      '...k........',
      '..kNkkkkkkkk',
      '.kNNNNNNNNNk',
      '..kNkkkkkkkk',
      '...k........',
    ],
  },
  'i-cards': {
    pal: { W: C.paper, C: '#ffe9a8' },
    rows: [
      'kkkkkkk.....',
      'kWWWWWk.....',
      'kWWkkkkkkk..',
      'kWWkCCCCCk..',
      'kWWkCCCCCk..',
      'kWWkCCCCCk..',
      'kWWkCCCCCk..',
      'kkkkCCCCCk..',
      '...kCCCCCk..',
      '...kCCCCCk..',
      '...kkkkkkk..',
    ],
  },
  'i-dev': {
    pal: { V: C.violet, v: C.violet2, Y: C.lemon },
    rows: [
      'kkkkkkkkkk',
      'kVVVVVVVVk',
      'kVVVVVVVVk',
      'kVVVYYVVVk',
      'kVVYYYYVVk',
      'kVYYYYYYVk',
      'kVVYYYYVVk',
      'kVVYVVYVVk',
      'kVVVVVVVVk',
      'kVVVVVVVVk',
      'kvvvvvvvvk',
      'kkkkkkkkkk',
    ],
  },
  'i-star': {
    pal: { Y: C.lemon },
    rows: [
      '....k....',
      '...kYk...',
      'kkkkYkkkk',
      'kYYYYYYYk',
      '.kYYYYYk.',
      '..kYYYk..',
      '.kYYkYYk.',
      '.kYk.kYk.',
      '.kk...kk.',
    ],
  },
  'i-knight': {
    pal: { R: C.red, W: C.paper },
    rows: [
      'kkkkkkkkkk',
      'kRRRRRRRRk',
      'kRRRWWRRRk',
      'kRRRWWRRRk',
      'kRWWWWWWRk',
      'kRWWWWWWRk',
      'kRRRWWRRRk',
      '.kRRWWRRk.',
      '..kRRRRk..',
      '...kRRk...',
      '....kk....',
    ],
  },
  'i-road': {
    pal: { B: '#d9a473', Y: C.paper },
    rows: [
      '..kkkkkk..',
      '..kBBBBk..',
      '..kBYYBk..',
      '.kBBBBBBk.',
      '.kBBYYBBk.',
      '.kBBBBBBk.',
      'kBBBBBBBBk',
      'kBBBYYBBBk',
      'kBBBBBBBBk',
      'kkkkkkkkkk',
    ],
  },
  'i-monopoly': {
    pal: { Y: C.lemon, R: C.pink, O: C.lemon2 },
    rows: [
      '.k...kk...k.',
      'kYk.kYYk.kYk',
      'kYYkYYYYkYYk',
      'kYYYYYYYYYYk',
      'kYYRYYYYRYYk',
      'kYYYYYYYYYYk',
      'kkkkkkkkkkkk',
      'kOOOOOOOOOOk',
      'kkkkkkkkkkkk',
    ],
  },
  'i-plenty': {
    pal: { G: C.mint, Y: C.lemon, B: C.orange, b: C.orange2 },
    rows: [
      '...kk..kk...',
      '..kGGkkYYk..',
      '..kGGkkYYk..',
      '.kkkkkkkkkk.',
      'kBBBBBBBBBBk',
      'kBbBbBbBbBBk',
      '.kBBBBBBBBk.',
      '.kBbBbBbBBk.',
      '..kBBBBBBk..',
      '..kkkkkkkk..',
    ],
  },
  'i-next': {
    pal: { W: C.white },
    rows: [
      'kk....kk....',
      'kWk...kWk...',
      'kWWk..kWWk..',
      'kWWWk.kWWWk.',
      'kWWWWkkWWWWk',
      'kWWWk.kWWWk.',
      'kWWk..kWWk..',
      'kWk...kWk...',
      'kk....kk....',
    ],
  },
  'i-scroll': {
    pal: { W: C.paper },
    rows: [
      'kkkkkkkkkk',
      'kWWWWWWWWk',
      'kWkkkkkkWk',
      'kWWWWWWWWk',
      'kWkkkkkWWk',
      'kWWWWWWWWk',
      'kWkkkkkkWk',
      'kWWWWWWWWk',
      'kWkkkkWWWk',
      'kWWWWWWWWk',
      'kkkkkkkkkk',
    ],
  },
  'i-zoom': {
    pal: { W: C.white },
    rows: [
      'kkkk..kkkk',
      'kWWk..kWWk',
      'kWk....kWk',
      'kk......kk',
      '..........',
      '..........',
      'kk......kk',
      'kWk....kWk',
      'kWWk..kWWk',
      'kkkk..kkkk',
    ],
  },
  'i-menu': {
    pal: { W: C.white },
    rows: [
      'kkkkkkkkkk',
      'kWWWWWWWWk',
      'kkkkkkkkkk',
      '..........',
      'kkkkkkkkkk',
      'kWWWWWWWWk',
      'kkkkkkkkkk',
      '..........',
      'kkkkkkkkkk',
      'kWWWWWWWWk',
      'kkkkkkkkkk',
    ],
  },
  'i-trophy': {
    pal: { Y: C.lemon, O: C.lemon2, W: C.white },
    rows: [
      '.kkkkkkkkkk.',
      'kkYWYYYYYYkk',
      'kYkWYYYYYkYk',
      'kYkYYYYYYkYk',
      '.kkYYYYYYkk.',
      '...kYYYYk...',
      '....kYYk....',
      '.....kk.....',
      '....kYYk....',
      '...kOOOOk...',
      '..kOOOOOOk..',
      '..kkkkkkkk..',
    ],
  },
  'i-hourglass': {
    pal: { Y: C.lemon, W: C.paper },
    rows: [
      'kkkkkkkk',
      'kYYYYYYk',
      '.kYYYYk.',
      '..kYYk..',
      '...kk...',
      '..kWWk..',
      '.kWWYWk.',
      'kWYYYYWk',
      'kkkkkkkk',
    ],
  },
  'i-help': {
    pal: { W: C.white },
    rows: [
      '.kkkkkk.',
      'kWWWWWWk',
      'kWkkkkWk',
      'kkk.kWWk',
      '...kWWk.',
      '...kWk..',
      '...kkk..',
      '...kWk..',
      '...kkk..',
    ],
  },
};

function spriteBody(def) {
  const rows = def.rows;
  const W = Math.max(...rows.map((r) => r.length));
  const pal = { k: INK, P: 'currentColor', p: ['currentColor', SHADE], ...def.pal };
  const byFill = new Map();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < W) {
      const c = row[x] || '.';
      let x2 = x + 1;
      while (x2 < W && (row[x2] || '.') === c) x2++;
      if (c !== '.' && pal[c]) {
        for (const fill of [].concat(pal[c])) {
          if (!byFill.has(fill)) byFill.set(fill, '');
          byFill.set(fill, byFill.get(fill) + `M${x} ${y}h${x2 - x}v1h${x - x2}z`);
        }
      }
      x = x2;
    }
  });
  // las sombras translúcidas van encima de su color base
  const entries = [...byFill.entries()].sort((a, b) => (a[0].startsWith('rgba') ? 1 : 0) - (b[0].startsWith('rgba') ? 1 : 0));
  return { W, H: rows.length, body: entries.map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('') };
}

/** Inserta todos los sprites como <symbol> en el documento (una vez). */
export function installSprites() {
  if (document.getElementById('px-sprites')) return;
  const parts = Object.entries(SPRITES).map(([id, def]) => {
    const { W, H, body } = spriteBody(def);
    return `<symbol id="${id}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${body}</symbol>`;
  });
  const holder = document.createElement('div');
  holder.innerHTML = `<svg id="px-sprites" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>${parts.join('')}</defs></svg>`;
  document.body.prepend(holder.firstChild);
}

export function spriteSize(id) {
  const d = SPRITES[id];
  return { w: Math.max(...d.rows.map((r) => r.length)), h: d.rows.length };
}

/** SVG independiente de un sprite (para el icono de la app). */
export function spriteSvg(id, bg) {
  const { W, H, body } = spriteBody(SPRITES[id]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${W + 4} ${H + 4}" shape-rendering="crispEdges">${bg ? `<rect x="-2" y="-2" width="${W + 4}" height="${H + 4}" fill="${bg}"/>` : ''}${body}</svg>`;
}

// ------------------------------------------------------------------ terreno
// Estilo nocturno: mar profundo con destellos, isla con acantilados de piedra y bordes que brillan.
export const TERRAIN = {
  wood: { base: '#2f9a58', dark: '#237f49', light: '#46b86c', hi: '#6fd88f', lo: '#165c35' },
  brick: { base: '#cf6448', dark: '#a8472f', light: '#ec8b6a', hi: '#f6a787', lo: '#80331f' },
  sheep: { base: '#7cc55a', dark: '#5fa646', light: '#9fdc7a', hi: '#c0ee9c', lo: '#447e2f' },
  wheat: { base: '#e2ad3f', dark: '#c38e29', light: '#f4cf68', hi: '#fbe39a', lo: '#91661a' },
  ore: { base: '#8489b6', dark: '#6a6f9b', light: '#a5abd8', hi: '#c6cbf0', lo: '#4c5079' },
  desert: { base: '#e3a07c', dark: '#cf8a66', light: '#f0bc9b', hi: '#f8d6bf', lo: '#a3634a' },
};
export const WATER = { base: '#0e1742', deep: '#070b26', wave: '#18286a', glow: '#58e3ff', soft: '#1d3c8c', spark: '#a6fbff', spark2: '#3f63c9' };
// Cara del acantilado: borde superior brillante y piedra cada vez más oscura.
const CLIFF = { rim: '#8ea0ff', stone: ['#4a5cc0', '#3b4cab', '#2f3e93'], mortar: '#232f78', shadow: '#060920' };
const CLIFF_H = 4;

// Pequeños dibujos que se estampan sobre cada terreno (en la misma rejilla gruesa).
const STAMP = {
  tree: { pal: { d: '#135a32', L: '#5fd889', t: '#6e4426' }, rows: ['..d..', '.dLd.', '.dLd.', 'dLddd', 'ddddd', '..t..'] },
  bush: { pal: { b: '#2f8a34', B: '#78d664' }, rows: ['.BB.', 'BbBb', 'bbbb'] },
  sheep: { pal: { w: '#ffffff', k: '#3a2b55' }, rows: ['.ww...', 'wwwwkk', 'wwwwkk', '.k.k..'] },
  mount: { pal: { s: '#f4f6ff', M: '#5d6194', m: '#43466f' }, rows: ['....s....', '...sss...', '..sMsMM..', '.MMMMMmm.', 'MMMMMMmmm'] },
  hill: { pal: { s: '#f4f6ff', M: '#5d6194', m: '#43466f' }, rows: ['..s..', '.sMm.', 'MMMmm'] },
  cactus: { pal: { c: '#3aa95a', C: '#26763f' }, rows: ['..c..', 'c.c.c', 'ccccc', '..c..', '..C..'] },
  shell: { pal: { s: '#fbe3d2', S: '#d99a85' }, rows: ['.s.', 'sSs'] },
  bricks: { pal: { o: '#8a3622', h: '#ffb196' }, rows: ['.hhh.', 'ooooo', 'hh.hh', 'ooooo'] },
  sheaf: { pal: { y: '#9a6a16', Y: '#fff0a8' }, rows: ['y.y.y', 'YyYyY', '.yyy.', '..y..'] },
  // fondo marino
  weed: { pal: { g: '#16756a', G: '#2bb59a' }, rows: ['.G.', 'gG.', '.gG', 'Gg.', '.g.'] },
  coral: { pal: { c: '#a53c6d', C: '#f0709e' }, rows: ['C.c.C', '.CcC.', '..c..', '.ccc.'] },
  rock: { pal: { r: '#1c2a66', R: '#30448f' }, rows: ['.RR.', 'RRrr', 'rrrr'] },
};
const STAMPS = {
  wood: [['tree', -2, -9], ['tree', -8, -4], ['tree', 4, -4], ['tree', -6, 2], ['tree', 2, 2], ['bush', -1, 6]],
  sheep: [['sheep', -6, -6], ['sheep', 1, 4], ['sheep', -8, 1], ['sheep', 2, -7], ['bush', 5, 0]],
  ore: [['mount', -4, -9], ['hill', 2, 4], ['hill', -7, 3]],
  desert: [['cactus', -6, -5], ['cactus', 3, -6], ['cactus', -1, 4], ['shell', 4, 2], ['shell', -6, 2]],
  brick: [['bricks', -2, -9], ['bricks', 4, 3]],
  wheat: [['sheaf', -2, -9], ['sheaf', -7, 3], ['sheaf', 3, 3]],
};

function noise(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 1000;
}

function texture(t, li, lj, n) {
  const T = TERRAIN[t];
  const m = n % 100;
  switch (t) {
    case 'wood': return m < 9 ? T.dark : m < 13 ? T.light : T.base;
    case 'brick': {
      const yy = lj + 300, xx = li + 300, row = Math.floor(yy / 3);
      if (yy % 3 === 0) return T.light;
      if ((xx + (row % 2) * 3) % 6 === 0) return T.light;
      return yy % 3 === 2 ? T.dark : T.base;
    }
    case 'sheep': return m < 8 ? T.dark : m < 12 ? T.light : T.base;
    case 'wheat': {
      const d = (li - lj + 400) % 4;
      return d === 0 ? T.dark : d === 2 && m < 35 ? T.light : T.base;
    }
    case 'ore': return m < 10 ? T.dark : m < 14 ? T.light : T.base;
    case 'desert': return (lj + 300 + Math.floor((li + 300) / 5)) % 5 === 0 ? T.dark : m < 6 ? T.light : T.base;
    default: return T ? T.base : WATER.base;
  }
}

const terrainCache = new Map();
/**
 * Pinta el tablero en una rejilla de píxeles de tamaño `PX` (unidades del tablero).
 * Devuelve el SVG del terreno y, por cada hexágono, el trazado de sus píxeles (para resaltarlo).
 */
export function renderTerrain(hexes, vb, PX = 0.1) {
  const key = hexes.map((h) => h.q + ',' + h.r + h.t).join(';') + '|' + [vb.x, vb.y, vb.w, vb.h].join(',');
  const hit = terrainCache.get(key);
  if (hit) return hit;
  const x0 = Math.floor(vb.x / PX) * PX, y0 = Math.floor(vb.y / PX) * PX;
  const W = Math.ceil((vb.x + vb.w - x0) / PX) + 1, H = Math.ceil((vb.y + vb.h - y0) / PX) + 1;
  const idx = new Map(hexes.map((h, i) => [h.q + ',' + h.r, i]));
  const owner = new Int16Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) * PX, y = y0 + (j + 0.5) * PX;
      // píxel -> hexágono más cercano (redondeo cúbico)
      const qf = (SQ3 / 3) * x - y / 3, rf = (2 / 3) * y, sf = -qf - rf;
      let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
      const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
      if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
      const o = idx.get(q + ',' + r);
      owner[j * W + i] = o === undefined ? -1 : o;
    }
  }
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : owner[j * W + i]);
  // distancia (en filas) desde la tierra que hay justo encima: define el acantilado
  const below = new Int8Array(W * H);
  for (let i = 0; i < W; i++) {
    let d = 99;
    for (let j = 0; j < H; j++) {
      if (owner[j * W + i] >= 0) d = 0; else d = Math.min(d + 1, 99);
      below[j * W + i] = Math.min(d, 99);
    }
  }
  const centers = hexes.map((h) => {
    const c = hexCenter(h);
    return { ci: Math.floor((c.x - x0) / PX), cj: Math.floor((c.y - y0) / PX) };
  });
  const col = new Array(W * H);
  const kind = new Uint8Array(W * H); // 0 tierra, 1 agua libre, 2 acantilado/sombra
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i, o = owner[k], n = noise(i, j);
      if (o >= 0) {
        col[k] = texture(hexes[o].t, i - centers[o].ci, j - centers[o].cj, n);
        continue;
      }
      const d = below[k];
      if (d >= 1 && d <= CLIFF_H) {
        kind[k] = 2;
        if (d === 1) { col[k] = CLIFF.rim; continue; }
        const block = d - 2; // 0..2
        const mortar = block === 1 || (i + (block === 2 ? 2 : 0)) % 4 === 0;
        col[k] = mortar ? CLIFF.mortar : CLIFF.stone[Math.min(block, 2)];
        if (!mortar && n % 100 < 8) col[k] = CLIFF.mortar;
        continue;
      }
      if (d > CLIFF_H && d <= CLIFF_H + 2) { kind[k] = 2; col[k] = CLIFF.shadow; continue; }
      kind[k] = 1;
      const wave = j % 6 === 0 && (i + 5 * Math.floor(j / 6)) % 17 < 3;
      col[k] = n < 5 ? WATER.spark : n < 14 ? WATER.spark2 : wave ? WATER.wave : n < 80 ? WATER.deep : WATER.base;
    }
  }
  // estampas decorativas en tierra
  hexes.forEach((h, hi) => {
    for (const [name, ox, oy] of STAMPS[h.t] || []) {
      const st = STAMP[name];
      st.rows.forEach((row, sy) => {
        for (let sx = 0; sx < row.length; sx++) {
          const c = row[sx];
          if (c === '.') continue;
          const i = centers[hi].ci + ox + sx, j = centers[hi].cj + oy + sy;
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const k = j * W + i;
          if (owner[k] === hi) col[k] = st.pal[c];
        }
      });
    }
  });
  // algas, corales y rocas en el fondo marino, lejos de la costa
  const seaFree = (i, j) => {
    for (let dj = -3; dj <= 7; dj++) for (let di = -3; di <= 7; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) return false;
      if (kind[jj * W + ii] !== 1) return false;
    }
    return true;
  };
  for (let j = 2; j < H - 6; j += 7) {
    for (let i = 2; i < W - 6; i += 9) {
      const n = noise(i * 7, j * 3);
      if (n > 420) continue;
      const ii = i + (n % 4), jj = j + ((n >> 2) % 3);
      if (!seaFree(ii, jj)) continue;
      const st = STAMP[n < 180 ? 'weed' : n < 300 ? 'rock' : 'coral'];
      st.rows.forEach((row, sy) => {
        for (let sx = 0; sx < row.length; sx++) if (row[sx] !== '.') col[(jj + sy) * W + ii + sx] = st.pal[row[sx]];
      });
    }
  }
  // biselado de cada losa, brillo de la orilla
  const final = col.slice();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i, o = owner[k];
      if (o >= 0) {
        const T = TERRAIN[hexes[o].t];
        if (at(i, j + 1) !== o || at(i + 1, j) !== o) final[k] = T.lo;
        else if (at(i, j - 1) !== o || at(i - 1, j) !== o) final[k] = T.hi;
      } else if (kind[k] === 1) {
        const nb = [at(i + 1, j), at(i - 1, j), at(i, j - 1), at(i, j + 1)];
        const near2 = [at(i + 2, j), at(i - 2, j), at(i, j - 2), at(i, j + 2), at(i + 1, j + 1), at(i - 1, j + 1), at(i + 1, j - 1), at(i - 1, j - 1)];
        if (nb.some((x) => x >= 0)) final[k] = WATER.glow;
        else if (near2.some((x) => x >= 0)) final[k] = WATER.soft;
      }
    }
  }
  // de píxeles a trazados: un <path> por color y uno por hexágono
  const byFill = new Map();
  const byHex = hexes.map(() => '');
  for (let j = 0; j < H; j++) {
    let i = 0;
    while (i < W) {
      const c = final[j * W + i];
      let i2 = i + 1;
      while (i2 < W && final[j * W + i2] === c) i2++;
      byFill.set(c, (byFill.get(c) || '') + `M${i} ${j}h${i2 - i}v1h${i - i2}z`);
      i = i2;
    }
    i = 0;
    while (i < W) {
      const o = owner[j * W + i];
      let i2 = i + 1;
      while (i2 < W && owner[j * W + i2] === o) i2++;
      if (o >= 0) byHex[o] += `M${i} ${j}h${i2 - i}v1h${i - i2}z`;
      i = i2;
    }
  }
  const svg = [...byFill.entries()].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('');
  const out = { x0, y0, PX, W, H, svg, hexPaths: byHex };
  terrainCache.set(key, out);
  if (terrainCache.size > 6) terrainCache.delete(terrainCache.keys().next().value);
  return out;
}
