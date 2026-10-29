# Mining Tycoon

Template: **Tycoon** · Namespace: `mining_tycoon`

## Concept
You run a mine, starting with nothing but a **Wooden Pick**. Break the ores in your mine's **ore vein** by hand: every
ore pays cash on the spot and grows back a few seconds later. Spend the cash on a better **pick** (mines faster and can
break harder ores), a deeper **mine** (richer ores appear in the field) and **ore value**. Once your mine reaches the
Iron Vein, **drills** unlock: automation that earns while you keep mining. When it's all maxed, **rebirth**: the session
resets but you keep a permanent cash bonus.

## Core loop
0. Join -> full-screen **start menu** -> **Play** / **Create session** starts a save with its own mine (later:
   **Sessions** to pick one of your 2 save slots).
1. Mine ores in the vein of your underground mine with your pick -> instant cash (`+$12 Copper Ore`).
2. Open the **Miner's Tablet** -> **Upgrades**: pick, mine level, ore value.
3. Better pick -> faster and harder ores; better mine -> more valuable ores in the field.
4. Mine level 3 (Iron Vein) unlocks **Drills** -> place them in your mine for passive income.
5. Save up -> rebirth for a permanent multiplier -> repeat faster.

## Content
Ores (custom blocks, drop nothing; value is paid in cash). Hardness = seconds to break by hand; a pick divides it by its speed.
| Block | Name | Value | Hardness | Needs |
|---|---|---|---|---|
| mining_tycoon:ore_rock | Mine Rock | $1 | 1.2 | Wooden Pick |
| mining_tycoon:ore_coal | Coal Ore | $4 | 2 | Wooden Pick |
| mining_tycoon:ore_copper | Copper Ore | $12 | 3.5 | Stone Pick |
| mining_tycoon:ore_iron | Iron Ore | $35 | 6 | Copper Pick |
| mining_tycoon:ore_gold | Gold Ore | $100 | 10 | Iron Pick |
| mining_tycoon:ore_ruby | Ruby Ore | $300 | 16 | Gold Pick |
| mining_tycoon:ore_diamond | Diamond Ore | $900 | 25 | Diamond Pick |

Picks (items `mining_tycoon:pick_1`..`pick_6`; speed only works on ores):
| Tier | Name | Speed | Cost |
|---|---|---|---|
| 1 | Wooden Pick | 2 | start |
| 2 | Stone Pick | 4 | $60 |
| 3 | Copper Pick | 7 | $800 |
| 4 | Iron Pick | 12 | $7.5K |
| 5 | Gold Pick | 20 | $60K |
| 6 | Diamond Pick | 32 | $450K |

Mine levels (ore field weights, %):
| Level | Name | Cost | rock | coal | copper | iron | gold | ruby | diamond |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Shallow Mine | start | 80 | 20 | | | | | |
| 2 | Copper Seam | $120 | 60 | 25 | 15 | | | | |
| 3 | Iron Vein | $1.5K | 50 | 20 | 18 | 12 | | | |
| 4 | Gold Cavern | $12K | 40 | 15 | 18 | 15 | 12 | | |
| 5 | Ruby Depths | $100K | 35 | 10 | 15 | 15 | 15 | 10 | |
| 6 | Diamond Core | $750K | 30 | 8 | 12 | 15 | 15 | 12 | 8 |

Drills (unlock at mine level 3):
| Block | Name | Cost | Income/s |
|---|---|---|---|
| mining_tycoon:generator_t1 | Stone Drill | $2K | 4 |
| mining_tycoon:generator_t2 | Iron Drill | $20K | 35 |
| mining_tycoon:generator_t3 | Diamond Drill | $200K | 300 |

Other upgrades: **Ore value** +25% cash from ores and drills per level, cost $40 x 1.6^level. **Rebirth** $1M x 4^n,
+50% permanent cash per rebirth; resets money, pick, mine level, ore value and drills of that session.

## Balance notes - TO TUNE LATER
Every number above is a first guess so the loop can be played; they all live in `BP/scripts/config.js` (ore values,
pick costs, mine costs and weights, drills, upgrade and rebirth curves). Ore hardness is `seconds_to_destroy` in
`BP/blocks/ore_*.json`, pick speed is the `minecraft:digger` speed in `BP/items/pick_*.json`.
- [ ] Play the first 30 minutes and write a minute -> cash/s -> next purchase table here.
- [ ] Aim: 3-5 purchases in the first minute or two, first drill around 10 minutes, first rebirth 30-45 minutes.
- [ ] Check hand mining vs drills: drills should feel like a big boost at unlock, but mining must stay worth it.
- [ ] Check mining times: with the "right" pick every ore should take ~0.8 s; hardness/speed may need tweaking in game.
- [ ] Rebirth cost and bonus once the late game exists.

## Systems (current)
- Ownership: placed drills are stored in a world dynamic property (`mining_tycoon:generators`) with owner and session slot; only the owner can break them.
- Drill income: `sum(drill income) x cash multiplier`, paid every 20 ticks. Drills go on the drill pads only.
- Money shows in the action bar (no scoreboard; the old `mining_tycoon_money` sidebar is removed on world load).
- Limit: 40 drills per session.
- Start menu (`BP/scripts/menu.js`): shown on every join (retried every 5 ticks until the client can show it), and
  from Tablet > Main menu. It comes back if closed with Back, so players must choose:
  - **Play**: continue your last session (builds its mine first if it never finished). No sessions yet -> starts
    session 1.
  - **Create session** (only while you have no sessions): start session 1.
  - **Sessions** (once you have one) -> Sessions page: `Session N (playing)` + money and rebirths -> play it;
    `Slot N - Empty` -> create a session there; **Delete a session** -> Delete page (`Delete Session N` -> confirm
    page: **Yes, delete Session N** / **Keep it**); **Back**.
  - **Exit**: disconnects the player with a goodbye message. The host of a local world can't be disconnected, so they
    get a hint to leave from the pause menu instead.
- Join cover: short dark camera fades (1-1.5 s, re-sent on every menu attempt while joining) hide the world and HUD
  only while no menu is up: joining, Back on the start menu, the teleport into a mine. The full-screen menus and the
  loading screen cover everything else. A long fade can't be cut short on phones, so it would stay dark after the
  loading screen; when the player is in the mine the HUD comes back and `camera.clear()` ends any fade left.
- Loading screen: entering a session shows a third full-screen form (tag `§m§t§l`, no buttons): cave, logo,
  "Building your mine..." / "Heading into Session N..." and a gold pick striking a shaking gold ore. It opens a moment
  after the teleport (teleports close open forms), comes back if anything closes it while the mine is still loading,
  stays at least 2 s and closes (`uiManager.closeAllForms`, repeated until it is really gone) 1 s after the player
  stands in the mine; then the world fades in.
- Sessions (`BP/scripts/sessions.js`, world property `mining_tycoon:sessions`): 2 save slots per player (config
  `sessions.slots`). Each session is its own save: own mine plot, money, income level, rebirths (player properties
  `mining_tycoon:s<slot>:<name>`), placed drills (`slot` in each drill record) and unplaced drill items (stashed when
  you switch away, handed back when you return). Only the active session (`mining_tycoon:active_session`) earns.
  A new session starts with $0, a Wooden Pick and the Shallow Mine. Deleting one frees its plot; the next owner gets it rebuilt clean.
  Worlds from before sessions: the old plot, money, upgrades and rebirths become session 1.
- Hand mining (`BP/scripts/mining.js`): the ore field is the **vein** in the north wall of each mine, 13 wide, 4 high
  and 4 deep (config `mine.vein`, relative to the plot centre). Breaking an ore pays `value x cash multiplier` at once
  (`+$12 Copper Ore` popup; the money action bar waits for it) and the ore grows back after ~4-5 s, rolled from the
  session's mine level (never inside a player). Ores drop nothing (`loot_tables/blocks/ore_empty.json`).
  - An ore needs the pick tier in its config (`pick`); by hand or with a weaker pick the break is cancelled with a hint.
  - Picks (`mining_tycoon:pick_1..6`) follow the session: arriving in a session, upgrading, rebirth and respawning
    all make sure you hold exactly that session's pick. Pick speed only works on blocks tagged `mining_tycoon_ore`.
  - Arriving in a session refills empty vein cells; a mine upgrade (or rebirth) re-rolls the whole vein.
  - Players in a session get a short saturation effect every 10 s, so mining never makes them hungry.
- Miner's Tablet (`openMenu` in `main.js`): body shows session, money, pick, mine and cash multiplier (+ drill income).
  **Upgrades** -> Pick (next pick, price, ores it unlocks), Mine (next level, price, ores it adds), Ore value (+25%);
  **Drills** -> shop (locked until mine level 3: one "Locked" button); **Rebirth** -> confirm page (**Rebirth! - $cost**
  with the new bonus / **Not yet**); **Main menu** -> start menu. Buying or upgrading closes the menu.
- Session economy (`BP/scripts/economy.js`): money, income_level (ore value), rebirths, pick and mine_level per
  session; cash multiplier = `(1 + 0.25 x ore value level) x (1 + 0.5 x rebirths)` for ores and drills alike.
- Full-screen menus, one form per menu (`RP/ui/server_form.json` + `BP/scripts/menu_layout.js`, both generated by
  `tools/gen_server_form.py` - edit the menu tree there and run it):
  - A form whose title starts with a form tag (`§m§t§s` start menu, `§m§t§t` tablet) is drawn full screen: cave
    background `textures/mining_tycoon/ui/menu_bg` (128x64, drawn 32px past each edge to cover the screen safe area),
    logo, the body text on every page, a heading per sub-page and stone & gold buttons (nine-sliced
    `textures/mining_tycoon/ui/button`, `button_hover`, `button_pressed`; gold text, up to 2 lines). Other forms keep
    the normal look.
  - All pages of a menu are in that one form. Sub-pages open with **Navs**: on/off toggles inside the UI that turn into
    the sub-page's Back button, so changing page never closes the form. Only real choices go to the script.
  - Every real button text starts with an invisible list code (`§p§1§1§r`...) naming the page list it is drawn in;
    title flags (`§h§s` has sessions, `§f§1`/`§f§2` slot filled) show or hide Navs. Scripts use the names from
    `menu_layout.js` via `fullScreenMenu(player, { form, flags, body, buttons: [{ list, text, run }] })` in `menu.js`.
  - Without the resource pack every button shows in one plain list (including the delete confirmations).
  - Look and motion (all generated): pixel-art logo `ui/logo.png` (drops in with a bounce, then floats, two twinkling
    sparkles); the cave background lives in the screen's own background slot (`third_party_server_screen` ->
    `$screen_bg_content`, drawn full screen, outside the phone's safe area; shown only when the form title has one of
    our tags), stretched to the screen with `keep_ratio: false` (images keep their art's 2:1 ratio by default, so on
    a wider phone screen the cave stopped short of both edges). It stays still and has
    flickering lantern glows (`ui/fx_glow`), gems that twinkle on their own rhythm (`ui/fx_sparkle`), drifting dust
    (`ui/fx_dust`) and a minecart (`ui/fx_minecart`, cut out of the background) rolling smoothly along the rail every ~18 s.
    The menu content slides up when a menu opens. Effect positions are texel coordinates of `menu_bg.png`
    (`LIGHTS`, `GEMS`, `RAIL` in the generator) - update them if the background is repainted.
  - Icons: every button has a 16x16 icon on the left that bobs while the button is selected. Real buttons pass a
    texture as the form button icon (`icon('play')` -> `ui/icons/play`, or pick / ore / drill textures in the
    tablet); Navs have fixed icons in the generator (`icon=`, `back_icon=`). Icons: play, new_slot, sessions, session,
    exit, back, delete, upgrades, drills, rebirth, home, coin, lock.
- The mine (`BP/scripts/mine_builder.js`, config `mine`): every session plays in an enclosed underground cave, 31 x 31
  blocks around its plot centre (floor y 0, roof y 10), in a 16-wide grid at x/z 10000, y 80, 48 blocks apart.
  - Hall about 27 x 20 with rough rock walls (stone, andesite, tuff, cobbled deepslate, deepslate, a bit of mossy
    cobblestone, all chosen by seeded noise so a plot always looks the same), a ceiling 7-9 high in deepslate, tuff and
    dripstone with stalactites, three spruce arches with hanging lanterns, lanterns on chains, froglights in the roof.
  - North: the **ore vein** (x -6..6, z -12..-9, y 1..4) in a timber frame, gravel rubble in front of it.
  - Sides: **drill pads** (polished tuff in deepslate-tile frames, x 9..12 on both sides, z -4..6): drills can only
    stand on a pad.
  - South: a rail track runs from a dark tunnel (timber frame, blackstone back) over a spruce landing with barrels to
    the vein. Players arrive on the rails at z 10 looking at the vein; their respawn point is set there.
  - Built across ticks with `system.runJob` while the loading screen shows: one teleport to the arrival spot first
    (teleports close menus), a safety floor under it, then the plan (computed across ticks too) goes in column by
    column bottom-up - never a solid block where the player stands - and hanging/attached blocks (lanterns, chains,
    stalactites, rails) go in last, top-down. Block ids are checked at runtime with fallbacks (`minecraft:chain` became
    `minecraft:iron_chain`; old versions get plain blocks where a state is unknown).
  - Each plot record stores the layout `version` it was built with; a session whose mine is older than
    `CONFIG.mine.version` (old floating platforms are version 1) gets it rebuilt on entry, and drills that stood in it
    go back to the inventory.
  - Protection: only the owner breaks blocks in a mine, and only ores and drills; only drills can be placed (on pads,
    in the active session's mine). Drills in your other session's mine can't be broken from this one.

## Roadmap (built step by step)
- [x] **Foundation:** project from the tycoon template, rethemed to mining (drills, Miner's Tablet, texts).
- [x] **Menu look:** pixel-art logo, button icons, animated background (pan, lanterns, gems, dust, minecart).
- [x] **Pack icon:** cave, logo and a gold pick striking gold ore (BP and RP).
- [ ] **Look:** pixel-art drill textures, Miner's Tablet icon.
- [ ] **Ore feel:** mining particles/sounds; drills that visibly mine the vein.
- [ ] **Growing mine (idea):** mine upgrades make the cave bigger / add chambers, rebirth layers change its look.
- [x] **Start menu + plots:** full-screen join menu (Play / Create session / Exit), private mine plots, drills only in your own mine.
- [x] **Underground mine:** enclosed cave with timber arches, lanterns, rails, an ore vein in the north wall and drill
  pads; old platforms are rebuilt automatically.
- [x] **Sessions:** 2 save slots per player with a full-screen slots menu; stone & gold menu buttons.
- [x] **One-form menus:** start menu, sessions, delete + confirm and the Miner's Tablet (shop, rebirth) switch pages
  without closing.
- [x] **Hand mining:** ore field in every mine, picks, mine levels, ore value; drills become automation (locked until
  mine level 3). Prices are placeholders (see Balance notes).
- [ ] **Balance pass:** tune all prices from real play (see Balance notes).
- [ ] **Ore bag (idea):** ores go into a bag with a capacity upgrade and are sold at a seller, instead of instant cash.
- [ ] **Depth layers:** rebirths unlock deeper layers (Stone -> Deepslate -> Magma Core) with new ores and drill tiers.
- [ ] **Extras:** offline earnings, leaderboard, daily bonus.
