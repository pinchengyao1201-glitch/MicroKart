// Everything shown while in a room: the 3D view, with the starting-grid lobby, the race HUD or the results
// laid over it.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { Game } from '../game/Game.jsx';
import { Hud } from './Hud.jsx';
import { live, serverNow } from '../game/live.js';
import { disconnect, send } from '../net.js';
import { getTrack } from '../../shared/track.js';
import { circuitOf } from '../../shared/circuits.js';
import { GRID_SIZES, KMH, SLOT_COLORS, ordinal, fmtTime, fmtGap, fmtDuration } from '../../shared/constants.js';
import { CATALOG, skinOf } from '../../shared/catalog.js';
import { requestReset } from '../game/controls.js';
import { sfx, setMusic, setEngine } from '../audio.js';
import { showRewardedAd } from '../monetization.js';
import { Flag, Icon } from './icons.jsx';
import { Avatar, Logo, SettingsChips, Wallet } from './bits.jsx';
import { CircuitCalendar, Outline, km } from './Circuits.jsx';
import { Swatch } from './Front.jsx';

const colorOf = (p) => SLOT_COLORS[(p.slot + 8) % SLOT_COLORS.length];
const MODE = { quick: 'Quick race', private: 'Private room', trial: 'Time trial' };
const TIME = { day: 'Day', dusk: 'Twilight', night: 'Night' };

function useSecondsUntil(at) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!at) return setLeft(0);
    const tick = () => setLeft(Math.max(0, Math.ceil((at - serverNow()) / 1000)));
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [at]);
  return left;
}

function leave() {
  sfx('click');
  disconnect();
  useStore.getState().go('menu');
}

function TopBar({ room }) {
  const [copied, setCopied] = useState(false), [open, setOpen] = useState(false);
  const humans = room.players.filter((p) => !p.bot).length;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <header className="topbar lobby-top">
      <Logo small />
      <span className="mode-tag">{room.series ? `Championship · round ${Math.min(room.series.done + 1, room.series.rounds)} of ${room.series.rounds}` : MODE[room.mode]}</span>
      {room.mode !== 'trial' && (
        <div className="roomcode">
          <span>Room code</span>
          <b>{room.code}</b>
          <button className="iconbtn" onClick={copy} title="Copy invite link" aria-label="Copy invite link"><Icon name={copied ? 'check' : 'copy'} /></button>
          {copied && <em>Invite link copied</em>}
        </div>
      )}
      <span className="grow" />
      {room.mode !== 'trial' && (
        <span className="count" title="Players in the room"><i /> {humans} / {room.cap}</span>
      )}
      <Wallet />
      <div className="pop-wrap">
        <button className="iconbtn" onClick={() => setOpen(!open)} aria-label="Settings"><Icon name="gear" /></button>
        {open && <div className="pop"><SettingsChips /></div>}
      </div>
    </header>
  );
}

function MyCar({ me }) {
  const p = useStore((s) => s.profile), equip = useStore((s) => s.equip);
  const set = (slot, id) => {
    sfx('click');
    equip(slot, id);
    send({ t: 'kart', kart: { ...useStore.getState().profile.kart, [slot]: id } });
  };
  const row = (slot, label) => (
    <div className="pickrow" key={slot}>
      <span>{label}</span>
      <div>
        {CATALOG[slot].filter((it) => p.owned.includes(`${slot}:${it.id}`)).map((it) => (
          <button key={it.id} className={`pick ${me.kart[slot] === it.id ? 'on' : ''}`} onClick={() => set(slot, it.id)} title={it.name} aria-label={it.name}>
            <Swatch slot={slot} item={it} />
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <section className="mycar">
      <h4>Your car <em>{skinOf(me.kart.skin).name}</em></h4>
      {row('skin', 'Livery')}
      {row('helmet', 'Helmet')}
      {row('trail', 'Exhaust')}
      <p className="muted small">More liveries are in the garage on the home screen.</p>
    </section>
  );
}

function Lobby() {
  const room = useStore((s) => s.room), myId = useStore((s) => s.myId), picker = useStore((s) => s.picker), note = useStore((s) => s.note);
  const left = useSecondsUntil(room.autoStartAt);
  const me = room.players.find((p) => p.id === myId);
  const host = room.host === myId, quick = room.mode === 'quick', trial = room.mode === 'trial', priv = room.mode === 'private';
  const c = circuitOf(room.circuit), track = getTrack(room.circuit);
  const list = [...room.players].sort((a, b) => (a.slot < 0 ? 99 : a.slot) - (b.slot < 0 ? 99 : b.slot));
  const humans = room.players.filter((p) => !p.bot);
  const waiting = humans.filter((h) => (quick || h.id !== room.host) && !h.ready && !h.dc && !h.spectator).length;
  const cfg = (patch) => { sfx('click'); send({ t: 'cfg', ...patch }); };
  const ready = () => { sfx(me?.ready ? 'click' : 'ready'); send({ t: 'ready', v: !me?.ready }); };

  if (picker)
    return (
      <div className="overlay solid">
        <CircuitCalendar
          value={room.circuit}
          title="Choose a circuit"
          onClose={() => useStore.setState({ picker: false })}
          actions={(x) => (
            <button className="btn primary big" onClick={() => { cfg({ circuit: x.id }); useStore.setState({ picker: false }); }}>
              Race at {x.name} <Icon name="play" />
            </button>
          )}
        />
      </div>
    );

  return (
    <div className="lobby">
      <TopBar room={room} />

      <aside className="panel sidepanel">
        <h4>Drivers <em>{room.players.length} on the grid</em></h4>
        <ul className="drivers">
          {list.map((p) => (
            <li key={p.id} className={`${p.id === myId ? 'me' : ''} ${p.dc ? 'dc' : ''}`}>
              <span className="slotno" style={{ borderColor: colorOf(p) }}>{p.slot >= 0 ? `P${p.slot + 1}` : '–'}</span>
              <Avatar name={p.name} helmet={p.kart.helmet} />
              <span className="who">
                <b>{p.name}</b>
                <small>{p.bot ? 'AI driver' : p.dc ? 'Reconnecting…' : skinOf(p.kart.skin).name}</small>
              </span>
              {p.id === room.host && !quick && <span className="hosttag" title="Host"><Icon name="crown" /></span>}
              {p.bot ? <span className="state ai"><Icon name="robot" /></span> : (
                <span className={`state ${p.ready || (p.id === room.host && !quick) ? 'ready' : ''}`}>{p.ready || (p.id === room.host && !quick) ? <Icon name="check" /> : '···'}</span>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, room.cap - room.players.length) }, (_, i) => (
            <li key={`v${i}`} className="vacant"><span className="slotno">–</span><span className="who"><small>Open slot</small></span></li>
          ))}
        </ul>
        {me && <MyCar me={me} />}
      </aside>

      <section className="panel infopanel">
        <div className="info-main">
          <Outline track={track} size={96} />
          <div>
            <p className="eyebrow"><Flag code={c.flag} /> {c.gp} Grand Prix · Round {c.round}</p>
            <h2>{c.name}</h2>
            <p className="meta">
              <span><b>{room.laps}</b> laps</span>
              <span><b>{km(track)}</b> a lap</span>
              <span>about <b>{fmtDuration(room.laps * track.lapSecs)}</b></span>
              <span>Dry · {TIME[c.time]}</span>
            </p>
          </div>
        </div>
        {priv && host && (
          <div className="hostrow">
            <button className="btn small" onClick={() => { sfx('click'); useStore.setState({ picker: true }); }}>Change circuit</button>
            <label>Laps
              <span className="stepper">
                <button onClick={() => cfg({ laps: Math.max(1, room.laps - 1) })} aria-label="Fewer laps">−</button>
                <b>{room.laps}</b>
                <button onClick={() => cfg({ laps: Math.min(9, room.laps + 1) })} aria-label="More laps">+</button>
              </span>
            </label>
            <label>Grid
              <span className="seg tiny">
                {GRID_SIZES.map((n) => <button key={n} className={room.cap === n ? 'on' : ''} disabled={n < humans.length} onClick={() => cfg({ cap: n })}>{n}</button>)}
              </span>
            </label>
            <label>AI drivers
              <span className="seg tiny">
                <button className={room.bots ? 'on' : ''} onClick={() => cfg({ bots: true })}>On</button>
                <button className={!room.bots ? 'on' : ''} onClick={() => cfg({ bots: false })}>Off</button>
              </span>
            </label>
            <label>Season
              <span className="seg tiny">
                {[0, 3, 5].map((n) => <button key={n} className={(room.series?.rounds ?? 0) === n ? 'on' : ''} onClick={() => cfg({ series: n })}>{n || 'Off'}</button>)}
              </span>
            </label>
          </div>
        )}
        {priv && !host && <p className="muted small">The host chooses the circuit and race settings.</p>}
      </section>

      <div className="actions">
        {note && <span className="toast">{note}</span>}
        {quick && <span className="starts">{room.autoStartAt ? `Race starts in ${left}s` : 'Starting…'}</span>}
        {priv && !host && <span className="starts">{me?.ready ? 'Waiting for the host to start' : 'Ready up when you are set'}</span>}
        {priv && host && waiting > 0 && <span className="starts">Waiting for {waiting} {waiting === 1 ? 'driver' : 'drivers'} to ready up</span>}
        <button className="btn ghost" onClick={leave}>Leave room</button>
        {(quick || (priv && !host)) && me && !me.spectator && (
          <button className={`btn big ${me.ready ? 'readied' : 'primary'}`} onClick={ready}>{me.ready ? <><Icon name="check" /> Ready</> : 'Ready up'}</button>
        )}
        {(trial || (priv && host)) && (
          <button className="btn primary big" disabled={waiting > 0} onClick={() => { sfx('click'); send({ t: 'start' }); }}>
            {trial ? 'Start session' : 'Start race'} <Icon name="flag" />
          </button>
        )}
      </div>
    </div>
  );
}

function Results() {
  const res = useStore((s) => s.results), myId = useStore((s) => s.myId), room = useStore((s) => s.room);
  const bankRace = useStore((s) => s.bankRace), adDoubled = useStore((s) => s.adDoubled), grant = useStore((s) => s.grant);
  const left = useSecondsUntil(room.nextAt);
  const mine = res?.list.find((r) => r.id === myId) ?? null;
  const [ad, setAd] = useState(false);
  useEffect(() => {
    if (mine) bankRace(mine);
  }, [mine, bankRace]);
  if (!res) return null;
  const c = circuitOf(res.circuit), host = room.host === myId, quick = room.mode === 'quick';
  const me = room.players.find((p) => p.id === myId);
  const st = live.me.stats, series = res.series;
  const fastest = res.list.find((r) => r.fastest);
  const mover = [...res.list].sort((a, b) => b.overtakes - a.overtakes)[0];
  const doubleIt = async () => {
    setAd(true);
    const ok = await showRewardedAd();
    setAd(false);
    if (ok && !useStore.getState().adDoubled) {
      useStore.setState({ adDoubled: true });
      grant({ coins: mine.reward });
      sfx('buy');
    }
  };
  return (
    <div className="results">
      <div className="panel results-panel">
        <header>
          <p className="eyebrow"><Flag code={c.flag} /> {c.name} · {res.laps} laps{series ? ` · round ${series.done} of ${series.rounds}` : ''}</p>
          <h2>{mine ? (mine.place === 1 ? 'You won the race' : `You finished ${ordinal(mine.place)}`) : `${res.list[0]?.name} wins`}</h2>
        </header>

        <ol className="classif">
          {res.list.map((r) => (
            <li key={r.id} className={`${r.id === myId ? 'me' : ''} p${r.place}`}>
              <span className="pos">{r.place}</span>
              <i style={{ background: colorOf(r) }} />
              <span className="nm">{r.name}{r.bot && <small> AI</small>}</span>
              <span className="time mono">{r.ms == null ? 'Not classified' : r.place === 1 ? fmtTime(r.ms) : fmtGap(r.gap)}</span>
              <span className={`best mono ${r.fastest ? 'fl' : ''}`} title={r.fastest ? 'Fastest lap of the race' : 'Best lap'}>{r.best ? fmtTime(r.best) : '–'}</span>
              {series && <span className="pts">+{r.pts}</span>}
            </li>
          ))}
        </ol>
        <p className="legend muted small">Time or gap to the winner · best lap{fastest ? <> · <span className="fl-dot" /> fastest lap: {fastest.name}</> : ''}{mover?.overtakes > 0 ? ` · most overtakes: ${mover.name} (${mover.overtakes})` : ''}</p>

        {mine && (
          <div className="mystats">
            <div><span>Best lap</span><b className="mono">{mine.best ? fmtTime(mine.best) : '–'}</b></div>
            <div><span>Overtakes</span><b>{mine.overtakes}</b></div>
            <div><span>Top speed</span><b>{Math.round(st.top * KMH)} <small>km/h</small></b></div>
            <div><span>Drifting</span><b>{st.driftSecs.toFixed(1)} <small>s</small></b></div>
            <div><span>Boost used</span><b>{st.boostSecs.toFixed(1)} <small>s</small></b></div>
            <div><span>In a slipstream</span><b>{st.slipSecs.toFixed(1)} <small>s</small></b></div>
          </div>
        )}

        {series && (
          <div className="standings">
            <h4>{series.final ? 'Final championship standings' : 'Championship standings'}</h4>
            <ol>
              {series.standings.map((r, i) => (
                <li key={r.id} className={r.id === myId ? 'me' : ''}>
                  <span className="pos">{i + 1}</span><span className="nm">{r.name}</span><b>{r.pts}</b>
                  {series.final && i === 0 && <span className="champ"><Icon name="trophy" /> Champion</span>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {mine && (
          <div className="earn">
            <span className="pill big"><span className="coin" /> +{mine.reward * (adDoubled ? 2 : 1)}</span>
            <span className="pill big xp">+{mine.xp} XP</span>
            {!adDoubled && <button className="btn small" onClick={doubleIt} disabled={ad}><Icon name="play" /> Watch an ad: double coins</button>}
          </div>
        )}

        <footer className="row">
          <button className="btn ghost" onClick={leave}>Leave</button>
          <span className="grow" />
          {quick && <span className="starts">Next race in {left}s</span>}
          {!quick && !host && (
            <>
              <span className="starts">The host decides what is next</span>
              {me && !me.spectator && <button className={`btn ${me.ready ? 'readied' : ''}`} onClick={() => send({ t: 'ready', v: !me.ready })}>{me.ready ? <><Icon name="check" /> Up for a rematch</> : 'Up for a rematch'}</button>}
            </>
          )}
          {!quick && host && (
            <>
              <button className="btn" onClick={() => { sfx('click'); send({ t: 'lobby' }); }}>Back to lobby</button>
              <button className="btn primary" onClick={() => { sfx('click'); send({ t: 'rematch' }); }}>
                {series && !series.final ? 'Next round' : series ? 'New season' : 'Rematch'} <Icon name="flag" />
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function TouchControls() {
  const [on] = useState(() => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
  const steer = useRef({ l: false, r: false }).current;
  useEffect(() => {
    live.touch.active = on;
    return () => {
      live.touch.active = false;
    };
  }, [on]);
  if (!on) return null;
  const hold = (set) => ({
    onPointerDown: (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); set(true); },
    onPointerUp: () => set(false),
    onPointerCancel: () => set(false),
    onContextMenu: (e) => e.preventDefault(),
  });
  const t = live.touch;
  const upd = () => (t.steer = (steer.l ? 1 : 0) - (steer.r ? 1 : 0));
  return (
    <div className="touch">
      <div className="touch-left">
        <button {...hold((v) => { steer.l = v; upd(); })} aria-label="Steer left">◀</button>
        <button {...hold((v) => { steer.r = v; upd(); })} aria-label="Steer right">▶</button>
      </div>
      <div className="touch-right">
        <button className="t-small" onPointerDown={requestReset} aria-label="Reset car">↺</button>
        <button className="t-small" {...hold((v) => (t.brake = v))}>Brake</button>
        <button className="t-boost" {...hold((v) => (t.boost = v))}>Boost</button>
        <button className="t-drift" {...hold((v) => (t.drift = v))}>Drift</button>
      </div>
    </div>
  );
}

export function Play() {
  const room = useStore((s) => s.room), conn = useStore((s) => s.conn);
  const state = room?.state;
  useEffect(() => {
    setMusic(state === 'racing');
    if (state === 'lobby' || state === 'results') setEngine(0, 0, false);
    return () => {
      setMusic(false);
      setEngine(0, 0, false);
    };
  }, [state]);

  if (!room)
    return (
      <div className="overlay solid">
        <div className="card">
          <h2>{conn === 'reconnecting' ? 'Getting you back in…' : conn === 'connecting' ? 'Finding a grid…' : 'Joining…'}</h2>
          <button className="btn ghost" onClick={leave}>Cancel</button>
        </div>
      </div>
    );
  const racing = state === 'countdown' || state === 'racing';
  return (
    <div className="play">
      <Game />
      {state === 'lobby' && <Lobby />}
      {racing && <Hud />}
      {racing && <TouchControls />}
      {state === 'results' && <Results />}
      {racing && <button className="btn ghost quit" onClick={leave}>{room.mode === 'trial' ? 'End session' : 'Quit'}</button>}
      {conn === 'reconnecting' && (
        <div className="overlay dim">
          <div className="card">
            <h2>Connection lost</h2>
            <p className="muted">Reconnecting. Your car is being held for you.</p>
            <button className="btn ghost" onClick={leave}>Leave</button>
          </div>
        </div>
      )}
    </div>
  );
}
