// Everything outside a room: the home screen (pick a mode), the garage (dress your car), the shop (gems and
// season pass) and the race calendar. Home, garage and shop share one 3D turntable of your car.

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useStore } from '../store.js';
import { connect } from '../net.js';
import { KartModel, makeMotion } from '../game/KartModel.jsx';
import { CATALOG, GEM_PACKS, PASS, findItem, skinOf } from '../../shared/catalog.js';
import { buyGemPack } from '../monetization.js';
import { sfx, unlockAudio } from '../audio.js';
import { Icon } from './icons.jsx';
import { Logo, Wallet, SettingsChips, Keys } from './bits.jsx';
import { CircuitCalendar } from './Circuits.jsx';

function Turntable({ kart }) {
  const g = useRef();
  const motion = useMemo(() => Object.assign(makeMotion(), { speed: 5 }), []);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.45;
  });
  return (
    <group ref={g} position={[0, -0.55, 0]}>
      <KartModel kart={kart} motion={motion} />
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <cylinderGeometry args={[3.1, 3.3, 0.3, 48]} />
        <meshStandardMaterial color="#1b1c22" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.86, 3.02, 64]} />
        <meshBasicMaterial color="#e5202b" toneMapped={false} />
      </mesh>
    </group>
  );
}

function KartPreview({ kart }) {
  return (
    <Canvas className="preview" shadows dpr={[1, 2]} camera={{ fov: 30, position: [7.4, 3.2, 9.6] }} onCreated={({ camera }) => camera.lookAt(0, 0.1, 0)}>
      <hemisphereLight args={['#dfe6ff', '#15161a', 0.9]} />
      <directionalLight position={[5, 8, 4]} intensity={2.6} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-6, 2.5, -4]} intensity={90} color="#ff2a36" />
      <pointLight position={[4, 1.5, -6]} intensity={40} color="#6aa8ff" />
      <Turntable kart={kart} />
    </Canvas>
  );
}

function Mode({ icon, title, text, children }) {
  return (
    <div className="mode">
      <span className="mode-icon"><Icon name={icon} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="mode-actions">{children}</div>
    </div>
  );
}

function Home() {
  const p = useStore((s) => s.profile), setName = useStore((s) => s.setName), go = useStore((s) => s.go), error = useStore((s) => s.error);
  const invite = useMemo(() => new URLSearchParams(location.search).get('room')?.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) ?? '', []);
  const [code, setCode] = useState(invite);
  const play = (mode, opts) => {
    unlockAudio();
    sfx('click');
    connect(mode, opts);
  };
  const tier = Math.min(PASS.tiers.length, Math.floor(p.xp / PASS.xpPerTier));
  return (
    <div className="home">
      <header className="topbar">
        <Logo />
        <nav className="nav">
          <button onClick={() => go('garage')}>Garage</button>
          <button onClick={() => go('circuits')}>Circuits</button>
          <button onClick={() => go('shop')}>Shop{tier > 0 ? ` · Pass ${tier}` : ''}</button>
        </nav>
        <Wallet />
      </header>

      <section className="hero">
        <p className="eyebrow">Multiplayer arcade racing · 2 to 8 players · about 2 minutes a race</p>
        <h1>Small cars.<br /><span>Big racing.</span></h1>
        <div className="hero-row">
          <label className="field">
            <span>Driver name</span>
            <input value={p.name} maxLength={14} placeholder="Driver" onChange={(e) => setName(e.target.value)} />
          </label>
          {invite && (
            <button className="btn primary big" onClick={() => play('join', { code: invite })}>
              Join room {invite} <Icon name="play" />
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="modes">
        <Mode icon="bolt" title="Quick Race" text="Straight onto a grid with whoever is online. AI drivers fill the empty slots.">
          <button className="btn primary" onClick={() => play('quick')}>Race now</button>
        </Mode>
        <Mode icon="lock" title="Private Room" text="Share a room code. The host picks the circuit, laps and grid size.">
          <button className="btn primary" onClick={() => play('create')}>Create</button>
          <span className="joinbox">
            <input className="code" value={code} maxLength={4} placeholder="CODE" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} aria-label="Room code" />
            <button className="btn" disabled={code.length !== 4} onClick={() => play('join', { code })}>Join</button>
          </span>
        </Mode>
        <Mode icon="trophy" title="Championship" text="Three rounds on consecutive circuits. Points for every finish, most points wins.">
          <button className="btn primary" onClick={() => play('champ')}>Start a season</button>
        </Mode>
        <Mode icon="stopwatch" title="Time Trial" text="You, an empty circuit and the clock. Your best lap is kept for each circuit.">
          <button className="btn primary" onClick={() => go('circuits')}>Choose a circuit</button>
        </Mode>
      </section>

      <footer className="home-foot">
        <SettingsChips />
        <Keys />
        <p className="muted small">
          {p.races} {p.races === 1 ? 'race' : 'races'} · {p.wins} {p.wins === 1 ? 'win' : 'wins'} · Unofficial fan project: the teams, sponsors and cars are invented, and the circuits are simplified miniatures.
        </p>
      </footer>
    </div>
  );
}

const SLOTS = [
  ['skin', 'Livery'],
  ['helmet', 'Helmet'],
  ['trail', 'Exhaust'],
];

export function Swatch({ slot, item }) {
  if (slot === 'skin') return <span className="sw skin" style={{ background: `linear-gradient(135deg, ${item.body} 0 62%, ${item.accent} 62% 78%, ${item.trim} 78%)`, boxShadow: item.glow ? `0 0 12px ${item.glow}` : undefined }} />;
  if (slot === 'trail') return <span className="sw trail" style={{ background: `linear-gradient(90deg, ${item.colors.join(',')})` }} />;
  return <span className="sw helmet" style={{ background: `linear-gradient(90deg, ${item.color} 0 40%, ${item.stripe} 40% 60%, ${item.color} 60%)`, boxShadow: item.glow ? `0 0 12px ${item.glow}` : undefined }} />;
}

function priceLabel(price) {
  if (price.pass) return <span className="price pass">Pass tier {price.pass}</span>;
  if (price.gems) return <span className="price"><span className="gem" /> {price.gems}</span>;
  if (price.coins) return <span className="price"><span className="coin" /> {price.coins}</span>;
  return <span className="price">Free</span>;
}

function Garage({ look, setLook }) {
  const p = useStore((s) => s.profile), buy = useStore((s) => s.buy), equip = useStore((s) => s.equip), go = useStore((s) => s.go);
  const [slot, setSlot] = useState('skin'), [msg, setMsg] = useState(null);
  const trying = look[slot], item = findItem(slot, trying), owned = p.owned.includes(`${slot}:${trying}`);
  const pick = (id) => {
    sfx('click');
    setMsg(null);
    setLook({ ...look, [slot]: id });
    if (p.owned.includes(`${slot}:${id}`)) equip(slot, id);
  };
  const purchase = () => {
    const err = buy(slot, trying);
    if (err) {
      sfx('nope');
      return setMsg(err);
    }
    sfx('buy');
    equip(slot, trying);
  };
  return (
    <div className="panel side garage">
      <header className="row">
        <button className="btn ghost small" onClick={() => { setLook(p.kart); go('menu'); }}><Icon name="back" /> Back</button>
        <h2 className="grow">Garage</h2>
        <Wallet />
      </header>
      <div className="seg">
        {SLOTS.map(([id, label]) => (
          <button key={id} className={slot === id ? 'on' : ''} onClick={() => { setSlot(id); setMsg(null); }}>{label}</button>
        ))}
      </div>
      <div className="grid">
        {CATALOG[slot].map((it) => {
          const has = p.owned.includes(`${slot}:${it.id}`);
          return (
            <button key={it.id} className={`tile ${trying === it.id ? 'on' : ''} ${has ? 'owned' : ''}`} onClick={() => pick(it.id)}>
              <Swatch slot={slot} item={it} />
              <span className="tname">{it.name}</span>
              {has ? <span className="price own">{p.kart[slot] === it.id ? 'Equipped' : 'Owned'}</span> : priceLabel(it.price)}
            </button>
          );
        })}
      </div>
      <footer className="row">
        {owned ? (
          <span className="muted">Equipped: {item.name}</span>
        ) : item.price.pass ? (
          <span className="muted">
            Trying on {item.name}. It is a season pass reward. <button className="link" onClick={() => go('shop')}>See the pass</button>
          </span>
        ) : (
          <>
            <span className="muted grow">Trying on {item.name}</span>
            <button className="btn primary" onClick={purchase}>
              Buy for {item.price.gems ? `${item.price.gems} gems` : `${item.price.coins} coins`}
            </button>
          </>
        )}
      </footer>
      {msg && (
        <p className="error">
          {msg}. {msg.includes('gems') && <button className="link" onClick={() => go('shop')}>Get gems</button>}
        </p>
      )}
      <p className="muted small">Everything here is cosmetic. Every car drives the same.</p>
    </div>
  );
}

function rewardLabel(r) {
  if (r.coins) return <><span className="coin" /> {r.coins}</>;
  if (r.gems) return <><span className="gem" /> {r.gems}</>;
  const it = findItem(r.item[0], r.item[1]);
  return <>{it?.name}</>;
}

function Shop() {
  const p = useStore((s) => s.profile), go = useStore((s) => s.go), buyPass = useStore((s) => s.buyPass), claimTier = useStore((s) => s.claimTier);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const tier = Math.floor(p.xp / PASS.xpPerTier), into = p.xp % PASS.xpPerTier;
  const pack = async (sku) => {
    setBusy(true);
    setMsg(null);
    const out = await buyGemPack(sku);
    setBusy(false);
    if (out.ok) {
      sfx('buy');
      setMsg(`${out.gems} gems added.`);
    } else if (out.error) setMsg(out.error);
  };
  const pass = () => {
    const err = buyPass();
    if (err) {
      sfx('nope');
      setMsg(`${err} for the premium pass.`);
    } else sfx('buy');
  };
  return (
    <div className="panel side shop">
      <header className="row">
        <button className="btn ghost small" onClick={() => go('menu')}><Icon name="back" /> Back</button>
        <h2 className="grow">Shop</h2>
        <Wallet />
      </header>

      <h3>Gems</h3>
      <div className="packs">
        {GEM_PACKS.map((g) => (
          <button key={g.sku} className="pack" disabled={busy} onClick={() => pack(g.sku)}>
            {g.tag && <span className="ribbon">{g.tag}</span>}
            <span className="gem big" />
            <strong>{g.gems}</strong>
            <span className="cost">{g.price}</span>
          </button>
        ))}
      </div>
      {msg && <p className="note">{msg}</p>}

      <h3>
        {PASS.season}
        <span className="muted small"> · tier {Math.min(tier, PASS.tiers.length)} · {tier >= PASS.tiers.length ? 'complete' : `${into}/${PASS.xpPerTier} XP to the next`}</span>
      </h3>
      {!p.passPremium && (
        <button className="btn primary" onClick={pass}>Unlock the premium lane · {PASS.premiumPrice} gems</button>
      )}
      <div className="pass">
        {PASS.tiers.map((t, i) => {
          const reached = tier > i;
          return (
            <div key={i} className={`tier ${reached ? 'reached' : ''}`}>
              <span className="tnum">{i + 1}</span>
              {['free', 'premium'].map((lane) => {
                const key = (lane === 'premium' ? 'p' : 'f') + i, claimed = p.claimed.includes(key);
                const locked = !reached || (lane === 'premium' && !p.passPremium);
                return (
                  <button key={lane} className={`reward ${lane} ${claimed ? 'claimed' : ''}`} disabled={locked || claimed} onClick={() => { claimTier(i, lane); sfx('buy'); }}>
                    <span className="rl">{rewardLabel(t[lane])}</span>
                    <span className="rs">{claimed ? 'Claimed' : locked ? (lane === 'premium' && !p.passPremium ? 'Premium' : 'Locked') : 'Claim'}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Front() {
  const screen = useStore((s) => s.screen), kart = useStore((s) => s.profile.kart), go = useStore((s) => s.go);
  const [look, setLook] = useState(kart);
  const shown = screen === 'garage' ? look : kart;
  const skin = skinOf(shown.skin);
  if (screen === 'circuits')
    return (
      <div className="front">
        <CircuitCalendar
          onClose={() => go('menu')}
          actions={(c) => (
            <>
              <button className="btn primary" onClick={() => { unlockAudio(); sfx('click'); connect('trial', { circuit: c.id }); }}><Icon name="stopwatch" /> Time trial</button>
              <button className="btn" onClick={() => { unlockAudio(); sfx('click'); connect('create', { circuit: c.id }); }}><Icon name="lock" /> Private room here</button>
              <button className="btn" onClick={() => { unlockAudio(); sfx('click'); connect('champ', { circuit: c.id }); }}><Icon name="trophy" /> Season from here</button>
            </>
          )}
        />
      </div>
    );
  return (
    <div className={`front on-${screen}`}>
      <div className="stage" style={{ '--tint': skin.body }}>
        <KartPreview kart={shown} />
      </div>
      {screen === 'menu' && <Home />}
      {screen === 'garage' && <Garage look={look} setLook={setLook} />}
      {screen === 'shop' && <Shop />}
    </div>
  );
}
