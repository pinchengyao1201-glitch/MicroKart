// Rules and tuning shared by the client and the server.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;

export const MAX_HUMANS = 8;
export const GRID_SIZES = [2, 4, 6, 8]; // room capacities: the grid is always two columns wide
export const FILL_TO = 6; // AI drivers top the grid up to this many cars (never past the room's capacity)

// Car handling (world units are roughly metres at miniature scale; a car is ~3.4 long)
export const KART = {
  radius: 1.0,
  maxSpeed: 30,
  accel: 21,
  brake: 46,
  reverseMax: 9,
  coast: 9,
  turnRate: 2.05, // rad/s at low speed
  gripLat: 46, // lateral acceleration the tyres hold: above ~22 u/s this, not turnRate, limits steering
  boostMult: 1.3,
  slipMult: 1.09, // top-speed gain from a full slipstream
  offroadMult: 0.58,
  driftMinSpeed: 13,
  driftSlip: 0.4,
  gripNormal: 11,
  gripDrift: 5.2,
};
export const KMH = 9; // world speed -> the number on the speedometer

// Boost meter (0..1). Drifting fills it, faster the longer a slide is held; Shift spends it.
export const BOOST = {
  start: 0.3, // what everyone has on the grid
  drain: 0.42, // per second while boosting: a full meter is ~2.4 s
  minToFire: 0.12,
  charge: 0.16, // per second of drifting, times the drift level's rate
};
// Seconds of drifting to reach each charge level, and how much faster the meter fills at that level
export const DRIFT_LEVELS = [
  { at: 0.7, rate: 1.5 },
  { at: 1.6, rate: 2.1 },
  { at: 2.8, rate: 2.8 },
];
// Slipstream: tucked in this far behind another car, within this much to either side
export const SLIP = { min: 3.5, max: 22, side: 2.3, minSpeed: 16, rise: 1.1, fall: 2.2 };

export const COUNTDOWN_MS = 7400; // camera move, cars line up, five lights, lights out
export const LIGHT_GAP_MS = 700; // between one start light and the next
export const TRIAL_COUNTDOWN_MS = 3600;
/** How many of the five start lights are on at server time `now` (0 before the sequence and after lights out). */
export function lightsLit(startAt, hold, now) {
  if (!startAt || now >= startAt) return 0;
  const since = now - (startAt - hold - 4 * LIGHT_GAP_MS);
  return since < 0 ? 0 : Math.min(5, 1 + Math.floor(since / LIGHT_GAP_MS));
}
export const FINISH_GRACE_MS = 30000; // after the first human finishes
export const RACE_MAX_MS = 6 * 60 * 1000;
export const TRIAL_MAX_MS = 30 * 60 * 1000;
export const RESULTS_MS = 22000; // quick races move on by themselves after this long
export const QUICK_LOBBY_MS = 12000;
export const RECONNECT_MS = 20000; // how long a dropped player's car is kept for them

export const PLACE_REWARD = [60, 46, 36, 28, 22, 18, 14, 10];
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4]; // championship points by finishing place
export const FASTEST_LAP_COINS = 15;
export const OVERTAKE_COINS = 2;

// One colour per grid slot, so every car has its own on name tags, the minimap and the leaderboard
export const SLOT_COLORS = ['#ff4d4d', '#3da5ff', '#ffd23c', '#4ade80', '#ff8a3d', '#c084fc', '#2dd4bf', '#f472b6'];

// Flags packed into one integer in car snapshots
export const F = { DRIFT: 1, BOOST: 2, SLIP: 4, LVL1: 8, LVL2: 16, LVL3: 24, FINISHED: 32, BRAKE: 64 };

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const fmtTime = (ms) => {
  if (ms == null || !isFinite(ms)) return '--:--.--';
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
};
export const fmtGap = (ms) => (ms == null ? '' : `+${(ms / 1000).toFixed(2)}`);
export const fmtDuration = (secs) => {
  const m = Math.floor(secs / 60), s = Math.round((secs % 60) / 10) * 10;
  return s === 60 ? `${m + 1} min` : s ? `${m} min ${s} s` : `${m} min`;
};
