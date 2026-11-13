// React-facing state: the saved profile (wallet, garage, records, settings) and the slow-changing parts of a
// session (which screen, the room, the HUD numbers). Anything that changes every frame lives in game/live.js.

import { create } from 'zustand';
import { DEFAULT_KART, STARTER_ITEMS, findItem, PASS, cleanKart } from '../shared/catalog.js';

const KEY = 'mkgp.profile.v2';

const freshProfile = () => ({
  name: '',
  coins: 0,
  gems: 0,
  xp: 0,
  owned: [...STARTER_ITEMS],
  kart: { ...DEFAULT_KART },
  passPremium: false,
  claimed: [], // 'f3' / 'p3' = free / premium reward of tier index 3
  races: 0,
  wins: 0,
  pbs: {}, // circuit id -> best time-trial lap in ms
  settings: { quality: 'high', sound: true, music: true },
});

function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const base = freshProfile();
      return { ...base, ...raw, kart: cleanKart(raw.kart), pbs: { ...raw.pbs }, settings: { ...base.settings, ...raw.settings } };
    }
  } catch {}
  return freshProfile();
}

function saveProfile(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

const emptyHud = () => ({
  place: 0, lap: 1, finished: null, banner: null, lastLapMs: null, bestLapMs: null, lapStartAt: 0, fastestBy: null,
});

export const useStore = create((set, get) => ({
  profile: loadProfile(),
  screen: 'menu', // menu | garage | shop | circuits | play
  conn: 'idle', // idle | connecting | online | reconnecting
  error: null,
  note: null, // a short message from the server, shown as a toast
  myId: null,
  room: null,
  results: null, // { list, circuit, laps, fastest, series }
  hud: emptyHud(),
  picker: false, // the circuit calendar is open over the lobby
  claimedRace: false, // this race's reward has been banked
  adDoubled: false,
  modal: null, // a checkout or ad stand-in waiting for an answer (see monetization.js)

  go: (screen) => set({ screen, error: null }),
  setError: (error) => set({ error }),
  resetHud: () => set({ hud: emptyHud(), results: null, claimedRace: false, adDoubled: false }),
  patchHud: (patch) => set((s) => ({ hud: { ...s.hud, ...patch } })),

  updateProfile: (fn) =>
    set((s) => {
      const profile = fn(s.profile);
      saveProfile(profile);
      return { profile };
    }),

  setName: (name) => get().updateProfile((p) => ({ ...p, name: name.slice(0, 14) })),
  setSetting: (k, v) => get().updateProfile((p) => ({ ...p, settings: { ...p.settings, [k]: v } })),

  /** Buy with coins or gems. Returns null on success or a reason it failed. */
  buy: (slot, id) => {
    const item = findItem(slot, id), p = get().profile;
    if (!item) return 'Not for sale';
    if (p.owned.includes(`${slot}:${id}`)) return null;
    const { coins = 0, gems = 0, pass } = item.price;
    if (pass) return `Season pass tier ${pass} reward`;
    if (p.coins < coins) return 'Not enough coins';
    if (p.gems < gems) return 'Not enough gems';
    get().updateProfile((q) => ({ ...q, coins: q.coins - coins, gems: q.gems - gems, owned: [...q.owned, `${slot}:${id}`] }));
    return null;
  },

  equip: (slot, id) => {
    if (!get().profile.owned.includes(`${slot}:${id}`)) return;
    get().updateProfile((p) => ({ ...p, kart: { ...p.kart, [slot]: id } }));
  },

  grant: ({ coins = 0, gems = 0, xp = 0, item = null }) =>
    get().updateProfile((p) => ({
      ...p,
      coins: p.coins + coins,
      gems: p.gems + gems,
      xp: p.xp + xp,
      owned: item && !p.owned.includes(item.join(':')) ? [...p.owned, item.join(':')] : p.owned,
    })),

  buyPass: () => {
    const p = get().profile;
    if (p.passPremium) return null;
    if (p.gems < PASS.premiumPrice) return 'Not enough gems';
    get().updateProfile((q) => ({ ...q, gems: q.gems - PASS.premiumPrice, passPremium: true }));
    return null;
  },

  claimTier: (i, lane) => {
    const p = get().profile, key = (lane === 'premium' ? 'p' : 'f') + i, tier = PASS.tiers[i];
    if (!tier || p.claimed.includes(key)) return;
    if (Math.floor(p.xp / PASS.xpPerTier) <= i) return;
    if (lane === 'premium' && !p.passPremium) return;
    get().updateProfile((q) => ({ ...q, claimed: [...q.claimed, key] }));
    get().grant(tier[lane]);
  },

  /** Bank a finished race: coins, XP and the win counter. Safe to call more than once per race. */
  bankRace: (mine) => {
    if (get().claimedRace || !mine) return;
    set({ claimedRace: true });
    get().updateProfile((p) => ({
      ...p,
      coins: p.coins + mine.reward,
      xp: p.xp + mine.xp,
      races: p.races + 1,
      wins: p.wins + (mine.place === 1 ? 1 : 0),
    }));
  },

  /** Record a time-trial lap. Returns true if it is a new personal best for the circuit. */
  recordLap: (circuit, ms) => {
    const old = get().profile.pbs[circuit];
    if (old && old <= ms) return false;
    get().updateProfile((p) => ({ ...p, pbs: { ...p.pbs, [circuit]: ms } }));
    return true;
  },
}));

export const getState = useStore.getState;
