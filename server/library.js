// Studio library export: builds every published project and writes a self-contained
// gallery (index.html + library.json + icons + downloads) you can upload to your website,
// or read library.json from your own site's code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildProject, readProjectMeta } from './bedrock/pack.js';
import { createZip } from './util/zip.js';
import { upscalePng } from './util/png.js';

async function listProjects(ws) {
  const { entries } = await ws.list('', { depth: 1 });
  const out = [];
  for (const dir of entries.filter((e) => e.type === 'dir' && !e.path.startsWith('.'))) {
    if (!(await ws.exists(`${dir.path}/project.json`))) continue;
    out.push(await readProjectMeta(ws, dir.path));
  }
  return out;
}

export async function exportLibrary(ws, { distDir, studio = {}, only } = {}) {
  const outDir = path.join(distDir, 'library');
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'icons'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'downloads'), { recursive: true });

  const items = [];
  const skipped = [];
  for (const meta of await listProjects(ws)) {
    if (only && !only.includes(meta.slug)) continue;
    if (meta.library?.published === false) {
      skipped.push({ slug: meta.slug, reason: 'not published' });
      continue;
    }
    const build = await buildProject(ws, meta.slug, { distDir });
    if (!build.ok) {
      skipped.push({ slug: meta.slug, reason: `validation failed (${build.report.counts.error} errors)` });
      continue;
    }
    const addon = build.outputs.find((o) => o.kind === 'mcaddon');
    const downloadName = path.basename(addon.file);
    await fs.copyFile(path.join(distDir, addon.file), path.join(outDir, 'downloads', downloadName));
    let icon = null;
    const iconPath = meta.library?.icon || 'RP/pack_icon.png';
    if (await ws.exists(`${meta.slug}/${iconPath}`)) {
      const buf = await ws.readBuffer(`${meta.slug}/${iconPath}`);
      let out = buf;
      try {
        out = upscalePng(buf, 256);
      } catch {
        // keep the original
      }
      icon = `icons/${meta.slug}.png`;
      await fs.writeFile(path.join(outDir, icon), out);
    }
    const s = build.report.summary;
    items.push({
      slug: meta.slug,
      name: meta.name,
      type: meta.type,
      version: build.version,
      summary: meta.library?.summary || meta.description || '',
      description: meta.description || '',
      tags: meta.tags || [],
      author: meta.author || studio.author || '',
      icon,
      download: `downloads/${downloadName}`,
      size: addon.size,
      content: { items: s.items, blocks: s.blocks, entities: s.entities, recipes: s.recipes },
      minecraft: { scriptModules: s.scriptModules },
      updated: new Date().toISOString(),
    });
  }

  const library = {
    studio: { name: studio.name || 'My Bedrock Studio', url: studio.url || '' },
    generated: new Date().toISOString(),
    count: items.length,
    items,
  };
  await fs.writeFile(path.join(outDir, 'library.json'), JSON.stringify(library, null, 2));
  await fs.writeFile(path.join(outDir, 'index.html'), galleryHtml(library));

  // One zip of the whole folder for easy upload.
  const zipEntries = [];
  const walk = async (dir, prefix = '') => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full, `${prefix}${e.name}/`);
      else zipEntries.push({ name: `${prefix}${e.name}`, data: await fs.readFile(full) });
    }
  };
  await walk(outDir);
  await fs.writeFile(path.join(distDir, 'library.zip'), createZip(zipEntries));
  return { ok: true, count: items.length, items: items.map((i) => ({ slug: i.slug, version: i.version })), skipped, index: 'library/index.html', zip: 'library.zip' };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function galleryHtml(library) {
  const data = JSON.stringify(library).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(library.studio.name)} - Add-on Library</title>
<style>
  :root { --bg: #0f1115; --card: #181b22; --line: #262b36; --text: #e9ecf2; --muted: #9aa3b2; --accent: #5ad17a; --accent-ink: #062b12; }
  @media (prefers-color-scheme: light) { :root { --bg: #f4f5f7; --card: #fff; --line: #e1e4ea; --text: #161a22; --muted: #5b6474; --accent: #1f9d4c; --accent-ink: #fff; } }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--text); }
  header { padding: 32px 16px 8px; max-width: 1100px; margin: auto; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  .muted { color: var(--muted); }
  .bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0; }
  .bar input { flex: 1 1 220px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); font: inherit; }
  .chip { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--text); cursor: pointer; font: inherit; }
  .chip.on { border-color: var(--accent); color: var(--accent); }
  main { max-width: 1100px; margin: auto; padding: 0 16px 48px; display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; image-rendering: pixelated; background: #000; }
  .body { padding: 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .type { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--accent); }
  .name { font-weight: 700; font-size: 17px; }
  .stats { font-size: 13px; }
  .dl { margin-top: auto; text-align: center; padding: 10px; border-radius: 10px; background: var(--accent); color: var(--accent-ink); text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<header>
  <h1>${esc(library.studio.name)}</h1>
  <div class="muted">${library.count} add-on${library.count === 1 ? '' : 's'} for Minecraft Bedrock - tap Download on your device to import.</div>
  <div class="bar"><input id="q" placeholder="Search add-ons" aria-label="Search add-ons"><span id="types" class="bar" style="margin:0"></span></div>
</header>
<main id="grid"></main>
<script>
const LIB = ${data};
let type = 'all';
const grid = document.getElementById('grid');
const q = document.getElementById('q');
const types = ['all', ...new Set(LIB.items.map((i) => i.type))];
const typesEl = document.getElementById('types');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function render() {
  typesEl.innerHTML = types.map((t) => '<button class="chip' + (t === type ? ' on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>').join('');
  const needle = q.value.toLowerCase();
  grid.innerHTML = LIB.items.filter((i) => (type === 'all' || i.type === type) && (i.name + ' ' + i.summary + ' ' + i.tags.join(' ')).toLowerCase().includes(needle))
    .map((i) => '<article class="card">' + (i.icon ? '<img src="' + esc(i.icon) + '" alt="">' : '') +
      '<div class="body"><div class="type">' + esc(i.type) + ' · v' + esc(i.version) + '</div><div class="name">' + esc(i.name) + '</div>' +
      '<div class="muted">' + esc(i.summary) + '</div><div class="stats muted">' + i.content.items + ' items · ' + i.content.blocks + ' blocks · ' + i.content.entities + ' mobs</div>' +
      '<a class="dl" href="' + esc(i.download) + '" download>Download .mcaddon</a></div></article>').join('') || '<p class="muted">No add-ons match.</p>';
}
typesEl.addEventListener('click', (e) => { if (e.target.dataset.t) { type = e.target.dataset.t; render(); } });
q.addEventListener('input', render);
render();
</script>
</body>
</html>
`;
}
