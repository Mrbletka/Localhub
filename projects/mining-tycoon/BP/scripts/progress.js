// Records of a session (what you have done: for the tutorial, the records page and later goals) and rebirth perks.
// Records survive rebirth; perks are bought with stars (one per rebirth) and last for the whole session.
import { CONFIG } from './config.js';
import { formatNumber, getJson, setJson } from './lib/util.js';
import { activeSession, sessionKey } from './sessions.js';
import { stat, perks } from './economy.js';
import { fullScreenMenu, icon } from './menu.js';
import { toast } from './hud.js';

const listeners = [];
/** Called with (player, key, total, records) whenever a record changes. */
export const onRecord = (fn) => listeners.push(fn);

/** The records of a session: { key: number } (mined_<resource>, mined, sold, earned, made_<product>, expeditions...). */
export function records(player, slot = activeSession(player)) {
  return slot === undefined ? {} : getJson(player, sessionKey(slot, 'records'), {});
}

/** Count something the player did in the active session (mode 'max' keeps the highest value instead). */
export function record(player, key, amount = 1, mode = 'add') {
  const slot = activeSession(player);
  if (slot === undefined) return;
  const all = records(player, slot);
  all[key] = mode === 'max' ? Math.max(all[key] ?? 0, amount) : (all[key] ?? 0) + amount;
  setJson(player, sessionKey(slot, 'records'), all);
  for (const fn of listeners) fn(player, key, all[key], all);
}

// ---- perks --------------------------------------------------------------------------------------------------------

const spent = (owned) => CONFIG.perks.reduce((sum, p) => sum + p.costs.slice(0, owned[p.id] ?? 0).reduce((a, b) => a + b, 0), 0);
/** Stars not spent yet: one per rebirth. */
export const freeStars = (player) => stat(player, 'rebirths') - spent(perks(player));

function buyPerk(player, perk) {
  const slot = activeSession(player);
  if (slot === undefined) return;
  const owned = perks(player);
  const level = owned[perk.id] ?? 0;
  const cost = perk.costs[level];
  if (cost === undefined) return;
  if (freeStars(player) < cost) return toast(player, `§c${perk.name} needs ${cost} star${cost > 1 ? 's' : ''}`, 'You get one with every rebirth.');
  owned[perk.id] = level + 1;
  setJson(player, sessionKey(slot, 'perks'), owned);
  player.playSound('random.levelup');
  toast(player, `${perk.name} ${level + 1}`, perk.about);
}

const LEVEL_NAMES = CONFIG.expedition.levels.map((l) => l.name);

/** Perks & records: what you have done in this session, and stars to spend. */
export function showPerks(player) {
  const r = records(player);
  const owned = perks(player);
  const stars = freeStars(player);
  const body =
    `§6Rebirth stars: ${stars} free§r - one for every rebirth\n` +
    `§7Earned $${formatNumber(r.earned ?? 0)} - ${r.mined ?? 0} ores - ${r.expeditions ?? 0} expeditions (${r.extracts ?? 0} home safe)` +
    `${r.deepest ? ` - deepest: ${LEVEL_NAMES[r.deepest - 1]}` : ''}${r.best_haul ? ` - best haul ${r.best_haul}` : ''}`;
  const buttons = CONFIG.perks.map((perk) => {
    const level = owned[perk.id] ?? 0;
    const cost = perk.costs[level];
    return {
      list: 'notice',
      text: `${perk.name} ${level}/${perk.costs.length} - ${cost === undefined ? 'maxed' : `${cost} star${cost > 1 ? 's' : ''}`}\n§7${perk.about}`,
      icon: icon(perk.id === 'light' ? 'expedition' : perk.id === 'pack' ? 'backpack' : 'upgrades'),
      run: (p) => buyPerk(p, perk),
    };
  });
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  fullScreenMenu(player, { form: 'notice', body, buttons });
}
