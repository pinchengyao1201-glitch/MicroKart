# Micro Kart Grand Prix

A multiplayer toy-kart racer for the browser. Wind-up karts race three laps round a desk, between stacks of
books and pencil pots, with up to 8 players in a room and bots filling the empty seats.

## Play it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. To race a friend on the same network, create a private room and send them the
invite link (start Vite with `npx vite --host` so other devices can reach it).

| | |
|---|---|
| Drive | `W A S D` or arrow keys |
| Drift | hold `Space` (or `Shift`) while turning; release for a mini-turbo. The longer the slide, the bigger the boost (three levels) |
| Use item | `E` (or `F`, `Enter`) |
| Reset onto the track | `R` |
| Phone / tablet | on-screen buttons; the kart accelerates by itself |

Items come from the capsules on the track: **Turbo Spring** (a burst of speed), **Gum Blob** (drop it behind
you; whoever hits it spins) and **Static Zap** (shocks the racer one place ahead). Racers further back get
better odds on the helpful ones.

## How it is built

| Part | Where | Notes |
|---|---|---|
| Rendering | `src/game/` | [three.js](https://github.com/mrdoob/three.js) through React Three Fiber. Every model and texture is built in code, so there are no asset files |
| Physics | `src/game/Karts.jsx`, `Track.jsx` | [react-three-rapier](https://github.com/pmndrs/react-three-rapier): the kart is a dynamic body, walls and other karts are colliders |
| Handling | `src/game/kartSim.js` | The arcade model (steering, drift, boosts). Plain JS, so it also runs in Node for tuning |
| Post-processing | `src/game/Game.jsx` | [react-postprocessing](https://github.com/pmndrs/react-postprocessing): bloom, boost chromatic aberration, vignette, tone mapping, SMAA |
| Effects | `src/game/PixelFx.jsx` | [pixelfx](https://github.com/patch-gg/pixelfx) pixel-art effects drawn to canvas textures and shown as sprites in the 3D scene (pickups, hits, zaps, confetti, fireworks) |
| Server | `server/` | Node + `ws`. Rooms, matchmaking, race clock, laps and places, pickups, items, bots |
| Shared rules | `shared/` | Track geometry, tuning constants and the cosmetics catalog, imported by both sides |
| UI | `src/ui/`, `src/styles.css` | Menu, garage, shop, lobby, HUD, results |

**Netcode.** Each client simulates its own kart and reports position 20 times a second. The server owns
everything that decides the race: the start time, lap counting (progress along the track, with a cap on how
fast anyone can advance), places, who got which pickup, item effects and the bots. Other karts are drawn
about 110 ms in the past, interpolated between server snapshots.

**Tracks** are closed splines defined by a handful of control points in `shared/track.js`. Add one there and
it gets a road, walls, pickups, scenery and bot support automatically.

### Scripts

| | |
|---|---|
| `npm run dev` | race server on :8787 and the client on :5173, both reloading on change |
| `npm run build` | production client into `dist/` |
| `npm start` | one process serving `dist/` and the WebSocket on `PORT` (default 8787) |
| `npm run check` | validates the track layouts and runs a full simulated race against the server logic |
| `node scripts/sim-handling.js` | drives the handling model round each track and prints lap times |

Add `?auto=1` to the URL and the kart drives itself, which is handy for testing.

## Monetization

Everything sold is cosmetic. No kart is faster than another.

- **Two currencies.** Coins are earned by racing (finishing place plus coins picked up). Gems are the premium
  currency, bought in packs.
- **Garage.** Paint, drift sparks and toppers, priced in coins or gems. You can try anything on before buying.
- **Season pass.** XP from racing climbs ten tiers. The free lane is open to everyone; the premium lane
  costs gems.
- **Rewarded ad.** After a race, watch an ad to double the coins from it.

**None of this takes real money yet.** There are two seams where a provider plugs in, and until one does they
show clearly labelled stand-ins (a "test checkout" that just adds the gems, and an "ad placeholder"):

- `server/payments.js` `createCheckout(sku)`: create a hosted checkout session with your payment provider and
  return `{ mode: 'redirect', url }`. Grant the gems from the provider's signed webhook.
- `src/monetization.js` `showRewardedAd()`: call your ad network's rewarded video and resolve `true` from its
  reward callback.

In production the test checkout is switched off unless `ALLOW_MOCK_PAYMENTS=1` is set.

### Before charging anyone

The wallet, garage and season progress are saved in the browser's `localStorage`, and race rewards are
credited by the client. That is fine for a prototype and trivially editable by a player. Real purchases need
player accounts and a server-side wallet, with rewards and unlocks granted by the server.

## Deploying

The server is a single Node process holding rooms in memory, so it needs a host that keeps one long-lived
process and supports WebSockets (Fly.io, Railway, Render, a VPS). Build, then run `npm start`. Serverless
platforms that spin functions up per request will not hold the rooms. To scale past one process you would
route each room code to the instance that owns it.

## Credits

Built with three.js, React Three Fiber, react-three-rapier, react-postprocessing, pixelfx (MIT, Patch and
Hugo Duprez), zustand and ws. Display font: Fredoka.
