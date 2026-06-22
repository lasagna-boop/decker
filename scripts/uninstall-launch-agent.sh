#!/usr/bin/env bash
set -euo pipefail

LABEL="com.decker.agent"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

if [ -f "$PLIST_PATH" ]; then
  launchctl bootout "gui/${UID_NUM}" "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "Decker launch agent removed."
else
  echo "No launch agent found at $PLIST_PATH"
fi
