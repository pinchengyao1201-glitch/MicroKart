// The circuit catalogue: one entry per round of the calendar, in calendar order. Everything about a circuit
// that is not geometry maths lives here, so adding or changing a round is a data edit.
//
// `points` are the control points of the centreline in MAP coordinates: [right, up] or [right, up, height],
// listed in racing order starting at the start/finish line. The layouts are miniatures drawn from memory of
// the real circuits: the corner sequence and overall shape are meant to be recognisable, not surveyed.
//
//   env    what surrounds the road: 'green' (grass and trees), 'street' (city blocks), 'desert' (sand)
//   time   'day' | 'dusk' | 'night'
//   lap    length of one lap in world units (the control points are scaled to hit it)
//   w, sh  half the road width, and the width of the run-off between the road edge and the barrier

const C = (o) => ({ w: 5.6, sh: 2.2, env: 'green', time: 'day', tree: 'round', ...o });

export const CIRCUITS = [
  C({
    id: 'australia', gp: 'Australia', name: 'Albert Park', place: 'Melbourne', flag: 'au', lap: 820,
    traits: ['Lakeside park', 'Fast chicanes'],
    points: [[-84, -2], [-84, 28], [-76, 50], [-58, 60], [-38, 50], [-18, 58], [14, 62], [44, 54], [68, 36], [82, 8], [76, -20], [58, -32], [40, -24], [22, -36], [-2, -52], [-28, -48], [-48, -62], [-68, -66], [-84, -50], [-84, -28]],
  }),
  C({
    id: 'china', gp: 'China', name: 'Shanghai International', place: 'Shanghai', flag: 'cn', lap: 880,
    traits: ['Snail first corner', 'Long back straight'],
    points: [[-10, 60], [30, 60], [62, 52], [78, 28], [66, 4], [42, -2], [28, 12], [20, 30], [2, 38], [-24, 36], [-42, 22], [-34, 4], [-10, 0], [8, -14], [30, -24], [58, -22], [84, -30], [92, -52], [76, -68], [40, -72], [-10, -72], [-60, -72], [-92, -64], [-100, -40], [-96, -4], [-92, 30], [-76, 54], [-50, 60]],
  }),
  C({
    id: 'japan', gp: 'Japan', name: 'Suzuka', place: 'Suzuka', flag: 'jp', lap: 900, tree: 'pine',
    traits: ['Figure of eight', 'Flowing esses'],
    points: [[52, 46], [80, 46], [98, 36], [104, 14], [90, -4], [68, -2], [52, -16], [34, -8], [18, -22], [2, -14], [-12, 0], [-30, 16], [-52, 28], [-76, 24], [-88, 6], [-96, -18], [-88, -42], [-68, -52], [-48, -44, 0.5], [-34, -24, 4], [-12, 0, 7.5], [0, 18, 6], [6, 36, 2], [22, 46]],
  }),
  C({
    id: 'miami', gp: 'Miami', name: 'Miami International Autodrome', place: 'Miami Gardens', flag: 'us', lap: 860, env: 'street', tree: 'palm', sh: 1.4,
    traits: ['Stadium campus', 'Tight chicane'],
    points: [[46, 52], [6, 52], [-24, 46], [-40, 28], [-60, 26], [-74, 40], [-94, 34], [-104, 14], [-92, -4], [-68, -8], [-46, 0], [-26, -10], [-12, -30], [-24, -48], [-8, -62], [24, -64], [64, -64], [94, -60], [108, -42], [104, -14], [104, 16], [100, 40], [84, 52]],
  }),
  C({
    id: 'canada', gp: 'Canada', name: 'Circuit Gilles-Villeneuve', place: 'Montreal', flag: 'ca', lap: 780, sh: 1.2,
    traits: ['Island circuit', 'Chicanes and walls'],
    points: [[50, 22], [76, 22], [92, 28], [106, 18], [102, -4], [82, -14], [62, -6], [44, -18], [20, -14], [2, -26], [-16, -16], [-40, -18], [-58, -30], [-76, -20], [-98, -22], [-114, -8], [-106, 12], [-82, 18], [-50, 18], [-22, 18], [-8, 28], [6, 21], [26, 22]],
  }),
  C({
    id: 'monaco', gp: 'Monaco', name: 'Circuit de Monaco', place: 'Monte Carlo', flag: 'mc', lap: 640, env: 'street', tree: 'palm', w: 4.6, sh: 0.5,
    traits: ['Tight street circuit', 'Barriers at the kerb'], water: true,
    points: [[-70, -20], [-66, 12], [-54, 32], [-28, 38, 3], [0, 46, 6], [22, 58, 8], [40, 50, 8], [60, 44, 6], [68, 26, 4], [64, 8, 3], [80, 0, 3], [94, 10, 2], [104, -6, 1], [96, -24], [72, -36], [44, -40], [26, -32], [12, -42], [-8, -40], [-24, -52], [-40, -44], [-54, -58], [-70, -70], [-72, -52]],
  }),
  C({
    id: 'spain', gp: 'Spain', name: 'Barcelona-Catalunya', place: 'Montmelo', flag: 'es', lap: 800,
    traits: ['Long sweepers', 'Technical final sector'],
    points: [[-30, 56], [20, 56], [60, 56], [82, 46], [84, 28], [102, 18], [108, -4], [92, -22], [66, -18], [48, -2], [26, 4], [8, -10], [-12, -26], [-34, -14], [-58, -26], [-84, -22], [-104, -34], [-120, -22], [-118, 0], [-100, 8], [-96, 28], [-84, 48], [-62, 56]],
  }),
  C({
    id: 'austria', gp: 'Austria', name: 'Red Bull Ring', place: 'Spielberg', flag: 'at', lap: 700, tree: 'pine',
    traits: ['Short lap', 'Steep climbs'],
    points: [[40, -50], [0, -50], [-40, -50], [-66, -42, 1], [-78, -20, 2], [-72, 12, 4], [-56, 44, 6], [-44, 66, 8], [-26, 72, 8], [-12, 60, 7], [4, 42, 5], [30, 24, 3], [46, 10, 2], [48, -8, 1], [62, -18], [82, -14], [98, -26], [98, -44], [80, -52]],
  }),
  C({
    id: 'britain', gp: 'Great Britain', name: 'Silverstone', place: 'Silverstone', flag: 'gb', lap: 920,
    traits: ['Fast sweeping corners', 'High-speed esses'],
    points: [[-96, -14], [-96, 14], [-86, 36], [-68, 44], [-54, 32], [-58, 12], [-42, 2], [-20, 10], [10, 22], [36, 30], [52, 46], [70, 58], [90, 50], [88, 30], [74, 14], [78, -8], [62, -26], [44, -18], [30, -34], [14, -26], [0, -42], [-30, -54], [-62, -66], [-86, -68], [-98, -50]],
  }),
  C({
    id: 'belgium', gp: 'Belgium', name: 'Spa-Francorchamps', place: 'Stavelot', flag: 'be', lap: 1000, tree: 'pine',
    traits: ['Big elevation changes', 'Fast and flowing'],
    points: [[-56, -44, 5], [-80, -46, 5.5], [-100, -40, 6], [-108, -26, 6], [-96, -14, 5], [-76, -12, 3], [-58, -18, 0.5], [-46, -10, 0.5], [-36, 4, 4], [-24, 10, 6.5], [0, 24, 8.5], [30, 42, 10], [56, 56, 11], [70, 58, 11], [78, 46, 10.5], [90, 42, 10], [100, 30, 9], [94, 10, 8], [76, 8, 7], [62, -2, 6], [66, -18, 5], [78, -34, 3.5], [86, -52, 2], [78, -68, 1], [56, -74, 1], [20, -72, 2], [-8, -62, 3.5], [-16, -48, 4.5], [-34, -44, 5]],
  }),
  C({
    id: 'hungary', gp: 'Hungary', name: 'Hungaroring', place: 'Mogyorod', flag: 'hu', lap: 740,
    traits: ['Tight and twisty', 'Hard to pass'],
    points: [[-20, 58], [20, 58], [56, 58], [80, 50], [86, 30], [70, 18], [48, 22], [34, 8], [40, -12], [56, -24], [76, -22], [92, -36], [88, -56], [68, -64], [46, -56], [30, -66], [10, -58], [-8, -68], [-28, -58], [-46, -66], [-68, -60], [-78, -42], [-72, -22], [-92, -12], [-102, 8], [-98, 30], [-84, 48], [-58, 58]],
  }),
  C({
    id: 'netherlands', gp: 'Netherlands', name: 'Zandvoort', place: 'Zandvoort', flag: 'nl', lap: 720, env: 'desert', tree: 'none',
    traits: ['Banked turns', 'Rolling dunes'],
    points: [[-10, 54, 1], [30, 54, 1], [62, 52, 1.5], [84, 42, 2.5], [86, 22, 2.5], [68, 12, 1.5], [48, 18, 1], [30, 10, 2], [28, -8, 3], [44, -16, 2], [64, -12, 1], [84, -22, 2], [90, -42, 3], [78, -58, 2], [56, -62, 1], [36, -52, 0.5], [18, -62, 1], [-2, -54, 2], [-22, -62, 1], [-38, -50, 0], [-56, -58, 0], [-74, -50, 0.5], [-84, -32, 1.5], [-84, -6, 2], [-88, 18, 2.5], [-76, 40, 2], [-50, 52, 1]],
  }),
  C({
    id: 'italy', gp: 'Italy', name: 'Monza', place: 'Monza', flag: 'it', lap: 900, tree: 'pine',
    traits: ['Long straights', 'Heavy-braking chicanes'],
    points: [[30, -60], [-10, -60], [-50, -60], [-66, -58], [-74, -48], [-90, -52], [-108, -42], [-114, -18], [-106, 6], [-96, 22], [-102, 36], [-90, 46], [-76, 60], [-56, 64], [-40, 54], [-36, 36], [-24, 12], [-10, -8], [2, -22], [16, -30], [30, -22], [56, -20], [84, -20], [104, -26], [112, -44], [98, -60], [70, -62]],
  }),
  C({
    id: 'madrid', gp: 'Spain', name: 'Madrid circuit', place: 'Madrid', flag: 'es', lap: 860, env: 'street', sh: 1.4,
    traits: ['Street and park hybrid', 'Long banked sweep'],
    points: [[-40, 50], [0, 50], [40, 50], [58, 44], [68, 54], [84, 50], [98, 40], [102, 20], [102, -10], [94, -30], [74, -36], [58, -42], [52, -58], [38, -74], [16, -74], [4, -56], [8, -36], [2, -18], [-16, -10], [-36, -20], [-54, -10], [-72, -18], [-90, -8], [-96, 12], [-90, 34], [-72, 48]],
  }),
  C({
    id: 'azerbaijan', gp: 'Azerbaijan', name: 'Baku City', place: 'Baku', flag: 'az', lap: 960, env: 'street', w: 5.2, sh: 0.6,
    traits: ['Endless main straight', 'Narrow old-town section'],
    points: [[40, -50], [80, -50], [104, -46], [114, -30], [114, -8], [104, 8], [84, 12], [70, 20], [66, 38], [56, 52], [36, 56], [0, 56], [-36, 54], [-54, 46, 1], [-60, 28, 2.5], [-70, 14, 4], [-88, 12, 4.5], [-98, -2, 4], [-88, -16, 3], [-100, -30, 1.5], [-96, -46, 0.5], [-80, -54], [-50, -52], [-10, -50]],
  }),
  C({
    id: 'singapore', gp: 'Singapore', name: 'Marina Bay', place: 'Singapore', flag: 'sg', lap: 840, env: 'street', time: 'night', w: 5.2, sh: 0.6, water: true,
    traits: ['Night street circuit', 'Right-angle corners'],
    points: [[-20, -56], [20, -56], [50, -56], [68, -50], [64, -34], [84, -26], [104, -20], [112, -4], [110, 20], [98, 36], [76, 40], [44, 40], [26, 46], [20, 60], [6, 70], [-16, 68], [-28, 58], [-30, 42], [-40, 28], [-58, 26], [-76, 30], [-88, 18], [-80, 4], [-62, 0], [-56, -14], [-66, -28], [-84, -30], [-96, -38], [-98, -54], [-84, -62], [-56, -58]],
  }),
  C({
    id: 'usa', gp: 'United States', name: 'Circuit of the Americas', place: 'Austin', flag: 'us', lap: 900,
    traits: ['Uphill first corner', 'Snaking esses'],
    points: [[100, -30, 2], [100, 6, 5], [98, 36, 8], [90, 56, 9], [72, 62, 9], [58, 50, 7], [44, 40, 6], [30, 50, 5], [14, 40, 4], [0, 50, 3], [-16, 40, 2], [-36, 42, 1], [-58, 48], [-80, 52], [-96, 40], [-90, 22], [-64, 14], [-30, 8], [8, 2], [40, -4], [58, -12], [62, -30], [52, -44], [34, -46], [22, -56], [26, -70], [42, -78], [64, -76], [86, -68], [98, -54, 1]],
  }),
  C({
    id: 'mexico', gp: 'Mexico', name: 'Hermanos Rodríguez', place: 'Mexico City', flag: 'mx', lap: 760,
    traits: ['Thin air, huge straight', 'Stadium section'],
    points: [[-50, 52], [0, 52], [50, 52], [80, 50], [98, 40], [92, 24], [106, 12], [106, -8], [92, -22], [76, -36], [56, -30], [38, -40], [18, -30], [0, -42], [-20, -32], [-40, -42], [-60, -38], [-66, -22], [-52, -10], [-62, 4], [-84, 2], [-100, 14], [-104, 34], [-86, 50]],
  }),
  C({
    id: 'brazil', gp: 'Brazil', name: 'Interlagos', place: 'São Paulo', flag: 'br', lap: 720,
    traits: ['Anticlockwise bowl', 'Downhill first corner'],
    points: [[30, 54, 6], [-10, 54, 6], [-44, 50, 5.5], [-62, 40, 4.5], [-56, 24, 3.5], [-70, 12, 2.5], [-82, -4, 2], [-74, -24, 1.5], [-50, -40, 0.5], [-20, -54], [4, -58], [22, -46, 0.5], [18, -28, 1.5], [6, -12, 2], [18, 4, 2], [38, 0, 1.5], [50, -14, 1], [46, -34, 0.5], [62, -48, 0.5], [80, -44, 1], [84, -26, 1.5], [98, -10, 2.5], [106, 12, 4], [98, 36, 5.5], [70, 50, 6]],
  }),
  C({
    id: 'vegas', gp: 'Las Vegas', name: 'Las Vegas Strip Circuit', place: 'Las Vegas', flag: 'us', lap: 960, env: 'street', time: 'night', w: 5.4, sh: 0.8,
    traits: ['Neon night race', 'Flat-out on the Strip'],
    points: [[-60, -60], [-20, -60], [14, -58], [30, -48], [24, -32], [38, -20], [60, -16], [84, -22], [102, -12], [110, 6], [100, 24], [82, 28], [72, 42], [76, 58], [62, 70], [30, 72], [-20, 72], [-70, 72], [-92, 64], [-96, 48], [-112, 38], [-116, 10], [-114, -20], [-106, -46], [-88, -60]],
  }),
  C({
    id: 'qatar', gp: 'Qatar', name: 'Lusail', place: 'Lusail', flag: 'qa', lap: 860, env: 'desert', time: 'night', tree: 'none',
    traits: ['Floodlit desert', 'Medium-speed flow'],
    points: [[-40, 56], [10, 56], [56, 56], [84, 48], [94, 28], [80, 12], [62, 12], [52, -2], [64, -16], [84, -22], [96, -40], [84, -58], [60, -62], [40, -68], [24, -56], [6, -62], [-12, -50], [-30, -60], [-52, -58], [-76, -56], [-94, -40], [-100, -14], [-88, 6], [-96, 26], [-88, 46], [-66, 56]],
  }),
  C({
    id: 'abudhabi', gp: 'Abu Dhabi', name: 'Yas Marina', place: 'Yas Island', flag: 'ae', lap: 840, env: 'desert', time: 'dusk', tree: 'palm', water: true,
    traits: ['Twilight finale', 'Two long straights'],
    points: [[24, 56], [-10, 56], [-40, 56], [-58, 48], [-64, 30], [-56, 14], [-70, 2], [-64, -14], [-78, -28], [-72, -46], [-52, -50], [-20, -46], [20, -44], [56, -44], [80, -38], [90, -22], [104, -10], [110, 10], [102, 30], [84, 34], [70, 40], [62, 54]],
  }),
].map((c, i) => ({ ...c, round: i + 1 }));

export const CIRCUIT_IDS = CIRCUITS.map((c) => c.id);
const byId = Object.fromEntries(CIRCUITS.map((c) => [c.id, c]));
export const circuitOf = (id) => byId[id] ?? CIRCUITS[0];
export const hasCircuit = (id) => Object.hasOwn(byId, id);
/** The round after this one, wrapping at the end of the calendar. */
export const nextCircuit = (id) => CIRCUITS[circuitOf(id).round % CIRCUITS.length].id;
