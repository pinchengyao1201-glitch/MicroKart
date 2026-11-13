// All sound is synthesised with WebAudio: an engine note that follows speed, tyre squeal while drifting,
// short blips for everything else and a small looping tune. No audio files to download.

import { getState } from './store.js';

let ctx = null, master = null, engine = null, hiss = null, music = null;

const on = () => getState().profile.settings.sound;

/** Browsers only allow audio after a click or key press, so this is called from the first one. */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function tone(freq, dur, { type = 'square', vol = 0.2, to = null, delay = 0 } = {}) {
  if (!ctx || !on()) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noiseSource() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function burst(dur, { vol = 0.25, freq = 1200, to = 300, q = 0.8 } = {}) {
  if (!ctx || !on()) return;
  const t = ctx.currentTime, s = noiseSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const SFX = {
  light: () => tone(520, 0.16, { vol: 0.2 }),
  go: () => { tone(1040, 0.55, { vol: 0.22 }); burst(0.5, { freq: 400, to: 2400, vol: 0.18 }); },
  boost: () => { burst(0.6, { freq: 500, to: 3200, vol: 0.3 }); tone(180, 0.5, { type: 'sawtooth', to: 620, vol: 0.14 }); },
  slip: () => burst(0.5, { freq: 900, to: 2200, vol: 0.1, q: 0.6 }),
  drift: () => burst(0.25, { freq: 1800, to: 900, vol: 0.16, q: 1.2 }),
  charge: () => tone(880, 0.09, { type: 'triangle', vol: 0.12, to: 1320 }),
  bump: () => { burst(0.18, { freq: 300, to: 90, vol: 0.4, q: 0.5 }); tone(90, 0.15, { type: 'sine', vol: 0.3, to: 50 }); },
  lap: () => { tone(660, 0.1, { vol: 0.16 }); tone(880, 0.1, { vol: 0.16, delay: 0.1 }); tone(1100, 0.22, { vol: 0.16, delay: 0.2 }); },
  best: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { vol: 0.16, type: 'triangle', delay: i * 0.08 })),
  finish: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { vol: 0.18, delay: i * 0.12 })),
  win: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.26, { vol: 0.2, delay: i * 0.11 })),
  click: () => tone(700, 0.05, { type: 'triangle', vol: 0.1 }),
  ready: () => { tone(660, 0.07, { type: 'triangle', vol: 0.14 }); tone(990, 0.12, { type: 'triangle', vol: 0.14, delay: 0.07 }); },
  join: () => tone(520, 0.12, { type: 'triangle', vol: 0.12, to: 780 }),
  buy: () => { tone(784, 0.08, { vol: 0.16 }); tone(1047, 0.08, { vol: 0.16, delay: 0.08 }); tone(1568, 0.25, { vol: 0.16, delay: 0.16 }); },
  nope: () => tone(160, 0.2, { type: 'sawtooth', vol: 0.12 }),
};

export function sfx(name) {
  if (!ctx || !on()) return;
  SFX[name]?.();
}

/** Called every frame while driving. speed01 is 0..1.4ish, drift is 0..1. `rev` blips the throttle on the grid. */
export function setEngine(speed01, drift, active, rev = false) {
  if (!ctx) return;
  if (rev) speed01 = 0.18 + 0.34 * Math.max(0, Math.sin(ctx.currentTime * 5.2)) ** 2;
  if (!engine) {
    const a = ctx.createOscillator(), b = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    a.type = 'sawtooth';
    b.type = 'square';
    f.type = 'lowpass';
    g.gain.value = 0;
    a.connect(f);
    b.connect(f);
    f.connect(g).connect(master);
    a.start();
    b.start();
    engine = { a, b, f, g };
    const s = noiseSource(), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
    hf.type = 'bandpass';
    hf.frequency.value = 2400;
    hf.Q.value = 1.4;
    hg.gain.value = 0;
    s.connect(hf).connect(hg).connect(master);
    s.start();
    hiss = hg;
  }
  const t = ctx.currentTime, live = active && on();
  const f = 70 + speed01 * 190;
  engine.a.frequency.setTargetAtTime(f, t, 0.05);
  engine.b.frequency.setTargetAtTime(f * 0.502, t, 0.05);
  engine.f.frequency.setTargetAtTime(500 + speed01 * 1900, t, 0.08);
  engine.g.gain.setTargetAtTime(live ? 0.035 + speed01 * 0.035 : 0, t, 0.1);
  hiss.gain.setTargetAtTime(live ? drift * 0.07 : 0, t, 0.05);
}

// ---- a tiny sequenced tune

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
const BASS = [0, 0, 5, 3];
const ARP = [0, 2, 4, 5, 4, 2, 3, 1, 0, 2, 4, 6, 5, 4, 2, 1];
const noteHz = (semi, oct) => 110 * Math.pow(2, oct + semi / 12);

export function setMusic(want) {
  if (!ctx) return;
  const play = want && getState().profile.settings.music && on();
  if (!play) {
    if (music) {
      clearInterval(music.timer);
      music.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      music = null;
    }
    return;
  }
  if (music) return;
  const gain = ctx.createGain();
  gain.gain.value = 0.16;
  gain.connect(master);
  const step = 60 / 132 / 4;
  let next = ctx.currentTime + 0.1, i = 0;
  const note = (hz, at, dur, type, vol) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = hz;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(gain);
    o.start(at);
    o.stop(at + dur + 0.02);
  };
  const schedule = () => {
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(i / 16) % 4, root = BASS[bar];
      if (i % 4 === 0) note(noteHz(root, -1), next, step * 3.2, 'triangle', 0.5);
      if (i % 8 === 4) note(noteHz(root + 7, -1), next, step * 1.6, 'triangle', 0.3);
      if (i % 2 === 0) note(noteHz(root + SCALE[ARP[(i / 2) % 16]], 1), next, step * 1.7, 'square', 0.11);
      next += step;
      i++;
    }
  };
  schedule();
  music = { gain, timer: setInterval(schedule, 80) };
}
