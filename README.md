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

Open the file in a browser; no build step. In game, use the chosen item (compass
by default) or run `/scriptevent <namespace>:open <menu>` to open a menu.
