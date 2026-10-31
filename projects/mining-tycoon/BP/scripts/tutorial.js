// The guide: a quest chain for a new session (CONFIG.quests, each with a money reward), then the workshop route
// (workshop.js nextGoal). Whatever is next shows in the HUD and gets a marker: gold sparkles over the place to go,
// seen only by that player. Sessions that are already past the beginning (Copper Pick, Smelter or a rebirth) skip it.
import { world, system } from '@minecraft/server';
import { CONFIG } from './config.js';
import { formatNumber, setNumber } from './lib/util.js';
import { eachPlayer } from './lib/safe.js';
import { activeSession, sessionKey, plotAt, plotCenter } from './sessions.js';
import { stat, addStat, pickTier } from './economy.js';
import { progressText, progressRatio } from './goods.js';
import { hasMachine } from './machines.js';
import { nextGoal } from './workshop.js';
import { records, onRecord } from './progress.js';
import { toast } from './hud.js';
import { cave } from './expedition.js';

const QUESTS = CONFIG.quests;
const STATION = new Map(CONFIG.workshop.stations.map((s) => [s.id, s.bay]));
const MACHINE = new Map(CONFIG.machines.map((m) => [m.id, m.bay]));
const V = CONFIG.mine.vein;

/** Index of the session's current quest (QUESTS.length when the tutorial is done). */
function questIndex(player) {
  const slot = activeSession(player);
  if (slot === undefined) return QUESTS.length;
  const key = sessionKey(slot, 'quest');
  let index = player.getDynamicProperty(key);
  if (typeof index !== 'number') {
    // Sessions from before the tutorial that are already on their way don't start it.
    const veteran = pickTier(player) >= 3 || stat(player, 'rebirths') > 0 || hasMachine(player, slot, 'smelter');
    index = setNumber(player, key, veteran ? QUESTS.length : 0);
  }
  return index;
}

const progress = (player, q) => (q.count ? Math.min(q.goal, records(player)[q.count] ?? 0) : 0);
const questDone = (player, q) =>
  q.count ? progress(player, q) >= q.goal : q.pick ? pickTier(player) >= q.pick : q.machine ? hasMachine(player, activeSession(player), q.machine) : false;

/** The current quest { text, target, ... } or undefined. */
export function currentQuest(player) {
  return QUESTS[questIndex(player)];
}

/** Hand out every quest that is done (one after the other), with its reward. */
function check(player) {
  const slot = activeSession(player);
  if (slot === undefined) return;
  let index = questIndex(player);
  while (index < QUESTS.length && questDone(player, QUESTS[index])) {
    const q = QUESTS[index];
    index = setNumber(player, sessionKey(slot, 'quest'), index + 1);
    addStat(player, 'money', q.reward);
    player.playSound('random.levelup');
    try {
      player.spawnParticle('mining_tycoon:burst', { x: player.location.x, y: player.location.y + 1.2, z: player.location.z });
    } catch {
      // particle not available
    }
    const next = QUESTS[index];
    toast(player, `Quest ${index}/${QUESTS.length} done! +$${formatNumber(q.reward)}`, next ? `Next: ${next.text}` : 'Tutorial complete - follow the tablet goals!', 4);
  }
}

/** The HUD lines under the money: the quest, or the next goal with its progress. */
export function guideLines(player) {
  const index = questIndex(player);
  const q = QUESTS[index];
  const goal = nextGoal(player);
  if (q) {
    // How far along (0..1, the HUD's progress bar): counted quests by their count, craft / build quests by what the
    // matching workshop goal still needs.
    const ratio = q.count ? progress(player, q) / q.goal : goal?.target === q.target ? progressRatio(player, goal.needs) : 0;
    return [`§bQuest ${index + 1}/${QUESTS.length}: §f${q.text}`, q.count ? `§7Progress ${progress(player, q)}/${q.goal} - reward $${formatNumber(q.reward)}` : `§7Reward $${formatNumber(q.reward)}`, ratio];
  }
  if (!goal) return ['§aEverything is crafted.', '§7Rebirth from the tablet for a sell bonus and a star.', 1];
  return [`§7Next: §f${goal.name}§7 at the ${goal.where}`, progressText(player, goal.needs), progressRatio(player, goal.needs)];
}

/** Where the marker goes: relative to the plot centre, or 'cave_lift' for the lift room of the player's cave. */
function targetSpot(target) {
  if (target === 'vein') return { x: (V.x[0] + V.x[1]) / 2 + 0.5, y: V.y[1] + 1.3, z: V.z[1] + 1.5 };
  if (target === 'trader') return { x: CONFIG.mine.trader[0] + 0.5, y: CONFIG.mine.trader[1] + 2.2, z: CONFIG.mine.trader[2] + 0.5 };
  if (target === 'lift') return { x: 0.5, y: 3.4, z: 14.5 };
  const bay = STATION.get(target) ?? MACHINE.get(target);
  return bay && { x: bay[0] + 0.5, y: bay[1] + 1.4, z: bay[2] + 0.5 };
}

function mark(player) {
  const q = currentQuest(player);
  const target = q ? q.target : nextGoal(player)?.target;
  if (!target) return;
  let at;
  if (target === 'cave_lift') at = cave(player)?.liftFront;
  else {
    const plot = plotAt(player.dimension.id, player.location);
    if (plot?.owner !== player.id || plot.slot !== activeSession(player)) return;
    const c = plotCenter(plot.index);
    const spot = targetSpot(target);
    at = spot && { x: c.x + spot.x, y: c.y + spot.y, z: c.z + spot.z };
  }
  if (!at) return;
  try {
    player.spawnParticle('mining_tycoon:guide', at);
  } catch {
    // not loaded there (yet)
  }
}

onRecord((player) => check(player));

world.afterEvents.worldLoad.subscribe(() => {
  system.runInterval(() => {
    eachPlayer('guide', (player) => {
      if (activeSession(player) === undefined) return;
      check(player); // picks and machines are checked here (records call check themselves)
      mark(player);
    });
  }, 20);
});

/** Is the session still in the tutorial? */
export const inTutorial = (player) => questIndex(player) < QUESTS.length;
