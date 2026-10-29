import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main as cli } from '../server/cli.js';
import { projectsDir } from '../server/paths.js';
import { GitSync } from '../server/git.js';
import { Workspace } from '../server/workspace.js';
import { createProject } from '../server/bedrock/scaffold.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

async function run(dataDir, ...argv) {
  const lines = [];
  const code = await cli(argv, { dataDir, log: (s) => lines.push(String(s)) });
  return { code, out: lines.join('\n') };
}

test('CLAUDE.md and the Claude Code sub-agents are generated from the roster', () => {
  execFileSync(process.execPath, ['scripts/gen-claude.mjs', '--check'], { cwd: root });
  const claude = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /Studio Director/);
  for (const k of ['scripter', 'content', 'artist', 'economy', 'qa']) {
    const agent = fs.readFileSync(path.join(root, '.claude', 'agents', `bedrock-${k}.md`), 'utf8');
    assert.match(agent, new RegExp(`^---\\nname: bedrock-${k}\\ndescription: `));
    assert.ok(claude.includes(`bedrock-${k}`));
  }
});

test('CLI: create, paint, preview, validate, build and run tools', async () => {
  const data = tmp('localhub-cli-');
  assert.equal((await run(data, 'new', 'Lava Land', '--template', 'tycoon')).code, 0);
  assert.match((await run(data, 'list')).out, /lava-land: Lava Land \[tycoon\]/);
  const spec = JSON.stringify({ path: 'projects/lava-land/RP/textures/lava_land/lava.png', width: 2, height: 2, palette: { o: '#ff6600' }, pixels: ['oo', 'oo'] });
  assert.equal((await run(data, 'paint', spec)).code, 0);
  assert.ok(fs.existsSync(path.join(data, 'projects', 'lava-land', 'RP', 'textures', 'lava_land', 'lava.png')));
  const preview = await run(data, 'preview', 'projects/lava-land/RP/textures/lava_land/lava.png');
  assert.ok(fs.existsSync(preview.out.trim()));
  const ok = await run(data, 'validate', 'projects/lava-land');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /^PASS/);
  const build = await run(data, 'build', 'lava-land', '--bump', 'minor');
  assert.equal(build.code, 0, build.out);
  assert.match(build.out, /dist\/lava-land\/lava-land-v1\.1\.0\.mcaddon/);
  assert.match((await run(data, 'tool', 'search_files', JSON.stringify({ query: 'generator_t1', path: 'projects/lava-land/BP/scripts' }))).out, /config\.js/);
  assert.match((await run(data, 'reference', 'manifest')).out, /format_version/);
  assert.equal((await run(data, 'uuid', '2')).out.split('\n').length, 2);
  fs.writeFileSync(path.join(data, 'projects', 'lava-land', 'BP', 'scripts', 'main.js'), 'broken(');
  assert.equal((await run(data, 'validate', 'lava-land')).code, 1);
  assert.equal((await run(data, 'nope')).code, 1);
});

test('an older workspace/ folder moves to projects/', () => {
  const data = tmp('localhub-migrate-');
  fs.mkdirSync(path.join(data, 'workspace', 'old-project'), { recursive: true });
  assert.equal(projectsDir(data), path.join(data, 'projects'));
  assert.ok(fs.existsSync(path.join(data, 'projects', 'old-project')));
  assert.ok(!fs.existsSync(path.join(data, 'workspace')));
});

test('GitHub sync: get Claude branches, pull main, push phone edits', async () => {
  const dir = tmp('localhub-git-');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '--bare', origin);
  // The phone's clone, with an existing project.
  const phone = path.join(dir, 'phone');
  git(dir, 'clone', origin, phone);
  git(phone, 'checkout', '-b', 'main');
  fs.writeFileSync(path.join(phone, 'README.md'), 'studio\n');
  const phoneWs = new Workspace(path.join(phone, 'projects'));
  await createProject(phoneWs, { name: 'Phone Pack', template: 'blank' });
  git(phone, 'add', '-A');
  git(phone, 'commit', '-m', 'init');
  git(phone, 'push', '-u', 'origin', 'main');

  // Claude Code in the cloud: works on a claude/ branch and pushes it.
  const cloud = path.join(dir, 'cloud');
  git(dir, 'clone', origin, cloud);
  git(cloud, 'checkout', '-b', 'claude/volcano-tycoon');
  await createProject(new Workspace(path.join(cloud, 'projects')), { name: 'Volcano Tycoon', template: 'tycoon' });
  git(cloud, 'add', '-A');
  git(cloud, 'commit', '-m', 'Add Volcano Tycoon');
  git(cloud, 'push', 'origin', 'claude/volcano-tycoon');

  const sync = new GitSync(path.join(phone, 'projects'));
  let st = await sync.status({ fetch: true });
  assert.equal(st.isRepo, true);
  assert.equal(st.fetchError, null);
  assert.equal(st.claude.length, 1);
  assert.equal(st.claude[0].branch, 'claude/volcano-tycoon');
  assert.equal(st.claude[0].subject, 'Add Volcano Tycoon');
  assert.ok(st.claude[0].projectFiles > 10);
  await assert.rejects(sync.merge('claude/../../etc'), /Invalid branch/);
  await assert.rejects(sync.merge('claude/missing'), /not on GitHub/);
  await sync.merge('claude/volcano-tycoon');
  assert.ok(fs.existsSync(path.join(phone, 'projects', 'volcano-tycoon', 'DESIGN.md')));
  st = await sync.status();
  assert.equal(st.claude.length, 0, 'merged branch is no longer offered');
  assert.equal(st.ahead, 1);

  // Cloud sessions push to ccr-<id> branches; those are offered too.
  git(cloud, 'checkout', '-b', 'ccr-6a62d74d-abc123');
  fs.writeFileSync(path.join(cloud, 'projects', 'volcano-tycoon', 'DESIGN.md'), '# Volcano Tycoon\n\nStep 2\n');
  git(cloud, 'commit', '-am', 'Volcano step 2');
  git(cloud, 'push', 'origin', 'ccr-6a62d74d-abc123');
  st = await sync.status({ fetch: true });
  assert.equal(st.claude.length, 1);
  assert.equal(st.claude[0].branch, 'ccr-6a62d74d-abc123');
  assert.equal(st.claude[0].projectFiles, 1);
  await sync.merge('ccr-6a62d74d-abc123');
  assert.match(fs.readFileSync(path.join(phone, 'projects', 'volcano-tycoon', 'DESIGN.md'), 'utf8'), /Step 2/);
  st = await sync.status();
  assert.equal(st.claude.length, 0);

  // Claude pushes straight to main later; the phone pulls it.
  git(cloud, 'checkout', 'main');
  git(cloud, 'pull', 'origin', 'main');
  fs.writeFileSync(path.join(cloud, 'projects', 'phone-pack', 'DESIGN.md'), '# Phone Pack\n\nUpdated by Claude\n');
  git(cloud, 'commit', '-am', 'Update design');
  git(cloud, 'push', 'origin', 'main');
  st = await sync.status({ fetch: true });
  assert.equal(st.behind, 1);
  await sync.pull(); // phone is ahead (merge) and behind: pull merges
  assert.match(fs.readFileSync(path.join(phone, 'projects', 'phone-pack', 'DESIGN.md'), 'utf8'), /Updated by Claude/);

  // An edit on the phone gets committed and pushed.
  fs.writeFileSync(path.join(phone, 'projects', 'volcano-tycoon', 'notes.txt'), 'idea\n');
  const pushed = await sync.push();
  assert.equal(pushed.committed, 1);
  git(cloud, 'pull', 'origin', 'main');
  assert.ok(fs.existsSync(path.join(cloud, 'projects', 'volcano-tycoon', 'notes.txt')));
  st = await sync.status({ fetch: true });
  assert.deepEqual([st.ahead, st.behind, st.localChanges], [0, 0, 0]);

  // Outside a git repo the studio says so instead of failing.
  assert.equal((await new GitSync(tmp('localhub-nogit-')).status()).isRepo, false);
});

test('getLatest merges only the Claude branches that touch the project', async () => {
  const dir = tmp('localhub-latest-');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const origin = path.join(dir, 'origin.git');
  git(dir, 'init', '--bare', origin);
  const phone = path.join(dir, 'phone');
  git(dir, 'clone', origin, phone);
  git(phone, 'checkout', '-b', 'main');
  await createProject(new Workspace(path.join(phone, 'projects')), { name: 'Tycoon A', template: 'tycoon' });
  await createProject(new Workspace(path.join(phone, 'projects')), { name: 'Other B', template: 'blank' });
  git(phone, 'add', '-A');
  git(phone, 'commit', '-m', 'init');
  git(phone, 'push', '-u', 'origin', 'main');
  const cloud = path.join(dir, 'cloud');
  git(dir, 'clone', origin, cloud);
  for (const [branch, slug, text] of [['claude/a1', 'tycoon-a', 'first'], ['claude/b1', 'other-b', 'MARKER-B'], ['ccr-a2', 'tycoon-a', 'second']]) {
    git(cloud, 'checkout', '-q', '-B', branch, branch === 'ccr-a2' ? 'claude/a1' : 'origin/main');
    fs.appendFileSync(path.join(cloud, 'projects', slug, 'DESIGN.md'), `\n${text}\n`);
    git(cloud, 'commit', '-qam', `${slug}: ${text}`);
    git(cloud, 'push', '-q', 'origin', branch);
  }
  const res = await new GitSync(path.join(phone, 'projects')).getLatest('tycoon-a');
  assert.equal(res.error, null);
  // ccr-a2 builds on claude/a1, so it may arrive alone; either way both changes must be in.
  assert.ok(res.merged.includes('ccr-a2') && !res.merged.includes('claude/b1'), res.merged.join());
  const design = fs.readFileSync(path.join(phone, 'projects', 'tycoon-a', 'DESIGN.md'), 'utf8');
  assert.match(design, /first\n\nsecond/);
  assert.doesNotMatch(fs.readFileSync(path.join(phone, 'projects', 'other-b', 'DESIGN.md'), 'utf8'), /MARKER-B/);
  assert.deepEqual((await new GitSync(path.join(phone, 'projects')).getLatest('tycoon-a')).merged, [], 'nothing new the second time');
  // A cloud session that only touched studio code is not offered as add-on work.
  git(cloud, 'checkout', '-q', '-B', 'ccr-tools', 'origin/main');
  fs.writeFileSync(path.join(cloud, 'tool.mjs'), 'export {};\n');
  git(cloud, 'add', '-A');
  git(cloud, 'commit', '-qm', 'unrelated tool');
  git(cloud, 'push', '-q', 'origin', 'ccr-tools');
  const st = await new GitSync(path.join(phone, 'projects')).status({ fetch: true });
  assert.deepEqual(st.claude.map((c) => c.branch), ['claude/b1']);
});
