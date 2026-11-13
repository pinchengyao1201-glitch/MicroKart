// The arcade handling model. It owns heading, speed, grip, drifting, the boost meter and the slipstream, and
// works out the velocity the car wants; the physics engine then moves the body and resolves barriers and other
// cars, and whatever velocity survives the collision is fed back in on the next step. No three.js or rapier in
// here, so it runs in Node too.

import { KART, DRIFT_LEVELS, BOOST, SLIP } from '../../shared/constants.js';
import { locate, pointAt, heightAt } from '../../shared/track.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Steering, throttle and brakes that follow the track. Used after the finish line and by the ?auto test driver. */
export function autoDrive(k, track, out, pace = 1) {
  const look = 7 + Math.abs(k.speed) * 0.42;
  const target = pointAt(track, (k.idx + 1) * track.step + look, 0);
  const want = Math.atan2(target.x - k.x, target.z - k.z);
  const err = angDiff(k.yaw, want);
  // brake for the tightest corner within stopping distance
  let kmax = 0;
  const span = Math.ceil((6 + k.speed * 0.8) / track.step);
  for (let o = 0; o < span; o++) kmax = Math.max(kmax, Math.abs(track.curv[(k.idx + o) % track.n]));
  const safe = Math.sqrt((KART.gripLat * 0.9) / Math.max(kmax, 1e-3));
  out.steer = clamp(err * 2.6, -1, 1);
  out.throttle = k.speed > safe ? 0 : pace;
  out.brake = k.speed > safe + 1.5 ? 1 : 0;
  out.drift = false;
  out.boost = false;
  return out;
}

/**
 * Advance the car by dt. Before calling, set k.vx/k.vz to the body's actual velocity; afterwards, give
 * k.vx/k.vz back to the body. One-shot happenings ('bump', 'drift', 'charge2', 'boost'...) are pushed onto `events`.
 */
export function stepKart(k, inp, dt, events) {
  // did a barrier or another car take speed off us since the last step? compare what the body is doing now
  // with the velocity we gave it then
  const actual = Math.hypot(k.vx, k.vz), asked = Math.hypot(k.cvx, k.cvz);
  if (asked > 2 && actual < asked * 0.8) {
    if (asked - actual > 8) {
      events.push('bump');
      k.stats.bumps++;
      k.driftDir = 0;
      k.drift = 0;
      k.driftLvl = 0;
    }
    k.speed *= actual / asked;
  }

  let { steer, throttle, brake, drift, boost } = inp;
  if (k.frozen) throttle = brake = steer = 0, drift = boost = false;
  k.steer += (steer - k.steer) * Math.min(1, dt * 10);
  k.braking = brake > 0 && k.speed > 1;

  // boost: hold to burn the meter. It needs a little in the tank to light, then runs until empty or released
  const canBoost = boost && !k.finished && k.speed > 4 && (k.boost ? k.meter > 0 : k.meter >= BOOST.minToFire);
  if (canBoost) {
    if (!k.boost) events.push('boost');
    k.boost = 1;
    k.meter = Math.max(0, k.meter - BOOST.drain * dt);
    k.stats.boostSecs += dt;
  } else k.boost = 0;

  // top speed right now
  let max = KART.maxSpeed * (1 + (KART.slipMult - 1) * k.slip);
  if (k.boost) max *= KART.boostMult;
  if (k.offroad) max *= k.boost ? 0.8 : KART.offroadMult;
  if (k.finished) max = Math.min(max, 17);

  if (throttle > 0 && k.speed < max) {
    const a = k.boost ? 46 : KART.accel * (1 - 0.45 * clamp(k.speed / max, 0, 1)) * (1 + 0.3 * k.slip);
    k.speed = Math.min(max, k.speed + a * throttle * dt);
  }
  if (k.speed > max) k.speed = Math.max(max, k.speed - (k.offroad ? 34 : 20) * dt);
  if (brake > 0) {
    if (k.speed > 0) k.speed = Math.max(0, k.speed - KART.brake * dt);
    else if (throttle <= 0) k.speed = Math.max(-KART.reverseMax, k.speed - 16 * dt);
  } else if (throttle <= 0) {
    k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), KART.coast * dt);
  }

  // drifting: hold drift while turning to slide. The slide fills the boost meter, faster the longer it is held
  if (k.driftDir) {
    if (!drift || k.speed < KART.driftMinSpeed * 0.7 || k.offroad) {
      if (k.driftLvl > 0) events.push('release');
      k.driftDir = 0;
      k.drift = 0;
      k.driftLvl = 0;
    } else {
      const into = steer * k.driftDir; // 1 = steering into the slide, -1 = countersteering
      k.drift += dt * (0.8 + 0.45 * into);
      let lvl = 0;
      for (let i = 0; i < DRIFT_LEVELS.length; i++) if (k.drift >= DRIFT_LEVELS[i].at) lvl = i + 1;
      if (lvl > k.driftLvl) events.push('charge' + lvl);
      k.driftLvl = lvl;
      const rate = lvl ? DRIFT_LEVELS[lvl - 1].rate : 1;
      k.meter = Math.min(1, k.meter + BOOST.charge * rate * dt);
      k.stats.driftSecs += dt;
    }
  } else if (drift && Math.abs(steer) > 0.25 && k.speed > KART.driftMinSpeed && !k.finished && !k.offroad) {
    k.driftDir = Math.sign(steer);
    k.drift = 0;
    k.driftLvl = 0;
    events.push('drift');
  }

  // heading: full lock at low speed, limited by tyre grip once the car is moving quickly, so fast corners
  // need a lift, the brakes or a drift
  let yawRate;
  if (k.driftDir) yawRate = k.driftDir * Math.max(0.5, 1.55 + 1.2 * k.steer * k.driftDir);
  else {
    const v = Math.abs(k.speed);
    yawRate = k.steer * Math.min(KART.turnRate * clamp(v / 7, 0, 1), KART.gripLat / Math.max(v, 1)) * (k.speed < 0 ? -1 : 1);
  }
  k.yaw += yawRate * dt;

  // the direction of travel trails the nose while sliding
  const travel = k.yaw - k.driftDir * KART.driftSlip;
  const grip = k.driftDir ? KART.gripDrift : KART.gripNormal;
  const a = 1 - Math.exp(-grip * dt);
  k.vx += (Math.sin(travel) * k.speed - k.vx) * a;
  k.vz += (Math.cos(travel) * k.speed - k.vz) * a;
  k.cvx = k.vx;
  k.cvz = k.vz;
  if (k.speed > k.stats.top) k.stats.top = k.speed;
}

/** After the body has moved: where are we on the track? */
export function placeKart(k, track, dt) {
  const loc = locate(track, k.x, k.z, k.idx);
  k.idx = loc.i;
  k.lat = loc.lat;
  k.y = heightAt(track, loc.i, k.x, k.z);
  k.offroad = Math.abs(loc.lat) > track.halfWidth + 0.25;
  const facing = Math.sin(k.yaw) * track.tx[loc.i] + Math.cos(k.yaw) * track.tz[loc.i];
  k.wrongWay = facing < -0.3 && k.speed > 6 ? k.wrongWay + dt : 0;
}

/** Tucked in behind another car? k.slip rises toward 1 while we are, and falls away when we pull out. */
export function slipstream(k, others, dt) {
  let tow = false;
  if (k.speed > SLIP.minSpeed && !k.frozen) {
    const sx = Math.sin(k.yaw), sz = Math.cos(k.yaw);
    for (const o of others) {
      if (o.x == null || (o.speed ?? 0) < 10 || Math.abs((o.y ?? 0) - k.y) > 2.5) continue;
      const dx = o.x - k.x, dz = o.z - k.z;
      const ahead = dx * sx + dz * sz;
      if (ahead < SLIP.min || ahead > SLIP.max) continue;
      if (Math.abs(dx * sz - dz * sx) < SLIP.side) { tow = true; break; }
    }
  }
  k.slip = clamp(k.slip + (tow ? dt / SLIP.rise : -dt / SLIP.fall), 0, 1);
  if (tow) k.stats.slipSecs += dt;
  return tow;
}
