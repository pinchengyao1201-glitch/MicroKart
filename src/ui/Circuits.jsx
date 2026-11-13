// The circuit calendar: one card per round, and a larger 3D preview of whichever circuit is selected with the
// camera turning slowly round it. Used from the home screen and by the host in the lobby.

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CIRCUITS } from '../../shared/circuits.js';
import { getTrack, outlinePath } from '../../shared/track.js';
import { fmtDuration, fmtTime } from '../../shared/constants.js';
import { strip } from '../game/Track.jsx';
import { THEMES } from '../game/theme.js';
import { useStore } from '../store.js';
import { sfx } from '../audio.js';
import { Flag, Icon } from './icons.jsx';

const TIME = { day: ['sun', 'Day'], dusk: ['dusk', 'Twilight'], night: ['moon', 'Night'] };
const ENV = { green: 'Parkland', street: 'City streets', desert: 'Desert' };
export const km = (track) => `${(track.len / 1000).toFixed(2)} km`;

export function Outline({ track, size = 100, className = '' }) {
  const o = useMemo(() => outlinePath(track, size, size * 0.1), [track, size]);
  return (
    <svg className={`outline ${className}`} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <path d={o.d} className="outline-edge" />
      <path d={o.d} className="outline-road" />
      <circle cx={o.start[0]} cy={o.start[1]} r={size * 0.035} className="outline-start" />
    </svg>
  );
}

/** A lightweight model of the circuit for the preview: just the ribbon of road, its kerbs and the ground. */
function Miniature({ track }) {
  const cam = useRef({ t: 0 });
  const { road, edge, kerb, mats, centre, span } = useMemo(() => {
    const H = track.halfWidth * 1.5, y = (i) => track.y[i] * 1.6;
    const b = track.bounds, night = track.def.time === 'night';
    return {
      road: strip(track, (i) => [H, y(i) + 0.6, -H, y(i) + 0.6], 1),
      edge: strip(track, (i) => [H + 1.6, y(i) + 0.5, -H - 1.6, y(i) + 0.5], 1),
      kerb: [1, -1].map((s) => strip(track, (i) => [s * (H + 1.6), y(i) + 0.5, s * (H + 1.6), -0.5], 1)),
      mats: {
        road: new THREE.MeshStandardMaterial({ color: '#2b2d35', roughness: 0.8, side: THREE.DoubleSide }),
        edge: new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.6, side: THREE.DoubleSide }),
        base: new THREE.MeshStandardMaterial({ color: '#d4222c', roughness: 0.7, side: THREE.DoubleSide }),
        ground: new THREE.MeshStandardMaterial({ color: track.def.env === 'green' ? (night ? '#163a22' : '#2f6e33') : track.def.env === 'desert' ? (night ? '#4a3f33' : '#cfae78') : night ? '#1a1c24' : '#565a63', roughness: 1 }),
      },
      centre: [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
      span: Math.max(b.maxX - b.minX, b.maxZ - b.minZ),
    };
  }, [track]);
  useFrame(({ camera }, dt) => {
    cam.current.t += dt;
    const a = cam.current.t * 0.22;
    camera.position.set(centre[0] + Math.cos(a) * span * 0.86, span * 0.62, centre[1] + Math.sin(a) * span * 0.86);
    camera.lookAt(centre[0], 0, centre[1]);
  });
  const s0 = [track.x[0], track.y[0] * 1.6 + 5, track.z[0]];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centre[0], -0.5, centre[1]]} material={mats.ground} receiveShadow>
        <circleGeometry args={[span * 0.78, 64]} />
      </mesh>
      <mesh geometry={edge} material={mats.edge} castShadow />
      <mesh geometry={road} material={mats.road} />
      {kerb.map((g, i) => <mesh key={i} geometry={g} material={mats.base} />)}
      <mesh position={s0}>
        <boxGeometry args={[1.2, 10, 1.2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[s0[0], s0[1] + 6.5, s0[2]]}>
        <boxGeometry args={[9, 5, 0.8]} />
        <meshBasicMaterial color="#e5202b" />
      </mesh>
    </group>
  );
}

function Preview({ track }) {
  const theme = THEMES[track.def.time];
  return (
    <Canvas className="circuit-preview" shadows dpr={[1, 1.5]} camera={{ fov: 34, near: 1, far: 3000 }}>
      <color attach="background" args={[track.def.time === 'day' ? '#1a1c23' : '#0d0e13']} />
      <hemisphereLight args={[theme.hemi[0], theme.hemi[1], theme.hemi[2] * 0.9]} />
      <directionalLight position={[120, 220, 80]} color={theme.sun[0]} intensity={theme.sun[1]} castShadow shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-260, 260, 260, -260, 1, 800]} />
      </directionalLight>
      <Miniature track={track} key={track.id} />
    </Canvas>
  );
}

function Card({ c, on, onClick }) {
  const track = getTrack(c.id), [icon] = TIME[c.time];
  return (
    <button className={`ccard ${on ? 'on' : ''}`} onClick={onClick}>
      <span className="ccard-top">
        <span className="round">R{String(c.round).padStart(2, '0')}</span>
        <Flag code={c.flag} />
        <span className="ccard-time"><Icon name={icon} /></span>
      </span>
      <Outline track={track} />
      <span className="ccard-gp">{c.gp}</span>
      <span className="ccard-name">{c.name}</span>
      <span className="ccard-stats">{km(track)} · {track.corners} corners</span>
    </button>
  );
}

/**
 * value: the circuit shown at first. actions(circuit): the buttons for the selected circuit.
 * onClose: shown as a back button.
 */
export function CircuitCalendar({ value, actions, onClose, title = 'Race calendar' }) {
  const [id, setId] = useState(value ?? CIRCUITS[0].id);
  const pbs = useStore((s) => s.profile.pbs);
  const c = CIRCUITS.find((x) => x.id === id) ?? CIRCUITS[0], track = getTrack(c.id);
  const [timeIcon, timeLabel] = TIME[c.time];
  return (
    <div className="calendar">
      <header className="cal-head">
        <button className="btn ghost small" onClick={onClose}><Icon name="back" /> Back</button>
        <h2>{title}</h2>
        <span className="muted">{CIRCUITS.length} rounds</span>
      </header>
      <div className="cal-body">
        <div className="cal-grid">
          {CIRCUITS.map((x) => (
            <Card key={x.id} c={x} on={x.id === id} onClick={() => { sfx('click'); setId(x.id); }} />
          ))}
        </div>
        <aside className="cal-detail">
          <div className="cal-stage"><Preview track={track} /></div>
          <div className="cal-info">
            <p className="eyebrow">Round {c.round} · {c.gp} Grand Prix</p>
            <h3><Flag code={c.flag} /> {c.name}</h3>
            <p className="muted">{c.place} · {c.traits.join(' · ')}</p>
            <dl className="facts">
              <div><dt>Lap length</dt><dd>{km(track)}</dd></div>
              <div><dt>Corners</dt><dd>{track.corners}</dd></div>
              <div><dt>Race</dt><dd>{track.laps} laps · {fmtDuration(track.laps * track.lapSecs)}</dd></div>
              <div><dt>Setting</dt><dd><Icon name={timeIcon} /> {timeLabel} · {ENV[c.env]}</dd></div>
              <div><dt>Your best lap</dt><dd>{pbs[c.id] ? fmtTime(pbs[c.id]) : 'Not set'}</dd></div>
            </dl>
            <div className="cal-actions">{actions?.(c)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
