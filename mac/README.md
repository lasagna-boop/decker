# Decker Mac

One window that starts **everything** the phone needs:

1. **Agent** — WebSocket + Bonjour on `:4242`
2. **Expo Metro** — phone UI on `:8081` (`exp://<mac-ip>:8081`)

App icon: `mac/assets/AppIcon.icns` (bundled into `DeckerMac.app` by `run.sh`).

## Run

```bash
cd /Users/stevie/Decker
./mac/run.sh
```

On launch the app auto-starts agent + Expo.  
UI shows Ready when both are up. Use **Stop everything** / **Restart**.

Closing the window stops both.

## Phone

1. Same Wi‑Fi as the Mac  
2. Expo Go → open `exp://<ip>:8081` (shown in the Decker window) or scan Metro QR from a browser at `http://<ip>:8081`  
3. Decker then auto-finds the Mac agent on the LAN

## Logs

```text
~/Library/Logs/decker-mac-agent.log
~/Library/Logs/decker-mac-expo.log
```
