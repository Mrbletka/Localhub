# Localhub
a Local hub for services

## Bedrock Menu Maker

`menu-maker/index.html` is a single-page tool for building Minecraft Bedrock
Script API menus (`@minecraft/server-ui` forms) without writing code.

- **Button menus** (`ActionFormData`): buttons with icons that run commands or open other menus
- **Input forms** (`ModalFormData`): text boxes, dropdowns, sliders and toggles; use `{key}` in commands to insert values
- **Yes/No dialogs** (`MessageFormData`)
- Live in-game style preview with `§` colour codes
- Generates `scripts/main.js` + `manifest.json` and downloads a ready-to-import `.mcpack`
- Targets Script API 2.0 (Minecraft 1.21.90+) or 1.x for older worlds
- **Import** a `.mcpack`, `.mcaddon`, `.zip`, `main.js`, project `.json`, or pasted code:
  - Packs and scripts made by the tool load back exactly (the project is stored in a comment at the end of `main.js`)
  - Hand-written or hand-edited scripts are parsed: titles, bodies, buttons, icons, fields, commands
    (`runCommand`/`runCommandAsync`), and which button opens which menu. Try `menu-maker/examples/warps.js`.

Open the file in a browser; no build step. In game, use the chosen item (compass
by default) or run `/scriptevent <namespace>:open <menu>` to open a menu.
