// Expedition caves: a fresh cave for every run, generated from a seed inside a closed box far from the mines. Each
// cave level has its own size, rock (palette), ores and creatures. Tunnels wander out of the lift room (diggers that
// turn, climb, branch and open into chambers), ore deposits sit in the walls - richer the further from the lift. It
// is dark down there: only the lift room has lanterns (expedition.js removes natural mob spawns, so only the creatures
// the expedition sends come for you). Coordinates are relative to the cave centre (y 0 = bottom of the box).
import { BlockVolume } from '@minecraft/server';
import { CONFIG } from './config.js';
import { pick, permutation, hash, noise, random } from './lib/worldgen.js';

const TOP = CONFIG.expedition.height; // the box spans y 0..TOP
const HEIGHT = TOP + 1;
const ORES = CONFIG.ores;
const inside = (b, x, y, z) => x >= b.x[0] && x <= b.x[1] && y >= b.y[0] && y <= b.y[1] && z >= b.z[0] && z <= b.z[1];

/**
 * The box of a cave level: x/z -R..R. The lift room sits at its south end: lit, timber floor, the lift in its south
 * wall; players arrive in its middle (z = mid) and extract there.
 */
export function shape(level) {
  const R = level.half;
  return {
    R,
    W: 2 * R + 1,
    mid: R - 5,
    room: { x: [-3, 3], y: [4, 8], z: [R - 8, R - 2] },
    guard: { x: [-4, 4], y: [2, 10], z: [R - 9, R] }, // no tunnel cuts into the room's walls
    lift: [0, 5, R - 1],
  };
}

/** Rock of each palette: the plan uses the keys, the palette picks the blocks. */
const ROCK = {
  stone: {
    shell: 'minecraft:stone', stone: 'minecraft:stone', andesite: 'minecraft:andesite', tuff: 'minecraft:tuff', cobble: 'minecraft:cobblestone',
    moss: 'minecraft:mossy_cobblestone', deep: 'minecraft:deepslate', deepCobble: 'minecraft:cobbled_deepslate',
    dripBlock: 'minecraft:dripstone_block', gravel: 'minecraft:gravel', web: 'minecraft:web',
  },
  deep: {
    shell: 'minecraft:deepslate', stone: 'minecraft:deepslate', andesite: 'minecraft:tuff', tuff: 'minecraft:cobbled_deepslate',
    cobble: 'minecraft:smooth_basalt', moss: 'minecraft:sculk', deep: 'minecraft:deepslate', deepCobble: 'minecraft:cobbled_deepslate',
    dripBlock: 'minecraft:dripstone_block', gravel: 'minecraft:gravel', web: 'minecraft:web',
  },
  crystal: {
    shell: 'minecraft:calcite', stone: 'minecraft:calcite', andesite: 'minecraft:smooth_basalt', tuff: 'minecraft:amethyst_block',
    cobble: 'minecraft:calcite', moss: 'minecraft:amethyst_block', deep: 'minecraft:smooth_basalt', deepCobble: 'minecraft:tuff',
    dripBlock: 'minecraft:amethyst_block', gravel: 'minecraft:moss_block', web: 'minecraft:air',
  },
  magma: {
    shell: 'minecraft:blackstone', stone: 'minecraft:blackstone', andesite: 'minecraft:basalt', tuff: 'minecraft:smooth_basalt',
    cobble: 'minecraft:gilded_blackstone', moss: 'minecraft:magma', deep: 'minecraft:basalt', deepCobble: 'minecraft:blackstone',
    dripBlock: 'minecraft:basalt', gravel: 'minecraft:netherrack', web: 'minecraft:air',
  },
};
const STATES = { 'minecraft:basalt': { pillar_axis: 'y' } };

const palettes = new Map();
function blocks(level) {
  const name = level.palette ?? 'stone';
  if (palettes.has(name)) return palettes.get(name);
  const ids = { plank: pick('minecraft:spruce_planks', 'minecraft:planks'), lift: pick(CONFIG.blocks.lift, 'minecraft:iron_block'), air: 'minecraft:air' };
  for (const [key, id] of Object.entries(ROCK[name] ?? ROCK.stone)) ids[key] = pick(id, ROCK.stone[key], 'minecraft:stone');
  const palette = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, permutation(id, STATES[id])]));
  for (const ore of ORES) palette[`ore_${ore.id}`] = permutation(pick(ore.block, 'minecraft:stone'));
  palette.lantern = permutation(pick('minecraft:lantern'), { hanging: true });
  palette.drip = name === 'crystal'
    ? permutation(pick('minecraft:amethyst_cluster', 'minecraft:pointed_dripstone'), { 'minecraft:block_face': 'down' })
    : permutation(pick('minecraft:pointed_dripstone'), { hanging: true, dripstone_thickness: 'tip' });
  palettes.set(name, palette);
  return palette;
}

/** Ore weights between `near` (by the lift) and `far` (the far end of the cave), t in 0..1. */
function weightsAt(level, t) {
  const w = {};
  for (const [id, v] of Object.entries(level.near)) w[id] = (w[id] ?? 0) + v * (1 - t);
  for (const [id, v] of Object.entries(level.far)) w[id] = (w[id] ?? 0) + v * t;
  return Object.entries(w);
}

/**
 * The cave for a seed: plan.get(x, y, z) -> palette key, plus the hanging blocks (lanterns, stalactites) in
 * plan.attached and the floor cells creatures can be sent to in plan.spawns. Generator: `yield* planCave(seed, level)`.
 */
export function* planCave(seed, level) {
  const { R, W, mid, room: ROOM, guard: GUARD, lift: LIFT } = shape(level);
  const rand = random(seed);
  const at = (x, y, z) => ((x + R) * HEIGHT + y) * W + (z + R);
  const inBox = (x, y, z) => Math.abs(x) <= R && Math.abs(z) <= R && y >= 0 && y <= TOP;
  const open = new Uint8Array(W * HEIGHT * W); // 1 open (air, web), 0 rock
  const isOpen = (x, y, z) => inBox(x, y, z) && open[at(x, y, z)] === 1;

  const carve = (cx, cy, cz, rx, ry, rz) => {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          if (Math.abs(x) > R - 2 || Math.abs(z) > R - 2 || y < 1 || y > TOP - 2 || inside(GUARD, x, y, z)) continue;
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1) open[at(x, y, z)] = 1;
        }
  };

  // The room and its three exits (north, west, east).
  for (let x = ROOM.x[0]; x <= ROOM.x[1]; x++)
    for (let y = ROOM.y[0]; y <= ROOM.y[1]; y++) for (let z = ROOM.z[0]; z <= ROOM.z[1]; z++) open[at(x, y, z)] = 1;
  for (let y = 4; y <= 6; y++) {
    for (let x = -1; x <= 1; x++) for (const z of [GUARD.z[0], GUARD.z[0] + 1]) open[at(x, y, z)] = 1;
    for (let z = mid - 1; z <= mid + 1; z++) for (const x of [-4, 4]) open[at(x, y, z)] = 1;
  }

  // Diggers: they wander, steer away from the walls, climb and dive a little, branch and open chambers.
  const worms = [
    { x: 0, y: 5, z: GUARD.z[0] - 1, a: -Math.PI / 2, len: 70 + rand() * 40 + (R - 22) * 4 },
    { x: -5, y: 5, z: mid, a: Math.PI, len: 45 + rand() * 30 + (R - 22) * 3 },
    { x: 5, y: 5, z: mid, a: 0, len: 45 + rand() * 30 + (R - 22) * 3 },
  ];
  let chambers = 0;
  for (let w = 0; w < worms.length; w++) {
    const worm = worms[w];
    let { x, y, z, a } = worm;
    let pitch = 0;
    for (let step = 0; step < worm.len; step++) {
      const r = 1.6 + noise(seed + w * 7, step * 0.37, w * 13, 4) * 1.1;
      carve(x, y, z, r, r, r);
      if (rand() < 0.035 && worms.length < 11 + (R - 22)) {
        worms.push({ x, y, z, a: a + (rand() < 0.5 ? 1 : -1) * Math.PI / 2, len: 25 + rand() * 35 });
      }
      if (rand() < 0.028 && chambers < 5 + Math.floor((R - 22) / 2) && step > 6) {
        const rx = 4 + rand() * 2;
        const ry = 2.6 + rand();
        carve(x, y + 1, z, rx, ry, rx);
        chambers++;
      }
      a += (rand() - 0.5) * 0.55;
      if (Math.abs(x) > R - 7 || Math.abs(z) > R - 7) {
        let turn = Math.atan2(-z, -x) - a; // head back towards the middle
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        a += turn * 0.2;
      }
      pitch = Math.max(-0.25, Math.min(0.25, pitch + (rand() - 0.5) * 0.12));
      y = Math.max(4, Math.min(8, y + pitch)); // one level of gently rolling tunnels: easier to find the way back
      x += Math.cos(a);
      z += Math.sin(a);
    }
    if (w % 3 === 2) yield;
  }

  // Where tunnels meet at different heights the step can be too high to climb (and rock can't be dug here): cut
  // steps into such ledges until every floor can be walked to from the lift room.
  const stand = (x, y, z) => isOpen(x, y, z) && isOpen(x, y + 1, z) && !isOpen(x, y - 1, z);
  const carvable = (x, y, z) => Math.abs(x) <= R - 2 && Math.abs(z) <= R - 2 && y >= 1 && y <= TOP - 2 && !inside(GUARD, x, y, z);
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const walk = () => {
    const reached = new Uint8Array(open.length);
    const queue = [[0, ROOM.y[0], mid]];
    reached[at(0, ROOM.y[0], mid)] = 1;
    const reach = (x, y, z) => {
      if (reached[at(x, y, z)]) return;
      reached[at(x, y, z)] = 1;
      queue.push([x, y, z]);
    };
    while (queue.length) {
      const [x, y, z] = queue.pop();
      for (const [dx, dz] of SIDES) {
        const [nx, nz] = [x + dx, z + dz];
        if (stand(nx, y, nz)) reach(nx, y, nz);
        else if (stand(nx, y + 1, nz) && isOpen(x, y + 2, z)) reach(nx, y + 1, nz); // jump up one
        else if (isOpen(nx, y, nz) && isOpen(nx, y + 1, nz)) {
          let fy = y; // walk off the edge and drop
          while (fy > 1 && isOpen(nx, fy - 1, nz)) fy--;
          if (stand(nx, fy, nz)) reach(nx, fy, nz);
        }
      }
    }
    return reached;
  };
  for (let fixes = 0; fixes < 60; fixes++) {
    const reached = walk();
    let best;
    for (let x = -R + 2; x <= R - 2 && !(best?.dy === 2); x++)
      for (let y = 1; y < TOP - 3; y++)
        for (let z = -R + 2; z <= R - 2; z++) {
          if (!reached[at(x, y, z)] || !stand(x, y, z)) continue;
          for (const [dx, dz] of SIDES)
            for (let dy = 2; dy <= 4 && dy < (best?.dy ?? 5); dy++) {
              const [nx, ny, nz] = [x + dx, y + dy, z + dz];
              if (!stand(nx, ny, nz) || reached[at(nx, ny, nz)] || isOpen(nx, y, nz)) continue;
              if (!carvable(x, y + 2, z) || !carvable(nx, y + 1, nz) || !carvable(nx, ny - 1, nz)) continue;
              best = { x, y, z, nx, nz, dy };
            }
        }
    if (!best) break;
    // A step up into the ledge, with headroom to jump onto it.
    const { x, y, z, nx, nz, dy } = best;
    open[at(x, y + 2, z)] = 1;
    for (let sy = y + 1; sy < y + dy; sy++) open[at(nx, sy, nz)] = 1;
    if (fixes % 4 === 3) yield;
  }

  // Blocks: rock skin on every exposed face, ore deposits, gravel floors, the room.
  const grid = new Array(W * HEIGHT * W).fill('shell');
  const get = (x, y, z) => (inBox(x, y, z) ? grid[at(x, y, z)] : 'shell');
  const set = (x, y, z, key) => inBox(x, y, z) && (grid[at(x, y, z)] = key);
  const boundary = (x, y, z) => Math.abs(x) === R || Math.abs(z) === R || y === 0 || y === TOP;
  const exposed = (x, y, z) => isOpen(x + 1, y, z) || isOpen(x - 1, y, z) || isOpen(x, y + 1, z) || isOpen(x, y - 1, z) || isOpen(x, y, z + 1) || isOpen(x, y, z - 1);
  for (let x = -R; x <= R; x++) {
    for (let y = 0; y <= TOP; y++) {
      for (let z = -R; z <= R; z++) {
        if (isOpen(x, y, z)) {
          grid[at(x, y, z)] = 'air';
          continue;
        }
        if (!exposed(x, y, z)) continue;
        const n = noise(seed + 7, x * 1.3 + z * 0.7, y * 1.6 + (x - z) * 0.3, 3);
        const low = y < 7;
        let key = n < 0.4 ? (low ? 'deep' : 'stone') : n < 0.6 ? 'andesite' : n < 0.8 ? 'tuff' : low ? 'deepCobble' : 'cobble';
        if (isOpen(x, y + 1, z) && !isOpen(x, y - 1, z) && noise(seed + 8, x, z, 4) > 0.68) key = 'gravel';
        else if (isOpen(x, y - 1, z) && hash(seed + 9, x * 31 + y, z) < 0.25) key = 'dripBlock';
        else if (y <= 5 && hash(seed + 10, x * 17 + y, z) < 0.05) key = 'moss';
        grid[at(x, y, z)] = key;
      }
    }
    yield;
  }
  // Ore deposits: start on exposed rock, grow into the rock around it. Richer the further from the lift.
  let deposits = 0;
  for (let x = -R + 1; x < R; x++) {
    for (let y = 1; y < TOP; y++) {
      for (let z = -R + 1; z < R; z++) {
        if (isOpen(x, y, z) || inside(GUARD, x, y, z) || !exposed(x, y, z) || hash(seed + 11, x * 97 + y, z) >= 0.022) continue;
        const t = Math.min(1, Math.hypot(x, z - mid) / (R + 16));
        const weights = weightsAt(level, t);
        let roll = hash(seed + 12, x, z * 31 + y) * weights.reduce((sum, [, v]) => sum + v, 0);
        let ore = weights[0][0];
        for (const [id, v] of weights) if ((roll -= v) < 0) {
          ore = id;
          break;
        }
        const size = 2 + Math.floor(hash(seed + 13, x, y * 7 + z) * 4);
        const cells = [[x, y, z]];
        for (let i = 0; i < cells.length && cells.length < size; i++) {
          const [cx, cy, cz] = cells[i];
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const [nx, ny, nz] = [cx + dx, cy + dy, cz + dz];
            if (cells.length >= size || isOpen(nx, ny, nz) || boundary(nx, ny, nz) || inside(GUARD, nx, ny, nz)) continue;
            if (hash(seed + 14, nx * 13 + ny, nz * 7 + i) < 0.6 && !cells.some(([a, b, c]) => a === nx && b === ny && c === nz)) cells.push([nx, ny, nz]);
          }
        }
        for (const [cx, cy, cz] of cells) set(cx, cy, cz, `ore_${ore}`);
        deposits++;
      }
    }
    if (x % 8 === 0) yield;
  }

  // The room: timber floor, the lift, lanterns.
  for (let x = ROOM.x[0]; x <= ROOM.x[1]; x++) for (let z = ROOM.z[0]; z <= ROOM.z[1]; z++) set(x, ROOM.y[0] - 1, z, 'plank');
  set(...LIFT, 'lift');
  const attached = [[-2, ROOM.y[1], mid, 'lantern'], [2, ROOM.y[1], mid, 'lantern']];
  // Cobwebs in tight corners, stalactites, spots creatures can be sent to.
  const spawns = [];
  for (let x = -R + 1; x < R; x++) {
    for (let y = 1; y < TOP; y++) {
      for (let z = -R + 1; z < R; z++) {
        if (get(x, y, z) !== 'air' || inside(GUARD, x, y, z)) continue;
        const solidAbove = !isOpen(x, y + 1, z);
        const solidBelow = !isOpen(x, y - 1, z);
        if (solidAbove && y >= 5 && hash(seed + 15, x * 5 + y, z) < 0.05) attached.push([x, y, z, 'drip']);
        else if (solidBelow) {
          const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !isOpen(x + dx, y, z + dz)).length;
          if (walls >= 2 && hash(seed + 16, x, y * 11 + z) < 0.025) set(x, y, z, 'web');
          else if (get(x, y + 1, z) === 'air' && Math.hypot(x, z - mid) > 10) spawns.push([x, y, z]);
        }
      }
    }
  }
  return { get, attached, spawns, deposits, top: TOP, half: R };
}

/**
 * Generator for system.runJob: builds the cave for `seed` around centre c, with a player standing in the lift room
 * (it is never filled). The rock goes in as big boxes around the room, then every column's tunnels, rock skin and
 * ores, then the hanging blocks. done(true, plan) when finished, done(false) if part of it is not loaded.
 * beforeFill() runs right before the rock goes in (to take away what is left in the old cave).
 */
export function* buildCave(dimension, c, seed, level, done, beforeFill = () => {}) {
  const B = blocks(level);
  const { R, guard: GUARD } = shape(level);
  const plan = yield* planCave(seed, level);
  const box = (x1, y1, z1, x2, y2, z2, key) =>
    dimension.fillBlocks(new BlockVolume({ x: c.x + x1, y: c.y + y1, z: c.z + z1 }, { x: c.x + x2, y: c.y + y2, z: c.z + z2 }), B[key]);
  try {
    // Solid rock everywhere except the room the player stands in (each fill stays below the 32768 block limit).
    const [gz] = GUARD.z;
    beforeFill();
    box(-R, 0, -R, R, 10, gz - 1, 'shell');
    box(-R, 11, -R, R, TOP, gz - 1, 'shell');
    box(-R, 0, gz, GUARD.x[0] - 1, TOP, R, 'shell');
    box(GUARD.x[1] + 1, 0, gz, R, TOP, R, 'shell');
    box(GUARD.x[0], 0, gz, GUARD.x[1], GUARD.y[0] - 1, R, 'shell');
    box(GUARD.x[0], GUARD.y[1] + 1, gz, GUARD.x[1], TOP, R, 'shell');
    yield;
    for (let x = -R; x <= R; x++) {
      for (let z = -R; z <= R; z++) {
        const room = inside({ x: GUARD.x, y: [0, TOP], z: GUARD.z }, x, 0, z);
        let start = 0;
        let key = plan.get(x, 0, z);
        for (let y = 1; y <= TOP + 1; y++) {
          const next = y <= TOP ? plan.get(x, y, z) : undefined;
          if (next === key) continue;
          // Around the room every block is written; elsewhere the rock is already there.
          if (room || key !== 'shell') box(x, start, z, x, y - 1, z, key);
          start = y;
          key = next;
        }
      }
      yield;
    }
    for (const [x, y, z, key] of [...plan.attached].sort((a, b) => b[1] - a[1])) {
      dimension.getBlock({ x: c.x + x, y: c.y + y, z: c.z + z })?.setPermutation(B[key]);
    }
  } catch {
    return done(false);
  }
  done(true, plan);
}

/** A few floor blocks under the arrival spot (the player's own chunk), placed before the real build. */
export function safetyFloor(dimension, c, level) {
  const { mid, room } = shape(level);
  const B = blocks(level);
  for (let x = -1; x <= 1; x++) for (let z = mid - 1; z <= mid + 1; z++) dimension.getBlock({ x: c.x + x, y: c.y + room.y[0] - 1, z: c.z + z })?.setPermutation(B.plank);
}

/** Where players arrive in a cave: in the lift room, looking down the north tunnel. */
export const caveArrival = (c, level) => ({ x: c.x + 0.5, y: c.y + shape(level).room.y[0], z: c.z + shape(level).mid + 0.5 });
export const caveLookAt = (c, level) => ({ x: c.x + 0.5, y: c.y + shape(level).room.y[0] + 1, z: c.z });
/** The largest cave box (for area checks). */
export const caveBounds = { half: Math.max(...CONFIG.expedition.levels.map((l) => l.half)), height: TOP };
