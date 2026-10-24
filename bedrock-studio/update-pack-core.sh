#!/usr/bin/env bash
# =====================================================================
# Bedrock-Studio update: pack-core  (PHASE 1 — core only, no UI)
# ---------------------------------------------------------------------
# Installs: project format + .ai/ index + validators + patch API +
#           compiler + .mcaddon packer + golden test + `studio` CLI.
# Needs:    Node.js 20+ (Termux: pkg install nodejs). No npm packages.
# Usage:    bash update-pack-core.sh [install_dir]
#           default install_dir: $HOME/bedrock-studio
# Re-run:   safe. Changed files are backed up to
#           <install_dir>/.backup/pack-core-<time>/ before overwrite.
# Files:    24
# =====================================================================
set -euo pipefail

UPDATE_ID="pack-core"
UPDATE_VERSION="1.0.0"
DEST="${1:-$HOME/bedrock-studio}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$DEST/.backup/$UPDATE_ID-$STAMP"
NEW=0; CHANGED=0; SAME=0

say() { printf '[%s] %s\n' "$UPDATE_ID" "$*"; }
die() { printf '[%s] ERROR: %s\n' "$UPDATE_ID" "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node not found. Termux: pkg install nodejs"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR found; need 20 or newer"

mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
BACKUP="$DEST/.backup/$UPDATE_ID-$STAMP"
say "installing $UPDATE_ID $UPDATE_VERSION into $DEST"

# place <rel> <tmpfile>: move into place, back up the old file if it differs
place() {
  local rel="$1" tmp="$2" dst="$DEST/$1"
  if [ -f "$dst" ]; then
    if cmp -s "$tmp" "$dst"; then rm -f "$tmp"; SAME=$((SAME + 1)); return; fi
    mkdir -p "$(dirname "$BACKUP/$rel")"
    cp -p "$dst" "$BACKUP/$rel"
    CHANGED=$((CHANGED + 1))
  else
    NEW=$((NEW + 1))
  fi
  mv -f "$tmp" "$dst"
}
# put <rel> <<'EOF' ... EOF   (text file from heredoc)
put() {
  mkdir -p "$(dirname "$DEST/$1")"
  local tmp="$DEST/$1.tmp-$$"
  cat > "$tmp"
  place "$1" "$tmp"
}
# put_b64 <rel> <base64>   (binary file)
put_b64() {
  mkdir -p "$(dirname "$DEST/$1")"
  local tmp="$DEST/$1.tmp-$$"
  node -e 'require("fs").writeFileSync(process.argv[1], Buffer.from(process.argv[2], "base64"))' "$tmp" "$2"
  place "$1" "$tmp"
}

put 'README.md' <<'__STUDIO_EOF__'
# Bedrock-Studio core (phase 1)

A pack workspace that AI agents can read and edit safely, plus a compiler that
makes a working `.mcaddon`. Plain Node.js (built-in modules only). Made for Termux.

```
./studio check  [dir]   validate, write .ai/ (map, index, schemas, errors.json)
./studio build  [dir]   check + compile to build/BP and build/RP
./studio pack   [dir]   build + re-check + dist/<id>-<version>.mcaddon + dist/report.md
./studio test           golden pack test (must always pass)
./studio help           all commands (set, add, delete, patch, new, find, index, watch, init, uuid)
```

Try it: `./studio pack examples/golden-tycoon`, then open the `.mcaddon` with
Minecraft (Termux: `termux-open examples/golden-tycoon/dist/golden_tycoon-1.0.0.mcaddon`).

## Project format (the source layer — agents edit only this)

```
project.json          namespace, version, UUIDs, script modules
specs/<id>.json       design intent (not compiled)
items/<id>.json       blocks/  entities/  recipes/  loot/  lang/<en_US>.json
scripts/<id>.js       code, with a /* @studio {...} */ JSON header on top
textures/_index.json  texture id -> PNG file in textures/
.ai/                  auto-made after every change. Never edit by hand.
```

Every file has `$schema, id, name, props, refs, ai_note, status`.
- One thing per file. Filename = id. Ids are unique across the whole project.
- Keep files under ~150 lines.
- Links use ids, never paths. Vanilla things use full ids: `minecraft:gold_nugget`.
- `refs` lists every id the thing links to.
- `status`: draft | wip | ready | deprecated (deprecated is not compiled).
- Scripts import ids from the generated `./_ids.js`: `ids.coin` -> `"tyc:coin"`.

## Rules for agents

1. Read `.ai/map.md` first, then `.ai/index.json` to find files.
2. Change things with the patch API, never by rewriting a file:
   `studio set coin props.max_stack 16` · `studio add coin props.tags '"rare"'` ·
   `studio delete coin props.glint` · `studio patch ops.json` (all-or-nothing batch).
   Patches that add schema errors are refused.
3. New thing: `studio new item ruby "Ruby"`, then fill it with `set`.
4. After work run `studio check`. Fix everything in `.ai/errors.json`
   (`file`, `path` = JSON pointer, `code`, `hint`).
5. Field rules are in `.ai/schemas/<type>.json`.

## Notes

- Same input gives byte-identical `build/` and `.mcaddon` (fixed zip dates,
  sorted entries). `build/build-info.json` holds the source and build hashes.
- `studio watch` polls mtimes (no `fs.watch`); default every 2 s.
- Needs Node 20+ (tested on 22). Uses `zlib.crc32` when present (Node 20.15+/22.2+), else a table.
__STUDIO_EOF__
put 'examples/golden-tycoon/.gitignore' <<'__STUDIO_EOF__'
build/
dist/
__STUDIO_EOF__
put 'examples/golden-tycoon/items/coin.json' <<'__STUDIO_EOF__'
{
  "$schema": "studio/item@1",
  "id": "coin",
  "name": "Tycoon Coin",
  "props": {
    "texture": "coin",
    "max_stack": 64,
    "category": "items",
    "tags": ["tycoon"]
  },
  "refs": ["coin"],
  "ai_note": "Currency. Use (tap/right-click) to cash in 1 coin = 1 money. Script: main.",
  "status": "ready"
}
__STUDIO_EOF__
put 'examples/golden-tycoon/lang/en_US.json' <<'__STUDIO_EOF__'
{
  "$schema": "studio/lang@1",
  "id": "en_US",
  "name": "English (US)",
  "props": {
    "entries": {
      "tyc.msg.cashed": "§6+1 money§r (balance: %s)"
    }
  },
  "refs": [],
  "ai_note": "Item names are auto-made from each item's name; add only extra strings here.",
  "status": "ready"
}
__STUDIO_EOF__
put 'examples/golden-tycoon/project.json' <<'__STUDIO_EOF__'
{
  "$schema": "studio/project@1",
  "id": "golden_tycoon",
  "name": "Golden Tycoon",
  "props": {
    "namespace": "tyc",
    "version": [1, 0, 0],
    "min_engine_version": [1, 21, 0],
    "description": "Studio golden test pack: craft coins, cash them in.",
    "icon": "coin",
    "uuids": {
      "bp_header": "4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e01",
      "bp_data": "4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e02",
      "bp_script": "4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e03",
      "rp_header": "4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e04",
      "rp_resources": "4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e05"
    },
    "script_entry": "main",
    "script_modules": {
      "@minecraft/server": "1.12.0"
    }
  },
  "refs": ["coin", "main"],
  "ai_note": "Golden test pack. Must always build. Change only with a matching test update.",
  "status": "ready"
}
__STUDIO_EOF__
put 'examples/golden-tycoon/recipes/coin_from_gold.json' <<'__STUDIO_EOF__'
{
  "$schema": "studio/recipe@1",
  "id": "coin_from_gold",
  "name": "Mint coins",
  "props": {
    "kind": "shapeless",
    "ingredients": ["minecraft:gold_nugget"],
    "result": {
      "item": "coin",
      "count": 4
    }
  },
  "refs": ["coin"],
  "ai_note": "1 gold nugget -> 4 coins. Works in the 2x2 inventory grid.",
  "status": "ready"
}
__STUDIO_EOF__
put 'examples/golden-tycoon/scripts/main.js' <<'__STUDIO_EOF__'
/* @studio
{
  "$schema": "studio/script@1",
  "id": "main",
  "name": "Tycoon core loop",
  "props": { "summary": "Use a coin to cash it in. Money shows on the sidebar." },
  "refs": ["coin"],
  "ai_note": "Entry script. Item ids come from ./_ids.js (generated). Stable @minecraft/server APIs only.",
  "status": "ready"
}
*/
import { world, DisplaySlotId } from "@minecraft/server";
import { ids } from "./_ids.js";

const OBJECTIVE = "tyc_money";

function moneyBoard() {
  return world.scoreboard.getObjective(OBJECTIVE) ?? world.scoreboard.addObjective(OBJECTIVE, "Money");
}

function getMoney(board, player) {
  try {
    return board.getScore(player) ?? 0;
  } catch (e) {
    return 0; // player not on the board yet
  }
}

// Remove one item of typeId from the player's inventory.
function takeOne(player, typeId) {
  const inv = player.getComponent("minecraft:inventory");
  const box = inv && inv.container;
  if (!box) return false;
  for (let i = 0; i < box.size; i++) {
    const stack = box.getItem(i);
    if (!stack || stack.typeId !== typeId) continue;
    if (stack.amount > 1) {
      stack.amount -= 1;
      box.setItem(i, stack);
    } else {
      box.setItem(i, undefined);
    }
    return true;
  }
  return false;
}

world.afterEvents.itemUse.subscribe((ev) => {
  if (!ev.itemStack || ev.itemStack.typeId !== ids.coin) return;
  const player = ev.source;
  if (!takeOne(player, ids.coin)) return;
  const board = moneyBoard();
  const money = getMoney(board, player) + 1;
  board.setScore(player, money);
  world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: board });
  player.sendMessage({ rawtext: [{ translate: "tyc.msg.cashed", with: [String(money)] }] });
});
__STUDIO_EOF__
put 'examples/golden-tycoon/specs/tycoon.json' <<'__STUDIO_EOF__'
{
  "$schema": "studio/spec@1",
  "id": "tycoon",
  "name": "Tiny tycoon loop",
  "props": {
    "summary": "Smallest useful tycoon: make coins from gold, cash them in for money.",
    "requirements": [
      "Item coin, stack 64, own texture.",
      "Recipe: 1 gold nugget -> 4 coins.",
      "Using a coin removes it and adds 1 to the money scoreboard, shown on the sidebar."
    ],
    "acceptance": [
      "studio check: 0 errors, 0 warnings.",
      "Pack imports into Minecraft Bedrock and the loop works in survival."
    ]
  },
  "refs": ["coin", "coin_from_gold", "main"],
  "ai_note": "Design intent for the golden pack. Not compiled.",
  "status": "ready"
}
__STUDIO_EOF__
put 'examples/golden-tycoon/textures/_index.json' <<'__STUDIO_EOF__'
{
  "$schema": "studio/textures@1",
  "id": "_index",
  "name": "Textures",
  "props": {
    "textures": [
      {
        "id": "coin",
        "file": "coin.png",
        "kind": "item"
      }
    ]
  },
  "refs": [],
  "ai_note": "The only place where files are named. Everything else links by texture id.",
  "status": "ready"
}
__STUDIO_EOF__
put_b64 'examples/golden-tycoon/textures/coin.png' 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAbUlEQVR42mNgoAXoTxL4jw2TpPn/ozw4fr1NgzhD0DXCNCNjnIagaz7SI4GC8RqC7myYBpg4iI1sCIZ3sGlGNwCbIdQ3AJdTiTIAlyKiDcCmkOhARHcFTAPR0YjLEGyYqNSIzSCy8gNZmYlUAADOqoeC5gHPqwAAAABJRU5ErkJggg=='
put 'src/ai.js' <<'__STUDIO_EOF__'
'use strict';
// Writes the .ai/ folder: map.md, index.json, schemas/, errors.json, scan.json.
const path = require('path');
const fs = require('fs');
const { toJson, writeIfChanged, sha256, mkdirp } = require('./util');
const { SCHEMAS } = require('./schemas');
const { TYPES, scan, textureList } = require('./project');
const { counts } = require('./validate');

const scanHash = (root) => sha256(JSON.stringify(scan(root)));

// mtime scan: true when the source changed since the last .ai write.
function isStale(root) {
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(root, '.ai', 'scan.json'), 'utf8'));
    return prev.hash !== scanHash(root);
  } catch (e) { return true; }
}

const firstLine = (s, n = 90) => {
  const t = String(s || '').split('\n')[0].trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

function buildIndex(proj) {
  const things = proj.docs.filter((d) => d.data && typeof d.data.id === 'string').map((d) => ({
    id: d.data.id, type: d.type, file: d.rel, name: d.data.name || '',
    status: d.data.status || '', refs: Array.isArray(d.data.refs) ? d.data.refs.slice() : [], used_by: [],
  }));
  const textures = textureList(proj).map((t) => ({ id: t.id, type: 'texture', file: `textures/${t.file}`, kind: t.kind, used_by: [] }));
  const thingById = new Map(things.map((x) => [x.id, x]));
  const texById = new Map(textures.map((x) => [x.id, x]));
  for (const t of things) for (const r of t.refs) {
    const own = thingById.get(r);
    const target = own && own !== t ? own : texById.get(r);
    if (target && !target.used_by.includes(t.id)) target.used_by.push(t.id);
  }
  const order = Object.fromEntries(TYPES.map((t, i) => [t.type, i]));
  things.sort((a, b) => order[a.type] - order[b.type] || a.id.localeCompare(b.id));
  textures.sort((a, b) => a.id.localeCompare(b.id));
  const p = proj.project && proj.project.data;
  return {
    $schema: 'studio/index@1',
    project: p ? { id: p.id, name: p.name, namespace: p.props && p.props.namespace, file: 'project.json' } : null,
    things, textures,
  };
}

function mapMd(proj, index, issues) {
  const c = counts(issues);
  const p = index.project || {};
  const L = [
    `# Map: ${p.name || '?'} (${p.namespace || '?'})`,
    '',
    'Auto-made by studio after every change. Do not edit.',
    `Things: ${index.things.length}. Textures: ${index.textures.length}. Errors: ${c.errors}. Warnings: ${c.warnings} (see errors.json).`,
    'Edit with: studio set|add|delete <id> <path> <json>. Links use ids, never paths.',
  ];
  const notes = new Map(proj.docs.filter((d) => d.data).map((d) => [d.data.id, d.data.ai_note]));
  for (const t of TYPES) {
    const list = index.things.filter((x) => x.type === t.type);
    if (!list.length) continue;
    L.push('', `## ${t.dir}`);
    for (const x of list) {
      const note = firstLine(notes.get(x.id));
      L.push(`- ${x.id} [${x.status}] ${x.name}${note ? ' — ' + note : ''}${x.refs.length ? ' → ' + x.refs.join(', ') : ''}`);
    }
  }
  if (index.textures.length) {
    L.push('', '## textures');
    for (const t of index.textures) L.push(`- ${t.id} (${t.kind}) ${t.file}`);
  }
  return L.join('\n') + '\n';
}

// Write everything. Returns the list of .ai files that changed.
function writeAi(proj, issues) {
  const dir = path.join(proj.root, '.ai');
  mkdirp(path.join(dir, 'schemas'));
  const index = buildIndex(proj);
  const changed = [];
  const w = (rel, data) => { if (writeIfChanged(path.join(dir, rel), data)) changed.push(rel); };
  w('index.json', toJson(index));
  w('map.md', mapMd(proj, index, issues));
  w('errors.json', toJson(issues));
  for (const [name, s] of Object.entries(SCHEMAS)) w(`schemas/${name}.json`, toJson({ $schema: 'http://json-schema.org/draft-07/schema#', ...s }));
  w('scan.json', toJson({ hash: scanHash(proj.root) }));
  return changed;
}

module.exports = { writeAi, buildIndex, isStale };
__STUDIO_EOF__
put 'src/buildcheck.js' <<'__STUDIO_EOF__'
'use strict';
// Checks the compiled build/ on disk: JSON, manifests, links between files.
const fs = require('fs');
const path = require('path');
const { walk, parseJson } = require('./util');
const { UUID } = require('./schemas');
const { MODULES } = require('./scriptapi');

const isVer = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n) && n >= 0);
const isUuid = (u) => typeof u === 'string' && new RegExp(UUID).test(u);

// kind: 'BP' | 'RP'. Returns [{path, code, hint}]
function checkManifest(m, kind) {
  const out = [];
  const err = (p, code, hint) => out.push({ path: p, code, hint });
  if (!m || typeof m !== 'object') { err('', 'MANIFEST_INVALID', 'manifest is not an object'); return out; }
  if (m.format_version !== 2) err('/format_version', 'MANIFEST_FORMAT', 'format_version must be 2');
  const h = m.header || {};
  if (!h.name) err('/header/name', 'MANIFEST_FIELD', 'header.name is required');
  if (!isUuid(h.uuid)) err('/header/uuid', 'MANIFEST_UUID', 'header.uuid is not a UUID');
  if (!isVer(h.version)) err('/header/version', 'MANIFEST_VERSION', 'version must be [x, y, z]');
  if (!isVer(h.min_engine_version) || h.min_engine_version[0] < 1 || (h.min_engine_version[0] === 1 && h.min_engine_version[1] < 13)) {
    err('/header/min_engine_version', 'MANIFEST_ENGINE', 'min_engine_version must be >= [1, 13, 0] for format 2');
  }
  const mods = Array.isArray(m.modules) ? m.modules : [];
  if (!mods.length) err('/modules', 'MANIFEST_MODULES', 'at least one module is required');
  const want = kind === 'BP' ? ['data', 'script'] : ['resources'];
  const seen = new Set([String(h.uuid).toLowerCase()]);
  mods.forEach((mod, i) => {
    if (!want.includes(mod.type)) err(`/modules/${i}/type`, 'MANIFEST_MODULE_TYPE', `${kind} module type must be ${want.join(' or ')}`);
    if (!isUuid(mod.uuid)) err(`/modules/${i}/uuid`, 'MANIFEST_UUID', 'module uuid is not a UUID');
    else if (seen.has(mod.uuid.toLowerCase())) err(`/modules/${i}/uuid`, 'UUID_DUPLICATE', 'module uuid repeats another uuid');
    seen.add(String(mod.uuid).toLowerCase());
    if (!isVer(mod.version)) err(`/modules/${i}/version`, 'MANIFEST_VERSION', 'version must be [x, y, z]');
    if (mod.type === 'script') {
      if (mod.language !== 'javascript') err(`/modules/${i}/language`, 'MANIFEST_SCRIPT', 'language must be "javascript"');
      if (!/^scripts\/[^/]+\.js$/.test(mod.entry || '')) err(`/modules/${i}/entry`, 'MANIFEST_SCRIPT', 'entry must be scripts/<file>.js');
    }
  });
  (Array.isArray(m.dependencies) ? m.dependencies : []).forEach((d, i) => {
    if (d.module_name) {
      if (!(d.module_name in MODULES)) err(`/dependencies/${i}`, 'MANIFEST_DEP', `unknown script module ${d.module_name}`);
      if (!/^\d+\.\d+\.\d+(-beta)?$/.test(d.version || '')) err(`/dependencies/${i}/version`, 'SCRIPT_API_VERSION', 'module version must be "x.y.z" or "x.y.z-beta"');
    } else if (!isUuid(d.uuid) || !isVer(d.version)) err(`/dependencies/${i}`, 'MANIFEST_DEP', 'pack dependency needs uuid and [x, y, z] version');
  });
  if (kind === 'BP' && mods.some((x) => x.type === 'script') && !(m.dependencies || []).some((d) => d.module_name === '@minecraft/server')) {
    err('/dependencies', 'MANIFEST_DEP', 'script module needs a @minecraft/server dependency');
  }
  return out;
}

// Verify build/<BP|RP> on disk. Returns issues in the errors.json format.
function verifyBuild(root) {
  const dir = path.join(root, 'build');
  const out = [];
  const add = (file, p, code, hint) => out.push({ file: `build/${file}`, path: p, code, hint, severity: 'error' });
  const json = {};
  for (const pack of ['BP', 'RP']) {
    const files = walk(path.join(dir, pack));
    if (!files.length) { add(pack, '', 'BUILD_MISSING', 'run: studio build'); continue; }
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      const r = parseJson(fs.readFileSync(path.join(dir, pack, f), 'utf8'));
      if (r.error) add(`${pack}/${f}`, '', 'JSON_SYNTAX', `line ${r.error.line}: ${r.error.msg}`);
      else json[`${pack}/${f}`] = r.value;
    }
  }
  const has = (rel) => fs.existsSync(path.join(dir, rel));
  const bp = json['BP/manifest.json'], rp = json['RP/manifest.json'];
  if (!bp) add('BP/manifest.json', '', 'MANIFEST_MISSING', 'BP manifest missing');
  if (!rp) add('RP/manifest.json', '', 'MANIFEST_MISSING', 'RP manifest missing');
  if (bp) for (const e of checkManifest(bp, 'BP')) add('BP/manifest.json', e.path, e.code, e.hint);
  if (rp) for (const e of checkManifest(rp, 'RP')) add('RP/manifest.json', e.path, e.code, e.hint);
  if (bp && rp) {
    const dep = (bp.dependencies || []).find((d) => d.uuid);
    if (!dep || dep.uuid !== rp.header.uuid) add('BP/manifest.json', '/dependencies', 'MANIFEST_DEP', 'BP must depend on the RP header uuid');
    if (bp.header.uuid === rp.header.uuid) add('BP/manifest.json', '/header/uuid', 'UUID_DUPLICATE', 'BP and RP header uuids are the same');
    for (const mod of bp.modules || []) if (mod.type === 'script' && !has(`BP/${mod.entry}`)) add('BP/manifest.json', '/modules', 'BUILD_SCRIPT_MISSING', `entry ${mod.entry} not in build`);
  }
  // atlas entries -> png files; item icons -> atlas keys; block textures -> terrain atlas
  const atlas = (rel) => (json[rel] && json[rel].texture_data) || {};
  const items = atlas('RP/textures/item_texture.json'), terrain = atlas('RP/textures/terrain_texture.json');
  for (const [rel, a] of [['textures/item_texture.json', items], ['textures/terrain_texture.json', terrain]]) {
    for (const [k, v] of Object.entries(a)) if (!has(`RP/${v.textures}.png`)) add(`RP/${rel}`, `/texture_data/${k}`, 'BUILD_TEXTURE_MISSING', `${v.textures}.png not in build`);
  }
  for (const [rel, data] of Object.entries(json)) {
    const it = data['minecraft:item'];
    const icon = it && it.components && it.components['minecraft:icon'];
    const iconKey = icon && (typeof icon === 'string' ? icon : (icon.textures && icon.textures.default) || icon.texture);
    if (it && !(iconKey in items)) add(rel, '/minecraft:item/components/minecraft:icon', 'BUILD_ICON_MISSING', `icon "${iconKey}" not in item_texture.json`);
    const bl = data['minecraft:block'];
    const mi = bl && bl.components && bl.components['minecraft:material_instances'];
    for (const [face, m] of Object.entries(mi || {})) if (!(m.texture in terrain)) add(rel, `/material_instances/${face}`, 'BUILD_TEXTURE_MISSING', `"${m.texture}" not in terrain_texture.json`);
    const loot = bl && bl.components && bl.components['minecraft:loot'];
    if (loot && !has(`BP/${loot}`)) add(rel, '/minecraft:loot', 'BUILD_LOOT_MISSING', `${loot} not in build`);
  }
  if (!has('RP/texts/en_US.lang')) add('RP/texts/en_US.lang', '', 'BUILD_LANG_MISSING', 'en_US.lang missing');
  return out;
}

module.exports = { checkManifest, verifyBuild };
__STUDIO_EOF__
put 'src/cli.js' <<'__STUDIO_EOF__'
#!/usr/bin/env node
'use strict';
// studio CLI. Exit codes: 0 ok, 1 errors found, 2 bad usage.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const studio = require('./studio');
const { patch, create, remove } = require('./patch');
const { findRoot, scan } = require('./project');
const { writeAi } = require('./ai');
const { load } = require('./project');
const { validate } = require('./validate');
const { sha256, writeAtomic, toJson, mkdirp } = require('./util');

const HELP = `studio — Bedrock pack workspace (phase 1: core)

  studio check  [dir]                 validate source, write .ai/ + .ai/errors.json
  studio build  [dir]                 check + compile to build/BP and build/RP
  studio pack   [dir]                 build + verify + write dist/<id>-<ver>.mcaddon + report
  studio index  [dir] [--force]       rebuild .ai/ if the mtime scan sees changes
  studio watch  [dir] [--interval ms] poll mtimes (no fs.watch), re-index on change
  studio find   <text>                search .ai/index.json (id, name, type, file)
  studio set    <id> <path> <json>    set a value      e.g. studio set coin props.max_stack 16
  studio add    <id> <path> <json>    append / insert  e.g. studio add coin props.tags '"tycoon"'
  studio delete <id> [path]           remove a value, or the whole thing if no path
  studio patch  <ops.json|->          batch: [{"op":"set","id":"coin","path":"name","value":"Gold Coin"}]
  studio new    <type> <id> [name]    new thing (item block entity recipe loot script lang spec)
  studio init   <dir> --ns <ns> [--name "My Pack"]   new empty project with fresh UUIDs
  studio uuid   [n]                   print new UUIDs
  studio test                         run the golden pack test

Options: -p <dir> project dir (default: nearest project.json up from cwd)
         --json  machine-readable output     --force  skip safety checks
Paths: dot form (props.key.0) or JSON pointer (/props/entries/item.x:y.name).
Values are JSON; if it does not parse it is used as a plain string.`;

function parseArgs(argv) {
  const a = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '--json' || s === '--force') a.flags[s.slice(2)] = true;
    else if (s === '-p' || s === '--project' || s === '--interval' || s === '--ns' || s === '--name') a.flags[s.replace(/^-+/, '')] = argv[++i];
    else a._.push(s);
  }
  return a;
}

const val = (s) => { if (s === undefined) return undefined; try { return JSON.parse(s); } catch (e) { return s; } };
const sevTag = { error: 'ERR ', warn: 'warn' };

function printIssues(list) {
  for (const i of list) console.log(`  ${sevTag[i.severity] || i.severity} ${i.code}  ${i.file}${i.path ? ' ' + i.path : ''}${i.line ? ` (line ${i.line})` : ''}\n       ${i.hint}`);
}

function rootFrom(a, positional) {
  const start = a.flags.p || a.flags.project || positional || '.';
  const root = findRoot(start);
  if (!root) { console.error(`no project.json found from ${path.resolve(start)} (run: studio init <dir> --ns <ns>)`); process.exit(2); }
  return root;
}

function afterChange(root, r, json) {
  if (r.ok) {
    const proj = load(root);
    const issues = validate(proj);
    writeAi(proj, issues);
    r.errors = issues.filter((i) => i.severity === 'error').length;
  }
  if (json) console.log(JSON.stringify(r, null, 2));
  else if (r.ok) console.log(`ok: ${r.changed.join(', ')} (.ai updated, project errors: ${r.errors})`);
  else { console.log(`refused: ${r.error}`); if (r.issues) printIssues(r.issues); }
  process.exit(r.ok ? 0 : 1);
}

function report(r, json, label) {
  const issues = [...(r.issues || []), ...(r.build || [])];
  if (json) {
    const { proj, report: md, ...rest } = r;
    console.log(JSON.stringify({ ...rest, issues }, null, 2));
  } else {
    printIssues(issues);
    console.log(`${label}: ${r.errors || 0} errors, ${r.warnings || 0} warnings${r.build && r.build.length ? `, ${r.build.length} build errors` : ''}${r.stage ? ` [${r.stage}]` : ''}`);
    if (r.report) console.log('\n' + r.report);
  }
  process.exit(r.ok === false || r.errors ? 1 : 0);
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = a._;
  const json = !!a.flags.json;
  switch (cmd) {
    case 'check': return report(studio.check(rootFrom(a, rest[0])), json, 'check');
    case 'build': return report(studio.build(rootFrom(a, rest[0])), json, 'build');
    case 'pack': return report(studio.pack(rootFrom(a, rest[0])), json, 'pack');
    case 'index': {
      const r = studio.index(rootFrom(a, rest[0]), a.flags.force);
      console.log(r.fresh ? 'index: up to date' : `index: rebuilt (${r.errors} errors, ${r.warnings} warnings)`);
      return;
    }
    case 'watch': {
      const root = rootFrom(a, rest[0]);
      const ms = Math.max(500, Number(a.flags.interval) || 2000);
      let last = '';
      const tick = () => {
        const h = sha256(JSON.stringify(scan(root)));
        if (h !== last) {
          last = h;
          const r = studio.index(root, true);
          console.log(`${new Date().toISOString().slice(11, 19)} re-indexed: ${r.errors} errors, ${r.warnings} warnings`);
        }
        setTimeout(tick, ms);
      };
      console.log(`watching ${root} every ${ms} ms (Ctrl+C to stop)`);
      return tick();
    }
    case 'find': {
      const root = rootFrom(a);
      studio.index(root);
      const idx = JSON.parse(fs.readFileSync(path.join(root, '.ai', 'index.json'), 'utf8'));
      const q = (rest.join(' ') || '').toLowerCase();
      const hits = [...idx.things, ...idx.textures].filter((x) => [x.id, x.name, x.type, x.file].some((v) => String(v || '').toLowerCase().includes(q)));
      if (json) console.log(JSON.stringify(hits, null, 2));
      else for (const h of hits) console.log(`${h.type.padEnd(8)} ${h.id.padEnd(24)} ${h.file}${h.refs && h.refs.length ? '  → ' + h.refs.join(', ') : ''}`);
      return process.exit(hits.length ? 0 : 1);
    }
    case 'set': case 'add':
      if (rest.length < 3) break;
      return afterChange(rootFrom(a), patch(rootFrom(a), [{ op: cmd, id: rest[0], path: rest[1], value: val(rest.slice(2).join(' ')) }], a.flags), json);
    case 'delete':
      if (!rest[0]) break;
      return afterChange(rootFrom(a), rest[1] ? patch(rootFrom(a), [{ op: 'delete', id: rest[0], path: rest[1] }], a.flags) : remove(rootFrom(a), rest[0], a.flags), json);
    case 'patch': {
      if (!rest[0]) break;
      const text = rest[0] === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(rest[0], 'utf8');
      const ops = JSON.parse(text);
      return afterChange(rootFrom(a), patch(rootFrom(a), Array.isArray(ops) ? ops : [ops], a.flags), json);
    }
    case 'new':
      if (rest.length < 2) break;
      return afterChange(rootFrom(a), create(rootFrom(a), rest[0], rest[1], rest.slice(2).join(' ') || a.flags.name), json);
    case 'init': return init(rest[0], a.flags);
    case 'uuid': for (let i = 0; i < (Number(rest[0]) || 1); i++) console.log(crypto.randomUUID()); return;
    case 'test': return require('../test/golden.test.js');
    case undefined: case 'help': case '--help': case '-h': console.log(HELP); return;
    default: console.error(`unknown command "${cmd}"\n`);
  }
  console.error(HELP);
  process.exit(2);
}

function init(dir, flags) {
  if (!dir || !flags.ns) { console.error('usage: studio init <dir> --ns <namespace> [--name "My Pack"]'); process.exit(2); }
  const root = path.resolve(dir);
  if (fs.existsSync(path.join(root, 'project.json'))) { console.error(`${root}/project.json already exists`); process.exit(1); }
  const id = path.basename(root).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '') || 'pack';
  const u = () => crypto.randomUUID();
  const thing = (schema, tid, name, props) => ({ $schema: `studio/${schema}@1`, id: tid, name, props, refs: [], ai_note: '', status: 'draft' });
  writeAtomic(path.join(root, 'project.json'), toJson(thing('project', id, flags.name || id, {
    namespace: flags.ns, version: [1, 0, 0], min_engine_version: [1, 21, 0], description: '',
    uuids: { bp_header: u(), bp_data: u(), bp_script: u(), rp_header: u(), rp_resources: u() },
  })));
  writeAtomic(path.join(root, 'textures', '_index.json'), toJson(thing('textures', '_index', 'Textures', { textures: [] })));
  for (const d of ['specs', 'items', 'blocks', 'entities', 'recipes', 'loot', 'scripts', 'lang']) mkdirp(path.join(root, d));
  writeAtomic(path.join(root, '.gitignore'), 'build/\ndist/\n');
  studio.check(root);
  console.log(`created ${root}`);
}

main();
__STUDIO_EOF__
put 'src/compile.js' <<'__STUDIO_EOF__'
'use strict';
// Compiler: source layer -> build/BP + build/RP. Pure: same input, same bytes out.
const fs = require('fs');
const path = require('path');
const { toJson, rmrf, writeAtomic, stableHash, walk } = require('./util');
const { textureList } = require('./project');

const FMT = { item: '1.20.80', block: '1.20.80', entity: '1.21.0', client: '1.10.0', recipe: '1.20.10', furnace: '1.12' };
const TEX_DIR = { item: 'items', block: 'blocks', entity: 'entity', ui: 'ui' };

function compile(proj) {
  const P = proj.project.data;
  const pp = P.props;
  const ns = pp.namespace;
  const out = new Map(); // "BP/..." | "RP/..." -> Buffer
  const put = (rel, v) => out.set(rel, Buffer.isBuffer(v) ? v : Buffer.from(typeof v === 'string' ? v : toJson(v)));
  const live = proj.docs.filter((d) => d.data && d.data.status !== 'deprecated')
    .sort((a, b) => a.rel.localeCompare(b.rel));
  const of = (type) => live.filter((d) => d.type === type).map((d) => d.data);
  const full = (ref) => (ref.includes(':') ? ref : `${ns}:${ref}`);
  const lang = {}; // auto names for en_US
  const tex = new Map(textureList(proj).map((t) => [t.id, t]));
  const atlasItems = {}, atlasBlocks = {};
  const texKey = (id) => `${ns}_${id}`;
  const texPath = (id) => `textures/${TEX_DIR[tex.get(id).kind]}/${ns}/${id}`;
  const useTex = (id, atlas) => { if (atlas) atlas[texKey(id)] = { textures: texPath(id) }; return texKey(id); };
  const lootPath = (id) => `loot_tables/${ns}/${id}.json`;

  // textures: copy every listed PNG
  for (const t of [...tex.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    put(`RP/${texPath(t.id)}.png`, fs.readFileSync(path.join(proj.root, 'textures', t.file)));
  }

  for (const it of of('item')) {
    const p = it.props, id = full(it.id), key = `item.${id}.name`;
    lang[key] = it.name;
    const c = {
      'minecraft:icon': { textures: { default: useTex(p.texture, atlasItems) } },
      'minecraft:display_name': { value: key },
      'minecraft:max_stack_size': p.durability ? 1 : (p.max_stack || 64),
    };
    if (p.glint) c['minecraft:glint'] = true;
    if (p.hand_equipped) c['minecraft:hand_equipped'] = true;
    if (p.fuel) c['minecraft:fuel'] = { duration: p.fuel };
    if (p.durability) c['minecraft:durability'] = { max_durability: p.durability };
    if (p.damage) c['minecraft:damage'] = { value: p.damage };
    if (p.food) {
      c['minecraft:food'] = { nutrition: p.food.nutrition, saturation_modifier: p.food.saturation || 0.6, can_always_eat: !!p.food.can_always_eat };
      c['minecraft:use_animation'] = 'eat';
      c['minecraft:use_modifiers'] = { use_duration: 1.6, movement_modifier: 0.35 };
    }
    if (p.tags && p.tags.length) c['minecraft:tags'] = { tags: p.tags };
    put(`BP/items/${it.id}.json`, { format_version: FMT.item, 'minecraft:item': {
      description: { identifier: id, menu_category: { category: p.category || 'items' } }, components: c } });
  }

  const blocksJson = { format_version: [1, 1, 0] };
  for (const b of of('block')) {
    const p = b.props, id = full(b.id), key = `tile.${id}.name`;
    lang[key] = b.name;
    const rm = p.render_method || 'opaque';
    const mi = { '*': { texture: useTex(p.texture, atlasBlocks), render_method: rm } };
    for (const [face, t] of Object.entries(p.faces || {})) mi[face] = { texture: useTex(t, atlasBlocks), render_method: rm };
    const c = {
      'minecraft:display_name': key,
      'minecraft:geometry': 'minecraft:geometry.full_block',
      'minecraft:material_instances': mi,
      'minecraft:destructible_by_mining': { seconds_to_destroy: p.hardness ?? 1 },
      'minecraft:destructible_by_explosion': { explosion_resistance: p.blast_resistance ?? 3 },
    };
    if (p.light_emission) c['minecraft:light_emission'] = p.light_emission;
    if (p.light_dampening !== undefined) c['minecraft:light_dampening'] = p.light_dampening;
    if (p.friction !== undefined) c['minecraft:friction'] = p.friction;
    if (p.map_color) c['minecraft:map_color'] = p.map_color;
    if (p.loot) c['minecraft:loot'] = lootPath(p.loot);
    for (const t of p.tags || []) c[`tag:${t}`] = {};
    put(`BP/blocks/${b.id}.json`, { format_version: FMT.block, 'minecraft:block': {
      description: { identifier: id, menu_category: { category: p.category || 'construction' } }, components: c } });
    blocksJson[id] = { sound: p.sound || 'stone' };
  }

  for (const e of of('entity')) {
    const p = e.props, id = full(e.id), hp = p.health || 10;
    lang[`entity.${id}.name`] = e.name;
    const c = {
      'minecraft:type_family': { family: p.family && p.family.length ? p.family : [e.id, 'mob'] },
      'minecraft:health': { value: hp, max: hp },
      'minecraft:physics': {},
      'minecraft:collision_box': p.collision || { width: 0.6, height: 1.8 },
      'minecraft:pushable': { is_pushable: p.pushable !== false, is_pushable_by_piston: true },
      'minecraft:movement': { value: p.speed ?? 0.25 },
    };
    if ((p.behavior || 'passive') === 'passive') Object.assign(c, {
      'minecraft:movement.basic': {}, 'minecraft:navigation.walk': { avoid_water: true }, 'minecraft:jump.static': {},
      'minecraft:behavior.random_stroll': { priority: 6, speed_multiplier: 1 },
      'minecraft:behavior.look_at_player': { priority: 7, look_distance: 6 },
      'minecraft:behavior.random_look_around': { priority: 8 },
    });
    if (p.loot) c['minecraft:loot'] = { table: lootPath(p.loot) };
    put(`BP/entities/${e.id}.json`, { format_version: FMT.entity, 'minecraft:entity': {
      description: { identifier: id, is_spawnable: !!p.spawn_egg, is_summonable: true, is_experimental: false }, components: c } });
    const desc = { identifier: id, materials: { default: 'entity_alphatest' }, textures: { default: texPath(p.texture) },
      geometry: { default: p.geometry }, render_controllers: ['controller.render.default'] };
    if (p.spawn_egg) { desc.spawn_egg = { base_color: p.spawn_egg.base_color, overlay_color: p.spawn_egg.overlay_color }; lang[`item.spawn_egg.entity.${id}.name`] = `Spawn ${e.name}`; }
    put(`RP/entity/${e.id}.entity.json`, { format_version: FMT.client, 'minecraft:client_entity': { description: desc } });
  }

  for (const r of of('recipe')) {
    const p = r.props, description = { identifier: full(r.id) };
    const result = { item: full(p.result.item), count: p.result.count || 1 };
    const unlock = (list) => [...new Set(list.map(full))].map((item) => ({ item }));
    let body;
    if (p.kind === 'shaped') {
      const key = {};
      for (const k of Object.keys(p.key).sort()) key[k] = { item: full(p.key[k]) };
      body = { 'minecraft:recipe_shaped': { description, tags: p.tags || ['crafting_table'], pattern: p.pattern, key, unlock: unlock(Object.values(p.key)), result } };
    } else if (p.kind === 'shapeless') {
      const counts = new Map();
      for (const i of p.ingredients.map(full)) counts.set(i, (counts.get(i) || 0) + 1);
      const ingredients = [...counts].map(([item, count]) => (count > 1 ? { item, count } : { item }));
      body = { 'minecraft:recipe_shapeless': { description, tags: p.tags || ['crafting_table'], ingredients, unlock: unlock(p.ingredients), result } };
    } else {
      body = { 'minecraft:recipe_furnace': { description, tags: p.tags || ['furnace'], input: full(p.input), output: result.item } };
    }
    const key = Object.keys(body)[0];
    if (p.priority !== undefined && p.kind !== 'furnace') body[key].priority = p.priority;
    put(`BP/recipes/${r.id}.json`, { format_version: p.kind === 'furnace' ? FMT.furnace : FMT.recipe, ...body });
  }

  for (const l of of('loot')) {
    put(`BP/${lootPath(l.id)}`, { pools: l.props.pools.map((pool) => ({ rolls: pool.rolls || 1, entries: pool.entries.map((en) => {
      const entry = { type: 'item', name: full(en.item), weight: en.weight || 1 };
      if (en.count) entry.functions = [{ function: 'set_count', count: { min: en.count[0], max: en.count[1] } }];
      return entry;
    }) })) });
  }

  // scripts + generated id map
  const scripts = live.filter((d) => d.type === 'script');
  for (const d of scripts) put(`BP/scripts/${d.fileId}.js`, d.code);
  if (scripts.length) {
    const ids = {};
    for (const d of live) if (['item', 'block', 'entity'].includes(d.type)) ids[d.data.id] = full(d.data.id);
    const sorted = Object.keys(ids).sort().map((k) => `  ${k}: ${JSON.stringify(ids[k])},`).join('\n');
    put('BP/scripts/_ids.js', `// Generated by studio. Do not edit.\nexport const NS = ${JSON.stringify(ns)};\nexport const ids = Object.freeze({\n${sorted}\n});\n`);
  }

  // language files: auto names, then lang/*.json overrides
  const langs = { en_US: { ...lang } };
  for (const l of of('lang')) langs[l.id] = { ...(l.id === 'en_US' ? lang : {}), ...l.props.entries };
  const codes = Object.keys(langs).sort();
  for (const code of codes) {
    const clean = (s) => String(s).replace(/[\r\n\t]+/g, ' ');
    const lines = Object.keys(langs[code]).sort().map((k) => `${clean(k)}=${clean(langs[code][k])}`);
    put(`RP/texts/${code}.lang`, lines.join('\n') + '\n');
  }
  put('RP/texts/languages.json', codes);

  if (Object.keys(atlasItems).length) put('RP/textures/item_texture.json', { resource_pack_name: P.id, texture_name: 'atlas.items', texture_data: sortKeys(atlasItems) });
  if (Object.keys(atlasBlocks).length) put('RP/textures/terrain_texture.json', { resource_pack_name: P.id, texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4, texture_data: sortKeys(atlasBlocks) });
  if (Object.keys(blocksJson).length > 1) put('RP/blocks.json', blocksJson);
  if (pp.icon && tex.has(pp.icon)) {
    const icon = fs.readFileSync(path.join(proj.root, 'textures', tex.get(pp.icon).file));
    put('BP/pack_icon.png', icon);
    put('RP/pack_icon.png', icon);
  }
  const m = manifests(P);
  put('BP/manifest.json', m.bp);
  put('RP/manifest.json', m.rp);
  return out;
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

function manifests(P) {
  const pp = P.props, u = pp.uuids, v = pp.version, eng = pp.min_engine_version;
  const header = (uuid, kind) => ({ name: `${P.name} ${kind}`, description: pp.description || P.name, uuid, version: v, min_engine_version: eng });
  const bpModules = [{ type: 'data', uuid: u.bp_data, version: v }];
  const deps = [{ uuid: u.rp_header, version: v }];
  if (pp.script_entry) {
    bpModules.push({ type: 'script', language: 'javascript', uuid: u.bp_script, version: v, entry: `scripts/${pp.script_entry}.js` });
    for (const name of Object.keys(pp.script_modules || {}).sort()) deps.push({ module_name: name, version: pp.script_modules[name] });
  }
  return {
    bp: { format_version: 2, header: header(u.bp_header, 'BP'), modules: bpModules, dependencies: deps },
    rp: { format_version: 2, header: header(u.rp_header, 'RP'), modules: [{ type: 'resources', uuid: u.rp_resources, version: v }] },
  };
}

// Write the in-memory build to <root>/build. Returns info about it.
function writeBuild(proj, files) {
  const dir = path.join(proj.root, 'build');
  rmrf(dir);
  for (const rel of [...files.keys()].sort()) writeAtomic(path.join(dir, rel), files.get(rel));
  const src = new Map();
  for (const d of [proj.project, proj.textures, ...proj.docs].filter(Boolean)) src.set(d.rel, Buffer.from(d.text));
  for (const f of walk(path.join(proj.root, 'textures'))) src.set(`textures/${f}`, fs.readFileSync(path.join(proj.root, 'textures', f)));
  const info = { source_hash: stableHash(src), build_hash: stableHash(files), files: files.size };
  writeAtomic(path.join(dir, 'build-info.json'), toJson(info));
  return info;
}

module.exports = { compile, writeBuild, manifests };
__STUDIO_EOF__
put 'src/patch.js' <<'__STUDIO_EOF__'
'use strict';
// Patch API. Agents change one value at a time; whole-file rewrites are not offered.
//   { op: 'set',    id, path, value }   replace / create a value
//   { op: 'add',    id, path, value }   append to array, insert at index, or create a new key
//   { op: 'delete', id, path }          remove a key / array element
// id: a thing id, "project", or "textures". path: "props.max_stack" or "/props/max_stack".
const fs = require('fs');
const path = require('path');
const { parsePath, toPointer, writeAtomic, toJson } = require('./util');
const { SCHEMAS, check } = require('./schemas');
const { load, byId, render } = require('./project');

const PROTECTED = ['$schema', 'id'];
const clone = (v) => JSON.parse(JSON.stringify(v));

function target(proj, id) {
  if (id === 'project') return proj.project;
  if (id === 'textures' || id === '_index') return proj.textures;
  const d = byId(proj).get(id);
  if (d) return d;
  return proj.docs.find((x) => x.fileId === id) || null;
}

function applyOp(data, op) {
  const segs = parsePath(op.path);
  if (!segs.length) throw new Error('path is required (whole-file writes are not allowed)');
  if (PROTECTED.includes(segs[0])) throw new Error(`"${segs[0]}" cannot be patched (rename = new thing + delete)`);
  let node = data;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = Array.isArray(node) ? Number(segs[i]) : segs[i];
    if (node === null || typeof node !== 'object' || !(k in node)) {
      if (op.op !== 'delete' && node && typeof node === 'object' && !Array.isArray(node)) { node[k] = {}; } // create parents
      else throw new Error(`path not found: ${toPointer(segs.slice(0, i + 1))}`);
    }
    node = node[k];
  }
  const last = segs[segs.length - 1];
  if (Array.isArray(node)) {
    const idx = last === '-' ? node.length : Number(last);
    if (!Number.isInteger(idx) || idx < 0 || idx > node.length - (op.op === 'add' ? 0 : 1)) throw new Error(`bad array index "${last}"`);
    if (op.op === 'set') node[idx] = op.value;
    else if (op.op === 'add') node.splice(idx, 0, op.value);
    else node.splice(idx, 1);
    return;
  }
  if (node === null || typeof node !== 'object') throw new Error(`cannot patch inside a ${typeof node}`);
  if (op.op === 'set') node[last] = op.value;
  else if (op.op === 'add') {
    if (Array.isArray(node[last])) node[last].push(op.value);
    else if (last in node) throw new Error(`"${last}" already exists; use set`);
    else node[last] = op.value;
  } else {
    if (!(last in node)) throw new Error(`path not found: ${toPointer(segs)}`);
    delete node[last];
  }
}

// Apply a batch. All ops succeed or nothing is written.
// Returns { ok, changed: [files], error?, issues? }
function patch(root, ops, opts = {}) {
  const proj = load(root);
  const work = new Map(); // doc -> new data
  for (const [n, op] of ops.entries()) {
    if (!['set', 'add', 'delete'].includes(op.op)) return { ok: false, error: `op #${n}: unknown op "${op.op}"` };
    const doc = target(proj, op.id);
    if (!doc) return { ok: false, error: `op #${n}: no thing with id "${op.id}"` };
    if (!doc.data) return { ok: false, error: `op #${n}: ${doc.rel} has a JSON error; fix it first (studio check)` };
    if (!work.has(doc)) work.set(doc, clone(doc.data));
    try { applyOp(work.get(doc), op); } catch (e) { return { ok: false, error: `op #${n} (${op.op} ${op.id} ${op.path}): ${e.message}` }; }
  }
  // Refuse patches that add schema errors to a file.
  const issues = [];
  for (const [doc, data] of work) {
    const before = new Set(check(SCHEMAS[doc.type], doc.data).map((e) => e.code + e.path));
    for (const e of check(SCHEMAS[doc.type], data)) if (!before.has(e.code + e.path)) issues.push({ file: doc.rel, ...e, severity: 'error' });
  }
  if (issues.length && !opts.force) return { ok: false, error: 'patch would add schema errors (use --force to write anyway)', issues };
  const changed = [];
  for (const [doc, data] of work) { writeAtomic(doc.abs, render(doc, data)); changed.push(doc.rel); }
  return { ok: true, changed, issues };
}

// Create a new thing file from a minimal template.
const TEMPLATES = {
  item: { texture: '' }, block: { texture: '' }, entity: { texture: '', geometry: 'geometry.humanoid.custom' },
  recipe: { kind: 'shapeless', ingredients: ['minecraft:stick'], result: { item: '', count: 1 } },
  loot: { pools: [{ rolls: 1, entries: [{ item: 'minecraft:stick' }] }] },
  script: { summary: '' }, lang: { entries: {} }, spec: { summary: 'todo', requirements: [], acceptance: [] },
};
const DIRS = { item: 'items', block: 'blocks', entity: 'entities', recipe: 'recipes', loot: 'loot', script: 'scripts', lang: 'lang', spec: 'specs' };

function create(root, type, id, name) {
  if (!DIRS[type]) return { ok: false, error: `unknown type "${type}"; use ${Object.keys(DIRS).join(', ')}` };
  const pat = new RegExp(SCHEMAS[type].properties.id.pattern);
  if (!pat.test(id)) return { ok: false, error: `bad id "${id}"; must match ${pat.source}` };
  const proj = load(root);
  if (byId(proj).has(id)) return { ok: false, error: `id "${id}" already exists in ${byId(proj).get(id).rel}` };
  const props = clone(TEMPLATES[type]);
  if ('texture' in props) props.texture = id; // convention: texture id = thing id
  const data = { $schema: `studio/${type}@1`, id, name: name || id.replace(/_/g, ' '), props, refs: 'texture' in props ? [id] : [], ai_note: '', status: 'draft' };
  const rel = `${DIRS[type]}/${id}${type === 'script' ? '.js' : '.json'}`;
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) return { ok: false, error: `${rel} already exists` };
  const text = type === 'script'
    ? `/* @studio\n${toJson(data)}*/\nimport { world } from "@minecraft/server";\nimport { ids } from "./_ids.js";\n`
    : toJson(data);
  writeAtomic(abs, text);
  return { ok: true, changed: [rel] };
}

// Delete a whole thing. Refuses when other things still link to it.
function remove(root, id, opts = {}) {
  const proj = load(root);
  const doc = byId(proj).get(id);
  if (!doc) return { ok: false, error: `no thing with id "${id}"` };
  const users = proj.docs.filter((d) => d !== doc && d.data && Array.isArray(d.data.refs) && d.data.refs.includes(id)).map((d) => d.rel);
  if (users.length && !opts.force) return { ok: false, error: `still used by ${users.join(', ')} (use --force)` };
  fs.unlinkSync(doc.abs);
  return { ok: true, changed: [doc.rel] };
}

module.exports = { patch, create, remove, applyOp };
__STUDIO_EOF__
put 'src/project.js' <<'__STUDIO_EOF__'
'use strict';
// Loads the source layer of a pack project into memory.
const fs = require('fs');
const path = require('path');
const { exists, parseJson, walk, toJson } = require('./util');

// folder -> type. Order is the order things appear in map.md.
const TYPES = [
  { type: 'spec', dir: 'specs', ext: '.json' },
  { type: 'item', dir: 'items', ext: '.json' },
  { type: 'block', dir: 'blocks', ext: '.json' },
  { type: 'entity', dir: 'entities', ext: '.json' },
  { type: 'recipe', dir: 'recipes', ext: '.json' },
  { type: 'loot', dir: 'loot', ext: '.json' },
  { type: 'script', dir: 'scripts', ext: '.js' },
  { type: 'lang', dir: 'lang', ext: '.json' },
];
const TEX_INDEX = 'textures/_index.json';
const HEADER = /^(\s*\/\*\s*@studio\b)([\s\S]*?)(\*\/)/;

function findRoot(start) {
  let dir = path.resolve(start || '.');
  for (;;) {
    if (exists(path.join(dir, 'project.json'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Every source file with mtime+size. Used for the cheap "did anything change" scan.
function scan(root) {
  const rels = ['project.json'];
  for (const t of TYPES) for (const f of walk(path.join(root, t.dir))) rels.push(`${t.dir}/${f}`);
  for (const f of walk(path.join(root, 'textures'))) rels.push(`textures/${f}`);
  return rels.filter((r) => exists(path.join(root, r))).map((rel) => {
    const st = fs.statSync(path.join(root, rel));
    return { rel, mtimeMs: Math.floor(st.mtimeMs), size: st.size };
  });
}

function readDoc(root, rel, type) {
  const abs = path.join(root, rel);
  const text = fs.readFileSync(abs, 'utf8');
  const doc = { type, rel, abs, text, lines: text.split('\n').length, data: null, error: null, dups: [], lineOffset: 0 };
  let jsonText = text;
  if (type === 'script') {
    const m = HEADER.exec(text);
    if (!m) { doc.error = { msg: 'missing /* @studio {...} */ header at top of file', line: 1, col: 1 }; return doc; }
    jsonText = m[2];
    doc.lineOffset = m[1].split('\n').length - 1;
    doc.code = text;
    doc.body = text.slice(m.index + m[0].length);
  }
  const r = parseJson(jsonText);
  if (r.error) doc.error = { ...r.error, line: r.error.line + doc.lineOffset };
  else { doc.data = r.value; doc.dups = r.dups; }
  return doc;
}

function load(root) {
  const proj = {
    root, docs: [], unknown: [], project: null, textures: null,
    get ns() { return (this.project && this.project.data && this.project.data.props && this.project.data.props.namespace) || 'studio'; },
  };
  proj.project = exists(path.join(root, 'project.json')) ? readDoc(root, 'project.json', 'project') : null;
  for (const t of TYPES) {
    for (const f of walk(path.join(root, t.dir))) {
      const rel = `${t.dir}/${f}`;
      if (f.includes('/') || path.extname(f) !== t.ext || f.startsWith('.')) { proj.unknown.push(rel); continue; }
      const doc = readDoc(root, rel, t.type);
      doc.fileId = path.basename(f, t.ext);
      proj.docs.push(doc);
    }
  }
  if (exists(path.join(root, TEX_INDEX))) {
    proj.textures = readDoc(root, TEX_INDEX, 'textures');
    proj.textures.fileId = '_index';
  }
  return proj;
}

// id -> doc for things that parsed (first wins; duplicates are a validator error).
function byId(proj) {
  const m = new Map();
  for (const d of proj.docs) if (d.data && typeof d.data.id === 'string' && !m.has(d.data.id)) m.set(d.data.id, d);
  return m;
}

function textureList(proj) {
  const t = proj.textures && proj.textures.data && proj.textures.data.props;
  return t && Array.isArray(t.textures) ? t.textures.filter((x) => x && typeof x.id === 'string') : [];
}

// Serialize a doc's data back to its file text (keeps script code).
function render(doc, data) {
  if (doc.type !== 'script') return toJson(data);
  const m = HEADER.exec(doc.text);
  return doc.text.slice(0, m.index) + m[1] + '\n' + toJson(data) + m[3] + doc.text.slice(m.index + m[0].length);
}

module.exports = { TYPES, TEX_INDEX, findRoot, scan, load, byId, textureList, render, readDoc };
__STUDIO_EOF__
put 'src/schemas.js' <<'__STUDIO_EOF__'
'use strict';
// Source-layer schemas (a JSON Schema subset) + a tiny validator for them.
// "x-ref" marks a field that links to another thing by id.
//   x-ref: texture | loot | script | itemlike (local item/block, or ns:id)
const ID = '^[a-z][a-z0-9_]{0,63}$';
const REF = '^([a-z0-9_.-]+:)?[a-z0-9_./-]+$';
const HEX = '^#[0-9a-fA-F]{6}$';
const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const STATUS = ['draft', 'wip', 'ready', 'deprecated'];
const CATS = ['construction', 'equipment', 'items', 'nature', 'none'];

const str = (x = {}) => ({ type: 'string', ...x });
const int = (minimum, maximum, x = {}) => ({ type: 'integer', minimum, maximum, ...x });
const num = (minimum, maximum, x = {}) => ({ type: 'number', minimum, maximum, ...x });
const bool = (x = {}) => ({ type: 'boolean', ...x });
const arr = (items, x = {}) => ({ type: 'array', items, ...x });
const obj = (properties, required = [], x = {}) => ({ type: 'object', properties, required, additionalProperties: false, ...x });
const ref = (to, description) => ({ type: 'string', pattern: REF, 'x-ref': to, description });
const vec3 = (description) => arr(int(0, 9999), { minItems: 3, maxItems: 3, description });
const tags = arr(str({ pattern: '^[a-z0-9_.:]+$' }), { uniqueItems: true });

function thing(type, title, props, required, idPattern = ID) {
  return {
    $id: `studio/${type}@1`, title, type: 'object', additionalProperties: false,
    required: ['$schema', 'id', 'name', 'props', 'refs', 'ai_note', 'status'],
    properties: {
      $schema: { const: `studio/${type}@1` },
      id: str({ pattern: idPattern, description: 'Must equal the filename (without extension).' }),
      name: str({ minLength: 1, maxLength: 80, description: 'Human name. Becomes the in-game name.' }),
      props: obj(props, required),
      refs: arr(str({ pattern: REF }), { uniqueItems: true, description: 'Ids this thing links to.' }),
      ai_note: str({ maxLength: 400, description: 'One or two lines for the next AI agent.' }),
      status: { enum: STATUS },
    },
  };
}

const SCHEMAS = {
  project: thing('project', 'Pack project', {
    namespace: str({ pattern: '^[a-z][a-z0-9_]{1,15}$', description: 'Prefix for all identifiers, e.g. tyc -> tyc:coin.' }),
    version: vec3('Pack version [major, minor, patch].'),
    min_engine_version: vec3('Lowest Minecraft version, e.g. [1, 21, 0].'),
    description: str({ maxLength: 200 }),
    icon: ref('texture', 'Texture id used as pack_icon.png.'),
    uuids: obj({
      bp_header: str({ pattern: UUID }), bp_data: str({ pattern: UUID }), bp_script: str({ pattern: UUID }),
      rp_header: str({ pattern: UUID }), rp_resources: str({ pattern: UUID }),
    }, ['bp_header', 'bp_data', 'bp_script', 'rp_header', 'rp_resources']),
    script_entry: ref('script', 'Script id that runs first.'),
    script_modules: { type: 'object', additionalProperties: str({ pattern: '^\\d+\\.\\d+\\.\\d+(-beta)?$' }),
      description: 'Module name -> version, e.g. {"@minecraft/server": "1.12.0"}.' },
  }, ['namespace', 'version', 'min_engine_version', 'uuids']),

  item: thing('item', 'Item', {
    texture: ref('texture', 'Texture id from textures/_index.json.'),
    max_stack: int(1, 64), category: { enum: CATS }, glint: bool(), hand_equipped: bool(),
    fuel: num(0.05, 10000, { description: 'Burn time in seconds.' }),
    food: obj({ nutrition: int(0, 20), saturation: num(0, 20), can_always_eat: bool() }, ['nutrition']),
    durability: int(1, 100000), damage: int(0, 1000), tags,
  }, ['texture']),

  block: thing('block', 'Block', {
    texture: ref('texture', 'Texture for every face.'),
    faces: obj(Object.fromEntries(['up', 'down', 'north', 'south', 'east', 'west'].map((f) => [f, ref('texture')]))),
    hardness: num(0, 1000, { description: 'Seconds to mine by hand.' }),
    blast_resistance: num(0, 10000), light_emission: int(0, 15), light_dampening: int(0, 15),
    friction: num(0, 0.9), map_color: str({ pattern: HEX }),
    render_method: { enum: ['opaque', 'alpha_test', 'blend', 'double_sided'] },
    sound: { enum: ['stone', 'wood', 'gravel', 'grass', 'metal', 'glass', 'sand', 'cloth'] },
    loot: ref('loot', 'Loot table id dropped when mined.'), category: { enum: CATS }, tags,
  }, ['texture']),

  entity: thing('entity', 'Entity', {
    texture: ref('texture'),
    geometry: str({ pattern: '^geometry\\.[a-z0-9_.]+$', description: 'Vanilla geometry id, e.g. geometry.humanoid.custom.' }),
    health: int(1, 1024), speed: num(0, 2), behavior: { enum: ['passive', 'static'] },
    collision: obj({ width: num(0.1, 10), height: num(0.1, 10) }, ['width', 'height']),
    family: arr(str({ pattern: ID }), { uniqueItems: true }), pushable: bool(),
    spawn_egg: obj({ base_color: str({ pattern: HEX }), overlay_color: str({ pattern: HEX }) }, ['base_color', 'overlay_color']),
    loot: ref('loot'),
  }, ['texture', 'geometry']),

  recipe: Object.assign(thing('recipe', 'Recipe', {
    kind: { enum: ['shaped', 'shapeless', 'furnace'] },
    tags: arr(str({ pattern: '^[a-z_]+$' }), { minItems: 1, description: 'Default: crafting_table, or furnace.' }),
    pattern: arr(str({ pattern: '^.{1,3}$' }), { minItems: 1, maxItems: 3, description: 'Rows; space = empty slot.' }),
    key: { type: 'object', propertyNames: { pattern: '^[^ ]$' }, additionalProperties: ref('itemlike') },
    ingredients: arr(ref('itemlike'), { minItems: 1, maxItems: 9, description: 'Repeat an id for more than one.' }),
    input: ref('itemlike', 'Furnace input.'),
    result: obj({ item: ref('itemlike'), count: int(1, 64) }, ['item']),
    priority: int(0, 100),
  }, ['kind', 'result']), {
    allOf: [
      { if: { properties: { props: { properties: { kind: { const: 'shaped' } } } } }, then: { properties: { props: { required: ['pattern', 'key'] } } } },
      { if: { properties: { props: { properties: { kind: { const: 'shapeless' } } } } }, then: { properties: { props: { required: ['ingredients'] } } } },
      { if: { properties: { props: { properties: { kind: { const: 'furnace' } } } } }, then: { properties: { props: { required: ['input'] } } } },
    ],
  }),

  loot: thing('loot', 'Loot table', {
    pools: arr(obj({
      rolls: int(1, 64),
      entries: arr(obj({ item: ref('itemlike'), weight: int(1, 1000), count: arr(int(1, 64), { minItems: 2, maxItems: 2 }) }, ['item']), { minItems: 1 }),
    }, ['entries']), { minItems: 1 }),
  }, ['pools']),

  script: thing('script', 'Script (header of a .js file)', {
    summary: str({ maxLength: 200 }),
  }, []),

  lang: thing('lang', 'Language strings', {
    entries: { type: 'object', additionalProperties: str({ maxLength: 500 }), description: 'Key -> text. Names are auto-made from "name".' },
  }, ['entries'], '^[a-z]{2}_[A-Z]{2}$'),

  spec: thing('spec', 'Design spec (not compiled)', {
    summary: str({ minLength: 1, maxLength: 300 }),
    requirements: arr(str({ maxLength: 200 })), acceptance: arr(str({ maxLength: 200 })),
  }, ['summary']),

  textures: thing('textures', 'Texture index', {
    textures: arr(obj({
      id: str({ pattern: ID }), file: str({ pattern: '^[a-z0-9_\\-/]+\\.png$', description: 'PNG inside textures/.' }),
      kind: { enum: ['item', 'block', 'entity', 'ui'] },
    }, ['id', 'file', 'kind'])),
  }, ['textures'], '^_index$'),
};

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array'
  : Number.isInteger(v) ? 'integer' : typeof v);

// Validate `v` against schema `s`. Pushes {path, code, hint} into out.
function check(s, v, p = '', out = []) {
  const err = (code, hint, at = p) => out.push({ path: at, code, hint });
  if ('const' in s && v !== s.const) return err('SCHEMA_CONST', `must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) return err('SCHEMA_ENUM', `use one of: ${s.enum.join(', ')}`);
  if (s.type) {
    const t = typeOf(v);
    const ok = t === s.type || (s.type === 'number' && t === 'integer');
    if (!ok) return err('SCHEMA_TYPE', `expected ${s.type}, got ${t}`);
  }
  if (typeof v === 'string') {
    if (s.minLength !== undefined && v.length < s.minLength) err('SCHEMA_LENGTH', `at least ${s.minLength} chars`);
    if (s.maxLength !== undefined && v.length > s.maxLength) err('SCHEMA_LENGTH', `at most ${s.maxLength} chars`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) err('SCHEMA_PATTERN', `must match ${s.pattern}`);
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) err('SCHEMA_RANGE', `min ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) err('SCHEMA_RANGE', `max ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) err('SCHEMA_LENGTH', `at least ${s.minItems} items`);
    if (s.maxItems !== undefined && v.length > s.maxItems) err('SCHEMA_LENGTH', `at most ${s.maxItems} items`);
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) err('SCHEMA_DUP_ITEM', 'items must be unique');
    if (s.items) v.forEach((x, i) => check(s.items, x, `${p}/${i}`, out));
  }
  if (typeOf(v) === 'object') {
    for (const k of s.required || []) if (!(k in v)) err('SCHEMA_REQUIRED', `add "${k}"`, `${p}/${k}`);
    for (const [k, x] of Object.entries(v)) {
      const kp = `${p}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (s.propertyNames) check(s.propertyNames, k, kp, out);
      if (s.properties && s.properties[k]) check(s.properties[k], x, kp, out);
      else if (s.additionalProperties === false) err('SCHEMA_UNKNOWN_KEY', `unknown key "${k}"; allowed: ${Object.keys(s.properties || {}).join(', ')}`, kp);
      else if (typeof s.additionalProperties === 'object') check(s.additionalProperties, x, kp, out);
    }
  }
  for (const sub of s.allOf || []) {
    if (sub.if && check(sub.if, v, p, []).length === 0 && sub.then) check(sub.then, v, p, out);
  }
  return out;
}

// Yield [pointer, value, target] for every x-ref field inside data.
function findRefs(s, v, p = '', out = []) {
  if (!s || v === undefined || v === null) return out;
  if (s['x-ref'] && typeof v === 'string') out.push([p, v, s['x-ref']]);
  if (Array.isArray(v) && s.items) v.forEach((x, i) => findRefs(s.items, x, `${p}/${i}`, out));
  if (typeOf(v) === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const sub = (s.properties && s.properties[k]) || (typeof s.additionalProperties === 'object' ? s.additionalProperties : null);
      findRefs(sub, x, `${p}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`, out);
    }
  }
  return out;
}

module.exports = { SCHEMAS, STATUS, ID, UUID, check, findRefs };
__STUDIO_EOF__
put 'src/scriptapi.js' <<'__STUDIO_EOF__'
'use strict';
// Script checks: syntax (node --check), imports, Script API module versions.
const { spawnSync } = require('child_process');

// Runtime modules Bedrock provides. Value = highest stable major we know.
const MODULES = {
  '@minecraft/server': 2,
  '@minecraft/server-ui': 2,
  '@minecraft/common': 1,
  '@minecraft/server-gametest': 1,
  '@minecraft/debug-utilities': 1,
  '@minecraft/server-net': 1,
  '@minecraft/server-admin': 1,
};
const NPM_ONLY = ['@minecraft/math', '@minecraft/vanilla-data', '@minecraft/server-editor'];
const BDS_ONLY = ['@minecraft/server-net', '@minecraft/server-admin'];
// Lowest engine that ships a @minecraft/server version (approximate, for warnings).
const SERVER_ENGINE = {
  '1.0.0': [1, 19, 70], '1.1.0': [1, 19, 70], '1.2.0': [1, 20, 0], '1.3.0': [1, 20, 10],
  '1.4.0': [1, 20, 30], '1.5.0': [1, 20, 30], '1.6.0': [1, 20, 40], '1.7.0': [1, 20, 50],
  '1.8.0': [1, 20, 60], '1.9.0': [1, 20, 70], '1.10.0': [1, 20, 70], '1.11.0': [1, 20, 80],
  '1.12.0': [1, 21, 0], '1.13.0': [1, 21, 20], '1.14.0': [1, 21, 30], '1.15.0': [1, 21, 40],
  '1.16.0': [1, 21, 50], '1.17.0': [1, 21, 60], '1.18.0': [1, 21, 70], '1.19.0': [1, 21, 80],
  '2.0.0': [1, 21, 90], '2.1.0': [1, 21, 100], '2.2.0': [1, 21, 110],
};
const cmpVer = (a, b) => { for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); return 0; };

function syntaxError(code) {
  const r = spawnSync(process.execPath, ['--check', '--input-type=module', '-'], { input: code, encoding: 'utf8', timeout: 20000 });
  if (r.status === 0) return null;
  const text = (r.stderr || r.error && r.error.message || 'syntax check failed').split('\n');
  const where = /^\[stdin\]:(\d+)/.exec(text[0]);
  const msg = text.find((l) => /Error:/.test(l)) || text[0];
  return { line: where ? Number(where[1]) : 0, msg: msg.trim() };
}

function imports(code) {
  const out = [];
  const re = /(?:^|[;\n])\s*(?:import|export)\s+(?:[^;]*?\sfrom\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1]);
  const dyn = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dyn.exec(code))) out.push(m[1]);
  return [...new Set(out)];
}

// proj: loaded project, ids: Map of local ids, issue(doc, path, code, hint, sev)
function checkScripts(proj, ids, issue) {
  const pdoc = proj.project;
  const pp = (pdoc && pdoc.data && pdoc.data.props) || {};
  const mods = pp.script_modules || {};
  const engine = Array.isArray(pp.min_engine_version) ? pp.min_engine_version : [0, 0, 0];
  const scripts = proj.docs.filter((d) => d.type === 'script');
  const scriptIds = new Set(scripts.map((d) => d.fileId));
  const used = new Set();

  for (const [name, ver] of Object.entries(mods)) {
    const at = `/props/script_modules/${name.replace(/\//g, '~1')}`;
    if (NPM_ONLY.includes(name)) { issue(pdoc, at, 'SCRIPT_MODULE_NPM', `${name} is an npm library, not a runtime module; remove it`); continue; }
    if (!(name in MODULES)) { issue(pdoc, at, 'SCRIPT_MODULE_UNKNOWN', `unknown module ${name}; known: ${Object.keys(MODULES).join(', ')}`); continue; }
    if (typeof ver !== 'string') continue;
    if (BDS_ONLY.includes(name)) issue(pdoc, at, 'SCRIPT_MODULE_BDS', `${name} only works on Bedrock Dedicated Server`, 'warn');
    if (ver.endsWith('-beta')) issue(pdoc, at, 'SCRIPT_API_BETA', 'beta API: players must turn on the Beta APIs experiment', 'warn');
    const major = Number(ver.split('.')[0]);
    if (major > MODULES[name]) issue(pdoc, at, 'SCRIPT_API_VERSION', `${name} ${ver} is newer than any version known to studio`, 'warn');
    if (name === '@minecraft/server') {
      const base = ver.replace('-beta', '');
      const need = SERVER_ENGINE[base] || (major >= 2 ? [1, 21, 90] : null);
      if (need && cmpVer(engine, need) < 0) {
        issue(pdoc, '/props/min_engine_version', 'SCRIPT_API_ENGINE', `@minecraft/server ${ver} needs min_engine_version >= [${need.join(', ')}]`, 'warn');
      }
    }
  }
  if (pp.script_entry && !mods['@minecraft/server']) {
    issue(pdoc, '/props/script_modules', 'SCRIPT_MODULE_MISSING', 'script_entry is set; add "@minecraft/server" to script_modules');
  }
  if (scripts.length && !pp.script_entry) issue(pdoc, '/props', 'SCRIPT_ENTRY_MISSING', 'scripts/ has files; set props.script_entry to the first script id');

  for (const d of scripts) {
    if (!d.data) continue;
    const se = syntaxError(d.code);
    if (se) issue(d, '', 'SCRIPT_SYNTAX', `line ${se.line}: ${se.msg}`, 'error', se.line);
    for (const spec of imports(d.body)) {
      if (spec.startsWith('.')) {
        const name = spec.replace(/^\.\//, '').replace(/\.js$/, '');
        if (!spec.startsWith('./') || !spec.endsWith('.js') || name.includes('/')) {
          issue(d, '', 'SCRIPT_IMPORT_PATH', `import "${spec}": use "./<script_id>.js" (flat scripts/ folder)`);
        } else if (name !== '_ids' && !scriptIds.has(name)) {
          issue(d, '', 'SCRIPT_IMPORT_MISSING', `import "${spec}": no script with id "${name}"`);
        }
      } else if (spec.startsWith('@minecraft/')) {
        used.add(spec);
        if (!(spec in mods)) issue(d, '', 'SCRIPT_MODULE_UNDECLARED', `add "${spec}" to project props.script_modules`);
      } else {
        issue(d, '', 'SCRIPT_MODULE_UNKNOWN', `import "${spec}": Bedrock can only import @minecraft/* modules and ./ files`);
      }
    }
    const idRe = /\bids\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*["']([^"']+)["']\s*\])/g;
    let m;
    while ((m = idRe.exec(d.body))) {
      const id = m[1] || m[2];
      if (!ids.has(id)) issue(d, '', 'MISSING_ID', `ids.${id}: no item/block/entity with id "${id}"`);
    }
    const hard = new RegExp(`["'\`]${proj.ns}:([a-z0-9_]+)["'\`]`, 'g');
    while ((m = hard.exec(d.body))) issue(d, '', 'SCRIPT_HARDCODED_ID', `use ids.${m[1]} from "./_ids.js" instead of "${m[0].slice(1, -1)}"`, 'warn');
  }
  for (const name of Object.keys(mods)) {
    if (scripts.length && !used.has(name) && name in MODULES) {
      issue(pdoc, `/props/script_modules/${name.replace(/\//g, '~1')}`, 'SCRIPT_MODULE_UNUSED', `${name} is declared but never imported`, 'warn');
    }
  }
}

module.exports = { checkScripts, imports, MODULES, SERVER_ENGINE, cmpVer };
__STUDIO_EOF__
put 'src/studio.js' <<'__STUDIO_EOF__'
'use strict';
// High-level commands used by the CLI and the tests: check, build, pack, index.
const fs = require('fs');
const path = require('path');
const { load } = require('./project');
const { validate, counts } = require('./validate');
const { writeAi, isStale } = require('./ai');
const { compile, writeBuild } = require('./compile');
const { verifyBuild } = require('./buildcheck');
const { writeZip, readZip } = require('./zip');
const { walk, sha256, writeAtomic, mkdirp } = require('./util');

function check(root) {
  const proj = load(root);
  const issues = validate(proj);
  writeAi(proj, issues);
  return { proj, issues, ...counts(issues) };
}

// Rebuild .ai/ only when the mtime scan shows a change (or force).
function index(root, force) {
  if (!force && !isStale(root)) return { fresh: true };
  const r = check(root);
  return { fresh: false, errors: r.errors, warnings: r.warnings };
}

function build(root) {
  const c = check(root);
  if (c.errors) return { ok: false, stage: 'check', ...c };
  const files = compile(c.proj);
  const info = writeBuild(c.proj, files);
  const built = verifyBuild(root);
  return { ok: built.length === 0, stage: built.length ? 'verify' : 'done', ...c, build: built, info };
}

function pack(root) {
  const b = build(root);
  if (!b.ok) return b;
  // check again from disk right before zipping
  const again = verifyBuild(root);
  if (again.length) return { ...b, ok: false, stage: 'recheck', build: again };
  const p = b.proj.project.data;
  const entries = new Map();
  for (const kind of ['BP', 'RP']) {
    for (const f of walk(path.join(root, 'build', kind))) entries.set(`${p.id}_${kind}/${f}`, fs.readFileSync(path.join(root, 'build', kind, f)));
  }
  const zip = writeZip(entries);
  // verify the zip we just made: every entry inflates, CRC matches, bytes equal the build
  const back = readZip(zip);
  const bad = [...entries].filter(([n, buf]) => !back.has(n) || !back.get(n).equals(buf)).map(([n]) => n);
  if (bad.length || back.size !== entries.size) return { ...b, ok: false, stage: 'zip', build: [{ file: 'dist', path: '', code: 'ZIP_VERIFY', hint: `mismatch: ${bad.join(', ')}`, severity: 'error' }] };
  const name = `${p.id}-${p.props.version.join('.')}.mcaddon`;
  const dist = path.join(root, 'dist');
  mkdirp(dist);
  writeAtomic(path.join(dist, name), zip);
  const report = reportMd(b, p, name, zip, entries);
  writeAtomic(path.join(dist, 'report.md'), report);
  return { ...b, ok: true, stage: 'packed', file: path.join(dist, name), sha256: sha256(zip), bytes: zip.length, report };
}

function reportMd(b, p, name, zip, entries) {
  const bp = [...entries.keys()].filter((n) => n.includes('_BP/')).length;
  const rp = entries.size - bp;
  const warn = b.issues.filter((i) => i.severity === 'warn');
  const deps = Object.entries(p.props.script_modules || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  return [
    `# Pack report: ${p.name}`,
    '',
    `- file: dist/${name} (${zip.length} bytes)`,
    `- sha256: ${sha256(zip)}`,
    `- version: ${p.props.version.join('.')}, min engine: ${p.props.min_engine_version.join('.')}`,
    `- files: ${entries.size} (BP ${bp}, RP ${rp}); source hash ${b.info.source_hash.slice(0, 12)}`,
    `- script modules: ${deps}`,
    `- checks: source OK (${b.errors} errors, ${warn.length} warnings), build OK, zip re-read OK`,
    ...warn.map((w) => `  - warn ${w.code} ${w.file}${w.path}: ${w.hint}`),
    '',
    'Install: open the .mcaddon with Minecraft (Termux: termux-open dist/' + name + ').',
    '',
  ].join('\n');
}

module.exports = { check, index, build, pack };
__STUDIO_EOF__
put 'src/util.js' <<'__STUDIO_EOF__'
'use strict';
// Small shared helpers: files, hashing, a JSON parser that reports line/col
// and duplicate keys, JSON pointer paths.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const exists = (p) => fs.existsSync(p);
const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });
const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });
const posix = (p) => p.split(path.sep).join('/');

// JSON with 2-space indent; short arrays of plain values stay on one line.
function fmt(v, ind) {
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every((x) => x === null || typeof x !== 'object')) {
      const one = '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
      if (one.length + ind.length <= 100) return one;
    }
    const ni = ind + '  ';
    return '[\n' + v.map((x) => ni + fmt(x, ni)).join(',\n') + '\n' + ind + ']';
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v).filter((k) => v[k] !== undefined);
    if (!ks.length) return '{}';
    const ni = ind + '  ';
    return '{\n' + ks.map((k) => ni + JSON.stringify(k) + ': ' + fmt(v[k], ni)).join(',\n') + '\n' + ind + '}';
  }
  return JSON.stringify(v);
}
const toJson = (v) => fmt(v, '') + '\n';

function writeAtomic(file, data) {
  mkdirp(path.dirname(file));
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// Skip the write when content is the same, so mtimes stay quiet.
function writeIfChanged(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  try { if (fs.readFileSync(file).equals(buf)) return false; } catch (e) { /* new file */ }
  writeAtomic(file, buf);
  return true;
}

// Sorted recursive file list (relative, posix slashes).
function walk(dir, base = dir, out = []) {
  if (!exists(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) walk(abs, base, out);
    else out.push(posix(path.relative(base, abs)));
  }
  return out;
}

function lineCol(text, pos) {
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, col };
}

const ptrEsc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

// Strict JSON parser. Returns { value, dups } or { error: {msg, line, col} }.
function parseJson(src) {
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const dups = [];
  const STR = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const fail = (msg) => { const e = new Error(msg); e.pos = i; throw e; };
  const ws = () => { while (i < src.length && ' \t\r\n'.includes(src[i])) i++; };
  const lit = (re) => { re.lastIndex = i; const m = re.exec(src); if (!m) fail('bad token'); i += m[0].length; return JSON.parse(m[0]); };
  function value(p) {
    ws();
    const c = src[i];
    if (c === '{') return object(p);
    if (c === '[') return array(p);
    if (c === '"') return lit(STR);
    if (c === '-' || (c >= '0' && c <= '9')) return lit(NUM);
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) {
      if (src.startsWith(w, i)) { i += w.length; return v; }
    }
    return fail(c === undefined ? 'unexpected end of file' : `unexpected character '${c}'`);
  }
  function object(p) {
    i++; const out = {}; ws();
    if (src[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      if (src[i] !== '"') fail('expected "key" (trailing comma?)');
      const k = lit(STR); ws();
      if (src[i] !== ':') fail("expected ':' after key");
      i++;
      const kp = p + '/' + ptrEsc(k);
      if (Object.prototype.hasOwnProperty.call(out, k)) dups.push(kp);
      Object.defineProperty(out, k, { value: value(kp), enumerable: true, writable: true, configurable: true });
      ws();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === '}') { i++; return out; }
      fail("expected ',' or '}'");
    }
  }
  function array(p) {
    i++; const out = []; ws();
    if (src[i] === ']') { i++; return out; }
    for (;;) {
      out.push(value(p + '/' + out.length)); ws();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ']') { i++; return out; }
      fail("expected ',' or ']'");
    }
  }
  try {
    const v = value('');
    ws();
    if (i < src.length) fail('extra text after JSON');
    return { value: v, dups };
  } catch (e) {
    return { error: { msg: e.message, ...lineCol(src, e.pos || 0) } };
  }
}

// "a.b.0" or JSON pointer "/a/b/0" -> ['a','b','0']
function parsePath(p) {
  if (p === undefined || p === '' || p === '/') return [];
  if (p[0] === '/') return p.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  return p.split('.');
}
const toPointer = (segs) => segs.map((s) => '/' + ptrEsc(s)).join('');

function stableHash(files) { // files: Map rel -> Buffer
  const h = crypto.createHash('sha256');
  for (const k of [...files.keys()].sort()) h.update(k + '\0').update(files.get(k)).update('\0');
  return h.digest('hex');
}

module.exports = {
  sha256, exists, mkdirp, rmrf, toJson, posix, writeAtomic, writeIfChanged, walk,
  lineCol, parseJson, parsePath, toPointer, ptrEsc, stableHash,
};
__STUDIO_EOF__
put 'src/validate.js' <<'__STUDIO_EOF__'
'use strict';
// Source validators. Plain functions, no AI. Output: [{file, path, code, hint, severity}]
const fs = require('fs');
const path = require('path');
const { SCHEMAS, check, findRefs, UUID } = require('./schemas');
const { byId, textureList } = require('./project');
const { checkScripts } = require('./scriptapi');

const MAX_LINES = 150;
// UUIDs of the golden example. A real pack must not reuse them.
const GOLDEN_UUIDS = ['4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e01', '4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e02',
  '4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e03', '4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e04', '4c1d2a10-6f3e-4b7a-9d21-0a1b2c3d4e05'];

function pngInfo(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    fs.closeSync(fd);
    if (b.readUInt32BE(0) !== 0x89504e47 || b.toString('latin1', 12, 16) !== 'IHDR') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch (e) { return null; }
}

function validate(proj) {
  const out = [];
  const issue = (doc, p, code, hint, severity = 'error', line) => {
    const e = { file: doc ? doc.rel : 'project.json', path: p || '', code, hint, severity };
    if (line) e.line = line;
    out.push(e);
  };
  const ns = proj.ns;

  // 1. presence, JSON syntax, schema, id == filename, file size
  if (!proj.project) issue(null, '', 'PROJECT_MISSING', 'create project.json (run: studio init)');
  if (!proj.textures) issue({ rel: 'textures/_index.json' }, '', 'TEXTURE_INDEX_MISSING', 'create textures/_index.json');
  const all = [proj.project, proj.textures, ...proj.docs].filter(Boolean);
  for (const d of all) {
    if (d.error) { issue(d, '', 'JSON_SYNTAX', `line ${d.error.line} col ${d.error.col}: ${d.error.msg}`, 'error', d.error.line); continue; }
    for (const p of d.dups) issue(d, p, 'DUPLICATE_KEY', 'key appears twice; the last one wins. Keep one.');
    for (const e of check(SCHEMAS[d.type], d.data)) issue(d, e.path, e.code, e.hint);
    if (d.fileId && d.data.id !== d.fileId) issue(d, '/id', 'ID_FILENAME_MISMATCH', `id "${d.data.id}" must equal filename "${d.fileId}"`);
    if (d.lines > MAX_LINES) issue(d, '', 'FILE_TOO_LONG', `${d.lines} lines; split into smaller things (max ~${MAX_LINES})`, 'warn');
  }
  for (const rel of proj.unknown) issue({ rel }, '', 'UNKNOWN_FILE', 'not part of the project format; move or delete it', 'warn');

  // 2. duplicate ids across all things
  const seen = new Map();
  for (const d of proj.docs) {
    if (!d.data || typeof d.data.id !== 'string') continue;
    const prev = seen.get(d.data.id);
    if (prev) issue(d, '/id', 'DUPLICATE_ID', `id "${d.data.id}" is also used by ${prev.rel}; ids are unique across the project`);
    else seen.set(d.data.id, d);
  }
  const ids = byId(proj);

  // 3. textures: duplicates, files, PNG
  const tex = new Map();
  textureList(proj).forEach((t, i) => {
    const at = `/props/textures/${i}`;
    if (tex.has(t.id)) issue(proj.textures, `${at}/id`, 'DUPLICATE_ID', `texture id "${t.id}" listed twice`);
    tex.set(t.id, t);
    if (typeof t.file !== 'string') return;
    const abs = path.join(proj.root, 'textures', t.file);
    if (!fs.existsSync(abs)) return issue(proj.textures, `${at}/file`, 'TEXTURE_FILE_MISSING', `add textures/${t.file}`);
    const info = pngInfo(abs);
    if (!info) return issue(proj.textures, `${at}/file`, 'TEXTURE_NOT_PNG', `textures/${t.file} is not a valid PNG`);
    const pow2 = (n) => n > 0 && (n & (n - 1)) === 0;
    if (!pow2(info.w) || !pow2(info.h)) issue(proj.textures, `${at}/file`, 'TEXTURE_SIZE', `${info.w}x${info.h}; use powers of two (16x16)`, 'warn');
  });

  // 4. links: x-ref fields and refs[]
  const localItem = (id) => { const d = ids.get(id); return d && (d.type === 'item' || d.type === 'block'); };
  const resolve = (target, v) => {
    if (target === 'texture') return tex.has(v) ? null : `no texture "${v}" in textures/_index.json`;
    const colon = v.indexOf(':');
    if (colon >= 0) {
      if (v.slice(0, colon) !== ns) return null; // vanilla / other pack: not checked
      if (target !== 'itemlike') return `use the bare id "${v.slice(colon + 1)}"`;
      v = v.slice(colon + 1);
    }
    if (target === 'itemlike') return localItem(v) ? null : `no item or block "${v}" (vanilla ids need "minecraft:")`;
    const d = ids.get(v);
    return d && d.type === target ? null : `no ${target} with id "${v}"`;
  };
  for (const d of all) {
    if (!d.data || !SCHEMAS[d.type]) continue;
    const declared = new Set(Array.isArray(d.data.refs) ? d.data.refs : []);
    for (const [p, v, target] of findRefs(SCHEMAS[d.type], d.data)) {
      const bad = resolve(target, v);
      if (bad) { issue(d, p, 'MISSING_ID', bad); continue; }
      const bare = v.startsWith(ns + ':') ? v.slice(ns.length + 1) : v;
      if (!v.includes(':') || v.startsWith(ns + ':')) {
        if (!declared.has(bare)) issue(d, '/refs', 'REF_UNDECLARED', `add "${bare}" to refs`, 'warn');
        const t = ids.get(bare);
        if (t && t.data.status === 'deprecated' && d.data.status !== 'deprecated') issue(d, p, 'REF_DEPRECATED', `"${bare}" is deprecated`, 'warn');
      }
    }
    (Array.isArray(d.data.refs) ? d.data.refs : []).forEach((r, i) => {
      if (typeof r !== 'string' || r.includes(':')) return;
      if (!ids.has(r) && !tex.has(r)) issue(d, `/refs/${i}`, 'MISSING_ID', `refs: nothing has id "${r}"`);
    });
  }

  // 5. kind-specific rules
  for (const d of proj.docs) {
    const p = d.data && d.data.props;
    if (!p) continue;
    if (d.type === 'recipe' && p.kind === 'shaped' && Array.isArray(p.pattern) && p.key && typeof p.key === 'object') {
      const widths = new Set(p.pattern.map((r) => String(r).length));
      if (widths.size > 1) issue(d, '/props/pattern', 'RECIPE_PATTERN_WIDTH', 'all rows need the same length; pad with spaces');
      const chars = new Set(p.pattern.join('').replace(/ /g, ''));
      for (const c of chars) if (!(c in p.key)) issue(d, '/props/key', 'RECIPE_KEY_MISSING', `pattern uses "${c}" but key has no "${c}"`);
      for (const c of Object.keys(p.key)) if (!chars.has(c)) issue(d, `/props/key/${c}`, 'RECIPE_KEY_UNUSED', `"${c}" is not in pattern`, 'warn');
    }
  }

  // 6. project: UUIDs, namespace
  const pd = proj.project && proj.project.data;
  if (pd && pd.props) {
    if (pd.props.namespace === 'minecraft') issue(proj.project, '/props/namespace', 'NAMESPACE_RESERVED', 'pick your own namespace');
    const u = pd.props.uuids || {};
    const vals = new Map();
    for (const [k, v] of Object.entries(u)) {
      const at = `/props/uuids/${k}`;
      if (typeof v !== 'string' || !new RegExp(UUID).test(v)) { issue(proj.project, at, 'UUID_FORMAT', 'need xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (run: studio uuid)'); continue; }
      if (/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v)) issue(proj.project, at, 'UUID_FORMAT', 'nil UUID is not allowed');
      const lo = v.toLowerCase();
      if (vals.has(lo)) issue(proj.project, at, 'UUID_DUPLICATE', `same UUID as ${vals.get(lo)}; every UUID must be unique`);
      vals.set(lo, k);
      if (GOLDEN_UUIDS.includes(lo) && pd.id !== 'golden_tycoon') issue(proj.project, at, 'UUID_GOLDEN_REUSE', 'copied from the golden pack; make new ones (studio uuid)', 'warn');
    }
  }

  // 7. scripts: syntax, imports, Script API versions
  checkScripts(proj, new Map([...ids].filter(([, d]) => ['item', 'block', 'entity'].includes(d.type))), issue);

  const rank = { error: 0, warn: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || a.path.localeCompare(b.path));
}

const counts = (issues) => ({
  errors: issues.filter((i) => i.severity === 'error').length,
  warnings: issues.filter((i) => i.severity === 'warn').length,
});

module.exports = { validate, counts, pngInfo, GOLDEN_UUIDS };
__STUDIO_EOF__
put 'src/zip.js' <<'__STUDIO_EOF__'
'use strict';
// Minimal ZIP writer/reader (deflate via zlib). Deterministic: fixed date, sorted names.
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
// zlib.crc32 exists from Node 20.15 / 22.2; fall back to a table for older Node.
const crc32 = typeof zlib.crc32 === 'function' ? (b) => zlib.crc32(b) >>> 0 : (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01 00:00

// entries: Map name -> Buffer (files only; folders are added automatically)
function writeZip(entries) {
  const names = new Set();
  for (const n of entries.keys()) {
    const parts = n.split('/');
    for (let i = 1; i < parts.length; i++) names.add(parts.slice(0, i).join('/') + '/');
    names.add(n);
  }
  const locals = [], centrals = [];
  let offset = 0;
  for (const name of [...names].sort()) {
    const dir = name.endsWith('/');
    const raw = dir ? Buffer.alloc(0) : entries.get(name);
    const deflated = dir ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = !dir && deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(useDeflate ? 8 : 0, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(useDeflate ? 8 : 0, 10); ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(dir ? 0x10 : 0, 38); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, data);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  if (names.size > 0xffff || offset + cd.length > 0xffffffff) throw new Error('pack too large for zip (no zip64 support)');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.size, 8); end.writeUInt16LE(names.size, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// Read and fully verify a zip. Returns Map name -> Buffer (files only). Throws on any problem.
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip: end record not found');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`zip: bad central header #${n}`);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip: bad local header for ${name}`);
    if (buf.toString('utf8', local + 30, local + 30 + buf.readUInt16LE(local + 26)) !== name) throw new Error(`zip: name mismatch for ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    const raw = method === 8 ? zlib.inflateRawSync(data) : method === 0 ? Buffer.from(data) : null;
    if (!raw) throw new Error(`zip: unsupported method ${method} for ${name}`);
    if (raw.length !== usize || crc32(raw) !== crc) throw new Error(`zip: CRC/size mismatch for ${name}`);
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) throw new Error(`zip: unsafe path ${name}`);
    if (!name.endsWith('/')) out.set(name, raw);
  }
  return out;
}

module.exports = { writeZip, readZip, crc32 };
__STUDIO_EOF__
put 'studio' <<'__STUDIO_EOF__'
#!/bin/sh
# studio launcher (Termux / Linux). Works through a symlink.
SELF="$(readlink -f "$0" 2>/dev/null || echo "$0")"
exec node "$(dirname "$SELF")/src/cli.js" "$@"
__STUDIO_EOF__
put 'test/golden.test.js' <<'__STUDIO_EOF__'
'use strict';
// Golden test: the tiny tycoon pack must always check clean, build the same
// bytes twice, pack into a valid .mcaddon, and the patch API + validators must work.
// Run: node test/golden.test.js   (or: studio test)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const studio = require('../src/studio');
const { patch, create, remove } = require('../src/patch');
const { readZip } = require('../src/zip');
const { walk, stableHash, rmrf } = require('../src/util');

const GOLDEN = path.join(__dirname, '..', 'examples', 'golden-tycoon');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-golden-'));
let pass = 0, fail = 0;

function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of walk(src)) {
    if (/^(build|dist|\.ai)\//.test(f)) continue;
    fs.mkdirSync(path.dirname(path.join(dst, f)), { recursive: true });
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
  return dst;
}
const fresh = (name) => copy(GOLDEN, path.join(tmp, name));
const treeHash = (dir) => stableHash(new Map(walk(dir).map((f) => [f, fs.readFileSync(path.join(dir, f))])));
const codes = (r) => r.issues.map((i) => i.code);
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (root, rel, text) => fs.writeFileSync(path.join(root, rel), text);
const edit = (root, rel, fn) => { const d = JSON.parse(read(root, rel)); fn(d); write(root, rel, JSON.stringify(d, null, 2)); };

function t(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message.split('\n').join('\n       ')}`); }
}

console.log('golden pack test');
const A = fresh('a');

t('check: 0 errors, 0 warnings', () => {
  const r = studio.check(A);
  assert.deepStrictEqual(r.issues, []);
});

t('.ai/ has map.md, index.json, errors.json, schemas/', () => {
  for (const f of ['map.md', 'index.json', 'errors.json', 'scan.json']) assert.ok(fs.existsSync(path.join(A, '.ai', f)), f);
  for (const s of ['item', 'block', 'entity', 'recipe', 'loot']) assert.ok(fs.existsSync(path.join(A, '.ai', 'schemas', `${s}.json`)), s);
  const idx = JSON.parse(read(A, '.ai/index.json'));
  assert.deepStrictEqual(idx.things.find((x) => x.id === 'coin'), { id: 'coin', type: 'item', file: 'items/coin.json', name: 'Tycoon Coin', status: 'ready', refs: ['coin'], used_by: ['tycoon', 'coin_from_gold', 'main'] });
  assert.match(read(A, '.ai/map.md'), /- coin \[ready\] Tycoon Coin/);
});

let firstHash;
t('build: ok and files present', () => {
  const r = studio.build(A);
  assert.strictEqual(r.ok, true, JSON.stringify(r.build));
  for (const f of ['BP/manifest.json', 'BP/items/coin.json', 'BP/recipes/coin_from_gold.json', 'BP/scripts/main.js', 'BP/scripts/_ids.js',
    'RP/manifest.json', 'RP/textures/item_texture.json', 'RP/textures/items/tyc/coin.png', 'RP/texts/en_US.lang']) {
    assert.ok(fs.existsSync(path.join(A, 'build', f)), f);
  }
  const bp = JSON.parse(read(A, 'build/BP/manifest.json'));
  const rp = JSON.parse(read(A, 'build/RP/manifest.json'));
  assert.strictEqual(bp.dependencies[0].uuid, rp.header.uuid);
  assert.deepStrictEqual(bp.dependencies[1], { module_name: '@minecraft/server', version: '1.12.0' });
  assert.strictEqual(bp.modules[1].entry, 'scripts/main.js');
  assert.match(read(A, 'build/BP/scripts/_ids.js'), /coin: "tyc:coin"/);
  assert.match(read(A, 'build/RP/texts/en_US.lang'), /^item\.tyc:coin\.name=Tycoon Coin$/m);
  firstHash = treeHash(path.join(A, 'build'));
});

t('build: same input = same output (twice + fresh copy)', () => {
  studio.build(A);
  assert.strictEqual(treeHash(path.join(A, 'build')), firstHash);
  const B = fresh('b');
  studio.build(B);
  assert.strictEqual(treeHash(path.join(B, 'build')), firstHash);
});

let zipSha;
t('pack: .mcaddon written, re-read, deterministic', () => {
  const r = studio.pack(A);
  assert.strictEqual(r.ok, true, r.stage);
  const files = readZip(fs.readFileSync(r.file));
  assert.ok(files.has('golden_tycoon_BP/manifest.json'));
  assert.ok(files.has('golden_tycoon_RP/textures/items/tyc/coin.png'));
  assert.ok(fs.existsSync(path.join(A, 'dist', 'report.md')));
  zipSha = r.sha256;
  assert.strictEqual(studio.pack(A).sha256, zipSha);
});

const unzip = spawnSync('unzip', ['-v'], { encoding: 'utf8' });
if (!unzip.error) {
  t('pack: system unzip -t accepts the .mcaddon', () => {
    const r = spawnSync('unzip', ['-t', path.join(A, 'dist', 'golden_tycoon-1.0.0.mcaddon')], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  });
}

t('index: mtime scan skips when nothing changed, rebuilds on change', () => {
  assert.strictEqual(studio.index(A).fresh, true);
  const f = path.join(A, 'items', 'coin.json');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(f, later, later);
  assert.strictEqual(studio.index(A).fresh, false);
  assert.strictEqual(studio.index(A).fresh, true);
});

t('patch: set / add / delete keep the file valid and update .ai', () => {
  const P = fresh('patch');
  let r = patch(P, [{ op: 'set', id: 'coin', path: 'props.max_stack', value: 16 }]);
  assert.ok(r.ok, r.error);
  r = patch(P, [{ op: 'add', id: 'coin', path: 'props.tags', value: 'money' }, { op: 'set', id: 'coin', path: 'name', value: 'Gold Coin' }]);
  assert.ok(r.ok, r.error);
  r = patch(P, [{ op: 'add', id: 'en_US', path: '/props/entries/tyc.msg.hi', value: 'Hi' }]);
  assert.ok(r.ok, r.error);
  r = patch(P, [{ op: 'set', id: 'main', path: 'props.summary', value: 'Cash in coins.' }]);
  assert.ok(r.ok, r.error);
  r = patch(P, [{ op: 'delete', id: 'coin', path: 'props.tags.0' }]);
  assert.ok(r.ok, r.error);
  const coin = JSON.parse(read(P, 'items/coin.json'));
  assert.strictEqual(coin.props.max_stack, 16);
  assert.deepStrictEqual(coin.props.tags, ['money']);
  assert.strictEqual(JSON.parse(read(P, 'lang/en_US.json')).props.entries['tyc.msg.hi'], 'Hi');
  assert.match(read(P, 'scripts/main.js'), /"summary": "Cash in coins\."[\s\S]*world\.afterEvents/);
  const c = studio.check(P);
  assert.strictEqual(c.errors, 0, JSON.stringify(c.issues));
  assert.match(read(P, '.ai/map.md'), /coin \[ready\] Gold Coin/);
});

t('patch: refuses bad values, protected keys, unknown ids (file untouched)', () => {
  const P = fresh('patch2');
  const before = read(P, 'items/coin.json');
  assert.strictEqual(patch(P, [{ op: 'set', id: 'coin', path: 'props.max_stack', value: 999 }]).ok, false);
  assert.strictEqual(patch(P, [{ op: 'set', id: 'coin', path: 'id', value: 'x' }]).ok, false);
  assert.strictEqual(patch(P, [{ op: 'set', id: 'nope', path: 'name', value: 'x' }]).ok, false);
  assert.strictEqual(patch(P, [{ op: 'set', id: 'coin', path: 'name', value: 'ok' }, { op: 'delete', id: 'coin', path: 'props.zzz' }]).ok, false);
  assert.strictEqual(read(P, 'items/coin.json'), before);
});

t('new + delete thing', () => {
  const P = fresh('new');
  assert.ok(create(P, 'item', 'gem', 'Gem').ok);
  assert.ok(patch(P, [{ op: 'set', id: 'gem', path: 'props.texture', value: 'coin' }, { op: 'add', id: 'gem', path: 'refs', value: 'coin' }]).ok);
  assert.strictEqual(studio.check(P).errors, 0);
  assert.strictEqual(remove(P, 'coin').ok, false, 'coin is still used');
  assert.ok(remove(P, 'gem').ok);
  assert.ok(create(P, 'script', 'util').ok);
  assert.ok(fs.existsSync(path.join(P, 'scripts', 'util.js')));
});

t('validators: missing id, duplicate id, uuid, json syntax, schema', () => {
  const P = fresh('bad');
  edit(P, 'recipes/coin_from_gold.json', (d) => { d.props.result.item = 'ghost'; });
  fs.mkdirSync(path.join(P, 'blocks'));
  write(P, 'blocks/coin.json', JSON.stringify({ $schema: 'studio/block@1', id: 'coin', name: 'C', props: { texture: 'coin' }, refs: [], ai_note: '', status: 'draft' }));
  edit(P, 'project.json', (d) => { d.props.uuids.rp_header = d.props.uuids.bp_header; d.props.uuids.bp_data = 'nope'; });
  write(P, 'specs/broken.json', '{ "id": "broken", }');
  edit(P, 'items/coin.json', (d) => { d.props.max_stack = 0; d.props.color = 'red'; });
  const c = codes(studio.check(P));
  for (const code of ['MISSING_ID', 'DUPLICATE_ID', 'UUID_DUPLICATE', 'UUID_FORMAT', 'JSON_SYNTAX', 'SCHEMA_RANGE', 'SCHEMA_UNKNOWN_KEY']) assert.ok(c.includes(code), code);
  const errs = JSON.parse(read(P, '.ai/errors.json'));
  const js = errs.find((e) => e.code === 'JSON_SYNTAX');
  assert.deepStrictEqual(Object.keys(js).slice(0, 4), ['file', 'path', 'code', 'hint']);
  assert.match(js.hint, /line 1 col 19/);
  assert.strictEqual(studio.build(P).ok, false);
});

t('validators: script syntax, imports, Script API version', () => {
  const P = fresh('script');
  const main = read(P, 'scripts/main.js');
  write(P, 'scripts/main.js', main.replace('import { ids } from "./_ids.js";', 'import { ids } from "./_ids.js";\nimport { ActionFormData } from "@minecraft/server-ui";\nimport { x } from "./missing.js";\nconst bad = ids.ghost;\n'));
  edit(P, 'project.json', (d) => { d.props.script_modules['@minecraft/server'] = '1.12.0-beta'; d.props.script_modules['@minecraft/math'] = '1.0.0'; });
  let c = codes(studio.check(P));
  for (const code of ['SCRIPT_MODULE_UNDECLARED', 'SCRIPT_IMPORT_MISSING', 'MISSING_ID', 'SCRIPT_API_BETA', 'SCRIPT_MODULE_NPM']) assert.ok(c.includes(code), code);
  write(P, 'scripts/main.js', main + '\nconst = 1;\n');
  c = studio.check(P).issues.find((i) => i.code === 'SCRIPT_SYNTAX');
  assert.ok(c, 'SCRIPT_SYNTAX');
  edit(P, 'project.json', (d) => { d.props.script_modules = { '@minecraft/server': '2.0.0' }; });
  write(P, 'scripts/main.js', main);
  assert.ok(codes(studio.check(P)).includes('SCRIPT_API_ENGINE'));
});

t('compiler: every thing type builds and verifies', () => {
  const P = fresh('all');
  const thing = (type, id, props, refs) => JSON.stringify({ $schema: `studio/${type}@1`, id, name: id, props, refs, ai_note: '', status: 'wip' });
  for (const d of ['blocks', 'entities', 'loot']) fs.mkdirSync(path.join(P, d), { recursive: true });
  write(P, 'blocks/vault.json', thing('block', 'vault', { texture: 'coin', faces: { up: 'coin' }, hardness: 2, loot: 'vault_drop', light_emission: 4, sound: 'metal' }, ['coin', 'vault_drop']));
  write(P, 'loot/vault_drop.json', thing('loot', 'vault_drop', { pools: [{ rolls: 1, entries: [{ item: 'coin', weight: 1, count: [1, 3] }] }] }, ['coin']));
  write(P, 'entities/banker.json', thing('entity', 'banker', { texture: 'coin', geometry: 'geometry.humanoid.custom', health: 20, spawn_egg: { base_color: '#ffcc00', overlay_color: '#000000' }, loot: 'vault_drop' }, ['coin', 'vault_drop']));
  write(P, 'recipes/vault.json', thing('recipe', 'vault', { kind: 'shaped', pattern: ['###', '# #', '###'], key: { '#': 'coin' }, result: { item: 'vault' } }, ['coin']));
  const c = studio.check(P);
  assert.ok(codes(c).includes('DUPLICATE_ID'), 'recipe id "vault" clashes with block "vault"');
  fs.renameSync(path.join(P, 'recipes/vault.json'), path.join(P, 'recipes/vault_recipe.json'));
  edit(P, 'recipes/vault_recipe.json', (d) => { d.id = 'vault_recipe'; d.refs.push('vault'); });
  write(P, 'recipes/melt_coin.json', thing('recipe', 'melt_coin', { kind: 'furnace', input: 'coin', result: { item: 'minecraft:gold_nugget' } }, ['coin']));
  const r = studio.build(P);
  assert.strictEqual(r.ok, true, JSON.stringify([...r.issues, ...(r.build || [])]));
  assert.strictEqual(r.warnings, 0, JSON.stringify(r.issues));
  const blk = JSON.parse(read(P, 'build/BP/blocks/vault.json'))['minecraft:block'].components;
  assert.strictEqual(blk['minecraft:loot'], 'loot_tables/tyc/vault_drop.json');
  assert.ok(fs.existsSync(path.join(P, 'build/BP/loot_tables/tyc/vault_drop.json')));
  assert.ok(fs.existsSync(path.join(P, 'build/RP/entity/banker.entity.json')));
  assert.ok(JSON.parse(read(P, 'build/RP/textures/terrain_texture.json')).texture_data.tyc_coin);
  assert.match(read(P, 'build/BP/scripts/_ids.js'), /banker: "tyc:banker",\n {2}coin: "tyc:coin",\n {2}vault: "tyc:vault",/);
  assert.match(read(P, 'build/RP/texts/en_US.lang'), /tile\.tyc:vault\.name=vault/);
});

rmrf(tmp);
console.log(`\n${pass} passed, ${fail} failed${zipSha ? `\ngolden .mcaddon sha256 ${zipSha}` : ''}`);
process.exitCode = fail ? 1 : 0;
__STUDIO_EOF__
chmod +x "$DEST/studio" "$DEST/src/cli.js"
printf '%s %s\n' "$UPDATE_ID" "$UPDATE_VERSION" > "$DEST/.studio-version"
say "files: $NEW new, $CHANGED updated, $SAME unchanged"
[ "$CHANGED" -gt 0 ] && say "old versions saved in $BACKUP"

say "running golden test..."
if node "$DEST/test/golden.test.js"; then
  say "golden test passed"
else
  die "golden test FAILED (see above). Replaced files are in $BACKUP"
fi

cat <<EOF

[$UPDATE_ID] done. Next:
  cd "$DEST"
  ./studio pack examples/golden-tycoon
  termux-open examples/golden-tycoon/dist/golden_tycoon-1.0.0.mcaddon   # opens in Minecraft
  ./studio help
Tip: ln -sf "$DEST/studio" "\${PREFIX:-/usr/local}/bin/studio"   # use 'studio' anywhere
EOF
