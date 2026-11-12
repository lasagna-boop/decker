# Decker

iPhone remote + macro pad for your Mac over local Wi‑Fi.  
Expo Go app on the phone ↔ Node agent on the Mac (WebSocket `:4242`).

## Requirements

- macOS (agent runs here)
- Node.js 18+
- iPhone with [Expo Go](https://expo.dev/go) (SDK 58)
- Phone and Mac on the **same Wi‑Fi**
- Accessibility for VideoPlay / typing / trackpad:
  - System Settings → Privacy & Security → Accessibility
  - Enable **Node** and **`agent/decker-pointer`**

## One-time setup

From the repo root:

```bash
cd /path/to/Decker

# Install dependencies (agent + mobile)
npm run install:all

# Build trackpad helper (needed for cursor / clicks)
swiftc -O agent/pointer.swift -o agent/decker-pointer
```

Optional — start the Mac agent automatically on login:

```bash
npm run agent:install
# logs: ~/Library/Logs/decker-agent.log
# remove later: npm run agent:uninstall
```

## Run from terminal

### Option A — two terminals (recommended while developing)

**Terminal 1 — Mac agent**

```bash
cd /path/to/Decker/agent
npm start
```

You should see health URL like `http://<mac-ip>:4242/health`.

**Terminal 2 — Expo (phone UI)**

```bash
cd /path/to/Decker/mobile
npx expo start --lan --clear
```

On iPhone: open **Expo Go** → scan the QR code.  
App discovers the Mac on the LAN (favorites / primary Mac remembered after first connect).

### Option B — one command from repo root

```bash
cd /path/to/Decker
npm run install:all   # first time only
npm run dev
```

Starts agent + Expo together. For LAN QR, prefer Option A with `--lan`.

## Useful checks

```bash
# Agent alive?
curl http://127.0.0.1:4242/health

# Port busy?
lsof -ti :4242 | xargs kill -9

# LaunchAgent status (if installed)
launchctl print "gui/$(id -u)/com.decker.agent" | head
tail -f ~/Library/Logs/decker-agent.log
```

## Modes in the app

| Mode | Purpose |
|------|---------|
| **Deck** | Macro pad — launch apps / app actions |
| **VideoPlay** | Bed remote — play/seek/volume, Trackpad, Type, Fix win |

Switch via the burger menu. VideoPlay is the default.

## Layout

```
Decker/
  agent/     Node WebSocket server + OS actions (port 4242)
  mobile/    Expo / React Native UI
  scripts/   LaunchAgent install / uninstall
```

## Protocol (short)

```jsonc
// Phone → Mac
{ "type": "action", "id": "video-play-pause" }
{ "type": "action", "id": "type-text", "payload": { "text": "hi" } }

// Mac → Phone
{ "type": "ack", "id": "video-play-pause", "ok": true }
```
