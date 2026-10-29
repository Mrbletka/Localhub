// The mine every session plays in: an enclosed cave around the plot centre (y = floor). Rough rock walls and a
// ceiling with stalactites, timber arches with hanging lanterns, a rail track from the expedition lift (in the tunnel,
// south) to the ore vein in the north wall, drill pads along both side walls and the Ore Trader on the landing.
// Built across several ticks (system.runJob).
import { BlockVolume } from '@minecraft/server';
import { CONFIG } from './config.js';
import { pick, permutation, hash, noise } from './lib/worldgen.js';

const M = CONFIG.mine;
const H = M.half; // the mine fills x/z -H..H around the centre, y -1..TOP
const TOP = 10;
const ARCHES = [-5, 1, 7]; // z rows of the timber arches (posts at x = +-6, beam at y 6)

let palette;
/** Block for every key of the plan, resolved once (ids and states checked against this game version). */
function blocks() {
  if (palette) return palette;
  const ids = {
    shell: pick('minecraft:deepslate'),
    rock0: pick('minecraft:stone'),
    rock1: pick('minecraft:andesite', 'minecraft:stone'),
    rock2: pick('minecraft:tuff', 'minecraft:cobblestone'),
    rock3: pick('minecraft:cobbled_deepslate', 'minecraft:cobblestone'),
    rock4: pick('minecraft:deepslate'),
    moss: pick('minecraft:mossy_cobblestone', 'minecraft:cobblestone'),
    ceil0: pick('minecraft:deepslate'),
    ceil1: pick('minecraft:tuff', 'minecraft:stone'),
    ceil2: pick('minecraft:dripstone_block', 'minecraft:stone'),
    floor0: pick('minecraft:cobbled_deepslate', 'minecraft:cobblestone'),
    floor1: pick('minecraft:deepslate'),
    floor2: pick('minecraft:tuff', 'minecraft:stone'),
    floor3: pick('minecraft:gravel'),
    path: pick('minecraft:gravel'),
    plank: pick('minecraft:spruce_planks', 'minecraft:planks'),
    pad: pick('minecraft:polished_tuff', 'minecraft:polished_andesite', 'minecraft:smooth_stone'),
    padEdge: pick('minecraft:deepslate_tiles', 'minecraft:stone_bricks'),
    light: pick('minecraft:ochre_froglight', 'minecraft:shroomlight', 'minecraft:glowstone'),
    tunnel: pick('minecraft:blackstone', 'minecraft:coal_block'),
    lift: pick(CONFIG.blocks.lift, 'minecraft:iron_block'),
    trader: pick(CONFIG.blocks.trader, 'minecraft:barrel'),
    air: 'minecraft:air',
  };
  palette = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, permutation(id)]));
  palette.post = permutation(pick('minecraft:spruce_log', 'minecraft:log'), { pillar_axis: 'y' });
  palette.beam = permutation(pick('minecraft:stripped_spruce_log', 'minecraft:spruce_log', 'minecraft:log'), { pillar_axis: 'x' });
  palette.chain = permutation(pick('minecraft:iron_chain', 'minecraft:chain'), { pillar_axis: 'y' });
  palette.lantern = permutation(pick('minecraft:lantern'), { hanging: true });
  palette.drip = permutation(pick('minecraft:pointed_dripstone'), { hanging: true, dripstone_thickness: 'tip' });
  palette.rail = permutation(pick('minecraft:rail'), { rail_direction: 0 });
  palette.barrel = permutation(pick('minecraft:barrel'), { facing_direction: 1 });
  return palette;
}

/** The block drills must stand on. */
export const padBlockId = () => blocks().pad.type.id;

// ---- the plan --------------------------------------------------------------------------------------------------
const V = M.vein;
export const inVein = (x, y, z) => x >= V.x[0] && x <= V.x[1] && z >= V.z[0] && z <= V.z[1] && y >= V.y[0] && y <= V.y[1];

/**
 * Every block of the mine, relative to the centre: plan.get(x, y, z) -> palette key. Hanging and attached blocks
 * (lanterns, chains, stalactites, rails) are listed in plan.attached and placed after everything else.
 * A generator (yields between slices, so a slow device spreads the work over ticks): `const plan = yield* planMine(seed)`.
 */
export function* planMine(seed) {
  const W = 2 * H + 1;
  const HEIGHT = TOP + 2; // y -1..TOP
  const grid = new Array(W * HEIGHT * W).fill('shell');
  const at = (x, y, z) => ((x + H) * HEIGHT + (y + 1)) * W + (z + H);
  const get = (x, y, z) => (Math.abs(x) > H || Math.abs(z) > H || y < -1 || y > TOP ? 'shell' : grid[at(x, y, z)]);
  const set = (x, y, z, key) => (grid[at(x, y, z)] = key);
  const attached = [];

  const ceilY = (x, z) => 7 + Math.round(noise(seed + 1, x, z, 5) * 2); // 7..9
  const bulge = (s, a, b) => Math.floor(noise(seed + s, a, b, 3) * 2.6); // 0..2
  const open = new Uint8Array(W * HEIGHT * W); // 1: air (hall, tunnel) or vein

  for (let x = -H; x <= H; x++) {
    for (let z = -H; z <= H; z++) {
      const ceil = ceilY(x, z);
      for (let y = 1; y < ceil; y++) {
        const high = y >= ceil - 2 ? 1 : 0; // walls lean in near the ceiling
        // Side walls stay straight by the drill pads; the north wall is the flat face of the vein.
        const side = (z >= -6 && z <= 8 && y <= 4 ? 0 : bulge(2, z, y)) + high;
        const north = (Math.abs(x) <= 7 && y <= 4 ? 0 : bulge(3, x, y)) + high;
        const south = Math.abs(x) <= 6 ? 0 : bulge(4, x, y) + high; // flat around the tunnel and the barrels
        const hall = Math.abs(x) <= 13 - side && z >= -8 + north && z <= 11 - south;
        const tunnel = Math.abs(x) <= 1 && y <= 3 && z >= 12 && z <= 14;
        if (hall || tunnel || inVein(x, y, z)) open[at(x, y, z)] = 1;
      }
    }
    yield;
  }
  const isOpen = (x, y, z) => Math.abs(x) <= H && Math.abs(z) <= H && y >= -1 && y <= TOP && open[at(x, y, z)] === 1;

  for (let x = -H; x <= H; x++) {
    for (let z = -H; z <= H; z++) {
      const ceil = ceilY(x, z);
      for (let y = -1; y <= TOP; y++) {
        if (isOpen(x, y, z)) {
          set(x, y, z, 'air'); // the vein is air until the ore field fills it
          continue;
        }
        const exposed = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => isOpen(x + dx, y + dy, z + dz));
        if (!exposed) continue; // hidden: shell
        if (y === 0 && isOpen(x, 1, z)) {
          const n = noise(seed + 5, x, z, 4);
          const rubble = z <= -6 && hash(seed + 10, x, z) < 0.5; // gravel in front of the vein
          set(x, y, z, rubble ? 'floor3' : n < 0.4 ? 'floor0' : n < 0.62 ? 'floor1' : n < 0.88 ? 'floor2' : 'floor3');
        } else if (y >= ceil && isOpen(x, y - 1, z)) {
          const n = noise(seed + 6, x, z, 3);
          set(x, y, z, n < 0.45 ? 'ceil0' : n < 0.75 ? 'ceil1' : 'ceil2');
        } else {
          const n = noise(seed + 7, x * 1.3 + z * 0.7, y * 1.6 + (x - z) * 0.3, 3);
          set(x, y, z, y <= 1 && hash(seed + 8, x * 31 + y, z) < 0.18 ? 'moss' : `rock${Math.min(4, Math.floor(n * 5))}`);
        }
      }
    }
    yield;
  }

  // Spruce landing where players arrive.
  for (let x = -6; x <= 6; x++) for (let z = 9; z <= 11; z++) set(x, 0, z, 'plank');
  // Timber frame around the vein: it is the mine face.
  for (let y = 1; y <= 5; y++) set(-7, y, -8, 'post'), set(7, y, -8, 'post');
  for (let x = -7; x <= 7; x++) set(x, 5, -8, 'beam');
  // Rail track from the tunnel to the vein, on a gravel bed.
  for (let z = -8; z <= 14; z++) {
    set(0, 0, z, 'path');
    attached.push([0, 1, z, 'rail']);
  }
  // Tunnel: timber frame in the south wall, a dark back wall.
  for (let y = 1; y <= 4; y++) set(-2, y, 12, 'post'), set(2, y, 12, 'post');
  for (let x = -2; x <= 2; x++) set(x, 4, 12, 'beam');
  for (let x = -1; x <= 1; x++) for (let y = 1; y <= 3; y++) set(x, y, 15, 'tunnel');
  set(0, 2, 15, 'lift'); // the expedition lift: tap it at the end of the tunnel
  set(3, 1, 11, 'trader'); // the Ore Trader on the landing
  // Drill pads along both side walls, framed by tiles.
  for (const s of [-1, 1]) {
    for (let z = -5; z <= 7; z++) {
      for (let a = 8; a <= 12; a++) set(s * a, 0, z, a === 8 || z === -5 || z === 7 ? 'padEdge' : 'pad');
    }
  }
  // Timber arches with lanterns, lanterns on chains over the drill bays and in front of the vein.
  const hang = (x, z) => {
    for (let y = ceilY(x, z) - 1; y >= 6; y--) if (get(x, y, z) === 'air') attached.push([x, y, z, 'chain']);
    attached.push([x, 5, z, 'lantern']);
  };
  for (const z of ARCHES) {
    for (let y = 1; y <= 5; y++) set(-6, y, z, 'post'), set(6, y, z, 'post');
    for (let x = -6; x <= 6; x++) set(x, 6, z, 'beam');
    attached.push([-3, 5, z, 'lantern'], [3, 5, z, 'lantern']);
  }
  for (const x of [-10, 10]) for (const z of [-2, 4]) hang(x, z);
  for (const x of [-4, 4]) hang(x, -7);
  for (const z of [-2, 4, 10]) set(0, ceilY(0, z), z, 'light');
  // Barrels by the entrance.
  for (const [x, z] of [[-4, 11], [-5, 11], [-5, 10], [4, 11], [5, 11]]) set(x, 1, z, 'barrel');
  // Stalactites, away from the arches and the chains.
  const used = new Set(attached.map(([x, , z]) => `${x},${z}`));
  for (let x = -12; x <= 12; x++) {
    for (let z = -7; z <= 10; z++) {
      const y = ceilY(x, z) - 1;
      if (ARCHES.includes(z) || used.has(`${x},${z}`) || get(x, y, z) !== 'air' || get(x, y + 1, z) === 'air') continue;
      if (hash(seed + 9, x, z) < 0.07) attached.push([x, y, z, 'drip']);
    }
  }
  return { get, attached, top: TOP, half: H };
}

/**
 * Generator for system.runJob: builds the mine around centre c (y = floor level). The floor goes in first, then
 * column by column bottom-up (never solid where the plan has air, so a player standing in it is never trapped),
 * then the hanging and attached blocks. Calls done(true) when finished, done(false) if part of it is not loaded.
 */
export function* buildMine(dimension, c, seed, done) {
  const B = blocks();
  const plan = yield* planMine(seed);
  const fill = (x, y1, y2, z, key) =>
    dimension.fillBlocks(new BlockVolume({ x: c.x + x, y: c.y + y1, z: c.z + z }, { x: c.x + x, y: c.y + y2, z: c.z + z }), B[key]);
  try {
    dimension.fillBlocks(new BlockVolume({ x: c.x - H, y: c.y, z: c.z - H }, { x: c.x + H, y: c.y, z: c.z + H }), B.floor0);
    yield;
    for (let x = -H; x <= H; x++) {
      for (let z = -H; z <= H; z++) {
        let start = -1;
        let key = plan.get(x, -1, z);
        for (let y = 0; y <= plan.top + 1; y++) {
          const next = y <= plan.top ? plan.get(x, y, z) : undefined;
          if (next === key) continue;
          fill(x, start, y - 1, z, key);
          start = y;
          key = next;
        }
        yield;
      }
    }
    // Attached blocks: from the top down (chains hang from the ceiling, lanterns from chains and beams).
    for (const [x, y, z, key] of [...plan.attached].sort((a, b) => b[1] - a[1])) {
      dimension.getBlock({ x: c.x + x, y: c.y + y, z: c.z + z })?.setPermutation(B[key]);
      yield;
    }
  } catch {
    return done(false); // part of the mine is not loaded yet
  }
  done(true);
}

/** A few floor blocks under the arrival spot (the player's own chunk, always loaded), placed before the real build. */
export function safetyFloor(dimension, c) {
  for (let x = -1; x <= 1; x++) for (let z = 9; z <= 11; z++) dimension.getBlock({ x: c.x + x, y: c.y, z: c.z + z })?.setPermutation(blocks().plank);
}

/** Where players arrive: on the rails in front of the tunnel, looking at the vein. */
export const arrival = (c) => ({ x: c.x + 0.5, y: c.y + 1, z: c.z + 10.5 });
export const lookAt = (c) => ({ x: c.x + 0.5, y: c.y + 2, z: c.z - 10 });
