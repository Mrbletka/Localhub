// Expeditions: the lift at the end of your mine's tunnel takes you down into a cave that is new every run. Your
// lantern's light is the clock: mine what you can and ride the lift back up before it runs out. Die down there (or
// leave the game) and everything you mined on that run is lost. Creatures come for you, more of them as the light
// fades. Back home the Ore Trader (trader.js) buys what you brought up, or the machines (machines.js) refine it.
import { world, system, EntityDamageCause } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, getJson, setJson, giveItem, hasRoom } from './lib/util.js';
import { eachPlayer, report } from './lib/safe.js';
import { activeSession, sessionsOf, plotAt, playSession } from './sessions.js';
import { buildCave, planCave, safetyFloor, caveArrival, caveLookAt, caveBounds, shape } from './cave_builder.js';
import { pickTier, valueMultiplier, lightSeconds, backpackSize, cartLevel } from './economy.js';
import { pickProblem, popup } from './mining.js';
import { showHud, toast, notify, forgetHud, pickup } from './hud.js';
import { record, records } from './progress.js';
import { fullScreenMenu, icon, travel } from './menu.js';

const NS = CONFIG.namespace;
const E = CONFIG.expedition;
const DIMENSION = CONFIG.plots.dimension;
const RUN_KEY = `${NS}:run`;
const CREATURE = `${NS}:creature`;
const ORES = new Map(CONFIG.ores.map((o) => [o.block, o]));
const RESOURCES = new Map(CONFIG.resources.map((r) => [r.id, r]));
const RESOURCE_ITEMS = new Map(CONFIG.resources.map((r) => [r.item, r]));
const DRILLS = new Set(CONFIG.drills.tiers.map((g) => g.block));
const QUIET = { showParticles: false };
const HALF = caveBounds.half; // the largest cave box
const REACH = HALF * 2 + E.height; // getEntities radius around a cave centre that covers the whole box

/**
 * Expeditions underway: playerId -> { slot, cave, seed, level, light, max, room, haul, phase, glow, spawns, nextSpawn, dark }.
 * level: index into CONFIG.expedition.levels. light / max: seconds left / at the start (lantern). room: backpack size.
 * light: seconds left. haul: { resourceId: count } mined on this run. phase: 'building' (the cave goes up), 'active',
 * 'dead' (waiting to respawn). The run is stored on the player too, so leaving the game mid-run still costs the haul.
 */
const runs = new Map();
const caveTag = (index) => `${NS}:cave_${index}`;

/** True while the player is on an expedition (the tablet and the money bar leave them alone). */
export const onExpedition = (player) => runs.has(player.id);

// ---- caves ------------------------------------------------------------------------------------------------------

/** Caves sit in their own grid: cave i (the plot index of the session) at origin + (i % perRow, i / perRow) x spacing. */
export function caveCenter(index) {
  return { x: E.origin.x + (index % E.perRow) * E.spacing, y: E.origin.y, z: E.origin.z + Math.floor(index / E.perRow) * E.spacing };
}

/** Index of the expedition cave whose box holds a location, or undefined. */
export function caveAt(dimensionId, { x, y, z }) {
  if (dimensionId !== DIMENSION || y < E.origin.y - 2 || y > E.origin.y + E.height + 3) return;
  const col = Math.round((x - E.origin.x) / E.spacing);
  const row = Math.round((z - E.origin.z) / E.spacing);
  if (col < 0 || col >= E.perRow || row < 0) return;
  const c = caveCenter(row * E.perRow + col);
  if (Math.abs(x - c.x) > HALF + 1 || Math.abs(z - c.z) > HALF + 1) return;
  return row * E.perRow + col;
}

/** Everything left in a cave that is not a player (creatures and items of an earlier run) goes. */
function clearCave(dimension, c) {
  for (const entity of dimension.getEntities({ location: c, maxDistance: REACH })) {
    if (entity.typeId !== 'minecraft:player' && caveAt(dimension.id, entity.location) !== undefined) entity.remove();
  }
}

function clearCreatures(index) {
  try {
    for (const entity of world.getDimension(DIMENSION).getEntities({ location: caveCenter(index), maxDistance: REACH, tags: [caveTag(index)] })) entity.remove();
  } catch {
    // not loaded: the next build clears the cave
  }
}

// ---- runs -------------------------------------------------------------------------------------------------------

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const haulCount = (haul) => Object.values(haul).reduce((n, v) => n + v, 0);
const haulText = (haul) =>
  Object.entries(haul).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${RESOURCES.get(id)?.name ?? id}`).join(', ') || 'nothing';
const haulValue = (haul, player) =>
  Object.entries(haul).reduce((sum, [id, n]) => sum + (RESOURCES.get(id)?.sell ?? 0) * n, 0) * valueMultiplier(player);

function save(player, run) {
  const { slot, cave, seed, level, light, max, room, easy, haul, phase } = run;
  setJson(player, RUN_KEY, { slot, cave, seed, level, light, max, room, easy, haul, phase });
}

function end(player) {
  runs.delete(player.id);
  player.setDynamicProperty(RUN_KEY, undefined);
}

function clearEffects(player) {
  for (const effect of ['night_vision', 'darkness', 'blindness', 'slow_falling']) player.removeEffect(effect);
}

/** Take what was mined on a run out of the inventory (as much of it as is still there). */
function takeHaul(player, haul) {
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return;
  const left = { ...haul };
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    const res = item && RESOURCE_ITEMS.get(item.typeId);
    if (!res || !(left[res.id] > 0)) continue;
    const take = Math.min(item.amount, left[res.id]);
    left[res.id] -= take;
    if (take === item.amount) container.setItem(i);
    else {
      item.amount -= take;
      container.setItem(i, item);
    }
  }
}

/** The run ends without extracting: the haul is gone. Returns the text for the notice. */
function lose(player, run, reason) {
  end(player);
  takeHaul(player, run.haul);
  clearCreatures(run.cave);
  clearEffects(player);
  return `§c${reason}§r\n${haulCount(run.haul) ? `You lost ${haulText(run.haul)}.` : 'You had not mined anything yet.'}`;
}

/** A lost run told on a card: lose() gives "reason\nwhat was lost". */
function lostToast(player, text) {
  const [title, line] = text.split('\n');
  toast(player, title.replace('§r', ''), line, 6);
}

/** A full-screen message with an OK button. */
function notice(player, body) {
  fullScreenMenu(player, { form: 'notice', body, buttons: [{ list: 'notice', text: 'OK', icon: icon('back'), run: () => {} }] });
}

/** Teleport into the run's cave and build its new layout around the player (behind the loading screen). */
function enterCave(player, run, done) {
  const dimension = world.getDimension(DIMENSION);
  const c = caveCenter(run.cave);
  const level = E.levels[run.level];
  const spot = caveArrival(c, level);
  player.addEffect('slow_falling', 600, QUIET);
  player.teleport({ ...spot, y: spot.y + 1.5 }, { dimension, facingLocation: caveLookAt(c, level) });
  let tries = 0;
  const over = () => !player.isValid || runs.get(player.id) !== run || run.phase !== 'building'; // died or left meanwhile
  const attempt = () => {
    if (over()) return done(false);
    try {
      safetyFloor(dimension, c, level); // something to stand on at once, even before the rest of the area has loaded
    } catch {
      // not loaded yet either - the build retries
    }
    const built = (ok, plan) => {
      if (over()) return done(false);
      if (!ok) return ++tries < 40 ? system.runTimeout(attempt, 5) : done(false); // not loaded yet
      clearCave(dimension, c);
      run.spawns = plan.spawns;
      player.removeEffect('slow_falling');
      if (player.location.y < spot.y - 0.5) player.teleport(spot, { dimension, facingLocation: caveLookAt(c, level) });
      done(true);
    };
    system.runJob(buildCave(dimension, c, run.seed, level, built, () => clearCave(dimension, c)));
  };
  system.runTimeout(attempt, 2);
}

function descend(player, level) {
  const slot = activeSession(player);
  const session = slot === undefined ? undefined : sessionsOf(player.id)[slot];
  if (!session || runs.has(player.id) || level >= cartLevel(player)) return;
  const light = lightSeconds(player);
  // The very first expedition of a session is a quiet one: fewer creatures, and later.
  const easy = !(records(player).expeditions > 0);
  const run = { slot, cave: session.index, seed: Math.floor(Math.random() * 2147483647), level, light, max: light, room: backpackSize(player), easy, haul: {}, phase: 'building', glow: '', spawns: [], nextSpawn: 0, dark: 0 };
  runs.set(player.id, run);
  save(player, run);
  travel(player, `Riding the lift down into the ${E.levels[level].name}...`, (done) => enterCave(player, run, done), (ok) => {
    if (runs.get(player.id) !== run || run.phase !== 'building') return; // died or left meanwhile
    if (!ok) {
      end(player);
      player.removeEffect('slow_falling');
      toast(player, '§cThe cave could not be loaded', 'Try the lift again.', 5);
      return travel(player, 'Back to your mine...', (done) => playSession(player, slot, done), () => {});
    }
    run.phase = 'active';
    run.nextSpawn = system.currentTick + (run.easy ? 800 : 200); // a moment of quiet before the first creature
    save(player, run);
    player.playSound('ambient.cave');
    toast(player, E.levels[level].name, `Your light lasts ${clock(run.light)}${run.easy ? ' - a quiet first trip' : ''}`, 4);
    record(player, 'expeditions');
    if (run.easy) toast(player, 'Get back to the lift in time', 'Before your light runs out - die down here and your haul is lost.', 4);
  });
}

function extract(player, run) {
  if (runs.get(player.id) !== run || run.phase !== 'active') return;
  const haul = run.haul;
  end(player); // made it to the lift: the haul is safe
  record(player, 'extracts');
  record(player, 'best_haul', haulCount(haul), 'max');
  record(player, 'deepest', run.level + 1, 'max');
  clearCreatures(run.cave);
  clearEffects(player);
  travel(player, 'Riding the lift up...', (done) => playSession(player, run.slot, done), () => {
    if (!haulCount(haul)) return notice(player, '§7Back home - empty-handed this time.');
    player.playSound('random.levelup');
    notice(player, `§aExpedition complete!§r\nYou brought home ${haulText(haul)}.\nThe Ore Trader on the landing pays about §a$${formatNumber(haulValue(haul, player))}§r for it.`);
  });
}

function giveUp(player) {
  const run = runs.get(player.id);
  if (!run || run.phase !== 'active') return;
  const text = lose(player, run, 'You gave up the expedition.');
  travel(player, 'Riding the lift up...', (done) => playSession(player, run.slot, done), () => notice(player, text));
}

/** After a script reload players are still down there: carry on (the creature spots come from the seed again). */
function resume(player, stored) {
  const run = { max: lightSeconds(player), room: backpackSize(player), ...stored, glow: '', spawns: [], nextSpawn: system.currentTick + 100, dark: 0 };
  runs.set(player.id, run);
  system.runJob(
    (function* () {
      run.spawns = (yield* planCave(run.seed, E.levels[run.level])).spawns;
    })(),
  );
}

// ---- light and creatures ------------------------------------------------------------------------------------------

/** The run HUD: light bar (10 segments), time left, haul and level. */
function hud(player, run) {
  const left = run.light / run.max;
  const color = left > 0.3 ? '§e' : left > 0.1 ? '§6' : '§c';
  const haul = haulCount(run.haul);
  const text = `${color}${clock(run.light)} §7light  ${haul >= run.room ? '§c' : '§f'}Haul ${haul}/${run.room}\n§7${E.levels[run.level].name}`;
  showHud(player, 'run', text, Math.ceil(left * 10));
}

/** The player's active cave run, for the guide marker: { liftFront } (in front of the cave lift), or undefined. */
export function cave(player) {
  const run = runs.get(player.id);
  if (run?.phase !== 'active') return;
  const c = caveCenter(run.cave);
  const { lift } = shape(E.levels[run.level]);
  return { liftFront: { x: c.x + lift[0] + 0.5, y: c.y + lift[1] + 1.2, z: c.z + lift[2] - 0.5 } };
}

/** Creatures come from spots 10-20 blocks away, one at a time, more of them (and faster) as the light fades. */
function sendCreatures(player, run, left) {
  if (system.currentTick < run.nextSpawn || !run.spawns.length) return;
  const c = caveCenter(run.cave);
  const dimension = player.dimension;
  const max = run.easy ? 2 : E.levels[run.level].maxCreatures;
  const want = Math.min(max, 1 + Math.floor((1 - left) * max));
  if (dimension.getEntities({ location: c, maxDistance: REACH, tags: [caveTag(run.cave)] }).length >= want) return;
  const p = player.location;
  const spots = run.spawns.filter(([x, y, z]) => {
    const d = Math.hypot(c.x + x + 0.5 - p.x, c.y + y - p.y, c.z + z + 0.5 - p.z);
    return d >= 10 && d <= 20;
  });
  if (!spots.length) return;
  const [x, y, z] = spots[Math.floor(Math.random() * spots.length)];
  const types = E.levels[run.level].creatures;
  try {
    const creature = dimension.spawnEntity(types[Math.floor(Math.random() * types.length)], { x: c.x + x + 0.5, y: c.y + y, z: c.z + z + 0.5 });
    creature.addTag(CREATURE);
    creature.addTag(caveTag(run.cave));
  } catch {
    // peaceful difficulty, or that spot is not loaded
  }
  run.nextSpawn = system.currentTick + Math.round((5 + 10 * left) * 20);
}

/**
 * Every second of a run: the light burns down. Night vision while it is bright; under 30 % it flickers (an effect
 * with less than 10 s left flickers) and the darkness pulses; under 10 % it is gone; at 0 blindness and damage that
 * grows until they extract or die.
 */
function burn(player, run) {
  if (caveAt(player.dimension.id, player.location) !== run.cave) {
    return notice(player, lose(player, run, 'You left the cave without the lift.'));
  }
  run.light = Math.max(0, run.light - 1);
  const left = run.light / run.max;
  const glow = run.light === 0 ? 'out' : left <= 0.1 ? 'dying' : left <= 0.3 ? 'flicker' : 'full';
  if (glow !== run.glow) {
    run.glow = glow;
    player.removeEffect('night_vision');
  }
  if (glow === 'full') player.addEffect('night_vision', 400, QUIET);
  else if (glow === 'flicker') {
    player.addEffect('night_vision', 160, QUIET);
    if (run.light % 9 === 0) player.addEffect('darkness', 60, QUIET);
  } else if (glow === 'dying') {
    if (run.light % 4 === 0) player.addEffect('darkness', 70, QUIET);
  } else {
    player.addEffect('blindness', 60, QUIET);
    player.applyDamage(1 + Math.floor(run.dark++ / 4), { cause: EntityDamageCause.magic });
  }
  if (run.light === 60 || run.light === 30 || run.light === 10) {
    player.playSound('note.bass', { pitch: 0.6 });
    toast(player, `${clock(run.light)} of light left`, run.light <= 10 ? 'Get to the lift now!' : 'Head back to the lift soon.', 2.5);
  } else if (run.light === 0 && run.dark === 1) {
    player.playSound('mob.warden.heartbeat');
    toast(player, '§cYour light is out', 'The dark hurts: get to the lift!', 4);
  }
  sendCreatures(player, run, left);
  hud(player, run);
  if (run.light % 5 === 0) save(player, run);
}

// ---- menus --------------------------------------------------------------------------------------------------------

/** The lift at home: the deepest two cave levels the Mine Cart has unlocked. */
function showDescend(player) {
  const unlocked = cartLevel(player);
  const tier = pickTier(player);
  const deepest = E.levels[unlocked - 1];
  const ores = CONFIG.ores.filter((o) => o.id in deepest.near || o.id in deepest.far);
  const can = ores.filter((o) => o.pick <= tier).map((o) => o.name.replace(' Ore', ''));
  const next = ores.find((o) => o.pick > tier);
  const body =
    `§6Expedition§r - a new cave every time. Light ${clock(lightSeconds(player))}, backpack ${backpackSize(player)} items.\n` +
    '§cDie down there and you lose what you mined on that run.\n' +
    `§7Your ${CONFIG.picks[tier - 1].name} mines ${can.join(', ') || 'nothing there'}.${next ? ` ${next.name} needs a ${CONFIG.picks[next.pick - 1].name}.` : ''}`;
  const buttons = [];
  for (let i = unlocked - 1; i >= Math.max(0, unlocked - 2); i--) {
    buttons.push({ list: 'notice', text: `${E.levels[i].name}\n§7${E.levels[i].about}`, icon: icon('expedition'), run: (p) => descend(p, i) });
  }
  buttons.push({ list: 'notice', text: 'Not now', icon: icon('back'), run: () => {} });
  fullScreenMenu(player, { form: 'notice', body, buttons });
}

function showExtract(player, run) {
  const value = haulValue(run.haul, player);
  fullScreenMenu(player, {
    form: 'notice',
    body: `§6Ride the lift up?§r\nHaul: ${haulText(run.haul)}${value > 0 ? ` §a(about $${formatNumber(value)})` : ''}\n§7Light left: ${clock(run.light)}`,
    buttons: [
      { list: 'notice', text: 'Extract\n§7Bring the haul home', icon: icon('extract'), run: (p) => extract(p, run) },
      { list: 'notice', text: 'Keep mining', icon: icon('back'), run: () => {} },
    ],
  });
}

/** The Miner's Tablet on an expedition: the run so far, and giving up (after a confirm page). */
export function showRunMenu(player) {
  const run = runs.get(player.id);
  if (run?.phase !== 'active') return;
  fullScreenMenu(player, {
    form: 'run',
    body: `§6${E.levels[run.level].name}§r\nLight ${clock(run.light)} - Haul: ${haulText(run.haul)}\n§7Get back to the lift to bring it home.`,
    buttons: [
      { list: 'run_top', text: 'Keep mining', icon: icon('back'), run: () => {} },
      { list: 'run_give_up', text: 'Yes, give up', icon: icon('exit'), run: giveUp },
    ],
  });
}

function useLift(player, dimensionId, location) {
  const run = runs.get(player.id);
  const cave = caveAt(dimensionId, location);
  if (cave !== undefined) {
    if (run?.cave === cave && run.phase === 'active') showExtract(player, run);
    return;
  }
  const plot = plotAt(dimensionId, location);
  if (!plot || run) return;
  if (plot.owner !== player.id || plot.slot !== activeSession(player)) return notify(player, '§cUse the lift in your own mine.');
  showDescend(player);
}

// ---- events -------------------------------------------------------------------------------------------------------

// The lift opens its menu when tapped (before-events are read-only: the menu opens a tick later).
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block } = event;
  if (block.typeId !== CONFIG.blocks.lift) return;
  event.cancel = true;
  if (!event.isFirstEvent) return;
  const dimensionId = block.dimension.id;
  const location = { ...block.location };
  system.run(() => useLift(player, dimensionId, location));
});

// In a cave only its explorer breaks blocks, and only ores (with a good enough pick).
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const cave = caveAt(event.dimension.id, event.block.location);
  if (cave === undefined) return;
  const player = event.player;
  let message;
  try {
    const run = runs.get(player.id);
    const ore = ORES.get(event.block.typeId);
    const res = ore && RESOURCES.get(ore.id);
    if (run?.cave !== cave || run.phase !== 'active') message = '§7This cave is not yours.';
    else if (!ore) message = '§7Only ores can be mined down here.';
    else if (haulCount(run.haul) >= run.room) message = `§cYour backpack is full (${run.room}): get back to the lift! The Gear Bench makes it bigger.`;
    else message = pickProblem(event.itemStack, ore) ?? (res && !hasRoom(player, res.item) ? '§cYour inventory is full: make room or extract.' : undefined);
  } catch {
    message = '§7Try again in a moment.'; // never let an error turn into a free break
  }
  if (!message) return;
  event.cancel = true;
  system.run(() => popup(player, message));
});

// Ores in a cave give resource items (they are the haul).
world.afterEvents.playerBreakBlock.subscribe(({ player, block, dimension, brokenBlockPermutation }) => {
  const ore = ORES.get(brokenBlockPermutation.type.id);
  const res = ore && RESOURCES.get(ore.id);
  const run = runs.get(player.id);
  if (!res || run?.phase !== 'active' || caveAt(dimension.id, block.location) !== run.cave) return;
  giveItem(player, res.item);
  run.haul[res.id] = (run.haul[res.id] ?? 0) + 1;
  save(player, run);
  pickup(player, res.name, `  §7Haul ${haulCount(run.haul)}/${run.room}`);
  player.playSound('random.pop', { volume: 0.6, pitch: 0.8 + ore.pick * 0.12 });
  hud(player, run);
  record(player, `mined_${res.id}`);
  record(player, 'mined');
});

// Nothing can be built in a cave (drills are refused by main.js).
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  if (DRILLS.has(block.typeId) || block.isAir || caveAt(dimension.id, block.location) === undefined) return;
  const item = block.getItemStack(1);
  block.setType('minecraft:air');
  if (item) player.getComponent('minecraft:inventory')?.container?.addItem(item);
  popup(player, '§7Nothing can be built down here.');
});

// Caves and mines are dark: monsters that spawn there by themselves are removed, only the expedition's creatures
// stay. Creature drops don't belong in the caves either.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!entity.isValid || entity.typeId === 'minecraft:player') return;
  const dimensionId = entity.dimension.id;
  const inCave = caveAt(dimensionId, entity.location) !== undefined;
  if (!inCave && !plotAt(dimensionId, entity.location)) return;
  if (entity.typeId === 'minecraft:item') {
    if (inCave && !entity.getComponent('minecraft:item')?.itemStack?.typeId.startsWith(`${NS}:`)) entity.remove();
  } else if (!entity.hasTag(CREATURE) && entity.matches({ families: ['monster'] })) entity.remove();
});

world.afterEvents.entityDie.subscribe(
  ({ deadEntity: player }) => {
    const run = runs.get(player.id);
    if (!run) return;
    run.phase = 'dead'; // the haul is taken when they respawn
    save(player, run);
    clearCreatures(run.cave);
    record(player, 'deaths');
  },
  { entityTypes: ['minecraft:player'] },
);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  const stored = getJson(player, RUN_KEY, undefined);
  if (!stored) return;
  if (!initialSpawn) {
    if ((runs.get(player.id) ?? stored).phase === 'dead') notice(player, lose(player, runs.get(player.id) ?? stored, 'The dark took you!'));
    return;
  }
  // Left the game during an expedition: the haul is lost, and they are out of the dark at once (the start menu
  // shows over it).
  runs.delete(player.id);
  lostToast(player, lose(player, stored, 'You left the game during an expedition.'));
  if (caveAt(player.dimension.id, player.location) !== undefined) playSession(player, stored.slot);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const run = runs.get(playerId);
  if (run) clearCreatures(run.cave);
  runs.delete(playerId); // the stored run stays: the haul is taken when they come back
  forgetHud(playerId);
});

world.afterEvents.worldLoad.subscribe(() => {
  // Picks and the tablet are never lost; the haul is taken on respawn instead of dropped.
  try {
    world.gameRules.keepInventory = true;
  } catch (error) {
    report('keepInventory', error);
  }
  for (const player of world.getAllPlayers()) {
    const stored = getJson(player, RUN_KEY, undefined);
    if (stored?.phase === 'building') {
      // The cave was still going up: back home, nothing was mined yet.
      lose(player, stored, '');
      playSession(player, stored.slot);
    } else if (stored?.phase === 'active') {
      if (caveAt(player.dimension.id, player.location) === stored.cave) resume(player, stored);
      else lostToast(player, lose(player, stored, 'Your expedition ended.'));
    }
  }
  system.runInterval(() => {
    eachPlayer('expedition', (player) => {
      const run = runs.get(player.id);
      if (run?.phase === 'active') burn(player, run);
    });
  }, 20);
});
