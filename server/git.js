// GitHub sync for the phone: bring in what Claude Code pushed (main or its claude/* and ccr-* branches)
// and push edits made on the phone. Every git call runs non-interactively with fixed arguments.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { WorkspaceError } from './workspace.js';

const BRANCH_RE = /^[\w][\w./-]{0,200}$/;
// Claude Code pushes to claude/<name> (local and older cloud sessions) or ccr-<id> (cloud sessions).
const CLAUDE_REFS = ['refs/remotes/origin/claude/', 'refs/remotes/origin/ccr-*'];

function git(cwd, args, { timeout = 60_000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, out: String(stdout).trim(), err: String(stderr).trim() || err?.message || '' });
    });
  });
}

/** Turn git's stderr into advice a phone user can act on. */
function explain(res, what) {
  const e = res.err;
  if (/could not read Username|Authentication failed|terminal prompts disabled|403|denied/i.test(e)) {
    return `${what} needs your GitHub login. In Termux run once: git config --global credential.helper store, then git pull (enter your GitHub username and a personal access token as the password).`;
  }
  if (/Could not resolve host|unable to access|Network is unreachable|timed out/i.test(e)) return `${what} failed: no connection to GitHub.`;
  if (/ENOENT|not found/i.test(e) && /spawn git/i.test(e)) return 'git is not installed. In Termux run: pkg install git';
  return `${what} failed: ${e.split('\n').slice(-3).join(' ')}`;
}

export class GitSync {
  constructor(projectsRoot, { author = () => '' } = {}) {
    this.projectsRoot = projectsRoot;
    this.author = author;
    this.root = null;
  }

  async repoRoot() {
    if (this.root) return this.root;
    const res = await git(this.projectsRoot, ['rev-parse', '--show-toplevel']);
    if (!res.ok) return null;
    this.root = res.out;
    return this.root;
  }

  async #need() {
    const root = await this.repoRoot();
    if (!root) throw new WorkspaceError('This studio is not inside a git repository (clone it with git to sync with GitHub).');
    return root;
  }

  /** Projects folder relative to the repo root, for pathspecs. */
  async #projectsSpec() {
    const root = await this.#need();
    return path.relative(root, this.projectsRoot).split(path.sep).join('/') || '.';
  }

  async #identity(root) {
    const name = await git(root, ['config', 'user.name']);
    const email = await git(root, ['config', 'user.email']);
    const args = [];
    if (!name.out) args.push('-c', `user.name=${this.author() || 'Bedrock Studio'}`);
    if (!email.out) args.push('-c', 'user.email=studio@localhost');
    return args;
  }

  async status({ fetch = false } = {}) {
    const root = await this.repoRoot();
    if (!root) return { isRepo: false };
    let fetchError = null;
    if (fetch) {
      const res = await git(root, ['fetch', '--prune', 'origin']);
      if (!res.ok) fetchError = explain(res, 'Checking GitHub');
    }
    const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out;
    const spec = await this.#projectsSpec();
    const changes = (await git(root, ['status', '--porcelain', '--', spec])).out.split('\n').filter(Boolean);
    const counts = await git(root, ['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`]);
    const [ahead, behind] = counts.ok ? counts.out.split(/\s+/).map(Number) : [0, 0];
    const refs = (await git(root, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(committerdate:iso8601)%09%(subject)', ...CLAUDE_REFS])).out
      .split('\n').filter(Boolean).slice(0, 20);
    const claude = [];
    for (const line of refs) {
      const [ref, date, subject] = line.split('\t');
      const n = await git(root, ['rev-list', '--count', `HEAD..${ref}`]);
      if (!n.ok || Number(n.out) === 0) continue;
      const files = (await git(root, ['diff', '--name-only', `HEAD...${ref}`, '--', spec])).out.split('\n').filter(Boolean);
      // Only work on add-ons: other sessions on this repo (studio code, unrelated experiments) are not offered.
      if (!files.length) continue;
      claude.push({ branch: ref.replace(/^origin\//, ''), date, subject, commits: Number(n.out), projectFiles: files.length });
      if (claude.length >= 8) break;
    }
    return { isRepo: true, branch, ahead, behind, localChanges: changes.length, claude, fetchError };
  }

  /** Bring in new commits from the same branch on GitHub. */
  async pull() {
    const root = await this.#need();
    const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out;
    let res = await git(root, ['pull', '--ff-only', 'origin', branch]);
    if (!res.ok && /not possible to fast-forward|diverg/i.test(res.err)) {
      res = await git(root, [...(await this.#identity(root)), 'pull', '--no-rebase', '--no-edit', '--autostash', 'origin', branch]);
      if (!res.ok) await git(root, ['merge', '--abort']);
    }
    if (!res.ok) throw new WorkspaceError(explain(res, 'Pulling'));
    return { ok: true, output: res.out };
  }

  /** Merge one of Claude Code's branches (claude/... or ccr-...) into the current branch. */
  async merge(branch) {
    if (typeof branch !== 'string' || !BRANCH_RE.test(branch) || branch.includes('..')) throw new WorkspaceError('Invalid branch name');
    const root = await this.#need();
    const known = await git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
    if (!known.ok) throw new WorkspaceError(`Branch ${branch} is not on GitHub (check for updates first)`);
    const res = await git(root, [...(await this.#identity(root)), 'merge', '--no-edit', '--autostash', `origin/${branch}`]);
    if (!res.ok) {
      await git(root, ['merge', '--abort']);
      throw new WorkspaceError(/conflict/i.test(res.out + res.err)
        ? `Claude's changes in ${branch} conflict with changes on this phone. Push your changes first, then ask Claude to update its branch.`
        : explain(res, 'Merging'));
    }
    return { ok: true, output: res.out };
  }

  /**
   * Everything new for one project: pull the current branch, then merge Claude's branches that
   * touch projects/<slug>, oldest first. Offline or not a git clone: returns what it could do.
   */
  async getLatest(slug) {
    const root = await this.repoRoot();
    if (!root) return { pulled: false, merged: [], error: null };
    const fetched = await git(root, ['fetch', '--prune', 'origin']);
    if (!fetched.ok) return { pulled: false, merged: [], error: explain(fetched, 'Checking GitHub') };
    const result = { pulled: false, merged: [], error: null };
    const st = await this.status();
    if (st.behind) {
      await this.pull();
      result.pulled = true;
    }
    const spec = `${await this.#projectsSpec()}/${slug}`;
    const refs = (await git(root, ['for-each-ref', '--sort=committerdate', '--format=%(refname:short)', ...CLAUDE_REFS])).out.split('\n').filter(Boolean);
    for (const ref of refs) {
      const fresh = await git(root, ['rev-list', '--count', `HEAD..${ref}`]);
      if (!fresh.ok || Number(fresh.out) === 0) continue;
      const touches = (await git(root, ['diff', '--name-only', `HEAD...${ref}`, '--', spec])).out;
      if (!touches) continue;
      const branch = ref.replace(/^origin\//, '');
      try {
        await this.merge(branch);
        result.merged.push(branch);
      } catch (err) {
        result.error = err.message;
        break;
      }
    }
    return result;
  }

  /** Commit project changes made on the phone and push the current branch. */
  async push() {
    const root = await this.#need();
    const spec = await this.#projectsSpec();
    const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).out;
    const changes = (await git(root, ['status', '--porcelain', '--', spec])).out.split('\n').filter(Boolean);
    if (changes.length) {
      await git(root, ['add', '-A', '--', spec]);
      const commit = await git(root, [...(await this.#identity(root)), 'commit', '-m', `Studio: update projects from the phone (${changes.length} files)`]);
      if (!commit.ok) throw new WorkspaceError(explain(commit, 'Saving your changes'));
    }
    const res = await git(root, ['push', 'origin', `HEAD:${branch}`]);
    if (!res.ok) throw new WorkspaceError(/rejected|fetch first|non-fast-forward/i.test(res.err) ? 'GitHub has newer changes - tap "Pull" first, then push again.' : explain(res, 'Pushing'));
    return { ok: true, committed: changes.length };
  }
}
