// HTTP + WebSocket server. In production it also serves the built client from dist/, so the whole game is one
// process on one port. In development Vite serves the client and proxies /ws and /api here.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { createCheckout } from './payments.js';
import { MAX_HUMANS } from '../shared/constants.js';

const PORT = Number(process.env.PORT) || 8787;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const rooms = new Map();

function newRoom(mode, opts) {
  let code;
  do code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  while (rooms.has(code));
  const room = new Room(code, mode, (r) => rooms.delete(r.code), opts);
  rooms.set(code, room);
  return room;
}

/** mode: quick | create | champ | trial | join */
function findRoom(mode, code, circuit) {
  if (mode === 'join') {
    const room = rooms.get(String(code ?? '').toUpperCase().trim()) ?? null;
    return room && room.mode !== 'trial' ? room : null;
  }
  if (mode === 'create') return newRoom('private', { circuit });
  if (mode === 'champ') return newRoom('private', { circuit: circuit ?? 'australia', series: 3 });
  if (mode === 'trial') return newRoom('trial', { circuit });
  for (const r of rooms.values()) if (r.public && r.state === 'lobby' && r.humans.length < MAX_HUMANS) return r;
  return newRoom('quick');
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') {
    let players = 0;
    for (const r of rooms.values()) players += r.humans.length;
    return json(res, 200, { ok: true, rooms: rooms.size, players });
  }
  if (url.pathname === '/api/checkout' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { if ((body += c).length > 2000) req.destroy(); });
    req.on('end', () => {
      let sku = null;
      try { sku = JSON.parse(body).sku; } catch {}
      const out = createCheckout(sku);
      json(res, out.error ? 400 : 200, out);
    });
    return;
  }
  if (!fs.existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Micro Kart Grand Prix server is running. Use `npm run dev` and open the Vite URL, or `npm run build` first.');
  }
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) file = DIST;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const hashed = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  let player = null, room = null;
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') return ws.send(JSON.stringify({ t: 'pong', c: m.c, s: Date.now() }));
    if (!player) {
      if (m.t === 'rejoin') {
        room = rooms.get(String(m.code ?? '')) ?? null;
        player = room?.rejoin(ws, String(m.sid ?? '')) ?? null;
        if (!player) {
          room = null;
          ws.send(JSON.stringify({ t: 'error', msg: 'That race has moved on without you.' }));
        }
        return;
      }
      if (m.t !== 'hello') return;
      const name = String(m.name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14) || 'Driver';
      room = findRoom(m.mode, m.code, typeof m.circuit === 'string' ? m.circuit : undefined);
      if (!room) return ws.send(JSON.stringify({ t: 'error', msg: 'No room with that code.' }));
      player = room.join(ws, name, m.kart);
      if (!player) {
        room = null;
        ws.send(JSON.stringify({ t: 'error', msg: 'That room is full.' }));
      }
      return;
    }
    if (m.t === 'bye') {
      room.leave(player);
      player = room = null;
      return;
    }
    room.onMessage(player, m);
  });
  ws.on('close', () => {
    // only if this socket is still the player's: after a reconnect the old one closing means nothing
    if (player && player.ws === ws) room.drop(player);
    player = room = null;
  });
  ws.on('error', () => {});
});

// drop connections that stopped answering
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Micro Kart server on http://localhost:${PORT}`));
