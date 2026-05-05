# Decker — Latency Testing Tool

Quick start (2 terminals): `cd /Users/stevie/Desktop/Decker/agent && npm start` and `cd /Users/stevie/Desktop/Decker/mobile && npx expo start --lan --clear`

Measures real WebSocket round-trip time between an iPhone and a Mac on the same local Wi-Fi network.

```
iPhone (Expo Go)  ──── Wi-Fi ────  Mac (Node.js agent)
        ←── ping/pong ───→
```

---

## Prerequisites

- Mac and iPhone on the **same Wi-Fi network**
- Node.js 18+ installed on the Mac
- [Expo Go](https://apps.apple.com/app/expo-go/id982107779) installed on the iPhone

---

## 1 · Install dependencies (once)

From the project root:

```bash
npm run install:all
```

This installs both the Mac agent's deps and the mobile app's deps.

---

## 2 · Start everything

```bash
npm run dev
```

This single command starts:
- The **Mac agent** (WebSocket + `GET /health` on port 4242). Each tap from the iPhone prints a new line in this terminal.
- **Expo Metro** dev server. It will print a QR code.

To stop both: `Ctrl+C`.

> Prefer two terminals? You can still run them separately:
> ```bash
> # terminal 1
> cd agent && npm start
> # terminal 2
> cd mobile && npx expo start
> ```

---

## 3 · Open the app on iPhone

1. Open **Expo Go** on the iPhone (same Wi-Fi as the Mac).
2. Scan the QR code from the terminal **— or** tap *Enter URL manually* and type `exp://<your-mac-ip>:8081` (the IP is printed by the agent on startup).
3. The first time iOS will ask for *Local Network* permission — allow it.
4. The app loads, scans the subnet, finds the agent automatically, and opens the latency screen.

---

## 4 · Test latency

Once the app connects (usually within a few seconds — it pings every IP in your /24 subnet in parallel batches):

| UI element | Description |
|---|---|
| Large number | Current round-trip time in ms |
| Color | Green < 20 ms · Yellow < 60 ms · Red > 60 ms |
| MIN / AVG / MAX | Running statistics |
| Bar chart | Last 40 pings visualized |
| **TAP TO PING** | Send a single ping |
| Auto-ping toggle | Continuous pinging at selected interval (100ms – 2s) |
| Event log | Timestamped record of every ping |

### Manual connection fallback

If the subnet scan finds nothing (different network segments, weird Wi-Fi, agent not running), the app shows a text field. Enter your Mac's local IP address (shown in the agent terminal output) and tap **Connect**.

---

## Architecture

Two separate codebases because two separate machines run them — the Mac runs the Node agent, the iPhone runs the Expo app inside Expo Go. They talk over WebSocket.

```
package.json        Top-level launcher (`npm run dev`, `npm run install:all`)

agent/
  index.js          WebSocket + HTTP server (also publishes _decker._tcp via mDNS)
  package.json

mobile/
  src/
    App.tsx             Root — switches between discovery and latency screens
    useDiscovery.ts     Reads device IP via expo-network, probes /24 subnet on port 4242
    useWebSocket.ts     Thin WebSocket hook
    usePing.ts          Ping/pong state, RTT calculation, history
    LatencyChart.tsx    Bar chart (react-native-svg)
    LatencyScreen.tsx   Main testing UI
    DiscoveryScreen.tsx Scanning / manual-IP UI
  app.json              Expo config with NSLocalNetworkUsageDescription for iOS
  package.json
```

### Message protocol

```jsonc
// Client → Server
{ "type": "ping", "id": 42, "ts": 1700000000000 }

// Server → Client
{ "type": "pong", "id": 42, "clientTs": 1700000000000, "serverTs": 1700000000003 }

// Server → all clients (on connect/disconnect)
{ "type": "peers", "count": 1 }
```

RTT = `Date.now()` at pong receipt − `ts` sent in ping.
