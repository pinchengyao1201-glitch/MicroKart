// Sanity-check every circuit: length, tightest corner, and that no two stretches run close enough for their
// barriers to touch (bridges excepted). Run with `npm run check`. Pass --sheet <file.svg> to also write a
// contact sheet of every layout.
import fs from 'node:fs';
import { CIRCUITS } from '../shared/circuits.js';
import { getTrack, outlinePath } from '../shared/track.js';

let bad = false;
const cells = [];
const t0 = Date.now();
for (const c of CIRCUITS) {
  const t = getTrack(c.id);
  let maxK = 0, at = 0;
  for (let i = 0; i < t.n; i++) if (Math.abs(t.curv[i]) > maxK) { maxK = Math.abs(t.curv[i]); at = i; }
  const minR = 1 / maxK;
  let minSep = Infinity;
  const skip = Math.ceil((t.wallAt * 5) / t.step);
  for (let i = 0; i < t.n; i += 2)
    for (let j = i + skip; j < t.n; j += 2) {
      if (t.n - j + i < skip) continue;
      if (Math.abs(t.y[i] - t.y[j]) > 3) continue;
      const d = Math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j]);
      if (d < minSep) minSep = d;
    }
  // the grid needs a reasonably straight run-up to the line
  let gridBend = 0;
  for (let o = 1; o <= Math.ceil(34 / t.step); o++) gridBend = Math.max(gridBend, Math.abs(t.curv[t.n - o]));
  let bridges = 0;
  for (let i = 0; i < t.n; i++) bridges += t.bridge[i];
  const okR = minR > t.wallAt + 2.2, okS = minSep > t.wallAt * 2 + 1.5, okG = gridBend < 0.03;
  if (!okR || !okS || !okG) bad = true;
  console.log(
    `${String(c.round).padStart(2)} ${c.id.padEnd(12)} lap ${t.len.toFixed(0).padStart(4)}  ~${t.lapSecs.toFixed(0)}s x${t.laps}  corners ${String(t.corners).padStart(2)}  ` +
      `tightest R ${minR.toFixed(1).padStart(5)} ${okR ? 'ok ' : 'TIGHT'}  nearest ${minSep.toFixed(1).padStart(5)} ${okS ? 'ok ' : 'CLOSE'}  ` +
      `grid bend ${gridBend.toFixed(3)} ${okG ? 'ok' : 'BENT'}  climb ${t.bounds.maxY.toFixed(1)}${bridges ? '  bridge' : ''}`
  );
  const o = outlinePath(t, 200, 16);
  cells.push(
    `<g transform="translate(${((c.round - 1) % 5) * 210 + 10},${Math.floor((c.round - 1) / 5) * 230 + 10})">` +
      `<rect width="200" height="220" rx="8" fill="#1b1c22"/><path d="${o.d}" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>` +
      `<circle cx="${o.start[0].toFixed(1)}" cy="${o.start[1].toFixed(1)}" r="5" fill="#e5202b"/>` +
      `<text x="100" y="214" fill="#fff" font-family="Helvetica" font-size="13" text-anchor="middle">${c.round}. ${c.name}</text></g>`
  );
}
console.log(`built ${CIRCUITS.length} circuits in ${Date.now() - t0} ms`);
const ix = process.argv.indexOf('--sheet');
if (ix > 0) {
  fs.writeFileSync(process.argv[ix + 1], `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="1160" viewBox="0 0 1160 1160"><rect width="1160" height="1160" fill="#0c0d10"/>${cells.join('')}</svg>`);
  console.log('wrote', process.argv[ix + 1]);
}
if (bad) process.exit(1);
