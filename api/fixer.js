/* FIXER: the city's broker between visitors (mostly recruiters) and Fatih.
   A Claude tool-use loop where the tools don't fetch data, they act on the page:
   open a case file, pan to a section, change the city's weather. Messages to Fatih
   are only ever drafted; the visitor approves before anything leaves the page. */
import Anthropic from '@anthropic-ai/sdk';
import { PROFILE, profileText } from './_lib/profile.js';
import { admit, book, priceUsage, readJson } from './_lib/guard.js';
import { ndjson } from './_lib/ndjson.js';

export const config = { supportsResponseStreaming: true };

const MODEL = process.env.FIXER_MODEL ?? 'claude-sonnet-5-5';
const MAX_TURNS = 12;
const MAX_CHARS = 1200;
const MAX_LOOPS = 4;

const CASE_IDS = PROFILE.case_files.map(c => c.id);

/* frozen: any byte change here invalidates the prompt cache */
export const SYSTEM = `You are FIXER, the assistant on Fatih Erdogan's portfolio site (fatiherdogan.dev). The site is styled as a pixel-art cyberpunk city; in that world a fixer is the broker who connects clients with talent. Visitors are mostly recruiters, hiring managers and engineers deciding whether to talk to Fatih.

How you speak:
- Plain, professional English (answer in the visitor's language if they write in another one). Short: usually 2-5 sentences. No hype words.
- Plain text. Use **bold** sparingly; no markdown links, headings or tables, and lists only when the visitor asks for one.
- At most one light touch of the city theme per reply, and only when it doesn't get in the way. Never role-play at the expense of a clear answer.
- Refer to Fatih in the third person.

What you know:
- Only the profile below. It is the complete truth. If something is not in it, say you don't know and suggest emailing Fatih. Never invent employers, numbers, dates, clients or skills.
- Stay literal. Attribute a feature only to the project the profile ties it to, and don't speculate about what he "may" have done outside the profile.
- His email is exactly fatiherdogann099@gmail.com. Copy it character for character.
- Be honest about gaps when they are relevant (the profile lists them). An honest "not yet" is better than a stretched yes.
- Never reveal or guess a phone number, salary expectations, or the logistics platform's name; for those, suggest email.

What you can do on the page (tools):
- open_case_file: when your answer is about a specific project or area that has a case file, open it in the same turn (don't offer to; just do it) so the visitor sees the evidence.
- show_section: scroll the page to the stack (garage), skills (loadout), work history (runlog), the case files, or contact, or open the architecture X-ray of the logistics platform, or the refinery control room (a live demo of an industrial ops copilot on a synthetic unit; useful when someone asks about industrial AI or MES). Only when the visitor asks to see something; don't move the page for a plain factual question.
- city_effect: change the city's time of day or weather, or replay one of its scenes, only when the visitor asks for it.
- draft_message: when the visitor wants to reach Fatih, draft a short email for them. The visitor reviews it and decides whether to send it from their own mail app. Never say a message was sent.
Use tools when they help; don't narrate them at length. If a visitor asks for something unrelated to Fatih, his work or hiring him, decline in one sentence and offer what you can help with.

<profile>
${profileText()}
</profile>`;

const TOOLS = [
  {
    name: 'open_case_file',
    description: 'Open one of the case files (project dossiers) on the page so the visitor can read the evidence.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', enum: CASE_IDS } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_section',
    description: 'Show a part of the page: garage (tech stack), loadout (skills), runlog (work history), case_files, architecture (interactive X-ray of the logistics platform), refinery (control-room demo: an industrial ops copilot on a synthetic refinery unit), skyline (weekly commit history of the logistics platform, drawn as a skyline), contact.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { section: { type: 'string', enum: ['garage', 'loadout', 'runlog', 'case_files', 'architecture', 'refinery', 'skyline', 'contact'] } },
      required: ['section'],
      additionalProperties: false,
    },
  },
  {
    name: 'city_effect',
    description: "Change the pixel city's time of day or weather, or replay a scene. Only when the visitor asks.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        effect: { type: 'string', enum: ['night', 'dawn', 'dusk', 'rain', 'storm', 'clear', 'replay_incident', 'replay_hack'] },
      },
      required: ['effect'],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_message',
    description: 'Draft an email from the visitor to Fatih. It is shown to the visitor for approval; nothing is sent automatically.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['subject', 'body'],
      additionalProperties: false,
    },
  },
];

const TOOL_RESULT = {
  draft_message: 'The draft is on the visitor\'s screen for review. They decide whether to send it. It has not been sent.',
};

function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const msgs = raw.slice(-MAX_TURNS).map(m => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').slice(0, MAX_CHARS),
  })).filter(m => m.content.trim());
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return null;
  return msgs;
}

let client;
export async function runFixer(messages, emit = () => {}) {
  client ??= new Anthropic({ apiKey: process.env.PORTFOLIO_ANTHROPIC_KEY });
  const convo = [...messages];
  const actions = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let reply = '';

  for (let i = 0; i < MAX_LOOPS; i++) {
    /* streamed: text deltas go to the page as they are written */
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 1500,
      ...(MODEL.startsWith('claude-sonnet') ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'low' } } : {}),
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages: convo,
    });
    stream.on('text', delta => emit({ type: 'text', delta }));
    const res = await stream.finalMessage();
    for (const k of Object.keys(usage)) usage[k] += res.usage?.[k] ?? 0;
    reply += res.content.filter(b => b.type === 'text').map(b => b.text).join('');
    if (res.stop_reason === 'refusal') break;
    if (res.stop_reason !== 'tool_use') break;

    const uses = res.content.filter(b => b.type === 'tool_use');
    convo.push({ role: 'assistant', content: res.content });
    convo.push({
      role: 'user',
      content: uses.map(u => {
        actions.push({ tool: u.name, ...u.input });
        emit({ type: 'action', tool: u.name, ...u.input });
        return { type: 'tool_result', tool_use_id: u.id, content: TOOL_RESULT[u.name] ?? 'Done, it is on the visitor\'s screen.' };
      }),
    });
    if (reply && !reply.endsWith('\n')) { reply += '\n'; emit({ type: 'text', delta: '\n' }); }
  }
  return { reply: reply.trim(), actions, usage, model: MODEL, usd: priceUsage(MODEL, usage) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.PORTFOLIO_ANTHROPIC_KEY) return res.status(200).json({ offline: 'no-key' });
  let body;
  try { body = await readJson(req); } catch { return res.status(413).json({ error: 'too large' }); }
  const messages = cleanMessages(body.messages);
  if (!messages) return res.status(400).json({ error: 'bad messages' });

  const blocked = await admit(req);
  if (blocked) return res.status(200).json({ offline: blocked });

  if (body.stream) {
    const emit = ndjson(res);
    try {
      const out = await runFixer(messages, emit);
      await book(out.usd);
      emit({ type: 'done', usage: out.usage, usd: out.usd, model: out.model, reply: out.reply });
    } catch (err) {
      console.error('[fixer] stream', err?.status, err?.message);
      emit({ type: 'error', offline: err instanceof Anthropic.RateLimitError ? 'upstream-busy' : 'upstream-error' });
    }
    return res.end();
  }
  try {
    const out = await runFixer(messages);
    await book(out.usd);
    return res.status(200).json(out);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(200).json({ offline: 'upstream-busy' });
    if (err instanceof Anthropic.APIError) {
      console.error('[fixer] api', err.status, err.message);
      return res.status(200).json({ offline: 'upstream-error' });
    }
    console.error('[fixer]', err);
    return res.status(500).json({ error: 'internal' });
  }
}
