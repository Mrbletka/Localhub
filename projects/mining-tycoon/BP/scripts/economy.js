// Numbers of a player's active session (money, rebirths and upgrade levels) and the formulas that use them.
import { CONFIG } from './config.js';
import { getNumber, setNumber } from './lib/util.js';
import { activeSession, sessionKey } from './sessions.js';

/** A number of the active session (money, rebirths, pick, lantern, backpack, cart); 0 when not in a session. */
export function stat(player, name) {
  const slot = activeSession(player);
  return slot === undefined ? 0 : getNumber(player, sessionKey(slot, name));
}

export function setStat(player, name, value) {
  const slot = activeSession(player);
  if (slot !== undefined) setNumber(player, sessionKey(slot, name), value);
  return value;
}

export const addStat = (player, name, delta) => setStat(player, name, stat(player, name) + delta);

/** Upgrade levels start at 1 (sessions from before an upgrade existed too). */
export const pickTier = (player) => Math.max(1, stat(player, 'pick'));
export const lanternLevel = (player) => Math.min(CONFIG.workshop.lantern.length, Math.max(1, stat(player, 'lantern')));
export const backpackLevel = (player) => Math.min(CONFIG.workshop.backpack.length, Math.max(1, stat(player, 'backpack')));
export const cartLevel = (player) => Math.min(CONFIG.expedition.levels.length, Math.max(1, stat(player, 'cart')));
export const lightSeconds = (player) => CONFIG.workshop.lantern[lanternLevel(player) - 1].seconds;
export const backpackSize = (player) => CONFIG.workshop.backpack[backpackLevel(player) - 1].size;

/** Sell bonus from rebirths: what the Ore Trader pays is multiplied by this. */
export const valueMultiplier = (player) => 1 + stat(player, 'rebirths') * CONFIG.rebirth.bonusPerRebirth;
export const rebirthCost = (rebirths) => Math.floor(CONFIG.rebirth.baseCost * CONFIG.rebirth.costGrowth ** rebirths);
