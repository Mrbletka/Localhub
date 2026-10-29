// Start menu shown when a player joins: Play, Create session (no sessions yet) or Sessions, Exit.
// Forms whose title starts with CONFIG.menu.tag are drawn full screen by RP/ui/server_form.json.
import { world, system } from '@minecraft/server';
import { ActionFormData, MessageFormData, FormCancelationReason } from '@minecraft/server-ui';
import { CONFIG } from './config.js';
import { formatNumber } from './lib/util.js';
import { sessionsOf, hasSessions, activeSession, lastSession, sessionStats, playSession, createSession, deleteSession } from './sessions.js';

const TAG = CONFIG.menu.tag;
const open = new Set();

/**
 * Show a full-screen menu. buttons: [{ text, run }]. Closing it with Back runs onClose; when the player is just
 * busy (still loading, chat open) the same menu comes back a moment later.
 */
function fullScreenMenu(player, body, buttons, onClose) {
  if (!player.isValid || open.has(player.id)) return;
  open.add(player.id);
  const form = new ActionFormData().title(`${TAG}${CONFIG.title}`).body(body);
  for (const b of buttons) form.button(b.text);
  form
    .show(player)
    .then((res) => {
      open.delete(player.id);
      if (!player.isValid) return;
      if (res.canceled) {
        if (res.cancelationReason === FormCancelationReason.UserBusy) {
          return system.runTimeout(() => fullScreenMenu(player, body, buttons, onClose), 20);
        }
        return system.runTimeout(() => onClose(player), 5);
      }
      buttons[res.selection]?.run(player);
    })
    .catch(() => open.delete(player.id));
}

function summary(player, slot) {
  const s = sessionStats(player, slot);
  return `$${formatNumber(s.money)} - Rebirth ${s.rebirths}`;
}

/** Play a session, or create it first when the slot is empty. */
function enter(player, slot) {
  const fresh = !sessionsOf(player.id)[slot];
  const done = (ok) => {
    if (!ok) return player.sendMessage('§cYour mine is not loaded yet. Tablet > Main menu > Play to try again.');
    if (!fresh) return player.sendMessage(`§aWelcome back to Session ${slot + 1}!`);
    player.playSound('random.levelup');
    player.onScreenDisplay.setTitle(`§6Session ${slot + 1}`, { subtitle: 'Place drills here to earn cash', fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
    player.sendMessage("§aYour new mine is ready! Place your Stone Drill and open the Miner's Tablet to buy more.");
  };
  if (!fresh) return playSession(player, slot, done);
  player.onScreenDisplay.setActionBar('§7Building your mine...');
  createSession(player, slot, done);
}

function play(player) {
  if (!hasSessions(player.id)) {
    player.sendMessage('§eCreate a session first: it gives you your own mine.');
    return showStartMenu(player);
  }
  enter(player, lastSession(player));
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
  const slot = activeSession(player);
  const body = !hasSessions(player.id)
    ? 'Claim your own mine, place drills and get rich.'
    : slot === undefined
      ? 'Pick Play to continue, or open Sessions.'
      : `Session ${slot + 1}: ${summary(player, slot)}`;
  fullScreenMenu(
    player,
    body,
    [
      { text: 'Play', run: play },
      hasSessions(player.id) ? { text: 'Sessions', run: showSessions } : { text: 'Create session', run: (p) => enter(p, 0) },
      { text: 'Exit', run: exit },
    ],
    showStartMenu, // the start menu can't be skipped
  );
}

function showSessions(player) {
  const active = activeSession(player);
  const slots = sessionsOf(player.id);
  const buttons = slots.map((record, slot) =>
    record
      ? { text: `Session ${slot + 1}${slot === active ? ' §a(playing)' : ''}\n§7${summary(player, slot)}`, run: (p) => showSession(p, slot) }
      : { text: `Slot ${slot + 1} - Empty\n§7Tap to create a session`, run: (p) => enter(p, slot) },
  );
  buttons.push({ text: 'Back', run: showStartMenu });
  fullScreenMenu(player, `Your sessions (${slots.length} slots). Each one is its own mine and its own save.`, buttons, showStartMenu);
}

function showSession(player, slot) {
  if (!sessionsOf(player.id)[slot]) return showSessions(player);
  const s = sessionStats(player, slot);
  fullScreenMenu(
    player,
    `Session ${slot + 1}\n$${formatNumber(s.money)} - Income level ${s.level} - Rebirth ${s.rebirths}`,
    [
      { text: 'Play', run: (p) => enter(p, slot) },
      { text: 'Delete session', run: (p) => confirmDelete(p, slot) },
      { text: 'Back', run: showSessions },
    ],
    showSessions,
  );
}

function confirmDelete(player, slot) {
  new MessageFormData()
    .title(`Delete Session ${slot + 1}?`)
    .body('Its mine, money, upgrades, rebirths and drills are gone for good.')
    .button1('Delete')
    .button2('Keep it')
    .show(player)
    .then((res) => {
      if (!player.isValid) return;
      if (res.selection !== 0) return showSession(player, slot);
      deleteSession(player, slot);
      player.sendMessage(`§cSession ${slot + 1} deleted.`);
      showSessions(player);
    });
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) system.runTimeout(() => showStartMenu(player), 40);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => open.delete(playerId));
