#!/usr/bin/env node
// Command-line access to the studio tools, for Claude Code (in the Claude app's Code section
// or a terminal) and scripts. Projects live in <repo>/projects; paths may include "projects/".
//   node server/cli.js help
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Workspace } from './workspace.js';
import { createProject, TEMPLATES } from './bedrock/scaffold.js';
import { validateProject, formatReport } from './bedrock/validate.js';
import { buildProject, bumpVersion } from './bedrock/pack.js';
import { reference, CORE_RULES } from './bedrock/knowledge.js';
import { upscalePng } from './util/png.js';
import { runTool, TOOLS } from './agents/tools.js';
import { resolveDataDir, projectsDir } from './paths.js';

const HELP = `Bedrock Studio CLI - projects live in projects/<slug>/

  list                                   projects with type, namespace, version
  new "<Name>" --template <t>            create a project (${Object.keys(TEMPLATES).join(', ')})
      [--namespace ns] [--description "..."]
  validate <slug>                        check the add-on; exit code 1 on errors
  build <slug> [--bump patch|minor|major] package dist/<slug>/<slug>-vX.Y.Z.mcaddon
  reference [topic,...]                  Bedrock docs (no topic = index + rules)
  rules                                  the Bedrock ground rules
  uuid [count]                           fresh UUIDs for manifests
  paint <spec.json | '{json}'>           paint a pixel-art PNG (paint_texture input)
  preview <file.png> [size]              enlarged copy you can open/look at; prints its path
  tool <name> '<json>'                   run any studio tool (${TOOLS.map((t) => t.name).join(', ')})

  --data <dir>   use <dir>/projects instead of this repo's projects/
`;

function parse(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      opts[k] = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    } else pos.push(a);
  }
  return { pos, opts };
}

/** Accept "projects/<slug>/..." as well as "<slug>/...". */
const strip = (p) => (typeof p === 'string' ? p.replace(/^\.?\/?projects\//, '') : p);
function normalizeInput(input) {
  const out = { ...input };
  for (const key of ['path', 'from', 'to', 'project']) if (key in out) out[key] = strip(out[key]);
  return out;
}

function readJsonArg(arg) {
  if (!arg) throw new Error('Missing JSON input');
  const text = arg.trim().startsWith('{') ? arg : fs.readFileSync(arg, 'utf8');
  return JSON.parse(text);
}

export async function main(argv = process.argv.slice(2), { dataDir, log = console.log } = {}) {
  const { pos, opts } = parse(argv);
  dataDir = resolveDataDir(dataDir || opts.data);
  const ws = new Workspace(projectsDir(dataDir));
  const distDir = path.join(dataDir, 'dist');
  const ctx = { ws, distDir };
  const [cmd, ...rest] = pos;

  switch (cmd) {
    case 'list': {
      log((await runTool('list_projects', {}, ctx)).text);
      return 0;
    }
    case 'new': {
      if (!rest[0]) throw new Error('Usage: new "<Name>" --template tycoon');
      const res = await createProject(ws, { name: rest[0], template: opts.template || 'blank', namespace: opts.namespace, description: opts.description, author: opts.author });
      log(`Created projects/${res.slug} (namespace ${res.namespace}, template ${res.template}, ${res.files.length} files)`);
      return 0;
    }
    case 'validate': {
      const report = await validateProject(ws, strip(rest[0] || ''));
      log(formatReport(report));
      return report.ok ? 0 : 1;
    }
    case 'build': {
      const slug = strip(rest[0] || '');
      if (opts.bump && opts.bump !== 'none') await bumpVersion(ws, slug, opts.bump);
      const res = await buildProject(ws, slug, { distDir, force: Boolean(opts.force) });
      if (!res.ok) {
        log(`Build blocked.\n${formatReport(res.report)}`);
        return 1;
      }
      log(`Built ${slug} v${res.version}:\n${res.outputs.map((o) => `  dist/${o.file}`).join('\n')}`);
      return 0;
    }
    case 'reference':
      log(reference(rest.join(',') || 'index'));
      return 0;
    case 'rules':
      log(CORE_RULES);
      return 0;
    case 'uuid':
      log((await runTool('new_uuid', { count: Number(rest[0]) || 1 }, ctx)).text);
      return 0;
    case 'paint': {
      const res = await runTool('paint_texture', normalizeInput(readJsonArg(rest[0])), ctx);
      log(res.text);
      return res.ok ? 0 : 1;
    }
    case 'preview': {
      const file = strip(rest[0] || '');
      const big = upscalePng(await ws.readBuffer(file), Number(rest[1]) || 256);
      const out = path.join(os.tmpdir(), `preview-${path.basename(file)}`);
      fs.writeFileSync(out, big);
      log(out);
      return 0;
    }
    case 'tool': {
      const res = await runTool(rest[0], normalizeInput(rest[1] ? readJsonArg(rest[1]) : {}), ctx);
      log(res.text);
      return res.ok ? 0 : 1;
    }
    case undefined:
    case 'help':
    case '--help':
      log(HELP);
      return 0;
    default:
      log(`Unknown command "${cmd}".\n\n${HELP}`);
      return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => (process.exitCode = code), (err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
