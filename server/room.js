// One race room: lobby (the starting grid) -> countdown -> racing -> results -> lobby or a rematch.
// The server owns the grid, the race clock, laps, places, lap times, overtakes, results, championship points
// and the AI drivers; each client simulates its own car and reports where it is.

import { getTrack, gridSlot, locate, indexDelta, pointAt } from '../shared/track.js';
import { CIRCUIT_IDS, hasCircuit, nextCircuit } from '../shared/circuits.js';
import {
  TICK_MS, MAX_HUMANS, GRID_SIZES, FILL_TO, KART, COUNTDOWN_MS, TRIAL_COUNTDOWN_MS, FINISH_GRACE_MS, RACE_MAX_MS,
  TRIAL_MAX_MS, RESULTS_MS, QUICK_LOBBY_MS, RECONNECT_MS, PLACE_REWARD, POINTS, FASTEST_LAP_COINS, OVERTAKE_COINS, F,
} from '../shared/constants.js';
import { cleanKart, BOT_NAMES, SKINS, TRAILS, HELMETS } from '../shared/catalog.js';

let seq = 1;
const uid = (p) => p + (seq++).toString(36);
const token = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;

export class Room {
  /**
   * mode: 'quick' (public matchmaking) | 'private' (room code, host controls) | 'trial' (solo timed laps).
   * opts.circuit and opts.series set the first circuit and a championship length.
   * opts.now and opts.manual let tests drive the clock and the ticks themselves.
   */
  constructor(code, mode, onEmpty, opts = {}) {
    this.code = code;
    this.mode = mode;
    this.public = mode === 'quick';
    this.onEmpty = onEmpty;
    this.now = opts.now ?? Date.now;
    this.players = new Map();
    this.state = 'lobby';
    this.circuit = hasCircuit(opts.circuit) ? opts.circuit : pick(CIRCUIT_IDS);
    this.track = getTrack(this.circuit);
    this.lapsPick = 0; // 0 = the circuit's own lap count
    this.cap = MAX_HUMANS;
    this.bots = mode !== 'trial';
    this.series = opts.series ? { rounds: opts.series, done: 0, pts: new Map() } : null;
    this.host = null;
    this.autoStartAt = 0;
    this.startAt = 0;
    this.hold = 0;
    this.nextAt = 0;
    this.endAt = 0;
    this.grid = null;
    this.results = null;
    this.last = this.now();
    this.fillBots();
    if (!opts.manual) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  get humans() {
    return [...this.players.values()].filter((p) => !p.bot);
  }
  get racers() {
    return [...this.players.values()].filter((p) => !p.spectator);
  }
  get laps() {
    return this.mode === 'trial' ? 999 : this.lapsPick || this.track.laps;
  }

  destroy() {
    clearInterval(this.timer);
    this.dead = true;
    this.onEmpty?.(this);
  }

  // ---- people coming and going

  freeSlot() {
    const used = new Set([...this.players.values()].map((p) => p.slot));
    for (let s = 0; s < this.cap; s++) if (!used.has(s)) return s;
    return -1;
  }

  join(ws, name, kart) {
    if (this.mode === 'trial' && this.humans.length) return null;
    if (this.humans.length >= this.cap) return null;
    const inLobby = this.state === 'lobby';
    const p = {
      id: uid('p'), sid: token(), name, kart: cleanKart(kart), bot: false, ws, dc: 0, ready: false,
      spectator: !inLobby, slot: -1, x: 0, z: 0, yaw: 0, speed: 0, flags: 0, lat: 0,
    };
    if (inLobby) {
      // people line up ahead of the AI drivers: take the first slot no human holds, moving an AI car back if
      // one is parked there
      const mine = new Set(this.humans.map((h) => h.slot));
      let s = 0;
      while (mine.has(s)) s++;
      const bot = [...this.players.values()].find((q) => q.bot && q.slot === s);
      p.slot = s;
      if (bot) {
        bot.slot = -1;
        this.players.set(p.id, p);
        const f = this.freeSlot();
        if (f < 0) this.players.delete(bot.id);
        else bot.slot = f;
      }
    }
    this.resetRacer(p);
    this.players.set(p.id, p);
    if (!this.host) this.host = p.id;
    if (inLobby) {
      this.fillBots();
      if (this.public && !this.autoStartAt) this.autoStartAt = this.now() + QUICK_LOBBY_MS;
    }
    this.send(p, { t: 'welcome', id: p.id, sid: p.sid, code: this.code, now: this.now() });
    this.broadcastRoom();
    return p;
  }

  /** The connection dropped: keep the car for a while so the player can come back to it. */
  drop(p) {
    if (!this.players.has(p.id)) return;
    p.ws = null;
    p.dc = this.now();
    p.ready = false;
    this.broadcastRoom();
  }

  rejoin(ws, sid) {
    const p = this.humans.find((q) => q.sid === sid);
    if (!p) return null;
    if (p.ws && p.ws !== ws) try { p.ws.close(); } catch {}
    p.ws = ws;
    p.dc = 0;
    this.send(p, {
      t: 'welcome', id: p.id, sid: p.sid, code: this.code, now: this.now(), resumed: true,
      at: [r2(p.x), r2(p.z), r2(p.yaw), p.idx], finished: p.finished,
    });
    this.broadcastRoom();
    return p;
  }

  leave(p) {
    if (!this.players.delete(p.id)) return;
    this.series?.pts.delete(p.id);
    const humans = this.humans;
    if (!humans.length) return this.destroy();
    if (this.host === p.id) this.host = (humans.find((h) => !h.dc) ?? humans[0]).id;
    if (this.state === 'lobby') this.fillBots();
    this.broadcastRoom();
  }

  dropBot() {
    const bots = [...this.players.values()].filter((p) => p.bot).sort((a, b) => b.slot - a.slot);
    if (bots[0]) this.players.delete(bots[0].id);
  }

  fillBots() {
    const humans = this.humans.length;
    const want = this.bots ? Math.max(humans, Math.min(FILL_TO, this.cap)) : humans;
    while (this.players.size > want && this.players.size > humans) this.dropBot();
    const taken = new Set([...this.players.values()].map((p) => p.name));
    while (this.players.size < want) {
      const slot = this.freeSlot();
      if (slot < 0) break;
      const name = pick(BOT_NAMES.filter((n) => !taken.has(n))) ?? 'AI';
      taken.add(name);
      const b = {
        id: uid('b'), name, bot: true, spectator: false, ready: true, slot, dc: 0,
        kart: { skin: pick(SKINS).id, trail: pick(TRAILS).id, helmet: pick(HELMETS).id },
        skill: rnd(0, 1), x: 0, z: 0, yaw: 0, speed: 0, flags: 0, lat: 0,
      };
      this.resetRacer(b);
      this.players.set(b.id, b);
    }
  }

  resetRacer(p) {
    Object.assign(p, {
      idx: 0, total: 0, lapsDone: 0, lapAt: 0, bestLap: null, finished: false, place: 0, time: 0, rank: 0,
      overtakes: 0, countRank: 0, candRank: 0, candAt: 0, boostUntil: 0, budget: 3, dist: 0, lane: 0, laneTarget: 0, laneAt: 0, v: 0, lastU: 0,
    });
  }

  /** Close up the grid: everyone keeps their order, the gaps go. */
  packSlots(order) {
    order.forEach((p, k) => (p.slot = k));
  }

  // ---- messages from a client

  onMessage(p, m) {
    const now = this.now();
    switch (m.t) {
      case 'u': {
        if (p.spectator || p.finished || this.state !== 'racing') return;
        const d = m.d;
        if (!Array.isArray(d) || d.length < 5 || !d.every(Number.isFinite)) return;
        const b = this.track.bounds, t = this.track;
        p.x = clamp(d[0], b.minX - 40, b.maxX + 40);
        p.z = clamp(d[1], b.minZ - 40, b.maxZ + 40);
        p.yaw = d[2];
        p.speed = clamp(d[3], -20, 60);
        p.flags = d[4] & 0xff;
        const loc = locate(t, p.x, p.z, p.idx);
        // nobody advances faster than a boosting, slipstreaming car could: progress is paid for out of an
        // allowance that refills at that speed, with a little slack for late or bunched-up reports
        const rate = (KART.maxSpeed * KART.boostMult * KART.slipMult * 1.04) / t.step;
        p.budget = Math.min(rate * 0.6 + 3, (p.budget ?? 3) + rate * Math.min(1, (now - (p.lastU || now)) / 1000));
        const step = Math.min(indexDelta(t, p.idx, loc.i), p.budget);
        if (step > 0) p.budget -= step;
        p.total += step;
        p.idx = loc.i;
        p.lat = loc.lat;
        p.lastU = now;
        return;
      }
      case 'ready':
        if (p.spectator || (this.state !== 'lobby' && this.state !== 'results')) return;
        p.ready = !!m.v;
        if (this.public && this.state === 'lobby' && this.allReady()) this.autoStartAt = Math.min(this.autoStartAt || Infinity, now + 1500);
        return this.broadcastRoom();
      case 'start':
        if (this.state !== 'lobby' || p.id !== this.host || this.public) return;
        if (!this.allReady(p)) return this.send(p, { t: 'note', msg: 'Not everyone is ready yet.' });
        return this.startCountdown();
      case 'cfg': {
        if (this.state !== 'lobby' || p.id !== this.host || this.mode !== 'private') return;
        if (typeof m.bots === 'boolean') this.bots = m.bots;
        if (hasCircuit(m.circuit) && m.circuit !== this.circuit) {
          this.circuit = m.circuit;
          this.track = getTrack(m.circuit);
          if (this.series) this.series = { rounds: this.series.rounds, done: 0, pts: new Map() };
        }
        if (Number.isInteger(m.laps) && m.laps >= 0 && m.laps <= 9) this.lapsPick = m.laps;
        if (GRID_SIZES.includes(m.cap) && m.cap >= this.humans.length) {
          this.cap = m.cap;
          while (this.players.size > this.cap) this.dropBot();
          this.packSlots([...this.players.values()].sort((a, b) => a.slot - b.slot));
        }
        if (m.series === 0) this.series = null;
        else if (m.series === 3 || m.series === 5) this.series = { rounds: m.series, done: 0, pts: new Map() };
        this.fillBots();
        return this.broadcastRoom();
      }
      case 'kart':
        if (this.state !== 'lobby') return;
        p.kart = cleanKart(m.kart);
        return this.broadcastRoom();
      case 'rematch':
        if (this.state !== 'results' || p.id !== this.host || this.public) return;
        this.toLobby(true);
        return this.startCountdown();
      case 'lobby':
        if (this.state === 'results' && p.id === this.host && !this.public) this.toLobby();
        return;
    }
  }

  /** Every connected human has readied up (the host, who presses Start, counts as ready). */
  allReady(host = null) {
    return this.humans.every((h) => h === host || h.spectator || h.dc || h.ready);
  }

  // ---- the state machine

  startCountdown() {
    const now = this.now(), trial = this.mode === 'trial';
    this.state = 'countdown';
    this.autoStartAt = 0;
    this.track = getTrack(this.circuit);
    this.finishCount = 0;
    this.firstHumanFinishAt = 0;
    this.endAt = 0;
    this.fastest = null;
    this.results = null;
    this.hold = trial ? 300 : Math.round(rnd(350, 1300)); // how long all five lights stay on
    this.startAt = now + (trial ? TRIAL_COUNTDOWN_MS : COUNTDOWN_MS);
    const order = this.racers.sort((a, b) => a.slot - b.slot);
    this.packSlots(order);
    this.grid = {};
    order.forEach((p, k) => {
      const s = gridSlot(this.track, k);
      this.resetRacer(p);
      Object.assign(p, { x: s.x, z: s.z, yaw: s.yaw, speed: 0, flags: 0, dist: s.dist, lane: s.lat, laneTarget: s.lat, lat: s.lat });
      p.idx = locate(this.track, p.x, p.z).i;
      p.total = p.idx > this.track.n / 2 ? p.idx - this.track.n : p.idx;
      p.lapAt = this.startAt;
      p.rank = p.countRank = p.candRank = k + 1;
      p.ready = p.bot;
      this.grid[p.id] = [r2(s.x), r2(s.z), r2(s.yaw)];
    });
    this.broadcastRoom();
  }

  tick() {
    const now = this.now(), dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    // a dropped player's place is held for a while, then given up
    for (const p of this.humans) if (p.dc && now - p.dc > RECONNECT_MS) this.leave(p);
    if (this.dead) return;

    if (this.state === 'lobby') {
      if (this.autoStartAt && now >= this.autoStartAt) this.startCountdown();
      return;
    }
    if (this.state === 'results') {
      if (this.nextAt && now >= this.nextAt) this.toLobby();
      return;
    }
    if (this.state === 'countdown') {
      if (now >= this.startAt) {
        this.state = 'racing';
        this.broadcastRoom();
      }
      return this.snapshot();
    }

    // racing
    for (const p of this.players.values()) if (p.bot) this.updateBot(p, dt, now);
    const laps = this.laps, n = this.track.n;
    for (const p of this.racers) {
      if (p.finished) continue;
      const done = Math.floor(p.total / n);
      if (done <= p.lapsDone) continue;
      const ms = now - p.lapAt;
      p.lapsDone = done;
      p.lapAt = now;
      if (p.bestLap == null || ms < p.bestLap) p.bestLap = ms;
      if (!this.fastest || ms < this.fastest.ms) {
        this.fastest = { id: p.id, ms };
        this.ev({ e: 'fastest', id: p.id, ms });
      }
      if (done >= laps) {
        p.finished = true;
        p.place = ++this.finishCount;
        p.time = now - this.startAt;
        p.flags |= F.FINISHED;
        if (!p.bot && !this.firstHumanFinishAt) this.firstHumanFinishAt = now;
        this.ev({ e: 'finish', id: p.id, place: p.place, ms: p.time, lapMs: ms });
      } else this.ev({ e: 'lap', id: p.id, lap: done + 1, ms, best: p.bestLap });
    }
    this.rank(now);
    this.snapshot();

    const humans = this.racers.filter((p) => !p.bot);
    if (!this.endAt && humans.length && humans.every((p) => p.finished)) this.endAt = now + 2600;
    if (
      (this.endAt && now >= this.endAt) ||
      (this.firstHumanFinishAt && now - this.firstHumanFinishAt > FINISH_GRACE_MS) ||
      now - this.startAt > (this.mode === 'trial' ? TRIAL_MAX_MS : RACE_MAX_MS)
    )
      this.finishRace(now);
  }

  /** Order the field. With `now`, also count overtakes: a place gained and then held for a second. */
  rank(now = 0) {
    const list = this.racers.sort((a, b) => (a.finished && b.finished ? a.place - b.place : a.finished ? -1 : b.finished ? 1 : b.total - a.total));
    list.forEach((p, i) => {
      p.rank = i + 1;
      if (!now || p.finished) return;
      if (p.rank !== p.candRank) {
        p.candRank = p.rank;
        p.candAt = now;
      } else if (p.rank !== p.countRank && now - p.candAt > 1000) {
        if (p.rank < p.countRank && now - this.startAt > 4000) p.overtakes += p.countRank - p.rank;
        p.countRank = p.rank;
      }
    });
    return list;
  }

  finishRace(now) {
    const list = this.rank();
    this.state = 'results';
    this.nextAt = now + (this.public ? RESULTS_MS : 5 * 60 * 1000);
    const laps = this.laps, n = this.track.n, elapsed = now - this.startAt;
    // AI drivers still on track when the flag falls get the time they were on course for; a human who ran
    // out of time is not classified
    const projected = (p) => Math.round(elapsed + (Math.max(0, laps * n - p.total) * this.track.step * 1000) / 26);
    const times = list.map((p) => (p.finished ? p.time : p.bot ? projected(p) : null));
    const s = this.series;
    this.results = list.map((p, i) => {
      const fastest = this.fastest?.id === p.id;
      const pts = s ? (POINTS[i] ?? 0) + (fastest ? 1 : 0) : 0;
      if (s) s.pts.set(p.id, (s.pts.get(p.id) ?? 0) + pts);
      return {
        id: p.id, name: p.name, bot: p.bot, kart: p.kart, slot: p.slot, place: i + 1, ms: times[i],
        gap: i > 0 && times[i] != null && times[0] != null ? times[i] - times[0] : null,
        best: p.bestLap, fastest, overtakes: p.overtakes, pts,
        reward: (PLACE_REWARD[i] ?? 8) + (fastest ? FASTEST_LAP_COINS : 0) + Math.min(10, p.overtakes) * OVERTAKE_COINS,
        xp: 40 + (list.length - i - 1) * 12,
      };
    });
    let series = null;
    if (s) {
      s.done++;
      series = {
        rounds: s.rounds, done: s.done, final: s.done >= s.rounds,
        standings: list.map((p) => ({ id: p.id, name: p.name, slot: p.slot, pts: s.pts.get(p.id) ?? 0 })).sort((a, b) => b.pts - a.pts),
      };
    }
    this.resultsMsg = { t: 'results', list: this.results, circuit: this.circuit, laps, fastest: this.fastest, series };
    for (const p of this.humans) p.ready = false;
    this.broadcast(this.resultsMsg);
    this.broadcastRoom();
  }

  /** Back to the grid for the next race. The finishing order is reversed, so the winner starts last. */
  toLobby(quiet = false) {
    this.state = 'lobby';
    const s = this.series;
    if (s && s.done >= s.rounds) this.series = { rounds: s.rounds, done: 0, pts: new Map() };
    else if (s && s.done > 0) this.circuit = nextCircuit(this.circuit);
    else if (this.public) this.circuit = pick(CIRCUIT_IDS.filter((id) => id !== this.circuit));
    this.track = getTrack(this.circuit);
    this.grid = null;
    this.results = this.resultsMsg = null;
    const raced = this.racers.sort((a, b) => (b.rank || 99) - (a.rank || 99));
    const fresh = [...this.players.values()].filter((p) => p.spectator);
    for (const p of this.players.values()) {
      p.spectator = false;
      p.ready = p.bot;
      this.resetRacer(p);
    }
    this.packSlots([...raced, ...fresh].slice(0, this.cap));
    this.fillBots();
    this.autoStartAt = this.public ? this.now() + QUICK_LOBBY_MS : 0;
    if (!quiet) this.broadcastRoom();
  }

  // ---- AI drivers: they follow the centreline at a lane offset, brake for corners and tuck in behind

  updateBot(b, dt, now) {
    const t = this.track, edge = t.halfWidth - 1.5;
    if (b.finished) {
      b.v = Math.max(8, b.v - 14 * dt);
    } else {
      const i0 = Math.floor((((b.dist / t.step) % t.n) + t.n) % t.n);
      let k = 0, turn = 0;
      for (let o = 0; o < 12; o++) {
        const c = t.curv[(i0 + o) % t.n];
        if (Math.abs(c) > k) { k = Math.abs(c); turn = Math.sign(c); }
      }
      let vmax = 27.4 + b.skill * 2.4;
      const best = Math.max(...this.humans.filter((h) => !h.spectator && !h.finished).map((h) => h.total), -Infinity);
      if (isFinite(best)) {
        const lead = (b.total - best) * t.step;
        // keep the pack close to the best human: ease off out in front, push on when dropped
        if (lead > 35) vmax *= 0.93;
        else if (lead < -30) {
          vmax *= 1.05;
          if (k < 0.008 && now > b.boostUntil + 5000) b.boostUntil = now + 1400;
        }
      }
      if (now < b.boostUntil) vmax *= 1.14;
      const target = Math.min(vmax, Math.sqrt(44 / Math.max(k, 1e-3)));
      b.v += clamp(target - b.v, -30 * dt, 17 * dt);

      if (now > b.laneAt) {
        b.laneTarget = clamp(rnd(-edge, edge) + turn * 1.4, -edge, edge);
        b.laneAt = now + rnd(1400, 4500);
      }
      // steer round whoever is right in front
      for (const o of this.racers) {
        if (o === b) continue;
        const gap = (o.total - b.total) * t.step;
        const ol = o.bot ? o.lane : o.lat;
        if (gap > 0 && gap < 6.5 && Math.abs(ol - b.lane) < 2) b.laneTarget = clamp(ol + (b.lane >= ol ? 2.7 : -2.7), -edge, edge);
      }
      b.flags = (now < b.boostUntil ? F.BOOST : 0) | (k > 0.06 && b.v > 19 ? F.DRIFT : 0) | (target < b.v - 2 ? F.BRAKE : 0);
    }
    const dl = clamp(b.laneTarget - b.lane, -2.6 * dt, 2.6 * dt);
    b.lane += dl;
    b.dist += b.v * dt;
    const p = pointAt(t, b.dist, b.lane);
    b.x = p.x; b.z = p.z;
    b.yaw = p.yaw + Math.atan2(dl / dt || 0, Math.max(b.v, 6)) * 0.8;
    b.speed = b.v;
    b.idx = p.i;
    b.lat = b.lane;
    b.total = b.dist / t.step;
    if (b.finished) b.flags = F.FINISHED;
  }

  // ---- talking to clients

  send(p, msg) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  ev(e) {
    this.broadcast({ t: 'ev', ...e });
  }

  snapshot() {
    const laps = this.laps;
    this.broadcast({
      t: 's', now: this.now(),
      k: this.racers.map((p) => [p.id, r2(p.x), r2(p.z), r2(p.yaw), r2(p.speed), p.flags, clamp(p.lapsDone + 1, 1, laps), p.rank ?? 0]),
    });
  }

  roomMsg() {
    const s = this.series;
    return {
      t: 'room', now: this.now(), code: this.code, mode: this.mode, state: this.state, host: this.host,
      circuit: this.circuit, laps: this.laps, lapsPick: this.lapsPick, bots: this.bots, cap: this.cap,
      series: s ? { rounds: s.rounds, done: s.done } : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, kart: p.kart, bot: p.bot, spectator: p.spectator, slot: p.slot, ready: p.ready, dc: !!p.dc,
        pts: s ? s.pts.get(p.id) ?? 0 : 0,
      })),
      autoStartAt: this.autoStartAt, startAt: this.startAt, hold: this.hold, nextAt: this.public ? this.nextAt : 0,
      grid: this.state === 'countdown' || this.state === 'racing' ? this.grid : null,
      results: this.state === 'results' ? this.resultsMsg : null,
    };
  }
  broadcastRoom() {
    this.broadcast(this.roomMsg());
  }
}
