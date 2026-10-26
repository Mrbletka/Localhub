import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer } from '../server/index.js';

async function start(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localhub-server-'));
  const { server } = createServer({ dataDir, ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const request = (method, url, { body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          // not json
        }
        resolve({ status: res.statusCode, headers: res.headers, json, text: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
  return { server, port, request, dataDir, close: () => new Promise((r) => server.close(r)) };
}

test('API: create, list, edit, validate, build, download', async () => {
  const s = await start();
  try {
    assert.equal((await s.request('GET', '/')).status, 200);
    const created = await s.request('POST', '/api/projects', { body: { name: 'Lava Tycoon', template: 'tycoon' } });
    assert.equal(created.status, 200);
    const list = await s.request('GET', '/api/projects');
    assert.equal(list.json[0].slug, 'lava-tycoon');
    const file = await s.request('GET', '/api/file?path=lava-tycoon/DESIGN.md');
    assert.match(file.json.content, /Lava Tycoon/);
    assert.equal((await s.request('PUT', '/api/file', { body: { path: 'lava-tycoon/notes.txt', content: 'x' } })).status, 200);
    assert.equal((await s.request('POST', '/api/projects/lava-tycoon/validate')).json.ok, true);
    const build = await s.request('POST', '/api/projects/lava-tycoon/build', { body: { bump: 'minor' } });
    assert.equal(build.json.version, '1.1.0');
    const dl = await s.request('GET', `/api/download?file=${encodeURIComponent(build.json.download)}`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers['content-disposition'], /lava-tycoon-v1\.1\.0\.mcaddon/);
    const raw = await s.request('GET', '/api/raw?path=lava-tycoon/DESIGN.md');
    assert.match(raw.headers['content-type'], /text\/plain/);
    const del = await s.request('DELETE', '/api/projects/lava-tycoon');
    assert.match(del.json.movedTo, /^\.trash\//);
    assert.equal((await s.request('GET', '/api/projects')).json.length, 0);
  } finally {
    await s.close();
  }
});

test('security: cross-origin, foreign hosts and traversal are refused', async () => {
  const s = await start();
  try {
    assert.equal((await s.request('GET', '/api/projects', { headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await s.request('GET', '/api/projects', { headers: { host: 'evil.example' } })).status, 403);
    assert.equal((await s.request('GET', `/api/projects`, { headers: { origin: `http://127.0.0.1:${s.port}` } })).status, 200);
    assert.equal((await s.request('GET', '/api/file?path=../../../../etc/passwd')).status, 400);
    assert.equal((await s.request('GET', '/api/download?file=../.localhub/config.json')).status, 400);
    assert.equal((await s.request('GET', '/../server/index.js')).status, 404);
  } finally {
    await s.close();
  }
});

test('security: token mode requires the token', async () => {
  const s = await start({ token: 'secret-token', host: '0.0.0.0' });
  try {
    assert.equal((await s.request('GET', '/api/projects', { headers: { host: '192.168.1.20' } })).status, 403);
    assert.equal((await s.request('GET', '/api/projects', { headers: { host: '192.168.1.20', authorization: 'Bearer secret-token' } })).status, 200);
    const page = await s.request('GET', '/?token=secret-token', { headers: { host: '192.168.1.20' } });
    assert.match(page.headers['set-cookie'][0], /localhub_token=secret-token; Path=\/; HttpOnly; SameSite=Strict/);
    assert.equal((await s.request('GET', '/api/projects', { headers: { host: '192.168.1.20', cookie: 'localhub_token=secret-token' } })).status, 200);
  } finally {
    await s.close();
  }
});

test('config never returns the API key', async () => {
  const s = await start();
  try {
    const put = await s.request('PUT', '/api/config', { body: { apiKey: 'sk-ant-api03-supersecretvalue', model: 'claude-sonnet-5-5', effort: { director: 'bogus' } } });
    assert.equal(put.json.apiKeySet, true);
    assert.ok(!JSON.stringify(put.json).includes('supersecretvalue'));
    assert.equal(put.json.model, 'claude-sonnet-5-5');
    assert.equal(put.json.effort.director, 'high');
    const stored = JSON.parse(fs.readFileSync(path.join(s.dataDir, '.localhub', 'config.json'), 'utf8'));
    assert.equal(stored.apiKey, 'sk-ant-api03-supersecretvalue');
  } finally {
    await s.close();
  }
});

test('MCP over HTTP and the plain tools API', async () => {
  const s = await start();
  try {
    const res = await s.request('POST', '/mcp', { body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_project', arguments: { name: 'From MCP', template: 'modpack' } } } });
    assert.match(res.json.result.content[0].text, /Created from-mcp/);
    assert.equal((await s.request('GET', '/mcp')).status, 405);
    const tool = await s.request('POST', '/api/tools/validate_project', { body: { input: { project: 'from-mcp' } } });
    assert.equal(tool.json.ok, true);
    assert.match(tool.json.text, /^PASS/);
    const lib = await s.request('POST', '/api/library/export', { body: {} });
    assert.equal(lib.json.count, 1);
    assert.ok(fs.existsSync(path.join(s.dataDir, 'dist', 'library', 'index.html')));
  } finally {
    await s.close();
  }
});
