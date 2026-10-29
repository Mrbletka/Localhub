---
description: Design and build a new Minecraft Bedrock add-on from an idea
argument-hint: <your idea, e.g. "volcano tycoon with lava generators">
---
Build a new, original Minecraft Bedrock add-on from this idea: $ARGUMENTS

1. Choose the best template (blank, modpack, simulator, tycoon) and a short name, then run
   `node server/cli.js new "<Name>" --template <template>`.
2. Write the concept, core loop, systems, content list and progression into the project's DESIGN.md.
3. Build it on top of the template so it is playable and polished. Hand independent parts to the
   bedrock-* sub-agents in parallel (scripts, content, textures, economy), each with its own files.
4. Run a QA pass with bedrock-qa, then `node server/cli.js validate <slug>` until it passes and
   `node server/cli.js build <slug>`.
5. Commit and push, then tell me in a few lines what you made and how to try it in game.
