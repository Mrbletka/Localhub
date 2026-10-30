// Machines: a Smelter, a Crusher and a Gem Cutter, each in its own bay on the landing of every mine. A machine is built
// once per session (tap its empty bay), loaded with what you carry, and works one item at a time while you play that
// session - in the mine or out on an expedition. Tap it again to collect what is done. Speed upgrades make every item
// faster. Rebirth takes the machines down again (what was in them comes back to the inventory).
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, getJson, setJson, giveItem } from './lib/util.js';
import { activeSession, sessionKey, sessionsOf, plotAt, plotCenter, onSessionEnter, onSessionDelete } from './sessions.js';
import { stat, addStat } from './economy.js';
import { fullScreenMenu, icon } from './menu.js';

const GOODS = new Map([...CONFIG.resources, ...CONFIG.products].map((g) => [g.id, g]));
const BY_ITEM = new Map([...GOODS.values()].map((g) => [g.item, g]));
const MACHINES = CONFIG.machines;
const FRAME = CONFIG.machineFrame;
const BAY_BLOCKS = new Set([FRAME, ...MACHINES.flatMap((m) => [m.block, `${m.block}_on`])]);
/** Barrels of the first landing layout that stood where the bays are now (taken away when the bays are set up). */
const OLD_BARRELS = [[-5, 1, 11], [-5, 1, 10]];
const PARTICLES = { smelter: 'minecraft:basic_smoke_particle', crusher: 'minecraft:basic_crit_particle', cutter: 'minecraft:villager_happy' };

const goodName = (id) => GOODS.get(id)?.name ?? id;
const itemIcon = (id) => `textures/mining_tycoon/items/${GOODS.get(id)?.item.split(':')[1]}`;
const machineIcon = (m) => `textures/mining_tycoon/blocks/${m.block.split(':')[1]}_front`;
const count = (map) => Object.values(map).reduce((n, v) => n + v, 0);
const list = (map) => Object.entries(map).filter(([, n]) => n > 0).map(([id, n]) => `${n} ${goodName(id)}`).join(', ');
const secondsText = (s) => `${+s.toFixed(1)} s`;
export const upgradeCost = (m, level) => Math.floor(m.upgradeCost * CONFIG.machineUpgradeGrowth ** (level - 1));

// ---- state ------------------------------------------------------------------------------------------------------

/**
 * Machines of a session (player property "s<slot>:machines"): { machineId: { level, in, out, fuel, work, idle } }.
 * in / out: { goodId: count }; fuel: items it can still smelt; work: seconds into the current item; idle: why it
 * stopped (already told). Cached per player and slot; written through on every change.
 */
const cache = new Map();
const cacheKey = (playerId, slot) => `${playerId}:${slot}`;

function machinesOf(player, slot) {
  const key = cacheKey(player.id, slot);
  if (!cache.has(key)) cache.set(key, getJson(player, sessionKey(slot, 'machines'), {}));
  return cache.get(key);
}

const save = (player, slot) => setJson(player, sessionKey(slot, 'machines'), machinesOf(player, slot));

/** True when the session has built that machine. */
export const hasMachine = (player, slot, id) => !!machinesOf(player, slot)[id];

/** The good of every stack in the inventory: [{ slot, item, good }]. */
function stacks(player) {
  const container = player.getComponent('minecraft:inventory')?.container;
  const out = [];
  for (let i = 0; i < (container?.size ?? 0); i++) {
    const item = container.getItem(i);
    const good = item && BY_ITEM.get(item.typeId);
    if (good) out.push({ index: i, item, good });
  }
  return out;
}

/** Take up to `amount` of a good out of the inventory; returns how many were taken. */
function take(player, goodId, amount) {
  const container = player.getComponent('minecraft:inventory')?.container;
  let taken = 0;
  for (const { index, item, good } of stacks(player)) {
    if (good.id !== goodId || taken >= amount) continue;
    const n = Math.min(item.amount, amount - taken);
    taken += n;
    if (n === item.amount) container.setItem(index);
    else {
      item.amount -= n;
      container.setItem(index, item);
    }
  }
  return taken;
}

function give(player, goods) {
  for (const [id, n] of Object.entries(goods)) {
    const good = GOODS.get(id);
    for (let left = n; good && left > 0; left -= 64) giveItem(player, good.item, Math.min(64, left));
  }
}

// ---- the mine's bays ---------------------------------------------------------------------------------------------

const bayLocation = (c, m) => ({ x: c.x + m.bay[0], y: c.y + m.bay[1], z: c.z + m.bay[2] });

/** True while a machine has something to do (and fuel for it). */
const working = (m, s) => !!s && count(s.in) > 0 && !(m.fuel && !(s.fuel > 0));

/**
 * Show the session's machines in the bays of its mine: an empty bay is a frame, a machine at work is its animated
 * "_on" block. cleanup also takes away the barrels of the first landing layout. Returns false when not loaded.
 */
export function syncBays(player, slot, c, cleanup = false) {
  const dimension = world.getDimension(CONFIG.plots.dimension);
  const machines = machinesOf(player, slot);
  try {
    for (const m of MACHINES) {
      const block = dimension.getBlock(bayLocation(c, m));
      if (!block) return false;
      const s = machines[m.id];
      const want = !s ? FRAME : working(m, s) ? `${m.block}_on` : m.block;
      if (block.typeId !== want) block.setType(want);
    }
    for (const [x, y, z] of cleanup ? OLD_BARRELS : []) {
      const block = dimension.getBlock({ x: c.x + x, y: c.y + y, z: c.z + z });
      if (block?.typeId === 'minecraft:barrel') block.setType('minecraft:air');
    }
  } catch {
    return false; // chunk not loaded yet
  }
  return true;
}

/** The machine whose bay is at a location in the player's active mine, or undefined. */
function bayAt(player, dimensionId, location) {
  const plot = plotAt(dimensionId, location);
  if (!plot || plot.owner !== player.id || plot.slot !== activeSession(player)) return;
  const c = plotCenter(plot.index);
  return MACHINES.find((m) => location.x - c.x === m.bay[0] && location.y - c.y === m.bay[1] && location.z - c.z === m.bay[2]);
}

// ---- work ---------------------------------------------------------------------------------------------------------

/** One second of work. Returns 'changed', 'done' (the last item finished), 'fuel' (out of coal) or undefined. */
function tick(m, s) {
  const next = () => m.recipes.find((r) => s.in[r.in] > 0);
  if (!next()) return;
  if (m.fuel && !(s.fuel > 0)) {
    if (s.idle === 'fuel') return;
    s.idle = 'fuel';
    return 'fuel';
  }
  s.idle = undefined;
  s.work += 1;
  const time = m.seconds[s.level - 1];
  while (s.work >= time) {
    const r = next();
    if (!r || (m.fuel && !(s.fuel > 0))) break;
    s.in[r.in] -= 1;
    if (!s.in[r.in]) delete s.in[r.in];
    s.out[r.out] = (s.out[r.out] ?? 0) + (r.count ?? 1);
    if (m.fuel) s.fuel -= 1;
    s.work -= time;
  }
  if (next()) return 'changed';
  s.work = 0;
  return 'done';
}

/** Seconds until everything loaded is done (ignoring fuel). */
const timeLeft = (m, s) => Math.max(0, count(s.in) * m.seconds[s.level - 1] - s.work);
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.ceil(seconds % 60)).padStart(2, '0')}`;

// ---- menus --------------------------------------------------------------------------------------------------------

/** What "Load" would put in: every accepted good the player carries, plus just enough coal to smelt it all. */
function loadPlan(player, m, s) {
  const accepted = new Set(m.recipes.map((r) => r.in));
  const plan = {};
  for (const { item, good } of stacks(player)) if (accepted.has(good.id)) plan[good.id] = (plan[good.id] ?? 0) + item.amount;
  let fuel = 0;
  if (m.fuel) {
    const carried = stacks(player).filter((x) => x.good.id === m.fuel.id).reduce((n, x) => n + x.item.amount, 0);
    const needed = Math.max(0, Math.ceil((count(s.in) + count(plan) - (s.fuel ?? 0)) / m.fuel.items));
    fuel = Math.min(carried, needed);
  }
  return { plan, fuel };
}

function build(player, slot, m) {
  const machines = machinesOf(player, slot);
  if (machines[m.id] || activeSession(player) !== slot) return;
  if (stat(player, 'money') < m.cost) return player.sendMessage(`§cThe ${m.name} costs §a$${formatNumber(m.cost)}§c (you have $${formatNumber(stat(player, 'money'))}).`);
  addStat(player, 'money', -m.cost);
  machines[m.id] = { level: 1, in: {}, out: {}, fuel: 0, work: 0 };
  save(player, slot);
  syncBays(player, slot, plotCenter(sessionsOf(player.id)[slot].index));
  player.playSound('random.anvil_use');
  player.sendMessage(`§aYour ${m.name} is ready! Tap it to load it.`);
}

function load(player, slot, m) {
  const s = machinesOf(player, slot)[m.id];
  if (!s || activeSession(player) !== slot) return;
  const { plan, fuel } = loadPlan(player, m, s);
  let loaded = 0;
  for (const [id, n] of Object.entries(plan)) {
    const got = take(player, id, n);
    if (got) s.in[id] = (s.in[id] ?? 0) + got;
    loaded += got;
  }
  if (fuel) s.fuel = (s.fuel ?? 0) + take(player, m.fuel.id, fuel) * m.fuel.items;
  s.idle = undefined;
  save(player, slot);
  player.playSound('random.pop');
  if (loaded) player.sendMessage(`§aLoaded ${loaded} into the ${m.name}: done in about ${clock(timeLeft(m, s))}.`);
}

function collect(player, slot, m) {
  const s = machinesOf(player, slot)[m.id];
  if (!s || !count(s.out) || activeSession(player) !== slot) return;
  const goods = s.out;
  s.out = {};
  save(player, slot);
  give(player, goods);
  player.playSound('random.orb');
  player.sendMessage(`§aCollected ${list(goods)}.`);
}

function upgrade(player, slot, m) {
  const s = machinesOf(player, slot)[m.id];
  if (!s || s.level >= m.seconds.length || activeSession(player) !== slot) return;
  const cost = upgradeCost(m, s.level);
  if (stat(player, 'money') < cost) return player.sendMessage(`§cYou need §a$${formatNumber(cost)}§c (you have $${formatNumber(stat(player, 'money'))}).`);
  addStat(player, 'money', -cost);
  s.level += 1;
  save(player, slot);
  player.playSound('random.levelup');
  player.sendMessage(`§a${m.name} level ${s.level}: ${secondsText(m.seconds[s.level - 1])} per item.`);
}

function showBuild(player, slot, m) {
  fullScreenMenu(player, {
    form: 'notice',
    body: `§6Machine bay: ${m.name}§r\n${m.about}\n§7Works while you play this session, also on expeditions.`,
    buttons: [
      { list: 'notice', text: `Build the ${m.name} - $${formatNumber(m.cost)}`, icon: machineIcon(m), run: (p) => build(p, slot, m) },
      { list: 'notice', text: 'Not now', icon: icon('back'), run: () => {} },
    ],
  });
}

function showMachine(player, slot, m) {
  const s = machinesOf(player, slot)[m.id];
  const time = m.seconds[s.level - 1];
  const lines = [`§6${m.name}§r - level ${s.level}, ${secondsText(time)} per item`];
  lines.push(count(s.in) ? `Working: ${list(s.in)} (${clock(timeLeft(m, s))} left)` : '§7Empty: load it with what you carry.');
  if (m.fuel) lines.push(`${s.fuel > 0 ? '§7' : '§c'}Fuel: ${s.fuel ?? 0} item${s.fuel === 1 ? '' : 's'} (1 Coal Chunk smelts ${m.fuel.items})`);
  if (count(s.out)) lines.push(`§aReady: ${list(s.out)}`);
  const buttons = [];
  if (count(s.out)) {
    const [first] = Object.keys(s.out);
    buttons.push({ list: 'notice', text: `Collect ${count(s.out)} item${count(s.out) > 1 ? 's' : ''}`, icon: itemIcon(first), run: (p) => collect(p, slot, m) });
  }
  const { plan, fuel } = loadPlan(player, m, s);
  if (count(plan) || fuel) {
    const what = [list(plan), fuel ? `${fuel} ${goodName(m.fuel.id)} (fuel)` : ''].filter(Boolean).join(', ');
    buttons.push({ list: 'notice', text: `Load ${count(plan) + fuel}\n§7${what}`, icon: itemIcon(Object.keys(plan)[0] ?? m.fuel.id), run: (p) => load(p, slot, m) });
  }
  if (s.level < m.seconds.length) {
    const cost = upgradeCost(m, s.level);
    buttons.push({ list: 'notice', text: `Speed: level ${s.level + 1} - $${formatNumber(cost)}\n§7${secondsText(time)} -> ${secondsText(m.seconds[s.level])} per item`, icon: icon('upgrades'), run: (p) => upgrade(p, slot, m) });
  }
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  fullScreenMenu(player, { form: 'notice', body: lines.join('\n'), buttons });
}

function openBay(player, dimensionId, location) {
  const m = bayAt(player, dimensionId, location);
  const slot = activeSession(player);
  if (!m) return player.sendMessage('§cUse the machines in your own mine.');
  if (machinesOf(player, slot)[m.id]) showMachine(player, slot, m);
  else showBuild(player, slot, m);
}

// ---- hooks --------------------------------------------------------------------------------------------------------

/** Rebirth: the session's machines go (their contents come back to the inventory) and the bays are empty again. */
export function resetMachines(player, slot) {
  const machines = machinesOf(player, slot);
  for (const m of MACHINES) {
    const s = machines[m.id];
    if (!s) continue;
    give(player, s.in);
    give(player, s.out);
    if (m.fuel && s.fuel >= m.fuel.items) give(player, { [m.fuel.id]: Math.floor(s.fuel / m.fuel.items) });
    delete machines[m.id];
  }
  save(player, slot);
  const plot = plotAt(player.dimension.id, player.location);
  if (plot?.owner === player.id && plot.slot === slot) syncBays(player, slot, plotCenter(plot.index));
}

// Tapping a bay: build its machine, or open it.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block } = event;
  if (!BAY_BLOCKS.has(block.typeId)) return;
  event.cancel = true;
  if (!event.isFirstEvent) return;
  const dimensionId = block.dimension.id;
  const location = { ...block.location };
  system.run(() => openBay(player, dimensionId, location));
});

// Arriving in a session's mine: its bays show its machines (retried while the mine is still loading).
onSessionEnter((player, slot, c) => {
  let tries = 0;
  const attempt = () => {
    if (player.isValid && activeSession(player) === slot && !syncBays(player, slot, c, true) && ++tries < 20) system.runTimeout(attempt, 10);
  };
  attempt();
});

onSessionDelete((playerId, slot) => cache.delete(cacheKey(playerId, slot)));

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  for (const key of [...cache.keys()]) if (key.startsWith(`${playerId}:`)) cache.delete(key);
});

world.afterEvents.worldLoad.subscribe(() => {
  // Every second the machines of each player's active session work one second.
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const slot = activeSession(player);
      if (slot === undefined) continue;
      const machines = machinesOf(player, slot);
      let changed = false;
      for (const m of MACHINES) {
        const s = machines[m.id];
        const result = s && tick(m, s);
        if (!result) continue;
        changed = true;
        if (result === 'done') player.sendMessage(`§aYour ${m.name} is done: ${list(s.out)} ready to collect.`);
        if (result === 'fuel') player.sendMessage(`§eYour ${m.name} is out of fuel: load Coal Chunks to keep it going.`);
      }
      if (changed) save(player, slot);
      // The bays show which machines are at work (only while the mine is loaded around its owner).
      const plot = plotAt(player.dimension.id, player.location);
      if (plot?.owner === player.id && plot.slot === slot) syncBays(player, slot, plotCenter(plot.index));
    }
  }, 20);

  // Working machines smoke and sparkle (only in the mine their owner stands in).
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
      const slot = activeSession(player);
      const plot = slot === undefined ? undefined : plotAt(player.dimension.id, player.location);
      if (plot?.owner !== player.id || plot.slot !== slot) continue;
      const c = plotCenter(plot.index);
      const machines = machinesOf(player, slot);
      for (const m of MACHINES) {
        const s = machines[m.id];
        if (!s || !count(s.in) || s.idle) continue;
        const at = bayLocation(c, m);
        try {
          player.dimension.spawnParticle(PARTICLES[m.id] ?? 'minecraft:villager_happy', { x: at.x + 0.5, y: at.y + 1.1, z: at.z + 0.5 });
        } catch {
          // not loaded
        }
      }
    }
  }, 30);
});
