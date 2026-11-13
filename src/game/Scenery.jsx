// Everything beside the road: sky, main grandstand and pit building at the start, stands on the corners,
// advertising boards, floodlights, and trees, city blocks or dunes depending on where the circuit is.
// It is all placed by a seeded random stream, so every player sees the same world.

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pointAt, BARRIER_T } from '../../shared/track.js';
import { SPONSORS } from '../../shared/catalog.js';
import { THEMES } from './theme.js';
import { rng, hash, skyTexture, bannerTexture, facadeTextures, garageTexture } from './textures.js';

const SLOPE = 1.7;
const BOARD_COLORS = [['#d4222c', '#fff'], ['#f4f4f0', '#15161a'], ['#1c5fd4', '#fff'], ['#15161a', '#ffd23c'], ['#0f7a4c', '#fff'], ['#ffd23c', '#15161a'], ['#15161a', '#19e0c0'], ['#f4f4f0', '#d4222c'], ['#ff7a1a', '#15161a'], ['#2a1d5a', '#fff']];
const CROWD = ['#e5202b', '#f4f4f0', '#1c5fd4', '#ffd23c', '#ff7a1a', '#0f7a4c', '#15161a', '#ff5fa2', '#8ee6ff'];
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  boxUp: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  trunk: new THREE.CylinderGeometry(0.22, 0.3, 1, 6).translate(0, 0.5, 0),
  ball: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 2.4, 7).translate(0, 1.2, 0),
  pole: new THREE.CylinderGeometry(0.16, 0.22, 1, 6).translate(0, 0.5, 0),
  dune: new THREE.SphereGeometry(1, 14, 8),
};

const tmp = new THREE.Object3D(), tmpColor = new THREE.Color();

/** One instanced mesh from a list of { p: [x,y,z], r: yaw, s: [sx,sy,sz], c: colour }. */
function Instances({ items, geometry, material, castShadow = false, receiveShadow = false }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      tmp.position.set(it.p[0], it.p[1], it.p[2]);
      tmp.rotation.set(0, it.r ?? 0, 0);
      const s = it.s ?? 1;
      if (typeof s === 'number') tmp.scale.setScalar(s);
      else tmp.scale.set(s[0], s[1], s[2]);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      if (it.c) m.setColorAt(i, tmpColor.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} />;
}

/** How far (x, z) is outside the corridor the track needs (road, barriers and any embankment). Negative = inside. */
function clearance(track, x, z, skipFrom = -1, skipTo = -1) {
  let best = Infinity;
  for (let i = 0; i < track.n; i += 3) {
    if (skipFrom >= 0 && ((i - skipFrom + track.n) % track.n) <= ((skipTo - skipFrom + track.n) % track.n)) continue;
    const d = Math.hypot(x - track.x[i], z - track.z[i]) - (track.wallAt + BARRIER_T + track.y[i] * SLOPE);
    if (d < best) best = d;
  }
  return best;
}

/**
 * A grandstand in its own frame: it runs along local Z, its front edge is at x = 0 and it rises toward +x.
 * The crowd is two instanced meshes that bob out of step with each other.
 */
function Grandstand({ length, tiers = 4, seed, roof = true, shadows }) {
  const a = useRef(), b = useRef();
  const { people, mats } = useMemo(() => {
    const r = rng(seed), people = [[], []];
    for (let t = 0; t < tiers; t++)
      for (let z = -length / 2 + 0.6; z < length / 2 - 0.4; z += 0.82) {
        if (r() < 0.12) continue;
        people[r() < 0.5 ? 0 : 1].push({ p: [0.9 + t * 1.5, 1.35 + t * 0.95, z + (r() - 0.5) * 0.2], s: [0.44, 0.7 + r() * 0.2, 0.4], c: CROWD[Math.floor(r() * CROWD.length)] });
      }
    return {
      people,
      mats: {
        step: new THREE.MeshStandardMaterial({ color: '#8f949e', roughness: 0.9 }),
        roof: new THREE.MeshStandardMaterial({ color: '#e8eaee', roughness: 0.6 }),
        steel: new THREE.MeshStandardMaterial({ color: '#3a3d47', roughness: 0.6, metalness: 0.4 }),
        person: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
        front: new THREE.MeshStandardMaterial({ color: '#d4222c', roughness: 0.6 }),
      },
    };
  }, [length, tiers, seed]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (a.current) a.current.position.y = Math.abs(Math.sin(t * 2.6)) * 0.14;
    if (b.current) b.current.position.y = Math.abs(Math.sin(t * 2.6 + 1.3)) * 0.14;
  });
  const depth = tiers * 1.5 + 0.6, top = tiers * 0.95 + 0.4;
  return (
    <group>
      {Array.from({ length: tiers }, (_, t) => (
        <mesh key={t} geometry={G.boxUp} material={mats.step} position={[0.9 + t * 1.5, 0, 0]} scale={[1.5, 0.95 + t * 0.95, length]} castShadow={shadows} receiveShadow={shadows} />
      ))}
      <mesh geometry={G.boxUp} material={mats.front} position={[0.1, 0, 0]} scale={[0.14, 0.95, length]} />
      <group ref={a}><Instances items={people[0]} geometry={G.boxUp} material={mats.person} /></group>
      <group ref={b}><Instances items={people[1]} geometry={G.boxUp} material={mats.person} /></group>
      {roof && (
        <>
          <mesh geometry={G.box} material={mats.roof} position={[depth / 2 + 0.2, top + 3.3, 0]} scale={[depth + 2.4, 0.22, length + 1]} rotation={[0, 0, 0.08]} castShadow={shadows} />
          {[-length / 2 + 0.5, 0, length / 2 - 0.5].map((z) => (
            <mesh key={z} geometry={G.boxUp} material={mats.steel} position={[depth + 0.2, 0, z]} scale={[0.3, top + 3.5, 0.3]} />
          ))}
        </>
      )}
    </group>
  );
}

/** The pit building, in the same frame as a grandstand: pit lane, a row of garages, and a race-control tower. */
function PitBuilding({ length, night, shadows }) {
  const mats = useMemo(() => {
    const garage = garageTexture();
    garage.repeat.set(length / 16, 1);
    return {
      lane: new THREE.MeshStandardMaterial({ color: night ? '#262830' : '#34363d', roughness: 0.9 }),
      line: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.8 }),
      wall: new THREE.MeshStandardMaterial({ color: '#e8eaee', roughness: 0.7 }),
      garage: new THREE.MeshStandardMaterial({ map: garage, roughness: 0.7, emissive: night ? '#ffffff' : '#000000', emissiveMap: night ? garage : null, emissiveIntensity: night ? 0.35 : 0 }),
      glass: new THREE.MeshStandardMaterial({ color: '#1d2a3a', roughness: 0.15, metalness: 0.7, emissive: night ? '#ffd9a0' : '#000000', emissiveIntensity: night ? 0.6 : 0 }),
      red: new THREE.MeshStandardMaterial({ color: '#d4222c', roughness: 0.6 }),
    };
  }, [length, night]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.4, 0.02, 0]} material={mats.lane} receiveShadow={shadows}>
        <planeGeometry args={[6, length + 14]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.7, 0.03, 0]} material={mats.line}>
        <planeGeometry args={[0.16, length + 14]} />
      </mesh>
      <mesh geometry={G.boxUp} material={mats.wall} position={[10.4, 0, 0]} scale={[8, 4.6, length]} castShadow={shadows} receiveShadow={shadows} />
      <mesh position={[6.38, 2.3, 0]} rotation={[0, -Math.PI / 2, 0]} material={mats.garage}>
        <planeGeometry args={[length, 4.6]} />
      </mesh>
      <mesh geometry={G.boxUp} material={mats.glass} position={[11, 4.6, 0]} scale={[6, 2.2, length - 4]} castShadow={shadows} />
      <mesh geometry={G.boxUp} material={mats.wall} position={[10.4, 6.8, 0]} scale={[8.6, 0.3, length + 1]} castShadow={shadows} />
      <mesh geometry={G.boxUp} material={mats.wall} position={[11, 0, length / 2 + 4]} scale={[6, 12, 6]} castShadow={shadows} />
      <mesh geometry={G.boxUp} material={mats.glass} position={[11, 12, length / 2 + 4]} scale={[7.4, 2.4, 7.4]} />
      <mesh geometry={G.boxUp} material={mats.red} position={[11, 14.4, length / 2 + 4]} scale={[7.8, 0.4, 7.8]} />
    </group>
  );
}

export function Scenery({ track, quality }) {
  const def = track.def, theme = THEMES[def.time], night = def.time === 'night', lit = def.time !== 'day';
  const shadows = quality !== 'low';

  const world = useMemo(() => {
    const r = rng(hash(def.id)), b = track.bounds, n = track.n;
    const many = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;
    const startFrom = n - Math.ceil(60 / track.step), startTo = Math.ceil(34 / track.step);
    const out = { stands: [], pit: null, boards: [], trunks: [], crowns: [], cones: [], blocks: [], dunes: [], poles: [], lamps: [] };

    // can a box this long and deep stand beside the track at `dist` without sitting on another part of the circuit?
    const fits = (dist, side, length, depth) => {
      const i0 = Math.round(dist / track.step);
      const from = (i0 - Math.ceil((length * 0.6) / track.step) + n * 4) % n, to = (i0 + Math.ceil((length * 0.6) / track.step) + n * 4) % n;
      for (let u = -0.5; u <= 0.5; u += 0.25) {
        const p = pointAt(track, dist + u * length, side * (track.wallAt + BARRIER_T + depth));
        if (clearance(track, p.x, p.z, from, to) < depth * 0.5 + 1) return false;
      }
      return true;
    };
    // a frame beside the track whose local +x points away from the road and whose local z runs along it
    const frame = (dist, side) => {
      const p = pointAt(track, dist, side * (track.wallAt + BARRIER_T + 0.8));
      return { pos: [p.x, p.y, p.z], rot: p.yaw + (side > 0 ? 0 : Math.PI), y: p.y };
    };

    // main straight: grandstand on the left, pits on the right
    for (const length of [64, 44, 30]) if (fits(-12, 1, length, 8)) { out.stands.push({ ...frame(-12, 1), length, tiers: 5, seed: 1 }); break; }
    if (fits(-12, -1, 70, 15)) out.pit = { ...frame(-12, -1), length: 58 };
    // a stand on the outside of the bigger corners
    let placed = 0;
    for (const i of track.cornerAt) {
      if (placed >= 3) break;
      const dist = i * track.step, side = -Math.sign(track.curv[i]) || 1;
      const ring = Math.min(i, n - i) * track.step;
      if (ring < 90 || track.y[i] > 1.5 || !fits(dist, side, 26, 7)) continue;
      if (out.stands.some((s) => Math.hypot(s.pos[0] - track.x[i], s.pos[2] - track.z[i]) < 70)) continue;
      out.stands.push({ ...frame(dist, side), length: 26, tiers: 3, seed: 10 + i, roof: false });
      placed++;
    }
    const nearBuilt = (x, z, pad) =>
      out.stands.some((s) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < s.length / 2 + pad) || (out.pit && Math.hypot(out.pit.pos[0] - x, out.pit.pos[2] - z) < 44 + pad);

    // advertising boards along the straights
    const gapB = Math.ceil(26 / track.step);
    for (let i = gapB, k = 0; i < n - gapB; i += gapB, k++) {
      let bend = 0;
      for (let o = -5; o <= 5; o++) bend = Math.max(bend, Math.abs(track.curv[(i + o + n) % n]));
      if (bend > 0.008 || track.bridge[i] || track.y[i] > 3) continue;
      const side = k % 2 ? 1 : -1, off = track.wallAt + BARRIER_T + 0.9 + track.y[i] * 0.2;
      const x = track.x[i] + track.tz[i] * off * side, z = track.z[i] - track.tx[i] * off * side;
      if (nearBuilt(x, z, 4) || clearance(track, x, z, (i - 20 + n) % n, (i + 20) % n) < 2) continue;
      out.boards.push({ p: [x, track.y[i] + 1.75, z], r: track.yaw[i], brand: k % SPONSORS.length });
    }

    // floodlights
    if (lit) {
      const gapL = Math.ceil(58 / track.step);
      for (let i = 0, k = 0; i < n; i += gapL, k++) {
        if (track.bridge[i]) continue;
        const side = k % 2 ? 1 : -1, off = track.wallAt + BARRIER_T + 2.6 + track.y[i] * SLOPE;
        const x = track.x[i] + track.tz[i] * off * side, z = track.z[i] - track.tx[i] * off * side;
        if (nearBuilt(x, z, 2) || clearance(track, x, z, (i - 20 + n) % n, (i + 20) % n) < 1.5) continue;
        out.poles.push({ p: [x, 0, z], s: [1, 17, 1] });
        out.lamps.push({ p: [x - track.tz[i] * side * 1.2, 17, z + track.tx[i] * side * 1.2], r: track.yaw[i], s: [2.6, 0.5, 1.2] });
      }
    }

    // the surroundings
    const pad = 110, W = b.maxX - b.minX + pad * 2, D = b.maxZ - b.minZ + pad * 2;
    const spot = () => [b.minX - pad + r() * W, b.minZ - pad + r() * D];
    const inWater = (z) => def.water && z < b.minZ - 22;
    if (def.env === 'street') {
      const tall = def.id === 'vegas' || def.id === 'singapore' ? 1.6 : 1;
      const tints = night ? ['#ffffff', '#ffd0e8', '#cfe6ff', '#fff0c0'] : ['#ffffff', '#f2e8dc', '#dfe6ee', '#e8dcd0'];
      for (let i = 0; i < 520 * many && out.blocks.length < 190 * many; i++) {
        const [x, z] = spot(), w = 9 + r() * 12, d = 9 + r() * 12, h = (7 + r() * r() * 40) * tall;
        if (inWater(z) || clearance(track, x, z) < Math.max(w, d) * 0.75 + 2.5 || nearBuilt(x, z, 12)) continue;
        out.blocks.push({ p: [x, 0, z], r: Math.round(r() * 3) * (Math.PI / 2) + (r() - 0.5) * 0.2, s: [w, h, d], c: tints[Math.floor(r() * tints.length)] });
      }
    }
    if (def.tree !== 'none') {
      const want = (def.env === 'green' ? 330 : def.env === 'street' ? 60 : 70) * many;
      for (let i = 0; i < want * 4 && out.trunks.length + out.cones.length < want; i++) {
        const [x, z] = spot(), s = 0.8 + r() * 0.9;
        if (inWater(z) || clearance(track, x, z) < 4.5 || nearBuilt(x, z, 6)) continue;
        if (def.env === 'street' && clearance(track, x, z) > 16) continue;
        if (out.blocks.some((bl) => Math.abs(bl.p[0] - x) < bl.s[0] * 0.7 && Math.abs(bl.p[2] - z) < bl.s[2] * 0.7)) continue;
        if (def.tree === 'pine') out.cones.push({ p: [x, 0, z], s: [1.7 * s, 3.2 * s, 1.7 * s], r: r() * 6, c: r() < 0.5 ? '#1f5a34' : '#2a6e3c' });
        else if (def.tree === 'palm') {
          out.trunks.push({ p: [x, 0, z], s: [0.7, 6.5 * s, 0.7] });
          out.crowns.push({ p: [x, 6.6 * s, z], s: [2.6 * s, 0.7 * s, 2.6 * s], r: r() * 6, c: '#2f7a3a' });
        } else {
          out.trunks.push({ p: [x, 0, z], s: [1, 2.2 * s, 1] });
          out.crowns.push({ p: [x, 3.6 * s, z], s: [2.3 * s, 2.1 * s, 2.3 * s], r: r() * 6, c: r() < 0.5 ? '#2f7d32' : '#3d8f3a' });
        }
      }
    }
    if (def.env === 'desert')
      for (let i = 0; i < 260 && out.dunes.length < 70 * many; i++) {
        const [x, z] = spot(), rad = 9 + r() * 24;
        if (inWater(z) || clearance(track, x, z) < rad + 3 || nearBuilt(x, z, rad + 6)) continue;
        out.dunes.push({ p: [x, -rad * 0.05, z], s: [rad, rad * (0.14 + r() * 0.1), rad * (0.6 + r() * 0.5)], r: r() * 6 });
      }
    return out;
  }, [track, def, quality, lit, night]);

  const mats = useMemo(() => {
    const facade = facadeTextures(night);
    facade.map.repeat.set(2, 2);
    facade.emissive.repeat.set(2, 2);
    const sand = night ? '#5a4d3e' : def.time === 'dusk' ? '#d1a474' : '#e2c890';
    return {
      sky: new THREE.MeshBasicMaterial({ map: skyTexture(theme.sky), side: THREE.BackSide, fog: false, depthWrite: false }),
      trunk: new THREE.MeshStandardMaterial({ color: '#6a4a30', roughness: 0.9 }),
      crown: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
      block: new THREE.MeshStandardMaterial({ map: facade.map, roughness: 0.7, emissive: lit ? '#ffffff' : '#000000', emissiveMap: lit ? facade.emissive : null, emissiveIntensity: night ? 1.6 : 0.5 }),
      dune: new THREE.MeshStandardMaterial({ color: sand, roughness: 1 }),
      pole: new THREE.MeshStandardMaterial({ color: '#4a4d57', roughness: 0.6, metalness: 0.5 }),
      lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.2, 3.6), toneMapped: false }),
      boards: SPONSORS.map((name, i) => new THREE.MeshStandardMaterial({
        map: bannerTexture(name, BOARD_COLORS[i][0], BOARD_COLORS[i][1]), roughness: 0.6,
        emissive: lit ? '#ffffff' : '#000000', emissiveMap: lit ? bannerTexture(name, BOARD_COLORS[i][0], BOARD_COLORS[i][1]) : null, emissiveIntensity: night ? 0.7 : 0.25,
      })),
      plinth: new THREE.MeshStandardMaterial({ color: night ? '#2a2d36' : '#7d828c', roughness: 0.9 }),
    };
  }, [night, lit, def, theme]);

  const b = track.bounds;
  const Plinth = ({ y, length, depth }) =>
    y > 0.3 ? <mesh geometry={G.box} material={mats.plinth} position={[depth / 2, -y / 2 - 0.02, 0]} scale={[depth + 2, y, length + 6]} /> : null;

  return (
    <group>
      <mesh position={[(b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2]} material={mats.sky} renderOrder={-10}>
        <sphereGeometry args={[760, 24, 16]} />
      </mesh>
      {world.stands.map((s, i) => (
        <group key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <Plinth y={s.y} length={s.length} depth={s.tiers * 1.5 + 1} />
          <Grandstand length={s.length} tiers={s.tiers} seed={s.seed} roof={s.roof !== false} shadows={shadows} />
        </group>
      ))}
      {world.pit && (
        <group position={world.pit.pos} rotation={[0, world.pit.rot, 0]}>
          <Plinth y={world.pit.y} length={world.pit.length + 12} depth={15} />
          <PitBuilding length={world.pit.length} night={lit} shadows={shadows} />
        </group>
      )}
      {world.boards.map((bd, i) => (
        <mesh key={i} position={bd.p} rotation={[0, bd.r, 0]} material={mats.boards[bd.brand]} castShadow={shadows}>
          <boxGeometry args={[0.16, 1.5, 8]} />
        </mesh>
      ))}
      <Instances items={world.trunks} geometry={G.trunk} material={mats.trunk} castShadow={shadows} />
      <Instances items={world.crowns} geometry={G.ball} material={mats.crown} castShadow={shadows} />
      <Instances items={world.cones} geometry={G.cone} material={mats.crown} castShadow={shadows} />
      <Instances items={world.blocks} geometry={G.boxUp} material={mats.block} castShadow={shadows} receiveShadow={shadows} />
      <Instances items={world.dunes} geometry={G.dune} material={mats.dune} receiveShadow={shadows} />
      <Instances items={world.poles} geometry={G.pole} material={mats.pole} />
      <Instances items={world.lamps} geometry={G.box} material={mats.lamp} />
    </group>
  );
}
