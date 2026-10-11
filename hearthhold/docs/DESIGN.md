# Hearthhold: Game Design Doc (living)

> Colony simulator for Minecraft Bedrock. Shipped as a `.mcworld` from the website.
> Runs in singleplayer, LAN, and Realms.
> Status: **brainstorm v0.1**. Everything here can change.

Reference art: [`ui/ui-kit-v0.3.png`](ui/ui-kit-v0.3.png) · [`ui/welcome-new-player.png`](ui/welcome-new-player.png) · [`ui/welcome-returning-player.png`](ui/welcome-returning-player.png)

---

## 0. Pitch & pillars

**"Build a colony that runs itself."** You're the Mayor of a floating island. Settlers chop, mine and fish
while you plan, build and protect them. Come back later and the island has a story to tell you.

| Pillar | Means | Shows up as |
|---|---|---|
| **The diorama is the news** | The island itself tells you what happened | Numbered pins on the island that match the "Since you left" list |
| **Runs without you** | Progress continues while you're offline | Catch-up simulation on rejoin |
| **Settlers are people** | Names, families, traits, injuries | "Mira had a baby, Tobin" |
| **Wood · Stone · Water** | Three resources and three skills cover everything | Lumber / Mining / Fishing |
| **Solo → Together → Compete** | The same world works for 1 to 10 players | Colonies in a shared Realm, world leaderboard |

---

## 1. Platform reality check ⚠️

What a `.mcworld` on singleplayer, LAN or Realms **can** and **can't** do. Some parts of the menu design depend on this.

### ✅ Works
- **Script API** (`@minecraft/server`, `@minecraft/server-ui`) on all three targets. **Stable APIs only.** Realms + experiments isn't a risk worth taking.
- **World dynamic properties** for saving all game data (JSON strings).
- **Custom forms + JSON UI resource pack**, so menus can be restyled into the Hearthhold look ("form flagging" by title prefix).
- **Camera control** (`camera` command / API). The live island can sit behind the menu instead of a fake picture.
- **Real-world time** (`Date.now()`) for dailies, events and offline catch-up.
- **Custom entities/blocks/items** for settlers, pins and resource nodes.
- **Structures** (`world.structureManager` / `/structure`) for buildings and islands.

### ❌ Doesn't work (and the fix)
| In the mockup | Problem | Redesign |
|---|---|---|
| "128 settlers online", "12 online" | No internet access from the world (`server-net` is BDS-only) | "**N Mayors in this world**" / "settlers in this world" |
| Open Colonies / Browse / Join code | No cross-world connections | Colonies **inside the same world** (Realm/LAN). Join code = an invite to someone's colony in this world |
| Top 100 | No global server | **World leaderboard** (Top 10 in this world) + "Personal best" history |
| Friends tab | No access to the Xbox friends list | "Played with": Mayors you've shared a colony with |
| Live event timers | No server to push events | **Calendar-driven events**: the schedule ships in the pack, keyed by real-world week |
| LB/RB switch panel, custom A/X/Y/B hints | Forms only support basic controller navigation | Tabs as buttons; button hints only shown when a controller is detected (best-effort) |

### ⏱️ Realms sleep
A Realm doesn't tick when it's empty, and singleplayer doesn't tick when it's closed.
→ **The colony sim is abstract data, not live mobs.** On join we compute `now - lastSeen` and run a catch-up sim
(capped by Storehouse level). That produces the **"Since you left · 9 hours"** list. This is a feature, not a workaround.

---

## 2. World layout

```
 void world, sky = night/purple palette

   [Lobby island]  ← spawn, welcome camera shot, notice board
        │
   ┌────┴─────────────────────────────┐
   Colony slot 1   slot 2   slot 3 … slot 8      (grid, ~1000 blocks apart)
   each slot = home island + 0..4 expansion islets
```

- **Lobby island**: where everyone spawns. The welcome menu camera orbits *your* island (or the "Unclaimed island" for new players).
- **Colony slots**: pre-reserved coordinates. Claiming a slot loads a starter island structure with a biome theme
  (Pine Forest, Birch Woods, Snowy Peaks, Dry Mesa, …) that matches the colony cards in the mockup.
- **Expansion islets**: the small floating islands in the menu background. Unlocked with bridges and surveys.
- Max colonies per world: 8 (Realms caps at 10 online, so this is plenty).

---

## 3. Core loops

```
SECONDS   Mayor acts: chop/mine/fish by hand, place blueprint, assign settler
             │ (quest progress, boosts)
MINUTES   Settlers work → Wood / Stone / Fish flow into Storehouse
             │
HOURS     Spend → build & upgrade buildings → more beds/jobs → more settlers
             │      Story events happen (good news / danger / new life)
DAYS      Rathouse levels → new zones, islets, jobs. Daily streak, weekly events
             │
WEEKS     Prestige: "Found a new colony" on a new biome, keep Heirlooms
```

**Active vs idle split:** idle carries the economy, active gives multipliers. A Mayor working next to settlers
gives "Inspired: +25% to the job you're helping".

---

## 4. Systems

### 4.1 Resources
| Resource | Source | Used for |
|---|---|---|
| 🪵 **Wood** | Lumber (forests) | Buildings, tools, bridges |
| 🪨 **Stone** | Mining (quarry) | Upgrades, walls, Rathouse |
| 🐟 **Fish** | Fishing (dock) | **Food** for settlers (upkeep), growth |
| 🪙 **Coins** | Market sales, quests, daily | Blueprints, speed-ups, cosmetics |
| 🌰 **Acorns** | Rare: quests, events, milestones, diamond veins | Premium-feel currency: Wardrobe, rerolls, rescue |
| ✨ **Mayor XP** | Everything | Mayor level (account-ish progression per world) |

Storehouse sets a **cap** per resource. The cap is the main reason to come back.

### 4.2 Settlers
- **Card:** name, portrait (skin variant), age stage (child → adult → elder), job, skill level, 2 traits, mood, home.
- **Traits** (pick 2 when they arrive): *Strong* (+mining), *Patient* (+fishing), *Hardy* (raid resist), *Lazy* (-10%, +mood),
  *Lucky* (rare finds), *Homesick* (needs a nice house), *Brave* (guard bonus), *Nimble* (+lumber).
- **Needs:** bed + food. If they're missing, mood drops, then the settler is idle, then they leave.
- **Arrival:** a free bed + food surplus + Rathouse "Welcome" timer → *"A new settler arrives!"*
- **Families:** two adults in a house with a free bed → chance of a baby → child grows up in N in-game days.
- **Injury/recovery:** danger events can hurt settlers (off work X hours, a Healer speeds this up).
- **Idle settlers** trigger the orange **Action Alert** ("2 settlers are idle · Assign").

### 4.3 Jobs & skills
| Job | Unlock | Skill | Notes |
|---|---|---|---|
| Lumberjack | start | Lumber | Forests deplete, then regrow (replant upgrade) |
| Miner | start | Mining | Quarry depth = tier; deep veins = rare finds |
| Fisher | start | Fishing | Dock size = slots; night fishing bonus |
| **Scout** | Rathouse 2 | (none) | **Surveys** `? Unsurveyed` zones: reveals yield + risk |
| Builder | Rathouse 2 | (none) | Building speed |
| Guard | Rathouse 3 | (none) | Danger defense at night |
| Cook | Rathouse 3 | (none) | Fish → Meals (×2 food value) |
| Healer | Rathouse 4 | (none) | Injury recovery |

Skill XP is per colony (Lumber Lv 3 etc.). Each level gives +yield% and unlocks a perk choice every 5 levels.

### 4.4 Buildings
Placed on **pre-defined plots** (snap points on the island) so settlers and AI paths stay sane.
Players can still build anything freely for decoration.

| Building | Does | Max Lv |
|---|---|---|
| **Rathouse** | Colony level. Gates everything | 10 |
| House | +beds | 5 |
| Storehouse | Resource caps + **offline cap hours** | 5 |
| Lumber Camp / Quarry / Dock | Job slots + yield | 5 |
| Kitchen | Meals | 3 |
| Watchtower / Walls | Danger defense | 5 |
| Workshop | Tool tiers → global yield multiplier | 5 |
| Market | Sell resources for coins (daily price swing) | 3 |
| Bridge | Unlocks an expansion islet | (none) |

**Construction visual:** the structure loads in stages (scaffold 25% → 50% → 75% → done) while builder settlers stand around it.

### 4.5 Story events (the "Since you left" engine)
Every sim hour rolls on weighted tables (modified by traits, defenses, season). Each event gets a **number + colour + pin** on the island.

| Type | Colour | Examples |
|---|---|---|
| Good news | 🟨 gold | Diamond vein (+ore, +acorns), Big catch, Travelling merchant |
| New life | 🟩 green | Baby born, Settler arrives, Couple moves in |
| Danger | 🟥 red | Drowned raid on dock, Zombie night, Storm breaks nets, Fire |
| Idle | 🟧 orange | ×N settlers idle, Storehouse full |
| Unknown | (none) | `? Unsurveyed forest` (not an event, an invitation) |

Danger events are **soft**: they never wipe progress. Worst case is injuries, broken buildings (repair cost) or lost resources.

### 4.6 Progression layers
1. **Mayor level** (per player, per world): unlocks cosmetics, colony perks, plus profile badges.
2. **Colony level** = Rathouse level: unlocks jobs, buildings, islets.
3. **Prestige** ("Found a new colony"): reset the island, keep **Heirlooms** (permanent perks), pick a new biome.
   Prestige I, II, III badge on the profile chip.

### 4.7 Daily / quests / events
- **Daily reward:** 7-day streak (day 7 = acorns + cosmetic). Missing a day steps you back 1 day instead of resetting to 0.
- **Today's quests:** 3 per day, reset at local midnight. Mix of active ("Chop 200 logs") and colony goals.
- **First Steps:** the onboarding chain for new players (Claim island → Build Rathouse → Welcome 3 settlers → …).
- **Calendar events** (rotate weekly, baked in):
  Harvest Week (2× yield) · Blood Moon (raids ↑, loot ↑) · Fishing Derby · Founders' Fair (market prices ↑) · Snowfall (winter cosmetics).

### 4.8 Multiplayer
- **Up to 4 Mayors per colony** (co-op, shared resources, each has their own Mayor XP).
- Colony privacy: **Public** (anyone in world can join) / **Invite** (join code) / **Private**.
- Colonies in one world: visit, **trade post** (swap resources), compete on the world leaderboard.
- No PvP griefing: other colonies' islands are protected (build/break blocked by script).

### 4.9 Wardrobe
Bedrock can't change a player's real skin from a pack, so cosmetics are **attachables**: hats, capes, backpacks, tool skins.
Plus colony cosmetics: banners, Rathouse roof colours, settler outfits.

---

## 5. Screen map

```
WELCOME (camera on your island, menu overlaid)
├── PLAY / START ─────────► teleport to island, gameplay HUD
├── Browse ───────────────► Colonies in this world (Open / Invited / Played with)
├── Join code ────────────► enter 4-char code
├── Guide ────────────────► how-to pages (wood/stone/water, settlers, buildings)
├── Wardrobe ─────────────► cosmetics, acorn shop
├── Top (world) ──────────► leaderboard: colony value, prestige, derby…
├── Daily reward [Claim]
├── Today's quests / First steps
├── Your colony panel ────► (returning) quick stats + Assign shortcut
├── Since you left ───────► each item → camera flies to its pin
└── ⚙ Settings

IN-GAME
├── HUD: coins, acorns, Mayor chip, event banner, action alert, skill rows
├── Mayor's Ledger (item/hotkey) ─► the hub menu while playing
│   ├── Settlers ─► list ─► Settler card (assign job, house, trait info)
│   ├── Build ────► plot picker ─► blueprint ─► confirm
│   ├── Colony ───► Rathouse upgrade, skills, perks, storage
│   ├── Map ──────► islets, surveys
│   ├── Market / Trade post
│   └── Quests / Events
└── Interact with a building/settler in-world = shortcut into the same menus
```

---

## 6. Tech architecture (first pass)

```
behavior_pack/
  scripts/
    main.ts            bootstrap, event wiring
    data/store.ts      dynamic-property JSON store (chunked, versioned, migrations)
    sim/tick.ts        live sim (every ~5 s, budgeted)
    sim/catchup.ts     offline sim: same rules, big dt, event rolls
    sim/events.ts      story event tables
    colony/*.ts        settlers, jobs, buildings, storage
    ui/forms/*.ts      one file per screen, title-prefixed for JSON UI
    ui/camera.ts       welcome orbit, fly-to-pin
    world/islands.ts   slot allocation, structure loading, protection
  entities/ settler, pin_marker, …
resource_pack/
  ui/server_form.json  Hearthhold skin (form flagging by title prefix)
  ui/hud_screen.json   currency/alert/banner via title/actionbar channels
  textures/ui/…        9-slice wood/stone/night/live/gold materials
```

**Rules of thumb**
- Sim state lives in data, entities are **puppets**. Spawn at most ~12 visible settlers near a Mayor; everything else stays abstract.
- **Same code path** for live tick and catch-up (just a different `dt`), so idle results can't drift.
- Save on change + every 60 s. Every save has a version number for migrations.
- No ticking areas needed (there are only 10 per world anyway), because the sim doesn't need loaded chunks.
- Use the UI kit materials as 9-slice textures: wood = do, stone = go, night = know, live = now, gold = earn.

---

## 7. Open questions
- [ ] Hand gathering: should the Mayor actually break blocks (real Minecraft), or only click/interact?
- [ ] Free building on your island, or plots only?
- [ ] Offline cap: 8 h at start → 24 h max?
- [ ] Danger: can settlers die, or only get injured?
- [ ] Monetisation (website donations? none?). This affects how acorns feel.
- [ ] Target min Minecraft version (affects which stable APIs we can use).
- [ ] Phone performance budget (entities per island).

---

## Changelog
- **v0.1**: initial brainstorm from welcome-menu mockups + UI kit v0.3.
