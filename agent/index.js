const http = require('http');
const { WebSocketServer } = require('ws');
const bonjour = require('bonjour')();
const os = require('os');

const PORT = 4242;
let pingCount = 0;

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

function logPing(id, clientTs, serverTs, addr) {
  const serverProcessing = serverTs - clientTs;
  pingCount++;
  console.log(
    `  ${C.cyan}●${C.reset} ${C.dim}${nowTime()}${C.reset}  ` +
    `tap ${C.bold}#${String(pingCount).padStart(4, ' ')}${C.reset}  ` +
    `id=${String(id).padStart(4, ' ')}  ` +
    `from ${shortAddr(addr).padEnd(15)}  ` +
    `${C.dim}server Δ ${String(serverProcessing).padStart(2)}ms${C.reset}`
  );
}

function logEvent(symbol, color, text) {
  console.log(`  ${color}${symbol}${C.reset} ${C.dim}${nowTime()}${C.reset}  ${text}`);
}

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

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      const serverTs = Date.now();
      ws.send(JSON.stringify({
        type: 'pong',
        id: msg.id,
        clientTs: msg.ts,
        serverTs,
      }));
      logPing(msg.id, msg.ts, serverTs, ws._socket?.remoteAddress);
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

  // mDNS announcement (optional bonus discovery channel)
  bonjour.publish({ name: 'Decker', type: 'decker', protocol: 'tcp', port: PORT });

  console.log(`\n  ${C.dim}Waiting for the iPhone to connect…${C.reset}`);
  console.log(`  ${C.dim}Each tap on the phone will appear below as a new line.${C.reset}\n`);
});

process.on('SIGINT', () => {
  bonjour.unpublishAll(() => {
    bonjour.destroy();
    process.exit(0);
  });
});
