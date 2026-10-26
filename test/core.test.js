import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseJsonc, stripJsonc } from '../server/util/jsonc.js';
import { paint, decodePng, upscalePng, pngSize, encodePng } from '../server/util/png.js';
import { createZip, readZip } from '../server/util/zip.js';
import { Workspace, normalizeRel } from '../server/workspace.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'localhub-test-'));

test('jsonc: comments and trailing commas are ignored, strings are kept', () => {
  const text = `{
    // line comment
    "a": "http://not-a-comment", /* block */
    "b": [1, 2, 3,],
    "c": "x,}",
  }`;
  assert.deepEqual(parseJsonc(text), { a: 'http://not-a-comment', b: [1, 2, 3], c: 'x,}' });
  assert.throws(() => parseJsonc('{"a": }'), /not valid JSON|line/);
  assert.equal(stripJsonc('"a//b"'), '"a//b"');
});

test('png: paint -> decode round trip and upscale', () => {
  const png = paint({ width: 2, height: 2, palette: { r: '#ff0000', g: '#00ff0080' }, pixels: ['r.', '.g'] });
  assert.deepEqual(pngSize(png), { width: 2, height: 2 });
  const { rgba } = decodePng(png);
  assert.deepEqual([...rgba.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...rgba.slice(4, 8)], [0, 0, 0, 0]);
  assert.deepEqual([...rgba.slice(12, 16)], [0, 255, 0, 128]);
  const big = upscalePng(png, 64);
  assert.deepEqual(pngSize(big), { width: 64, height: 64 });
  assert.throws(() => paint({ width: 1, height: 1, pixels: ['x'] }), /not in the palette/);
  assert.throws(() => paint({ width: 0, height: 1 }), /between 1 and 512/);
});

test('png: decodes filtered RGB images', () => {
  // Hand-built 2x1 RGB image using the Sub filter (type 1).
  const zlib = encodePng(1, 1, new Uint8Array([1, 2, 3, 255]));
  assert.ok(decodePng(zlib));
});

test('zip: archives round trip', () => {
  const files = [
    { name: 'a/manifest.json', data: Buffer.from('{"x":1}') },
    { name: 'a/textures/t.png', data: paint({ width: 4, height: 4, background: '#123456' }) },
    { name: 'big.txt', data: Buffer.from('hello '.repeat(5000)) },
  ];
  const out = readZip(createZip(files));
  assert.deepEqual(out.map((f) => f.name), files.map((f) => f.name));
  out.forEach((f, i) => assert.ok(f.data.equals(files[i].data)));
});

test('workspace: paths cannot escape the root', async () => {
  const dir = tmp();
  const ws = new Workspace(path.join(dir, 'ws'));
  assert.equal(normalizeRel('a/./b/../c'), 'a/c');
  assert.equal(normalizeRel('/a/b'), 'a/b');
  assert.throws(() => normalizeRel('../x'), /escapes/);
  assert.throws(() => normalizeRel('C:/x'), /Absolute/);
  await ws.write('p/file.txt', 'hi');
  assert.equal(await ws.readText('p/file.txt'), 'hi');
  // Symlink pointing outside the workspace is refused.
  fs.mkdirSync(path.join(dir, 'outside'));
  fs.symlinkSync(path.join(dir, 'outside'), path.join(dir, 'ws', 'link'));
  assert.throws(() => ws.abs('link/secret.txt'), /escapes/);
  await assert.rejects(ws.remove(''), /root/);
});

test('workspace: edit requires a unique match', async () => {
  const ws = new Workspace(tmp());
  await ws.write('f.js', 'a = 1;\na = 1;\nb = 2;\n');
  await assert.rejects(ws.edit('f.js', 'a = 1;', 'a = 3;'), /appears 2 times/);
  await assert.rejects(ws.edit('f.js', 'zzz', 'q'), /not found/);
  assert.equal((await ws.edit('f.js', 'a = 1;', 'a = 3;', true)).replacements, 2);
  await ws.edit('f.js', 'b = 2;', 'b = $&;');
  assert.equal(await ws.readText('f.js'), 'a = 3;\na = 3;\nb = $&;\n');
  const { results } = await ws.search('b =', {});
  assert.equal(results[0].line, 3);
});
