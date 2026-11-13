// The room logic on a fake clock, in a second or so of real time: scripted humans drive the centreline against
// AI drivers, and we check the lobby rules, laps, places, lap times, results, a rematch, a three-round
// championship, a dropped connection coming back, and a time trial. Run with `npm run check`.

import { Room } from '../server/room.js';
import { pointAt } from '../shared/track.js';
import { TICK_MS, COUNTDOWN_MS, RECONNECT_MS, POINTS } from '../shared/constants.js';

let now = 1_000_000, failed = false;
const fail = (m) => { failed = true; console.error('FAIL', m); };
const opts = { now: () => now, manual: true };

function client() {
  const c = { readyState: 1, seen: { states: [], laps: [], finish: [], results: null, room: null, fastest: 0, notes: [], welcome: null } };
  c.send = (raw) => {
    const m = JSON.parse(raw), s = c.seen;
    if (m.t === 'welcome') s.welcome = m;
    if (m.t === 'note') s.notes.push(m.msg);
    if (m.t === 'room') {
      s.room = m;
      if (s.states.at(-1) !== m.state) s.states.push(m.state);
    }
    if (m.t === 'results') s.results = m;
    if (m.t === 'ev' && m.e === 'lap') s.laps.push(m);
    if (m.t === 'ev' && m.e === 'finish') s.finish.push(m.id);
    if (m.t === 'ev' && m.e === 'fastest') s.fastest++;
  };
  return c;
}

/** Drive `drivers` ([player, pace]) round until the room leaves 'racing' or maxLaps flying laps are done. */
function race(room, drivers, stopWhen = () => false) {
  const track = room.track, st = new Map(drivers.map(([p]) => [p, { dist: null, speed: 0 }]));
  let ticks = 0;
  while ((room.state === 'countdown' || room.state === 'racing') && ticks < 20 * 600 && !stopWhen()) {
    now += TICK_MS;
    ticks++;
    if (room.state === 'racing')
      for (const [p, pace] of drivers) {
        const s = st.get(p);
        if (s.dist === null) s.dist = p.dist;
        const i = Math.floor(((s.dist / track.step) % track.n + track.n) % track.n);
        let k = 0;
        for (let o = 0; o < 12; o++) k = Math.max(k, Math.abs(track.curv[(i + o) % track.n]));
        const target = pace > 40 ? pace : Math.min(pace, Math.sqrt(44 / Math.max(k, 1e-3)));
        if (pace > 40) s.speed = pace;
        s.speed += Math.max(-30 * 0.05, Math.min(20 * 0.05, target - s.speed));
        s.dist += s.speed * (TICK_MS / 1000);
        const at = pointAt(track, s.dist, p.lane ?? 0);
        if (!p.dc) room.onMessage(p, { t: 'u', d: [at.x, at.z, at.yaw, s.speed, 0] });
      }
    room.tick();
  }
  return ticks;
}

// ---- 1. a private room: ready rules, a full race, results, a rematch
{
  const room = new Room('TEST', 'private', () => {}, { ...opts, circuit: 'monaco' });
  const a = client(), b = client();
  const pa = room.join(a, 'Ana', {}), pb = room.join(b, 'Ben', {});
  if (room.players.size !== 6) fail(`expected 6 on the grid, got ${room.players.size}`);
  const slots = [...room.players.values()].map((p) => p.slot).sort();
  if (slots.join() !== '0,1,2,3,4,5') fail(`slots ${slots}`);
  room.onMessage(pb, { t: 'start' });
  if (room.state !== 'lobby') fail('a guest started the race');
  room.onMessage(pa, { t: 'start' });
  if (room.state !== 'lobby' || !a.seen.notes.length) fail('the host started before the guest was ready');
  room.onMessage(pa, { t: 'cfg', laps: 2, cap: 4 });
  if (room.players.size !== 4 || room.laps !== 2) fail(`cfg: ${room.players.size} cars, ${room.laps} laps`);
  room.onMessage(pa, { t: 'cfg', circuit: 'italy', cap: 8 });
  if (room.circuit !== 'italy' || room.players.size !== 6) fail('cfg: circuit or capacity did not apply');
  room.onMessage(pb, { t: 'ready', v: true });
  room.onMessage(pa, { t: 'start' });
  if (room.state !== 'countdown') fail('race did not start once everyone was ready');
  if (Math.abs(room.startAt - now - COUNTDOWN_MS) > 1) fail('countdown length');
  if (Object.keys(room.grid).length !== 6) fail('grid size');
  race(room, [[pa, 29], [pb, 26]]);
  const res = a.seen.results;
  if (a.seen.states.join('>') !== 'lobby>countdown>racing>results') fail(`states ${a.seen.states.join('>')}`);
  if (!res) fail('no results');
  else {
    const mine = res.list.find((r) => r.id === pa.id), theirs = res.list.find((r) => r.id === pb.id);
    if (!mine.ms || !theirs.ms) fail('a human did not finish');
    if (mine.place >= theirs.place) fail('the quicker human finished behind the slower one');
    if (!res.list.every((r, i) => r.place === i + 1 && r.reward > 0)) fail('places or rewards');
    if (res.list[0].gap !== null || !(res.list[1].gap > 0)) fail('gaps');
    if (!res.fastest || !res.list.some((r) => r.fastest && r.best === res.fastest.ms)) fail('fastest lap');
    if (a.seen.laps.filter((l) => l.id === pa.id).length !== 1) fail(`lap events for a 2-lap race: ${a.seen.laps.filter((l) => l.id === pa.id).length}`);
    console.log(`italy x2     ${res.list.map((r) => `${r.place}.${r.name} ${r.ms ? (r.ms / 1000).toFixed(1) : 'dnf'}${r.fastest ? '*' : ''}`).join('  ')}`);
    console.log(`             Ana: best lap ${(mine.best / 1000).toFixed(1)}s, ${mine.overtakes} overtakes, ${mine.reward} coins, ${mine.xp} XP`);
  }
  // rematch: straight back to a countdown, with the grid reversed
  const winner = res.list[0].id, last = res.list.at(-1).id;
  room.onMessage(pb, { t: 'rematch' });
  if (room.state !== 'results') fail('a guest forced a rematch');
  room.onMessage(pa, { t: 'rematch' });
  if (room.state !== 'countdown') fail('rematch did not start');
  if (room.players.get(last).slot !== 0 || room.players.get(winner).slot !== 5) fail('rematch grid is not the reverse of the finish');

  // a dropped connection: the car is kept, and a rejoin with the right token gets it back
  race(room, [[pa, 29], [pb, 26]], () => room.state === 'racing' && now - room.startAt > 5000);
  room.drop(pb);
  if (!a.seen.room.players.find((p) => p.id === pb.id)?.dc) fail('dropped player not marked');
  now += 3000;
  room.tick();
  const b2 = client();
  if (room.rejoin(b2, 'wrong')) fail('rejoin accepted a bad token');
  const back = room.rejoin(b2, pb.sid);
  if (back !== pb || !b2.seen.welcome?.resumed || b2.seen.room?.state !== 'racing') fail('rejoin did not restore the player');
  // and one who never returns is removed after the grace period
  room.drop(pb);
  now += RECONNECT_MS + 100;
  room.tick();
  if (room.players.has(pb.id)) fail('dropped player was never removed');
  room.leave(pa);
}

// ---- 2. a three-round championship
{
  const room = new Room('CHMP', 'private', () => {}, { ...opts, circuit: 'australia', series: 3 });
  const a = client(), pa = room.join(a, 'Ana', {});
  const circuits = [];
  for (let round = 1; round <= 3; round++) {
    circuits.push(room.circuit);
    room.onMessage(pa, { t: 'cfg', laps: 1 });
    room.onMessage(pa, { t: 'start' });
    race(room, [[pa, 30]]);
    const s = a.seen.results?.series;
    if (!s || s.done !== round || s.final !== (round === 3)) fail(`series state after round ${round}: ${JSON.stringify(s)}`);
    if (round === 3) {
      const top = s.standings[0], sum = s.standings.reduce((n, r) => n + r.pts, 0);
      const perRound = POINTS.slice(0, 6).reduce((n, v) => n + v, 0) + 1;
      if (sum !== perRound * 3) fail(`points handed out ${sum}, expected ${perRound * 3}`);
      console.log(`championship ${circuits.join(' > ')}: ${s.standings.map((r) => `${r.name} ${r.pts}`).join(', ')} (champion ${top.name})`);
    }
    room.onMessage(pa, { t: 'lobby' });
    if (room.state !== 'lobby') fail('host could not return to the lobby');
  }
  if (new Set(circuits).size !== 3) fail(`championship circuits ${circuits}`);
  if (room.series.done !== 0) fail('series did not reset after the final round');
  room.leave(pa);
}

// ---- 3. a quick race starts by itself, and moves on by itself
{
  const room = new Room('QUIK', 'quick', () => {}, opts);
  const a = client(), pa = room.join(a, 'Ana', {});
  room.onMessage(pa, { t: 'cfg', circuit: 'monaco' });
  room.onMessage(pa, { t: 'ready', v: true });
  now += 1600;
  room.tick();
  if (room.state !== 'countdown') fail('quick race did not start when everyone was ready');
  race(room, [[pa, 29]]);
  const first = room.circuit;
  now += 60000;
  room.tick();
  if (room.state !== 'lobby' || room.circuit === first) fail('quick race did not move on to a new circuit');
  room.leave(pa);
}

// ---- 4. a time trial: alone, lap after lap
{
  const room = new Room('TRIA', 'trial', () => {}, { ...opts, circuit: 'austria' });
  const a = client(), pa = room.join(a, 'Ana', {});
  if (room.players.size !== 1) fail('time trial is not solo');
  if (room.join(client(), 'Gatecrasher', {})) fail('someone joined a time trial');
  room.onMessage(pa, { t: 'start' });
  race(room, [[pa, 30]], () => a.seen.laps.length >= 3);
  const laps = a.seen.laps.map((l) => (l.ms / 1000).toFixed(1));
  if (a.seen.laps.length < 3 || room.state !== 'racing') fail(`time trial laps ${laps}, state ${room.state}`);
  console.log(`time trial   austria laps ${laps.join(', ')}s, best ${(a.seen.laps.at(-1).best / 1000).toFixed(1)}s`);
  room.leave(pa);
}

// ---- 5. a client that claims to be going three times too fast gets nowhere faster
{
  const room = new Room('FAST', 'private', () => {}, { ...opts, circuit: 'monaco' });
  const a = client(), pa = room.join(a, 'Cheat', {});
  room.onMessage(pa, { t: 'cfg', laps: 2, bots: false });
  room.onMessage(pa, { t: 'start' });
  const t0 = now;
  race(room, [[pa, 95]]);
  const secs = (a.seen.results?.list[0].ms ?? 0) / 1000, honest = (room.track.len * 2) / (30 * 1.3 * 1.09 * 1.04);
  if (!(secs > honest * 0.97)) fail(`a speeding client finished 2 laps in ${secs.toFixed(1)}s (flat-out boost would take ${honest.toFixed(1)}s)`);
  else console.log(`speed check  a client reporting 95 u/s was held to ${secs.toFixed(1)}s for 2 laps (limit ${honest.toFixed(1)}s)`);
  room.leave(pa);
}

if (failed) process.exit(1);
console.log('race simulation ok');
