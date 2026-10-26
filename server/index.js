#!/usr/bin/env node
// Localhub Bedrock Studio - local Node.js server for the mobile IDE, the agents and MCP.
//   node server/index.js [--port 3737] [--host 127.0.0.1] [--data <dir>] [--token <secret>]
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Workspace, WorkspaceError, normalizeRel } from './workspace.js';
import { Config } from './config.js';
import { createProject, TEMPLATES } from './bedrock/scaffold.js';
import { validateProject } from './bedrock/validate.js';
import { buildProject, deployProject, bumpVersion, readProjectMeta } from './bedrock/pack.js';
import { AGENTS } from './agents/roster.js';
import { SessionStore } from './agents/sessions.js';
import { AgentService } from './agents/runner.js';
import { TOOLS, runTool } from './agents/tools.js';
import { handleMcp } from './mcp.js';
import { exportLibrary } from './library.js';
import { STUDIO_VERSION } from './bedrock/versions.js';
import { CORE_RULES } from './bedrock/knowledge.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, '..', 'public');

function parseArgs(argv) {
  const args = { port: Number(process.env.PORT) || 3737, host: process.env.HOST || '127.0.0.1', data: process.env.LOCALHUB_DATA || process.cwd(), token: process.env.LOCALHUB_TOKEN || '' };
  for (let i = 0; i < argv.length; i++) {
    const [k, inline] = argv[i].split('=');
    const val = () => inline ?? argv[++i];
    if (k === '--port' || k === '-p') args.port = Number(val());
    else if (k === '--host') args.host = val();
    else if (k === '--data') args.data = val();
    else if (k === '--token') args.token = val();
    else if (k === '--help' || k === '-h') args.help = true;
  }
  return args;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.mcaddon': 'application/octet-stream', '.mcpack': 'application/octet-stream', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.lang': 'text/plain; charset=utf-8', '.mcfunction': 'text/plain; charset=utf-8', '.tga': 'image/x-tga',
};

const isLoopback = (host) => ['127.0.0.1', 'localhost', '::1'].includes(host);

export function createServer({ dataDir, host = '127.0.0.1', token = '' }) {
  const ws = new Workspace(path.join(dataDir, 'workspace'));
  const distDir = path.join(dataDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const config = new Config(dataDir);
  const bus = new EventEmitter();
  bus.setMaxListeners(100);
  const sessions = new SessionStore(ws);
  const agents = new AgentService({ config, ws, distDir, sessions, bus });
  const requireToken = Boolean(token);
  // Guide for coding agents that open the workspace folder directly (Claude Code reads CLAUDE.md).
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = path.join(ws.root, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, workspaceGuide());
  }

  // ---- helpers -------------------------------------------------------------
  const send = (res, status, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, {
      'content-type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    });
    res.end(payload);
  };
  const fail = (res, err) => {
    const status = err instanceof WorkspaceError ? err.status : err.status || 500;
    if (status >= 500) console.error(err);
    send(res, status, { error: err.message || String(err) });
  };
  const readBody = (req, limit = 30 * 1024 * 1024) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new WorkspaceError('Request body too large', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new WorkspaceError('Body must be JSON'));
      }
    });
    req.on('error', reject);
  });
  const sse = (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(': connected\n\n');
    const beat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => clearInterval(beat));
    return (event, id) => res.write(`${id != null ? `id: ${id}\n` : ''}data: ${JSON.stringify(event)}\n\n`);
  };
  const cookieToken = (req) => /(?:^|;\s*)localhub_token=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const tokenOk = (req, url) => {
    if (!requireToken) return true;
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-localhub-token'] || url.searchParams.get('token') || cookieToken(req) || '';
    const a = Buffer.from(String(given));
    const b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  /** Blocks DNS-rebinding and cross-site requests; enforces the token outside loopback. */
  const guard = (req, url) => {
    const hostHeader = (req.headers.host || '').toLowerCase();
    const hostname = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    if (!requireToken && !isLoopback(hostname)) return 'This server only accepts localhost requests. Start it with --host 0.0.0.0 to use a token for LAN access.';
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      let originHost = '';
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        return 'Bad origin';
      }
      if (originHost !== hostHeader) return 'Cross-origin requests are not allowed';
    }
    if (!tokenOk(req, url)) return 'Missing or wrong access token';
    return null;
  };

  const projectList = async () => {
    const { entries } = await ws.list('', { depth: 1 });
    const out = [];
    for (const dir of entries.filter((e) => e.type === 'dir' && !e.path.startsWith('.'))) {
      const meta = await readProjectMeta(ws, dir.path);
      const st = await ws.stat(dir.path);
      out.push({ slug: dir.path, name: meta.name, type: meta.type, namespace: meta.namespace, version: (meta.version || [1, 0, 0]).join('.'), description: meta.description || '', published: meta.library?.published !== false, updated: st?.mtime });
    }
    return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  };

  const serveStatic = async (res, rel) => {
    const file = path.join(PUBLIC_DIR, normalizeRel(rel) || 'index.html');
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'Not found');
    try {
      const data = await fsp.readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      res.end(data);
    } catch {
      send(res, 404, 'Not found');
    }
  };

  // ---- routes --------------------------------------------------------------
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler });
  };

  route('GET', '/api/status', async () => ({
    version: STUDIO_VERSION,
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    termux: Boolean(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux')),
    workspace: ws.root,
    dist: distDir,
    lan: requireToken,
    config: config.publicView(),
    activeRuns: agents.activeRuns(),
  }));
  route('GET', '/api/config', async () => config.publicView());
  route('PUT', '/api/config', async ({ body }) => config.update(body));
  route('GET', '/api/templates', async () => TEMPLATES);
  route('GET', '/api/agents', async () => Object.entries(AGENTS).map(([key, a]) => ({ key, name: a.name, short: a.short, color: a.color, blurb: a.blurb })));

  route('GET', '/api/projects', async () => projectList());
  route('POST', '/api/projects', async ({ body }) => {
    const res = await createProject(ws, { ...body, author: body.author || config.get('author') });
    bus.emit('workspace', { type: 'file_changed', path: res.slug, action: 'create' });
    return res;
  });
  route('DELETE', '/api/projects/:slug', async ({ params }) => {
    const slug = normalizeRel(params.slug);
    if (!slug || slug.includes('/') || !(await ws.exists(slug))) throw new WorkspaceError('Project not found', 404);
    // Soft delete: move to .trash so nothing is lost by a mis-tap on a phone.
    const dest = `.trash/${slug}-${Date.now()}`;
    await ws.move(slug, dest);
    bus.emit('workspace', { type: 'file_changed', path: slug, action: 'delete' });
    return { ok: true, movedTo: dest };
  });
  route('PATCH', '/api/projects/:slug', async ({ params, body }) => {
    const slug = normalizeRel(params.slug);
    const file = `${slug}/project.json`;
    const current = (await ws.exists(file)) ? JSON.parse(await ws.readText(file)) : {};
    const allowed = ['name', 'description', 'author', 'tags', 'version', 'library'];
    for (const k of allowed) if (body[k] !== undefined) current[k] = k === 'library' ? { ...current.library, ...body.library } : body[k];
    await ws.write(file, JSON.stringify(current, null, 2) + '\n');
    bus.emit('workspace', { type: 'file_changed', path: file, action: 'write' });
    return current;
  });
  route('GET', '/api/projects/:slug/tree', async ({ params }) => ws.list(normalizeRel(params.slug), { depth: 16 }));
  route('POST', '/api/projects/:slug/validate', async ({ params }) => validateProject(ws, params.slug));
  route('POST', '/api/projects/:slug/build', async ({ params, body }) => {
    if (body.bump && body.bump !== 'none') await bumpVersion(ws, params.slug, body.bump);
    return buildProject(ws, params.slug, { distDir, force: Boolean(body.force) });
  });
  route('POST', '/api/projects/:slug/deploy', async ({ params }) => deployProject(ws, params.slug, config.get('minecraftDir')));
  route('GET', '/api/projects/:slug/builds', async ({ params }) => {
    const dir = path.join(distDir, normalizeRel(params.slug));
    const files = await fsp.readdir(dir).catch(() => []);
    const out = [];
    for (const f of files) {
      const st = await fsp.stat(path.join(dir, f));
      out.push({ file: `${normalizeRel(params.slug)}/${f}`, size: st.size, mtime: st.mtimeMs });
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  });

  route('GET', '/api/file', async ({ url }) => ws.read(url.searchParams.get('path')));
  route('PUT', '/api/file', async ({ body }) => {
    const data = body.encoding === 'base64' ? Buffer.from(body.content || '', 'base64') : String(body.content ?? '');
    const res = await ws.write(body.path, data);
    bus.emit('workspace', { type: 'file_changed', path: res.path, action: 'write', source: 'editor' });
    return res;
  });
  route('DELETE', '/api/file', async ({ url }) => {
    const res = await ws.remove(url.searchParams.get('path'));
    bus.emit('workspace', { type: 'file_changed', path: res.path, action: 'delete' });
    return res;
  });
  route('POST', '/api/file/move', async ({ body }) => {
    const res = await ws.move(body.from, body.to);
    bus.emit('workspace', { type: 'file_changed', path: res.to, action: 'write' });
    return res;
  });
  route('POST', '/api/file/mkdir', async ({ body }) => ws.mkdir(body.path));
  route('GET', '/api/search', async ({ url }) => ws.search(url.searchParams.get('q'), { under: url.searchParams.get('path') || '', regex: url.searchParams.get('regex') === '1' }));
  route('GET', '/api/raw', async ({ url, res }) => {
    const rel = url.searchParams.get('path');
    const buf = await ws.readBuffer(rel);
    // Only images get their real type; everything else is plain text so workspace files can never run as pages.
    const ext = path.extname(rel).toLowerCase();
    const type = ['.png', '.svg', '.tga'].includes(ext) ? MIME[ext] : 'text/plain; charset=utf-8';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" });
    res.end(buf);
  });
  route('GET', '/api/download', async ({ url, res }) => {
    const rel = normalizeRel(url.searchParams.get('file'));
    const full = path.join(distDir, rel);
    if (!rel || !full.startsWith(distDir + path.sep)) throw new WorkspaceError('Not found', 404);
    const buf = await fsp.readFile(full).catch(() => null);
    if (!buf) throw new WorkspaceError('Not found', 404);
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'content-disposition': `attachment; filename="${path.basename(full).replace(/"/g, '')}"`, 'content-length': buf.length });
    res.end(buf);
  });

  // Agents
  route('GET', '/api/projects/:slug/sessions', async ({ params }) => sessions.list(normalizeRel(params.slug)));
  route('GET', '/api/projects/:slug/sessions/:id', async ({ params }) => sessions.load(normalizeRel(params.slug), params.id));
  route('DELETE', '/api/projects/:slug/sessions/:id', async ({ params }) => {
    await sessions.remove(normalizeRel(params.slug), params.id);
    return { ok: true };
  });
  route('GET', '/api/projects/:slug/runs', async ({ params }) => agents.activeRuns(normalizeRel(params.slug)));
  route('POST', '/api/projects/:slug/runs', async ({ params, body }) => agents.start({ project: normalizeRel(params.slug), sessionId: body.sessionId, agent: body.agent, message: body.message, editorFile: body.editorFile }));
  route('POST', '/api/runs/:id/cancel', async ({ params }) => agents.cancel(params.id));
  route('GET', '/api/runs/:id/events', async ({ req, res, url, params }) => {
    const after = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0) || 0;
    const write = sse(req, res);
    const unsub = agents.subscribe(params.id, after, (e) => {
      if (e) write(e, e.seq);
      else {
        write({ type: 'end' });
        res.end();
      }
    });
    if (!unsub) {
      write({ type: 'gone' });
      res.end();
      return;
    }
    req.on('close', unsub);
  });
  route('GET', '/api/events', async ({ req, res }) => {
    const write = sse(req, res);
    const onEvent = (e) => write(e);
    bus.on('workspace', onEvent);
    req.on('close', () => bus.off('workspace', onEvent));
  });

  // Plain HTTP tool access for any agent that does not speak MCP.
  route('GET', '/api/tools', async () => TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })));
  route('POST', '/api/tools/:name', async ({ params, body }) => {
    const ctx = { ws, distDir, emit: (e) => bus.emit('workspace', e) };
    return runTool(params.name, body.input ?? body, ctx);
  });

  // Library
  route('POST', '/api/library/export', async ({ body }) => {
    const res = await exportLibrary(ws, { distDir, studio: { name: config.get('studioName'), url: config.get('studioUrl'), author: config.get('author') }, only: body.projects });
    bus.emit('workspace', { type: 'library', ...res });
    return res;
  });
  route('GET', '/api/library', async () => {
    const text = await fsp.readFile(path.join(distDir, 'library', 'library.json'), 'utf8').catch(() => null);
    return text ? JSON.parse(text) : { items: [], generated: null };
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const denied = guard(req, url);
      if (denied) return send(res, 403, { error: denied });

      if (url.pathname === '/mcp') {
        if (req.method === 'POST') {
          const out = await handleMcp(await readBody(req), { ws, distDir, emit: (e) => bus.emit('workspace', e) });
          if (!out.json) {
            res.writeHead(202);
            return res.end();
          }
          return send(res, out.status, out.json);
        }
        if (req.method === 'DELETE') return send(res, 200, {});
        return send(res, 405, { error: 'Use POST for MCP requests' }, { allow: 'POST' });
      }

      if (url.pathname.startsWith('/api/')) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(url.pathname);
          if (!m) continue;
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
          const result = await r.handler({ req, res, url, params, body });
          if (!res.headersSent && result !== undefined) send(res, 200, result);
          return;
        }
        return send(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
      }

      if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
      // First visit with ?token=... stores the token in a cookie so links and downloads work.
      if (requireToken && url.searchParams.get('token')) {
        res.setHeader('set-cookie', `localhub_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
      }
      return serveStatic(res, url.pathname === '/' ? 'index.html' : url.pathname);
    } catch (err) {
      if (!res.headersSent) fail(res, err);
      else res.end();
    }
  });
  server.requestTimeout = 0; // SSE streams stay open
  return { server, ws, config, agents, distDir, host };
}

function workspaceGuide() {
  return `# Localhub Bedrock Studio workspace

Every folder here is a Minecraft Bedrock add-on project made with Localhub Bedrock Studio.

\`\`\`
<project>/
  project.json   name, type, namespace, version [x,y,z], library metadata
  DESIGN.md      the living design doc - read it first, keep it current
  BP/            behavior pack: manifest.json, scripts/ (@minecraft/server), items/, blocks/, entities/, recipes/, loot_tables/
  RP/            resource pack: manifest.json, textures/ (+ item_texture.json, terrain_texture.json), texts/en_US.lang
  .studio/       studio data (agent chats) - do not edit
\`\`\`

${CORE_RULES}

Tools: the studio server exposes validation, packaging, texture painting and Bedrock reference docs over MCP
(\`claude mcp add --transport http localhub http://127.0.0.1:3737/mcp\`) and plain HTTP (\`GET /api/tools\`,
\`POST /api/tools/<name>\` with \`{ "input": { ... } }\`). Run validate_project after every change.
`;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node server/index.js [--port 3737] [--host 127.0.0.1|0.0.0.0] [--data <dir>] [--token <secret>]');
    return;
  }
  const dataDir = path.resolve(args.data);
  let token = args.token;
  if (!isLoopback(args.host) && !token) {
    // Listening on the network: always require a token. Persist it so bookmarks keep working.
    const tokenFile = path.join(dataDir, '.localhub', 'token');
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    token = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : crypto.randomBytes(18).toString('base64url');
    fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  }
  const { server, ws, config } = createServer({ dataDir, host: args.host, token });
  server.listen(args.port, args.host, () => {
    const q = token ? `/?token=${token}` : '/';
    console.log(`\n  Localhub Bedrock Studio v${STUDIO_VERSION}`);
    console.log(`  Workspace: ${ws.root}`);
    console.log(`  Open:      http://localhost:${args.port}${q}`);
    if (!isLoopback(args.host)) for (const ip of lanAddresses()) console.log(`  LAN:       http://${ip}:${args.port}${q}`);
    console.log(`  MCP:       http://localhost:${args.port}/mcp${token ? `  (header "Authorization: Bearer ${token}")` : ''}`);
    if (!config.apiKey) console.log('  Note:      add your Anthropic API key in Settings to enable the agents.');
    console.log('');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
