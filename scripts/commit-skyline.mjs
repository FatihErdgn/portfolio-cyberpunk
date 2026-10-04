/* Builds lib/commit-skyline.json: weekly commit totals for the commit-skyline view.
   Privacy by construction: only the Monday of each week and a count per repo group leave
   this script. No times of day, messages, paths, branches or author names.
   Usage: node scripts/commit-skyline.mjs backend=/path/a web=/path/b mobile=/path/c */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const groups = process.argv.slice(2).map(a => a.split('='));
const weeks = new Map();
const monday = d => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };

for (const [group, dir] of groups) {
  const out = execFileSync('git', ['-C', dir, 'log', 'HEAD', '--no-merges', '--author=Fatih', '--format=%ad', '--date=short'], { encoding: 'utf8' });
  for (const d of out.split('\n').filter(Boolean)) {
    const w = monday(d);
    if (!weeks.has(w)) weeks.set(w, {});
    weeks.get(w)[group] = (weeks.get(w)[group] ?? 0) + 1;
  }
}
/* fill empty weeks so the skyline keeps true spacing */
const keys = [...weeks.keys()].sort();
const all = [];
for (let d = new Date(`${keys[0]}T00:00:00Z`); d <= new Date(`${keys.at(-1)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7)) {
  const w = d.toISOString().slice(0, 10);
  all.push({ week: w, ...Object.fromEntries(groups.map(([g]) => [g, weeks.get(w)?.[g] ?? 0])) });
}
const total = all.reduce((a, w) => a + groups.reduce((b, [g]) => b + w[g], 0), 0);
const data = { generated: new Date().toISOString().slice(0, 10), groups: groups.map(([g]) => g), definition: 'non-merge commits by Fatih on the main development branches, counted per ISO week', total, weeks: all };
fs.writeFileSync(new URL('../lib/commit-skyline.json', import.meta.url), JSON.stringify(data));
console.log(`${all.length} weeks, ${total} commits`);
