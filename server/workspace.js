// Sandboxed file access for the IDE, the built-in agents and external agents (MCP / REST).
// Every path is relative to the workspace root and can never escape it.
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';

const IGNORED_NAMES = new Set(['node_modules', '.git', '.DS_Store']);
const BINARY_EXT = new Set([
  '.png', '.tga', '.jpg', '.jpeg', '.gif', '.webp', '.ogg', '.wav', '.mp3', '.fsb',
  '.zip', '.mcpack', '.mcaddon', '.mcworld', '.mctemplate', '.ttf', '.otf', '.bin',
]);

export class WorkspaceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function normalizeRel(rel = '') {
  const s = String(rel).replace(/\\/g, '/').trim();
  if (s.includes('\0')) throw new WorkspaceError('Invalid path');
  // A leading "/" means the workspace root; drive letters are never allowed.
  if (/^[a-zA-Z]:/.test(s)) throw new WorkspaceError('Absolute paths are not allowed');
  const parts = [];
  for (const part of s.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new WorkspaceError(`Path escapes the workspace: ${rel}`);
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

export function isBinaryPath(rel) {
  return BINARY_EXT.has(path.extname(rel).toLowerCase());
}

export class Workspace {
  constructor(root) {
    this.root = path.resolve(root);
    fssync.mkdirSync(this.root, { recursive: true });
    this.realRoot = fssync.realpathSync(this.root);
  }

  /** Resolve a workspace-relative path to an absolute one, refusing symlink escapes. */
  abs(rel) {
    const clean = normalizeRel(rel);
    const full = path.join(this.root, clean);
    // Walk up to the nearest existing ancestor and make sure its real path is inside the root.
    let probe = full;
    while (!fssync.existsSync(probe) && probe !== this.root) probe = path.dirname(probe);
    const real = fssync.realpathSync(probe);
    if (real !== this.realRoot && !real.startsWith(this.realRoot + path.sep)) {
      throw new WorkspaceError(`Path escapes the workspace: ${rel}`);
    }
    return full;
  }

  rel(abs) {
    return path.relative(this.root, abs).split(path.sep).join('/');
  }

  async exists(rel) {
    try {
      await fs.access(this.abs(rel));
      return true;
    } catch {
      return false;
    }
  }

  async stat(rel) {
    const st = await fs.stat(this.abs(rel)).catch(() => null);
    if (!st) return null;
    return { type: st.isDirectory() ? 'dir' : 'file', size: st.size, mtime: st.mtimeMs };
  }

  /** Flat listing: [{ path, type, size }] sorted dirs-first. */
  async list(rel = '', { depth = 8, maxEntries = 3000, includeHidden = true } = {}) {
    const start = this.abs(rel);
    const out = [];
    const walk = async (dir, level) => {
      if (level > depth || out.length >= maxEntries) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
      for (const e of entries) {
        if (out.length >= maxEntries) return;
        if (IGNORED_NAMES.has(e.name)) continue;
        if (!includeHidden && e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        const relPath = this.rel(full);
        if (e.isDirectory()) {
          out.push({ path: relPath, type: 'dir' });
          // Agent chat logs are large and noisy; list the folder but not its contents.
          if (relPath.endsWith('.studio/sessions')) continue;
          await walk(full, level + 1);
        } else if (e.isFile()) {
          const st = await fs.stat(full).catch(() => null);
          out.push({ path: relPath, type: 'file', size: st ? st.size : 0 });
        }
      }
    };
    const st = await fs.stat(start).catch(() => null);
    if (!st) throw new WorkspaceError(`Not found: ${rel || '/'}`, 404);
    if (!st.isDirectory()) throw new WorkspaceError(`Not a directory: ${rel}`);
    await walk(start, 1);
    return { entries: out, truncated: out.length >= maxEntries };
  }

  async readBuffer(rel) {
    const full = this.abs(rel);
    const st = await fs.stat(full).catch(() => null);
    if (!st) throw new WorkspaceError(`File not found: ${normalizeRel(rel)}`, 404);
    if (st.isDirectory()) throw new WorkspaceError(`${normalizeRel(rel)} is a directory`);
    return fs.readFile(full);
  }

  async readText(rel) {
    const buf = await this.readBuffer(rel);
    return buf.toString('utf8');
  }

  /** For the editor: text as utf8, binaries as base64. */
  async read(rel) {
    const buf = await this.readBuffer(rel);
    const binary = isBinaryPath(rel) || buf.subarray(0, 8000).includes(0);
    return binary
      ? { path: normalizeRel(rel), encoding: 'base64', content: buf.toString('base64'), size: buf.length }
      : { path: normalizeRel(rel), encoding: 'utf8', content: buf.toString('utf8'), size: buf.length };
  }

  async write(rel, data) {
    const clean = normalizeRel(rel);
    if (!clean) throw new WorkspaceError('A file path is required');
    const full = this.abs(clean);
    const st = await fs.stat(full).catch(() => null);
    if (st && st.isDirectory()) throw new WorkspaceError(`${clean} is a directory`);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, full);
    return { path: clean, size: Buffer.byteLength(data), created: !st };
  }

  async mkdir(rel) {
    const clean = normalizeRel(rel);
    if (!clean) throw new WorkspaceError('A folder path is required');
    await fs.mkdir(this.abs(clean), { recursive: true });
    return { path: clean };
  }

  /** Exact string replacement, like a code editor's find/replace. */
  async edit(rel, oldString, newString, replaceAll = false) {
    if (typeof oldString !== 'string' || oldString === '') throw new WorkspaceError('old_string must be a non-empty string');
    const text = await this.readText(rel);
    const count = text.split(oldString).length - 1;
    if (count === 0) throw new WorkspaceError(`old_string was not found in ${normalizeRel(rel)}. Re-read the file and copy the text exactly.`);
    if (count > 1 && !replaceAll) {
      throw new WorkspaceError(`old_string appears ${count} times in ${normalizeRel(rel)}. Add more surrounding context or set replace_all.`);
    }
    const updated = replaceAll ? text.split(oldString).join(newString) : text.replace(oldString, () => newString);
    await this.write(rel, updated);
    return { path: normalizeRel(rel), replacements: replaceAll ? count : 1 };
  }

  async remove(rel) {
    const clean = normalizeRel(rel);
    if (!clean) throw new WorkspaceError('Refusing to delete the workspace root');
    const full = this.abs(clean);
    if (!(await this.exists(clean))) throw new WorkspaceError(`Not found: ${clean}`, 404);
    await fs.rm(full, { recursive: true, force: true });
    return { path: clean };
  }

  async move(from, to) {
    const src = normalizeRel(from);
    const dst = normalizeRel(to);
    if (!src || !dst) throw new WorkspaceError('Both paths are required');
    if (!(await this.exists(src))) throw new WorkspaceError(`Not found: ${src}`, 404);
    if (await this.exists(dst)) throw new WorkspaceError(`Destination already exists: ${dst}`);
    await fs.mkdir(path.dirname(this.abs(dst)), { recursive: true });
    await fs.rename(this.abs(src), this.abs(dst));
    return { from: src, to: dst };
  }

  /** Grep-like search over text files. */
  async search(query, { under = '', regex = false, caseSensitive = false, maxResults = 200 } = {}) {
    if (!query) throw new WorkspaceError('query is required');
    let re;
    try {
      re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i');
    } catch (err) {
      throw new WorkspaceError(`Invalid regex: ${err.message}`);
    }
    const { entries } = await this.list(under, { depth: 12, maxEntries: 10000 });
    const results = [];
    for (const e of entries) {
      if (e.type !== 'file' || isBinaryPath(e.path) || e.size > 1_000_000 || e.path.includes('.studio/sessions/')) continue;
      const text = await this.readText(e.path).catch(() => '');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          results.push({ path: e.path, line: i + 1, text: lines[i].slice(0, 240) });
          if (results.length >= maxResults) return { results, truncated: true };
        }
      }
    }
    return { results, truncated: false };
  }
}
