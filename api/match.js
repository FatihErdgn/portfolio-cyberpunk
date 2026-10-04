/* CONTRACT MATCH: paste a job description, get a requirement-by-requirement brief.
   Every requirement is marked match / partial / gap with evidence from the profile.
   The honest gaps are the point: a recruiter can trust the matches because the
   misses are listed too. Routed to a larger model than FIXER's chat. */
import Anthropic from '@anthropic-ai/sdk';
import { PROFILE, profileText } from './_lib/profile.js';
import { admit, book, priceUsage, readJson } from './_lib/guard.js';
import { signBrief } from './_lib/sign.js';

const MODEL = process.env.MATCH_MODEL ?? 'claude-sonnet-5-5';
const MAX_JD = 9000;
const CASE_IDS = PROFILE.case_files.map(c => c.id);

export const SYSTEM = `You compare a job description with Fatih Erdogan's profile and produce a hiring brief for a recruiter.

Rules:
- Use only the profile below as evidence. Never invent experience, numbers or skills.
- Extract the job's real requirements (skip boilerplate like benefits). At most 12, most important first.
- For each: status "match" when the profile clearly covers it, "partial" when it covers part or something adjacent, "gap" when it does not. Be strict; a stretched "match" destroys trust.
- evidence: one short sentence pointing to concrete profile facts, or what is missing for a gap.
- case_file: the most relevant case file id, or "none".
- Hard gates (language level, citizenship, work permits, years of experience) must be called out when the job states them.
- verdict: two or three plain sentences a recruiter can paste into their notes.
- Write in English, even if the job description is in another language.

<profile>
${profileText()}
</profile>`;

const SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    company: { type: 'string' },
    fit: { type: 'string', enum: ['strong', 'good', 'partial', 'weak'] },
    verdict: { type: 'string' },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requirement: { type: 'string' },
          status: { type: 'string', enum: ['match', 'partial', 'gap'] },
          evidence: { type: 'string' },
          case_file: { type: 'string', enum: [...CASE_IDS, 'none'] },
        },
        required: ['requirement', 'status', 'evidence', 'case_file'],
        additionalProperties: false,
      },
    },
    hard_gates: { type: 'array', items: { type: 'string' } },
    questions_for_fatih: { type: 'array', items: { type: 'string' } },
  },
  required: ['role', 'company', 'fit', 'verdict', 'requirements', 'hard_gates', 'questions_for_fatih'],
  additionalProperties: false,
};

let client;
export async function runMatch(jd) {
  client ??= new Anthropic({ apiKey: process.env.PORTFOLIO_ANTHROPIC_KEY });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `<job_description>\n${jd}\n</job_description>` }],
  });
  const usd = priceUsage(MODEL, res.usage ?? {});
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return { error: res.stop_reason, usd };
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const brief = JSON.parse(text), at = new Date().toISOString().slice(0, 10);
  return { brief, at, sig: signBrief(brief, at), usage: res.usage, model: res.model ?? MODEL, usd };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.PORTFOLIO_ANTHROPIC_KEY) return res.status(200).json({ offline: 'no-key' });
  let body;
  try { body = await readJson(req, 40000); } catch { return res.status(413).json({ error: 'too large' }); }
  const jd = String(body.jd ?? '').trim().slice(0, MAX_JD);
  if (jd.length < 80) return res.status(400).json({ error: 'paste the full job description' });

  const blocked = await admit(req);
  if (blocked) return res.status(200).json({ offline: blocked });

  try {
    const out = await runMatch(jd);
    await book(out.usd);
    return res.status(200).json(out);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(200).json({ offline: 'upstream-busy' });
    if (err instanceof Anthropic.APIError) {
      console.error('[match] api', err.status, err.message);
      return res.status(200).json({ offline: 'upstream-error' });
    }
    console.error('[match]', err);
    return res.status(500).json({ error: 'internal' });
  }
}
