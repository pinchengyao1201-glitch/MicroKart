// Everything that can be owned. All of it is cosmetic: nothing here changes how a car drives.
// price: { coins } is earned by racing, { gems } is the premium currency, {} is free from the start.
// The teams are invented for this game: no real team, sponsor or livery is used.

export const SKINS = [
  { id: 'volpe', name: 'Scuderia Volpe', body: '#d91e2a', accent: '#ffffff', trim: '#15161a', price: {} },
  { id: 'atlas', name: 'Atlas Racing', body: '#1c5fd4', accent: '#ffd23c', trim: '#101a33', price: {} },
  { id: 'verde', name: 'Verde Motorsport', body: '#0f7a4c', accent: '#e9f5c9', trim: '#0c2a1c', price: { coins: 250 } },
  { id: 'solaris', name: 'Team Solaris', body: '#ff7a1a', accent: '#1c2a44', trim: '#1c2a44', price: { coins: 250 } },
  { id: 'argent', name: 'Argent GP', body: '#c9ced6', accent: '#19e0c0', trim: '#20242b', metal: true, price: { coins: 450 } },
  { id: 'nordwind', name: 'Nordwind', body: '#f4f4f0', accent: '#1a3f8c', trim: '#1a3f8c', price: { coins: 600 } },
  { id: 'rosa', name: 'Rosa Corse', body: '#ff5fa2', accent: '#2a3c8c', trim: '#2a1d3a', price: { coins: 800 } },
  { id: 'carbon', name: 'Carbon Works', body: '#1b1d24', accent: '#ff2e3e', trim: '#0d0e12', price: { gems: 120 } },
  { id: 'nightshift', name: 'Night Shift', body: '#12141c', accent: '#3cffd0', trim: '#0a0b10', glow: '#3cffd0', price: { gems: 220 } },
  { id: 'gold', name: 'Gold Standard', body: '#f2c230', accent: '#fff3b0', trim: '#5a430a', metal: true, price: { gems: 400 } },
  { id: 'comet', name: 'Comet', body: '#2b3cff', accent: '#ff5ad2', trim: '#11155a', glow: '#ff5ad2', price: { pass: 4 } },
  { id: 'champion', name: 'World Champion', body: '#ffffff', accent: '#f2c230', trim: '#c81e3c', metal: true, price: { pass: 10 } },
];

// The colour of the exhaust flame under boost and of the sparks while drifting
export const TRAILS = [
  { id: 'spark', name: 'Standard', colors: ['#fff3a6', '#ffb02a', '#ff5a1f'], price: {} },
  { id: 'frost', name: 'Frost', colors: ['#ffffff', '#8ee6ff', '#3c8cff'], price: { coins: 300 } },
  { id: 'toxic', name: 'Toxic', colors: ['#f0ffb0', '#7ef03c', '#1fa83c'], price: { coins: 300 } },
  { id: 'magenta', name: 'Magenta', colors: ['#ffffff', '#ff86e6', '#b0228f'], price: { coins: 500 } },
  { id: 'plasma', name: 'Plasma', colors: ['#ffffff', '#b48cff', '#5a2bff'], price: { gems: 150 } },
  { id: 'prism', name: 'Prism', colors: ['#ff4a5a', '#ffe03c', '#3cc8ff'], price: { gems: 300 } },
  { id: 'ember', name: 'Ember', colors: ['#fff07a', '#ff5a1f', '#8a1208'], price: { pass: 7 } },
];

// The helmet is also your avatar in player lists
export const HELMETS = [
  { id: 'white', name: 'Classic White', color: '#f4f4f0', stripe: '#d91e2a', price: {} },
  { id: 'yellow', name: 'Canary', color: '#ffd23c', stripe: '#15161a', price: {} },
  { id: 'red', name: 'Signal Red', color: '#e5202b', stripe: '#ffffff', price: { coins: 150 } },
  { id: 'blue', name: 'Deep Blue', color: '#1c5fd4', stripe: '#ffffff', price: { coins: 150 } },
  { id: 'green', name: 'Racing Green', color: '#0f7a4c', stripe: '#ffd23c', price: { coins: 300 } },
  { id: 'black', name: 'Stealth', color: '#17181d', stripe: '#ff2e3e', price: { coins: 500 } },
  { id: 'chrome', name: 'Chrome', color: '#d8dce4', stripe: '#19e0c0', metal: true, price: { gems: 100 } },
  { id: 'gold', name: 'Gold Leaf', color: '#f2c230', stripe: '#ffffff', metal: true, price: { gems: 250 } },
  { id: 'aurora', name: 'Aurora', color: '#12141c', stripe: '#3cffd0', glow: '#3cffd0', price: { pass: 2 } },
];

export const CATALOG = { skin: SKINS, trail: TRAILS, helmet: HELMETS };

export const DEFAULT_KART = { skin: 'volpe', trail: 'spark', helmet: 'white' };
export const STARTER_ITEMS = ['skin:volpe', 'skin:atlas', 'trail:spark', 'helmet:white', 'helmet:yellow'];

const index = {};
for (const [slot, list] of Object.entries(CATALOG)) for (const it of list) index[`${slot}:${it.id}`] = it;
export const findItem = (slot, id) => index[`${slot}:${id}`] ?? null;
export const skinOf = (id) => findItem('skin', id) ?? SKINS[0];
export const trailOf = (id) => findItem('trail', id) ?? TRAILS[0];
export const helmetOf = (id) => findItem('helmet', id) ?? HELMETS[0];

/** A car loadout with unknown ids replaced by defaults (the server runs this on whatever a client sends). */
export function cleanKart(k) {
  return {
    skin: findItem('skin', k?.skin) ? k.skin : DEFAULT_KART.skin,
    trail: findItem('trail', k?.trail) ? k.trail : DEFAULT_KART.trail,
    helmet: findItem('helmet', k?.helmet) ? k.helmet : DEFAULT_KART.helmet,
  };
}

// Premium currency packs. `price` is display only: the amount charged is decided by the payment provider's
// own product configuration on the server, never by the client.
export const GEM_PACKS = [
  { sku: 'gems_80', gems: 80, price: '$0.99', tag: null },
  { sku: 'gems_500', gems: 500, price: '$4.99', tag: 'Most popular' },
  { sku: 'gems_1200', gems: 1200, price: '$9.99', tag: 'Best value' },
];

// Season pass: XP from racing climbs the tiers. The free lane is for everyone, the premium lane needs the pass.
export const PASS = {
  season: 'Season 1: Lights Out',
  xpPerTier: 120,
  premiumPrice: 450, // gems
  tiers: [
    { free: { coins: 100 }, premium: { gems: 20 } },
    { free: { coins: 100 }, premium: { item: ['helmet', 'aurora'] } },
    { free: { coins: 150 }, premium: { gems: 30 } },
    { free: { gems: 10 }, premium: { item: ['skin', 'comet'] } },
    { free: { coins: 200 }, premium: { coins: 400 } },
    { free: { coins: 200 }, premium: { gems: 40 } },
    { free: { gems: 15 }, premium: { item: ['trail', 'ember'] } },
    { free: { coins: 300 }, premium: { gems: 50 } },
    { free: { coins: 300 }, premium: { coins: 800 } },
    { free: { gems: 25 }, premium: { item: ['skin', 'champion'] } },
  ],
};

// AI drivers. Invented surnames, not real drivers.
export const BOT_NAMES = ['Vega', 'Kato', 'Lindqvist', 'Moreau', 'Okafor', 'Silva', 'Brandt', 'Novak', 'Tanaka', 'Reyes', 'Ilves', 'Marchetti'];

// Trackside advertising for companies that do not exist
export const SPONSORS = ['VOLTA', 'KINETIQ', 'APEXA', 'NORDWIND', 'HALO TYRES', 'ZEPHYR AIR', 'ORBIT', 'LUMEN', 'TERRA FUEL', 'PULSE'];
