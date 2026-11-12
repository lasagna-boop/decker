#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MAC_DIR="$ROOT_DIR/mac"
BIN="$MAC_DIR/DeckerMac"
APP_DIR="$MAC_DIR/DeckerMac.app"
CONTENTS="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS/MacOS"
PLIST="$CONTENTS/Info.plist"

export DECKER_ROOT="$ROOT_DIR"

echo "Building DeckerMac…"
swiftc -O -parse-as-library \
  -framework AppKit \
  -o "$BIN" \
  "$MAC_DIR/DeckerMac.swift"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"
cp "$BIN" "$MACOS_DIR/DeckerMac"
chmod +x "$MACOS_DIR/DeckerMac"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Decker</string>
  <key>CFBundleDisplayName</key>
  <string>Decker</string>
  <key>CFBundleIdentifier</key>
  <string>com.decker.mac</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleExecutable</key>
  <string>DeckerMac</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
EOF

pkill -x DeckerMac 2>/dev/null || true
sleep 0.3

echo "Opening Decker window…"
open "$APP_DIR"
