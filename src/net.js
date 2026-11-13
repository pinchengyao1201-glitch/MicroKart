// The WebSocket client: joins a room, keeps our clock in step with the server's, reports our car 20 times a
// second, turns what the server says into store updates, sounds and effects, and gets back into the room if
// the connection drops.

import { getState, useStore } from './store.js';
import { live, resetLive, spawnFx, makeKart } from './game/live.js';
import { TICK_MS, F, ordinal, RECONNECT_MS } from '../shared/constants.js';
import { getTrack } from '../shared/track.js';
import { sfx } from './audio.js';

let ws = null, sendTimer = null, pingTimer = null, retryTimer = null, noteTimer = null, bestRtt = Infinity;
let session = null; // { code, sid }: our seat in the room, which a reconnect can claim back
const set = useStore.setState;
const SESSION_KEY = 'mkgp.session';

export function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function saveSession() {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, at: Date.now() }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function closeSocket() {
  clearInterval(sendTimer);
  clearInterval(pingTimer);
  clearTimeout(retryTimer);
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  ws = null;
}

/** Leave the room for good. */
export function disconnect() {
  send({ t: 'bye' });
  closeSocket();
  session = null;
  saveSession();
  set({ conn: 'idle', room: null, myId: null, picker: false });
}

function open(hello, onFail) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = (ws = new WebSocket(`${proto}://${location.host}/ws`));
  sock.onopen = () => {
    send(hello);
    ping();
    pingTimer = setInterval(ping, 2500);
    sendTimer = setInterval(report, TICK_MS);
  };
  sock.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    handle(m);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    clearInterval(sendTimer);
    clearInterval(pingTimer);
    ws = null;
    onFail();
  };
}

function toMenu(msg) {
  closeSocket();
  session = null;
  saveSession();
  set({ conn: 'idle', room: null, myId: null, screen: 'menu', picker: false, error: getState().error ?? msg });
}

/** The connection dropped mid-session: keep trying to take our seat back until the server gives it away. */
function reconnect(since = Date.now()) {
  if (!session) return toMenu('Could not reach the race server.');
  if (Date.now() - since > RECONNECT_MS - 1500) return toMenu('Lost connection to the race server.');
  set({ conn: 'reconnecting' });
  bestRtt = Infinity;
  retryTimer = setTimeout(() => open({ t: 'rejoin', ...session }, () => reconnect(since)), 900);
}

/** mode: 'quick' | 'create' | 'champ' | 'trial' | 'join' (with a room code). circuit is optional. */
export function connect(mode, { code, circuit } = {}) {
  closeSocket();
  session = null;
  resetLive();
  getState().resetHud();
  set({ conn: 'connecting', error: null, screen: 'play', room: null, myId: null });
  bestRtt = Infinity;
  const p = getState().profile;
  open({ t: 'hello', mode, code, circuit, name: p.name || 'Driver', kart: p.kart }, () => (getState().conn === 'online' ? reconnect() : toMenu('Could not reach the race server.')));
}

/** After a page reload: if we were in a room moments ago, go straight back to it. */
export function resume() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    if (!s || Date.now() - s.at > RECONNECT_MS - 3000) return false;
    session = { code: s.code, sid: s.sid };
  } catch { return false; }
  resetLive();
  getState().resetHud();
  set({ conn: 'reconnecting', error: null, screen: 'play', room: null, myId: null });
  open({ t: 'rejoin', ...session }, () => toMenu('That race has moved on without you.'));
  return true;
}

const ping = () => send({ t: 'ping', c: Date.now() });

function report() {
  const room = getState().room, k = live.me;
  if (room) saveSession();
  if (!room || room.state !== 'racing' || k.frozen) return;
  let flags = (k.driftDir ? F.DRIFT : 0) | (k.boost > 0 ? F.BOOST : 0) | (k.slip > 0.5 ? F.SLIP : 0) | (k.driftLvl << 3) | (k.braking ? F.BRAKE : 0);
  if (k.finished) flags |= F.FINISHED;
  const r = (v) => Math.round(v * 100) / 100;
  send({ t: 'u', d: [r(k.x), r(k.z), r(k.yaw), r(k.speed), flags] });
}

function handle(m) {
  switch (m.t) {
    case 'pong': {
      const now = Date.now(), rtt = now - m.c;
      if (rtt <= bestRtt + 15) {
        bestRtt = Math.min(bestRtt, rtt);
        live.offset = m.s - (m.c + rtt / 2);
        live.rtt = rtt;
      }
      return;
    }
    case 'welcome': {
      live.offset = m.now - Date.now();
      session = { code: m.code, sid: m.sid };
      saveSession();
      if (m.resumed && m.at) {
        // pick the car up where the server last saw it
        live.me.teleport = { x: m.at[0], z: m.at[1], yaw: m.at[2], idx: m.at[3] };
        Object.assign(live.me, { x: m.at[0], z: m.at[1], yaw: m.at[2], idx: m.at[3], speed: 0, finished: !!m.finished });
        live.resumed = true;
      }
      return set({ conn: 'online', myId: m.id });
    }
    case 'error':
      set({ error: m.msg });
      return toMenu(m.msg);
    case 'note':
      set({ note: m.msg });
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => set({ note: null }), 2600);
      return;
    case 'room':
      return onRoom(m);
    case 's':
      return onSnapshot(m);
    case 'ev':
      return onEvent(m);
    case 'results':
      return set({ results: m });
  }
}

function onRoom(room) {
  const prev = getState().room, me = getState().myId;
  const ids = new Set(room.players.map((p) => p.id));
  for (const id of live.karts.keys()) if (!ids.has(id)) live.karts.delete(id);
  for (const id of live.lobbyAt.keys()) if (!ids.has(id)) live.lobbyAt.delete(id);
  const resumed = live.resumed;
  live.resumed = false;

  if (room.state === 'lobby' && prev?.state === 'lobby' && room.players.length > prev.players.length) sfx('join');
  if (room.state === 'countdown' && prev?.state !== 'countdown' && !resumed) {
    // a new race: every car rolls from its lobby slot to its place on the grid
    getState().resetHud();
    set({ picker: false });
    live.karts.clear();
    live.launch = { at: performance.now(), from: new Map([...live.lobbyAt].map(([id, p]) => [id, { ...p }])) };
    const g = room.grid?.[me], track = getTrack(room.circuit);
    const fresh = makeKart();
    fresh.teleport = g ? { x: g[0], z: g[1], yaw: g[2], idx: track.n - 6 } : null;
    if (g) Object.assign(fresh, { x: g[0], z: g[1], yaw: g[2], idx: track.n - 6, y: track.y[track.n - 6] });
    Object.assign(live.me, fresh);
  }
  if (room.state === 'racing' && (prev?.state === 'countdown' || resumed || !prev)) {
    live.me.frozen = false;
    getState().patchHud({ lapStartAt: getState().hud.lapStartAt || room.startAt });
    if (prev?.state === 'countdown') sfx('go');
  }
  if (room.state === 'lobby') {
    live.me.frozen = true;
    live.launch = null;
    if (prev?.state === 'results') getState().resetHud();
  }
  set({ room, results: room.state === 'results' ? room.results ?? getState().results : getState().results });
}

function onSnapshot(m) {
  const me = getState().myId, hud = getState().hud;
  for (const [id, x, z, yaw, speed, flags, lap, rank] of m.k) {
    let k = live.karts.get(id);
    if (!k) live.karts.set(id, (k = { buf: [], lap: 1, rank: 0 }));
    k.lap = lap;
    k.rank = rank;
    if (id === me) {
      if (rank && (rank !== hud.place || lap !== hud.lap)) getState().patchHud({ place: rank, lap });
      continue;
    }
    k.buf.push({ t: m.now, x, z, yaw, speed, flags });
    if (k.buf.length > 24) k.buf.shift();
  }
}

function onEvent(m) {
  const st = getState(), me = st.myId, k = live.me, room = st.room;
  const where = (id) => (id === me ? k : live.karts.get(id) ?? null);
  switch (m.e) {
    case 'lap': {
      if (m.id !== me) return;
      const patch = { lastLapMs: m.ms, bestLapMs: m.best, lapStartAt: Date.now() + live.offset };
      if (room?.mode === 'trial') {
        const pb = st.recordLap(room.circuit, m.ms);
        sfx(pb ? 'best' : 'lap');
        patch.banner = { text: pb ? 'PERSONAL BEST' : `LAP ${m.lap}`, tone: pb ? 'best' : 'good', at: Date.now() };
      } else {
        sfx('lap');
        patch.banner = { text: m.lap === room?.laps ? 'FINAL LAP' : `LAP ${m.lap}`, tone: 'good', at: Date.now() };
      }
      return st.patchHud(patch);
    }
    case 'fastest':
      st.patchHud({ fastestBy: m.id });
      if (m.id === me && room?.mode !== 'trial') {
        sfx('best');
        setTimeout(() => getState().patchHud({ banner: { text: 'FASTEST LAP', tone: 'best', at: Date.now() } }), 1800);
      }
      return;
    case 'finish': {
      const at = where(m.id);
      if (at?.x != null) spawnFx('confetti', at.x, at.z, { y: (at.y ?? 0) + 0.5, scale: 2.6 });
      if (m.id !== me) return;
      k.finished = true;
      sfx(m.place === 1 ? 'win' : 'finish');
      if (m.place === 1) spawnFx('firework', k.x, k.z, { y: k.y + 6, scale: 3 });
      return st.patchHud({ finished: { place: m.place, ms: m.ms }, lastLapMs: m.lapMs, banner: { text: m.place === 1 ? 'WINNER!' : `${ordinal(m.place)} PLACE`, tone: 'good', at: Date.now() } });
    }
  }
}
