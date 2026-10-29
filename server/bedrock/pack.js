// Packaging: .mcpack per pack + one .mcaddon per project. Opening a .mcaddon on a phone
// or PC imports it straight into Minecraft.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createZip } from '../util/zip.js';
import { tryParseJsonc } from '../util/jsonc.js';
import { normalizeRel, WorkspaceError } from '../workspace.js';
import { validateProject } from './validate.js';

const EXCLUDE = /(^|\/)(\.[^/]*|Thumbs\.db|desktop\.ini|.*\.md)$/;

export async function readProjectMeta(ws, slug) {
  const root = normalizeRel(slug);
  const meta = { slug: root, name: root, version: [1, 0, 0], type: 'addon' };
  if (await ws.exists(`${root}/project.json`)) {
    const r = tryParseJsonc(await ws.readText(`${root}/project.json`));
    if (r.ok) Object.assign(meta, r.value, { slug: root });
  }
  if (!Array.isArray(meta.version) || meta.version.length !== 3) meta.version = [1, 0, 0];
  return meta;
}

/** Collect pack folders (direct children with manifest.json) and their files. */
async function collectPacks(ws, root) {
  const { entries } = await ws.list(root, { depth: 1 });
  const packs = [];
  for (const dir of entries.filter((e) => e.type === 'dir')) {
    if (!(await ws.exists(`${dir.path}/manifest.json`))) continue;
    const manifest = tryParseJsonc(await ws.readText(`${dir.path}/manifest.json`));
    if (!manifest.ok) throw new WorkspaceError(`${dir.path}/manifest.json is invalid: ${manifest.error}`);
    const { entries: all } = await ws.list(dir.path, { depth: 32, maxEntries: 50000 });
    const files = all.filter((e) => e.type === 'file' && !EXCLUDE.test(e.path.slice(dir.path.length + 1)));
    const types = new Set((manifest.value.modules || []).map((m) => m.type));
    packs.push({ dir: dir.path, name: path.posix.basename(dir.path), manifest: manifest.value, files, kind: types.has('resources') ? 'RP' : 'BP' });
  }
  return packs;
}

/** Stamp project.json's version into headers, modules and in-project dependencies. */
function stampManifest(manifest, version, headerUuids) {
  const m = structuredClone(manifest);
  const v = m.format_version === 3 ? version.join('.') : version;
  if (m.header) m.header.version = v;
  for (const mod of m.modules || []) mod.version = v;
  for (const dep of m.dependencies || []) if (dep.uuid && headerUuids.has(dep.uuid)) dep.version = v;
  return m;
}

const newer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Version for a test build: one patch above project.json's version (so it never collides with a
 * normal build already imported), or above the last test build - so Minecraft always replaces the
 * previous import, while project.json (shared with Claude through git) stays untouched.
 */
async function nextTestVersion(distDir, slug, version) {
  const file = path.join(distDir, '.test-versions.json');
  const state = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '{}'));
  const last = state[slug];
  const base = [version[0], version[1], version[2] + 1];
  const next = last && newer(base, last) <= 0 ? [last[0], last[1], last[2] + 1] : base;
  state[slug] = next;
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2));
  return next;
}

export async function buildProject(ws, slug, { distDir, force = false, testBuild = false } = {}) {
  const root = normalizeRel(slug);
  const report = await validateProject(ws, root);
  if (!report.ok && !force) return { ok: false, report, message: 'Validation failed - fix the errors (or build with force).' };
  const meta = await readProjectMeta(ws, root);
  const packs = await collectPacks(ws, root);
  if (!packs.length) throw new WorkspaceError('No packs to build');
  const headerUuids = new Set(packs.map((p) => p.manifest.header?.uuid).filter(Boolean));
  const version = testBuild ? await nextTestVersion(distDir, root, meta.version) : meta.version;
  const versionLabel = version.join('.');
  const outDir = path.join(distDir, root);
  await fs.mkdir(outDir, { recursive: true });

  const addonEntries = [];
  const outputs = [];
  for (const pack of packs) {
    const folder = `${root}_${pack.kind}`;
    const entries = [];
    for (const f of pack.files) {
      const rel = f.path.slice(pack.dir.length + 1);
      let data = await ws.readBuffer(f.path);
      if (rel === 'manifest.json') data = Buffer.from(JSON.stringify(stampManifest(pack.manifest, version, headerUuids), null, 2));
      entries.push({ name: rel, data });
      addonEntries.push({ name: `${folder}/${rel}`, data });
    }
    const file = `${root}-${pack.kind}-v${versionLabel}.mcpack`;
    await fs.writeFile(path.join(outDir, file), createZip(entries));
    outputs.push({ kind: pack.kind, file: `${root}/${file}` });
  }
  const addonFile = `${root}-v${versionLabel}.mcaddon`;
  const addon = createZip(addonEntries);
  await fs.writeFile(path.join(outDir, addonFile), addon);
  outputs.unshift({ kind: 'mcaddon', file: `${root}/${addonFile}`, size: addon.length });
  return { ok: true, report, version: versionLabel, outputs, download: `${root}/${addonFile}` };
}

/**
 * Copy packs into Minecraft's development_behavior_packs / development_resource_packs
 * so `/reload` picks up changes without re-importing (desktop, or rooted/Shizuku Android).
 */
export async function deployProject(ws, slug, comMojangDir) {
  if (!comMojangDir) throw new WorkspaceError('Set "Minecraft com.mojang folder" in Settings first');
  const root = normalizeRel(slug);
  const meta = await readProjectMeta(ws, root);
  const packs = await collectPacks(ws, root);
  const headerUuids = new Set(packs.map((p) => p.manifest.header?.uuid).filter(Boolean));
  const done = [];
  for (const pack of packs) {
    const target = path.join(comMojangDir, pack.kind === 'RP' ? 'development_resource_packs' : 'development_behavior_packs', `${root}_${pack.kind}`);
    await fs.rm(target, { recursive: true, force: true });
    for (const f of pack.files) {
      const rel = f.path.slice(pack.dir.length + 1);
      const dest = path.join(target, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const data = rel === 'manifest.json'
        ? JSON.stringify(stampManifest(pack.manifest, meta.version, headerUuids), null, 2)
        : await ws.readBuffer(f.path);
      await fs.writeFile(dest, data);
    }
    done.push(target);
  }
  return { ok: true, deployed: done };
}

/** Bump project.json version: part = 'major' | 'minor' | 'patch'. */
export async function bumpVersion(ws, slug, part = 'patch') {
  const root = normalizeRel(slug);
  const meta = await readProjectMeta(ws, root);
  const v = [...meta.version];
  if (part === 'major') { v[0]++; v[1] = 0; v[2] = 0; } else if (part === 'minor') { v[1]++; v[2] = 0; } else v[2]++;
  const file = `${root}/project.json`;
  const current = (await ws.exists(file)) ? tryParseJsonc(await ws.readText(file)) : { ok: true, value: {} };
  const next = { ...(current.ok ? current.value : {}), version: v };
  await ws.write(file, JSON.stringify(next, null, 2) + '\n');
  return { version: v.join('.') };
}
