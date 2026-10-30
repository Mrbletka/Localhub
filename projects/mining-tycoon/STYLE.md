# Studio style - "Stone & Gold"

The look and feel of our add-ons, first built for Mining Tycoon. Reuse it so every game from the studio feels like ours:
dark carved stone, warm gold, crisp pixel art, short friendly words, and the screen always telling you what to do next.

## Palette
| Role | Colour | Used for |
|---|---|---|
| Outline | `#120d08` | 1 px outline around every icon, panel and button |
| Stone dark | `#2a211a` / `#30261d` | panel fill (see-through on the HUD: alpha 215) |
| Stone mid | `#5a5650` / `#74716e` | machine bricks, frames |
| Gold light | `#ffe08a` | lit edge (top-left), highlights, sparkles |
| Gold | `#d9a640` | rims, money, titles |
| Gold dark | `#8a6420` | shaded edge (bottom-right) |
| Good | `§a` green | what you have / done |
| Missing | `§c` red | what you still need, warnings |
| Info | `§7` grey, `§f` white | detail lines, values |
| Quest | `§b` aqua | tutorial quest lines |

Light always comes from the top-left: lighter rim top/left, darker bottom/right.

## Pieces
- **Panels** (`ui/hud_panel`, nine-slice 4): dark see-through stone, 1 px gold rim, outline. HUD boxes.
- **Banners** (`ui/hud_toast`, nine-slice 4): 2 px gold rim with bright corner studs. Toasts: gold first line, white
  second line, centred under the HUD.
- **Buttons** (`ui/button`, `button_hover`, `button_pressed`): stone & gold, gold text, icon on the left that bobs when
  selected, up to 2 lines (second line grey detail). Menus are full screen with the cave background and the logo.
- **Icons**: 16 x 16, bold shapes, 1 px dark outline, 3-4 shades per material, shown at 10-16 px. Gold = money, red flag
  = goal, lantern = light/expedition, backpack = haul.
- **Models**: chunky blocky furniture (`tools/gen_models.py`), one shared 16 x 16-tile atlas; "picture" tiles (furnace
  mouth, blades, signs) drawn whole, material tiles (bricks, planks, steel) cropped so texels stay one size. Things
  that work, move: animated `_on` blocks (fire, rollers, blades).
- **Particles**: gold sparkles (`mining_tycoon:guide` marks where to go, `mining_tycoon:burst` celebrates a reward).
  Full bright, fade out, never block the view.

## Accent: MINE-OS (tech)
For the one screen that should feel like advanced technology (the welcome menu): dark glass over the world, cyan
`#5ff6ff` light with the studio gold kept for titles and selection, scanlines, a vignette, chamfered glass panels,
corner brackets, typed monospace-style boot lines, holograms and radars rendered as frame strips (`tools/gen_tech.py`),
a CRT power-on, and a rare RGB-split glitch. Use it sparingly: it is the "wow" moment, the rest stays stone & gold.

## Words
- Short, plain, friendly. Tell the player what to do: "Mine 5 Coal at the vein", "Get back to the lift!".
- Numbers short: `$1.23K`, `3:30`, `12/48`.
- Every screen answers "what next?": the HUD goal line, the quest, the marker, the tablet.

## Behaviour
- Never leave the player guessing: a marker over the next place, a toast for every reward, a reason for every refusal.
- Menus: at most 4 buttons plus Close on one page (they must fit a phone); sub-pages switch inside the form.
- Nothing may break the game: every loop isolates players (`lib/safe.js`), refusals instead of lost items, migrations
  for old saves, and a chaos test before every release.
