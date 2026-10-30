// Error isolation: one failing player, event or job must never stop the rest of the game. Errors are logged (content
// log) with a label so they can be found, and the loop carries on with the next player.
import { world } from '@minecraft/server';

const seen = new Map(); // label -> times logged (so a broken loop doesn't flood the log)

export function report(label, error) {
  const n = (seen.get(label) ?? 0) + 1;
  seen.set(label, n);
  if (n <= 3 || n % 100 === 0) console.warn(`[mining_tycoon] ${label}: ${error?.stack ?? error}`);
}

/** Wrap an event or interval callback: errors are logged instead of breaking it. */
export const guard = (label, fn) => (...args) => {
  try {
    return fn(...args);
  } catch (error) {
    report(label, error);
  }
};

/** Run fn for every player; one player's error does not skip the others. */
export function eachPlayer(label, fn) {
  for (const player of world.getAllPlayers()) {
    try {
      if (player.isValid) fn(player);
    } catch (error) {
      report(label, error);
    }
  }
}
