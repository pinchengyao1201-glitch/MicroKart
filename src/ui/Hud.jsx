// The in-race overlay: lap and position top-left, clock and start lights top-centre, live leaderboard
// top-right, minimap bottom-left, speedometer and boost meter bottom-right. Numbers that change every frame
// are written straight to the DOM from one animation-frame loop; the rest comes from the store.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { live, serverNow } from '../game/live.js';
import { getTrack } from '../../shared/track.js';
import { KART, KMH, BOOST, SLOT_COLORS, lightsLit, ordinal, fmtTime } from '../../shared/constants.js';
import { sfx } from '../audio.js';

const colorOf = (p) => SLOT_COLORS[(p.slot + 8) % SLOT_COLORS.length];

/** The five start lights, in step with the gantry over the track. */
function StartLights({ room }) {
  const [lit, setLit] = useState(0), [out, setOut] = useState(false);
  useEffect(() => {
    let last = 0;
    const tick = () => {
      const now = serverNow(), n = room.state === 'countdown' ? lightsLit(room.startAt, room.hold, now) : 0;
      if (n !== last) {
        if (n > last) sfx('light');
        last = n;
        setLit(n);
      }
      setOut(now >= room.startAt && now - room.startAt < 1300);
    };
    tick();
    const t = setInterval(tick, 40);
    return () => clearInterval(t);
  }, [room.startAt, room.hold, room.state]);
  if (room.state !== 'countdown' && !out) return null;
  return (
    <div className={`lights ${out ? 'out' : ''}`}>
      <div className="lights-row">
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= lit ? 'on' : ''} />)}
      </div>
      <p>{out ? 'Lights out!' : lit ? '' : 'Grid forming'}</p>
    </div>
  );
}

function Leaderboard({ players, myId, fastestBy }) {
  const [order, setOrder] = useState([]);
  useEffect(() => {
    const tick = () =>
      setOrder(
        players
          .filter((p) => !p.spectator)
          .map((p) => ({ ...p, rank: live.karts.get(p.id)?.rank || 99 }))
          .sort((a, b) => a.rank - b.rank || a.slot - b.slot)
      );
    tick();
    const t = setInterval(tick, 350);
    return () => clearInterval(t);
  }, [players]);
  return (
    <ol className="board-live">
      {order.map((p, i) => (
        <li key={p.id} className={p.id === myId ? 'me' : ''}>
          <span className="pos">{i + 1}</span>
          <i style={{ background: colorOf(p) }} />
          <span className="nm">{p.name}</span>
          {fastestBy === p.id && <span className="fl" title="Fastest lap" />}
        </li>
      ))}
    </ol>
  );
}

export function Hud() {
  const room = useStore((s) => s.room), myId = useStore((s) => s.myId), hud = useStore((s) => s.hud);
  const pb = useStore((s) => s.profile.pbs[room.circuit]);
  const track = getTrack(room.circuit), trial = room.mode === 'trial';
  const me = room.players.find((p) => p.id === myId);
  const watching = !me || me.spectator || !room.grid?.[myId];
  const speed = useRef(), gear = useRef(), dial = useRef(), meter = useRef(), boostBox = useRef(), slip = useRef(), clock = useRef(), map = useRef(), wrong = useRef();
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!hud.banner) return;
    setBanner(hud.banner);
    const t = setTimeout(() => setBanner(null), 1900);
    return () => clearTimeout(t);
  }, [hud.banner]);

  useEffect(() => {
    let raf;
    const cv = map.current, g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = 168;
    cv.width = cv.height = S * dpr;
    const b = track.bounds, sc = (S - 26) / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    // +x is drawn to the left, the way the circuit's map is
    const px = (x) => S / 2 - (x - (b.minX + b.maxX) / 2) * sc, pz = (z) => S / 2 - (z - (b.minZ + b.maxZ) / 2) * sc;
    const path = new Path2D();
    for (let i = 0; i <= track.n; i += 2) {
      const j = i % track.n;
      if (i === 0) path.moveTo(px(track.x[j]), pz(track.z[j]));
      else path.lineTo(px(track.x[j]), pz(track.z[j]));
    }
    path.closePath();
    const colors = new Map(room.players.map((p) => [p.id, colorOf(p)]));
    const top = KART.maxSpeed * KART.boostMult * KART.slipMult;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = live.me, st = useStore.getState(), fin = st.hud.finished, now = serverNow();
      const v = Math.abs(k.speed);
      if (speed.current) speed.current.textContent = Math.round(v * KMH);
      if (gear.current) gear.current.textContent = k.speed < -0.5 ? 'R' : v < 0.5 ? 'N' : Math.min(8, 1 + Math.floor((v / KART.maxSpeed) * 7.2));
      if (dial.current) dial.current.style.setProperty('--v', Math.min(1, v / top).toFixed(3));
      if (meter.current) meter.current.style.transform = `scaleX(${k.meter.toFixed(3)})`;
      if (boostBox.current) boostBox.current.dataset.state = k.boost ? 'on' : k.meter >= BOOST.minToFire ? 'ready' : k.driftDir ? 'charging' : '';
      if (slip.current) slip.current.hidden = k.slip < 0.25;
      if (wrong.current) wrong.current.hidden = !(k.wrongWay > 0.8);
      if (clock.current) {
        const ms = st.room.mode === 'trial' ? (st.hud.lapStartAt ? now - st.hud.lapStartAt : 0) : fin ? fin.ms : now - st.room.startAt;
        clock.current.textContent = st.room.state === 'countdown' ? '0:00.00' : fmtTime(Math.max(0, ms));
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, S, S);
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(10,11,15,0.8)';
      g.lineWidth = 8;
      g.stroke(path);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3.5;
      g.stroke(path);
      g.fillStyle = '#e5202b';
      g.fillRect(px(track.x[0]) - 2, pz(track.z[0]) - 5, 4, 10);
      for (const [id, o] of live.karts) {
        if (id === st.myId || !o.buf?.length || o.x == null) continue;
        g.fillStyle = colors.get(id) ?? '#888';
        g.strokeStyle = '#0a0b0f';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(px(o.x), pz(o.z), 4, 0, 7);
        g.fill();
        g.stroke();
      }
      if (!watching) {
        g.fillStyle = colors.get(st.myId) ?? '#fff';
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(px(k.x), pz(k.z), 5.5, 0, 7);
        g.fill();
        g.stroke();
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [track, room.players, watching]);

  const field = room.players.filter((p) => !p.spectator).length;
  return (
    <div className="hud">
      <div className="hud-tl">
        <div className="stat">
          <span>Lap</span>
          <b>{trial ? hud.lap : Math.min(hud.lap, room.laps)}{!trial && <i>/{room.laps}</i>}</b>
        </div>
        {!watching && !trial && (
          <div className="stat">
            <span>Position</span>
            <b>{hud.place || '-'}<sup>{hud.place ? ordinal(hud.place).slice(String(hud.place).length) : ''}</sup><i>/{field}</i></b>
          </div>
        )}
        {trial && (
          <div className="stat">
            <span>Personal best</span>
            <b className="mono">{pb ? fmtTime(pb) : '--:--.--'}</b>
          </div>
        )}
      </div>

      <div className="hud-tc">
        <div className="clock">
          <span>{trial ? 'This lap' : room.state === 'countdown' ? 'Race start' : hud.finished ? 'Finished' : 'Race time'}</span>
          <b ref={clock} className="mono">0:00.00</b>
        </div>
        {(hud.lastLapMs || hud.bestLapMs) && (
          <p className="laptimes mono">
            {hud.lastLapMs && <>Last {fmtTime(hud.lastLapMs)}</>}
            {hud.bestLapMs && <> · Best {fmtTime(hud.bestLapMs)}</>}
          </p>
        )}
        <StartLights room={room} />
        {watching && <div className="pill">Watching. You join the grid for the next race.</div>}
      </div>

      <div className="hud-tr">{!trial && <Leaderboard players={room.players} myId={myId} fastestBy={hud.fastestBy} />}</div>

      <div className="hud-bl">
        <canvas ref={map} className="minimap" />
      </div>

      {!watching && (
        <div className="hud-br">
          <div className="tags">
            <span ref={slip} className="tag slip" hidden>Slipstream</span>
          </div>
          <div className="speedo" ref={dial}>
            <div className="dial" />
            <div className="readout">
              <b ref={speed} className="mono">0</b>
              <span>km/h</span>
            </div>
            <div className="gear"><span>Gear</span><b ref={gear} className="mono">N</b></div>
          </div>
          <div className="boost" ref={boostBox}>
            <span>Boost <kbd>Shift</kbd></span>
            <div className="bar"><div ref={meter} /></div>
          </div>
        </div>
      )}

      <div className="wrong" ref={wrong} hidden>Wrong way</div>
      {banner && <div className={`banner ${banner.tone}`} key={banner.at}>{banner.text}</div>}
      {hud.finished && <div className="finished-note">Chequered flag. Waiting for the others...</div>}
    </div>
  );
}
