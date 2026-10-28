import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createActivity, shouldStop } from '../server/lifecycle.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const idleMs = 45_000;

test('shouldStop: waits for windows, agents, startup and MCP clients', () => {
  const a = createActivity(0);
  assert.equal(shouldStop(a, { now: 60_000, idleMs }), false, 'browser still starting');
  assert.equal(shouldStop(a, { now: 130_000, idleMs }), true, 'nobody ever opened the IDE');

  Object.assign(a, { everConnected: true, clients: 1, lastSeen: 0, lastRequest: 0 });
  assert.equal(shouldStop(a, { now: 500_000, idleMs }), false, 'a window is open');
  a.clients = 0;
  a.lastSeen = 500_000;
  assert.equal(shouldStop(a, { now: 520_000, idleMs }), false, 'grace period after closing');
  assert.equal(shouldStop(a, { now: 546_000, idleMs }), true, 'closed long enough');
  assert.equal(shouldStop(a, { now: 546_000, idleMs, activeRuns: 1 }), false, 'an agent is still working');
  a.lastMcp = 540_000;
  assert.equal(shouldStop(a, { now: 600_000, idleMs }), false, 'Claude Code used MCP recently');
  assert.equal(shouldStop(a, { now: 540_000 + 10 * 60_000, idleMs }), true);
});

test('app mode: opens the IDE and exits after its last window closes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localhub-app-'));
  // Stand-ins for the Termux commands, recording what was opened.
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const opened = path.join(dir, 'opened.txt');
  fs.writeFileSync(path.join(bin, 'termux-open-url'), `#!/bin/sh\necho "$1" >> "${opened}"\n`, { mode: 0o755 });
  const port = 3900 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['server/index.js', '--app', '--exit-when-idle', '1', '--port', String(port), '--data', dir], {
    cwd: root,
    env: { ...process.env, TERMUX_VERSION: '0.118', PATH: `${bin}:${process.env.PATH}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  const exited = new Promise((resolve) => child.on('exit', resolve));
  try {
    for (let i = 0; i < 40 && !output.includes('App mode'); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(output, /App mode/);

    // An open IDE window (its event stream) keeps the server alive.
    const req = http.get({ host: '127.0.0.1', port, path: '/api/events' });
    await new Promise((resolve) => req.on('response', resolve));
    await new Promise((r) => setTimeout(r, 1800));
    assert.equal(child.exitCode, null, 'server stopped while a window was open');

    // A second tap while it runs just opens the IDE again.
    execFileSync(process.execPath, ['server/index.js', '--app', '--port', String(port), '--data', dir], {
      cwd: root,
      env: { ...process.env, TERMUX_VERSION: '0.118', PATH: `${bin}:${process.env.PATH}` },
    });

    req.destroy();
    const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('timeout'), 5000))]);
    assert.equal(code, 0);
    assert.match(output, /stopping/);
    for (let i = 0; i < 20 && fs.readFileSync(opened, 'utf8').split('\n').filter(Boolean).length < 2; i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(fs.readFileSync(opened, 'utf8').trim().split('\n'), [`http://localhost:${port}/`, `http://localhost:${port}/`]);
  } finally {
    child.kill();
  }
});

test('widget installer writes an executable launcher and icon', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'localhub-home-'));
  const out = execFileSync('bash', [path.join(root, 'scripts', 'install-termux-widget.sh')], {
    env: { ...process.env, HOME: home, TERMUX_VERSION: '0.118', PREFIX: '/data/data/com.termux/files/usr' },
    encoding: 'utf8',
  });
  assert.match(out, /Installed the "Bedrock Studio" shortcut/);
  const launcher = path.join(home, '.shortcuts', 'tasks', 'Bedrock Studio');
  const text = fs.readFileSync(launcher, 'utf8');
  assert.match(text, /^#!\/data\/data\/com\.termux\/files\/usr\/bin\/bash/);
  assert.ok(text.includes(`cd "${root}"`));
  assert.match(text, /node server\/index\.js --app >> "\$LOG"/);
  assert.equal(fs.statSync(launcher).mode & 0o777, 0o700);
  const icon = fs.readFileSync(path.join(home, '.shortcuts', 'icons', 'Bedrock Studio.png'));
  assert.equal(icon.readUInt32BE(0), 0x89504e47);
  execFileSync('bash', ['-n', launcher]);
  // Same launcher as an app shortcut, still under a tasks/ folder so it runs in the background.
  const dynamic = path.join(home, '.termux', 'widget', 'dynamic_shortcuts', 'tasks', 'Bedrock Studio');
  assert.equal(fs.readFileSync(dynamic, 'utf8'), text);
  assert.equal(fs.statSync(dynamic).mode & 0o777, 0o700);
});
