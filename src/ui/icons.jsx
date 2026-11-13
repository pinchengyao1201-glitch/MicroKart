// Small inline icons and simplified country flags, drawn here so they look the same on every device.

const base = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const PATHS = {
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
  crown: <path d="M4 18 3 7l5 4 4-7 4 7 5-4-1 11z" fill="currentColor" stroke="none" />,
  check: <path d="M5 12.5 10 17l9-10" />,
  bolt: <path d="M13 2 5 13.5h5.5L9 22l9-12h-5.5z" fill="currentColor" stroke="none" />,
  users: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c.6-3.8 3.2-5.6 6.5-5.6s5.9 1.8 6.5 5.6M16 4.9a3.4 3.4 0 0 1 0 6.2M18.2 14.8c1.8.8 3 2.5 3.3 5.2" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4c0 3 1.2 4.6 3.4 5M17 6h3c0 3-1.2 4.6-3.4 5M12 14v4M8 20h8" /></>,
  stopwatch: <><circle cx="12" cy="14" r="7" /><path d="M12 14V10M10 3h4M12 3v4M18.5 7.5 20 6" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5z" fill="currentColor" stroke="none" /></>,
  back: <path d="M14 6l-6 6 6 6" />,
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
  robot: <><rect x="5" y="8" width="14" height="10" rx="3" /><path d="M12 8V4M9 13h.01M15 13h.01M9.5 21h5" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" fill="currentColor" stroke="none" />,
  sun: <><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" /></>,
  dusk: <><path d="M3 18h18M6 18a6 6 0 0 1 12 0" /><path d="M12 5v3M4.5 10.5l2 1.5M19.5 10.5l-2 1.5" /></>,
};
export const Icon = ({ name, ...rest }) => <svg {...base} aria-hidden="true" {...rest}>{PATHS[name] ?? null}</svg>;

const star = (cx, cy, r, fill) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, q = i % 2 ? r * 0.42 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * q).toFixed(2)} ${(cy + Math.sin(a) * q).toFixed(2)}`;
  }
  return <path d={d + 'Z'} fill={fill} />;
};
const H = (colors, weights) => {
  const total = (weights ?? colors.map(() => 1)).reduce((a, b) => a + b, 0);
  let y = 0;
  return colors.map((c, i) => {
    const h = ((weights?.[i] ?? 1) / total) * 20, r = <rect key={i} x="0" y={y} width="30" height={h + 0.05} fill={c} />;
    y += h;
    return r;
  });
};
const V = (colors, weights) => {
  const total = (weights ?? colors.map(() => 1)).reduce((a, b) => a + b, 0);
  let x = 0;
  return colors.map((c, i) => {
    const w = ((weights?.[i] ?? 1) / total) * 30, r = <rect key={i} x={x} y="0" width={w + 0.05} height="20" fill={c} />;
    x += w;
    return r;
  });
};
const FLAGS = {
  au: <><rect width="30" height="20" fill="#012169" /><rect width="13" height="9" fill="#012169" /><path d="M0 0l13 9M13 0 0 9" stroke="#fff" strokeWidth="1.6" /><path d="M6.5 0v9M0 4.5h13" stroke="#fff" strokeWidth="2.6" /><path d="M6.5 0v9M0 4.5h13" stroke="#e4002b" strokeWidth="1.3" />{star(6.5, 14.5, 2.4, '#fff')}{star(22, 4.5, 1.3, '#fff')}{star(26, 9, 1.3, '#fff')}{star(22, 15.5, 1.3, '#fff')}{star(18.5, 9.5, 1.3, '#fff')}</>,
  cn: <><rect width="30" height="20" fill="#de2910" />{star(6, 6, 3.6, '#ffde00')}{star(12, 2.6, 1.1, '#ffde00')}{star(14, 5.4, 1.1, '#ffde00')}{star(14, 8.8, 1.1, '#ffde00')}{star(12, 11.4, 1.1, '#ffde00')}</>,
  jp: <><rect width="30" height="20" fill="#fff" /><circle cx="15" cy="10" r="6" fill="#bc002d" /></>,
  us: <>{H(['#b22234', '#fff', '#b22234', '#fff', '#b22234', '#fff', '#b22234'])}<rect width="13" height="11.4" fill="#3c3b6e" />{[3, 6.5, 10].map((x) => [2.6, 5.7, 8.8].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="0.8" fill="#fff" />))}</>,
  ca: <>{V(['#d52b1e', '#fff', '#d52b1e'], [1, 2, 1])}<path d="M15 4l1.6 3 2.4-.8-1 3.2 2.2 1.4-3.6 1.4.3 2.3H15.6V17h-1.2v-2.5h-1.3l.3-2.3L9.8 10.8 12 9.4l-1-3.2 2.4.8z" fill="#d52b1e" /></>,
  mc: H(['#ce1126', '#fff']),
  es: H(['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]),
  at: H(['#ed2939', '#fff', '#ed2939']),
  gb: <><rect width="30" height="20" fill="#012169" /><path d="M0 0l30 20M30 0 0 20" stroke="#fff" strokeWidth="3.4" /><path d="M0 0l30 20M30 0 0 20" stroke="#c8102e" strokeWidth="1.4" /><path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" /><path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.4" /></>,
  be: V(['#000', '#fdda24', '#ef3340']),
  hu: H(['#ce2939', '#fff', '#477050']),
  nl: H(['#ae1c28', '#fff', '#21468b']),
  it: V(['#009246', '#fff', '#ce2b37']),
  az: <>{H(['#00b5e2', '#ef3340', '#509e2f'])}<circle cx="14.2" cy="10" r="2.6" fill="#fff" /><circle cx="15" cy="10" r="2.1" fill="#ef3340" />{star(17.2, 10, 1.2, '#fff')}</>,
  sg: <>{H(['#ee2536', '#fff'])}<circle cx="7" cy="5" r="3.2" fill="#fff" /><circle cx="8.4" cy="5" r="3" fill="#ee2536" />{star(10.5, 3, 0.7, '#fff')}{star(12.3, 4.6, 0.7, '#fff')}{star(11.6, 6.9, 0.7, '#fff')}{star(9.4, 6.9, 0.7, '#fff')}{star(8.7, 4.6, 0.7, '#fff')}</>,
  mx: <>{V(['#006847', '#fff', '#ce1126'])}<circle cx="15" cy="10" r="2.3" fill="#8a6a2f" /></>,
  br: <><rect width="30" height="20" fill="#009c3b" /><path d="M15 2.5 27 10 15 17.5 3 10z" fill="#ffdf00" /><circle cx="15" cy="10" r="4.2" fill="#002776" /></>,
  qa: <><rect width="30" height="20" fill="#8a1538" /><path d="M0 0h8l3 1.1L8 2.2l3 1.1L8 4.4l3 1.1L8 6.7l3 1.1L8 8.9l3 1.1L8 11.1l3 1.1L8 13.3l3 1.1L8 15.6l3 1.1L8 17.8l3 1.1L8 20H0z" fill="#fff" /></>,
  ae: <>{H(['#00732f', '#fff', '#000'])}<rect width="8" height="20" fill="#ff0000" /></>,
};
/** A country flag (3:2). `code` is a lower-case ISO country code from shared/circuits.js. */
export const Flag = ({ code, className = '' }) => (
  <svg className={`flag ${className}`} viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true">
    <clipPath id={`fc-${code}`}><rect width="30" height="20" rx="2.5" /></clipPath>
    <g clipPath={`url(#fc-${code})`}>{FLAGS[code] ?? <rect width="30" height="20" fill="#444" />}</g>
  </svg>
);
