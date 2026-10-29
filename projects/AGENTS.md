# Localhub Bedrock Studio workspace

Every folder here is a Minecraft Bedrock add-on project made with Localhub Bedrock Studio.

```
<project>/
  project.json   name, type, namespace, version [x,y,z], library metadata
  DESIGN.md      the living design doc - read it first, keep it current
  BP/            behavior pack: manifest.json, scripts/ (@minecraft/server), items/, blocks/, entities/, recipes/, loot_tables/
  RP/            resource pack: manifest.json, textures/ (+ item_texture.json, terrain_texture.json), texts/en_US.lang
  .studio/       studio data (agent chats) - do not edit
```

Bedrock add-on ground rules (always follow):
- A project = folder with BP/ (behavior pack) and RP/ (resource pack), each with manifest.json, plus project.json and DESIGN.md.
- Every header and module UUID is unique and never changes after release. Generate new ones (new_uuid tool, or `node server/cli.js uuid`); never invent them.
- Identifiers are "namespace:name", lowercase, using the project namespace. Never use "minecraft:" for new content.
- Scripts target @minecraft/server 2.0.0 and @minecraft/server-ui 2.0.0 (stable, no experiments). Imports need the full ".js" file name. No npm packages, no Node APIs, no setTimeout/setInterval (use system.runTimeout/runInterval).
- Scripts run in early execution: subscribe to events at the top level, but read/write world state only inside events, system.run callbacks or world.afterEvents.worldLoad.
- Every item icon key must exist in RP/textures/item_texture.json, every block texture key in RP/textures/terrain_texture.json, and every PNG they point to must exist. Display names go in RP/texts/en_US.lang.
- Validate after changes (validate_project tool, or `node server/cli.js validate <slug>`) and fix every error before you finish.

Tools: the studio server exposes validation, packaging, texture painting and Bedrock reference docs over MCP
(`claude mcp add --transport http localhub http://127.0.0.1:3737/mcp`) and plain HTTP (`GET /api/tools`,
`POST /api/tools/<name>` with `{ "input": { ... } }`). Run validate_project after every change.
