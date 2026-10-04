/* Industrial Ops Copilot for the synthetic Unit 300. The agent investigates with real tools
   over the same simulation the control room draws: time series, alarms, work orders. It can
   point at equipment on the schematic and propose a work order, which an operator must
   approve on screen. Every tool call is returned as a trace so the visitor sees the work. */
import Anthropic from '@anthropic-ai/sdk';
import { UNIT, EQUIPMENT, TAGS, summarize, alarms, workOrders } from '../lib/refinery-sim.js';
import { admit, book, priceUsage, readJson } from './_lib/guard.js';
import { ndjson } from './_lib/ndjson.js';

export const config = { supportsResponseStreaming: true };

const MODEL = process.env.REFINERY_MODEL ?? 'claude-sonnet-5-5';
const MAX_LOOPS = 8;
const TAG_IDS = Object.keys(TAGS);
const EQ_IDS = Object.keys(EQUIPMENT);

export const SYSTEM = `You are the Industrial Ops Copilot for ${UNIT.name} (${UNIT.id}), shown in a control-room demo on Fatih Erdogan's portfolio. ${UNIT.note} Say so plainly if anyone asks whether this is real plant data.

How you work:
- Investigate with tools before answering. Never state a value, trend, alarm or work order you have not read from a tool result in this conversation.
- Cite evidence with tag names and times relative to now (for example "VI-301A rose from 2.1 to 7.9 mm/s over the last 11 h").
- Separate cause from coincidence. Check whether a signal follows the time of day before blaming it.
- Use highlight_equipment to point at the equipment you are talking about.
- When an action is warranted, call propose_work_order. It only creates a proposal; the operator approves or rejects it on screen. Never say a work order was created or scheduled.
- Answer in this shape, briefly: Finding (one or two sentences), Evidence (two to four short lines), Recommended action (one or two sentences). Plain text, no markdown headings or tables.
- Stay on Unit 300 operations. For anything else, say this copilot only covers the demo unit.

Equipment: ${Object.entries(EQUIPMENT).map(([k, v]) => `${k} ${v}`).join('; ')}.`;

const TOOLS = [
  {
    name: 'list_tags',
    description: 'List the instrument tags on Unit 300 with description, unit, equipment and alarm limits.',
    strict: true,
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'query_timeseries',
    description: 'Read historian data for up to 4 tags over the last 1-24 hours. Returns first, last, min, max, percent change and evenly sampled points (t is hours relative to now, negative is the past).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string', enum: TAG_IDS } },
        hours: { type: 'integer', enum: [1, 3, 6, 12, 24] },
      },
      required: ['tags', 'hours'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_alarms',
    description: 'Alarms raised in the last N hours, active or cleared, with the limit crossed and times relative to now.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { hours: { type: 'integer', enum: [6, 12, 24] } },
      required: ['hours'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_work_orders',
    description: 'Maintenance work orders on Unit 300 in the last N days, open and closed, with notes.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', enum: [7, 14, 30] } },
      required: ['days'],
      additionalProperties: false,
    },
  },
  {
    name: 'highlight_equipment',
    description: 'Highlight equipment on the control-room schematic so the operator sees what you mean.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string', enum: EQ_IDS } } },
      required: ['ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_work_order',
    description: 'Propose a maintenance work order. It is shown to the operator, who approves or rejects it. Nothing is created until they approve.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        equipment: { type: 'string', enum: EQ_IDS },
        priority: { type: 'string', enum: ['P1 urgent', 'P2 this shift', 'P3 planned'] },
        title: { type: 'string' },
        justification: { type: 'string' },
      },
      required: ['equipment', 'priority', 'title', 'justification'],
      additionalProperties: false,
    },
  },
];

function runTool(name, input) {
  switch (name) {
    case 'list_tags':
      return Object.entries(TAGS).map(([tag, m]) => ({ tag, ...m }));
    case 'query_timeseries':
      return input.tags.slice(0, 4).map(tag => summarize(tag, input.hours, 12));
    case 'list_alarms':
      return alarms(input.hours);
    case 'list_work_orders':
      return workOrders(input.days);
    case 'highlight_equipment':
      return { highlighted: input.ids };
    case 'propose_work_order':
      return { status: 'proposed', note: 'Shown to the operator for approval. Not created.' };
    default:
      return { error: 'unknown tool' };
  }
}

/* one line per tool call for the on-screen trace */
function traceLine(name, input, out) {
  switch (name) {
    case 'query_timeseries': return `${input.tags.join(', ')} · ${input.hours} h → ${out.map(s => `${s.tag} ${s.first}→${s.last} ${s.unit} (${s.change_pct > 0 ? '+' : ''}${s.change_pct}%)`).join('; ')}`;
    case 'list_alarms': return `${input.hours} h → ${out.length ? out.map(a => `${a.tag} ${a.kind}${a.active ? ' active' : ' cleared'}`).join(', ') : 'none'}`;
    case 'list_work_orders': return `${input.days} d → ${out.map(w => `${w.id} ${w.eq} ${w.status}`).join(', ')}`;
    case 'list_tags': return `${out.length} tags`;
    case 'highlight_equipment': return input.ids.join(', ');
    case 'propose_work_order': return `${input.equipment} · ${input.priority} · awaiting operator`;
    default: return '';
  }
}

function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const msgs = raw.slice(-8).map(m => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: String(m?.content ?? '').slice(0, 1200) })).filter(m => m.content.trim());
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs.length && msgs[msgs.length - 1].role === 'user' ? msgs : null;
}

let client;
export async function runRefinery(messages, emit = () => {}) {
  client ??= new Anthropic({ apiKey: process.env.PORTFOLIO_ANTHROPIC_KEY });
  const convo = [...messages];
  const trace = [], actions = [];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let reply = '';
  for (let i = 0; i < MAX_LOOPS; i++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      cache_control: { type: 'ephemeral' },
      messages: convo,
    });
    let firstDelta = true;
    stream.on('text', delta => {
      if (firstDelta && reply) emit({ type: 'text', delta: '\n\n' });   // separate this turn from the last
      firstDelta = false;
      emit({ type: 'text', delta });
    });
    const res = await stream.finalMessage();
    for (const k of Object.keys(usage)) usage[k] += res.usage?.[k] ?? 0;
    /* text written alongside tool calls is part of the answer too: keep every turn's text */
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (text) reply += (reply ? '\n\n' : '') + text;
    if (res.stop_reason !== 'tool_use') break;
    const uses = res.content.filter(b => b.type === 'tool_use');
    convo.push({ role: 'assistant', content: res.content });
    convo.push({
      role: 'user',
      content: uses.map(u => {
        const out = runTool(u.name, u.input);
        const line = traceLine(u.name, u.input, out);
        trace.push({ tool: u.name, line });
        emit({ type: 'tool', tool: u.name, input: u.input, line });
        if (u.name === 'highlight_equipment' || u.name === 'propose_work_order') { actions.push({ tool: u.name, ...u.input }); emit({ type: 'action', tool: u.name, ...u.input }); }
        return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) };
      }),
    });
  }
  return { reply: reply.trim(), trace, actions, usage, model: MODEL, usd: priceUsage(MODEL, usage) };
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
      const out = await runRefinery(messages, emit);
      await book(out.usd);
      emit({ type: 'done', usage: out.usage, usd: out.usd, model: out.model, reply: out.reply });
    } catch (err) {
      console.error('[refinery] stream', err?.status, err?.message);
      emit({ type: 'error', offline: err instanceof Anthropic.RateLimitError ? 'upstream-busy' : 'upstream-error' });
    }
    return res.end();
  }
  try {
    const out = await runRefinery(messages);
    await book(out.usd);
    return res.status(200).json(out);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(200).json({ offline: 'upstream-busy' });
    if (err instanceof Anthropic.APIError) {
      console.error('[refinery] api', err.status, err.message);
      return res.status(200).json({ offline: 'upstream-error' });
    }
    console.error('[refinery]', err);
    return res.status(500).json({ error: 'internal' });
  }
}
