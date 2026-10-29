// Sessions: every player has CONFIG.sessions.slots save slots. Each session is its own mine plot (in a grid far
// from spawn) with its own money, upgrades, rebirths and unplaced drills. Only the active session earns.
import { world, system, BlockVolume } from '@minecraft/server';
import { CONFIG } from './config.js';
import { getJson, setJson, getNumber, setNumber, giveItem } from './lib/util.js';

const NS = CONFIG.namespace;
const P = CONFIG.plots;
const SLOTS = CONFIG.sessions.slots;
const STATE_KEY = `${NS}:sessions`;
const ACTIVE_KEY = `${NS}:active_session`;
const DRILLS = new Set(CONFIG.generators.map((g) => g.block));

/** { players: { playerId: { name, slots: [{ index, built } | null, ...] } }, free: plotIndex[], next: plotIndex } */
let state = { players: {}, free: [], next: 0 };
const deleteHooks = [];
const enterHooks = [];

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
    level: getNumber(player, sessionKey(slot, 'income_level')),
    rebirths: getNumber(player, sessionKey(slot, 'rebirths')),
  };
}

/** Called with (playerId, slot) when a session is deleted, so other systems can drop its data. */
export const onSessionDelete = (fn) => deleteHooks.push(fn);

/** Called with (player, slot, plotCenter) once a player stands in the mine of the session they play. */
export const onSessionEnter = (fn) => enterHooks.push(fn);

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
  if (dimensionId !== P.dimension || y < P.origin.y - 8 || y > P.origin.y + P.clearHeight + 16) return;
  const col = Math.round((x - P.origin.x) / P.spacing);
  const row = Math.round((z - P.origin.z) / P.spacing);
  if (col < 0 || col >= P.perRow || row < 0) return;
  const index = row * P.perRow + col;
  const c = plotCenter(index);
  if (Math.abs(x - c.x) > P.radius || Math.abs(z - c.z) > P.radius) return;
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

/** Arrival spot: near the south edge, looking at the middle, so you never land inside a drill. */
function arrive(player, c) {
  const dimension = world.getDimension(P.dimension);
  const spot = { x: c.x + 0.5, y: c.y + 1, z: c.z + P.radius - 2 + 0.5 };
  player.teleport(spot, { dimension, facingLocation: { x: c.x + 0.5, y: c.y + 1, z: c.z + 0.5 } });
  player.setSpawnPoint({ dimension, x: Math.floor(spot.x), y: spot.y, z: Math.floor(spot.z) });
}

function build(dimension, c) {
  const r = P.radius;
  const fill = (x1, y1, z1, x2, y2, z2, block) => dimension.fillBlocks(new BlockVolume({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }), block);
  fill(c.x - r, c.y + 1, c.z - r, c.x + r, c.y + P.clearHeight, c.z + r, 'minecraft:air');
  fill(c.x - r, c.y, c.z - r, c.x + r, c.y, c.z + r, P.floor);
  fill(c.x - r, c.y + 1, c.z - r, c.x + r, c.y + 1, c.z - r, P.border);
  fill(c.x - r, c.y + 1, c.z + r, c.x + r, c.y + 1, c.z + r, P.border);
  fill(c.x - r, c.y + 1, c.z - r, c.x - r, c.y + 1, c.z + r, P.border);
  fill(c.x + r, c.y + 1, c.z - r, c.x + r, c.y + 1, c.z + r, P.border);
  for (const [dx, dz] of [[-r, -r], [-r, r], [r, -r], [r, r]]) dimension.getBlock({ x: c.x + dx, y: c.y + 2, z: c.z + dz })?.setType(P.light);
}

/** Take a player to a session's plot, building it first if it never finished. done(true) once they stand in it. */
function goToPlot(player, record, done) {
  const c = plotCenter(record.index);
  if (record.built) {
    arrive(player, c);
    return done(true);
  }
  const dimension = world.getDimension(P.dimension);
  player.addEffect('slow_falling', 200, { showParticles: false });
  player.teleport({ x: c.x + 0.5, y: c.y + 3, z: c.z + 0.5 }, { dimension });
  let tries = 0;
  const handle = system.runInterval(() => {
    if (!player.isValid) return system.clearRun(handle);
    try {
      build(dimension, c);
    } catch {
      // chunks still loading - try again shortly
      if (++tries < 40) return;
      system.clearRun(handle);
      return done(false);
    }
    system.clearRun(handle);
    record.built = true;
    save();
    arrive(player, c);
    done(true);
  }, 5);
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
  goToPlot(player, record, (ok) => {
    if (ok) for (const fn of enterHooks) fn(player, slot, plotCenter(record.index));
    done(ok);
  });
}

/** Start a fresh session in an empty slot: new plot, starting money, Wooden Pick, Shallow Mine. */
export function createSession(player, slot, done) {
  const p = (state.players[player.id] ??= { name: player.name, slots: Array(SLOTS).fill(null) });
  p.name = player.name;
  p.slots[slot] = { index: state.free.length ? state.free.shift() : state.next++, built: false };
  save();
  setNumber(player, sessionKey(slot, 'money'), CONFIG.startingMoney);
  setNumber(player, sessionKey(slot, 'income_level'), 0);
  setNumber(player, sessionKey(slot, 'rebirths'), 0);
  setNumber(player, sessionKey(slot, 'pick'), 1);
  setNumber(player, sessionKey(slot, 'mine_level'), 1);
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
  for (const name of ['money', 'income_level', 'rebirths', 'pick', 'mine_level', 'drill_items']) player.setDynamicProperty(sessionKey(slot, name), undefined);
  for (const fn of deleteHooks) fn(player.id, slot);
}

// ---- protection ------------------------------------------------------------------------------------------------

/** True for the floor and rim of a plot, which nobody may break. */
function isStructure(index, { x, y, z }) {
  const c = plotCenter(index);
  return y === c.y || (y <= c.y + 2 && (Math.abs(x - c.x) === P.radius || Math.abs(z - c.z) === P.radius));
}

/**
 * Other players may not break blocks inside someone's mine, and nobody breaks its floor or rim.
 * Before-events are read-only: messages go through system.run.
 */
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const plot = plotAt(event.dimension.id, event.block.location);
  if (!plot) return;
  const player = event.player;
  if (plot.owner !== player.id) {
    event.cancel = true;
    system.run(() => player.onScreenDisplay.setActionBar(`§cThis is ${plot.name}'s mine.`));
  } else if (isStructure(plot.index, event.block.location)) {
    event.cancel = true;
    system.run(() => player.onScreenDisplay.setActionBar('§7The floor and walls of your mine are unbreakable.'));
  }
});

/** ...or build in it: the block is removed again and handed back. Drills are handled in main.js. */
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  if (DRILLS.has(block.typeId) || block.isAir) return;
  const plot = plotAt(dimension.id, block.location);
  if (!plot || plot.owner === player.id) return;
  const item = block.getItemStack(1);
  block.setType('minecraft:air');
  if (item) player.getComponent('minecraft:inventory')?.container?.addItem(item);
  player.onScreenDisplay.setActionBar(`§cThis is ${plot.name}'s mine.`);
});
