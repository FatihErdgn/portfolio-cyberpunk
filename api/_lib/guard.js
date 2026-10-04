/* Spend and abuse guard for the LLM endpoints. The portfolio runs on a $3/month
   budget, so every call is priced from its real usage and booked against a daily
   and a monthly ceiling before the next one is allowed.

   Storage: Upstash Redis over REST when its URL/token env vars are set (shared
   across serverless instances); otherwise a per-instance in-memory fallback, which is
   best-effort only. The hard backstop is the spend limit on the API key's own
   Console workspace. */
import { createHash } from 'node:crypto';

/* $ per million tokens */
const PRICES = {
  'claude-haiku-4-5': { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};

export const LIMITS = {
  dailyUsd: Number(process.env.DAILY_USD_CAP ?? 0.1),
  monthlyUsd: Number(process.env.MONTHLY_USD_CAP ?? 3),
  perIpPerHour: Number(process.env.PER_IP_PER_HOUR ?? 30),
};

export function priceUsage(model, u) {
  const p = PRICES[model] ?? PRICES['claude-sonnet-5-5'];
  const usd =
    ((u.input_tokens ?? 0) * p.in +
      (u.output_tokens ?? 0) * p.out +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1e6;
  return usd;
}

/* Vercel's Upstash marketplace integration injects KV_REST_API_*; a direct Upstash setup uses UPSTASH_* */
const URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const mem = new Map();

async function redis(cmds) {
  const r = await fetch(`${URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return (await r.json()).map(x => x.result);
}

/* counters are stored in micro-dollars so INCRBY stays integral */
async function incr(key, by, ttlSec) {
  if (URL && TOKEN) {
    const [v] = await redis([['INCRBY', key, String(by)], ['EXPIRE', key, String(ttlSec), 'NX']]);
    return Number(v);
  }
  const now = Date.now();
  const cur = mem.get(key);
  const v = (cur && cur.exp > now ? cur.v : 0) + by;
  mem.set(key, { v, exp: cur && cur.exp > now ? cur.exp : now + ttlSec * 1000 });
  return v;
}

const day = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);

export function clientKey(req) {
  const ip = String(req.headers['x-forwarded-for'] ?? req.headers['x-real-ip'] ?? 'local').split(',')[0].trim();
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/* returns null when the call may proceed, or a reason string for the visitor */
export async function admit(req) {
  const hour = new Date().toISOString().slice(0, 13);
  const hits = await incr(`rl:${clientKey(req)}:${hour}`, 1, 3600);
  if (hits > LIMITS.perIpPerHour) return 'rate';
  const [d, m] = await Promise.all([incr(`usd:d:${day()}`, 0, 172800), incr(`usd:m:${month()}`, 0, 3456000)]);
  if (d / 1e6 >= LIMITS.dailyUsd) return 'budget-day';
  if (m / 1e6 >= LIMITS.monthlyUsd) return 'budget-month';
  return null;
}

export async function book(usd) {
  const micro = Math.ceil(usd * 1e6);
  await Promise.all([incr(`usd:d:${day()}`, micro, 172800), incr(`usd:m:${month()}`, micro, 3456000)]);
}

export async function spendToday() {
  const [d, m] = await Promise.all([incr(`usd:d:${day()}`, 0, 172800), incr(`usd:m:${month()}`, 0, 3456000)]);
  return { today: d / 1e6, month: m / 1e6, ...LIMITS };
}

export async function readJson(req, maxBytes = 20000) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > maxBytes) throw new Error('too-large');
  }
  return raw ? JSON.parse(raw) : {};
}
