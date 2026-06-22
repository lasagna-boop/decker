const http = require('http');
const { WebSocketServer } = require('ws');
const bonjour = require('bonjour')();
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { execFile, exec } = require('child_process');

const PORT = 4242;
const IGNORED_APPS = new Set(['osascript']);
const OPEN_APPS_POLL_MS = 3000;
const ACTIVE_APP_POLL_MS = 700;

const C = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function shortAddr(addr) {
  if (!addr) return '?';
  return addr.replace(/^::ffff:/, '');
}

function nowTime() {
  return new Date().toTimeString().slice(0, 8);
}

function logEvent(symbol, color, text) {
  console.log(`  ${color}${symbol}${C.reset} ${C.dim}${nowTime()}${C.reset}  ${text}`);
}

function runAppleScript(lines) {
  return new Promise((resolve, reject) => {
    const args = [];
    for (const line of lines) {
      args.push('-e', line);
    }
    execFile('osascript', args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

function shell(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr?.trim() || error.message));
      else resolve(stdout.trim());
    });
  });
}

function escapeAppleScriptString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function pressShortcut(appName, scriptLine) {
  const safeName = escapeAppleScriptString(appName);
  await runAppleScript([
    `tell application "${safeName}" to activate`,
    'delay 0.12',
    'tell application "System Events"',
    scriptLine,
    'end tell',
  ]);
}

async function pressChromeShortcut(scriptLine) {
  await runAppleScript([
    'tell application "Google Chrome" to activate',
    'delay 0.15',
    'tell application "System Events"',
    'tell process "Google Chrome"',
    scriptLine,
    'end tell',
    'end tell',
  ]);
}

/** Send a key to whatever app is currently in front (browser, player, etc.). */
async function pressFrontmostKey(keyCode, usingMods = '') {
  const keyLine = usingMods
    ? `key code ${keyCode} using {${usingMods}}`
    : `key code ${keyCode}`;
  await runAppleScript([
    'tell application "System Events"',
    'tell (first application process whose frontmost is true)',
    keyLine,
    'end tell',
    'end tell',
  ]);
}

async function logAccessibilityStatus() {
  try {
    await runAppleScript([
      'tell application "System Events"',
      'key code 63',
      'end tell',
    ]);
    logEvent('✓', C.green, 'Accessibility: keystrokes enabled');
  } catch (error) {
    const msg = String(error.message || error);
    if (!msg.includes('not allowed to send keystrokes')) return;
    console.log(`\n  ${C.yellow}⚠${C.reset}  Accessibility required for VideoPlay and keyboard actions`);
    console.log(`      System Settings → Privacy & Security → Accessibility`);
    console.log(`      Enable: ${process.execPath}\n`);
  }
}

function clampPointerDelta(value, max = 90) {
  const n = Math.round(Number(value) || 0);
  return Math.max(-max, Math.min(max, n));
}

const POINTER_BIN = path.join(__dirname, 'decker-pointer');
const POINTER_SRC = path.join(__dirname, 'pointer.swift');
let pointerBinaryReady = false;

async function ensurePointerBinary() {
  if (pointerBinaryReady) return;
  try {
    await fs.access(POINTER_BIN);
    pointerBinaryReady = true;
    return;
  } catch {
    // compile on first use
  }
  logEvent('…', C.yellow, 'Compiling decker-pointer (one-time)…');
  await shell(`swiftc -O "${POINTER_SRC}" -o "${POINTER_BIN}"`);
  pointerBinaryReady = true;
  logEvent('✓', C.green, 'decker-pointer ready');
}

async function runPointer(args) {
  await ensurePointerBinary();
  const escaped = args.map((a) => String(a).replace(/"/g, '\\"'));
  await shell(`"${POINTER_BIN}" ${escaped.join(' ')}`);
}

async function pointerMove(dx, dy) {
  const x = clampPointerDelta(dx);
  const y = clampPointerDelta(dy);
  if (x === 0 && y === 0) return;
  await runPointer(['move', x, y]);
}

async function pointerClick(button = 1) {
  await runPointer(['click', button === 2 ? 'right' : 'left']);
}

async function pointerScroll(dy) {
  const lines = clampPointerDelta(dy, 12);
  if (lines === 0) return;
  await runPointer(['scroll', lines]);
}

async function getOpenApplications() {
  const output = await runAppleScript([
    'tell application "System Events"',
    'set appNames to name of every process whose background only is false',
    'end tell',
    'set AppleScript\'s text item delimiters to "|||"',
    'set output to appNames as string',
    'set AppleScript\'s text item delimiters to ""',
    'return output',
  ]);
  if (!output) return [];
  return output
    .split('|||')
    .map((n) => n.trim())
    .filter((name) => Boolean(name) && !IGNORED_APPS.has(name.toLowerCase()));
}

async function getFrontmostApplication() {
  const output = await runAppleScript([
    'tell application "System Events"',
    'name of first application process whose frontmost is true',
    'end tell',
  ]);
  const name = String(output || '').trim();
  if (!name || IGNORED_APPS.has(name.toLowerCase())) return '';
  return name;
}

async function getInstalledApplications() {
  const output = await shell(
    'find /Applications /System/Applications /System/Library/CoreServices -maxdepth 3 -name "*.app" -print 2>/dev/null'
  );
  if (!output) return [];
  const unique = new Set(
    output
      .split('\n')
      .map((line) => path.basename(line.trim()))
      .filter(Boolean)
      .map((name) => name.replace(/\.app$/i, ''))
  );
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

function sendOpenApps(ws, apps) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'open_apps', apps }));
  }
}

function sendActiveApp(ws, appName) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'active_app', appName }));
  }
}

function startPolling(ws) {
  let lastKey = '';
  let lastFrontmost = '';
  let running = true;

  async function tickOpenApps() {
    if (!running || ws.readyState !== ws.OPEN) return;
    try {
      const apps = await getOpenApplications();
      const key = apps.join('|');
      if (key !== lastKey) {
        lastKey = key;
        sendOpenApps(ws, apps);
      }
    } catch {
      // ignore polling errors silently
    }
    if (running) setTimeout(tickOpenApps, OPEN_APPS_POLL_MS);
  }

  async function tickActiveApp() {
    if (!running || ws.readyState !== ws.OPEN) return;
    try {
      const activeApp = await getFrontmostApplication().catch(() => '');
      if (activeApp && activeApp !== lastFrontmost) {
        lastFrontmost = activeApp;
        sendActiveApp(ws, activeApp);
      }
    } catch {
      // ignore polling errors silently
    }
    if (running) setTimeout(tickActiveApp, ACTIVE_APP_POLL_MS);
  }

  // send immediately on connect, then start polling
  Promise.all([getOpenApplications(), getFrontmostApplication().catch(() => '')])
    .then(([apps, activeApp]) => {
      lastKey = apps.join('|');
      sendOpenApps(ws, apps);
      if (activeApp) {
        lastFrontmost = activeApp;
        sendActiveApp(ws, activeApp);
      }
      setTimeout(tickOpenApps, OPEN_APPS_POLL_MS);
      setTimeout(tickActiveApp, ACTIVE_APP_POLL_MS);
    })
    .catch(() => {
      setTimeout(tickOpenApps, OPEN_APPS_POLL_MS);
      setTimeout(tickActiveApp, ACTIVE_APP_POLL_MS);
    });

  return () => { running = false; };
}

// --- App icon extraction ---
const iconCache = new Map();

async function getAppIconBase64(appName) {
  if (iconCache.has(appName)) return iconCache.get(appName);
  try {
    const appPath = (await shell(
      `find /Applications /System/Applications /System/Library/CoreServices -name "${appName}.app" -maxdepth 4 2>/dev/null | head -1`
    )).trim();
    if (!appPath) return null;

    const iconFile = (await shell(
      `/usr/libexec/PlistBuddy -c "Print CFBundleIconFile" "${appPath}/Contents/Info.plist" 2>/dev/null`
    ).catch(() => '')).trim();
    if (!iconFile) return null;

    const iconName = iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`;
    const iconPath = path.join(appPath, 'Contents', 'Resources', iconName);
    const tmpPath = `/tmp/decker_icon_${appName.replace(/[^a-z0-9]/gi, '_')}.png`;

    await shell(`sips -s format png "${iconPath}" --out "${tmpPath}" --resampleWidth 64 2>/dev/null`);
    const data = await fs.readFile(tmpPath);
    await fs.unlink(tmpPath).catch(() => {});
    const result = `data:image/png;base64,${data.toString('base64')}`;
    iconCache.set(appName, result);
    return result;
  } catch {
    return null;
  }
}

// --- Action registry ---
const actions = {};

actions['launch-app'] = async ({ appName }) => {
  await shell(`open -a "${String(appName).replace(/"/g, '\\"')}"`);
};

actions['media-play-pause'] = async () => {
  await runAppleScript(['tell application "Spotify" to playpause']);
};

actions['media-next'] = async () => {
  await runAppleScript(['tell application "Spotify" to next track']);
};

actions['media-prev'] = async () => {
  await runAppleScript(['tell application "Spotify" to previous track']);
};

actions['quit-app'] = async ({ appName }) => {
  const name = String(appName).replace(/"/g, '\\"');
  await runAppleScript([`tell application "${name}" to quit`]);
};

actions['volume-up'] = async () => {
  await runAppleScript([
    'set curVol to output volume of (get volume settings)',
    'set volume output volume (curVol + 10)',
  ]);
};

actions['volume-down'] = async () => {
  await runAppleScript([
    'set curVol to output volume of (get volume settings)',
    'set volume output volume (curVol - 10)',
  ]);
};

actions['mute'] = async () => {
  await runAppleScript([
    'set curMute to output muted of (get volume settings)',
    'set volume output muted (not curMute)',
  ]);
};

actions['type-text'] = async ({ text }) => {
  const value = String(text ?? '');
  if (!value) return;
  const safe = escapeAppleScriptString(value);
  await runAppleScript([
    `set the clipboard to "${safe}"`,
    'delay 0.06',
    'tell application "System Events"',
    'tell (first application process whose frontmost is true)',
    'key code 9 using {command down}',
    'end tell',
    'end tell',
  ]);
};

actions['type-key'] = async ({ key }) => {
  const k = String(key ?? '');
  if (k === 'enter') await pressFrontmostKey(36);
  else if (k === 'backspace') await pressFrontmostKey(51);
  else if (k === 'escape') await pressFrontmostKey(53);
  else throw new Error(`unknown key: ${k}`);
};

actions['video-play-pause'] = async () => {
  await pressFrontmostKey(49);
};

actions['video-seek-back'] = async () => {
  await pressFrontmostKey(123);
};

actions['video-seek-forward'] = async () => {
  await pressFrontmostKey(124);
};

actions['pointer-click-left'] = async () => {
  await pointerClick(1);
};

actions['pointer-click-right'] = async () => {
  await pointerClick(2);
};

actions['pointer-scroll'] = async ({ dy }) => {
  await pointerScroll(dy);
};

actions['chrome-tab-left'] = async () => {
  await pressChromeShortcut('key code 123 using {command down, option down}');
};

actions['chrome-reload'] = async () => {
  // No keyboard simulation — keystrokes were causing select-all / no reload on some layouts.

  try {
    await runAppleScript([
      'tell application "Google Chrome"',
      'if (count of windows) = 0 then error "No Chrome window"',
      'activate',
      'reload active tab of front window',
      'end tell',
    ]);
    return;
  } catch {
    // continue to next strategy
  }

  try {
    await runAppleScript([
      'tell application "Google Chrome"',
      'activate',
      'tell active tab of front window',
      'execute javascript "location.reload()"',
      'end tell',
      'end tell',
    ]);
    return;
  } catch {
    // continue to next strategy
  }

  await runAppleScript([
    'tell application "Google Chrome" to activate',
    'delay 0.2',
    'tell application "System Events"',
    'tell process "Google Chrome"',
    'set viewMenu to menu bar item "View" of menu bar 1',
    'try',
    'click menu item "Reload This Page" of menu 1 of viewMenu',
    'on error',
    'try',
    'click menu item "Reload" of menu 1 of viewMenu',
    'on error',
    'set viewMenuRu to menu bar item "Вид" of menu bar 1',
    'click menu item "Обновить эту страницу" of menu 1 of viewMenuRu',
    'end try',
    'end try',
    'end tell',
    'end tell',
  ]);
};

actions['chrome-tab-right'] = async () => {
  await pressChromeShortcut('key code 124 using {command down, option down}');
};

actions['word-save'] = async () => {
  await runAppleScript([
    'tell application "Microsoft Word"',
    'if not (exists active document) then error "No active Word document"',
    'save active document',
    'end tell',
  ]);
};

actions['word-print'] = async () => {
  const frontmostApp = await runAppleScript([
    'tell application "System Events"',
    'name of first application process whose frontmost is true',
    'end tell',
  ]).catch(() => '');

  const script = [
    'tell application "Microsoft Word"',
    'if not (exists active document) then error "No active Word document"',
  ];

  if (frontmostApp !== 'Microsoft Word') {
    script.push('activate', 'delay 0.05');
  }

  script.push(
    'end tell',
    'tell application "System Events"',
    'key code 35 using {command down}',
    'end tell'
  );

  await runAppleScript(script);
};

actions['word-copy-file'] = async () => {
  const posixPath = await runAppleScript([
    'tell application "Microsoft Word"',
    'if not (exists active document) then error "No active Word document"',
    'save active document',
    'set docPath to full name of active document',
    'end tell',
    'return POSIX path of docPath',
  ]);

  const escapedPath = escapeAppleScriptString(posixPath);
  await runAppleScript([
    `set targetFile to POSIX file "${escapedPath}" as alias`,
    'tell application "Finder"',
    'activate',
    'reveal targetFile',
    'delay 0.15',
    'set selection to {targetFile}',
    'end tell',
    'delay 0.12',
    'tell application "System Events"',
    'key code 8 using {command down}',
    'end tell',
  ]);
};

// --- Resolve local LAN IP ---
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// --- HTTP server (health + WS upgrade) ---
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'ok', port: PORT, name: os.hostname() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// --- WebSocket server ---
const wss = new WebSocketServer({ server });
const clients = new Set();

function broadcastPeers() {
  const msg = JSON.stringify({ type: 'peers', count: clients.size });
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(msg);
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  broadcastPeers();
  const addr = shortAddr(ws._socket?.remoteAddress);
  logEvent('▲', C.green, `client connected  ${C.bold}${addr}${C.reset}  (peers: ${clients.size})`);
  const stopPolling = startPolling(ws);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'pointer_move') {
      pointerMove(msg.dx, msg.dy).catch((error) => {
        logEvent('!', C.red, `pointer move: ${error.message}`);
      });
      return;
    }

    if (msg.type === 'get_icons' && Array.isArray(msg.apps)) {
      Promise.all(msg.apps.map(async (appName) => [appName, await getAppIconBase64(appName)]))
        .then((entries) => {
          const icons = Object.fromEntries(entries.filter(([, v]) => v !== null));
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'icons', icons, tag: msg.tag ?? null }));
          }
          logEvent('✓', C.green, `sent icons for: ${Object.keys(icons).join(', ')}`);
        })
        .catch((error) => logEvent('!', C.red, `icon fetch failed: ${error.message}`));
      return;
    }

    if (msg.type === 'list_installed_apps') {
      getInstalledApplications()
        .then((apps) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'installed_apps', apps }));
          }
          logEvent('✓', C.green, `sent installed apps: ${apps.length}`);
        })
        .catch((error) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'installed_apps', apps: [], error: error.message }));
          }
          logEvent('!', C.red, `installed apps failed: ${error.message}`);
        });
      return;
    }

    if (msg.type === 'action') {
      const handler = actions[msg.id];
      if (!handler) {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'ack', id: msg.id, ok: false, error: 'unknown action', reqId: msg.reqId }));
        }
        return;
      }
      handler(msg.payload ?? {})
        .then(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'ack', id: msg.id, ok: true, reqId: msg.reqId }));
          }
          logEvent('✓', C.green, `action ${C.bold}${msg.id}${C.reset} by ${addr}`);
        })
        .catch((error) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'ack', id: msg.id, ok: false, error: error.message, reqId: msg.reqId }));
          }
          logEvent('!', C.red, `action ${msg.id} failed: ${error.message}`);
        });
    }
  });

  ws.on('close', () => {
    stopPolling();
    clients.delete(ws);
    broadcastPeers();
    logEvent('▽', C.yellow, `client disconnected  ${addr}  (peers: ${clients.size})`);
  });

  ws.on('error', () => {
    stopPolling();
    clients.delete(ws);
    broadcastPeers();
  });
});

// --- Start ---
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✖ Port ${PORT} is already in use.`);
    console.error(`  Run:  lsof -ti :${PORT} | xargs kill -9\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const ip = getLocalIP();
  const wsUrl = `ws://${ip}:${PORT}`;

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║        Decker Agent — Running        ║');
  console.log('╚══════════════════════════════════════╝\n');
  console.log(`  Local IP  : ${ip}`);
  console.log(`  Port      : ${PORT}`);
  console.log(`  WebSocket : ${wsUrl}`);
  console.log(`  Health    : http://${ip}:${PORT}/health`);
  console.log(`  Actions   : ${Object.keys(actions).join(', ')}`);

  bonjour.publish({ name: 'Decker', type: 'decker', protocol: 'tcp', port: PORT });

  void logAccessibilityStatus();

  console.log(`\n  ${C.dim}Waiting for the iPhone to connect…${C.reset}\n`);
});

process.on('SIGINT', () => {
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    process.exit(0);
  });
});
