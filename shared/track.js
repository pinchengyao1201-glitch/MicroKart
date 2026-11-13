// Track geometry, shared by client and server (no three.js here).
//
// A circuit's control points (shared/circuits.js) become a closed loop of N evenly spaced samples. Index 0 is
// the start line and the racing direction is increasing index. Each sample has a position (x, z), a height y,
// a unit tangent (tx, tz), a heading and a signed curvature.
// Heading convention everywhere: yaw is the angle about +Y, forward = (sin yaw, cos yaw) in (x, z).
// Map coordinates [right, up] become world x = -right, z = up, so a camera looking straight down with +z at
// the top of the screen sees the circuit the way its map is drawn.

import { CIRCUITS, circuitOf } from './circuits.js';

export const BARRIER_T = 0.5; // barrier thickness
const BOT_GRIP = 44; // lateral grip the lap-time estimate assumes (matches the bots in server/room.js)

const cache = new Map();

/** The built geometry of a circuit (cached). */
export function getTrack(id) {
  const def = circuitOf(id);
  if (!cache.has(def.id)) cache.set(def.id, buildTrack(def));
  return cache.get(def.id);
}
export const allTracks = () => CIRCUITS.map((c) => getTrack(c.id));

const wrap = (i, n) => ((i % n) + n) % n;

/** Closed Catmull-Rom through pts ([x, z, h]), k points per span. */
function spline(pts, k) {
  const m = pts.length, out = [];
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  return out;
}

function perimeter(pts) {
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

/** n points at even spacing round the closed polyline, starting at its first point. */
function resample(pts, n) {
  const D = pts.length, cum = new Float64Array(D + 1);
  for (let i = 0; i < D; i++) {
    const a = pts[i], b = pts[(i + 1) % D];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const step = cum[D] / n, out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = k * step;
    while (j < D - 1 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1), a = pts[j], b = pts[(j + 1) % D];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  return out;
}

function radiusAt(pts, i, w) {
  const n = pts.length, a = pts[wrap(i - w, n)], b = pts[i], c = pts[wrap(i + w, n)];
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return area2 < 1e-9 ? Infinity : (ab * bc * ca) / (2 * area2);
}

/**
 * Make a hand-drawn loop drivable: open out any corner tighter than minR and push apart any two stretches
 * closer than minSep (unless one passes over the other). The shape is otherwise left alone.
 */
function relax(input, minR, minSep) {
  let pts = input.map((p) => [...p]);
  const n = pts.length;
  for (let it = 0; it < 240; it++) {
    const step = perimeter(pts) / n;
    const w = Math.max(1, Math.round((minR * 0.4) / step));
    const next = pts.map((p) => [...p]);
    let moved = false;
    const tight = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (radiusAt(pts, i, w) >= minR) continue;
      for (let o = -w; o <= w; o++) tight[wrap(i + o, n)] = 1;
    }
    for (let i = 0; i < n; i++) {
      if (!tight[i]) continue;
      const a = pts[wrap(i - 1, n)], b = pts[wrap(i + 1, n)];
      next[i][0] += ((a[0] + b[0]) / 2 - pts[i][0]) * 0.5;
      next[i][1] += ((a[1] + b[1]) / 2 - pts[i][1]) * 0.5;
      moved = true;
    }
    const gap = Math.ceil((minSep * 2.2) / step);
    for (let i = 0; i < n; i++)
      for (let j = i + gap; j < n; j++) {
        if (n - j + i < gap) break;
        const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1];
        if (Math.abs(dx) > minSep || Math.abs(dz) > minSep) continue;
        if (Math.abs(pts[j][2] - pts[i][2]) > 3) continue; // a bridge
        const d = Math.hypot(dx, dz);
        if (d >= minSep || d < 1e-6) continue;
        const push = ((minSep - d) / d) * 0.2;
        next[i][0] -= dx * push; next[i][1] -= dz * push;
        next[j][0] += dx * push; next[j][1] += dz * push;
        moved = true;
      }
    pts = next;
    if (!moved) break;
    if (it % 6 === 5) pts = resample(pts, n);
  }
  return pts;
}

export function buildTrack(def, n = 512) {
  const halfWidth = def.w, wallAt = def.w + def.sh;
  const raw = def.points.map(([mx, my, h = 0]) => [-mx, my, h]);
  const scale = def.lap / perimeter(spline(raw, 16));
  const scaled = raw.map(([x, z, h]) => [x * scale, z * scale, h]);
  const coarse = relax(resample(spline(scaled, 16), 256), wallAt + 3.6, wallAt * 2 + 5);
  const pts = resample(spline(coarse, 8), n);

  const x = new Float32Array(n), z = new Float32Array(n), y = new Float32Array(n);
  for (let k = 0; k < n; k++) { x[k] = pts[k][0]; z[k] = pts[k][1]; y[k] = pts[k][2]; }
  // smooth the heights so climbs start and end gently, and stand the lowest point on the ground
  for (let pass = 0; pass < 6; pass++) {
    const prev = Float32Array.from(y);
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let o = -5; o <= 5; o++) s += prev[wrap(k + o, n)];
      y[k] = s / 11;
    }
  }
  let low = Infinity;
  for (let k = 0; k < n; k++) low = Math.min(low, y[k]);
  for (let k = 0; k < n; k++) y[k] -= low;

  let len = 0;
  for (let k = 0; k < n; k++) len += Math.hypot(x[(k + 1) % n] - x[k], z[(k + 1) % n] - z[k]);
  const step = len / n;
  const tx = new Float32Array(n), tz = new Float32Array(n), yaw = new Float32Array(n), curv = new Float32Array(n), pitch = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = wrap(k - 1, n), b = (k + 1) % n;
    const dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz) || 1;
    tx[k] = dx / l;
    tz[k] = dz / l;
    yaw[k] = Math.atan2(dx, dz);
    pitch[k] = Math.atan2(y[b] - y[a], l);
  }
  for (let k = 0; k < n; k++) {
    const a = wrap(k - 2, n), b = (k + 2) % n;
    let d = yaw[b] - yaw[a];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    curv[k] = d / (4 * step); // signed: positive turns toward +yaw (left)
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
  for (let k = 0; k < n; k++) {
    minX = Math.min(minX, x[k]); maxX = Math.max(maxX, x[k]);
    minZ = Math.min(minZ, z[k]); maxZ = Math.max(maxZ, z[k]);
    maxY = Math.max(maxY, y[k]);
  }

  // where one stretch passes over another: the upper one is a bridge, with no embankment under it
  const bridge = new Uint8Array(n);
  if (maxY > 3) {
    const far = Math.ceil(60 / step);
    for (let i = 0; i < n; i++) {
      if (y[i] < 2.5) continue;
      const reach = wallAt * 2 + y[i] * 1.7 + 2;
      for (let j = 0; j < n; j++) {
        const ring = Math.min(wrap(j - i, n), wrap(i - j, n));
        if (ring < far || y[i] - y[j] < 2.5) continue;
        if (Math.hypot(x[i] - x[j], z[i] - z[j]) < reach) { bridge[i] = 1; break; }
      }
    }
  }

  // corners: runs of real curvature, split where the direction of the turn changes
  let corners = 0, run = 0, sign = 0;
  const cornerAt = [];
  for (let k = 0; k <= n; k++) {
    const c = curv[k % n], on = Math.abs(c) > 0.018, s = Math.sign(c);
    if (on && s === sign) run++;
    else {
      if (run * step > 9) { corners++; cornerAt.push(wrap(k - Math.ceil(run / 2), n)); }
      run = on ? 1 : 0;
      sign = on ? s : 0;
    }
  }

  // how long a lap takes at the pace the bots run: used for the default lap count and "about 2 minutes"
  let secs = 0;
  for (let k = 0; k < n; k++) {
    let kmax = 0;
    for (let o = 0; o < 10; o++) kmax = Math.max(kmax, Math.abs(curv[(k + o) % n]));
    secs += step / Math.min(29, Math.sqrt(BOT_GRIP / Math.max(kmax, 1e-3)));
  }
  const lapSecs = secs * 1.06;
  const laps = Math.max(3, Math.min(8, Math.round(150 / lapSecs)));

  return {
    id: def.id, def, n, len, step, x, z, y, tx, tz, yaw, curv, pitch, bridge, halfWidth, wallAt,
    bounds: { minX, maxX, minZ, maxZ, maxY }, corners, cornerAt, lapSecs, laps,
  };
}

/** A point on the track: `dist` units past the start line, `lat` units to the left of the centreline. */
export function pointAt(track, dist, lat = 0) {
  const { n, step } = track;
  const f = wrap(dist / step, n), i = Math.floor(f) % n, j = (i + 1) % n, u = f - Math.floor(f);
  const x = track.x[i] + (track.x[j] - track.x[i]) * u, z = track.z[i] + (track.z[j] - track.z[i]) * u;
  // left of travel is +(tz, -tx)
  const nx = track.tz[i], nz = -track.tx[i];
  let dy = track.yaw[j] - track.yaw[i];
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  return { x: x + nx * lat, z: z + nz * lat, y: track.y[i] + (track.y[j] - track.y[i]) * u, yaw: track.yaw[i] + dy * u, i };
}

/** Road height under (x, z), for something known to be near sample i. */
export function heightAt(track, i, x, z) {
  const j = (i + 1) % track.n;
  const u = Math.max(-1, Math.min(2, ((x - track.x[i]) * track.tx[i] + (z - track.z[i]) * track.tz[i]) / track.step));
  return track.y[i] + (track.y[j] - track.y[i]) * u;
}

/**
 * The nearest centreline sample to (x, z), searched in a window round `hint` so that a nearby stretch of track
 * is never mistaken for the one the car is on. Pass hint = -1 to search the whole loop.
 * Returns { i, lat, d2 }: the index, the signed distance left of the centreline, and the squared distance.
 */
export function locate(track, x, z, hint = -1, back = 14, ahead = 44) {
  const { n } = track;
  let best = 0, bd = Infinity;
  if (hint < 0) {
    for (let i = 0; i < n; i++) {
      const dx = x - track.x[i], dz = z - track.z[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
  } else {
    for (let o = -back; o <= ahead; o++) {
      const i = wrap(hint + o, n), dx = x - track.x[i], dz = z - track.z[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
  }
  const dx = x - track.x[best], dz = z - track.z[best];
  const lat = dx * track.tz[best] - dz * track.tx[best];
  return { i: best, lat, d2: bd };
}

/** Signed shortest difference between two sample indices on the loop. */
export function indexDelta(track, from, to) {
  let d = to - from;
  const n = track.n;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}

export const GRID_ROW = 7.2; // distance between rows of the starting grid

/** Grid slot k (0 = pole): two staggered columns behind the start line. */
export function gridSlot(track, k) {
  const row = Math.floor(k / 2), col = k % 2;
  const dist = -(5 + row * GRID_ROW + col * 3.4), lat = col ? -2.6 : 2.6;
  const p = pointAt(track, dist, Math.sign(lat) * Math.min(Math.abs(lat), track.halfWidth - 1.9));
  return { x: p.x, z: p.z, y: p.y, yaw: p.yaw, dist, lat };
}

/** The circuit outline as an SVG path, drawn the way its map is (x to the left, z up), inside size x size. */
export function outlinePath(track, size = 100, pad = 8) {
  const b = track.bounds, span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ), sc = (size - pad * 2) / span;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  let d = '';
  for (let i = 0; i < track.n; i += 2) d += `${i ? 'L' : 'M'}${(size / 2 - (track.x[i] - cx) * sc).toFixed(1)} ${(size / 2 - (track.z[i] - cz) * sc).toFixed(1)}`;
  return { d: d + 'Z', start: [size / 2 - (track.x[0] - cx) * sc, size / 2 - (track.z[0] - cz) * sc], sc, cx, cz };
}
