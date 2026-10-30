// Hand mining at home: every mine has an ore field - the vein in its north wall. Breaking an ore gives its resource
// item (sell it at the Ore Trader or refine it in the machines) and the ore grows back a few seconds later. The vein
// only grows ores the session's pick can mine (CONFIG.vein); a better pick re-rolls it. Picks follow the session.
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { getNumber, giveItem, hasRoom } from './lib/util.js';
import { eachPlayer } from './lib/safe.js';
import { activeSession, plotAt, plotCenter, onSessionEnter, sessionKey } from './sessions.js';
import { pickTier } from './economy.js';
import { record } from './progress.js';
import { notify, pickup } from './hud.js';

const V = CONFIG.mine.vein;
const ORES = new Map(CONFIG.ores.map((o) => [o.block, o]));
const ORE_BY_ID = new Map(CONFIG.ores.map((o) => [o.id, o]));
const PICK_TIER = new Map(CONFIG.picks.map((p, i) => [p.item, i + 1]));
const RESOURCES = new Map(CONFIG.resources.map((r) => [r.id, r]));


function* fieldCells(c) {
  for (let y = V.y[0]; y <= V.y[1]; y++)
    for (let x = V.x[0]; x <= V.x[1]; x++) for (let z = V.z[0]; z <= V.z[1]; z++) yield { x: c.x + x, y: c.y + y, z: c.z + z };
}

export function inField(c, { x, y, z }) {
  const [dx, dy, dz] = [x - c.x, y - c.y, z - c.z];
  return dx >= V.x[0] && dx <= V.x[1] && dy >= V.y[0] && dy <= V.y[1] && dz >= V.z[0] && dz <= V.z[1];
}

/** A random vein ore that a pick tier can mine, by the vein weights. */
function rollOre(tier) {
  const weights = Object.entries(CONFIG.vein).filter(([id]) => ORE_BY_ID.get(id).pick <= tier);
  let r = Math.random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of weights) if ((r -= w) < 0) return ORE_BY_ID.get(id).block;
  return ORE_BY_ID.get(weights[0][0]).block;
}

/** Someone's feet or head is in this block cell (an ore must not grow inside a player). */
const occupied = (players, { x, y, z }) =>
  players.some((p) => Math.floor(p.location.x) === x && Math.floor(p.location.z) === z && (Math.floor(p.location.y) === y || Math.floor(p.location.y) + 1 === y));

/**
 * Fill the ore field of the plot at c for a pick tier. Empty cells, Mine Rock and ores the pick can't mine get a new
 * ore; with reroll every ore is rolled again (after a pick upgrade). Returns false when the area is not loaded.
 */
export function fillField(c, tier, reroll = false) {
  const dimension = world.getDimension(CONFIG.plots.dimension);
  const players = dimension.getPlayers();
  try {
    for (const cell of fieldCells(c)) {
      const block = dimension.getBlock(cell);
      if (!block) return false;
      const ore = ORES.get(block.typeId);
      const stale = ore && (reroll || ore.id === 'rock' || ore.pick > tier);
      if ((block.isAir && !occupied(players, cell)) || stale) block.setType(rollOre(tier));
    }
  } catch {
    return false; // chunk not loaded
  }
  return true;
}

/** Re-roll the active session's ore field after a pick upgrade (or rebirth). */
export function rerollField(player) {
  const plot = plotAt(player.dimension.id, player.location);
  if (plot?.owner === player.id && plot.slot === activeSession(player)) fillField(plotCenter(plot.index), pickTier(player), true);
}

/** Give the player the pick of their active session, and take any other tycoon pick away. */
export function syncPick(player) {
  if (activeSession(player) === undefined) return;
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return;
  const want = CONFIG.picks[Math.min(pickTier(player), CONFIG.picks.length) - 1].item;
  let has = false;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (!item || !PICK_TIER.has(item.typeId)) continue;
    if (item.typeId === want && !has) has = true;
    else container.setItem(i);
  }
  if (!has) giveItem(player, want);
}

/** A small notification (the MINE-OS card; see hud.js). */
export const popup = (player, text) => notify(player, text, 1, 1.2);

/** Why the held item can't break an ore (needs a better pick), or undefined when it can. */
export function pickProblem(itemStack, ore) {
  if ((PICK_TIER.get(itemStack?.typeId) ?? 0) < ore.pick) return `§c${ore.name} needs a ${CONFIG.picks[ore.pick - 1].name} or better.`;
}

/** Grow an ore back in a field cell, rolled from the owner's mine level (if they are online and still own it). */
function scheduleRegrow(owner, index, location) {
  system.runTimeout(() => {
    const player = world.getAllPlayers().find((p) => p.id === owner);
    const plot = plotAt(CONFIG.plots.dimension, location);
    if (!player || plot?.owner !== owner || plot.index !== index) return; // offline: the field refills when they come back
    try {
      const dimension = world.getDimension(CONFIG.plots.dimension);
      const block = dimension.getBlock(location);
      if (!block?.isAir) return;
      if (occupied(dimension.getPlayers(), location)) return scheduleRegrow(owner, index, location);
      block.setType(rollOre(Math.max(1, getNumber(player, sessionKey(plot.slot, 'pick')))));
    } catch {
      // chunk unloaded - refilled on the next visit
    }
  }, CONFIG.mine.respawnSeconds * 20 + Math.floor(Math.random() * 20));
}

// Ores in a mine: only from the session they belong to, and only with a good enough pick.
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const ore = ORES.get(event.block.typeId);
  if (!ore) return;
  const player = event.player;
  let message;
  try {
    const plot = plotAt(event.dimension.id, event.block.location);
    if (!plot || plot.owner !== player.id) return; // not in a mine, or someone else's (sessions.js stops that)
    const res = RESOURCES.get(ore.id);
    if (plot.slot !== activeSession(player)) message = '§cThis mine belongs to your other session.';
    else message = pickProblem(event.itemStack, ore) ?? (res && !hasRoom(player, res.item) ? '§cYour inventory is full: sell or refine your goods first.' : undefined);
  } catch {
    message = '§7Try again in a moment.'; // never let an error turn into a free break
  }
  if (!message) return;
  event.cancel = true;
  system.run(() => popup(player, message));
});

world.afterEvents.playerBreakBlock.subscribe(({ player, block, dimension, brokenBlockPermutation }) => {
  const ore = ORES.get(brokenBlockPermutation.type.id);
  if (!ore) return;
  const plot = plotAt(dimension.id, block.location);
  if (!plot || plot.owner !== player.id) return;
  const res = RESOURCES.get(ore.id);
  if (res) {
    giveItem(player, res.item);
    pickup(player, res.name);
    player.playSound('random.pop', { volume: 0.5, pitch: 0.8 + Math.min(ore.pick, 6) * 0.12 });
    record(player, `mined_${res.id}`);
    record(player, 'mined');
  }
  if (inField(plotCenter(plot.index), block.location)) scheduleRegrow(player.id, plot.index, { ...block.location });
});

// Arriving in a session's mine: the right pick in hand and a full ore field (retried while the mine is loading).
onSessionEnter((player, slot, c) => {
  syncPick(player);
  let tries = 0;
  const attempt = () => {
    if (player.isValid && activeSession(player) === slot && !fillField(c, pickTier(player)) && ++tries < 20) system.runTimeout(attempt, 10);
  };
  attempt();
});

// After dying, the pick comes back.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) syncPick(player);
});

// Mining is the job, not eating: players in a session stay fed.
world.afterEvents.worldLoad.subscribe(() => {
  system.runInterval(() => {
    eachPlayer('saturation', (player) => {
      if (activeSession(player) !== undefined) player.addEffect('saturation', 20, { showParticles: false });
    });
  }, 200);
});
