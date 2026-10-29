# Mining Tycoon

Template: **Tycoon** · Namespace: `mining_tycoon`

## Concept
You run a mine. Place **drills** that dig ore and turn it into cash every second. Spend the cash on more and better
drills, upgrade your mining speed, and dig into deeper, richer layers. When the mine is maxed out, **rebirth**: the mine
resets but you keep a permanent cash multiplier and push even deeper next time.

## Core loop
0. Join -> full-screen **start menu** -> **Create session** starts a save with its own mine (later: **Sessions** to
   pick one of your 2 save slots, or **Play** to continue).
1. Earn cash from placed drills (paid every second).
2. Open the **Miner's Tablet** -> buy drills, upgrade income.
3. Place more/better drills -> income grows.
4. Save up -> rebirth for a permanent multiplier -> repeat faster.

## Drills (current)
| Block | Name | Cost | Income/s |
|---|---|---|---|
| mining_tycoon:generator_t1 | Stone Drill | 25 | 1 |
| mining_tycoon:generator_t2 | Iron Drill | 500 | 12 |
| mining_tycoon:generator_t3 | Diamond Drill | 10000 | 150 |

## Systems (current)
- Ownership: placed drills are stored in a world dynamic property (`mining_tycoon:generators`) with owner and session slot; only the owner can break them.
- Income: `sum(drill income) x (1 + level x incomeBonusPerLevel) x rebirthBonus`, paid every 20 ticks.
- Limit: 40 drills per session.
- Start menu (`BP/scripts/menu.js`): shown a moment after every join, and from Tablet > Main menu. It comes back if
  closed with Back, so players must choose:
  - **Play**: continue your last session (builds its mine first if it never finished). No sessions -> hint.
  - **Create session** (only while you have no sessions): start session 1.
  - **Sessions** (once you have one): the slots menu, one button per slot -
    filled slot `Session N (playing)` + money and rebirths -> Play / Delete session (with confirmation) / Back;
    empty slot `Slot N - Empty` -> creates a session there.
  - **Exit**: disconnects the player with a goodbye message. The host of a local world can't be disconnected, so they
    get a hint to leave from the pause menu instead.
- Sessions (`BP/scripts/sessions.js`, world property `mining_tycoon:sessions`): 2 save slots per player (config
  `sessions.slots`). Each session is its own save: own mine plot, money, income level, rebirths (player properties
  `mining_tycoon:s<slot>:<name>`), placed drills (`slot` in each drill record) and unplaced drill items (stashed when
  you switch away, handed back when you return). Only the active session (`mining_tycoon:active_session`) earns.
  A new session starts with $25 and a Stone Drill. Deleting one frees its plot; the next owner gets it rebuilt clean.
  Worlds from before sessions: the old plot, money, upgrades and rebirths become session 1.
- Full-screen look (`RP/ui/server_form.json`): any action form whose title starts with `§m§t§s` (config `menu.tag`) is
  drawn full screen: cave background `textures/mining_tycoon/ui/menu_bg` (128x64, drawn 32px past each edge so it also
  covers the screen safe area), gold MINING TYCOON logo, body text and stone & gold buttons (nine-sliced
  `textures/mining_tycoon/ui/button`, `button_hover`, `button_pressed`; gold text, up to 2 lines). All other forms (the
  tablet) keep the normal look. Without the resource pack the menus still work as normal forms.
- Mine plots: 25x25 polished-deepslate platforms with a deepslate-brick rim and corner lanterns, in a 16-wide grid at
  x/z 10000, y 80, 48 blocks apart. Your respawn point is set to the mine you are playing. Drills only work in the mine
  of your active session, and a drill can only be broken from the session it belongs to. Other players can't break or
  place blocks in your mines.

## Roadmap (built step by step)
- [x] **Step 1 - Foundation:** project from the tycoon template, rethemed to mining (drills, Miner's Tablet, texts).
- [ ] **Step 2 - Look:** pixel-art drill textures (stone/iron/diamond), Miner's Tablet icon, pack icon.
- [ ] **Step 3 - More drills:** 6+ tiers (e.g. Copper, Gold, Emerald, Amethyst, Obsidian) with a tuned price curve.
- [ ] **Step 4 - Ore feel:** drills pop ore chunks / mining particles and sounds; optional Ore Seller block.
- [x] **Start menu + plots:** full-screen join menu (Play / Create session / Exit), private mine plots, drills only in your own mine.
- [x] **Sessions:** 2 save slots per player with a full-screen slots menu; stone & gold menu buttons.
- [ ] **Step 6 - Depth layers:** rebirths unlock deeper layers (Stone -> Deepslate -> Magma Core) with new drill tiers.
- [ ] **Step 7 - Extras:** offline earnings, leaderboard, daily bonus.
