// One tool registry for every agent surface: the built-in Claude agents and external
// agents over MCP. Handlers return a string or { text, images: [{ data, mediaType }] }.
import crypto from 'node:crypto';
import { normalizeRel, isBinaryPath, WorkspaceError } from '../workspace.js';
import { paint, pngSize, upscalePng, isPng } from '../util/png.js';
import { validateProject, formatReport } from '../bedrock/validate.js';
import { buildProject, bumpVersion } from '../bedrock/pack.js';
import { createProject, TEMPLATES } from '../bedrock/scaffold.js';
import { reference, TOPICS } from '../bedrock/knowledge.js';

const MAX_READ_CHARS = 120_000;

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });

/**
 * ctx = { ws, distDir, scope?: project slug, emit?: (event) => void }
 * With a scope, every path is relative to that project folder and cannot leave it.
 */
function resolvePath(ctx, p, { allowRoot = true } = {}) {
  const raw = normalizeRel(p ?? '');
  if (!ctx.scope) return raw;
  const rel = raw === ctx.scope || raw.startsWith(`${ctx.scope}/`) ? raw.slice(ctx.scope.length + 1) : raw;
  const full = normalizeRel(`${ctx.scope}/${rel}`);
  if (full !== ctx.scope && !full.startsWith(`${ctx.scope}/`)) throw new WorkspaceError(`Path ${p} is outside the project`);
  if (!allowRoot && full === ctx.scope) throw new WorkspaceError('A file path inside the project is required');
  return full;
}

const display = (ctx, full) => (ctx.scope && full.startsWith(`${ctx.scope}/`) ? full.slice(ctx.scope.length + 1) : full);

function projectOf(ctx, input) {
  const p = ctx.scope || normalizeRel(input.project || '');
  if (!p) throw new WorkspaceError('project is required (the project folder name, e.g. "ruby-tycoon")');
  return p.split('/')[0];
}

function changed(ctx, full, action = 'write') {
  ctx.emit?.({ type: 'file_changed', path: full, action });
}

export const TOOLS = [
  {
    name: 'list_files',
    readOnly: true,
    description: 'List files and folders as a tree. Call this first to see what exists before reading or writing.',
    input_schema: {
      type: 'object',
      properties: { path: str('Folder to list (default: project root)'), depth: int('How many levels deep (default 6)') },
    },
    async run(input, ctx) {
      const dir = resolvePath(ctx, input.path);
      const { entries, truncated } = await ctx.ws.list(dir, { depth: input.depth ?? 6, maxEntries: 1500 });
      const base = dir ? dir.split('/').length : 0;
      const lines = entries.map((e) => {
        const level = e.path.split('/').length - base - 1;
        const name = e.path.split('/').pop();
        return `${'  '.repeat(level)}${name}${e.type === 'dir' ? '/' : ` (${e.size} B)`}`;
      });
      return `${display(ctx, dir) || '.'}/\n${lines.join('\n') || '(empty)'}${truncated ? '\n... (truncated)' : ''}`;
    },
  },
  {
    name: 'read_file',
    readOnly: true,
    description: 'Read a text file (JSON, JS, .lang, .mcfunction, .md). PNG textures are returned as an enlarged image you can look at. Use offset/limit (line numbers, 1-based) for very large files.',
    input_schema: {
      type: 'object',
      properties: { path: str('File path'), offset: int('First line to return (1-based)'), limit: int('Maximum lines to return') },
      required: ['path'],
    },
    async run(input, ctx) {
      const full = resolvePath(ctx, input.path, { allowRoot: false });
      const buf = await ctx.ws.readBuffer(full);
      if (isPng(buf)) {
        const size = pngSize(buf);
        let images = [];
        try {
          images = [{ data: upscalePng(buf, 256).toString('base64'), mediaType: 'image/png' }];
        } catch {
          images = [{ data: buf.toString('base64'), mediaType: 'image/png' }];
        }
        return { text: `${display(ctx, full)}: PNG ${size.width}x${size.height} (shown enlarged)`, images };
      }
      if (isBinaryPath(full)) return `${display(ctx, full)} is a binary file (${buf.length} bytes)`;
      const text = buf.toString('utf8');
      const lines = text.split('\n');
      if (input.offset || input.limit) {
        const start = Math.max(1, input.offset || 1);
        const end = Math.min(lines.length, start - 1 + (input.limit || 400));
        return `${display(ctx, full)} lines ${start}-${end} of ${lines.length}:\n${lines.slice(start - 1, end).join('\n')}`;
      }
      if (text.length > MAX_READ_CHARS) {
        return `${display(ctx, full)} is large (${lines.length} lines). First part:\n${text.slice(0, MAX_READ_CHARS)}\n... (truncated - use offset/limit to read the rest)`;
      }
      return text;
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a text file with the full content. Folders are created automatically. For small changes to an existing file prefer edit_file. Split very large files (>2000 lines) into modules.',
    input_schema: {
      type: 'object',
      properties: { path: str('File path, e.g. BP/items/ruby.json'), content: str('Complete file content') },
      required: ['path', 'content'],
    },
    async run(input, ctx) {
      const full = resolvePath(ctx, input.path, { allowRoot: false });
      if (/\.(png|tga)$/i.test(full)) throw new WorkspaceError('Use paint_texture to create images');
      const res = await ctx.ws.write(full, input.content);
      changed(ctx, full);
      return `${res.created ? 'Created' : 'Updated'} ${display(ctx, full)} (${res.size} bytes)`;
    },
  },
  {
    name: 'edit_file',
    description: 'Replace an exact snippet in a file. old_string must match the current file text exactly (whitespace included) and be unique unless replace_all is true. Read the file first.',
    input_schema: {
      type: 'object',
      properties: {
        path: str('File path'),
        old_string: str('Exact text to replace'),
        new_string: str('Replacement text'),
        replace_all: { type: 'boolean', description: 'Replace every occurrence' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    async run(input, ctx) {
      const full = resolvePath(ctx, input.path, { allowRoot: false });
      const res = await ctx.ws.edit(full, input.old_string, input.new_string, input.replace_all);
      changed(ctx, full);
      return `Edited ${display(ctx, full)} (${res.replacements} replacement${res.replacements === 1 ? '' : 's'})`;
    },
  },
  {
    name: 'delete_path',
    description: 'Delete a file or folder (recursively). Use only for files you created by mistake or that the design no longer needs.',
    input_schema: { type: 'object', properties: { path: str('File or folder path') }, required: ['path'] },
    async run(input, ctx) {
      const full = resolvePath(ctx, input.path, { allowRoot: false });
      await ctx.ws.remove(full);
      changed(ctx, full, 'delete');
      return `Deleted ${display(ctx, full)}`;
    },
  },
  {
    name: 'move_path',
    description: 'Move or rename a file or folder.',
    input_schema: { type: 'object', properties: { from: str('Current path'), to: str('New path') }, required: ['from', 'to'] },
    async run(input, ctx) {
      const from = resolvePath(ctx, input.from, { allowRoot: false });
      const to = resolvePath(ctx, input.to, { allowRoot: false });
      await ctx.ws.move(from, to);
      changed(ctx, from, 'delete');
      changed(ctx, to);
      return `Moved ${display(ctx, from)} -> ${display(ctx, to)}`;
    },
  },
  {
    name: 'search_files',
    readOnly: true,
    description: 'Search text across files (like grep). Use it to find identifiers, texture keys, lang keys or function usages before changing them.',
    input_schema: {
      type: 'object',
      properties: { query: str('Text or regex to find'), path: str('Folder to search (default: project root)'), regex: { type: 'boolean', description: 'Treat query as a regular expression' } },
      required: ['query'],
    },
    async run(input, ctx) {
      const under = resolvePath(ctx, input.path);
      const { results, truncated } = await ctx.ws.search(input.query, { under, regex: input.regex, maxResults: 150 });
      if (!results.length) return 'No matches';
      return results.map((r) => `${display(ctx, r.path)}:${r.line}: ${r.text}`).join('\n') + (truncated ? '\n... (more results truncated)' : '');
    },
  },
  {
    name: 'new_uuid',
    readOnly: true,
    description: 'Generate fresh random UUIDs for manifest headers and modules. Never reuse or invent UUIDs.',
    input_schema: { type: 'object', properties: { count: int('How many (1-20, default 1)') } },
    async run(input) {
      const n = Math.min(20, Math.max(1, input.count || 1));
      return Array.from({ length: n }, () => crypto.randomUUID()).join('\n');
    },
  },
  {
    name: 'paint_texture',
    description: 'Paint a pixel-art PNG texture (items/blocks 16x16, entities to match their geometry, icons up to 512). palette maps single characters to colors; pixels is one string per row ("." = transparent). rects are filled first, pixels drawn on top. Register the texture in item_texture.json / terrain_texture.json afterwards. Read the PNG back with read_file to check how it looks.',
    input_schema: {
      type: 'object',
      properties: {
        path: str('Output path ending in .png, e.g. RP/textures/<namespace>/ruby.png'),
        width: int('Width in pixels'),
        height: int('Height in pixels'),
        palette: { type: 'object', description: 'Map of single character -> color (#rgb, #rrggbb or #rrggbbaa)', additionalProperties: { type: 'string' } },
        pixels: { type: 'array', items: { type: 'string' }, description: 'Rows of palette characters, top to bottom' },
        rects: {
          type: 'array',
          description: 'Optional filled rectangles drawn before pixels',
          items: {
            type: 'object',
            properties: { x: { type: 'integer' }, y: { type: 'integer' }, w: { type: 'integer' }, h: { type: 'integer' }, color: { type: 'string' } },
            required: ['x', 'y', 'w', 'h', 'color'],
          },
        },
        background: str('Optional fill color for the whole image'),
      },
      required: ['path', 'width', 'height'],
    },
    async run(input, ctx) {
      const full = resolvePath(ctx, input.path, { allowRoot: false });
      if (!full.endsWith('.png')) throw new WorkspaceError('path must end with .png');
      const png = paint(input);
      await ctx.ws.write(full, png);
      changed(ctx, full);
      const wrongRows = (input.pixels || []).filter((r) => [...r].length !== input.width).length;
      const rowNote = (input.pixels || []).length && ((input.pixels || []).length !== input.height || wrongRows)
        ? ` Note: expected ${input.height} rows of ${input.width} characters; got ${(input.pixels || []).length} rows (${wrongRows} with a different length).`
        : '';
      return `Painted ${display(ctx, full)} (${input.width}x${input.height}).${rowNote}`;
    },
  },
  {
    name: 'validate_project',
    readOnly: true,
    description: 'Check the add-on for problems: manifests, UUIDs, identifiers, texture and lang wiring, recipes, loot tables, script syntax, imports and API-version mistakes. Run after every batch of changes and fix all errors.',
    input_schema: { type: 'object', properties: { project: str('Project folder (omit inside a project session)') } },
    async run(input, ctx) {
      return formatReport(await validateProject(ctx.ws, projectOf(ctx, input)));
    },
  },
  {
    name: 'build_project',
    description: 'Validate and package the project into a .mcaddon (plus .mcpack files) ready to import into Minecraft. Optionally bump the version first. Only build when the user asks for a build/release or the task is finished and validation passes.',
    input_schema: {
      type: 'object',
      properties: {
        project: str('Project folder (omit inside a project session)'),
        bump: { type: 'string', enum: ['none', 'patch', 'minor', 'major'], description: 'Version bump before building (default none)' },
      },
    },
    async run(input, ctx) {
      const project = projectOf(ctx, input);
      if (input.bump && input.bump !== 'none') {
        await bumpVersion(ctx.ws, project, input.bump);
        changed(ctx, `${project}/project.json`);
      }
      const res = await buildProject(ctx.ws, project, { distDir: ctx.distDir });
      if (!res.ok) return `Build blocked.\n${formatReport(res.report)}`;
      ctx.emit?.({ type: 'build', project, outputs: res.outputs, download: res.download });
      return `Built ${project} v${res.version}:\n${res.outputs.map((o) => `- ${o.file}`).join('\n')}\nThe user can download it from the Build tab.`;
    },
  },
  {
    name: 'bedrock_reference',
    readOnly: true,
    description: `Look up Minecraft Bedrock reference docs (exact JSON shapes, Script API patterns, design formulas). Consult before writing a file type you have not written in this session. Topics: ${Object.keys(TOPICS).join(', ')}. Several topics can be comma-separated.`,
    input_schema: { type: 'object', properties: { topic: str('Topic name(s), or "index"') }, required: ['topic'] },
    async run(input) {
      return reference(input.topic);
    },
  },
  {
    name: 'list_projects',
    readOnly: true,
    mcpOnly: true,
    description: 'List the projects in the workspace with their type, namespace and version.',
    input_schema: { type: 'object', properties: {} },
    async run(_input, ctx) {
      const { entries } = await ctx.ws.list('', { depth: 1 });
      const out = [];
      for (const dir of entries.filter((e) => e.type === 'dir' && !e.path.startsWith('.'))) {
        let meta = {};
        try {
          meta = JSON.parse(await ctx.ws.readText(`${dir.path}/project.json`));
        } catch {
          // not a studio project
        }
        out.push(`${dir.path}: ${meta.name ?? dir.path} [${meta.type ?? 'unknown'}] ns=${meta.namespace ?? '?'} v${(meta.version || [1, 0, 0]).join('.')}`);
      }
      return out.join('\n') || 'No projects yet - use create_project.';
    },
  },
  {
    name: 'create_project',
    mcpOnly: true,
    description: `Create a new add-on project from a template (${Object.entries(TEMPLATES).map(([k, t]) => `${k}: ${t.description}`).join(' | ')})`,
    input_schema: {
      type: 'object',
      properties: {
        name: str('Display name, e.g. "Ruby Tycoon"'),
        template: { type: 'string', enum: Object.keys(TEMPLATES) },
        namespace: str('Identifier namespace (lowercase, optional)'),
        description: str('One-line description'),
      },
      required: ['name', 'template'],
    },
    async run(input, ctx) {
      const res = await createProject(ctx.ws, input);
      changed(ctx, res.slug);
      return `Created ${res.slug} (namespace ${res.namespace}) with ${res.files.length} files. Read ${res.slug}/DESIGN.md next.`;
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export const getTool = (name) => BY_NAME.get(name);

/** Minimal JSON-schema check for tool inputs (eager input streaming means the API does not validate). */
export function validateInput(schema, value, where = 'input') {
  const errors = [];
  const check = (s, v, at) => {
    if (s.type === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return errors.push(`${at} must be an object`);
      for (const key of s.required || []) if (v[key] === undefined) errors.push(`${at}.${key} is required`);
      for (const [key, val] of Object.entries(v)) {
        const sub = s.properties?.[key] ?? (typeof s.additionalProperties === 'object' ? s.additionalProperties : null);
        if (sub && val !== undefined && val !== null) check(sub, val, `${at}.${key}`);
      }
    } else if (s.type === 'array') {
      if (!Array.isArray(v)) return errors.push(`${at} must be an array`);
      if (s.items) v.forEach((item, i) => check(s.items, item, `${at}[${i}]`));
    } else if (s.type === 'integer') {
      if (!Number.isInteger(v)) errors.push(`${at} must be an integer`);
    } else if (s.type === 'number') {
      if (typeof v !== 'number') errors.push(`${at} must be a number`);
    } else if (s.type === 'string') {
      if (typeof v !== 'string') errors.push(`${at} must be a string`);
      else if (s.enum && !s.enum.includes(v)) errors.push(`${at} must be one of ${s.enum.join(', ')}`);
    } else if (s.type === 'boolean' && typeof v !== 'boolean') errors.push(`${at} must be true or false`);
  };
  check(schema, value, where);
  return errors;
}

/** Run a tool by name with validation. Returns { ok, text, images }. */
export async function runTool(name, input, ctx) {
  const tool = BY_NAME.get(name);
  if (!tool) return { ok: false, text: `Unknown tool ${name}` };
  const errors = validateInput(tool.input_schema, input ?? {});
  if (errors.length) return { ok: false, text: `Invalid input: ${errors.join('; ')}` };
  try {
    const out = await tool.run(input ?? {}, ctx);
    return typeof out === 'string' ? { ok: true, text: out, images: [] } : { ok: true, text: out.text, images: out.images || [] };
  } catch (err) {
    return { ok: false, text: err instanceof WorkspaceError ? err.message : `${err.name || 'Error'}: ${err.message}` };
  }
}

