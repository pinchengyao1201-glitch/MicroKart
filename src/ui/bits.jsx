// Small pieces shared by several screens.

import { useStore } from '../store.js';
import { helmetOf } from '../../shared/catalog.js';

export const Logo = ({ small = false }) => (
  <span className={`logo ${small ? 'small' : ''}`}>
    <span className="logo-mark" aria-hidden="true"><i /><i /><i /></span>
    <span className="logo-text">Micro Kart<em>Grand Prix</em></span>
  </span>
);

/** A player's avatar: their helmet, with their initial on it. */
export function Avatar({ name, helmet, ring }) {
  const h = helmetOf(helmet);
  return (
    <span className="avatar" style={{ background: h.color, '--stripe': h.stripe, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}>
      <b style={{ color: h.stripe }}>{(name || '?').slice(0, 1).toUpperCase()}</b>
    </span>
  );
}

export function Wallet() {
  const p = useStore((s) => s.profile), go = useStore((s) => s.go), inRoom = useStore((s) => !!s.room);
  return (
    <div className="wallet">
      <span className="pill"><span className="coin" /> {p.coins}</span>
      <button className="pill" onClick={() => !inRoom && go('shop')} title="Get gems" disabled={inRoom}>
        <span className="gem" /> {p.gems} {!inRoom && <b>+</b>}
      </button>
    </div>
  );
}

export function SettingsChips() {
  const s = useStore((st) => st.profile.settings), setSetting = useStore((st) => st.setSetting);
  const nextQ = { high: 'medium', medium: 'low', low: 'high' }[s.quality];
  return (
    <div className="chips">
      <button className="chipbtn" onClick={() => setSetting('quality', nextQ)}>Graphics: {s.quality}</button>
      <button className="chipbtn" onClick={() => setSetting('sound', !s.sound)}>Sound: {s.sound ? 'on' : 'off'}</button>
      <button className="chipbtn" onClick={() => setSetting('music', !s.music)}>Music: {s.music ? 'on' : 'off'}</button>
    </div>
  );
}

export const Keys = () => (
  <p className="keys">
    <kbd>W A S D</kbd> or arrows drive · <kbd>Space</kbd> drift, which fills the boost meter · <kbd>Shift</kbd> boost · <kbd>R</kbd> reset
  </p>
);
