// A scripted stand-in for the Anthropic Messages API (streaming SSE), so the agent loop can be
// tested end-to-end without network access or API spend.
import http from 'node:http';

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

let counter = 0;

/** blocks: [{ type: 'text', text } | { type: 'thinking', thinking } | { type: 'tool_use', name, input }] */
export function streamEvents(blocks, stopReason) {
  const events = [{
    type: 'message_start',
    message: { id: `msg_mock_${++counter}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 } },
  }];
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      for (const part of b.text.match(/.{1,12}/gs) || []) events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: part } });
    } else if (b.type === 'thinking') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: b.thinking } });
      events.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig_mock' } });
    } else if (b.type === 'tool_use') {
      events.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `toolu_mock_${++counter}`, name: b.name, input: {} } });
      const json = JSON.stringify(b.input);
      for (let i = 0; i < json.length; i += 40) events.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 40) } });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 350 } });
  events.push({ type: 'message_stop' });
  return events;
}

/**
 * script(request) -> { blocks, stop } decides the next assistant turn from the request body.
 * Returns { url, requests, close }.
 */
export async function startMockAnthropic(script) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'not found' } }));
      }
      const json = JSON.parse(body);
      requests.push({ url: req.url, headers: req.headers, body: json });
      const turn = script(json);
      if (turn.status) {
        res.writeHead(turn.status, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: turn.errorType || 'invalid_request_error', message: turn.message || 'mock error' } }));
      }
      const delay = turn.delayMs || 0;
      setTimeout(() => sse(res, streamEvents(turn.blocks, turn.stop)), delay);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((r) => server.close(r)) };
}

const isArtist = (body) => body.system?.[0]?.text?.startsWith('You are the Pixel Artist');
const assistantTurns = (body) => body.messages.filter((m) => m.role === 'assistant').length;

/** A realistic little studio session: Director writes a file, delegates a texture, validates, reports. */
export function studioScript(body) {
  if (isArtist(body)) {
    if (assistantTurns(body) === 0) {
      return {
        stop: 'tool_use',
        blocks: [
          { type: 'thinking', thinking: 'Painting a ruby gem with a dark outline.' },
          { type: 'text', text: 'Painting the ruby texture.' },
          { type: 'tool_use', name: 'paint_texture', input: { path: 'RP/textures/demo/ruby.png', width: 4, height: 4, palette: { r: '#c3122a', k: '#3b0a12' }, pixels: ['.kk.', 'krrk', 'krrk', '.kk.'] } },
        ],
      };
    }
    return { stop: 'end_turn', blocks: [{ type: 'text', text: 'Painted RP/textures/demo/ruby.png (4x4). Register it as "demo_ruby".' }] };
  }
  switch (assistantTurns(body)) {
    case 0:
      return {
        stop: 'tool_use',
        blocks: [
          { type: 'text', text: 'I will add a ruby item and get the artist on the texture.' },
          { type: 'tool_use', name: 'write_file', input: { path: 'BP/items/ruby.json', content: '{\n  "format_version": "1.21.60",\n  "minecraft:item": { "description": { "identifier": "demo:ruby" }, "components": {} }\n}\n' } },
        ],
      };
    case 1:
      return {
        stop: 'tool_use',
        blocks: [{ type: 'tool_use', name: 'delegate', input: { agent: 'artist', task: 'Paint a small ruby texture at RP/textures/demo/ruby.png in the studio style.', files: ['RP/textures/demo/ruby.png'] } }],
      };
    case 2:
      return { stop: 'tool_use', blocks: [{ type: 'tool_use', name: 'validate_project', input: {} }] };
    default:
      return { stop: 'end_turn', blocks: [{ type: 'text', text: '**Done.** Added `demo:ruby` and a texture. Validate passes.' }] };
  }
}
