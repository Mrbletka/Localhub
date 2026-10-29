# Mining Tycoon

Template: **Tycoon** · Namespace: `mining_tycoon`

## Concept
You run a mine. Place **drills** that dig ore and turn it into cash every second. Spend the cash on more and better
drills, upgrade your mining speed, and dig into deeper, richer layers. When the mine is maxed out, **rebirth**: the mine
resets but you keep a permanent cash multiplier and push even deeper next time.

## Core loop
0. Join -> full-screen **start menu** -> **Create session** claims your own mine plot (or **Play** to return to it).
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
- Ownership: placed drills are stored in a world dynamic property (`mining_tycoon:generators`); only the owner can break them.
- Income: `sum(drill income) x (1 + level x incomeBonusPerLevel) x rebirthBonus`, paid every 20 ticks.
- Limit: 40 drills per player.
- Start menu (`BP/scripts/menu.js`): shown a moment after every join, and from Tablet > Main menu. It comes back if
  closed with Back, so players must choose:
  - **Play**: go to your mine (builds it first if it never finished building). No mine yet -> a hint to Create session.
  - **Create session**: claim the next free mine plot, build it and fly there. Already own one -> same as Play.
  - **Exit**: disconnects the player with a goodbye message. The host of a local world can't be disconnected, so they
    get a hint to leave from the pause menu instead.
- Full-screen look (`RP/ui/server_form.json`): any action form whose title starts with `§m§t§s` (config `menu.tag`) is
  drawn full screen: cave background `textures/mining_tycoon/ui/menu_bg` (128x64), gold MINING TYCOON logo, body
  text, stacked buttons. All other forms (the tablet) keep the normal look. If the resource pack is missing, the menu
  still works as a normal form.
- Mine plots (`BP/scripts/plots.js`, stored in world property `mining_tycoon:plots`): 25x25 polished-deepslate
  platforms with a deepslate-brick rim and corner lanterns, in a 16-wide grid at x/z 10000, y 80, 48 blocks apart.
  Your respawn point is set to your mine. Drills only work inside your own mine. Other players can't break or place
  blocks in your mine.
- Balance: everything lives in `BP/scripts/config.js`.

## Roadmap (built step by step)
- [x] **Step 1 - Foundation:** project from the tycoon template, rethemed to mining (drills, Miner's Tablet, texts).
- [ ] **Step 2 - Look:** pixel-art drill textures (stone/iron/diamond), Miner's Tablet icon, pack icon.
- [ ] **Step 3 - More drills:** 6+ tiers (e.g. Copper, Gold, Emerald, Amethyst, Obsidian) with a tuned price curve.
- [ ] **Step 4 - Ore feel:** drills pop ore chunks / mining particles and sounds; optional Ore Seller block.
- [x] **Start menu + plots:** full-screen join menu (Play / Create session / Exit), private mine plots, drills only in your own mine.
- [ ] **Step 6 - Depth layers:** rebirths unlock deeper layers (Stone -> Deepslate -> Magma Core) with new drill tiers.
- [ ] **Step 7 - Extras:** offline earnings, leaderboard, daily bonus.
