import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Workspace } from '../server/workspace.js';
import { Config } from '../server/config.js';
import { createProject } from '../server/bedrock/scaffold.js';
import { SessionStore } from '../server/agents/sessions.js';
import { AgentService } from '../server/agents/runner.js';
import { runTool, validateInput, TOOLS } from '../server/agents/tools.js';
import { handleMcp } from '../server/mcp.js';
import { startMockAnthropic, studioScript } from './helpers/mock-anthropic.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'localhub-agents-'));
let mock;
let script = studioScript;

before(async () => {
  mock = await startMockAnthropic((body) => script(body));
  process.env.ANTHROPIC_BASE_URL = mock.url;
});
after(() => mock.close());

async function setup() {
  const dir = tmp();
  const ws = new Workspace(path.join(dir, 'workspace'));
  const config = new Config(dir);
  config.update({ apiKey: 'sk-ant-test' });
  const bus = new EventEmitter();
  const sessions = new SessionStore(ws);
  const agents = new AgentService({ config, ws, distDir: path.join(dir, 'dist'), sessions, bus });
  const { slug } = await createProject(ws, { name: 'Demo', template: 'blank', namespace: 'demo' });
  return { dir, ws, config, bus, sessions, agents, slug };
}

function collect(agents, runId) {
  return new Promise((resolve) => {
    const events = [];
    agents.subscribe(runId, 0, (e) => (e ? events.push(e) : resolve(events)));
  });
}

test('scoped tools stay inside the project', async () => {
  const { ws, slug } = await setup();
  const ctx = { ws, scope: slug };
  assert.equal((await runTool('write_file', { path: 'BP/x.txt', content: 'hi' }, ctx)).ok, true);
  assert.equal(await ws.readText(`${slug}/BP/x.txt`), 'hi');
  assert.equal((await runTool('read_file', { path: `${slug}/BP/x.txt` }, ctx)).text, 'hi');
  const escape = await runTool('write_file', { path: '../other/x.txt', content: 'no' }, ctx);
  assert.equal(escape.ok, false);
  assert.match(escape.text, /outside the project|escapes/);
  const bad = await runTool('write_file', { path: 'a.txt' }, ctx);
  assert.equal(bad.ok, false);
  assert.match(bad.text, /content is required/);
  const img = await runTool('read_file', { path: 'RP/pack_icon.png' }, ctx);
  assert.equal(img.images.length, 1);
  assert.deepEqual(validateInput({ type: 'object', properties: { n: { type: 'integer' } } }, { n: 1.5 }), ['input.n must be an integer']);
  for (const t of TOOLS) assert.ok(t.description.length > 20 && t.input_schema.type === 'object', t.name);
});

test('MCP: initialize, list and call tools', async () => {
  const { ws, slug } = await setup();
  const ctx = { ws, distDir: '' };
  const init = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, ctx);
  assert.equal(init.json.result.protocolVersion, '2025-06-18');
  assert.equal((await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx)).status, 202);
  const list = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx);
  assert.ok(list.json.result.tools.some((t) => t.name === 'create_project'));
  const call = await handleMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'validate_project', arguments: { project: slug } } }, ctx);
  assert.match(call.json.result.content[0].text, /^PASS/);
  const unknown = await handleMcp({ jsonrpc: '2.0', id: 4, method: 'nope' }, ctx);
  assert.equal(unknown.json.error.code, -32601);
});

test('agent run: director writes, delegates to the artist, validates and reports', async () => {
  script = studioScript;
  const { agents, ws, sessions, slug } = await setup();
  const start = mock.requests.length;
  const { runId, sessionId } = await agents.start({ project: slug, agent: 'director', message: 'Add a ruby' });
  const events = await collect(agents, runId);
  const types = events.map((e) => e.type);

  assert.equal(events.at(-1).type, 'done');
  assert.equal(events.at(-1).status, 'completed', JSON.stringify(events.filter((e) => e.type === 'error')));
  for (const t of ['run_start', 'text_delta', 'tool_start', 'tool_call', 'tool_result', 'delegate_start', 'delegate_end', 'thinking_delta', 'file_changed', 'usage']) assert.ok(types.includes(t), t);
  assert.ok(await ws.exists(`${slug}/BP/items/ruby.json`));
  assert.ok(await ws.exists(`${slug}/RP/textures/demo/ruby.png`));

  // The artist's events are nested under the delegation.
  const artistEvents = events.filter((e) => e.agent === 'artist');
  assert.ok(artistEvents.length > 0 && artistEvents.every((e) => e.depth === 1));

  // Request shape: adaptive thinking, explicit effort, eager input streaming, caching, fallbacks.
  const req = mock.requests[start].body;
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.max_tokens, 64000);
  assert.equal(req.stream, true);
  assert.deepEqual(req.thinking, { type: 'adaptive', display: 'updates' });
  assert.deepEqual(req.output_config, { effort: 'high' });
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.cache_control, { type: 'ephemeral' });
  assert.deepEqual(req.system[0].cache_control, { type: 'ephemeral' });
  assert.ok(req.tools.every((t) => t.eager_input_streaming === true));
  assert.ok(req.tools.some((t) => t.name === 'delegate'));
  assert.equal(req.temperature, undefined);
  const betas = mock.requests[start].headers['anthropic-beta'];
  assert.match(betas, /server-side-fallback-2026-07-01/);
  assert.match(betas, /thinking-display-updates-2026-08-18/);
  const artistReq = mock.requests.slice(start).find((r) => r.body.system[0].text.startsWith('You are the Pixel Artist')).body;
  assert.deepEqual(artistReq.output_config, { effort: 'medium' });
  assert.ok(!artistReq.tools.some((t) => t.name === 'delegate'));

  // History is append-only: every request's messages are a prefix of the next one's.
  const directorReqs = mock.requests.slice(start).filter((r) => r.body.system[0].text.startsWith('You are the Studio Director')).map((r) => r.body);
  for (let i = 1; i < directorReqs.length; i++) {
    const prev = JSON.stringify(directorReqs[i - 1].messages);
    assert.ok(JSON.stringify(directorReqs[i].messages).startsWith(prev.slice(0, -1)), `request ${i} rewrote history`);
    assert.equal(directorReqs[i].system[0].text, directorReqs[0].system[0].text);
  }

  // Sessions persist, including the delegated one, and thinking signatures survive.
  const saved = await sessions.load(slug, sessionId);
  assert.equal(saved.messages.at(-1).role, 'assistant');
  assert.ok(saved.usage.costUsd > 0);
  const list = await sessions.list(slug);
  assert.ok(list.some((s) => s.agent === 'artist' && s.parent === sessionId));
  const child = await sessions.load(slug, list.find((s) => s.agent === 'artist').id);
  assert.equal(child.messages[1].content[0].signature, 'sig_mock');

  // A follow-up message continues the same session.
  script = () => ({ stop: 'end_turn', blocks: [{ type: 'text', text: 'Sure.' }] });
  const second = await agents.start({ project: slug, sessionId, message: 'thanks' });
  const ev2 = await collect(agents, second.runId);
  assert.equal(ev2.at(-1).status, 'completed');
  assert.equal((await sessions.load(slug, sessionId)).messages.length, saved.messages.length + 2);
});

test('agent run: refusal is reported and the partial turn is discarded', async () => {
  const { agents, sessions, slug } = await setup();
  script = () => ({ stop: 'refusal', blocks: [{ type: 'text', text: 'partial' }] });
  const { runId, sessionId } = await agents.start({ project: slug, agent: 'scripter', message: 'hello' });
  const events = await collect(agents, runId);
  assert.ok(events.some((e) => e.type === 'refusal'));
  assert.equal(events.at(-1).status, 'refused');
  const s = await sessions.load(slug, sessionId);
  assert.equal(s.messages.length, 1);
  assert.equal(s.messages[0].role, 'user');
});

test('agent run: optional API features are dropped after a 400', async () => {
  const { agents, slug } = await setup();
  let calls = 0;
  script = (body) => {
    calls++;
    if (body.fallbacks) return { status: 400, message: 'unknown beta' };
    return { stop: 'end_turn', blocks: [{ type: 'text', text: 'ok without betas' }] };
  };
  const { runId } = await agents.start({ project: slug, agent: 'qa', message: 'hi' });
  const events = await collect(agents, runId);
  assert.equal(events.at(-1).status, 'completed');
  assert.ok(events.some((e) => e.type === 'notice'));
  assert.ok(calls >= 2);
});

test('agent run: cancelling stops the run and keeps history valid', async () => {
  const { agents, sessions, slug } = await setup();
  script = (body) => (body.messages.filter((m) => m.role === 'assistant').length === 0
    ? { stop: 'tool_use', blocks: [{ type: 'tool_use', name: 'list_files', input: {} }] }
    : { stop: 'end_turn', delayMs: 3000, blocks: [{ type: 'text', text: 'late' }] });
  const { runId, sessionId } = await agents.start({ project: slug, agent: 'content', message: 'look around' });
  const done = collect(agents, runId);
  await new Promise((r) => setTimeout(r, 600));
  agents.cancel(runId);
  const events = await done;
  assert.equal(events.at(-1).status, 'cancelled');
  const s = await sessions.load(slug, sessionId);
  // user, assistant(tool_use), user(tool_result) - no dangling tool_use.
  assert.equal(s.messages.at(-1).role, 'user');
  assert.equal(s.messages.at(-1).content[0].type, 'tool_result');
});

test('agent errors are explained in plain language', async () => {
  const { agents, slug } = await setup();
  script = () => ({ status: 401, errorType: 'authentication_error', message: 'invalid x-api-key' });
  const { runId } = await agents.start({ project: slug, agent: 'economy', message: 'hi' });
  const events = await collect(agents, runId);
  assert.match(events.find((e) => e.type === 'error').message, /API key was rejected/);
  assert.equal(events.at(-1).status, 'error');
});
