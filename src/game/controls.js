// Keyboard and touch input, read once per physics step into live.input.

import { live } from './live.js';
import { getState } from '../store.js';
import { unlockAudio } from '../audio.js';

const down = new Set();
const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  back: ['ArrowDown', 'KeyS'],
  drift: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
};
const any = (list) => list.some((c) => down.has(c));

export function requestReset() {
  live.me.wantReset = true;
}

function onKey(e) {
  if (e.target instanceof HTMLInputElement) return;
  const isDown = e.type === 'keydown';
  if (isDown) unlockAudio();
  const room = getState().room;
  if (getState().screen !== 'play' || !room || (room.state !== 'racing' && room.state !== 'countdown')) return down.clear();
  if (Object.values(KEYS).some((l) => l.includes(e.code))) e.preventDefault();
  if (isDown && !e.repeat && e.code === 'KeyR') requestReset();
  if (isDown) down.add(e.code);
  else down.delete(e.code);
}

export function bindControls() {
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const clear = () => down.clear();
  window.addEventListener('blur', clear);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    window.removeEventListener('blur', clear);
  };
}

export function readInput() {
  const inp = live.input, t = live.touch;
  if (t.active) {
    // on touch screens the car drives itself forward; you steer, drift, boost and brake
    inp.steer = t.steer;
    inp.throttle = t.brake ? 0 : 1;
    inp.brake = t.brake ? 1 : 0;
    inp.drift = t.drift;
    inp.boost = t.boost;
  } else {
    inp.steer = (any(KEYS.left) ? 1 : 0) - (any(KEYS.right) ? 1 : 0);
    inp.throttle = any(KEYS.up) ? 1 : 0;
    inp.brake = any(KEYS.back) ? 1 : 0;
    inp.drift = any(KEYS.drift);
    inp.boost = any(KEYS.boost);
  }
  return inp;
}
