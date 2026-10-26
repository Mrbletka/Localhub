// Procedural pixel art for starter textures and pack icons. Agents paint their own
// textures with the paint_texture tool; these just make new projects look good.
import { encodePng, parseColor } from '../util/png.js';

export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  set(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const c = typeof color === 'string' ? parseColor(color) : color;
    const i = (y * this.width + x) * 4;
    this.data.set(c, i);
  }

  rect(x, y, w, h, color) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, color);
  }

  grid(rows, palette, ox = 0, oy = 0) {
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (palette[ch]) this.set(ox + x, oy + y, palette[ch]);
    }));
  }

  /** Give every opaque shape a 1px outline on transparent neighbours. */
  outline(color) {
    const c = parseColor(color);
    const marks = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y)[3] !== 0) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.get(x + dx, y + dy)[3] > 0);
        if (near) marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) this.set(x, y, c);
  }

  /** Alpha-composite src over this canvas, nearest-neighbour scaled. */
  blit(src, ox, oy, scale = 1) {
    for (let y = 0; y < src.height * scale; y++) {
      for (let x = 0; x < src.width * scale; x++) {
        const [r, g, b, a] = src.get(Math.floor(x / scale), Math.floor(y / scale));
        if (a === 0) continue;
        const [dr, dg, db, da] = this.get(ox + x, oy + y);
        const t = a / 255;
        this.set(ox + x, oy + y, [
          Math.round(r * t + dr * (1 - t)),
          Math.round(g * t + dg * (1 - t)),
          Math.round(b * t + db * (1 - t)),
          Math.max(a, da),
        ]);
      }
    }
  }

  png() {
    return encodePng(this.width, this.height, this.data);
  }
}

export function shade(hex, amount) {
  const [r, g, b] = parseColor(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return '#' + [f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function gem(base = '#c3122a') {
  const c = new Canvas(16, 16);
  c.grid([
    '................',
    '................',
    '.....kkkkkk.....',
    '....kLLwLLbk....',
    '...kLLwwLLbbk...',
    '..kLLLLLLbbbdk..',
    '..kkkkkkkkkkkk..',
    '..kLLLbbbbbddk..',
    '...kLLbbbbddk...',
    '....kLbbbddk....',
    '.....kLbbdk.....',
    '......kbdk......',
    '.......kk.......',
  ], { k: shade(base, -0.7), L: shade(base, 0.25), b: base, d: shade(base, -0.35), w: shade(base, 0.8) });
  return c;
}

export function gemBlock(base = '#c3122a') {
  const c = new Canvas(16, 16);
  c.grid([
    'dddddddddddddddd',
    'dbbbbbbbbbbbbbbd',
    'dbLLLbbbbbbLLLbd',
    'dbLwLbbbbbbLwLbd',
    'dbLLLbbbbbbLLLbd',
    'dbbbbbbLLbbbbbbd',
    'dbbbbbLwwLbbbbbd',
    'dbbbbLwwwwLbbbbd',
    'dbbbbLwwwwLbbbbd',
    'dbbbbbLwwLbbbbbd',
    'dbbbbbbLLbbbbbbd',
    'dbLLLbbbbbbLLLbd',
    'dbLwLbbbbbbLwLbd',
    'dbLLLbbbbbbLLLbd',
    'dbbbbbbbbbbbbbbd',
    'dddddddddddddddd',
  ], { d: shade(base, -0.45), b: base, L: shade(base, 0.25), w: shade(base, 0.7) });
  return c;
}

export function sword(blade = '#c3122a') {
  const c = new Canvas(16, 16);
  for (let x = 6; x <= 13; x++) {
    const y = 15 - x;
    c.set(x, y, blade);
    c.set(x - 1, y, shade(blade, 0.45));
    c.set(x, y + 1, shade(blade, -0.3));
  }
  c.set(14, 1, shade(blade, 0.7));
  for (let k = -2; k <= 2; k++) c.set(5 + k, 10 + k, '#d4af37');
  for (let x = 2; x <= 4; x++) c.set(x, 15 - x, '#6b4423');
  c.set(1, 14, '#3d2614');
  c.outline(shade(blade, -0.75));
  return c;
}

export function coin() {
  const c = new Canvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 6.6) continue;
      let color = '#f2b705';
      if (d > 5.6) color = x + y < 15 ? '#ffd84a' : '#c98a00';
      else if (d > 4.2 && d < 5) color = '#d99c00';
      else if (x >= 6 && x <= 9 && y >= 4 && y <= 11) color = x === 6 ? '#fff3b0' : '#ffd84a';
      c.set(x, y, color);
    }
  }
  c.outline('#5c3b00');
  return c;
}

export function machine(accent = '#3ddc84') {
  const c = new Canvas(16, 16);
  c.rect(0, 0, 16, 16, '#2b2f36');
  c.rect(1, 1, 14, 14, '#4a515c');
  c.rect(2, 2, 12, 1, '#5d6673');
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) c.set(x, y, '#8d96a3');
  c.rect(4, 4, 8, 8, '#1d2026');
  c.rect(5, 5, 6, 6, shade(accent, -0.35));
  c.rect(6, 6, 4, 4, accent);
  c.rect(7, 7, 2, 2, shade(accent, 0.6));
  for (let x = 3; x <= 12; x += 3) c.set(x, 13, accent);
  return c;
}

export function tablet(accent = '#3d9ddc') {
  const c = new Canvas(16, 16);
  c.rect(3, 1, 10, 14, '#30343c');
  c.rect(4, 2, 8, 10, shade(accent, -0.25));
  c.rect(5, 3, 3, 1, shade(accent, 0.6));
  c.rect(5, 5, 6, 1, accent);
  c.rect(5, 7, 4, 1, accent);
  c.rect(5, 9, 5, 1, accent);
  c.rect(7, 13, 2, 1, '#8d96a3');
  c.outline('#15171b');
  return c;
}

export function wand(accent = '#b05cff') {
  const c = new Canvas(16, 16);
  for (let i = 0; i < 8; i++) c.set(2 + i, 13 - i, i < 2 ? '#3d2614' : '#8a5a2b');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 11.5, y - 4.5);
      if (d <= 3.2) c.set(x, y, d < 1.4 ? shade(accent, 0.7) : d < 2.4 ? accent : shade(accent, -0.3));
    }
  }
  c.set(10, 3, '#ffffff');
  c.outline('#1a1024');
  return c;
}

/** 64x64 pack icon: gradient tile with a hero texture scaled up in the middle. */
export function packIcon(hero, from = '#1f2a44', to = '#3b1f4a') {
  const c = new Canvas(64, 64);
  const a = parseColor(from);
  const b = parseColor(to);
  for (let y = 0; y < 64; y++) {
    const t = y / 63;
    const row = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    for (let x = 0; x < 64; x++) c.set(x, y, row);
  }
  const shadow = new Canvas(hero.width, hero.height);
  for (let y = 0; y < hero.height; y++) for (let x = 0; x < hero.width; x++) if (hero.get(x, y)[3]) shadow.set(x, y, [0, 0, 0, 110]);
  c.blit(shadow, 10, 11, 3);
  c.blit(hero, 8, 8, 3);
  return c;
}
