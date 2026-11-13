import { useEffect, useState } from 'react';
import { useStore } from './store.js';
import { Front } from './ui/Front.jsx';
import { Play } from './ui/Play.jsx';
import { bindControls } from './game/controls.js';
import { unlockAudio } from './audio.js';
import { live } from './game/live.js';
import { resume, connect, send } from './net.js';

// Stand-ins for a payment page and an ad. They say plainly what they are: nothing is charged and no ad network
// is called. See src/monetization.js for where the real ones plug in.
function Modal() {
  const modal = useStore((s) => s.modal);
  const [left, setLeft] = useState(5);
  useEffect(() => {
    if (modal?.kind !== 'ad') return;
    setLeft(5);
    const t = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [modal]);
  useEffect(() => {
    if (modal?.kind === 'ad' && left <= 0) modal.resolve(true);
  }, [left, modal]);
  if (!modal) return null;
  if (modal.kind === 'checkout')
    return (
      <div className="overlay solid top">
        <div className="card">
          <p className="eyebrow">Test checkout</p>
          <h2>
            {modal.pack.gems} gems · {modal.pack.price}
          </h2>
          <p className="muted">No payment provider is connected in this build, so nothing will be charged. Confirming simply adds the gems, so the shop can be tried out.</p>
          <div className="row">
            <button className="btn ghost" onClick={() => modal.resolve(false)}>
              Cancel
            </button>
            <span className="grow" />
            <button className="btn primary" onClick={() => modal.resolve(true)}>
              Simulate purchase
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="overlay solid top">
      <div className="card ad">
        <p className="eyebrow">Ad placeholder</p>
        <h2>A rewarded video would play here</h2>
        <p className="muted">No ad network is connected in this build. Reward in {Math.max(0, left)}s.</p>
        <button className="btn ghost" onClick={() => modal.resolve(false)}>
          Skip (no reward)
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useStore((s) => s.screen);
  useEffect(() => {
    const off = bindControls();
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    if (import.meta.env.DEV) window.__mk = { live, store: useStore, connect, send };
    resume(); // back into the room we were in, if the page was reloaded mid-race
    return () => {
      off();
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);
  return (
    <div className="app">
      {screen === 'play' ? <Play /> : <Front />}
      <Modal />
    </div>
  );
}
