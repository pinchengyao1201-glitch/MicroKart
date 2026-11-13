// The handling model on its own (no barriers): the autopilot drives a lap of every circuit and we report the
// lap time, how far it strays from the centreline and how long it spends off the road. Useful when tuning
// shared/constants.js. Pass circuit ids to limit the run.
import { CIRCUITS } from '../shared/circuits.js';
import { getTrack, gridSlot } from '../shared/track.js';
import { makeKart } from '../src/game/live.js';
import { stepKart, placeKart, autoDrive } from '../src/game/kartSim.js';

const only = process.argv.slice(2);
let worst = 0;
for (const c of CIRCUITS) {
  if (only.length && !only.includes(c.id)) continue;
  const track = getTrack(c.id), k = makeKart(), inp = {}, ev = [];
  const s = gridSlot(track, 0);
  Object.assign(k, { x: s.x, z: s.z, yaw: s.yaw, frozen: false });
  k.idx = track.n - 4;
  let t = 0, total = k.idx - track.n, maxLat = 0, off = 0, top = 0, lapStart = null, lap = 0;
  const dt = 1 / 60;
  // one lap to get up to speed, then a flying lap
  while (total < track.n * 2 && t < 200) {
    autoDrive(k, track, inp);
    stepKart(k, inp, dt, ev);
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    const before = k.idx;
    placeKart(k, track, dt);
    let d = k.idx - before;
    if (d < -track.n / 2) d += track.n;
    if (d > track.n / 2) d -= track.n;
    total += d;
    t += dt;
    if (lapStart == null && total >= track.n) lapStart = t;
    if (lapStart != null) {
      maxLat = Math.max(maxLat, Math.abs(k.lat));
      if (k.offroad) off += dt;
      top = Math.max(top, k.speed);
    }
  }
  lap = t - lapStart;
  worst = Math.max(worst, off);
  console.log(
    `${c.id.padEnd(12)} flying lap ${lap.toFixed(1)}s (estimate ${track.lapSecs.toFixed(1)}s)  top ${top.toFixed(1)}  ` +
      `furthest from centre ${maxLat.toFixed(1)} (road ±${track.halfWidth}, barrier ±${track.wallAt})  off-road ${off.toFixed(1)}s`
  );
}
if (worst > 1.5) {
  console.error('FAIL: the autopilot spent too long off the road somewhere');
  process.exit(1);
}
