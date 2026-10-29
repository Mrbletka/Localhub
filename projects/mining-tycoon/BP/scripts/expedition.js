// Expeditions: the lift at the end of your mine's tunnel takes you down into a cave that is new every run. Your
// lantern's light is the clock: mine what you can and ride the lift back up before it runs out. Die down there (or
// leave the game) and everything you mined on that run is lost. Creatures come for you, more of them as the light
// fades. Back home the Ore Trader buys what you brought up.
import { world, system, EntityDamageCause } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, getJson, setJson, giveItem } from './lib/util.js';
import { activeSession, sessionsOf, plotAt, playSession } from './sessions.js';
import { buildCave, planCave, safetyFloor, caveArrival, caveLookAt } from './cave_builder.js';
import { addStat, pickTier, valueMultiplier } from './economy.js';
import { pickProblem, popup, popupUntil } from './mining.js';
import { fullScreenMenu, icon, travel } from './menu.js';

const NS = CONFIG.namespace;
const E = CONFIG.expedition;
const DIMENSION = CONFIG.plots.dimension;
const RUN_KEY = `${NS}:run`;
const CREATURE = `${NS}:creature`;
const ORES = new Map(CONFIG.ores.map((o) => [o.block, o]));
const RESOURCES = new Map(CONFIG.resources.map((r) => [r.id, r]));
const RESOURCE_ITEMS = new Map(CONFIG.resources.map((r) => [r.item, r]));
const DRILLS = new Set(CONFIG.generators.map((g) => g.block));
const QUIET = { showParticles: false };
const REACH = E.half * 2 + E.height; // getEntities radius around a cave centre that covers the whole box

/**
 * Expeditions underway: playerId -> { slot, cave, seed, level, light, haul, phase, glow, spawns, nextSpawn, dark }.
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
  if (Math.abs(x - c.x) > E.half + 1 || Math.abs(z - c.z) > E.half + 1) return;
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
  const { slot, cave, seed, level, light, haul, phase } = run;
  setJson(player, RUN_KEY, { slot, cave, seed, level, light, haul, phase });
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

/** A full-screen message with an OK button. */
function notice(player, body) {
  fullScreenMenu(player, { form: 'notice', body, buttons: [{ list: 'notice', text: 'OK', icon: icon('back'), run: () => {} }] });
}

/** Teleport into the run's cave and build its new layout around the player (behind the loading screen). */
function enterCave(player, run, done) {
  const dimension = world.getDimension(DIMENSION);
  const c = caveCenter(run.cave);
  const spot = caveArrival(c);
  player.addEffect('slow_falling', 600, QUIET);
  player.teleport({ ...spot, y: spot.y + 1.5 }, { dimension, facingLocation: caveLookAt(c) });
  let tries = 0;
  const over = () => !player.isValid || runs.get(player.id) !== run || run.phase !== 'building'; // died or left meanwhile
  const attempt = () => {
    if (over()) return done(false);
    try {
      safetyFloor(dimension, c); // something to stand on at once, even before the rest of the area has loaded
    } catch {
      // not loaded yet either - the build retries
    }
    const built = (ok, plan) => {
      if (over()) return done(false);
      if (!ok) return ++tries < 40 ? system.runTimeout(attempt, 5) : done(false); // not loaded yet
      clearCave(dimension, c);
      run.spawns = plan.spawns;
      player.removeEffect('slow_falling');
      if (player.location.y < spot.y - 0.5) player.teleport(spot, { dimension, facingLocation: caveLookAt(c) });
      done(true);
    };
    system.runJob(buildCave(dimension, c, run.seed, E.levels[run.level], built, () => clearCave(dimension, c)));
  };
  system.runTimeout(attempt, 2);
}

function descend(player) {
  const slot = activeSession(player);
  const record = slot === undefined ? undefined : sessionsOf(player.id)[slot];
  if (!record || runs.has(player.id)) return;
  const level = 0;
  const run = { slot, cave: record.index, seed: Math.floor(Math.random() * 2147483647), level, light: E.lightSeconds, haul: {}, phase: 'building', glow: '', spawns: [], nextSpawn: 0, dark: 0 };
  runs.set(player.id, run);
  save(player, run);
  travel(player, `Riding the lift down into the ${E.levels[level].name}...`, (done) => enterCave(player, run, done), (ok) => {
    if (runs.get(player.id) !== run || run.phase !== 'building') return; // died or left meanwhile
    if (!ok) {
      end(player);
      player.removeEffect('slow_falling');
      player.sendMessage('§cThe cave could not be loaded. Try the lift again.');
      return travel(player, 'Back to your mine...', (done) => playSession(player, slot, done), () => {});
    }
    run.phase = 'active';
    run.nextSpawn = system.currentTick + 200; // a moment of quiet before the first creature
    save(player, run);
    player.playSound('ambient.cave');
    player.onScreenDisplay.setTitle(`§6${E.levels[level].name}`, { subtitle: `Your light lasts ${clock(run.light)}`, fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
    player.sendMessage('§eMine what you can and get back to the lift before your light runs out. Die down here and your haul is lost.');
  });
}

function extract(player, run) {
  if (runs.get(player.id) !== run || run.phase !== 'active') return;
  const haul = run.haul;
  end(player); // made it to the lift: the haul is safe
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
  const run = { ...stored, glow: '', spawns: [], nextSpawn: system.currentTick + 100, dark: 0 };
  runs.set(player.id, run);
  system.runJob(
    (function* () {
      run.spawns = (yield* planCave(run.seed, E.levels[run.level])).spawns;
    })(),
  );
}

// ---- light and creatures ------------------------------------------------------------------------------------------

function hud(run) {
  const left = run.light / E.lightSeconds;
  const lit = Math.ceil(left * 12);
  const color = left > 0.3 ? '§e' : left > 0.1 ? '§6' : '§c';
  return `${color}Light ${clock(run.light)} ${'|'.repeat(lit)}§8${'|'.repeat(12 - lit)}  §fHaul ${haulCount(run.haul)}`;
}

/** Creatures come from spots 10-20 blocks away, one at a time, more of them (and faster) as the light fades. */
function sendCreatures(player, run, left) {
  if (system.currentTick < run.nextSpawn || !run.spawns.length) return;
  const c = caveCenter(run.cave);
  const dimension = player.dimension;
  const want = Math.min(E.maxCreatures, 1 + Math.floor((1 - left) * E.maxCreatures));
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
  const left = run.light / E.lightSeconds;
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
    player.onScreenDisplay.setTitle(`§6${clock(run.light)}`, { subtitle: '§7of light left', fadeInDuration: 5, stayDuration: 30, fadeOutDuration: 10 });
  } else if (run.light === 0 && run.dark === 1) {
    player.playSound('mob.warden.heartbeat');
    player.onScreenDisplay.setTitle('§cYour light is out', { subtitle: '§7Get to the lift!', fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  }
  sendCreatures(player, run, left);
  if (system.currentTick >= (popupUntil.get(player.id) ?? 0)) player.onScreenDisplay.setActionBar(hud(run));
  if (run.light % 5 === 0) save(player, run);
}

// ---- menus --------------------------------------------------------------------------------------------------------

function showDescend(player) {
  const level = E.levels[0];
  const tier = pickTier(player);
  const ores = CONFIG.ores.filter((o) => o.id in level.near || o.id in level.far);
  const can = ores.filter((o) => o.pick <= tier).map((o) => o.name);
  const next = ores.find((o) => o.pick > tier);
  const body =
    `§6Expedition: ${level.name}§r\n` +
    `A new cave every time. Your light lasts ${clock(E.lightSeconds)}: get back to this lift before it runs out.\n` +
    '§cDie down there and you lose everything you mined.\n' +
    `§7Your ${CONFIG.picks[tier - 1].name} mines ${can.join(', ') || 'nothing there'}.${next ? ` ${next.name} needs a ${CONFIG.picks[next.pick - 1].name}.` : ''}`;
  fullScreenMenu(player, {
    form: 'notice',
    body,
    buttons: [
      { list: 'notice', text: 'Descend\n§7Into the dark', icon: icon('expedition'), run: descend },
      { list: 'notice', text: 'Not now', icon: icon('back'), run: () => {} },
    ],
  });
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
  if (plot.owner !== player.id || plot.slot !== activeSession(player)) return player.sendMessage('§cUse the lift in your own mine.');
  showDescend(player);
}

/** Resources in the inventory, in config order: [{ res, amount }]. */
function carried(player) {
  const container = player.getComponent('minecraft:inventory')?.container;
  const counts = new Map();
  for (let i = 0; i < (container?.size ?? 0); i++) {
    const item = container.getItem(i);
    const res = item && RESOURCE_ITEMS.get(item.typeId);
    if (res) counts.set(res, (counts.get(res) ?? 0) + item.amount);
  }
  return CONFIG.resources.filter((r) => counts.has(r)).map((res) => ({ res, amount: counts.get(res) }));
}

/** Sell every resource (or only one kind) for sell x cash multiplier, into the active session. */
function sell(player, only) {
  if (activeSession(player) === undefined || runs.has(player.id)) return;
  const container = player.getComponent('minecraft:inventory')?.container;
  if (!container) return;
  let cash = 0;
  let count = 0;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    const res = item && RESOURCE_ITEMS.get(item.typeId);
    if (!res || (only && res !== only)) continue;
    cash += res.sell * item.amount;
    count += item.amount;
    container.setItem(i);
  }
  if (!count) return;
  cash *= valueMultiplier(player);
  const money = addStat(player, 'money', cash);
  player.playSound('random.orb');
  popup(player, `§a$${formatNumber(money)}  §e+$${formatNumber(cash)}`);
  player.sendMessage(`§aSold ${count} resource${count > 1 ? 's' : ''} for $${formatNumber(cash)}.`);
}

function showTrader(player) {
  if (activeSession(player) === undefined || runs.has(player.id)) return;
  const goods = carried(player);
  const multiplier = valueMultiplier(player);
  const price = (res, amount) => res.sell * amount * multiplier;
  const buttons = [];
  if (goods.length > 1) {
    const total = goods.reduce((sum, g) => sum + price(g.res, g.amount), 0);
    buttons.push({ list: 'notice', text: `Sell everything - $${formatNumber(total)}`, icon: icon('sell'), run: (p) => sell(p) });
  }
  for (const { res, amount } of goods) {
    buttons.push({ list: 'notice', text: `${amount} ${res.name} - $${formatNumber(price(res, amount))}\n§7$${formatNumber(res.sell * multiplier)} each`, icon: `textures/mining_tycoon/items/res_${res.id}`, run: (p) => sell(p, res) });
  }
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  const body = goods.length
    ? `§6Ore Trader§r\nI buy everything you bring up from the caves.${multiplier > 1 ? `\n§7Your cash bonus: x${+multiplier.toFixed(2)}` : ''}`
    : '§6Ore Trader§r\nNothing to sell yet. Bring resources up from an expedition: tap the lift at the end of the tunnel.';
  fullScreenMenu(player, { form: 'notice', body, buttons });
}

// ---- events -------------------------------------------------------------------------------------------------------

// The lift and the Ore Trader open their menus when tapped (before-events are read-only: the menu opens a tick later).
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block } = event;
  const type = block.typeId;
  if (type !== CONFIG.blocks.lift && type !== CONFIG.blocks.trader) return;
  event.cancel = true;
  if (!event.isFirstEvent) return;
  const dimensionId = block.dimension.id;
  const location = { ...block.location };
  system.run(() => (type === CONFIG.blocks.lift ? useLift(player, dimensionId, location) : showTrader(player)));
});

// In a cave only its explorer breaks blocks, and only ores (with a good enough pick).
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const cave = caveAt(event.dimension.id, event.block.location);
  if (cave === undefined) return;
  const player = event.player;
  const run = runs.get(player.id);
  const ore = ORES.get(event.block.typeId);
  let message;
  if (run?.cave !== cave || run.phase !== 'active') message = '§7This cave is not yours.';
  else if (!ore) message = '§7Only ores can be mined down here.';
  else message = pickProblem(event.itemStack, ore);
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
  popup(player, `§e+1 ${res.name}  §7Haul ${haulCount(run.haul)}`);
  player.playSound('random.pop', { volume: 0.6, pitch: 0.8 + ore.pick * 0.12 });
});

// Nothing can be built in a cave (drills are refused by main.js).
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  if (DRILLS.has(block.typeId) || block.isAir || caveAt(dimension.id, block.location) === undefined) return;
  const item = block.getItemStack(1);
  block.setType('minecraft:air');
  if (item) player.getComponent('minecraft:inventory')?.container?.addItem(item);
  player.onScreenDisplay.setActionBar('§7Nothing can be built down here.');
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
  player.sendMessage(lose(player, stored, 'You left the game during an expedition.').replace('\n', ' '));
  if (caveAt(player.dimension.id, player.location) !== undefined) playSession(player, stored.slot);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const run = runs.get(playerId);
  if (run) clearCreatures(run.cave);
  runs.delete(playerId); // the stored run stays: the haul is taken when they come back
});

world.afterEvents.worldLoad.subscribe(() => {
  // Picks and the tablet are never lost; the haul is taken on respawn instead of dropped.
  world.gameRules.keepInventory = true;
  for (const player of world.getAllPlayers()) {
    const stored = getJson(player, RUN_KEY, undefined);
    if (stored?.phase === 'building') {
      // The cave was still going up: back home, nothing was mined yet.
      lose(player, stored, '');
      playSession(player, stored.slot);
    } else if (stored?.phase === 'active') {
      if (caveAt(player.dimension.id, player.location) === stored.cave) resume(player, stored);
      else player.sendMessage(lose(player, stored, 'Your expedition ended.').replace('\n', ' '));
    }
  }
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const run = runs.get(player.id);
      if (run?.phase === 'active') burn(player, run);
    }
  }, 20);
});
