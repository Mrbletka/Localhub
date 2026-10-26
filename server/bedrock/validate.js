// Static checks for a Bedrock add-on project. Agents run this after every change,
// so messages say exactly what is wrong and how to fix it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tryParseJsonc } from '../util/jsonc.js';
import { pngSize } from '../util/png.js';
import { normalizeRel } from '../workspace.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULE_TYPES = new Set(['data', 'resources', 'script', 'client_data', 'interface', 'world_template', 'skin_pack']);
const KNOWN_SCRIPT_MODULES = new Set([
  '@minecraft/server', '@minecraft/server-ui', '@minecraft/server-gametest', '@minecraft/server-net',
  '@minecraft/server-admin', '@minecraft/server-editor', '@minecraft/debug-utilities', '@minecraft/common',
]);
const TEXTURE_EXT = ['.png', '.tga', '.jpg', '.jpeg'];

const isVersionArray = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n) && n >= 0);
const isSemver = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v);
const majorOf = (v) => (isSemver(v) ? Number(v.split('.')[0]) : isVersionArray(v) ? v[0] : NaN);

function texturePaths(entry) {
  if (!entry) return [];
  const t = entry.textures ?? entry;
  const list = Array.isArray(t) ? t : [t];
  return list.map((x) => (typeof x === 'string' ? x : x?.path)).filter(Boolean);
}

function iconKey(icon) {
  if (typeof icon === 'string') return icon;
  if (icon && typeof icon === 'object') return icon.textures?.default ?? icon.texture ?? null;
  return null;
}

function syntaxCheck(code) {
  const tmp = path.join(os.tmpdir(), `localhub-check-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmp, code);
  try {
    const res = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 15000 });
    if (res.status === 0) return null;
    const lines = (res.stderr || '').split('\n').filter(Boolean);
    const where = lines[0]?.match(/:(\d+)$/)?.[1];
    const msg = lines.find((l) => /Error/.test(l)) || lines.slice(0, 3).join(' ');
    return `${msg.trim()}${where ? ` (line ${where})` : ''}`;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function importsOf(code) {
  const out = [];
  const re = /(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(code))) out.push({ spec: m[1] || m[2], line: code.slice(0, m.index).split('\n').length });
  return out;
}

export async function validateProject(ws, slug) {
  const root = normalizeRel(slug);
  const issues = [];
  const add = (level, file, message) => issues.push({ level, file, message });
  if (!root || !(await ws.exists(root))) {
    return { ok: false, issues: [{ level: 'error', file: root, message: `Project "${slug}" not found` }], counts: { error: 1, warning: 0, info: 0 } };
  }

  let project = {};
  if (await ws.exists(`${root}/project.json`)) {
    const r = tryParseJsonc(await ws.readText(`${root}/project.json`));
    if (r.ok) project = r.value;
    else add('error', `${root}/project.json`, `Invalid JSON: ${r.error}`);
  } else {
    add('info', root, 'No project.json - library metadata (name, version, summary) will be guessed.');
  }
  const namespace = project.namespace;

  const { entries } = await ws.list(root, { depth: 16, maxEntries: 20000 });
  const files = entries.filter((e) => e.type === 'file' && !e.path.includes('/.studio/'));
  const fileSet = new Set(files.map((f) => f.path));

  // Packs are folders directly under the project that contain a manifest.json.
  const packs = [];
  for (const f of files) {
    const rel = f.path.slice(root.length + 1);
    const parts = rel.split('/');
    if (parts.length === 2 && parts[1] === 'manifest.json') packs.push({ dir: `${root}/${parts[0]}`, name: parts[0] });
  }
  if (!packs.length) add('error', root, 'No packs found. Expected BP/manifest.json and/or RP/manifest.json.');

  // Parse every JSON file once.
  const jsonCache = new Map();
  for (const f of files) {
    if (!f.path.endsWith('.json')) continue;
    const r = tryParseJsonc(await ws.readText(f.path));
    if (r.ok) jsonCache.set(f.path, r.value);
    else add('error', f.path, `Invalid JSON: ${r.error}`);
  }

  const uuids = new Map();
  const headerUuids = new Map();
  let bp = null;
  let rp = null;
  for (const pack of packs) {
    const file = `${pack.dir}/manifest.json`;
    const m = jsonCache.get(file);
    if (!m) continue;
    pack.manifest = m;
    const fv = m.format_version;
    if (![1, 2, 3].includes(fv)) add('error', file, `format_version must be 2 (or 3); got ${JSON.stringify(fv)}`);
    const h = m.header || {};
    if (!h.name) add('error', file, 'header.name is missing');
    if (!UUID_RE.test(h.uuid || '')) add('error', file, `header.uuid is not a valid UUID: ${JSON.stringify(h.uuid)}`);
    const versionOk = (v) => (fv === 3 ? isSemver(v) || isVersionArray(v) : isVersionArray(v));
    if (!versionOk(h.version)) add('error', file, `header.version must be ${fv === 3 ? '"1.0.0"' : '[1, 0, 0]'}; got ${JSON.stringify(h.version)}`);
    if (!Array.isArray(m.modules) || !m.modules.length) add('error', file, 'modules[] is missing or empty');
    const types = new Set();
    for (const mod of m.modules || []) {
      types.add(mod.type);
      if (!MODULE_TYPES.has(mod.type)) add('error', file, `Unknown module type "${mod.type}"`);
      if (!UUID_RE.test(mod.uuid || '')) add('error', file, `Module uuid is not a valid UUID: ${JSON.stringify(mod.uuid)}`);
      if (!versionOk(mod.version)) add('error', file, `Module version is invalid: ${JSON.stringify(mod.version)}`);
      if (mod.type === 'script') {
        pack.scriptEntry = mod.entry;
        if (mod.language && mod.language !== 'javascript') add('error', file, 'Script modules must use "language": "javascript"');
        if (!mod.entry) add('error', file, 'Script module is missing "entry" (e.g. "scripts/main.js")');
        else if (!fileSet.has(`${pack.dir}/${normalizeRel(mod.entry)}`)) add('error', file, `Script entry ${mod.entry} does not exist`);
      }
    }
    if (fv === 2 && h.min_engine_version && !isVersionArray(h.min_engine_version)) add('error', file, 'header.min_engine_version must look like [1, 21, 90]');
    if (types.has('resources') && !types.has('data') && !types.has('script')) { pack.kind = 'rp'; rp ??= pack; }
    else if (types.has('data') || types.has('script')) { pack.kind = 'bp'; bp ??= pack; }
    for (const id of [h.uuid, ...(m.modules || []).map((x) => x.uuid)].filter(Boolean)) {
      if (uuids.has(id)) add('error', file, `UUID ${id} is used more than once (also in ${uuids.get(id)}). Every header and module needs its own UUID - use new_uuid.`);
      else uuids.set(id, file);
    }
    if (h.uuid) headerUuids.set(h.uuid, pack);
    if (!fileSet.has(`${pack.dir}/pack_icon.png`)) add('warning', pack.dir, 'pack_icon.png is missing (shown in Minecraft and in the library)');
  }

  // Dependencies.
  const scriptVersions = {};
  for (const pack of packs) {
    const file = `${pack.dir}/manifest.json`;
    for (const dep of pack.manifest?.dependencies || []) {
      if (dep.module_name) {
        if (!KNOWN_SCRIPT_MODULES.has(dep.module_name)) add('warning', file, `Unknown script module "${dep.module_name}"`);
        if (!isSemver(dep.version)) add('error', file, `${dep.module_name} version must be a string like "2.0.0"; got ${JSON.stringify(dep.version)}`);
        else if (dep.version.includes('-beta')) add('warning', file, `${dep.module_name}@${dep.version} is a beta API: worlds need the "Beta APIs" experiment and it can break on any game update`);
        scriptVersions[dep.module_name] = dep.version;
      } else if (dep.uuid) {
        const target = headerUuids.get(dep.uuid);
        if (!target) add('info', file, `Depends on pack ${dep.uuid} which is not part of this project`);
        else if (JSON.stringify(target.manifest.header.version) !== JSON.stringify(dep.version)) {
          add('warning', file, `Dependency on ${target.name} uses version ${JSON.stringify(dep.version)} but that pack is ${JSON.stringify(target.manifest.header.version)} (builds stamp versions from project.json, so this is fixed when packaging)`);
        }
      }
    }
  }
  if (bp?.scriptEntry && !scriptVersions['@minecraft/server']) add('error', `${bp.dir}/manifest.json`, 'Script module present but no dependency on @minecraft/server');

  // Texture registries + language files (resource pack).
  const itemTextures = new Map();
  const terrainTextures = new Map();
  const lang = new Map();
  for (const pack of packs.filter((p) => p.kind === 'rp')) {
    for (const [registry, map] of [['textures/item_texture.json', itemTextures], ['textures/terrain_texture.json', terrainTextures]]) {
      const reg = jsonCache.get(`${pack.dir}/${registry}`);
      if (!reg) continue;
      for (const [key, entry] of Object.entries(reg.texture_data || {})) {
        map.set(key, entry);
        for (const tp of texturePaths(entry)) {
          const found = TEXTURE_EXT.some((ext) => fileSet.has(`${pack.dir}/${tp}${ext}`)) || fileSet.has(`${pack.dir}/${tp}`);
          if (!found) add(tp.includes(namespace || '\0') ? 'error' : 'warning', `${pack.dir}/${registry}`, `Texture "${key}" points to ${tp} but no ${tp}.png exists in this pack (fine only for vanilla textures)`);
        }
      }
    }
    const langFile = `${pack.dir}/texts/en_US.lang`;
    if (fileSet.has(langFile)) {
      const lines = (await ws.readText(langFile)).split(/\r?\n/);
      lines.forEach((line, i) => {
        const t = line.trim();
        if (!t || t.startsWith('##')) return;
        const eq = t.indexOf('=');
        if (eq < 1) return add('warning', langFile, `Line ${i + 1} is not "key=value": ${t.slice(0, 60)}`);
        const key = t.slice(0, eq);
        if (lang.has(key)) add('warning', langFile, `Duplicate key ${key} (line ${i + 1})`);
        lang.set(key, t.slice(eq + 1));
      });
      if (!fileSet.has(`${pack.dir}/texts/languages.json`)) add('warning', `${pack.dir}/texts`, 'texts/languages.json is missing (should be ["en_US"])');
    }
  }
  const checkLang = (file, key) => {
    if (typeof key !== 'string' || !rp) return;
    const looksLikeKey = /^[\w.:-]+$/.test(key) && key.includes('.');
    if (looksLikeKey && !lang.has(key)) add('warning', file, `Display name key "${key}" is missing from RP/texts/en_US.lang - players will see the raw key`);
  };

  // Behavior pack content.
  const ids = { item: new Map(), block: new Map(), entity: new Map() };
  const geometry = new Set();
  const renderControllers = new Set(['controller.render.default']);
  const clientEntities = new Map();
  for (const [file, data] of jsonCache) {
    for (const g of data?.['minecraft:geometry'] || []) if (g?.description?.identifier) geometry.add(g.description.identifier);
    for (const id of Object.keys(data?.render_controllers || {})) renderControllers.add(id);
    const ce = data?.['minecraft:client_entity'];
    if (ce?.description?.identifier) clientEntities.set(ce.description.identifier, { file, ce });
    for (const kind of ['item', 'block', 'entity']) {
      const def = data?.[`minecraft:${kind}`];
      const id = def?.description?.identifier;
      if (!id) continue;
      if (ids[kind].has(id)) add('error', file, `Duplicate ${kind} identifier ${id} (also in ${ids[kind].get(id).file})`);
      ids[kind].set(id, { file, def });
      const [ns] = id.split(':');
      if (!id.includes(':')) add('error', file, `Identifier "${id}" needs a namespace, e.g. "${namespace || 'studio'}:${id}"`);
      else if (ns === 'minecraft' && kind !== 'entity') add('error', file, `Custom ${kind}s cannot use the minecraft namespace (${id})`);
      else if (namespace && ns !== namespace && ns !== 'minecraft') add('info', file, `${id} uses namespace "${ns}" but the project namespace is "${namespace}"`);
      if (!def.components && kind !== 'entity') add('warning', file, `${id} has no components`);
      if (!data.format_version) add('warning', file, 'format_version is missing');
    }
  }
  for (const [id, { file, def }] of ids.item) {
    const c = def.components || {};
    const key = iconKey(c['minecraft:icon']);
    if (!key) add('warning', file, `${id} has no minecraft:icon - it will be invisible in the inventory`);
    else if (rp && !itemTextures.has(key)) add(key.startsWith(namespace || '\0') ? 'error' : 'warning', file, `Icon "${key}" is not defined in RP/textures/item_texture.json`);
    checkLang(file, c['minecraft:display_name']?.value);
  }
  for (const [id, { file, def }] of ids.block) {
    const c = def.components || {};
    for (const [face, inst] of Object.entries(c['minecraft:material_instances'] || {})) {
      if (inst?.texture && rp && !terrainTextures.has(inst.texture)) {
        add(inst.texture.startsWith(namespace || '\0') ? 'error' : 'warning', file, `material_instances["${face}"] texture "${inst.texture}" is not defined in RP/textures/terrain_texture.json`);
      }
    }
    checkLang(file, c['minecraft:display_name']);
    const loot = c['minecraft:loot'];
    if (typeof loot === 'string' && bp && !fileSet.has(`${bp.dir}/${loot}`)) add('error', file, `Loot table ${loot} does not exist in the behavior pack`);
  }
  for (const [id, { file, def }] of ids.entity) {
    const loot = def.components?.['minecraft:loot']?.table;
    if (typeof loot === 'string' && bp && !fileSet.has(`${bp.dir}/${loot}`)) add('error', file, `Loot table ${loot} does not exist in the behavior pack`);
    if (!id.startsWith('minecraft:') && rp && !clientEntities.has(id) && !def.description?.runtime_identifier) {
      add('warning', file, `${id} has no client entity in the resource pack (RP/entity/*.json) - it will be invisible`);
    }
  }
  for (const [id, { file, ce }] of clientEntities) {
    const d = ce.description || {};
    for (const g of Object.values(d.geometry || {})) if (!g.startsWith('geometry.humanoid') && !geometry.has(g) && !/^geometry\.(player|zombie|pig|cow|chicken|skeleton)/.test(g)) add('warning', file, `${id}: geometry "${g}" not found in RP/models`);
    for (const t of Object.values(d.textures || {})) {
      if (rp && !TEXTURE_EXT.some((ext) => fileSet.has(`${rp.dir}/${t}${ext}`)) && t.includes(namespace || '\0')) add('error', file, `${id}: texture ${t}.png not found`);
    }
    for (const rc of d.render_controllers || []) {
      const rcId = typeof rc === 'string' ? rc : Object.keys(rc)[0];
      if (!renderControllers.has(rcId)) add('warning', file, `${id}: render controller "${rcId}" not found`);
    }
    if (!ids.entity.has(id) && !id.startsWith('minecraft:')) add('warning', file, `Client entity ${id} has no matching behavior pack entity`);
  }

  // Recipes + loot tables reference real items.
  const known = (item) => {
    const name = typeof item === 'string' ? item : item?.item ?? item?.name;
    if (!name || typeof name !== 'string') return true;
    const base = name.split(':').length > 2 ? name.split(':').slice(0, 2).join(':') : name;
    if (!base.includes(':') || base.startsWith('minecraft:')) return true;
    return ids.item.has(base) || ids.block.has(base) || ids.entity.has(base.replace(/_spawn_egg$/, ''));
  };
  const recipeIds = new Map();
  for (const [file, data] of jsonCache) {
    if (!bp || !file.startsWith(`${bp.dir}/recipes/`)) continue;
    const kind = Object.keys(data).find((k) => k.startsWith('minecraft:recipe_'));
    if (!kind) { add('warning', file, 'No minecraft:recipe_* object found'); continue; }
    const r = data[kind];
    const rid = r.description?.identifier;
    if (!rid) add('error', file, 'Recipe is missing description.identifier');
    else if (recipeIds.has(rid)) add('error', file, `Duplicate recipe identifier ${rid}`);
    else recipeIds.set(rid, file);
    const refs = [...[].concat(r.result ?? []), ...Object.values(r.key || {}), ...(r.ingredients || []), r.input, r.output].filter(Boolean);
    for (const ref of refs) if (!known(ref)) add('error', file, `Recipe references unknown item ${JSON.stringify(ref.item ?? ref)}`);
    if (kind === 'minecraft:recipe_shaped' && Array.isArray(r.pattern)) {
      const symbols = new Set(r.pattern.join('').replace(/ /g, ''));
      for (const s of symbols) if (!r.key?.[s]) add('error', file, `Pattern symbol "${s}" has no entry in "key"`);
    }
  }
  const walkLoot = (file, node) => {
    if (Array.isArray(node)) return node.forEach((n) => walkLoot(file, n));
    if (!node || typeof node !== 'object') return;
    if (node.type === 'item' && node.name && !known(node.name)) add('error', file, `Loot table drops unknown item ${node.name}`);
    if (node.type === 'loot_table' && node.name && bp && !fileSet.has(`${bp.dir}/${node.name}`)) add('error', file, `Nested loot table ${node.name} does not exist`);
    Object.values(node).forEach((v) => walkLoot(file, v));
  };
  for (const [file, data] of jsonCache) if (bp && file.startsWith(`${bp.dir}/loot_tables/`)) walkLoot(file, data);

  // Functions.
  if (bp) {
    const tick = jsonCache.get(`${bp.dir}/functions/tick.json`);
    for (const fn of tick?.values || []) {
      if (!fileSet.has(`${bp.dir}/functions/${fn}.mcfunction`)) add('error', `${bp.dir}/functions/tick.json`, `Function ${fn} does not exist (expected functions/${fn}.mcfunction)`);
    }
  }

  // Scripts: syntax, imports and API-version pitfalls.
  const serverMajor = majorOf(scriptVersions['@minecraft/server']);
  for (const f of files) {
    if (!bp || !f.path.startsWith(`${bp.dir}/scripts/`)) continue;
    if (f.path.endsWith('.ts')) { add('warning', f.path, 'Bedrock only runs JavaScript. Compile TypeScript to .js (or write .js directly).'); continue; }
    if (!f.path.endsWith('.js')) continue;
    const code = await ws.readText(f.path);
    const err = syntaxCheck(code);
    if (err) add('error', f.path, `Syntax error: ${err}`);
    for (const { spec, line } of importsOf(code)) {
      if (spec.startsWith('.')) {
        const target = normalizeRel(path.posix.join(path.posix.dirname(f.path), spec));
        if (!fileSet.has(target)) {
          const hint = fileSet.has(`${target}.js`) ? ` - Bedrock needs the full file name: "${spec}.js"` : '';
          add('error', f.path, `Line ${line}: import "${spec}" does not resolve to a file${hint}`);
        }
      } else if (spec.startsWith('@minecraft/')) {
        if (!scriptVersions[spec]) add('error', f.path, `Line ${line}: imports ${spec} but BP/manifest.json has no dependency on it`);
      } else {
        add('error', f.path, `Line ${line}: "${spec}" is not available in Minecraft (only @minecraft/* modules and relative .js files; no npm packages unless bundled)`);
      }
    }
    if (serverMajor >= 2) {
      if (/\bworldInitialize\b/.test(code)) add('error', f.path, 'worldInitialize was removed in @minecraft/server 2.x. Use system.beforeEvents.startup (custom components/commands) or world.afterEvents.worldLoad.');
      if (/\brunCommandAsync\s*\(/.test(code)) add('warning', f.path, 'runCommandAsync is not available in @minecraft/server 2.x - use runCommand.');
    } else if (serverMajor === 1 && /system\.beforeEvents\.startup/.test(code)) {
      add('error', f.path, 'system.beforeEvents.startup needs @minecraft/server 2.0.0 or newer');
    }
    if (/\bsetInterval\s*\(|\bsetTimeout\s*\(/.test(code)) add('error', f.path, 'setInterval/setTimeout do not exist in Minecraft - use system.runInterval / system.runTimeout');
    if (/\brequire\s*\(/.test(code)) add('error', f.path, 'require() is not available - use ES module imports');
  }

  // Textures sanity.
  for (const f of files) {
    if (!f.path.endsWith('.png')) continue;
    const buf = await ws.readBuffer(f.path);
    const size = pngSize(buf);
    if (!size) add('error', f.path, 'File has a .png extension but is not a PNG');
    else if (f.path.includes('/textures/') && (size.width > 1024 || size.height > 1024)) add('warning', f.path, `Large texture ${size.width}x${size.height} - keep item/block textures at 16x16 (or 32x32) for performance`);
  }
  for (const f of files) if (/(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(f.path)) add('info', f.path, 'System file will be excluded from builds');

  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.level]++;
  return {
    ok: counts.error === 0,
    counts,
    issues,
    summary: {
      packs: packs.map((p) => ({ dir: p.dir, kind: p.kind ?? 'unknown', name: p.manifest?.header?.name })),
      items: ids.item.size,
      blocks: ids.block.size,
      entities: ids.entity.size,
      recipes: recipeIds.size,
      scriptModules: scriptVersions,
    },
  };
}

export function formatReport(report) {
  const lines = [`${report.ok ? 'PASS' : 'FAIL'}: ${report.counts.error} errors, ${report.counts.warning} warnings, ${report.counts.info} notes`];
  if (report.summary) {
    const s = report.summary;
    lines.push(`Content: ${s.items} items, ${s.blocks} blocks, ${s.entities} entities, ${s.recipes} recipes. Packs: ${s.packs.map((p) => `${p.dir} (${p.kind})`).join(', ') || 'none'}`);
  }
  for (const i of report.issues) lines.push(`[${i.level}] ${i.file}: ${i.message}`);
  return lines.join('\n');
}
