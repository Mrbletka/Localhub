// Money and upgrade levels of a player's active session, and the formulas that use them.
import { CONFIG } from './config.js';
import { getNumber, setNumber } from './lib/util.js';
import { activeSession, sessionKey } from './sessions.js';

/** A number of the active session (money, income_level, rebirths, pick, mine_level); 0 when not in a session. */
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

/** Pick tier (1 = Wooden Pick) and mine level (1 = Shallow Mine). Sessions from before hand mining start at 1. */
export const pickTier = (player) => Math.max(1, stat(player, 'pick'));
export const mineLevel = (player) => Math.max(1, stat(player, 'mine_level'));

/** Cash multiplier for ores and drills: ore value level x rebirth bonus. */
export const valueMultiplier = (player) =>
  (1 + stat(player, 'income_level') * CONFIG.upgrade.incomeBonusPerLevel) * (1 + stat(player, 'rebirths') * CONFIG.rebirth.bonusPerRebirth);

export const valueCost = (level) => Math.floor(CONFIG.upgrade.baseCost * CONFIG.upgrade.costGrowth ** level);
export const rebirthCost = (rebirths) => Math.floor(CONFIG.rebirth.baseCost * CONFIG.rebirth.costGrowth ** rebirths);
