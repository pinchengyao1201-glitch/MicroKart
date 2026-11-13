// The circuit itself: road, run-off, kerbs, barriers (seen and collided with), embankments and bridges where
// the road climbs, the start line, the grid boxes and the start-light gantry.

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { pointAt, gridSlot, BARRIER_T } from '../../shared/track.js';
import { lightsLit } from '../../shared/constants.js';
import { useStore } from '../store.js';
import { serverNow } from './live.js';
import { asphaltTexture, runoffTexture, kerbTexture, groundTexture, barrierTexture, checkerTexture, bannerTexture } from './textures.js';

const SLOPE = 1.7; // embankments run this far out for every unit they drop

/**
 * A strip that follows the track. profile(i) returns [latA, yA, latB, yB]: the two edges of the strip at sample
 * i, as a distance left of the centreline and an absolute height. mask(i) false leaves that stretch out.
 */
export function strip(track, profile, repeat, along = 'v', mask = null) {
  const { n } = track, pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), idx = [];
  for (let k = 0; k <= n; k++) {
    const i = k % n, nx = track.tz[i], nz = -track.tx[i], [la, ya, lb, yb] = profile(i);
    pos.set([track.x[i] + nx * la, ya, track.z[i] + nz * la, track.x[i] + nx * lb, yb, track.z[i] + nz * lb], k * 6);
    const v = (k / n) * repeat;
    uv.set(along === 'v' ? [0, v, 1, v] : [v, 0, v, 1], k * 4);
    if (k < n && (!mask || (mask(i) && mask((i + 1) % n)))) {
      const p = k * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function TrackColliders({ track }) {
  const segs = useMemo(() => {
    const out = [], off = track.wallAt + BARRIER_T / 2;
    for (const side of [1, -1])
      for (let i = 0; i < track.n; i += 2) {
        const j = (i + 2) % track.n;
        const ax = track.x[i] + track.tz[i] * off * side, az = track.z[i] - track.tx[i] * off * side;
        const bx = track.x[j] + track.tz[j] * off * side, bz = track.z[j] - track.tx[j] * off * side;
        const dx = bx - ax, dz = bz - az;
        out.push({
          key: `${side}:${i}`, pos: [(ax + bx) / 2, (track.y[i] + track.y[j]) / 2 + 1, (az + bz) / 2],
          rot: [0, Math.atan2(-dz, dx), 0], args: [Math.hypot(dx, dz) / 2 + 0.2, 1.3, BARRIER_T / 2],
        });
      }
    return out;
  }, [track]);
  return (
    <RigidBody type="fixed" colliders={false} friction={0} restitution={0.2}>
      {segs.map((s) => (
        <CuboidCollider key={s.key} args={s.args} position={s.pos} rotation={s.rot} friction={0} restitution={0.2} />
      ))}
    </RigidBody>
  );
}

const LAMP_OFF = new THREE.Color('#2a0a0a'), LAMP_ON = new THREE.Color(7, 0.35, 0.25);

/** The five start lights, on a gantry just past the line. They follow the room's synchronised countdown. */
function StartLights({ width }) {
  const mats = useMemo(() => [0, 1, 2, 3, 4].map(() => new THREE.MeshBasicMaterial({ color: LAMP_OFF.clone(), toneMapped: false })), []);
  const banner = useMemo(() => new THREE.MeshStandardMaterial({ map: bannerTexture('MICRO KART GRAND PRIX', '#15161a', '#ffffff', { flags: true, w: 1024, h: 96 }), roughness: 0.6 }), []);
  const steel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2d36', roughness: 0.5, metalness: 0.6 }), []);
  useFrame(() => {
    const room = useStore.getState().room;
    const lit = room?.state === 'countdown' ? lightsLit(room.startAt, room.hold, serverNow()) : 0;
    for (let i = 0; i < 5; i++) mats[i].color.copy(i < lit ? LAMP_ON : LAMP_OFF);
  });
  return (
    <group>
      {[width, -width].map((x) => (
        <mesh key={x} position={[x, 3.6, 0]} material={steel} castShadow>
          <boxGeometry args={[0.5, 7.2, 0.5]} />
        </mesh>
      ))}
      <mesh position={[0, 7, 0]} material={banner} castShadow>
        <boxGeometry args={[width * 2 + 0.5, 1.5, 0.5]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} position={[(2 - i) * 1.25, 5.45, -0.1]}>
          <mesh material={steel}>
            <boxGeometry args={[0.95, 1.6, 0.4]} />
          </mesh>
          {[0.36, -0.36].map((y) => (
            <mesh key={y} position={[0, y, -0.2]} material={mats[i]}>
              <sphereGeometry args={[0.27, 14, 10]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function TrackVisual({ track, quality, boxes = 8 }) {
  const def = track.def, night = def.time === 'night';
  const { geo, mats, start, gantry, slots } = useMemo(() => {
    const W = track.wallAt, H = track.halfWidth, T = BARRIER_T, y = track.y;
    const BH = def.env === 'street' ? 1.05 : 0.9;
    const reps = (per) => Math.max(1, Math.round(track.len / per));
    const kerbOn = new Uint8Array(track.n);
    for (let i = 0; i < track.n; i++)
      if (Math.abs(track.curv[i]) > 0.03) for (let o = -3; o <= 3; o++) kerbOn[(i + o + track.n) % track.n] = 1;
    const raised = (i) => y[i] > 0.12 && !track.bridge[i];
    const geo = { road: strip(track, (i) => [H, y[i] + 0.03, -H, y[i] + 0.03], reps(12)), runoff: [], kerbs: [], barriers: [], skirts: [], deck: [] };
    for (const s of [1, -1]) {
      geo.runoff.push(strip(track, (i) => [s * W, y[i] + 0.02, s * (H - 0.05), y[i] + 0.02], reps(6)));
      if (def.sh > 1) geo.kerbs.push(strip(track, (i) => [s * (H + 0.85), y[i] + 0.05, s * (H - 0.05), y[i] + 0.045], reps(2.4), 'v', (i) => kerbOn[i]));
      geo.barriers.push(strip(track, (i) => [s * W, y[i], s * W, y[i] + BH], reps(6), 'u'));
      geo.barriers.push(strip(track, (i) => [s * W, y[i] + BH, s * (W + T), y[i] + BH], reps(6), 'u'));
      geo.barriers.push(strip(track, (i) => [s * (W + T), y[i] + BH, s * (W + T), y[i] - 0.05], reps(6), 'u'));
      if (track.bounds.maxY > 0.2) {
        geo.skirts.push(strip(track, (i) => [s * (W + T), y[i], s * (W + T + y[i] * SLOPE + 0.3), -0.04], reps(8), 'v', raised));
        geo.deck.push(strip(track, (i) => [s * (W + T), y[i], s * (W + T), y[i] - 0.8], reps(8), 'u', (i) => track.bridge[i]));
      }
    }
    if (track.bounds.maxY > 0.2) geo.deck.push(strip(track, (i) => [W + T, y[i] - 0.8, -(W + T), y[i] - 0.8], reps(8), 'v', (i) => track.bridge[i]));

    const runoffKind = def.env === 'green' ? 'grass' : def.sh > 1 ? 'paint' : 'plain';
    const side = THREE.DoubleSide;
    const mats = {
      road: new THREE.MeshStandardMaterial({ map: asphaltTexture(night), roughness: 0.88, side }),
      runoff: new THREE.MeshStandardMaterial({ map: runoffTexture(runoffKind, night), roughness: 0.95, side }),
      kerb: new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.7, side }),
      barrier: new THREE.MeshStandardMaterial({ map: barrierTexture(def.env === 'street' ? 'wall' : def.env === 'desert' ? 'tecpro' : 'armco', night), roughness: 0.6, metalness: def.env === 'green' ? 0.4 : 0, side }),
      ground: new THREE.MeshStandardMaterial({ map: groundTexture(def.env, def.time), roughness: 1 }),
      skirt: new THREE.MeshStandardMaterial({ map: def.env === 'street' ? runoffTexture('plain', night) : groundTexture(def.env, def.time), roughness: 1, side }),
      deck: new THREE.MeshStandardMaterial({ color: night ? '#3a3d47' : '#8a8d95', roughness: 0.9, side }),
      checker: new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 }),
      paint: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.8 }),
      water: new THREE.MeshStandardMaterial({ color: night ? '#0b1a2e' : def.time === 'dusk' ? '#3a5f8a' : '#2d7fb8', roughness: 0.15, metalness: 0.5 }),
    };
    const b = track.bounds, span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 600;
    mats.ground.map.repeat.set(span / 90, span / 90);
    mats.skirt.map.repeat.set(1, 0.25);
    return { geo, mats, start: pointAt(track, 0), gantry: pointAt(track, 8), slots: Array.from({ length: 8 }, (_, k) => gridSlot(track, k)) };
  }, [track, def, night]);

  const b = track.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 600;
  const shadows = quality !== 'low';

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.05, cz]} receiveShadow={shadows} material={mats.ground}>
        <planeGeometry args={[span, span]} />
      </mesh>
      {def.water && (
        // a harbour along one side of the circuit
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.0, b.minZ - 26 - span / 4]} material={mats.water}>
          <planeGeometry args={[span, span / 2]} />
        </mesh>
      )}
      <mesh geometry={geo.road} material={mats.road} receiveShadow={shadows} />
      {geo.runoff.map((g, i) => <mesh key={i} geometry={g} material={mats.runoff} receiveShadow={shadows} />)}
      {geo.kerbs.map((g, i) => <mesh key={i} geometry={g} material={mats.kerb} receiveShadow={shadows} />)}
      {geo.barriers.map((g, i) => <mesh key={i} geometry={g} material={mats.barrier} castShadow={shadows} receiveShadow={shadows} />)}
      {geo.skirts.map((g, i) => <mesh key={i} geometry={g} material={mats.skirt} receiveShadow={shadows} />)}
      {geo.deck.map((g, i) => <mesh key={i} geometry={g} material={mats.deck} castShadow={shadows} />)}

      {/* start line */}
      <group position={[start.x, start.y + 0.045, start.z]} rotation={[0, start.yaw, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mats.checker}>
          <planeGeometry args={[track.halfWidth * 2, 1.8]} />
        </mesh>
      </group>
      <group position={[gantry.x, gantry.y, gantry.z]} rotation={[0, gantry.yaw, 0]}>
        <StartLights width={track.wallAt + BARRIER_T + 0.6} />
      </group>

      {/* grid boxes: a bracket at the nose of each starting position */}
      {slots.slice(0, boxes).map((s, k) => (
        <group key={k} position={[s.x, s.y + 0.045, s.z]} rotation={[0, s.yaw, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2.25]} material={mats.paint}>
            <planeGeometry args={[2.7, 0.16]} />
          </mesh>
          {[1.27, -1.27].map((x) => (
            <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, 1.6]} material={mats.paint}>
              <planeGeometry args={[0.16, 1.4]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
