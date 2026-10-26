// Agent conversations are stored per project in <project>/.studio/sessions/<id>.json.
// History is append-only: earlier messages are never edited, which keeps prompt caching
// and Claude's preserved thinking valid across turns.
import crypto from 'node:crypto';
import { normalizeRel, WorkspaceError } from '../workspace.js';

const dirOf = (project) => `${normalizeRel(project)}/.studio/sessions`;
const ID_RE = /^[a-z0-9-]{6,40}$/;

export class SessionStore {
  constructor(ws) {
    this.ws = ws;
    this.locks = new Map();
  }

  newId() {
    return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  }

  create({ project, agent, model, effort, system, toolNames, parent = null, title = '' }) {
    const now = new Date().toISOString();
    return {
      id: this.newId(),
      project: normalizeRel(project),
      agent,
      model,
      effort,
      system,
      toolNames,
      parent,
      title,
      created: now,
      updated: now,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
      messages: [],
    };
  }

  async load(project, id) {
    if (!ID_RE.test(id)) throw new WorkspaceError('Invalid session id');
    const text = await this.ws.readText(`${dirOf(project)}/${id}.json`);
    return JSON.parse(text);
  }

  /** Writes are serialized per session so a slow write never lands after a newer one. */
  async save(session) {
    session.updated = new Date().toISOString();
    const key = `${session.project}/${session.id}`;
    const prev = this.locks.get(key) || Promise.resolve();
    const next = prev.then(() => this.ws.write(`${dirOf(session.project)}/${session.id}.json`, JSON.stringify(session)));
    this.locks.set(key, next.catch(() => {}));
    return next;
  }

  async list(project) {
    const dir = dirOf(project);
    if (!(await this.ws.exists(dir))) return [];
    const { entries } = await this.ws.list(dir, { depth: 1 });
    const out = [];
    for (const e of entries.filter((x) => x.type === 'file' && x.path.endsWith('.json'))) {
      try {
        const s = JSON.parse(await this.ws.readText(e.path));
        out.push({
          id: s.id,
          agent: s.agent,
          title: s.title || '(untitled)',
          parent: s.parent,
          model: s.model,
          updated: s.updated,
          created: s.created,
          usage: s.usage,
          messages: s.messages.length,
        });
      } catch {
        // skip corrupt files
      }
    }
    return out.sort((a, b) => (a.updated < b.updated ? 1 : -1));
  }

  async remove(project, id) {
    if (!ID_RE.test(id)) throw new WorkspaceError('Invalid session id');
    await this.ws.remove(`${dirOf(project)}/${id}.json`);
  }
}
