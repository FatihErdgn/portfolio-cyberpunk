/* Unit 300: a synthetic crude-distillation unit for the Industrial Ops Copilot demo.
   Not plant data. One deterministic function of (tag, hour) drives both the control-room
   charts in the browser and the copilot's tools on the server, so the numbers the agent
   reasons over are exactly the numbers on screen.

   The story in the data: P-301A's bearing starts degrading about 11 hours ago. Vibration
   and motor current climb, discharge pressure sags, crude feed falls about 12%, and the
   furnace outlet temperature starts to hunt. The condenser temperature that alarmed
   yesterday afternoon is a red herring: it follows the ambient day cycle. */

export const UNIT = {
  id: 'U-300',
  name: 'Unit 300, crude distillation',
  note: 'Synthetic demo data. Not from any real plant.',
};

export const EQUIPMENT = {
  'T-300': 'Crude feed tank',
  'P-301A': 'Crude feed pump (running)',
  'P-301B': 'Crude feed pump (standby)',
  'H-301': 'Fired heater',
  'C-301': 'Atmospheric distillation column',
  'E-302': 'Overhead condenser',
  'D-310': 'Reflux drum',
};

export const TAGS = {
  'FI-301': { desc: 'Crude feed flow', unit: 'm3/h', eq: 'P-301A', lo: 385 },
  'PI-301': { desc: 'P-301A discharge pressure', unit: 'barg', eq: 'P-301A', lo: 12.6 },
  'VI-301A': { desc: 'P-301A bearing vibration', unit: 'mm/s', eq: 'P-301A', hi: 5.0 },
  'II-301A': { desc: 'P-301A motor current', unit: 'A', eq: 'P-301A', hi: 198 },
  'TI-305': { desc: 'H-301 outlet temperature', unit: 'degC', eq: 'H-301', hi: 368, lo: 356 },
  'TI-312': { desc: 'E-302 condenser outlet temperature', unit: 'degC', eq: 'E-302', hi: 44 },
  'FI-320': { desc: 'Naphtha product flow', unit: 'm3/h', eq: 'D-310' },
  'LI-310': { desc: 'D-310 reflux drum level', unit: '%', eq: 'D-310', hi: 80, lo: 20 },
};

/* deterministic noise: same (tag, hour) gives the same wiggle on every machine */
function noise(tag, t) {
  let h = 2166136261;
  const s = `${tag}:${Math.round(t * 60)}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const FAULT_START = -11; // hours relative to now
const degr = t => Math.pow(Math.min(1, Math.max(0, (t - FAULT_START) / -FAULT_START)), 1.6);
/* ambient cycle: "now" is late evening, so yesterday's afternoon peak sits about 19 h back */
const ambient = t => Math.sin(((t + 19) / 24) * 2 * Math.PI + Math.PI / 2);

/* value of a tag at hour t (t <= 0, now = 0) */
export function value(tag, t) {
  const d = degr(t), n = noise(tag, t);
  switch (tag) {
    case 'FI-301': return 420 - 52 * d + n * 2.2;
    case 'PI-301': return 14.2 - 2.2 * d + n * 0.06;
    case 'VI-301A': return 2.1 + 6.3 * d + n * 0.15 * (1 + d);
    case 'II-301A': return 182 + 21 * d + n * 0.8;
    case 'TI-305': return 362 + 4.2 * d * Math.sin(t * 2 * Math.PI / 0.7) + n * 0.35;
    case 'TI-312': return 40.5 + 3.8 * Math.max(0, ambient(t)) + n * 0.2;
    case 'FI-320': return 96 * ((420 - 52 * d) / 420) + n * 0.6;
    case 'LI-310': return 52 + n * 1.5;
    default: return null;
  }
}

const r = (v, k = 2) => Math.round(v * 10 ** k) / 10 ** k;

/* evenly sampled series over the last `hours` (1-24) */
export function series(tag, hours = 24, points = 48) {
  hours = Math.min(24, Math.max(1, hours));
  points = Math.min(96, Math.max(4, points));
  const out = [];
  for (let i = 0; i < points; i++) {
    const t = -hours + (hours * i) / (points - 1);
    out.push({ t: r(t), v: r(value(tag, t)) });
  }
  return out;
}

export function summarize(tag, hours = 24, points = 12) {
  const s = series(tag, hours, points);
  const vs = s.map(p => p.v);
  const first = vs[0], last = vs[vs.length - 1];
  return {
    tag, ...TAGS[tag],
    window_hours: hours,
    first, last, min: Math.min(...vs), max: Math.max(...vs),
    change_pct: r(((last - first) / first) * 100, 1),
    points: s,
  };
}

/* alarms are derived from the data: first crossing of each limit inside the window */
export function alarms(hours = 24) {
  const out = [];
  for (const [tag, m] of Object.entries(TAGS)) {
    for (const [kind, lim] of [['HI', m.hi], ['LO', m.lo]]) {
      if (lim === undefined) continue;
      let on = null;
      for (let t = -24; t <= 0.001; t += 0.05) {
        const v = value(tag, t), bad = kind === 'HI' ? v > lim : v < lim;
        if (bad && on === null) on = t;
        if (!bad && on !== null && t - on > 0.4) {
          if (on >= -hours) out.push({ tag, kind, limit: lim, raised_h: r(on, 1), cleared_h: r(t, 1), active: false, eq: m.eq });
          on = null;
        }
      }
      if (on !== null && on >= -hours - 24) out.push({ tag, kind, limit: lim, raised_h: r(on, 1), cleared_h: null, active: true, eq: m.eq });
    }
  }
  /* oscillation alarms are noisy single crossings: keep the first per tag */
  const seen = new Set();
  return out.filter(a => { const k = `${a.tag}${a.kind}${a.active}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.raised_h - b.raised_h);
}

export const WORK_ORDERS = [
  { id: 'WO-1182', eq: 'P-301A', status: 'closed', closed_days_ago: 9, title: 'Mechanical seal inspection', notes: 'Seal OK. Bearing lubrication interval found overdue; regreasing deferred to next window.' },
  { id: 'WO-1190', eq: 'H-301', status: 'closed', closed_days_ago: 5, title: 'Burner tune-up', notes: 'Air/fuel ratio adjusted. No findings.' },
  { id: 'WO-1201', eq: 'E-302', status: 'open', opened_days_ago: 2, title: 'Condenser fouling check', notes: 'Low priority. Outlet temperature tracks ambient; no trend beyond the daily cycle.' },
];

export function workOrders(days = 30) {
  return WORK_ORDERS.filter(w => (w.closed_days_ago ?? w.opened_days_ago) <= days);
}
