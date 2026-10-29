// Start menu shown when a player joins: Play, Create session (claim a mine plot), Exit.
// The form title starts with CONFIG.menu.tag so RP/ui/server_form.json draws it full screen.
import { world, system } from '@minecraft/server';
import { ActionFormData, FormCancelationReason } from '@minecraft/server-ui';
import { CONFIG } from './config.js';
import { plotIndexOf, claimPlot, enterPlot } from './plots.js';

const open = new Set();

function play(player) {
  if (plotIndexOf(player.id) === undefined) {
    return player.sendMessage('§eYou have no mine yet. Open the Main menu on your tablet and tap §fCreate session§e to claim one.');
  }
  enterPlot(player, (ok) => player.sendMessage(ok ? '§aWelcome back to your mine!' : '§cYour mine is not loaded yet. Tablet > Main menu > Play to try again.'));
}

function createSession(player) {
  const index = plotIndexOf(player.id);
  if (index !== undefined) {
    player.sendMessage(`§eYou already own Mine #${index + 1}. Taking you there.`);
    return play(player);
  }
  player.onScreenDisplay.setActionBar('§7Building your mine...');
  claimPlot(player, (built) => {
    if (!built) return player.sendMessage('§cYour mine could not be built yet (area not loaded). Tablet > Main menu > Play to try again.');
    player.playSound('random.levelup');
    player.onScreenDisplay.setTitle('§6Your mine', { subtitle: 'Place drills here to earn cash', fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
    player.sendMessage(`§aMine #${plotIndexOf(player.id) + 1} is yours! Place your Stone Drill and open the Miner's Tablet to buy more.`);
  });
}

function exit(player) {
  try {
    player.dimension.runCommand(`kick "${player.name}" Thanks for playing ${CONFIG.title}!`);
  } catch {
    // The host of a local world cannot be kicked.
    player.sendMessage('§7You are hosting this world: leave it from the pause menu.');
  }
}

export function showStartMenu(player) {
  if (!player.isValid || open.has(player.id)) return;
  open.add(player.id);
  const index = plotIndexOf(player.id);
  new ActionFormData()
    .title(`${CONFIG.menu.tag}${CONFIG.title}`)
    .body(index === undefined ? 'Claim your own mine, place drills and get rich.' : `Your mine: §6#${index + 1}§r - your drills are waiting.`)
    .button('Play')
    .button('Create session')
    .button('Exit')
    .show(player)
    .then((res) => {
      open.delete(player.id);
      if (!player.isValid) return;
      if (res.canceled) {
        // Still loading, chat open, or closed with back: the menu comes back.
        const delay = res.cancelationReason === FormCancelationReason.UserBusy ? 20 : 10;
        return system.runTimeout(() => showStartMenu(player), delay);
      }
      [play, createSession, exit][res.selection]?.(player);
    })
    .catch(() => open.delete(player.id));
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) system.runTimeout(() => showStartMenu(player), 40);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => open.delete(playerId));
