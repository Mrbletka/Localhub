// App mode: open the IDE when the server starts and stop the server once every IDE
// window has been closed (used by the Termux widget and `npm run app`).
import { spawn } from 'node:child_process';

export function createActivity(now = Date.now()) {
  return { started: now, clients: 0, everConnected: false, lastSeen: now, lastRequest: now, lastMcp: 0 };
}

/**
 * Decide whether an idle server should exit.
 * - never while an IDE window is open or an agent is still working
 * - wait idleMs after the last window closed / last request
 * - give the browser startGraceMs to open the first window
 * - keep serving MCP clients (Claude Code etc.) for mcpHoldMs after their last call
 */
export function shouldStop(activity, { now = Date.now(), idleMs, activeRuns = 0, startGraceMs = 120_000, mcpHoldMs = 10 * 60_000 }) {
  if (activity.clients > 0 || activeRuns > 0) return false;
  if (!activity.everConnected && now - activity.started < Math.max(startGraceMs, idleMs)) return false;
  if (activity.lastMcp && now - activity.lastMcp < mcpHoldMs) return false;
  return now - Math.max(activity.lastSeen, activity.lastRequest) >= idleMs;
}

export const isTermux = () => Boolean(process.env.TERMUX_VERSION || (process.env.PREFIX || '').includes('com.termux'));

/** Open a URL with the platform's default handler (Chrome / the installed web app on Android). */
export function openInBrowser(url) {
  const [cmd, args] = isTermux()
    ? ['termux-open-url', [url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`  Open ${url} in your browser.`));
    child.unref();
  } catch {
    console.log(`  Open ${url} in your browser.`);
  }
}
