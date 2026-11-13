// Per-frame game state, kept out of React on purpose: the render loop reads and writes these plain objects
// directly, and only the handful of things the HUD shows are copied into the store when they change.

import { BOOST } from '../../shared/constants.js';

export const INTERP_MS = 110; // remote cars are drawn this far in the past, between two snapshots

export function makeKart() {
  return {
    x: 0, y: 0, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0, cvx: 0, cvz: 0, steer: 0,
    driftDir: 0, drift: 0, driftLvl: 0, boost: 0, meter: BOOST.start, slip: 0, braking: false,
    offroad: false, idx: 0, lat: 0, wrongWay: 0, frozen: true, finished: false,
    teleport: null, wantReset: false,
    stats: { top: 0, driftSecs: 0, boostSecs: 0, slipSecs: 0, bumps: 0 },
  };
}

export const live = {
  offset: 0, // server clock minus ours
  rtt: 0,
  me: makeKart(),
  karts: new Map(), // id -> { buf: [{t,x,z,yaw,speed,flags}], lap, rank, x, y, z, yaw, speed, flags, idx }
  input: { steer: 0, throttle: 0, brake: 0, drift: false, boost: false },
  touch: { active: false, steer: 0, brake: false, drift: false, boost: false },
  fx: [], // pixel effects waiting to be spawned: { name, x, y, z, scale, opts }
  shake: 0,
  meVis: null, // our car's 3D object, so the camera can follow its smoothed position
  lobbyAt: new Map(), // id -> where that car was last drawn on the lobby grid, so the start can pick up from there
  launch: null, // { at, from: Map(id -> {x, z, yaw}) }: cars rolling from their lobby slots to the final grid
};

export const serverNow = () => Date.now() + live.offset;

export function resetLive() {
  live.me = makeKart();
  live.karts.clear();
  live.lobbyAt.clear();
  live.launch = null;
  live.fx.length = 0;
  live.shake = 0;
}

export function spawnFx(name, x, z, opts = {}) {
  if (live.fx.length < 24) live.fx.push({ name, x, z, y: opts.y ?? 0, scale: opts.scale ?? 1, opts: opts.fx ?? {} });
}

const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Where a remote car is at server time `t`: interpolated between snapshots, briefly extrapolated past them. */
export function sampleKart(k, t, out) {
  const buf = k.buf;
  if (!buf.length) return null;
  let i = buf.length - 1;
  while (i > 0 && buf[i].t > t) i--;
  const a = buf[i], b = buf[i + 1];
  if (b && b.t > a.t) {
    const u = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    out.x = a.x + (b.x - a.x) * u;
    out.z = a.z + (b.z - a.z) * u;
    out.yaw = lerpAngle(a.yaw, b.yaw, u);
    out.speed = a.speed + (b.speed - a.speed) * u;
    out.flags = u < 0.5 ? a.flags : b.flags;
  } else {
    const dt = Math.min(0.2, Math.max(0, (t - a.t) / 1000));
    out.x = a.x + Math.sin(a.yaw) * a.speed * dt;
    out.z = a.z + Math.cos(a.yaw) * a.speed * dt;
    out.yaw = a.yaw;
    out.speed = a.speed;
    out.flags = a.flags;
  }
  return out;
}
