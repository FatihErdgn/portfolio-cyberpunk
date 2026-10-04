/* The single source of truth about Fatih for every machine reader: the FIXER agent's
   system prompt, the MCP server, and /llms.txt all render from this object.
   Rule: only facts that are on the CV or the site. Never name the logistics platform. */

export const PROFILE = {
  name: 'Fatih Erdogan',
  headline: 'Software Engineer · Industrial & Logistics Systems · Applied AI',
  positioning:
    'I build software for complex real-world operations, in industrial plants and in logistics, with end-to-end ownership from requirements to production, and I am extending it into production-grade applied AI.',
  location: 'İzmir, Türkiye',
  availability:
    'Open to Software Engineer, Product Engineer, Forward Deployed Engineer and Applied AI Engineer roles. Remote, or on-site/hybrid in Europe.',
  experience_years: '4+ years of professional experience (since June 2022); 3+ years inside a live refinery at SOCAR Türkiye.',
  contact: {
    email: 'fatiherdogann099@gmail.com',
    linkedin: 'https://linkedin.com/in/fatiherdogan09',
    site: 'https://fatiherdogan.dev',
    cv_pdf: 'https://fatiherdogan.dev/fatih-erdogan-cv.pdf',
  },
  languages: ['Turkish (native)', 'English (B2, upper-intermediate)', 'German (A2)', 'Japanese (A1)'],
  education: 'B.Sc. Industrial Engineering, Dokuz Eylül University, İzmir (June 2022).',
  award:
    'Silver Medal, Brandon Hall Group Excellence in Technology Awards, for the Decision Tool (profitability and decision-support platform) at SOCAR Türkiye, delivered as technical lead.',

  experience: [
    {
      role: 'OT MOM/MES Specialist (software engineering for industrial process operations)',
      org: 'SOCAR Türkiye, İzmir',
      period: 'May 2023 to present',
      highlights: [
        'Led and built end to end (excluding the ML model itself) an executive-sponsored procurement cost-optimization platform that estimates target reference prices for materials and services; used by purchasing teams in tenders, bid evaluation and supplier-discount negotiations; running in production.',
        'Designed the human-in-the-loop model-execution interface: it surfaces meaningful outputs at each stage, asks users targeted questions when model confidence is low at critical milestones, and lets them intervene at any point.',
        'Built the workflow engine behind the full request lifecycle: manager routing, team assignment, revision cycles, and full or partial delegation of authority between managers and executors.',
        'Technical lead for the Decision Tool: defined architecture and roadmap for real-time analysis and risk scoring on production process data; Brandon Hall Group Silver Medal.',
        'MES integrations and data pipelines from process and production systems (PHD process-data systems) for real-time production monitoring and executive reporting.',
      ],
    },
    {
      role: 'Founding / sole engineer, B2B logistics platform (name not public)',
      org: 'Independent build, working with a product owner',
      period: 'March 2026 to present, in QA ahead of go-live',
      highlights: [
        'Owns the whole technical side alone: architecture, backend, React web app, React Native (Expo) iOS/Android apps, infrastructure and delivery. More than 2,500 non-merge commits since March 2026.',
        'Shippers, carriers and forwarders run RFQs, bidding, deals and shared operations across road, sea, air and rail.',
        '.NET 10 modular monolith of 13 modules (Identity, Companies, Shipment requests, Bids, Deals, Tracking, Documents, Notifications, Operate workflow engine, Platform admin, Dock scheduling, Changelog, Reference), each with its own PostgreSQL schema and four layers (Domain, Application, Infrastructure, Endpoints): DDD, Clean Architecture, CQRS with MediatR.',
        'Modules never reference each other: synchronous contracts in a shared kernel (read snapshots, idempotent write contracts) and asynchronous domain events through a per-module transactional outbox, dispatched under a PostgreSQL advisory lock to idempotent handlers. No distributed transactions. Architecture tests enforce module isolation, layer direction and more.',
        'Tenant isolation in the database: PostgreSQL row-level security on every tenant table, forced for the owner role, with an app role that cannot bypass it (verified at startup); a coverage ratchet test fails the build if a new table ships without a policy. Integration tests run on real PostgreSQL under the restricted role.',
        'Agentic AI assistant on the Anthropic Messages API: grounded and read-only (the handler reads the tenant\'s own operations and passes them as the only source; record ids are never shown to the model), server-side tools (live location, history, reports, lane intelligence, road routing) running tenant-scoped, model routing (Haiku 4.5 by default, a larger model for planning or tool use), three-tier prompt caching, per-call cost ledger that records counts and dollars, never prompt text, rate limits and a per-company daily quota, chat content marked as data against prompt injection.',
        'Eight further LLM features: cross-language chat translation, message assessment and action extraction, offer explanations, dashboard and workflow drafting, web-search-grounded lane intelligence.',
        'Keycloak (OIDC) with an internal user id mapped on every request, layered authorization (tenant stamp, suspended-company, read-only Viewer, page access, idempotency, rate limits) in a 17-step middleware pipeline; every upload scanned with ClamAV (fail closed) before blob storage, downloads via short-lived signed links; SignalR carries signals, never data, with a Redis backplane for multiple replicas.',
        '3,000+ automated tests (xUnit, Testcontainers PostgreSQL, NetArchTest); Docker and GitHub Actions CI/CD to Azure Container Apps.',
      ],
    },
    {
      role: 'Business Intelligence Analyst',
      org: 'NORM Digital, İzmir',
      period: 'October 2022 to May 2023',
      highlights: [
        'SQL reporting pipelines and ETL workflows from ERP systems feeding Power BI dashboards for financial, operational and sales metrics.',
        'Contributed to AI-driven forecasting for strategic planning.',
        'Supply-chain planning-optimization project on ICRON and SAP data.',
      ],
    },
    {
      role: 'ERP and Operations Specialist',
      org: 'YATSAN, İzmir',
      period: 'June 2022 to October 2022',
      highlights: [
        'ERP-based production planning and inventory management in Microsoft Dynamics; process optimization with manufacturing and planning teams; technical documentation and SolidWorks part models.',
      ],
    },
  ],

  /* ids match the on-page case files, in on-page order */
  case_files: [
    { id: 'procurement', title: 'Procurement Oracle', summary: 'ML-backed target reference pricing for tenders and negotiations, with a human-in-the-loop interface and a workflow engine. Led and built end to end (model aside). In production at SOCAR Türkiye.' },
    { id: 'decision-tool', title: 'Decision Support System', summary: 'Profitability and decision-support platform: real-time analysis and risk scoring on production process data. Technical lead. Brandon Hall Group Silver Medal.' },
    { id: 'logistics', title: 'Logistics Platform', summary: 'B2B freight platform built as the sole engineer: .NET 10 modular monolith, 13 domain modules, 3,000+ tests, React web, React Native mobile, Keycloak, SignalR, Azure. In QA ahead of go-live.' },
    { id: 'applied-ai', title: 'Applied AI Layer', summary: 'The logistics platform\'s AI: Anthropic Messages API tool-use assistant calling live routing tools, model routing, tiered prompt caching, per-tenant cost accounting, plus eight more LLM features.' },
    { id: 'mes', title: 'MES Integrations', summary: 'Refinery-wide MES integrations and data pipelines from process and production systems for real-time monitoring and executive reporting.' },
    { id: 'bi', title: 'BI Pipelines', summary: 'ERP-to-Power BI reporting pipelines, ETL/SSIS/SSAS/DAX, AI forecasting, and supply-chain planning on ICRON and SAP data at NORM Digital.' },
  ],

  skills: {
    'Backend & architecture': 'C#, .NET 10, EF Core, MediatR (CQRS), DDD, modular monolith, domain events, REST APIs, SignalR, RabbitMQ, Redis, workflow engines, Node.js, Express',
    'Applied AI': 'Anthropic Messages API, agentic tool-use loops, model routing, prompt caching, token and cost accounting, web-search grounding, LLM features in production workflows',
    'Frontend & mobile': 'React (Vite), Next.js, TypeScript, React Native (Expo), three.js / WebGL',
    Testing: 'xUnit, Testcontainers, NetArchTest, NSubstitute',
    Data: 'PostgreSQL, SQL, MongoDB, Python, ETL/SSIS, SSAS, DAX, Power BI',
    'Industrial & enterprise': 'MES/MOM integration, PHD process-data systems, ERP (Microsoft Dynamics; SAP and ICRON data), production planning, process analysis',
    'ML in production': 'ML model integration, confidence-aware human-in-the-loop UX, risk scoring on process data',
    'Security & identity': 'Keycloak (OAuth 2.0, OIDC, RBAC), ClamAV, Tesseract OCR',
    'Cloud & DevOps': 'Microsoft Azure (Container Apps, Static Web Apps, Blob Storage), Docker, GitHub Actions',
  },

  /* stated plainly so the agent never has to guess or oversell */
  honest_gaps: [
    'German is A2, so roles that require C1 German are not a fit yet.',
    'English is B2 (upper-intermediate), actively improving.',
    'No production RAG / vector search yet; the AI work so far is tool-use agents, structured LLM features and ML integration.',
    'No formal LLM eval suite in production yet; this is the next step he is working on.',
    'No Kubernetes or Terraform/Bicep in production; deployments have been Docker on Azure Container Apps.',
    'No OPC UA / MQTT / ISA-95 listed on the CV.',
    'The logistics platform is in QA and not yet live with customers.',
    'About 4 years of professional experience, so he does not claim a Senior title; strongest fit is roles asking 3-5 years with real ownership.',
  ],
};

export const caseFile = id => PROFILE.case_files.find(c => c.id === id);

/* plain-text rendering, shared by the agent prompt and /llms.txt */
export function profileText() {
  const p = PROFILE;
  const out = [];
  out.push(`# ${p.name}`, `${p.headline}`, '', p.positioning, '');
  out.push(`Location: ${p.location}`, `Availability: ${p.availability}`, `Experience: ${p.experience_years}`, '');
  out.push(`Contact: ${p.contact.email} · ${p.contact.linkedin} · ${p.contact.site} · CV: ${p.contact.cv_pdf}`, '');
  out.push('## Experience');
  for (const e of p.experience) {
    out.push(`### ${e.role}, ${e.org} (${e.period})`);
    for (const h of e.highlights) out.push(`- ${h}`);
  }
  out.push('', '## Case files on the site');
  for (const c of p.case_files) out.push(`- [${c.id}] ${c.title}: ${c.summary}`);
  out.push('', '## Skills');
  for (const [k, v] of Object.entries(p.skills)) out.push(`- ${k}: ${v}`);
  out.push('', `## Award`, p.award, '', `## Education`, p.education, '', `## Languages`, p.languages.join(', '));
  out.push('', '## Honest gaps', ...p.honest_gaps.map(g => `- ${g}`));
  return out.join('\n');
}
