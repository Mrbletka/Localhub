// Where studio data lives. Projects sit in <data>/projects so they can be committed to git
// and shared between the phone and Claude Code sessions; builds and settings stay local.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const resolveDataDir = (explicit) => path.resolve(explicit || process.env.LOCALHUB_DATA || REPO_ROOT);

/** <data>/projects - moving an older <data>/workspace folder there the first time. */
export function projectsDir(dataDir) {
  const dir = path.join(dataDir, 'projects');
  const legacy = path.join(dataDir, 'workspace');
  if (!fs.existsSync(dir) && fs.existsSync(legacy)) fs.renameSync(legacy, dir);
  return dir;
}
