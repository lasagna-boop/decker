# Decker — Stream Deck killer app

Mobile app (iPhone) + Mac agent. Phone becomes a fully programmable macro pad — tap buttons to trigger actions on your Mac over local Wi-Fi. No hardware required, no subscription, free.

## Quick start

```bash
# Terminal 1 — Mac agent
cd /Users/stevie/Decker/agent && npm start

# Terminal 2 — Mobile dev server
cd /Users/stevie/Decker/mobile && npx expo start --lan --clear
```

Open Expo Go on iPhone → scan QR → app auto-discovers Mac on local network.

## Architecture

```
iPhone (Expo Go / React Native)  ──── WebSocket ────  Mac (Node.js agent)
         buttons / UI                                  executes actions
```

```
Decker/
  agent/          Node.js — WebSocket server, executes OS actions
  mobile/         React Native (Expo) — button UI, sends commands
  package.json    Root scripts: dev, install:all
```

## Message protocol

```jsonc
// Mobile → Agent
{ "type": "action", "id": "open-chrome" }
{ "type": "ping", "id": 42, "ts": 1700000000000 }

// Agent → Mobile
{ "type": "pong", "id": 42, "clientTs": 1700000000000, "serverTs": 1700000000003 }
{ "type": "peers", "count": 1 }
{ "type": "ack", "id": "open-chrome", "ok": true }
```

## Current state

- [x] WebSocket connection phone ↔ Mac
- [x] mDNS auto-discovery (no manual IP)
- [x] Launch apps on Mac from phone
- [x] List running processes
- [ ] Button grid UI
- [ ] Action config persistence
- [ ] Media controls (play/pause/skip/volume)
- [ ] Macros (chained actions)
- [ ] Dynamic button state (icons change on state)
