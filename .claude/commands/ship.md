---
description: Release an add-on - validate, bump the version, build, push
argument-hint: <project slug> [patch|minor|major]
---
Release $ARGUMENTS:
1. `node server/cli.js validate <slug>` and fix every error.
2. Bump the version (default patch) with `node server/cli.js build <slug> --bump <part>`.
3. Update the "Ideas / TODO" and changelog notes in DESIGN.md, and the library summary in project.json if it changed.
4. Commit ("Release <name> vX.Y.Z") and push, then tell me the new version and what changed.
