// Private mine plots: each player claims one platform in a grid far from spawn.
import { world, system, BlockVolume } from '@minecraft/server';
import { CONFIG } from './config.js';
import { getJson, setJson } from './lib/util.js';

const P = CONFIG.plots;
const PLOTS_KEY = `${CONFIG.namespace}:plots`;

/** { owners: { playerId: { index, name } }, next: number } */
let state = { owners: {}, next: 0 };

export function loadPlots() {
  state = getJson(world, PLOTS_KEY, state);
}

const save = () => setJson(world, PLOTS_KEY, state);

export const plotIndexOf = (playerId) => state.owners[playerId]?.index;

export function plotCenter(index) {
  return {
    x: P.origin.x + (index % P.perRow) * P.spacing,
    y: P.origin.y,
    z: P.origin.z + Math.floor(index / P.perRow) * P.spacing,
  };
}

/** Owner record of the plot containing a location, or undefined. */
export function plotAt(dimensionId, { x, y, z }) {
  if (dimensionId !== P.dimension || y < P.origin.y - 8 || y > P.origin.y + P.clearHeight + 16) return;
  const col = Math.round((x - P.origin.x) / P.spacing);
  const row = Math.round((z - P.origin.z) / P.spacing);
  if (col < 0 || col >= P.perRow || row < 0) return;
  const index = row * P.perRow + col;
  const c = plotCenter(index);
  if (Math.abs(x - c.x) > P.radius || Math.abs(z - c.z) > P.radius) return;
  for (const [owner, record] of Object.entries(state.owners)) {
    if (record.index === index) return { owner, ...record };
  }
}

export const inOwnPlot = (player, dimensionId, location) => plotAt(dimensionId, location)?.owner === player.id;

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

/**
 * Take a player to their plot. A plot that was never built is built first, once its chunks have loaded.
 * done(true) when they are standing in it, done(false) if they have no plot or the area never loaded.
 */
export function enterPlot(player, done = () => {}) {
  const record = state.owners[player.id];
  if (!record) return done(false);
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

/** Claim the next free plot for a player and take them there. */
export function claimPlot(player, done) {
  state.owners[player.id] = { index: state.next++, name: player.name, built: false };
  save();
  enterPlot(player, done);
}

/** Other players may not break blocks inside someone's plot. Before-events are read-only: messages go through system.run. */
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const plot = plotAt(event.dimension.id, event.block.location);
  if (!plot || plot.owner === event.player.id) return;
  event.cancel = true;
  const player = event.player;
  system.run(() => player.onScreenDisplay.setActionBar(`§cThis is ${plot.name}'s mine.`));
});

const DRILLS = new Set(CONFIG.generators.map((g) => g.block));

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
