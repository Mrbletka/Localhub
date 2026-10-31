// Drills: helpers you craft at the Pickaxe Station and place on the drill pads (the light tiles on the west side of
// your mine). While you play that session - also on expeditions - they dig chunks into the session's drill bin; tap any
// drill to collect them. Only the owner can break a drill, from the session it belongs to.
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { getJson, setJson, giveItem } from './lib/util.js';
import { eachPlayer } from './lib/safe.js';
import { activeSession, sessionKey, inActivePlot, onSessionDelete, onMineRebuild } from './sessions.js';
import { padBlockId } from './mine_builder.js';
import { giveGoods, goodIcon, goodName } from './goods.js';
import { fullScreenMenu, icon } from './menu.js';
import { toast, notify } from './hud.js';

const D = CONFIG.drills;
const LEGACY_KEY = `${CONFIG.namespace}:generators`; // all drills in one world property (older versions)
const PLAYER_KEY = `${CONFIG.namespace}:drills`; // each player's drills: [[location key, slot, block], ...]
const TIERS = new Map(D.tiers.map((t) => [t.block, t]));

/**
 * Drills of the players who are online: "dimension|x|y|z" -> { owner: playerId, slot: session slot, block: typeId }.
 * Each player's drills are stored on that player (a world property would run out of room on a big server); drills of
 * offline players are protected by their mine (only the owner breaks blocks there).
 */
let drills = {};
/** Drills from the old world property whose owners have not been back yet. */
let legacy = {};

const locKey = (dimensionId, { x, y, z }) => `${dimensionId}|${x}|${y}|${z}`;
/** Write one player's drills (after any change to them). */
function save(owner) {
  const player = typeof owner === 'string' ? world.getAllPlayers().find((p) => p.id === owner) : owner;
  if (!player) return;
  setJson(player, PLAYER_KEY, Object.entries(drills).filter(([, d]) => d.owner === player.id).map(([k, d]) => [k, d.slot ?? 0, d.block]));
}

/** A player joins (or the scripts reload): their drills come into play, old world records move onto them. */
function loadDrills(player) {
  for (const [k, slot, block] of getJson(player, PLAYER_KEY, [])) drills[k] = { owner: player.id, slot, block };
  const moved = Object.entries(legacy).filter(([, d]) => d.owner === player.id);
  if (!moved.length) return;
  for (const [k, d] of moved) {
    drills[k] = { owner: d.owner, slot: d.slot ?? 0, block: d.block };
    delete legacy[k];
  }
  save(player);
  if (Object.keys(legacy).length) setJson(world, LEGACY_KEY, legacy);
  else world.setDynamicProperty(LEGACY_KEY, undefined);
}
const count = (map) => Object.values(map).reduce((n, v) => n + v, 0);
const list = (map) => Object.entries(map).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${goodName(id)}`).join(', ');

/** The drills of a session: [[key, record]]. */
export const ownedDrills = (playerId, slot) => Object.entries(drills).filter(([, d]) => d.owner === playerId && (d.slot ?? 0) === slot);

/** The bin of a session: { items: { goodId: count }, work: [per tier] } (player property "s<slot>:drill_bin"). */
const binOf = (player, slot) => getJson(player, sessionKey(slot, 'drill_bin'), { items: {}, work: [] });
const saveBin = (player, slot, bin) => setJson(player, sessionKey(slot, 'drill_bin'), bin);

/** Chunks per second of a session's drills. */
export function drillRate(playerId, slot) {
  let rate = 0;
  for (const [, d] of ownedDrills(playerId, slot)) rate += 1 / (TIERS.get(d.block)?.seconds ?? Infinity);
  return rate;
}

function removeDrills(entries) {
  const owners = new Set();
  for (const [key, d] of entries) {
    const [dimensionId, x, y, z] = key.split('|');
    try {
      world.getDimension(dimensionId).getBlock({ x: +x, y: +y, z: +z })?.setType('minecraft:air');
    } catch {
      // chunk not loaded - the record is dropped either way
    }
    delete drills[key];
    owners.add(d.owner);
  }
  for (const owner of owners) save(owner);
}

/** Rebirth: the session's drills and its bin are gone. */
export function resetDrills(player, slot) {
  removeDrills(ownedDrills(player.id, slot));
  player.setDynamicProperty(sessionKey(slot, 'drill_bin'), undefined);
}

function roll(makes) {
  const weights = Object.entries(makes);
  let r = Math.random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of weights) if ((r -= w) < 0) return id;
  return weights[0][0];
}

function collect(player, slot) {
  const bin = binOf(player, slot);
  if (!count(bin.items) || activeSession(player) !== slot) return;
  const items = bin.items;
  bin.items = {};
  saveBin(player, slot, bin);
  giveGoods(player, items);
  player.playSound('random.orb');
  toast(player, 'Collected from your drills', list(items));
}

function showBin(player) {
  const slot = activeSession(player);
  const bin = binOf(player, slot);
  const n = ownedDrills(player.id, slot).length;
  const rate = drillRate(player.id, slot);
  const items = count(bin.items);
  const body =
    `§6Drills§r - ${n}/${D.max} on your pads, one chunk every ${rate ? +(1 / rate).toFixed(1) : '-'} s\n` +
    (items ? `In the bin (${items}/${D.bin}): ${list(bin.items)}` : '§7The bin is empty.') +
    (items >= D.bin ? '\n§cThe bin is full: collect to keep them digging.' : '');
  const buttons = [];
  if (items) buttons.push({ list: 'notice', text: `Collect ${items}`, icon: goodIcon(Object.keys(bin.items)[0]), run: (p) => collect(p, slot) });
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  fullScreenMenu(player, { form: 'notice', body, buttons });
}

/** Hand over a new drill item (crafted at the Pickaxe Station). */
export const giveDrill = (player, tier) => giveItem(player, tier.block);

// Placing: only in your active mine, only on a pad, up to the limit.
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  const tier = TIERS.get(block.typeId);
  if (!tier) return;
  const slot = activeSession(player);
  const refuse = (message) => {
    block.setType('minecraft:air');
    giveItem(player, tier.block);
    toast(player, '§cCan\'t place that here', message);
  };
  if (!inActivePlot(player, dimension.id, block.location)) return refuse('Drills only work in the mine of the session you are playing.');
  if (block.below()?.typeId !== padBlockId()) return refuse('Place drills on the drill pads: the light tiles on the west side of your mine.');
  if (ownedDrills(player.id, slot).length >= D.max) return refuse(`You have the most drills a session can place (${D.max}).`);
  drills[locKey(dimension.id, block.location)] = { owner: player.id, slot, block: block.typeId };
  save(player);
  toast(player, `${tier.name} placed`, 'It digs into your drill bin - tap a drill to collect');
});

// Tapping a drill opens the bin.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const record = drills[locKey(event.block.dimension.id, event.block.location)];
  if (!record) return;
  event.cancel = true;
  const player = event.player;
  if (!event.isFirstEvent) return;
  system.run(() => {
    if (record.owner !== player.id || (record.slot ?? 0) !== activeSession(player)) return notify(player, '§cThat drill is not part of the session you are playing.');
    showBin(player);
  });
});

// Drills can only be broken by their owner, from the session they belong to (so they can't move between saves).
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const record = drills[locKey(event.dimension.id, event.block.location)];
  if (!record) return;
  const player = event.player;
  if (record.owner !== player.id) {
    event.cancel = true;
    system.run(() => notify(player, '§cThat drill belongs to someone else.'));
  } else if ((record.slot ?? 0) !== activeSession(player)) {
    event.cancel = true;
    system.run(() => notify(player, '§cThat drill belongs to your other session.'));
  }
});

world.afterEvents.playerBreakBlock.subscribe(({ player, block, dimension }) => {
  const key = locKey(dimension.id, block.location);
  if (drills[key]) {
    delete drills[key];
    save(player);
  }
});

onSessionDelete((playerId, slot) => removeDrills(ownedDrills(playerId, slot)));

// A mine that gets rebuilt (new layout) loses what stood in it: its drills go back to the inventory.
onMineRebuild((player, slot) => {
  const mine = ownedDrills(player.id, slot);
  for (const [key, d] of mine) {
    giveItem(player, d.block);
    delete drills[key];
  }
  if (mine.length) {
    save(player);
    toast(player, `${mine.length} drill${mine.length > 1 ? 's' : ''} back in your inventory`, 'Your mine was rebuilt: place them on the drill pads (west side)', 6);
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) loadDrills(player);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  for (const [k, d] of Object.entries(drills)) if (d.owner === playerId) delete drills[k];
});

world.afterEvents.worldLoad.subscribe(() => {
  legacy = getJson(world, LEGACY_KEY, {});
  drills = {};
  for (const player of world.getAllPlayers()) loadDrills(player); // after a script reload players are still here

  // Every second the drills of each player's active session dig.
  system.runInterval(() => {
    eachPlayer('drills', (player) => {
      const slot = activeSession(player);
      if (slot === undefined) return;
      const mine = ownedDrills(player.id, slot);
      if (!mine.length) return;
      const bin = binOf(player, slot);
      let changed = false;
      D.tiers.forEach((tier, i) => {
        const n = mine.filter(([, d]) => d.block === tier.block).length;
        if (!n) return;
        bin.work[i] = (bin.work[i] ?? 0) + n / tier.seconds;
        changed = true;
        while (bin.work[i] >= 1 && count(bin.items) < D.bin) {
          const id = roll(tier.makes);
          bin.items[id] = (bin.items[id] ?? 0) + 1;
          bin.work[i] -= 1;
        }
        if (count(bin.items) >= D.bin) bin.work[i] = Math.min(bin.work[i], 1);
      });
      if (changed) saveBin(player, slot, bin);
    });
  }, 20);

  // Sparkles on loaded drills.
  system.runInterval(() => {
    let budget = 48;
    for (const key of Object.keys(drills)) {
      if (budget-- <= 0) break;
      const [dimensionId, x, y, z] = key.split('|');
      try {
        world.getDimension(dimensionId).spawnParticle('minecraft:villager_happy', { x: +x + 0.5, y: +y + 1.1, z: +z + 0.5 });
      } catch {
        // unloaded chunk
      }
    }
  }, 40);
});
