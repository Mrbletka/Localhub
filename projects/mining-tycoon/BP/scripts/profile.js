// The player profile: XP for every ore mined (home vein and caves), levels and ranks, shown by the MINE-OS profile
// panel at the top right (hud.js showProfile). It belongs to the player, not a session, and survives rebirth.
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, getNumber, setNumber } from './lib/util.js';
import { eachPlayer, guard } from './lib/safe.js';
import { activeSession } from './sessions.js';
import { onRecord } from './progress.js';
import { showProfile, toast } from './hud.js';

const P = CONFIG.profile;
const XP_KEY = `${CONFIG.namespace}:xp`;
const ORE_XP = new Map(CONFIG.ores.map((o) => [o.id, o.pick])); // resource id -> XP per ore

/** XP from level to level + 1. */
export const xpToNext = (level) => P.xp.base + P.xp.step * (level - 1);

/** Level from total XP: { level, into (XP into this level), need (XP for the next level, 0 at the top) }. */
export function levelOf(xp) {
  let level = 1;
  let into = Math.max(0, Math.floor(xp));
  while (level < P.maxLevel && into >= xpToNext(level)) {
    into -= xpToNext(level);
    level++;
  }
  return level >= P.maxLevel ? { level, into: 0, need: 0 } : { level, into, need: xpToNext(level) };
}

/** Rank index (0-based) for a level. */
export const rankIndex = (level) => P.ranks.reduce((best, r, i) => (level >= r.level ? i : best), 0);

export const xpOf = (player) => getNumber(player, XP_KEY);

/** Profile line for menus: "Prospector - Level 12 (45/155 XP)". */
export function profileText(player) {
  const { level, into, need } = levelOf(xpOf(player));
  return `${P.ranks[rankIndex(level)].name} - Level ${level}${need ? ` (${into}/${need} XP)` : ' (max)'}`;
}

function update(player) {
  const { level, into, need } = levelOf(xpOf(player));
  const rank = rankIndex(level);
  const xp = need ? `§7${formatNumber(into)}/${formatNumber(need)} XP` : '§6MAX';
  showProfile(player, `§f${player.name}\n§b${P.ranks[rank].name} §eLv ${level} ${xp}`, need ? Math.floor((into / need) * 10) : 10, rank + 1);
}

export function addXp(player, amount) {
  const before = levelOf(xpOf(player)).level;
  const after = levelOf(setNumber(player, XP_KEY, xpOf(player) + amount)).level;
  if (after > before) {
    const rank = P.ranks[rankIndex(after)];
    const newRank = rankIndex(after) > rankIndex(before);
    player.playSound(newRank ? 'random.totem' : 'random.levelup');
    toast(player, `Level ${after}!`, newRank ? `New rank: ${rank.name}` : `${formatNumber(xpToNext(after))} XP to level ${after + 1}`, 3);
    try {
      player.spawnParticle('mining_tycoon:burst', { x: player.location.x, y: player.location.y + 1.2, z: player.location.z });
    } catch {
      // not loaded there
    }
  }
  update(player);
}

// Every ore mined gives XP: its pick tier (the mined_<resource> records are written at home and in caves).
onRecord(guard('profile xp', (player, key) => {
  if (!key.startsWith('mined_')) return;
  const xp = ORE_XP.get(key.slice(6));
  if (xp) addXp(player, xp);
}));

// Shown with the HUD while playing a session (hud.js sends it with the HUD title).
world.afterEvents.worldLoad.subscribe(() => {
  system.runInterval(() => {
    eachPlayer('profile', (player) => {
      if (activeSession(player) !== undefined) update(player);
    });
  }, 20);
});
