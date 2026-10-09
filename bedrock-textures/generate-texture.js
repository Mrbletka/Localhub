#!/usr/bin/env node
// Generates a 16x16 "Ruby Ore" block texture as a PNG for a Minecraft Bedrock resource pack.
// No dependencies: uses only Node's built-in zlib to encode the PNG.
//
// Usage:
//   node generate-texture.js [output.png]
//
// Default output: ./resource_pack/textures/blocks/ruby_ore.png (relative to this file).
// To change the art, edit PALETTE and PIXELS below. Each character in PIXELS is one pixel.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PALETTE = {
  a: [0x9a, 0x9a, 0x9a, 255], // stone highlight
  b: [0x7f, 0x7f, 0x7f, 255], // stone base
  c: [0x68, 0x68, 0x68, 255], // stone shadow
  R: [0xff, 0x7a, 0x8a, 255], // ruby highlight
  r: [0xd8, 0x1e, 0x3a, 255], // ruby body
  x: [0x8a, 0x0f, 0x22, 255], // ruby shadow
  ".": [0, 0, 0, 0], // transparent
};

const PIXELS = [
  "bbabbbcbbbbabbcb",
  "bcbbxrbbcbbbbabb",
  "abbxRrrbbbbcbbbb",
  "bbbxrrxbbabbbbcb",
  "bcbbxxbbbbbbxrbb",
  "bbbbbbbcbbbxRrrb",
  "babbcbbbbbbxrrxb",
  "bbbbbbabbcbbxxbb",
  "bcbbbbbbbbbbbbab",
  "bbbxrbbbcbbabbbb",
  "abxRrrbbbbbbbcbb",
  "bbxrrxbbbbxrbbbb",
  "bbbxxbbabxRrrbbc",
  "cbbbbbbbbxrrxbbb",
  "bbbabcbbbbxxbbab",
  "bbcbbbbbabbbbbbb",
];

function toRgba(pixels, palette) {
  const height = pixels.length;
  const width = pixels[0].length;
  const rgba = Buffer.alloc(width * height * 4);
  pixels.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Row ${y} is ${row.length} pixels wide, expected ${width}`);
    }
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) throw new Error(`Unknown palette key "${ch}" at (${x}, ${y})`);
      rgba.set(color, (y * width + x) * 4);
    });
  });
  return { width, height, rgba };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is prefixed with a filter-type byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outPath = path.resolve(
  process.argv[2] || path.join(__dirname, "resource_pack", "textures", "blocks", "ruby_ore.png")
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePng(toRgba(PIXELS, PALETTE)));

console.log(`Wrote ${outPath}`);
console.log(`
Register it in your resource pack's textures/terrain_texture.json:
  "texture_data": {
    "ruby_ore": { "textures": "textures/blocks/ruby_ore" }
  }
`);
