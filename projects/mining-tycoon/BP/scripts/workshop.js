// The workshop: three stations in the row on the landing, east of the tunnel. Every upgrade is crafted from money plus
// the bars and gems the machines make, so mining, the machines and the trader all feed the same progress:
// - Pickaxe Station: the next pick (mines harder ores) and drills (helpers that dig while you play).
// - Gear Bench: the lantern (more light per expedition) and the backpack (more haul per expedition).
// - Mine Cart: unlocks the next cave level.
// nextGoal() picks the next step for the tablet and the money bar, so there is always a clear thing to work towards.
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { activeSession, plotAt, onSessionEnter } from './sessions.js';
import { setStat, pickTier, lanternLevel, backpackLevel, cartLevel } from './economy.js';
import { pay, progressText } from './goods.js';
import { syncPick, rerollField } from './mining.js';
import { hasMachine } from './machines.js';
import { ownedDrills, giveDrill } from './drills.js';
import { fullScreenMenu, icon } from './menu.js';
import { toast } from './hud.js';
import { record } from './progress.js';

const W = CONFIG.workshop;
const LEVELS = CONFIG.expedition.levels;
const STATIONS = new Map(W.stations.map((s) => [s.block, s]));
const MACHINE = new Map(CONFIG.machines.map((m) => [m.id, m]));
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const pickIcon = (tier) => `textures/mining_tycoon/items/${CONFIG.picks[tier - 1].item.split(':')[1]}`;
const stationIcon = (s) => `textures/mining_tycoon/blocks/${s.block.split(':')[1]}_front`;
/** Ore names a pick tier can mine ("Coal, Copper and Iron"). */
const oresFor = (tier) => {
  const names = CONFIG.ores.filter((o) => o.id !== 'rock' && o.pick <= tier).map((o) => o.name.replace(' Ore', ''));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
};

// ---- goals --------------------------------------------------------------------------------------------------------

/** The order players are guided through. Each step: a pick tier, a machine, or a lantern / backpack / cart level. */
const ROUTE = [
  { pick: 2 }, { machine: 'smelter' }, { pick: 3 }, { lantern: 2 }, { backpack: 2 }, { machine: 'crusher' }, { pick: 4 }, { cart: 2 },
  { lantern: 3 }, { backpack: 3 }, { pick: 5 }, { machine: 'cutter' }, { cart: 3 }, { lantern: 4 }, { backpack: 4 }, { pick: 6 },
  { cart: 4 }, { lantern: 5 }, { backpack: 5 },
];

/** A step as { name, where, needs, target } - target: what the guide marker points at (see tutorial.js). */
function describe(step) {
  if (step.pick) return { name: CONFIG.picks[step.pick - 1].name, where: 'Pickaxe Station', needs: CONFIG.picks[step.pick - 1].needs, target: 'picks' };
  if (step.machine) {
    const m = MACHINE.get(step.machine);
    return { name: m.name, where: `${m.name} bay`, needs: { money: m.cost }, target: m.id };
  }
  if (step.lantern) return { name: `Lantern ${clock(W.lantern[step.lantern - 1].seconds)}`, where: 'Gear Bench', needs: W.lantern[step.lantern - 1].needs, target: 'gear' };
  if (step.backpack) return { name: `Backpack ${W.backpack[step.backpack - 1].size}`, where: 'Gear Bench', needs: W.backpack[step.backpack - 1].needs, target: 'gear' };
  return { name: LEVELS[step.cart - 1].name, where: 'Mine Cart', needs: LEVELS[step.cart - 1].needs, target: 'cart' };
}

function done(player, slot, step) {
  if (step.pick) return pickTier(player) >= step.pick;
  if (step.machine) return hasMachine(player, slot, step.machine);
  if (step.lantern) return lanternLevel(player) >= step.lantern;
  if (step.backpack) return backpackLevel(player) >= step.backpack;
  return cartLevel(player) >= step.cart;
}

/** The next step for the active session: { name, where, needs }, or undefined when everything is done. */
export function nextGoal(player) {
  const slot = activeSession(player);
  if (slot === undefined) return;
  const step = ROUTE.find((s) => !done(player, slot, s));
  return step && describe(step);
}

/** "Copper Pick at the Pickaxe Station: Copper Bar 1/4, $150" */
export const goalText = (player, goal) => `§e${goal.name}§7 at the ${goal.where}: ${progressText(player, goal.needs)}`;

function crafted(player, text) {
  player.playSound('random.anvil_use');
  player.playSound('random.levelup');
  toast(player, 'Crafted!', text, 4);
  try {
    player.spawnParticle('mining_tycoon:burst', { x: player.location.x, y: player.location.y + 1.2, z: player.location.z });
  } catch {
    // particle not available
  }
  record(player, 'crafted');
  const goal = nextGoal(player);
  player.sendMessage(`§a${text}${goal ? `\n§7Next: ${goalText(player, goal)}` : ''}`);
}

// ---- stations -----------------------------------------------------------------------------------------------------

function craftPick(player) {
  const tier = pickTier(player);
  const next = CONFIG.picks[tier];
  if (!next || !pay(player, next.needs)) return;
  setStat(player, 'pick', tier + 1);
  syncPick(player);
  rerollField(player);
  crafted(player, `${next.name}: mines ${oresFor(tier + 1)}.`);
}

function buildDrill(player, tier) {
  const slot = activeSession(player);
  if (ownedDrills(player.id, slot).length >= CONFIG.drills.max) return player.sendMessage(`§cYou have the most drills you can place (${CONFIG.drills.max}).`);
  if (!pay(player, tier.needs)) return;
  giveDrill(player, tier);
  crafted(player, `${tier.name}: place it on a drill pad (the light tiles on the west side).`);
}

function showPickStation(player, station) {
  const tier = pickTier(player);
  const next = CONFIG.picks[tier];
  const drill = CONFIG.drills.tiers.filter((t) => t.pick <= tier).at(-1);
  const firstDrill = CONFIG.drills.tiers[0];
  const lines = [`§6${station.name}§r`, `Your ${CONFIG.picks[tier - 1].name} mines ${oresFor(tier)}.`];
  lines.push(next ? `Next: the ${next.name} also mines ${CONFIG.ores.find((o) => o.pick === tier + 1)?.name ?? 'more'}.` : '§aYou have the best pick there is.');
  if (!drill) lines.push(`§7Drills unlock with the ${CONFIG.picks[firstDrill.pick - 1].name}.`);
  const buttons = [];
  if (next) buttons.push({ list: 'notice', text: `Craft the ${next.name}\n${progressText(player, next.needs)}`, icon: pickIcon(tier + 1), run: craftPick });
  if (drill) buttons.push({ list: 'notice', text: `Build a ${drill.name}\n${progressText(player, drill.needs)}`, icon: `textures/mining_tycoon/blocks/${drill.block.split(':')[1]}`, run: (p) => buildDrill(p, drill) });
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  fullScreenMenu(player, { form: 'notice', body: lines.join('\n'), buttons });
}

function craftGear(player, kind) {
  const levels = W[kind];
  const level = kind === 'lantern' ? lanternLevel(player) : backpackLevel(player);
  const next = levels[level];
  if (!next || !pay(player, next.needs)) return;
  setStat(player, kind, level + 1);
  crafted(player, kind === 'lantern' ? `Lantern: ${clock(next.seconds)} of light per expedition.` : `Backpack: ${next.size} items per expedition.`);
}

function showGearBench(player, station) {
  const lantern = lanternLevel(player);
  const backpack = backpackLevel(player);
  const nextLantern = W.lantern[lantern];
  const nextBackpack = W.backpack[backpack];
  const body =
    `§6${station.name}§r\nLantern: ${clock(W.lantern[lantern - 1].seconds)} of light. Backpack: ${W.backpack[backpack - 1].size} items.\n` +
    '§7More light: longer expeditions. Bigger backpack: more haul each run.';
  const buttons = [];
  if (nextLantern) buttons.push({ list: 'notice', text: `Lantern: ${clock(nextLantern.seconds)} of light\n${progressText(player, nextLantern.needs)}`, icon: icon('expedition'), run: (p) => craftGear(p, 'lantern') });
  if (nextBackpack) buttons.push({ list: 'notice', text: `Backpack: ${nextBackpack.size} items\n${progressText(player, nextBackpack.needs)}`, icon: icon('sell'), run: (p) => craftGear(p, 'backpack') });
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  fullScreenMenu(player, { form: 'notice', body, buttons });
}

function unlockLevel(player) {
  const level = cartLevel(player);
  const next = LEVELS[level];
  if (!next || !pay(player, next.needs)) return;
  setStat(player, 'cart', level + 1);
  crafted(player, `${next.name} unlocked: pick it at the lift.`);
}

function showCart(player, station) {
  const level = cartLevel(player);
  const next = LEVELS[level];
  const body =
    `§6${station.name}§r\nThe lift goes down to: ${LEVELS.slice(0, level).map((l) => l.name).join(', ')}.\n` +
    (next ? `Next: §e${next.name}§r - ${next.about}` : '§aEvery cave level is unlocked.');
  const buttons = [];
  if (next) buttons.push({ list: 'notice', text: `Unlock the ${next.name}\n${progressText(player, next.needs)}`, icon: stationIcon(station), run: unlockLevel });
  buttons.push({ list: 'notice', text: 'Close', icon: icon('back'), run: () => {} });
  fullScreenMenu(player, { form: 'notice', body, buttons });
}

const SHOW = { picks: showPickStation, gear: showGearBench, cart: showCart };

function openStation(player, dimensionId, location, station) {
  const plot = plotAt(dimensionId, location);
  if (!plot || plot.owner !== player.id || plot.slot !== activeSession(player)) return player.sendMessage('§cUse the workshop in your own mine.');
  SHOW[station.id](player, station);
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const station = STATIONS.get(event.block.typeId);
  if (!station) return;
  event.cancel = true;
  if (!event.isFirstEvent) return;
  const { player } = event;
  const dimensionId = event.block.dimension.id;
  const location = { ...event.block.location };
  system.run(() => openStation(player, dimensionId, location, station));
});

// The stations stand in every mine (they are part of the layout; this puts back any that are missing).
onSessionEnter((player, slot, c) => {
  let tries = 0;
  const attempt = () => {
    if (!player.isValid || activeSession(player) !== slot) return;
    try {
      const dimension = world.getDimension(CONFIG.plots.dimension);
      for (const s of W.stations) {
        const block = dimension.getBlock({ x: c.x + s.bay[0], y: c.y + s.bay[1], z: c.z + s.bay[2] });
        if (!block) throw new Error('not loaded');
        if (block.typeId !== s.block) block.setType(s.block);
      }
    } catch {
      if (++tries < 20) system.runTimeout(attempt, 10);
    }
  };
  attempt();
});
