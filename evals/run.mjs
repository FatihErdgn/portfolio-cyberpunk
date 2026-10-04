/* FIXER eval: runs every case against the real agent and grades it with plain string and
   tool checks (no LLM judge, so the score is reproducible and cheap). Writes
   evals/results.json, which /evals.html renders. Spends real API money: about $0.10 a run.
   Usage: PORTFOLIO_ANTHROPIC_KEY=... node evals/run.mjs */
import fs from 'node:fs';
import { runFixer } from '../api/fixer.js';

const cases = JSON.parse(fs.readFileSync(new URL('./cases.json', import.meta.url)));
const results = [];
let usd = 0;

for (const c of cases) {
  const t0 = performance.now();
  let out, err;
  try { out = await runFixer([{ role: 'user', content: c.q }]); } catch (e) { err = String(e.message ?? e); }
  const ms = Math.round(performance.now() - t0);
  const text = out?.reply ?? '';
  const low = text.toLowerCase();
  const tools = (out?.actions ?? []).map(a => a.tool);
  const checks = [];
  if (c.any) checks.push({ check: `mentions one of: ${c.any.join(' | ')}`, ok: c.any.some(x => low.includes(x.toLowerCase())) });
  if (c.none) checks.push({ check: `never says: ${c.none.join(' | ')}`, ok: !c.none.some(x => low.includes(x.toLowerCase())) });
  /* the platform's private name lives only in the EVAL_PRIVATE_TERMS env var: this repo and its
     results are public, so the forbidden word itself must never be written into them */
  if (c.none_private) {
    const terms = (process.env.EVAL_PRIVATE_TERMS ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (!terms.length) console.warn('EVAL_PRIVATE_TERMS is not set; the private-name check is skipped');
    checks.push({ check: "never reveals the platform's private name", ok: !terms.some(t => low.includes(t)) });
  }
  if (c.tool) checks.push({ check: `calls ${c.tool}`, ok: tools.includes(c.tool) });
  if (c.notool) checks.push({ check: `does not call ${c.notool}`, ok: !tools.includes(c.notool) });
  /* global checks, every case: the only email is the real one, and no markdown links */
  const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
  checks.push({ check: 'any email is exactly fatiherdogann099@gmail.com', ok: emails.every(e => e.replace(/[.,]$/, '') === 'fatiherdogann099@gmail.com') });
  checks.push({ check: 'no markdown links', ok: !/\]\(/.test(text) });
  if (err) checks.push({ check: 'no error', ok: false });
  const pass = checks.every(x => x.ok);
  usd += out?.usd ?? 0;
  results.push({ id: c.id, q: c.q, pass, checks, reply: text, tools, ms, usd: out?.usd ?? 0, usage: out?.usage, error: err });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(16)} ${String(ms).padStart(5)}ms  ${tools.join(',')}`);
}

const lat = results.map(r => r.ms).sort((a, b) => a - b);
const pct = p => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
const summary = {
  model: process.env.FIXER_MODEL ?? 'claude-sonnet-5-5',
  ran_at: new Date().toISOString(),
  cases: results.length,
  passed: results.filter(r => r.pass).length,
  usd_total: +usd.toFixed(4),
  usd_per_answer: +(usd / results.length).toFixed(5),
  latency_ms: { p50: pct(0.5), p95: pct(0.95) },
  cache_read_tokens: results.reduce((a, r) => a + (r.usage?.cache_read_input_tokens ?? 0), 0),
};
fs.writeFileSync(new URL(process.env.EVAL_OUT ?? './results.json', import.meta.url), JSON.stringify({ summary, results }, null, 2));
console.log(`\n${summary.passed}/${summary.cases} passed · $${summary.usd_total} total · p50 ${summary.latency_ms.p50}ms · p95 ${summary.latency_ms.p95}ms`);
process.exitCode = summary.passed === summary.cases ? 0 : 1;
