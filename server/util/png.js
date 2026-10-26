// Minimal PNG encoder (RGBA, 8-bit) so agents can paint pixel-art textures
// without native image libraries. Works the same on Termux and desktop.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of width*height*4 bytes. */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** "#rgb", "#rrggbb" or "#rrggbbaa" -> [r,g,b,a]. "transparent" -> [0,0,0,0]. */
export function parseColor(value) {
  if (value == null || value === 'transparent' || value === '') return [0, 0, 0, 0];
  let hex = String(value).trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) throw new Error(`Invalid color "${value}" (use #rrggbb or #rrggbbaa)`);
  const n = (i) => parseInt(hex.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), hex.length === 8 ? n(6) : 255];
}

/**
 * Paint a texture from a palette + character grid, plus optional rectangles.
 * pixels: array of strings, one per row, each char a palette key ('.' = transparent by default).
 */
export function paint({ width, height, palette = {}, pixels = [], rects = [], background }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512) {
    throw new Error('width and height must be integers between 1 and 512');
  }
  const rgba = new Uint8Array(width * height * 4);
  const set = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
  };
  if (background) {
    const bg = parseColor(background);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, bg);
  }
  for (const r of rects) {
    const color = parseColor(r.color);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, color);
  }
  const colors = { '.': [0, 0, 0, 0], ' ': [0, 0, 0, 0] };
  for (const [key, value] of Object.entries(palette)) {
    if ([...key].length !== 1) throw new Error(`Palette keys must be single characters (got "${key}")`);
    colors[key] = parseColor(value);
  }
  pixels.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' && !palette['.']) return; // transparent: keep background
      const color = colors[ch];
      if (!color) throw new Error(`Row ${y} uses "${ch}" which is not in the palette`);
      set(x, y, color);
    });
  });
  return encodePng(width, height, rgba);
}

/** Decode a non-interlaced 8-bit PNG (gray, RGB, palette, gray+alpha, RGBA) to RGBA. */
export function decodePng(buf) {
  if (!isPng(buf)) throw new Error('Not a PNG');
  let pos = 8;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette = null, alpha = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') alpha = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error('Only 8-bit non-interlaced PNGs are supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`Unsupported PNG color type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r, g, b, al = 255;
    if (type === 0) { r = g = b = pixels[s]; }
    else if (type === 2) { [r, g, b] = [pixels[s], pixels[s + 1], pixels[s + 2]]; }
    else if (type === 3) {
      const idx = pixels[s];
      [r, g, b] = [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
      if (alpha && idx < alpha.length) al = alpha[idx];
    } else if (type === 4) { r = g = b = pixels[s]; al = pixels[s + 1]; }
    else { [r, g, b, al] = [pixels[s], pixels[s + 1], pixels[s + 2], pixels[s + 3]]; }
    rgba.set([r, g, b, al], i * 4);
  }
  return { width, height, rgba };
}

/** Nearest-neighbour upscale so tiny textures are legible to vision models and on screens. */
export function upscalePng(buf, target = 256) {
  const { width, height, rgba } = decodePng(buf);
  const scale = Math.max(1, Math.floor(target / Math.max(width, height)));
  if (scale === 1) return buf;
  const w = width * scale, h = height * scale;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      out.set(rgba.subarray(si, si + 4), (y * w + x) * 4);
    }
  }
  return encodePng(w, h, out);
}

export function isPng(buf) {
  return buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
}

export function pngSize(buf) {
  if (!isPng(buf)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
