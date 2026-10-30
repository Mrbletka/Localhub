// Sessions: every player has CONFIG.sessions.slots save slots. Each session is its own mine plot (in a grid far
// from spawn) with its own money, upgrades, rebirths and unplaced drills. Only the active session earns.
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { getJson, setJson, getNumber, setNumber, giveItem } from './lib/util.js';
import { buildMine, arrival, lookAt, safetyFloor } from './mine_builder.js';

const NS = CONFIG.namespace;
const P = CONFIG.plots;
const SLOTS = CONFIG.sessions.slots;
const STATE_KEY = `${NS}:sessions`;
const ACTIVE_KEY = `${NS}:active_session`;
const DRILLS = new Set(CONFIG.drills.tiers.map((g) => g.block));
const BREAKABLE = new Set([...DRILLS, ...CONFIG.ores.map((o) => o.block)]);
/** Every per-session player property (removed when a session is deleted). */
const SESSION_DATA = ['money', 'rebirths', 'pick', 'lantern', 'backpack', 'cart', 'drill_items', 'drill_bin', 'machines', 'income_level', 'mine_level'];

/**
 * { players: { playerId: { name, slots: [{ index, version } | null, ...] } }, free: plotIndex[], next: plotIndex }
 * version: layout version of the mine built on that plot (CONFIG.mine.version); older mines are rebuilt on entry.
 */
let state = { players: {}, free: [], next: 0 };
const deleteHooks = [];
const enterHooks = [];
const rebuildHooks = [];

const save = () => setJson(world, STATE_KEY, state);

/** Per-session player property key, e.g. "mining_tycoon:s0:money". */
export const sessionKey = (slot, name) => `${NS}:s${slot}:${name}`;

export function loadSessions() {
  state = getJson(world, STATE_KEY, state);
  // Worlds from before sessions: each claimed plot becomes session 1.
  const old = getJson(world, `${NS}:plots`, undefined);
  if (old?.owners) {
    for (const [id, rec] of Object.entries(old.owners)) {
      state.players[id] ??= { name: rec.name, slots: Array(SLOTS).fill(null) };
      state.players[id].slots[0] ??= { index: rec.index, built: !!rec.built };
    }
    state.next = Math.max(state.next, old.next ?? 0);
    world.setDynamicProperty(`${NS}:plots`, undefined);
    save();
  }
}

/** The player's slots: a session record or null for an empty slot. */
export function sessionsOf(playerId) {
  const slots = state.players[playerId]?.slots ?? [];
  return Array.from({ length: SLOTS }, (_, i) => slots[i] ?? null);
}

export const hasSessions = (playerId) => sessionsOf(playerId).some(Boolean);

/** Active slot number, or undefined when the player is not in a session. */
export function activeSession(player) {
  const slot = player.getDynamicProperty(ACTIVE_KEY);
  return typeof slot === 'number' && sessionsOf(player.id)[slot] ? slot : undefined;
}

/** Slot to continue with: the active one, else the first that exists. */
export function lastSession(player) {
  return activeSession(player) ?? sessionsOf(player.id).findIndex(Boolean);
}

export function sessionStats(player, slot) {
  return {
    money: getNumber(player, sessionKey(slot, 'money')),
    rebirths: getNumber(player, sessionKey(slot, 'rebirths')),
  };
}

/** Called with (playerId, slot) when a session is deleted, so other systems can drop its data. */
export const onSessionDelete = (fn) => deleteHooks.push(fn);

/** Called with (player, slot, plotCenter) once a player stands in the mine of the session they play. */
export const onSessionEnter = (fn) => enterHooks.push(fn);

/** Called with (player, slot) right before the active session's mine is (re)built: drop what stood in it. */
export const onMineRebuild = (fn) => rebuildHooks.push(fn);

// ---- plots -----------------------------------------------------------------------------------------------------

export function plotCenter(index) {
  return {
    x: P.origin.x + (index % P.perRow) * P.spacing,
    y: P.origin.y,
    z: P.origin.z + Math.floor(index / P.perRow) * P.spacing,
  };
}

/** Owner of the plot containing a location: { owner, name, slot, index }, or undefined. */
export function plotAt(dimensionId, { x, y, z }) {
  if (dimensionId !== P.dimension || y < P.origin.y - 8 || y > P.origin.y + 26) return;
  const col = Math.round((x - P.origin.x) / P.spacing);
  const row = Math.round((z - P.origin.z) / P.spacing);
  if (col < 0 || col >= P.perRow || row < 0) return;
  const index = row * P.perRow + col;
  const c = plotCenter(index);
  if (Math.abs(x - c.x) > CONFIG.mine.half || Math.abs(z - c.z) > CONFIG.mine.half) return;
  for (const [owner, p] of Object.entries(state.players)) {
    const slot = p.slots.findIndex((s) => s?.index === index);
    if (slot >= 0) return { owner, name: p.name, slot, index };
  }
}

/** True when the location is inside the plot of the player's active session. */
export function inActivePlot(player, dimensionId, location) {
  const plot = plotAt(dimensionId, location);
  return !!plot && plot.owner === player.id && plot.slot === activeSession(player);
}

/** On the rails in front of the tunnel, looking at the ore vein. */
function arrive(player, c) {
  const dimension = world.getDimension(P.dimension);
  const spot = arrival(c);
  player.teleport(spot, { dimension, facingLocation: lookAt(c) });
  player.setSpawnPoint({ dimension, x: Math.floor(spot.x), y: spot.y, z: Math.floor(spot.z) });
}

/** Layout version of the mine on a plot (plots from before versions: 1 if built, 0 if not). */
const mineVersion = (record) => record.version ?? (record.built ? 1 : 0);

/**
 * Take a player to a session's mine. A mine that is missing or has an older layout is built first - around the
 * player: one teleport to the arrival spot (before the loading screen opens: teleports close menus), then the
 * mine goes up across a few ticks without ever putting a block where the player stands. done(true) when they are in.
 */
function goToPlot(player, record, slot, done) {
  const c = plotCenter(record.index);
  if (mineVersion(record) >= CONFIG.mine.version) {
    arrive(player, c);
    return done(true);
  }
  for (const fn of rebuildHooks) fn(player, slot);
  const dimension = world.getDimension(P.dimension);
  const spot = arrival(c);
  player.addEffect('slow_falling', 600, { showParticles: false });
  player.teleport({ ...spot, y: spot.y + 1.5 }, { dimension, facingLocation: lookAt(c) });
  let tries = 0;
  const attempt = () => {
    if (!player.isValid) return;
    try {
      safetyFloor(dimension, c); // something to stand on at once, even before the rest of the area has loaded
    } catch {
      // not loaded yet either - the build retries
    }
    system.runJob(
      buildMine(dimension, c, record.index + 1, (ok) => {
        if (!ok) return ++tries < 40 ? system.runTimeout(attempt, 5) : done(false); // not loaded yet
        record.version = CONFIG.mine.version;
        delete record.built;
        save();
        player.removeEffect('slow_falling');
        if (player.location.y < c.y + 0.9) arrive(player, c); // fell below the floor before it was there
        else player.setSpawnPoint({ dimension, x: Math.floor(spot.x), y: spot.y, z: Math.floor(spot.z) });
        done(true);
      }),
    );
  };
  system.runTimeout(attempt, 2);
}

// ---- switching -------------------------------------------------------------------------------------------------

/** Unplaced drills belong to a session: take them out of the inventory and remember them. */
function stashDrills(player, slot) {
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return;
  const stash = getJson(player, sessionKey(slot, 'drill_items'), {});
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (!item || !DRILLS.has(item.typeId)) continue;
    stash[item.typeId] = (stash[item.typeId] ?? 0) + item.amount;
    container.setItem(i);
  }
  setJson(player, sessionKey(slot, 'drill_items'), stash);
}

function unstashDrills(player, slot) {
  const stash = getJson(player, sessionKey(slot, 'drill_items'), {});
  for (const [typeId, amount] of Object.entries(stash)) if (amount > 0) giveItem(player, typeId, amount);
  setJson(player, sessionKey(slot, 'drill_items'), {});
}

/** Make a slot the active session (swapping unplaced drills) and take the player to its mine. */
export function playSession(player, slot, done = () => {}) {
  const record = sessionsOf(player.id)[slot];
  if (!record) return done(false);
  const current = activeSession(player);
  if (current !== slot) {
    if (current !== undefined) stashDrills(player, current);
    player.setDynamicProperty(ACTIVE_KEY, slot);
    unstashDrills(player, slot);
  }
  goToPlot(player, record, slot, (ok) => {
    if (ok) for (const fn of enterHooks) fn(player, slot, plotCenter(record.index));
    done(ok);
  });
}

/** Start a fresh session in an empty slot: new plot, starting money, Wooden Pick, first lantern and backpack. */
export function createSession(player, slot, done) {
  const p = (state.players[player.id] ??= { name: player.name, slots: Array(SLOTS).fill(null) });
  p.name = player.name;
  p.slots[slot] = { index: state.free.length ? state.free.shift() : state.next++, version: 0 };
  save();
  setNumber(player, sessionKey(slot, 'money'), CONFIG.startingMoney);
  setNumber(player, sessionKey(slot, 'rebirths'), 0);
  for (const name of ['pick', 'lantern', 'backpack', 'cart']) setNumber(player, sessionKey(slot, name), 1);
  setJson(player, sessionKey(slot, 'drill_items'), {});
  playSession(player, slot, done);
}

/** Delete a session: its plot is freed (and rebuilt clean for the next owner), its progress is gone. */
export function deleteSession(player, slot) {
  const p = state.players[player.id];
  const record = p?.slots[slot];
  if (!record) return;
  if (activeSession(player) === slot) {
    stashDrills(player, slot); // removes its drills from the inventory
    player.setDynamicProperty(ACTIVE_KEY, undefined);
  }
  p.slots[slot] = null;
  state.free.push(record.index);
  save();
  for (const name of SESSION_DATA) player.setDynamicProperty(sessionKey(slot, name), undefined);
  for (const fn of deleteHooks) fn(player.id, slot);
}

// ---- protection ------------------------------------------------------------------------------------------------

/**
 * In a mine only its owner breaks blocks, and only ores and drills (the cave itself is unbreakable).
 * Before-events are read-only: messages go through system.run.
 */
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const player = event.player;
  let plot;
  try {
    plot = plotAt(event.dimension.id, event.block.location);
  } catch {
    event.cancel = true; // if in doubt, protect the mine
    return;
  }
  if (!plot) return;
  if (plot.owner !== player.id) {
    event.cancel = true;
    system.run(() => player.onScreenDisplay.setActionBar(`§cThis is ${plot.name}'s mine.`));
  } else if (!BREAKABLE.has(event.block.typeId)) {
    event.cancel = true;
    system.run(() => player.onScreenDisplay.setActionBar('§7Only ores and drills can be broken in your mine.'));
  }
});

/** ...and only drills can be placed (main.js checks those): anything else is taken out again and handed back. */
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  if (DRILLS.has(block.typeId) || block.isAir) return;
  const plot = plotAt(dimension.id, block.location);
  if (!plot) return;
  const item = block.getItemStack(1);
  block.setType('minecraft:air');
  if (item) player.getComponent('minecraft:inventory')?.container?.addItem(item);
  player.onScreenDisplay.setActionBar(plot.owner === player.id ? '§7Only drills can be placed in your mine.' : `§cThis is ${plot.name}'s mine.`);
});
