// Start menu shown when a player joins: Play, Create session (no sessions yet) or Sessions, Exit.
// Full-screen menus are drawn by RP/ui/server_form.json. Each menu is ONE form holding all of its pages: every
// button starts with a list code saying where it is drawn, title flags show or hide options, and the UI opens
// sub-pages and goes back by itself, so the form never closes to change page. Codes: menu_layout.js (generated).
// Short dark camera fades only bridge the moments no menu is up (joining, the teleport into a mine): a long fade
// can't be cut short and would stay dark after the loading screen.
import { world, system, HudVisibility } from '@minecraft/server';
import { ActionFormData, FormCancelationReason, uiManager } from '@minecraft/server-ui';
import { CONFIG } from './config.js';
import { formatNumber } from './lib/util.js';
import { MENU } from './menu_layout.js';
import { sessionsOf, hasSessions, activeSession, lastSession, sessionStats, playSession, createSession, deleteSession } from './sessions.js';

const SHADE = { red: 0.06, green: 0.045, blue: 0.03 };
const open = new Set();

/** Menu icon texture (RP/textures/mining_tycoon/ui/icons); none when that icon is not painted yet. */
export const icon = (name) => (MENU.icons.includes(name) ? `textures/mining_tycoon/ui/icons/${name}` : undefined);
const covered = new Set();

/** Hide the HUD and the world for a short moment (menus and the loading screen cover the rest). */
function cover(player, seconds = 1.5) {
  covered.add(player.id);
  try {
    player.camera.fade({ fadeColor: SHADE, fadeTime: { fadeInTime: 0, holdTime: seconds, fadeOutTime: 0.5 } });
    player.onScreenDisplay.setHudVisibility(HudVisibility.Hide);
  } catch {
    // still loading in - the next menu attempt covers again
  }
}

/** Show the world and HUD again. */
function uncover(player) {
  if (!covered.delete(player.id)) return;
  try {
    player.camera.clear(); // ends a fade that is still running
    player.onScreenDisplay.setHudVisibility(HudVisibility.Reset);
  } catch {
    // player left
  }
}

/**
 * Show a full-screen menu. form: a key of MENU.forms. buttons: [{ list, text, icon, run }] with list a key of
 * MENU.lists and icon a texture path (icons: icon('play')).
 * flags: keys of MENU.flags to set. Closing it with Back runs onClose (if any); when the player is just busy (still
 * loading, chat open) the same menu comes back a moment later.
 */
export function fullScreenMenu(player, menu, onClose) {
  if (!player.isValid || open.has(player.id)) return;
  if (covered.has(player.id)) cover(player); // until the menu is up: the first fade can arrive while still loading
  open.add(player.id);
  const { form, flags = [], body, buttons } = menu;
  const title = MENU.forms[form] + flags.map((f) => MENU.flags[f]).join('') + CONFIG.title;
  const data = new ActionFormData().title(title).body(body);
  for (const b of buttons) data.button(MENU.lists[b.list] + b.text, b.icon);
  data
    .show(player)
    .then((res) => {
      open.delete(player.id);
      if (!player.isValid) return;
      if (res.canceled) {
        if (res.cancelationReason === FormCancelationReason.UserBusy) return system.runTimeout(() => fullScreenMenu(player, menu, onClose), 5);
        if (covered.has(player.id)) cover(player); // closed with Back: keep the world hidden until it comes back
        if (onClose) system.runTimeout(() => onClose(player), 5);
        return;
      }
      buttons[res.selection]?.run(player);
    })
    .catch(() => open.delete(player.id));
}

function summary(player, slot) {
  const s = sessionStats(player, slot);
  return `$${formatNumber(s.money)} - Rebirth ${s.rebirths}`;
}

/** Players on the loading screen -> tick before which it may not close (so it never just flashes). */
const loading = new Map();
/** Players whose loading screen form is open or on its way (its promise has not settled). */
const loadingOpen = new Set();

/**
 * Full-screen loading screen (a pick striking ore) while a mine is built or loaded. It opens a moment after the
 * teleport, and anything that closes it early (teleporting, terrain loading, Back) only brings it back.
 */
function showLoading(player, text) {
  loading.set(player.id, system.currentTick + 40);
  const attempt = () => {
    if (!player.isValid || !loading.has(player.id)) return;
    loadingOpen.add(player.id);
    new ActionFormData()
      .title(MENU.forms.loading + CONFIG.title)
      .body(text)
      .show(player)
      .then((res) => {
        loadingOpen.delete(player.id);
        if (loading.has(player.id)) system.runTimeout(attempt, res.cancelationReason === FormCancelationReason.UserBusy ? 2 : 3);
      })
      .catch(() => loadingOpen.delete(player.id));
  };
  system.runTimeout(attempt, 6);
}

/** Close the loading screen once it has shown long enough and the area around the player had a moment to render. */
function hideLoading(player, then) {
  const wait = Math.max(20, (loading.get(player.id) ?? 0) - system.currentTick);
  system.runTimeout(() => {
    loading.delete(player.id);
    if (!player.isValid) return;
    // A screen that was still on its way when we closed would stay up: close until it is really gone.
    let tries = 0;
    const close = () => {
      if (!player.isValid) return;
      uiManager.closeAllForms(player);
      if (loadingOpen.has(player.id) && ++tries < 10) system.runTimeout(close, 4);
    };
    close();
    then();
  }, wait);
}

/** Play a session, or create it first when the slot is empty. */
function enter(player, slot) {
  const fresh = !sessionsOf(player.id)[slot];
  cover(player, 1); // hides the teleport until the loading screen is up
  showLoading(player, fresh ? 'Building your mine...' : `Heading into Session ${slot + 1}...`); // opens after the teleport
  const done = (ok) => hideLoading(player, () => {
    uncover(player);
    if (!ok) return player.sendMessage('§cYour mine is not loaded yet. Tablet > Main menu > Play to try again.');
    if (!fresh) return player.sendMessage(`§aWelcome back to Session ${slot + 1}!`);
    player.playSound('random.levelup');
    player.onScreenDisplay.setTitle(`§6Session ${slot + 1}`, { subtitle: 'Break the ores for cash', fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 10 });
    player.sendMessage("§aYour new mine is ready! Break the ores with your Wooden Pick, then open the Miner's Tablet for upgrades.");
  });
  if (!fresh) return playSession(player, slot, done);
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

function remove(player, slot) {
  deleteSession(player, slot);
  player.sendMessage(`§cSession ${slot + 1} deleted.`);
  showStartMenu(player);
}

/** The start menu with its Sessions, Delete and confirm pages, all in one form. */
export function showStartMenu(player) {
  const has = hasSessions(player.id);
  const slots = sessionsOf(player.id);
  const active = activeSession(player);
  const buttons = [{ list: 'start_top', text: 'Play', icon: icon('play'), run: play }];
  if (!has) buttons.push({ list: 'start_top', text: 'Create session', icon: icon('new_slot'), run: (p) => enter(p, 0) });
  buttons.push({ list: 'start_bottom', text: 'Exit', icon: icon('exit'), run: exit });
  const flags = has ? ['hasSessions'] : [];
  slots.forEach((record, i) => {
    if (!has) return;
    if (!record) return buttons.push({ list: 'start_slots', text: `Slot ${i + 1} - Empty\n§7Tap to create a session`, icon: icon('new_slot'), run: (p) => enter(p, i) });
    flags.push(`slot${i}`);
    buttons.push({ list: 'start_slots', text: `Session ${i + 1}${i === active ? ' §a(playing)' : ''}\n§7${summary(player, i)}`, icon: icon('session'), run: (p) => enter(p, i) });
    buttons.push({ list: `start_delete_${i}`, text: `Yes, delete Session ${i + 1}`, icon: icon('delete'), run: (p) => remove(p, i) });
  });
  const body = !has
    ? 'Claim your own mine, dig up ores and get rich.'
    : active === undefined
      ? 'Pick Play to continue, or open Sessions.'
      : `Session ${active + 1}: ${summary(player, active)}`;
  fullScreenMenu(player, { form: 'start', flags, body, buttons }, showStartMenu); // the start menu can't be skipped
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  cover(player);
  system.run(() => showStartMenu(player)); // retried every few ticks until the client can show it
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  open.delete(playerId);
  loading.delete(playerId);
  loadingOpen.delete(playerId);
  covered.delete(playerId);
});

