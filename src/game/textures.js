// Every texture in the game is painted onto a canvas at start-up, so there are no image files to load.

import * as THREE from 'three';

function canvasTexture(w, h, paint, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// a small deterministic random stream, so the scenery is the same for every player
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

function speckle(g, w, h, r, count, alpha = 0.05) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${alpha * (0.4 + r())})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
  }
}

const FONT = '"Saira Condensed", "Arial Narrow", system-ui, sans-serif';

/** The road surface. u runs across the road from edge to edge, v runs along the track. */
export function asphaltTexture(night) {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = rng(7);
    g.fillStyle = night ? '#2b2e38' : '#3a3c42';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, r, 7000, 0.06);
    // the racing line: rubber laid down the middle
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0.2, 'rgba(0,0,0,0)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.22)');
    grd.addColorStop(0.8, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f2f2';
    g.fillRect(8, 0, 9, h);
    g.fillRect(w - 17, 0, 9, h);
  });
}

/** What lies between the road edge and the barrier. */
export function runoffTexture(kind, night) {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = rng(19);
    if (kind === 'grass') {
      g.fillStyle = night ? '#1f4a2c' : '#3f8a3a';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '20,60,20' : '150,210,90'},${0.08 + r() * 0.12})`;
        g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 5);
      }
    } else if (kind === 'paint') {
      // painted asphalt run-off, the way modern desert circuits do it
      g.fillStyle = night ? '#1d3a66' : '#2a5ea8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = night ? '#a8232c' : '#d4323c';
      for (let y = -w; y < h; y += 64) {
        g.beginPath();
        g.moveTo(0, y); g.lineTo(w, y + w); g.lineTo(w, y + w + 26); g.lineTo(0, y + 26);
        g.fill();
      }
      speckle(g, w, h, r, 1500, 0.05);
    } else {
      g.fillStyle = night ? '#23252c' : '#30323a';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 2500, 0.06);
    }
  });
}

export function kerbTexture() {
  return canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#e5202b';
    g.fillRect(0, 0, w, h / 2);
    g.fillStyle = '#f4f4f0';
    g.fillRect(0, h / 2, w, h / 2);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, h / 2 - 3, w, 3);
    g.fillRect(0, h - 3, w, 3);
  });
}

/** The ground beyond the barriers. */
export function groundTexture(env, time) {
  const night = time === 'night', dusk = time === 'dusk';
  return canvasTexture(1024, 1024, (g, w, h) => {
    const r = rng(11);
    if (env === 'green') {
      g.fillStyle = night ? '#173a22' : '#3a7d36';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const x = r() * w, y = r() * h, s = 30 + r() * 110;
        g.fillStyle = `rgba(${r() < 0.5 ? '25,70,25' : '110,180,70'},${0.04 + r() * 0.07})`;
        g.beginPath();
        g.ellipse(x, y, s, s * (0.4 + r() * 0.6), r() * 3, 0, 7);
        g.fill();
      }
    } else if (env === 'desert') {
      g.fillStyle = night ? '#4a3f33' : dusk ? '#c79a6a' : '#dcc089';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) {
        const y = r() * h, x = r() * w, len = 80 + r() * 300;
        g.strokeStyle = `rgba(${r() < 0.5 ? '90,60,30' : '255,240,200'},${0.05 + r() * 0.08})`;
        g.lineWidth = 2 + r() * 5;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + len / 2, y + (r() - 0.5) * 30, x + len, y);
        g.stroke();
      }
    } else {
      g.fillStyle = night ? '#16181f' : '#55585f';
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 9000, 0.05);
      g.strokeStyle = night ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)';
      g.lineWidth = 3;
      for (let i = 0; i <= 8; i++) {
        g.beginPath(); g.moveTo((i * w) / 8, 0); g.lineTo((i * w) / 8, h); g.stroke();
        g.beginPath(); g.moveTo(0, (i * h) / 8); g.lineTo(w, (i * h) / 8); g.stroke();
      }
    }
  });
}

/** A run of barrier. kind: 'armco' (steel rails), 'wall' (concrete street barrier), 'tecpro' (red and white blocks). */
export function barrierTexture(kind, night) {
  return canvasTexture(256, 64, (g, w, h) => {
    if (kind === 'tecpro') {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#f4f4f0' : '#d4222c';
        g.fillRect((i * w) / 4, 0, w / 4, h);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect((i * w) / 4, 0, 3, h);
      }
    } else if (kind === 'wall') {
      g.fillStyle = night ? '#6b6f7a' : '#b9bcc2';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
      g.fillStyle = night ? '#ffd23c' : '#e9c22e';
      g.fillRect(0, 6, w, 7);
    } else {
      g.fillStyle = night ? '#7b808c' : '#c9cdd4';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, 18, w, 5);
      g.fillRect(0, 40, w, 5);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, 10, w, 4);
      g.fillRect(0, 32, w, 4);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 6, h);
    }
  });
}

export function checkerTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    const s = h / 2;
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < w / s; x++) {
        g.fillStyle = (x + y) % 2 ? '#15161a' : '#ffffff';
        g.fillRect(x * s, y * s, s, s);
      }
  });
}

/** An advertising board or gantry banner. */
export function bannerTexture(text, bg = '#15161a', fg = '#ffffff', { flags = false, w = 512, h = 96 } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (flags) {
      const s = h / 4;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.fillStyle = (x + y) % 2 ? bg : '#ffffff';
          g.fillRect(x * s, y * s, s, s);
          g.fillRect(w - (x + 1) * s, y * s, s, s);
        }
    }
    g.fillStyle = fg;
    g.font = `800 ${Math.round(h * 0.62)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.04, w * (flags ? 0.7 : 0.9));
  }, { repeat: false });
}

/** A name tag: slot colour, name, and on the lobby grid whether that player is ready. */
export function nameTexture(name, color, status = null) {
  return canvasTexture(384, 80, (g, w, h) => {
    g.font = `700 40px ${FONT}`;
    const extra = status ? 46 : 0;
    const tw = Math.min(w - 8, g.measureText(name).width + 66 + extra), x0 = (w - tw) / 2;
    g.fillStyle = 'rgba(12,13,17,0.82)';
    g.beginPath();
    g.roundRect(x0, 10, tw, h - 20, 10);
    g.fill();
    g.fillStyle = color;
    g.fillRect(x0, 10, 9, h - 20);
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(name, x0 + 24, h / 2 + 3, tw - 40 - extra);
    if (status) {
      const cx = x0 + tw - 30, cy = h / 2;
      g.beginPath();
      g.arc(cx, cy, 15, 0, 7);
      g.fillStyle = status === 'ready' ? '#22c55e' : 'rgba(255,255,255,0.14)';
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      if (status === 'ready') { g.moveTo(cx - 7, cy); g.lineTo(cx - 2, cy + 6); g.lineTo(cx + 7, cy - 6); }
      else { g.moveTo(cx - 6, cy); g.lineTo(cx - 6.1, cy); g.moveTo(cx, cy); g.lineTo(cx + 0.1, cy); g.moveTo(cx + 6, cy); g.lineTo(cx + 6.1, cy); }
      g.stroke();
    }
  }, { repeat: false });
}

/** A building front: rows of windows, some of them lit. Returns { map, emissive }. */
export function facadeTextures(night) {
  const paint = (lit) => (g, w, h) => {
    const r = rng(31);
    g.fillStyle = lit ? '#000000' : night ? '#20232d' : '#8d929c';
    g.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 6; y += 16)
      for (let x = 6; x < w - 6; x += 14) {
        const on = r() < (night ? 0.42 : 0.12);
        if (lit) g.fillStyle = on ? (r() < 0.7 ? '#ffd9a0' : '#bfe0ff') : '#000000';
        else g.fillStyle = on && night ? '#ffe2b0' : night ? '#0d0f15' : '#3d4654';
        g.fillRect(x, y, 9, 10);
      }
  };
  return { map: canvasTexture(128, 256, paint(false)), emissive: canvasTexture(128, 256, paint(true)) };
}

/** A row of garage doors for the pit building. */
export function garageTexture() {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#e8eaee';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d4222c';
    g.fillRect(0, 0, w, 16);
    for (let i = 0; i < 4; i++) {
      const x = i * (w / 4) + 14;
      g.fillStyle = '#15161a';
      g.fillRect(x, 44, w / 4 - 28, h - 44);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let y = 52; y < h; y += 12) g.fillRect(x, y, w / 4 - 28, 2);
    }
  });
}

/** Sky dome gradient, zenith at the top. */
export function skyTexture(stops) {
  return canvasTexture(8, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    stops.forEach(([at, c]) => grd.addColorStop(at, c));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

export function glowTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { repeat: false });
}

/** The soft shadow under a car. */
export function shadowTexture() {
  return canvasTexture(64, 128, (g, w, h) => {
    g.filter = 'blur(7px)';
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.beginPath();
    g.roundRect(14, 16, w - 28, h - 32, 12);
    g.fill();
  }, { repeat: false });
}
