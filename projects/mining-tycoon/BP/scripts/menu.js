// Start menu shown when a player joins: Play, Create session (no sessions yet) or Sessions, Exit.
// Forms whose title starts with CONFIG.menu.tag are drawn full screen by RP/ui/server_form.json. The start menu and
// the Sessions page are one form: every button carries a LIST prefix saying where it is drawn, and the UI switches
// between the two pages itself (Sessions / Back are UI toggles), so the form never has to close and reopen.
// From joining until the player stands in their mine, a dark camera fade hides the world (menus draw above it).
import { world, system, HudVisibility } from '@minecraft/server';
import { ActionFormData, MessageFormData, FormCancelationReason } from '@minecraft/server-ui';
import { CONFIG } from './config.js';
import { formatNumber } from './lib/util.js';
import { sessionsOf, hasSessions, activeSession, lastSession, sessionStats, playSession, createSession, deleteSession } from './sessions.js';

const TAG = CONFIG.menu.tag;
// Must match RP/ui/server_form.json. They are formatting codes, so they stay invisible without the resource pack too.
const LIST = { top: '§p§1§r', bottom: '§p§2§r', sessions: '§p§3§r' };
const HAS_SESSIONS = '§h§s'; // title flag: the start page offers the Sessions toggle
const SHADE = { red: 0.06, green: 0.045, blue: 0.03 };
const open = new Set();
const covered = new Set();

/** Hide the world and HUD behind a dark screen. Fades hold for at most 10 s, so covered players are refreshed. */
function cover(player) {
  covered.add(player.id);
  try {
    player.camera.fade({ fadeColor: SHADE, fadeTime: { fadeInTime: 0, holdTime: 10, fadeOutTime: 0.5 } });
    player.onScreenDisplay.setHudVisibility(HudVisibility.Hide);
  } catch {
    // still loading in - the next refresh covers again
  }
}

/** Fade the world back in. */
function uncover(player) {
  if (!covered.delete(player.id)) return;
  try {
    player.camera.fade({ fadeColor: SHADE, fadeTime: { fadeInTime: 0, holdTime: 0.2, fadeOutTime: 0.8 } });
    player.onScreenDisplay.setHudVisibility(HudVisibility.Reset);
  } catch {
    // player left
  }
}

/**
 * Show a full-screen menu. buttons: [{ list, text, run }]. Closing it with Back runs onClose; when the player is
 * just busy (still loading, chat open) the same menu comes back a moment later.
 */
function fullScreenMenu(player, { flags = '', body, buttons }, onClose) {
  if (!player.isValid || open.has(player.id)) return;
  if (covered.has(player.id)) cover(player); // re-sent on every attempt: the first one can arrive while still loading
  open.add(player.id);
  const form = new ActionFormData().title(`${TAG}${flags}${CONFIG.title}`).body(body);
  for (const b of buttons) form.button(`${b.list}${b.text}`);
  form
    .show(player)
    .then((res) => {
      open.delete(player.id);
      if (!player.isValid) return;
      if (res.canceled) {
        if (res.cancelationReason === FormCancelationReason.UserBusy) {
          return system.runTimeout(() => fullScreenMenu(player, { flags, body, buttons }, onClose), 5);
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
  cover(player); // hides the teleport and the mine being built
  const done = (ok) => {
    uncover(player);
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

/** Continue the last session; with none yet, Play starts the first one. */
function play(player) {
  enter(player, hasSessions(player.id) ? lastSession(player) : 0);
}

function exit(player) {
  try {
    player.dimension.runCommand(`kick "${player.name}" Thanks for playing ${CONFIG.title}!`);
  } catch {
    // The host of a local world cannot be kicked.
    uncover(player);
    player.sendMessage('§7You are hosting this world: leave it from the pause menu.');
  }
}

/** Start page (Play / Create session or Sessions / Exit) plus the Sessions page, in one form. */
export function showStartMenu(player) {
  const has = hasSessions(player.id);
  const slot = activeSession(player);
  const buttons = [{ list: LIST.top, text: 'Play', run: play }];
  if (!has) buttons.push({ list: LIST.bottom, text: 'Create session', run: (p) => enter(p, 0) });
  buttons.push({ list: LIST.bottom, text: 'Exit', run: exit });
  if (has) {
    sessionsOf(player.id).forEach((record, i) =>
      buttons.push(
        record
          ? { list: LIST.sessions, text: `Session ${i + 1}${i === slot ? ' §a(playing)' : ''}\n§7${summary(player, i)}`, run: (p) => enter(p, i) }
          : { list: LIST.sessions, text: `Slot ${i + 1} - Empty\n§7Tap to create a session`, run: (p) => enter(p, i) },
      ),
    );
    buttons.push({ list: LIST.sessions, text: 'Delete a session', run: showDeleteMenu });
  }
  const body = !has
    ? 'Claim your own mine, place drills and get rich.'
    : slot === undefined
      ? 'Pick Play to continue, or open Sessions.'
      : `Session ${slot + 1}: ${summary(player, slot)}`;
  fullScreenMenu(player, { flags: has ? HAS_SESSIONS : '', body, buttons }, showStartMenu); // the start menu can't be skipped
}

function showDeleteMenu(player) {
  const buttons = [];
  sessionsOf(player.id).forEach((record, i) => {
    if (record) buttons.push({ list: LIST.top, text: `Delete Session ${i + 1}\n§7${summary(player, i)}`, run: (p) => confirmDelete(p, i) });
  });
  buttons.push({ list: LIST.bottom, text: 'Back', run: showStartMenu });
  fullScreenMenu(player, { body: "Tap a session to delete it. This can't be undone.", buttons }, showStartMenu);
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
      if (res.selection !== 0) return showDeleteMenu(player);
      deleteSession(player, slot);
      player.sendMessage(`§cSession ${slot + 1} deleted.`);
      showStartMenu(player);
    });
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  cover(player);
  system.run(() => showStartMenu(player)); // retried every few ticks until the client can show it
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  open.delete(playerId);
  covered.delete(playerId);
});

world.afterEvents.worldLoad.subscribe(() => {
  system.runInterval(() => {
    for (const player of world.getAllPlayers()) if (covered.has(player.id)) cover(player);
  }, 100);
});
