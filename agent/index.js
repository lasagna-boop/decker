const http = require('http');
const { WebSocketServer } = require('ws');
const bonjour = require('bonjour')();
const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { execFile, exec } = require('child_process');

const PORT = 4242;

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
  return output.split('|||').map((n) => n.trim()).filter(Boolean);
}

function sendOpenApps(ws) {
  getOpenApplications()
    .then((apps) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'open_apps', apps }));
      }
    })
    .catch((error) => {
      logEvent('!', C.red, `failed to list open apps: ${error.message}`);
    });
}

// --- App icon extraction ---
async function getAppIconBase64(appName) {
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
    return `data:image/png;base64,${data.toString('base64')}`;
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
  sendOpenApps(ws);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
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
          if (msg.id === 'quit-app') {
            setTimeout(() => sendOpenApps(ws), 800);
          }
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
    clients.delete(ws);
    broadcastPeers();
    logEvent('▽', C.yellow, `client disconnected  ${addr}  (peers: ${clients.size})`);
  });

  ws.on('error', () => {
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

  console.log(`\n  ${C.dim}Waiting for the iPhone to connect…${C.reset}\n`);
});

process.on('SIGINT', () => {
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    process.exit(0);
  });
});
