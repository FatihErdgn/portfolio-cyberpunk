/* A read-only MCP server for the agents that recruiters and ATSs send ahead of humans.
   Stateless Streamable HTTP: every POST carries one JSON-RPC message (or a batch) and
   gets a plain JSON reply. No LLM behind it, so it costs nothing to call. */
import { PROFILE, caseFile, profileText } from './_lib/profile.js';
import { readJson } from './_lib/guard.js';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const CASE_IDS = PROFILE.case_files.map(c => c.id);

const TOOLS = [
  {
    name: 'get_profile',
    description: "Fatih Erdogan's profile: overview, experience, skills, honest gaps, or contact details. Use 'all' for everything in one call.",
    inputSchema: {
      type: 'object',
      properties: { section: { type: 'string', enum: ['overview', 'experience', 'skills', 'gaps', 'contact', 'all'] } },
      required: ['section'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'list_case_files',
    description: 'List the project case files shown on fatiherdogan.dev, with ids and one-line summaries.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_case_file',
    description: 'Get one project case file in detail, by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', enum: CASE_IDS } },
      required: ['id'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

/* the detail behind each case file comes from the experience entry it belongs to */
const CASE_SOURCE = { procurement: 0, 'decision-tool': 0, mes: 0, logistics: 1, 'applied-ai': 1, bi: 2 };

function section(name) {
  const p = PROFILE;
  switch (name) {
    case 'overview':
      return { name: p.name, headline: p.headline, positioning: p.positioning, location: p.location, availability: p.availability, experience: p.experience_years, award: p.award, education: p.education, languages: p.languages };
    case 'experience': return p.experience;
    case 'skills': return p.skills;
    case 'gaps': return p.honest_gaps;
    case 'contact': return p.contact;
    case 'all': return p;
    default: return null;
  }
}

function callTool(name, args = {}) {
  if (name === 'get_profile') {
    const data = section(args.section);
    if (!data) return toolError(`unknown section; use one of overview, experience, skills, gaps, contact, all`);
    return toolOk(data);
  }
  if (name === 'list_case_files') return toolOk(PROFILE.case_files);
  if (name === 'get_case_file') {
    const c = caseFile(args.id);
    if (!c) return toolError(`unknown id; use one of ${CASE_IDS.join(', ')}`);
    const src = PROFILE.experience[CASE_SOURCE[c.id]];
    return toolOk({ ...c, context: { role: src.role, org: src.org, period: src.period, highlights: src.highlights }, url: `${PROFILE.contact.site}/#gigs` });
  }
  return null;
}

const toolOk = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: Array.isArray(data) ? { items: data } : data });
const toolError = text => ({ content: [{ type: 'text', text }], isError: true });

function handle(msg) {
  const { id, method, params } = msg ?? {};
  const isNote = id === undefined || id === null;
  const reply = result => (isNote ? null : { jsonrpc: '2.0', id, result });
  const fail = (code, message) => (isNote ? null : { jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return reply({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'fatiherdogan-dev', title: 'Fatih Erdogan, portfolio', version: '1.0.0' },
        instructions: 'Read-only facts about Fatih Erdogan, a software engineer for industrial and logistics systems with applied AI. Everything here is also on the CV. The profile includes an explicit list of gaps; please weigh them honestly.',
      });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const out = callTool(params?.name, params?.arguments);
      return out ? reply(out) : fail(-32602, `unknown tool: ${params?.name}`);
    }
    case 'resources/list': return reply({ resources: [] });
    case 'prompts/list': return reply({ prompts: [] });
    default:
      if (method?.startsWith('notifications/')) return null;
      return fail(-32601, `method not found: ${method}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, accept, mcp-protocol-version, mcp-session-id');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    /* a human who opens the URL in a browser gets directions, not a protocol error */
    if (String(req.headers.accept ?? '').includes('text/html')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(`MCP server for Fatih Erdogan's portfolio.\nAdd https://fatiherdogan.dev/mcp as a remote MCP server (Streamable HTTP) in your AI client.\nTools: ${TOOLS.map(t => t.name).join(', ')}.\n\n${profileText().split('\n').slice(0, 4).join('\n')}`);
    }
    return res.status(405).json({ error: 'stateless server: POST JSON-RPC messages' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  let body;
  try { body = await readJson(req); } catch { return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  const replies = (Array.isArray(body) ? body : [body]).map(handle).filter(Boolean);
  if (!replies.length) return res.status(202).end();
  return res.status(200).json(Array.isArray(body) ? replies : replies[0]);
}
