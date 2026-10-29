import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Workspace } from '../server/workspace.js';
import { createProject, TEMPLATES, namespaceFrom } from '../server/bedrock/scaffold.js';
import { validateProject } from '../server/bedrock/validate.js';
import { buildProject } from '../server/bedrock/pack.js';
import { readZip } from '../server/util/zip.js';
import { reference, TOPICS } from '../server/bedrock/knowledge.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'localhub-bedrock-'));

test('every template produces a project that validates cleanly', async () => {
  const ws = new Workspace(tmp());
  for (const template of Object.keys(TEMPLATES)) {
    const res = await createProject(ws, { name: `Test ${template}`, template });
    const report = await validateProject(ws, res.slug);
    assert.equal(report.ok, true, `${template}: ${JSON.stringify(report.issues)}`);
    assert.equal(report.counts.warning, 0, `${template}: ${JSON.stringify(report.issues)}`);
  }
});

test('namespaces are derived safely', () => {
  assert.equal(namespaceFrom('Ruby Tycoon'), 'ruby_tycoon');
  assert.equal(namespaceFrom('Minecraft'), 'mc_addon');
  assert.equal(namespaceFrom('123 Go!'), 'go');
});

test('project names must be unique', async () => {
  const ws = new Workspace(tmp());
  await createProject(ws, { name: 'Dup', template: 'blank' });
  await assert.rejects(createProject(ws, { name: 'Dup', template: 'blank' }), /already exists/);
  await assert.rejects(createProject(ws, { name: 'X', template: 'nope' }), /Unknown template/);
  await assert.rejects(createProject(ws, { name: 'Y', template: 'blank', namespace: 'minecraft' }), /Invalid namespace/);
});

test('validator catches the mistakes that break packs', async () => {
  const ws = new Workspace(tmp());
  const { slug } = await createProject(ws, { name: 'Broken', template: 'tycoon' });
  const bp = JSON.parse(await ws.readText(`${slug}/BP/manifest.json`));
  const rp = JSON.parse(await ws.readText(`${slug}/RP/manifest.json`));
  rp.modules[0].uuid = bp.modules[0].uuid; // duplicated UUID
  await ws.write(`${slug}/RP/manifest.json`, JSON.stringify(rp));
  const main = await ws.readText(`${slug}/BP/scripts/main.js`);
  await ws.write(`${slug}/BP/scripts/main.js`, main.replace("'./config.js'", "'./config'") + '\nworld.beforeEvents.worldInitialize.subscribe(() => {});\nsetTimeout(() => {}, 1);\n');
  await ws.write(`${slug}/BP/scripts/bad.js`, 'export function x( {');
  await ws.write(`${slug}/BP/scripts/npm.js`, "import _ from 'lodash';\nimport { x } from '@minecraft/server-net';\n");
  const item = JSON.parse(await ws.readText(`${slug}/BP/items/tycoon_tablet.json`));
  item['minecraft:item'].components['minecraft:icon'] = 'broken_tycoon_missing';
  await ws.write(`${slug}/BP/items/tycoon_tablet.json`, JSON.stringify(item));
  await ws.write(`${slug}/BP/recipes/r.json`, JSON.stringify({ format_version: '1.21.0', 'minecraft:recipe_shaped': { description: { identifier: 'broken:r' }, pattern: ['#X'], key: { '#': { item: 'broken:nope' } }, result: { item: 'minecraft:stone' } } }));

  const report = await validateProject(ws, slug);
  const text = report.issues.map((i) => `${i.level} ${i.message}`).join('\n');
  assert.equal(report.ok, false);
  for (const needle of [
    /UUID .* is used more than once/,
    /import "\.\/config" .*full file name/,
    /worldInitialize was removed/,
    /setInterval\/setTimeout/,
    /Syntax error/,
    /"lodash" is not available/,
    /@minecraft\/server-net but BP\/manifest.json has no dependency/,
    /Icon "broken_tycoon_missing" is not defined/,
    /unknown item "broken:nope"/,
    /Pattern symbol "X"/,
  ]) assert.match(text, needle);
});

test('build creates an importable .mcaddon with stamped versions', async () => {
  const dir = tmp();
  const ws = new Workspace(path.join(dir, 'ws'));
  const { slug } = await createProject(ws, { name: 'Shippable', template: 'simulator' });
  const meta = JSON.parse(await ws.readText(`${slug}/project.json`));
  meta.version = [2, 3, 4];
  await ws.write(`${slug}/project.json`, JSON.stringify(meta));
  await ws.write(`${slug}/BP/notes.md`, 'not shipped');
  const res = await buildProject(ws, slug, { distDir: path.join(dir, 'dist') });
  assert.equal(res.ok, true);
  assert.equal(res.version, '2.3.4');
  const files = readZip(fs.readFileSync(path.join(dir, 'dist', res.download)));
  const names = files.map((f) => f.name);
  assert.ok(names.includes(`${slug}_BP/manifest.json`));
  assert.ok(names.includes(`${slug}_RP/textures/item_texture.json`));
  assert.ok(!names.some((n) => n.endsWith('.md')));
  const bpManifest = JSON.parse(files.find((f) => f.name === `${slug}_BP/manifest.json`).data);
  assert.deepEqual(bpManifest.header.version, [2, 3, 4]);
  assert.deepEqual(bpManifest.dependencies[0].version, [2, 3, 4]);
});

test('build refuses invalid projects unless forced', async () => {
  const dir = tmp();
  const ws = new Workspace(path.join(dir, 'ws'));
  const { slug } = await createProject(ws, { name: 'Nope', template: 'blank' });
  await ws.write(`${slug}/BP/scripts/main.js`, 'syntax error here (');
  const res = await buildProject(ws, slug, { distDir: path.join(dir, 'dist') });
  assert.equal(res.ok, false);
  const forced = await buildProject(ws, slug, { distDir: path.join(dir, 'dist'), force: true });
  assert.equal(forced.ok, true);
});

test('knowledge base answers every topic', () => {
  for (const key of Object.keys(TOPICS)) assert.ok(reference(key).length > 200, key);
  assert.match(reference('index'), /Available topics/);
  assert.match(reference('nonsense'), /Unknown topic/);
  assert.match(reference('items, blocks'), /minecraft:item[\s\S]*minecraft:block/);
});

test('test builds always get a higher version without touching project.json', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localhub-testbuild-'));
  const ws = new Workspace(path.join(dir, 'ws'));
  const distDir = path.join(dir, 'dist');
  const { slug } = await createProject(ws, { name: 'Iterate', template: 'blank' });
  const before = await ws.readText(`${slug}/project.json`);
  const versions = [];
  for (let i = 0; i < 3; i++) versions.push((await buildProject(ws, slug, { distDir, testBuild: true })).version);
  assert.deepEqual(versions, ['1.0.1', '1.0.2', '1.0.3']);
  assert.equal(await ws.readText(`${slug}/project.json`), before);
  const files = readZip(fs.readFileSync(path.join(distDir, slug, `${slug}-v1.0.3.mcaddon`)));
  assert.deepEqual(JSON.parse(files.find((f) => f.name === `${slug}_RP/manifest.json`).data).header.version, [1, 0, 3]);
  // A real release version above the test builds takes over again.
  const meta = JSON.parse(before);
  meta.version = [1, 1, 0];
  await ws.write(`${slug}/project.json`, JSON.stringify(meta));
  assert.equal((await buildProject(ws, slug, { distDir, testBuild: true })).version, '1.1.1');
  assert.equal((await buildProject(ws, slug, { distDir, testBuild: true })).version, '1.1.2');
  assert.equal((await buildProject(ws, slug, { distDir })).version, '1.1.0', 'normal builds keep the project version');
});
