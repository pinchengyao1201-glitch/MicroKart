// The cars: the one you drive (simulated here, moved by the physics engine), everyone else's (replayed from
// server snapshots, with a kinematic body so you can bump into them), the cars parked on the lobby grid, and
// the podium after the flag.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, BallCollider, useBeforePhysicsStep, useAfterPhysicsStep } from '@react-three/rapier';
import * as THREE from 'three';
import { KartModel, NameTag, makeMotion } from './KartModel.jsx';
import { live, serverNow, sampleKart, spawnFx, INTERP_MS } from './live.js';
import { stepKart, placeKart, autoDrive, slipstream } from './kartSim.js';
import { readInput } from './controls.js';
import { pointAt, gridSlot, locate, heightAt } from '../../shared/track.js';
import { KART, F, SLOT_COLORS } from '../../shared/constants.js';
import { getState } from '../store.js';
import { sfx, setEngine } from '../audio.js';
import { bannerTexture } from './textures.js';

const STEP = 1 / 60;
const AUTO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('auto');
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const ease = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
const LAUNCH_MS = 1700;

/** While the grid forms up, how far a car still is from its final slot (it rolls there from where it sat in the lobby). */
function launchOffset(id, at, out) {
  const l = live.launch, from = l?.from.get(id);
  if (!from) return null;
  const u = (performance.now() - l.at) / LAUNCH_MS;
  if (u >= 1) return null;
  const k = 1 - ease(Math.max(0, u));
  out.x = (from.x - at.x) * k;
  out.z = (from.z - at.z) * k;
  out.roll = Math.hypot(from.x - at.x, from.z - at.z) * (1 - u) * 2.2;
  return out;
}

function others(myId) {
  const list = [];
  for (const [id, o] of live.karts) if (id !== myId && o.buf?.length) list.push(o);
  return list;
}

export function PlayerKart({ track, kart, shadows }) {
  const body = useRef(), vis = useRef();
  const motion = useMemo(makeMotion, []);
  const scratch = useMemo(() => ({ events: [], auto: {}, look: null, off: {}, tow: false }), []);
  const start = useMemo(() => [live.me.x, live.me.y, live.me.z], []);

  useBeforePhysicsStep(() => {
    const b = body.current, k = live.me;
    if (!b) return;
    if (k.wantReset) {
      k.wantReset = false;
      if (!k.frozen && !k.finished) {
        const p = pointAt(track, k.idx * track.step, 0);
        k.teleport = { x: p.x, z: p.z, yaw: p.yaw };
        k.speed = 0;
        k.driftDir = 0;
        spawnFx('poof', p.x, p.z, { y: p.y, scale: 1 });
      }
    }
    if (k.teleport) {
      const t = k.teleport;
      Object.assign(k, { x: t.x, z: t.z, yaw: t.yaw, vx: 0, vz: 0, cvx: 0, cvz: 0, teleport: null });
      if (t.idx != null) k.idx = t.idx;
      placeKart(k, track, 0);
      b.setTranslation({ x: t.x, y: k.y, z: t.z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      scratch.look = null;
    } else {
      const v = b.linvel();
      k.vx = v.x;
      k.vz = v.z;
    }
    const inp = k.finished || AUTO ? autoDrive(k, track, scratch.auto, k.finished ? 0.6 : 1) : readInput();
    stepKart(k, inp, STEP, scratch.events);
    b.setLinvel({ x: k.vx, y: 0, z: k.vz }, true);
  });

  useAfterPhysicsStep(() => {
    const b = body.current, k = live.me;
    if (!b) return;
    const t = b.translation();
    k.x = t.x;
    k.z = t.z;
    placeKart(k, track, STEP);
    // the body rides at the height of the road, so a bridge and the road under it never touch
    if (Math.abs(t.y - k.y) > 0.01) b.setTranslation({ x: t.x, y: k.y, z: t.z }, true);
    const tow = slipstream(k, others(getState().myId), STEP);
    if (tow && !scratch.tow && k.slip < 0.2) sfx('slip');
    scratch.tow = tow;

    for (const e of scratch.events) {
      if (e === 'bump') {
        sfx('bump');
        live.shake = Math.max(live.shake, 0.5);
        spawnFx('spark', k.x + Math.sin(k.yaw) * 1.6, k.z + Math.cos(k.yaw) * 1.6, { y: k.y + 0.3, scale: 1.2 });
      } else if (e === 'drift') sfx('drift');
      else if (e.startsWith('charge')) sfx('charge');
      else if (e === 'boost') sfx('boost');
    }
    scratch.events.length = 0;
  });

  useFrame((_, dt) => {
    const k = live.me, g = vis.current;
    if (!g) return;
    const want = k.yaw + k.driftDir * 0.3;
    scratch.look = scratch.look == null ? want : lerpAngle(scratch.look, want, Math.min(1, dt * 22));
    g.rotation.order = 'YXZ';
    g.rotation.y = scratch.look;
    g.rotation.x += (-track.pitch[k.idx] - g.rotation.x) * Math.min(1, dt * 8);
    const off = launchOffset(getState().myId, k, scratch.off);
    g.position.set(off ? off.x : 0, 0, off ? off.z : 0);
    motion.speed = off ? off.roll : k.speed;
    motion.steer = k.steer;
    motion.driftDir = k.driftDir;
    motion.driftLvl = k.driftLvl;
    motion.boost = k.boost;
    motion.brake = k.braking;
    live.meVis = g;
    const state = getState().room?.state;
    setEngine(Math.abs(k.speed) / KART.maxSpeed, k.driftDir ? 1 : 0, state === 'racing' || state === 'countdown', k.frozen && state === 'countdown');
  });
  useEffect(() => () => { live.meVis = null; }, []);

  return (
    <RigidBody
      ref={body} type="dynamic" colliders={false} position={start} canSleep={false} ccd
      enabledRotations={[false, false, false]} enabledTranslations={[true, false, true]} linearDamping={0} gravityScale={0}
    >
      <BallCollider args={[KART.radius]} position={[0, 1, 0]} friction={0} restitution={0.2} />
      <group ref={vis}>
        <KartModel kart={kart} motion={motion} shadows={shadows} />
      </group>
    </RigidBody>
  );
}

export function RemoteKart({ id, kart, name, color, track, shadows }) {
  const g = useRef(), body = useRef();
  const motion = useMemo(makeMotion, []);
  const s = useMemo(() => ({ x: 0, z: 0, yaw: 0, speed: 0, flags: 0, prevYaw: null, idx: -1, off: {} }), []);

  useFrame((_, dt) => {
    const k = live.karts.get(id), grp = g.current;
    if (!grp) return;
    if (!k || !sampleKart(k, serverNow() - INTERP_MS, s)) {
      grp.visible = false;
      return;
    }
    grp.visible = true;
    s.idx = locate(track, s.x, s.z, s.idx).i;
    const y = heightAt(track, s.idx, s.x, s.z);
    k.x = s.x; k.y = y; k.z = s.z; k.yaw = s.yaw; k.speed = s.speed; k.idx = s.idx; // the camera, minimap and slipstream read these
    const drift = s.flags & F.DRIFT;
    const yawRate = s.prevYaw == null || dt <= 0 ? 0 : Math.atan2(Math.sin(s.yaw - s.prevYaw), Math.cos(s.yaw - s.prevYaw)) / dt;
    s.prevYaw = s.yaw;
    const dir = Math.sign(yawRate) || 0;
    const off = launchOffset(id, s, s.off);
    grp.position.set(s.x + (off ? off.x : 0), y, s.z + (off ? off.z : 0));
    grp.rotation.order = 'YXZ';
    grp.rotation.y = s.yaw + (drift ? dir * 0.3 : 0);
    grp.rotation.x += (-track.pitch[s.idx] - grp.rotation.x) * Math.min(1, dt * 8);
    motion.speed = off ? off.roll : s.speed;
    motion.steer += (Math.max(-1, Math.min(1, yawRate / 2)) - motion.steer) * Math.min(1, dt * 8);
    motion.driftDir = drift ? dir : 0;
    motion.driftLvl = (s.flags >> 3) & 3;
    motion.boost = s.flags & F.BOOST ? 1 : 0;
    motion.brake = !!(s.flags & F.BRAKE);
    body.current?.setNextKinematicTranslation({ x: s.x, y, z: s.z });
  });

  return (
    <>
      <group ref={g} visible={false}>
        <KartModel kart={kart} motion={motion} shadows={shadows} />
        <NameTag name={name} color={color} />
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, -50, 0]}>
        <BallCollider args={[KART.radius]} position={[0, 1, 0]} friction={0} restitution={0.3} />
      </RigidBody>
    </>
  );
}

/** One car on the lobby grid. A new arrival drives up from behind; a car whose slot changes rolls to the new one. */
function LobbyCar({ track, player, mine }) {
  const g = useRef();
  const motion = useMemo(makeMotion, []);
  const s = useMemo(() => ({ slot: -1, track: null, t: 9, from: null, at: null }), []);
  const target = useMemo(() => gridSlot(track, player.slot), [track, player.slot]);

  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp) return;
    if (s.slot !== player.slot || s.track !== track) {
      // same circuit: roll from wherever we are. New circuit or new arrival: drive in from the back of the grid
      s.from = s.track === track && s.at ? { ...s.at } : pointAt(track, target.dist - 38, target.lat);
      s.slot = player.slot;
      s.track = track;
      s.t = 0;
    }
    s.t += dt;
    const u = Math.min(1, s.t / 1.9), e = ease(u);
    const x = s.from.x + (target.x - s.from.x) * e, z = s.from.z + (target.z - s.from.z) * e;
    const y = (s.from.y ?? target.y) + (target.y - (s.from.y ?? target.y)) * e;
    const yaw = lerpAngle(s.from.yaw, target.yaw, e);
    grp.position.set(x, y, z);
    grp.rotation.y = yaw;
    motion.speed = u < 1 ? Math.hypot(target.x - s.from.x, target.z - s.from.z) * (1 - u) * (1 - u) * 1.6 : 0;
    motion.brake = u > 0.6 && u < 1;
    s.at = { x, y, z, yaw };
    live.lobbyAt.set(player.id, s.at);
  });

  const color = SLOT_COLORS[player.slot % SLOT_COLORS.length];
  return (
    <group ref={g}>
      <KartModel kart={player.kart} motion={motion} />
      <NameTag name={mine ? `${player.name} (you)` : player.name} color={color} status={player.bot ? null : player.ready ? 'ready' : 'wait'} fade={false} y={2.5} size={1.15} />
    </group>
  );
}

export function LobbyCars({ track, players, myId }) {
  return players.filter((p) => p.slot >= 0).map((p) => <LobbyCar key={p.id} track={track} player={p} mine={p.id === myId} />);
}

const STEPS = [
  { place: 1, x: 0, h: 1.7, color: '#f2c230' },
  { place: 2, x: -3.6, h: 1.15, color: '#c9ced6' },
  { place: 3, x: 3.6, h: 0.8, color: '#c98a4a' },
];

/** Where the podium stands: on the road just past the line, facing back toward the grid. */
export function podiumFrame(track) {
  const p = pointAt(track, 20, 0);
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw + Math.PI };
}

function PodiumCar({ result, step }) {
  const g = useRef();
  const motion = useMemo(makeMotion, []);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    const grp = g.current;
    if (!grp) return;
    if (step.place === 1) {
      // the winner gets a victory spin and a little bounce
      grp.rotation.y = t.current * 1.3;
      grp.position.y = step.h + Math.abs(Math.sin(t.current * 3.2)) * 0.35;
      motion.speed = 14;
      motion.boost = Math.sin(t.current * 3) > 0.2 ? 1 : 0;
    } else grp.rotation.y = (step.place === 2 ? 0.35 : -0.35) + Math.sin(t.current * 0.8) * 0.06;
  });
  return (
    <group ref={g} position={[step.x, step.h, 0.2]}>
      <group scale={0.82}>
        <KartModel kart={result.kart} motion={motion} />
      </group>
      <NameTag name={result.name} color={SLOT_COLORS[(result.slot + 8) % SLOT_COLORS.length]} fade={false} y={2.3} />
    </group>
  );
}

export function Podium({ track, results }) {
  const f = useMemo(() => podiumFrame(track), [track]);
  const mats = useMemo(
    () => STEPS.map((s) => [new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: bannerTexture(String(s.place), s.color, '#15161a', { w: 128, h: 96 }), roughness: 0.5 })]),
    []
  );
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current -= dt;
    if (clock.current > 0) return;
    clock.current = 0.55 + Math.random() * 0.5;
    const a = Math.random() * 6.28, d = Math.random() * 5;
    spawnFx(Math.random() < 0.3 ? 'firework' : 'confetti', f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, { y: f.y + 3 + Math.random() * 5, scale: 2 + Math.random() * 1.5 });
  });
  const top = results.slice(0, 3);
  return (
    <group position={[f.x, f.y, f.z]} rotation={[0, f.yaw, 0]}>
      {STEPS.map((s, i) => (
        <group key={s.place} position={[s.x, 0, 0]}>
          <mesh position={[0, s.h / 2, 0]} material={mats[i][0]} castShadow receiveShadow>
            <boxGeometry args={[3.5, s.h, 5]} />
          </mesh>
          <mesh position={[0, s.h / 2, 2.52]} material={mats[i][1]}>
            <planeGeometry args={[1.5, Math.min(1.1, s.h * 0.8)]} />
          </mesh>
        </group>
      ))}
      {top.map((r) => {
        const step = STEPS.find((s) => s.place === r.place);
        return step ? <PodiumCar key={r.id} result={r} step={step} /> : null;
      })}
    </group>
  );
}
