// The 3D view: one canvas holding the circuit, the cars, the camera rig, lighting and post-processing.
// What it shows follows the room: the starting grid in the lobby, the race, then the podium.

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { getTrack, pointAt, GRID_ROW } from '../../shared/track.js';
import { COUNTDOWN_MS, TRIAL_COUNTDOWN_MS, KART, SLOT_COLORS } from '../../shared/constants.js';
import { useStore } from '../store.js';
import { live, serverNow } from './live.js';
import { THEMES } from './theme.js';
import { TrackColliders, TrackVisual } from './Track.jsx';
import { Scenery } from './Scenery.jsx';
import { PixelFx } from './PixelFx.jsx';
import { PlayerKart, RemoteKart, LobbyCars, Podium, podiumFrame } from './Karts.jsx';

const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => u * u * (3 - 2 * u);

/** What the camera should be following: our car, or the leader when we are only watching. */
function focusPoint(out, driving) {
  if (driving && live.meVis) {
    live.meVis.getWorldPosition(out.pos);
    out.yaw = live.me.yaw - live.me.driftDir * 0.2;
    out.speed = live.me.speed;
    out.boost = live.me.boost > 0;
    out.steer = live.me.steer;
    return true;
  }
  let best = null;
  for (const k of live.karts.values()) if (k.buf?.length && k.x != null && (!best || (k.rank || 99) < (best.rank || 99))) best = k;
  if (!best) return false;
  out.pos.set(best.x, best.y ?? 0, best.z);
  out.yaw = best.yaw;
  out.speed = best.speed;
  out.boost = false;
  out.steer = 0;
  return true;
}

/** The lobby view: above and a little behind the grid, looking down the straight. */
function gridPose(track, rows, pos, look) {
  const c = pointAt(track, -(5 + ((rows - 1) * GRID_ROW) / 2 + 1.7), 0);
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), h = 19 + rows * 6;
  look.set(c.x + fx * 1.5, c.y, c.z + fz * 1.5);
  pos.set(c.x - fx * h * 0.52, c.y + h, c.z - fz * h * 0.52);
}

function CameraRig({ track, mode, driving, rows, trial }) {
  const { camera, size } = useThree();
  const s = useMemo(
    () => ({
      yaw: null, fov: 50, sp: 0, t: 0, track: null, tilt: 0, offX: 0, offY: 0,
      f: { pos: new THREE.Vector3(), yaw: 0, speed: 0, boost: false, steer: 0 },
      pos: new THREE.Vector3(), look: new THREE.Vector3(), gPos: new THREE.Vector3(), gLook: new THREE.Vector3(), curLook: new THREE.Vector3(),
    }),
    []
  );
  const sun = useRef();
  const theme = THEMES[track.def.time];

  useFrame((_, dt) => {
    s.t += dt;
    let fov = 50, snap = false, tilt = 0, wantX = 0, wantY = 0;
    gridPose(track, rows, s.gPos, s.gLook);
    const following = mode !== 'lobby' && mode !== 'results' && focusPoint(s.f, driving);

    if (mode === 'results') {
      const p = podiumFrame(track), a = p.yaw + Math.sin(s.t * 0.3) * 0.55;
      s.look.set(p.x, p.y + 1.9, p.z);
      s.pos.set(p.x + Math.sin(a) * 14, p.y + 4.4, p.z + Math.cos(a) * 14);
      fov = 46;
      s.yaw = null;
      // leave room for the results panel beside the podium
      if (size.width > 900) wantX = -size.width * 0.2;
      else wantY = size.height * 0.2;
    } else if (!following) {
      s.pos.copy(s.gPos);
      s.look.copy(s.gLook);
      s.yaw = null;
      // keep the grid clear of the side panel and the info bar
      if (size.width > 900) { wantX = 175; wantY = 56; }
      else wantY = size.height * 0.16;
    } else {
      const f = s.f;
      s.yaw = s.yaw == null ? f.yaw : lerpAngle(s.yaw, f.yaw, 1 - Math.exp(-dt * 6));
      s.sp += (clamp(Math.abs(f.speed) / KART.maxSpeed, 0, 1.4) - s.sp) * Math.min(1, dt * 3);
      const dist = 7.2 + s.sp * 1.8, h = 3.1 + s.sp * 0.35;
      const sx = Math.sin(s.yaw), sz = Math.cos(s.yaw);
      s.pos.set(f.pos.x - sx * dist, f.pos.y + h, f.pos.z - sz * dist);
      s.look.set(f.pos.x + sx * 6, f.pos.y + 1.2, f.pos.z + sz * 6);
      fov = 60 + s.sp * 5 + (f.boost ? 9 : 0);
      tilt = -f.steer * 0.035 * clamp(s.sp * 1.4, 0, 1);
      snap = true;
      if (mode === 'countdown') {
        // fly down from the lobby view to behind the car while the grid forms up
        const total = trial ? TRIAL_COUNTDOWN_MS : COUNTDOWN_MS;
        const u = smooth(clamp((total - (useStore.getState().room.startAt - serverNow())) / Math.min(2800, total * 0.6), 0, 1));
        s.pos.lerpVectors(s.gPos, s.pos, u);
        s.look.lerpVectors(s.gLook, s.look, u);
        fov = 50 + (fov - 50) * u;
        if (size.width > 900) { wantX = 175 * (1 - u); wantY = 56 * (1 - u); }
      }
    }

    if (s.track !== track) {
      // a new circuit: drop in from high above
      s.track = track;
      camera.position.copy(s.pos).add(new THREE.Vector3(0, 90, 0));
      s.curLook.copy(s.look);
    }
    const a = snap ? 1 : 1 - Math.exp(-dt * 2.4);
    camera.position.lerp(s.pos, a);
    s.curLook.lerp(s.look, snap ? 1 : 1 - Math.exp(-dt * 3));
    if (live.shake > 0.01 && snap) {
      camera.position.x += (Math.random() - 0.5) * live.shake * 0.3;
      camera.position.y += (Math.random() - 0.5) * live.shake * 0.25;
      live.shake *= Math.exp(-dt * 8);
    }
    camera.lookAt(s.curLook);
    s.tilt += (tilt - s.tilt) * Math.min(1, dt * 5);
    camera.rotateZ(s.tilt);

    s.fov += (fov - s.fov) * Math.min(1, dt * 5);
    s.offX += (wantX - s.offX) * Math.min(1, dt * 4);
    s.offY += (wantY - s.offY) * Math.min(1, dt * 4);
    camera.fov = s.fov;
    if (Math.abs(s.offX) > 0.5 || Math.abs(s.offY) > 0.5) camera.setViewOffset(size.width, size.height, s.offX, s.offY, size.width, size.height);
    else if (camera.view) camera.clearViewOffset();
    camera.updateProjectionMatrix();

    // the sun (and its shadow box) travels with whatever we are watching
    const l = sun.current;
    if (l) {
      l.position.set(s.curLook.x + theme.sunAt[0], s.curLook.y + theme.sunAt[1], s.curLook.z + theme.sunAt[2]);
      l.target.position.copy(s.curLook);
      l.target.updateMatrixWorld();
    }
  });

  const wide = 56;
  return (
    <>
      <hemisphereLight args={theme.hemi} />
      <directionalLight ref={sun} color={theme.sun[0]} intensity={theme.sun[1]} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04}>
        <orthographicCamera attach="shadow-camera" args={[-wide, wide, wide, -wide, 1, 260]} />
      </directionalLight>
    </>
  );
}

const BG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('bg');

/**
 * Testing aid (add ?bg=1 to the URL): browsers stop animation frames in a tab nobody is looking at, which
 * freezes the game. This drives the render loop from a worker's timer instead, so an automated test can run
 * a whole race in a background tab.
 */
function BackgroundTicker() {
  const advance = useThree((s) => s.advance), setFrameloop = useThree((s) => s.setFrameloop);
  useEffect(() => {
    setFrameloop('never');
    const worker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)'], { type: 'text/javascript' })));
    worker.onmessage = () => advance(performance.now() / 1000);
    return () => {
      worker.terminate();
      setFrameloop('always');
    };
  }, [advance, setFrameloop]);
  return null;
}

function PostFx({ theme }) {
  const ca = useRef(), k = useRef(0);
  useFrame((_, dt) => {
    k.current += ((live.me.boost > 0 ? 1 : live.me.slip * 0.35) - k.current) * Math.min(1, dt * 6);
    ca.current?.offset.set(0.0003 + k.current * 0.0024, 0.0002 + k.current * 0.0012);
  });
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={theme.bloom} luminanceThreshold={1} luminanceSmoothing={0.25} />
      <ChromaticAberration ref={ca} radialModulation modulationOffset={0.35} />
      <Vignette offset={0.28} darkness={theme.vignette} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

export function Game() {
  const room = useStore((s) => s.room), myId = useStore((s) => s.myId), results = useStore((s) => s.results);
  const quality = useStore((s) => s.profile.settings.quality);
  const myKart = useStore((s) => s.profile.kart);
  const track = getTrack(room.circuit), theme = THEMES[track.def.time];
  const me = room.players.find((p) => p.id === myId);
  const onTrack = room.state === 'countdown' || room.state === 'racing';
  const driving = onTrack && me && !me.spectator && !!room.grid?.[myId];
  const shadows = quality !== 'low';
  const racers = room.players.filter((p) => !p.spectator);
  const boxes = room.state === 'lobby' ? room.cap : Math.max(2, racers.length + (racers.length % 2));

  return (
    <Canvas
      className="game-canvas"
      shadows={shadows}
      dpr={quality === 'low' ? 1 : [1, 1.5]}
      camera={{ fov: 50, near: 0.3, far: 1800, position: [0, 120, -120] }}
      gl={{ antialias: quality !== 'high', powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[theme.horizon]} />
      <fog attach="fog" args={[theme.horizon, ...theme.fog]} key={track.def.time} />
      <Suspense fallback={null}>
        <Physics gravity={[0, 0, 0]} timeStep={1 / 60} key={track.id}>
          <TrackColliders track={track} />
          {driving && <PlayerKart track={track} kart={me.kart ?? myKart} shadows={shadows} />}
          {onTrack &&
            racers
              .filter((p) => p.id !== myId)
              .map((p) => <RemoteKart key={p.id} id={p.id} kart={p.kart} name={p.name} color={SLOT_COLORS[(p.slot + 8) % 8]} track={track} shadows={shadows} />)}
        </Physics>
      </Suspense>
      <TrackVisual track={track} quality={quality} boxes={boxes} key={'v' + track.id} />
      <Scenery track={track} quality={quality} key={'s' + track.id + quality} />
      {room.state === 'lobby' && <LobbyCars track={track} players={room.players} myId={myId} />}
      {room.state === 'results' && results && <Podium track={track} results={results.list} />}
      <PixelFx />
      {BG && <BackgroundTicker />}
      <CameraRig track={track} mode={room.state} driving={driving} rows={Math.max(1, Math.ceil(boxes / 2))} trial={room.mode === 'trial'} />
      {quality === 'high' && <PostFx theme={theme} />}
    </Canvas>
  );
}
