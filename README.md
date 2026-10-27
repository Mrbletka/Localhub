# Localhub · Bedrock Studio

A local Node.js workspace and mobile-first IDE for building **Minecraft Bedrock add-ons with a team of AI agents**:
modpacks, simulators, tycoons and anything else you can describe. It runs on your phone (Android + Termux) or your PC,
keeps every file on your device, and exports a ready-to-upload library for your own website.

- **AI studio team**: a Studio Director that designs the add-on and delegates, in parallel, to a Script Engineer,
  Content Designer, Pixel Artist, Economy Designer and QA Tester. They run on Claude (Opus 5.5 by default).
- **Agents read and write your workspace** through sandboxed tools: files, search, validation, packaging, a
  pixel-art texture painter and a built-in Bedrock reference. External agents (Claude Code, Claude Desktop, any
  MCP client) get the same tools over MCP or plain HTTP.
- **Phone-friendly IDE**: file tree, code editor with a symbol bar, texture previews, live agent chat, build
  and publish. Add it to your home screen and it behaves like an app.
- **Ships real add-ons**: a validator for the mistakes that break packs, `.mcaddon` / `.mcpack` builds that
  import with one tap, and a static gallery + `library.json` for your studio site.

## Quick start

You need Node.js 20 or newer and an [Anthropic API key](https://console.anthropic.com/).

### Android (Termux)

```sh
pkg update && pkg install nodejs-lts git
git clone https://github.com/mrbletka/localhub && cd localhub
npm install
termux-wake-lock        # optional: keeps agents running with the screen off
npm start
```

Open `http://localhost:3737` in Chrome on the phone, tap the title to create a project, add your API key in
Settings (⚙), describe your idea and send it. When a build finishes, tap the `.mcaddon` download in the Build
tab: Minecraft opens and imports both packs.

To keep projects on shared storage, run `termux-setup-storage` once, then start with
`node server/index.js --data ~/storage/shared/BedrockStudio`.

#### One-tap home screen icon (Termux:Widget)

```sh
npm run widget
```

Then install **Termux:Widget** from the same place you got Termux (F-Droid or GitHub; they must match),
long-press the home screen > Widgets > Termux:Widget, pick the 1x1 shortcut and choose **Bedrock Studio**.
It gets the studio icon. Tapping it starts the server in the background (no terminal window) and opens the
studio; about 45 seconds after you close the studio, the server stops by itself and releases the wake lock.
It keeps running while an agent is still working, and for 10 minutes after Claude Code last used the MCP
connection. Tapping the icon while it's already running just opens the studio again.

The link opens in your default browser. If Chrome offers **Install app** for the studio (menu > Install app /
Add to home screen), Android can open it in that app window instead of a tab. `npm run app` does the same on a
PC: opens the browser and stops when the tab is closed.

### PC (Windows, macOS, Linux)

```sh
git clone https://github.com/mrbletka/localhub && cd localhub
npm install
npm start               # http://localhost:3737
```

### iPhone/iPad, or a phone using a PC on your network

iOS can't run Node, so run the server on a PC and use the phone as the screen:

```sh
npm run lan             # same as: node server/index.js --host 0.0.0.0
```

The terminal prints a LAN link with an access token (`http://192.168.x.x:3737/?token=...`). Open it once on
the phone; the token is remembered. Network mode always requires the token.

## The studio team

| Agent | What they do |
|---|---|
| **Studio Director** | Turns your idea into a design (`DESIGN.md`), builds it, delegates separable work to specialists in parallel, integrates, validates and builds. |
| **Script Engineer** | Gameplay systems with `@minecraft/server` 2.x and forms (`@minecraft/server-ui`). |
| **Content Designer** | Items, blocks, entities, recipes and loot tables, fully wired to textures and lang files. |
| **Pixel Artist** | Paints textures and pack icons pixel by pixel, then looks at the result and repaints what reads poorly. |
| **Economy Designer** | Prices, income curves, rebirths and balance tables for simulators and tycoons, all in `config.js`. |
| **QA Tester** | Validates, reviews scripts for API misuse and exploits, fixes bugs and writes an in-game test checklist. |

You can talk to any agent directly; the chip row at the top of the Agents tab switches between them, and each
keeps its own chat history per project. Chats keep running on the server if your phone locks or loses the
connection; reopening the app reattaches to the live run.

## Projects and templates

`New project` offers four templates. Each one is a complete, importable add-on the agents then extend:

| Template | Contents |
|---|---|
| Blank add-on | Behavior + resource pack and a script entry point. |
| Content pack | Ruby item, ruby sword, ruby block and recipes: the base for modpack-style content. |
| Simulator | Power wand, simulator menu, sell / upgrade / rebirth loop, coins leaderboard. |
| Tycoon | Three generator tiers that pay every second, ownership protection, tablet shop, upgrades, rebirths. |

Every project lives in `workspace/<slug>/`:

```
project.json   name, type, namespace, version, library metadata
DESIGN.md      living design doc the agents keep current
BP/            behavior pack: manifest, scripts, items, blocks, entities, recipes, loot tables
RP/            resource pack: manifest, textures (+ registries), texts/en_US.lang
.studio/       agent chats (never packaged)
```

## Build, import, publish

- **Validate** checks manifests and UUIDs, identifiers and namespaces, texture and lang wiring, recipes and loot
  tables, script syntax, `.js` import paths, undeclared modules, and API-version mistakes (for example
  `worldInitialize` on `@minecraft/server` 2.x).
- **Build** writes `dist/<slug>/<slug>-vX.Y.Z.mcaddon` plus one `.mcpack` per pack. The version in
  `project.json` is stamped into both manifests, so bump it in one place (the Build tab can bump it for you).
- **Deploy** (optional, desktop): set your `com.mojang` folder in Settings to copy packs into
  `development_behavior_packs` / `development_resource_packs`, then run `/reload` in game.
- **Export library** builds every published project into `dist/library/`:
  - `index.html`: a responsive, searchable gallery with download buttons; upload the folder as-is.
  - `library.json`: the same data for your own site's code (`studio`, `items[]` with `name`, `type`, `version`,
    `summary`, `tags`, `icon`, `download`, `content` counts).
  - `dist/library.zip`: the whole folder in one file.

## Connect external agents

Claude Code, Claude Desktop or any MCP client can work in the same workspace with the same tools:

```sh
claude mcp add --transport http localhub http://localhost:3737/mcp
# network mode: add --header "Authorization: Bearer <token>"
```

Agents that don't speak MCP can use plain HTTP: `GET /api/tools` lists tools with JSON schemas, and
`POST /api/tools/<name>` with `{ "input": { ... } }` runs one. The workspace also contains `AGENTS.md` /
`CLAUDE.md` describing the layout and rules for agents that edit files directly. Changes made by any agent show
up live in the IDE.

## Settings and cost

Settings (⚙) holds the API key (stored only in `.localhub/config.json` on your device, never sent to the
browser), the Director and specialist models, effort levels (Director `high`, specialists `medium` by default)
and three API features, all on by default:

- **Progress notes** (`thinking.display: "updates"`): short notes between tool calls while agents work.
- **Fallbacks** (`fallbacks: "default"`): if a safety filter declines a benign request, the API retries on a
  recommended fallback model instead of failing.
- **Compaction**: very long chats are summarized server-side instead of overflowing the context window.

If your account rejects any of these, the studio retries without them automatically. Prompt caching is always
on, and agent histories are append-only so the cache stays warm. The meter under the chat shows tokens and an
estimated cost per chat; bigger features with several specialists cost more, so use lower effort or Sonnet for
quick tweaks.

## Security

- The server binds to `127.0.0.1` by default and only answers requests addressed to localhost from the same
  origin (protects against malicious websites and DNS rebinding).
- Network mode (`--host 0.0.0.0`) always requires a token (header, `?token=` or an HttpOnly cookie).
- Every file operation is confined to the workspace; built-in agents are confined to their project folder.
- Deleting a project moves it to `workspace/.trash/`.

## Development

```sh
npm test                # node:test suite, includes a full agent run against a mock Claude API
```

```
server/
  index.js              HTTP server, REST API, SSE, security guard
  workspace.js          sandboxed file access
  agents/               tool registry, agent roster, Claude agent loop, chat storage
  bedrock/              templates, pixel art, validator, packager, knowledge base, versions
  mcp.js                MCP endpoint
  library.js            website library export
public/                 the IDE (plain ES modules, no build step)
test/                   tests and the mock Claude API
```

Target versions for new projects (`@minecraft/server` 2.0.0, `@minecraft/server-ui` 2.0.0, min engine
1.21.90) live in `server/bedrock/versions.js`; stable script module versions keep working in newer game releases.
