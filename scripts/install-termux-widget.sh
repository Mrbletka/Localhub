#!/usr/bin/env bash
# Adds a "Bedrock Studio" shortcut to Termux:Widget. Tapping it starts the studio server and
# opens the IDE; the server stops by itself about 45 seconds after the last studio window closes.
set -euo pipefail

if [ -z "${TERMUX_VERSION:-}" ] && [[ "${PREFIX:-}" != *com.termux* ]]; then
  echo "Run this inside Termux on Android (for a PC, use: npm run app)."
  exit 1
fi

STUDIO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NAME="Bedrock Studio"
SHORTCUTS="$HOME/.shortcuts"
TASKS="$SHORTCUTS/tasks"
ICONS="$SHORTCUTS/icons"

mkdir -p "$TASKS" "$ICONS"
# Termux:Widget only runs scripts from folders it can read and enter.
chmod 700 "$SHORTCUTS" "$TASKS" "$ICONS"

# Scripts in tasks/ run in the background, so no terminal window pops up.
cat > "$TASKS/$NAME" <<SCRIPT
#!$PREFIX/bin/bash
# Bedrock Studio launcher (written by $STUDIO_DIR/scripts/install-termux-widget.sh).
cd "$STUDIO_DIR" || exit 1
mkdir -p .localhub
LOG=.localhub/server.log
if [ -f "\$LOG" ] && [ "\$(wc -c < "\$LOG")" -gt 1000000 ]; then : > "\$LOG"; fi
termux-wake-lock
node server/index.js --app >> "\$LOG" 2>&1
termux-wake-unlock
SCRIPT
chmod 700 "$TASKS/$NAME"

# Icon for the 1x1 home screen shortcut: ~/.shortcuts/icons/<script name>.png
cp "$STUDIO_DIR/public/icon-192.png" "$ICONS/$NAME.png"
chmod 600 "$ICONS/$NAME.png"

cat <<DONE
Installed the "$NAME" shortcut.

Next steps:
  1. Install Termux:Widget from the same place you got Termux (F-Droid or GitHub - they must match).
  2. Long-press your home screen > Widgets > Termux:Widget.
     Pick the 1x1 "Termux shortcut" and choose "$NAME" to get the app icon,
     or add the list widget and tap "$NAME" there.
  3. Tap it: the studio starts and opens. Close the studio and the server stops on its own.

Server log: $STUDIO_DIR/.localhub/server.log
DONE
