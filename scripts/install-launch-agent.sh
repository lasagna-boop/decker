#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_DIR="$ROOT_DIR/agent"
LABEL="com.decker.agent"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs"
OUT_LOG="$LOG_DIR/decker-agent.log"
ERR_LOG="$LOG_DIR/decker-agent.err.log"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found in PATH. Install Node first."
  exit 1
fi

if [ ! -f "$AGENT_DIR/index.js" ]; then
  echo "Agent not found at $AGENT_DIR/index.js"
  exit 1
fi

if [ ! -d "$AGENT_DIR/node_modules" ]; then
  echo "Installing agent dependencies..."
  (cd "$AGENT_DIR" && npm install)
fi

if [ ! -x "$AGENT_DIR/decker-pointer" ]; then
  echo "Building decker-pointer (trackpad helper)..."
  swiftc -O "$AGENT_DIR/pointer.swift" -o "$AGENT_DIR/decker-pointer"
fi

NODE_BIN="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${AGENT_DIR}/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${AGENT_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
</dict>
</plist>
EOF

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}" "$PLIST_PATH" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_PATH"
launchctl enable "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}"

echo ""
echo "Decker agent installed and started."
echo "  Plist : $PLIST_PATH"
echo "  Logs  : $OUT_LOG"
echo "  Health: http://<your-mac-ip>:4242/health"
echo ""
  echo "  If VideoPlay buttons fail, grant Accessibility to:"
  echo "    ${NODE_BIN}"
  echo "    ${AGENT_DIR}/decker-pointer"
  echo "    System Settings → Privacy & Security → Accessibility"
echo ""
echo "To remove: npm run agent:uninstall"
