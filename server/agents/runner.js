// The agent loop: streams Claude's work to the IDE, runs tools against the workspace,
// lets the Director delegate to specialists, and keeps a replayable event log per run
// so a phone that drops its connection can reattach without losing anything.
import Anthropic from '@anthropic-ai/sdk';
import { AGENTS, SPECIALISTS, systemPrompt, toolNamesFor } from './roster.js';
import { getTool, runTool } from './tools.js';
import { readProjectMeta } from '../bedrock/pack.js';
import { WorkspaceError } from '../workspace.js';

const MAX_TOKENS = 64000;
const MAX_EVENTS = 20000;
const RUN_TTL_MS = 30 * 60 * 1000;

// $ per million tokens (estimates for the cost meter).
const PRICING = {
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-fable-5-1': { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

const DELEGATE_TOOL = {
  name: 'delegate',
  description: `Hand a self-contained task to a specialist agent and get their report back. Specialists start with no memory of this
conversation, so the task must include the goal, the exact files they own, identifiers/keys/function names to use, how their part
connects to the rest, and what to report. Several delegate calls in one turn run in parallel - give each one different files.
Use it for substantial, separable work (a whole system, a batch of content, a set of textures, a balance pass, a QA pass), not for one-line edits.`,
  input_schema: {
    type: 'object',
    properties: {
      agent: { type: 'string', enum: SPECIALISTS, description: 'Which specialist' },
      task: { type: 'string', description: 'The complete brief' },
      files: { type: 'array', items: { type: 'string' }, description: 'Files/folders this specialist owns for this task' },
    },
    required: ['agent', 'task'],
  },
};

function toolDefs(names) {
  return names.map((name) => {
    const t = name === 'delegate' ? DELEGATE_TOOL : getTool(name);
    if (!t) throw new Error(`Unknown tool ${name}`);
    // Stream large inputs (file bodies) as they are generated; we validate inputs ourselves.
    return { name: t.name, description: t.description, input_schema: t.input_schema, eager_input_streaming: true };
  });
}

function summarizeInput(name, input = {}) {
  if (!input || typeof input !== 'object') return '';
  if (name === 'write_file') return `${input.path} (${(input.content || '').length} chars)`;
  if (name === 'paint_texture') return `${input.path} ${input.width}x${input.height}`;
  if (name === 'delegate') return `${input.agent}: ${(input.task || '').slice(0, 160)}`;
  if (input.path) return input.path;
  return Object.keys(input).length ? JSON.stringify(input).slice(0, 160) : '';
}

function addUsage(session, message) {
  const u = message.usage || {};
  const p = PRICING[session.model] || PRICING['claude-opus-5-5'];
  const add = {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
  };
  const cost = (add.input * p.in + add.output * p.out + add.cacheRead * p.cacheRead + add.cacheWrite * p.cacheWrite) / 1e6;
  for (const k of Object.keys(add)) session.usage[k] += add[k];
  session.usage.costUsd = Math.round((session.usage.costUsd + cost) * 1e6) / 1e6;
  return { ...add, costUsd: cost };
}

/** If a previous run died between a tool call and its result, answer the call (appending, never editing). */
function repairDanglingToolUse(session) {
  const last = session.messages.at(-1);
  if (last?.role !== 'assistant' || !Array.isArray(last.content)) return;
  const pending = last.content.filter((b) => b.type === 'tool_use');
  if (!pending.length) return;
  session.messages.push({
    role: 'user',
    content: pending.map((t) => ({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Interrupted before this tool ran.' })),
  });
}

const finalText = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

export class AgentService {
  constructor({ config, ws, distDir, sessions, bus }) {
    this.config = config;
    this.ws = ws;
    this.distDir = distDir;
    this.sessions = sessions;
    this.bus = bus;
    this.runs = new Map();
    this.safeMode = false; // set if the API rejects the optional beta features
    setInterval(() => this.#sweep(), 60_000).unref();
  }

  client() {
    const apiKey = this.config.apiKey;
    // Without a key the SDK falls back to ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.
    return new Anthropic(apiKey ? { apiKey, maxRetries: 3 } : { maxRetries: 3 });
  }

  modelFor(agentKey) {
    return agentKey === 'director' ? this.config.get('model') : this.config.get('specialistModel') || this.config.get('model');
  }

  effortFor(agentKey) {
    const e = this.config.get('effort');
    return agentKey === 'director' ? e.director : e.specialists;
  }

  async newSession(project, agentKey, { parent = null, title = '' } = {}) {
    if (!AGENTS[agentKey]) throw new WorkspaceError(`Unknown agent ${agentKey}`);
    const meta = await readProjectMeta(this.ws, project);
    if (!(await this.ws.exists(meta.slug))) throw new WorkspaceError(`Project ${project} not found`, 404);
    return this.sessions.create({
      project: meta.slug,
      agent: agentKey,
      model: this.modelFor(agentKey),
      effort: this.effortFor(agentKey),
      system: systemPrompt(agentKey, meta),
      toolNames: toolNamesFor(agentKey),
      parent,
      title,
    });
  }

  /** Start a run in the background; returns immediately with ids the client can subscribe to. */
  async start({ project, sessionId, agent = 'director', message, editorFile }) {
    if (!message || !String(message).trim()) throw new WorkspaceError('Message is empty');
    const session = sessionId ? await this.sessions.load(project, sessionId) : await this.newSession(project, agent, { title: String(message).slice(0, 80) });
    for (const r of this.runs.values()) {
      if (r.sessionId === session.id && r.status === 'running') throw new WorkspaceError('This chat is already working - wait or stop it first', 409);
    }
    repairDanglingToolUse(session);
    const run = {
      id: `run-${this.sessions.newId()}`,
      project: session.project,
      sessionId: session.id,
      agent: session.agent,
      status: 'running',
      events: [],
      seq: 0,
      listeners: new Set(),
      abort: new AbortController(),
      started: Date.now(),
      ended: null,
      messageIndex: session.messages.length, // where this run's user message sits in the history
    };
    this.runs.set(run.id, run);
    const emit = (event) => this.#emit(run, event);
    let text = String(message).trim();
    if (editorFile) text += `\n\n(The user has ${editorFile} open in the editor.)`;
    session.messages.push({ role: 'user', content: text });
    await this.sessions.save(session);
    emit({ type: 'run_start', runId: run.id, sessionId: session.id, agent: session.agent, model: session.model, message: String(message).trim() });

    (async () => {
      let status = 'error';
      try {
        const res = await this.#loop({ session, emit, signal: run.abort.signal, depth: 0 });
        status = res.status;
      } catch (err) {
        emit({ type: 'error', message: this.#describeError(err) });
      } finally {
        run.status = status;
        run.ended = Date.now();
        emit({ type: 'done', status, usage: session.usage });
        for (const l of run.listeners) l(null);
        run.listeners.clear();
      }
    })();
    return { runId: run.id, sessionId: session.id };
  }

  cancel(runId) {
    const run = this.runs.get(runId);
    if (!run) throw new WorkspaceError('Run not found', 404);
    run.abort.abort();
    return { ok: true };
  }

  activeRuns(project) {
    return [...this.runs.values()].filter((r) => r.status === 'running' && (!project || r.project === project))
      .map((r) => ({ runId: r.id, sessionId: r.sessionId, agent: r.agent, started: r.started, messageIndex: r.messageIndex }));
  }

  /** Replay events after `after`, then stream new ones. listener(null) means the run ended. */
  subscribe(runId, after, listener) {
    const run = this.runs.get(runId);
    if (!run) return null;
    for (const e of run.events) if (e.seq > after) listener(e);
    if (run.status !== 'running') {
      listener(null);
      return () => {};
    }
    run.listeners.add(listener);
    return () => run.listeners.delete(listener);
  }

  #emit(run, event) {
    const e = { seq: ++run.seq, at: Date.now(), ...event };
    run.events.push(e);
    if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
    for (const l of run.listeners) l(e);
    if (event.type === 'file_changed' || event.type === 'build') this.bus.emit('workspace', event);
  }

  #sweep() {
    const now = Date.now();
    for (const [id, r] of this.runs) if (r.ended && now - r.ended > RUN_TTL_MS) this.runs.delete(id);
  }

  #describeError(err) {
    if (err instanceof Anthropic.AuthenticationError) return 'Anthropic API key was rejected. Check it in Settings.';
    if (err instanceof Anthropic.PermissionDeniedError) return `The API key is not allowed to use this model or feature: ${err.message}`;
    if (err instanceof Anthropic.NotFoundError) return `Model not found: ${err.message}`;
    if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the Anthropic API - wait a moment and try again.';
    if (err instanceof Anthropic.BadRequestError) return `The API rejected the request: ${err.message}`;
    if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API - check your internet connection.';
    if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ''}: ${err.message}`;
    if (err instanceof Anthropic.AnthropicError && /api key|authentication/i.test(err.message)) {
      return 'No Anthropic API key found. Add one in Settings (or set ANTHROPIC_API_KEY).';
    }
    return err?.message || String(err);
  }

  #params(session, tools) {
    const features = this.safeMode ? {} : this.config.get('features');
    const isHaiku = session.model.startsWith('claude-haiku');
    const betas = [];
    const params = {
      model: session.model,
      max_tokens: MAX_TOKENS,
      // Stable prefix first (tools -> system), cached; the conversation tail is cached automatically.
      system: [{ type: 'text', text: session.system, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: session.messages,
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: session.effort },
    };
    if (features.progressUpdates && !isHaiku) {
      // Short progress notes between tool calls instead of full reasoning summaries.
      params.thinking.display = 'updates';
      betas.push('thinking-display-updates-2026-08-18');
    }
    if (features.fallbacks && !isHaiku) {
      // If a safety classifier declines a benign request, the API retries on a recommended fallback model.
      params.fallbacks = 'default';
      betas.push('server-side-fallback-2026-07-01');
    }
    if (features.compaction) {
      // Very long chats get summarized server-side instead of overflowing the context window.
      params.context_management = { edits: [{ type: 'compact_20260112' }] };
      betas.push('compact-2026-01-12');
    }
    if (betas.length) params.betas = betas;
    return params;
  }

  async #loop({ session, emit, signal, depth }) {
    const agent = session.agent;
    const tag = { agent, depth, sessionId: session.id };
    const tools = toolDefs(session.toolNames);
    const maxTurns = AGENTS[agent]?.maxTurns ?? 50;
    const client = this.client();
    let turns = 0;
    let jsonRetries = 0;
    let truncations = 0;

    while (true) {
      if (signal.aborted) return { status: 'cancelled', text: '' };
      if (++turns > maxTurns) {
        emit({ type: 'notice', ...tag, message: `${AGENTS[agent].name} reached its step limit (${maxTurns}). Send "continue" to keep going.` });
        return { status: 'limit', text: 'Stopped at the step limit before finishing.' };
      }
      emit({ type: 'turn_start', ...tag, turn: turns });

      let message;
      try {
        const stream = client.beta.messages.stream(this.#params(session, tools), { signal });
        stream.on('streamEvent', (ev) => {
          if (ev.type !== 'content_block_start') return;
          const b = ev.content_block;
          if (b.type === 'tool_use') emit({ type: 'tool_start', ...tag, id: b.id, name: b.name });
          else if (b.type === 'text') emit({ type: 'text_start', ...tag });
          else if (b.type === 'thinking') emit({ type: 'thinking_start', ...tag });
        });
        stream.on('text', (delta) => emit({ type: 'text_delta', ...tag, text: delta }));
        stream.on('thinking', (delta) => delta && emit({ type: 'thinking_delta', ...tag, text: delta }));
        message = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        if (signal.aborted || err instanceof Anthropic.APIUserAbortError) return { status: 'cancelled', text: '' };
        if (err instanceof Anthropic.BadRequestError && !this.safeMode && Object.values(this.config.get('features')).some(Boolean)) {
          // Optional beta features may not be enabled for every account - retry once without them.
          this.safeMode = true;
          emit({ type: 'notice', ...tag, message: `Retrying without optional API features (${err.message.slice(0, 160)})` });
          turns--;
          continue;
        }
        if (err instanceof Anthropic.APIError) throw err;
        // Eager input streaming: the model produced tool input JSON the SDK could not parse. Re-issue the turn.
        if (jsonRetries++ < 2) {
          emit({ type: 'notice', ...tag, message: 'A tool call came back malformed - retrying that step.' });
          turns--;
          continue;
        }
        throw err;
      }

      const cost = addUsage(session, message);
      if (message.stop_reason === 'refusal') {
        // Declined (after any fallback). Discard the partial turn so the history stays clean.
        await this.sessions.save(session);
        emit({ type: 'usage', ...tag, turn: cost, total: session.usage });
        emit({ type: 'refusal', ...tag, category: message.stop_details?.category ?? null, explanation: message.stop_details?.explanation ?? '' });
        return { status: 'refused', text: 'The request was declined by a safety filter.' };
      }
      session.messages.push({ role: 'assistant', content: message.content });
      await this.sessions.save(session);
      emit({ type: 'usage', ...tag, turn: cost, total: session.usage });
      if (message.stop_reason === 'pause_turn') continue;

      const toolUses = message.content.filter((b) => b.type === 'tool_use');
      if (!toolUses.length) return { status: 'completed', text: finalText(message.content) };

      let results;
      if (message.stop_reason === 'max_tokens') {
        // The last tool input was cut off. Answer every call so the history stays valid, and ask for smaller steps.
        results = toolUses.map((t) => ({
          type: 'tool_result',
          tool_use_id: t.id,
          is_error: true,
          content: 'This call was cut off by the output limit and did not run. Re-issue it with less content per call (split big files into modules).',
        }));
        if (++truncations > 3) {
          session.messages.push({ role: 'user', content: results });
          await this.sessions.save(session);
          return { status: 'limit', text: 'Stopped: output kept hitting the token limit.' };
        }
      } else {
        results = await this.#runTools(toolUses, { session, emit, signal, depth, tag });
      }
      session.messages.push({ role: 'user', content: results });
      await this.sessions.save(session);
    }
  }

  async #runTools(toolUses, { session, emit, signal, depth, tag }) {
    const ctx = { ws: this.ws, distDir: this.distDir, scope: session.project, emit: (e) => emit({ ...e, ...tag }) };
    const one = async (t) => {
      emit({ type: 'tool_call', ...tag, id: t.id, name: t.name, summary: summarizeInput(t.name, t.input), path: typeof t.input?.path === 'string' ? t.input.path : undefined });
      if (signal.aborted) return this.#result(t, { ok: false, text: 'Cancelled by the user before it ran.' }, emit, tag);
      if (!session.toolNames.includes(t.name)) return this.#result(t, { ok: false, text: `Tool ${t.name} is not available to you.` }, emit, tag);
      if (t.name === 'delegate') return this.#result(t, await this.#delegate(t.input, { session, emit, signal, depth }), emit, tag);
      return this.#result(t, await runTool(t.name, t.input, ctx), emit, tag);
    };
    // Read-only calls and delegations run in parallel; anything that writes runs in order.
    const parallel = toolUses.every((t) => t.name === 'delegate' || getTool(t.name)?.readOnly);
    if (parallel) return Promise.all(toolUses.map(one));
    const out = [];
    for (const t of toolUses) out.push(await one(t));
    return out;
  }

  #result(toolUse, res, emit, tag) {
    emit({ type: 'tool_result', ...tag, id: toolUse.id, name: toolUse.name, ok: res.ok, summary: res.text.slice(0, 400) });
    const content = [{ type: 'text', text: res.text || '(no output)' }];
    for (const img of res.images || []) content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
    return { type: 'tool_result', tool_use_id: toolUse.id, content, ...(res.ok ? {} : { is_error: true }) };
  }

  async #delegate(input, { session, emit, signal, depth }) {
    if (depth > 0) return { ok: false, text: 'Specialists cannot delegate further.' };
    const agentKey = input?.agent;
    if (!SPECIALISTS.includes(agentKey)) return { ok: false, text: `Unknown specialist "${agentKey}". Use one of: ${SPECIALISTS.join(', ')}` };
    if (typeof input.task !== 'string' || input.task.trim().length < 20) return { ok: false, text: 'The task brief is missing or too short.' };
    const child = await this.newSession(session.project, agentKey, { parent: session.id, title: input.task.slice(0, 80) });
    const files = Array.isArray(input.files) && input.files.length ? `\n\nFiles you own for this task: ${input.files.join(', ')}` : '';
    child.messages.push({ role: 'user', content: `Brief from the Studio Director:\n\n${input.task}${files}` });
    await this.sessions.save(child);
    emit({ type: 'delegate_start', agent: session.agent, depth, target: agentKey, sessionId: child.id, task: input.task.slice(0, 300) });
    let res;
    try {
      res = await this.#loop({ session: child, emit, signal, depth: depth + 1 });
    } catch (err) {
      res = { status: 'error', text: this.#describeError(err) };
    }
    // Specialist spend counts toward the parent chat's meter too.
    for (const k of ['input', 'output', 'cacheRead', 'cacheWrite', 'costUsd']) session.usage[k] += child.usage[k];
    emit({ type: 'delegate_end', agent: session.agent, depth, target: agentKey, sessionId: child.id, status: res.status, summary: res.text.slice(0, 600) });
    const report = res.text.length > 8000 ? `${res.text.slice(0, 8000)}\n... (report truncated)` : res.text;
    return {
      ok: res.status === 'completed',
      text: `${AGENTS[agentKey].name} finished with status "${res.status}" (chat ${child.id}).\n\n${report || '(no report)'}`,
    };
  }
}
