---
name: repo-scanner
description: Produce a shareable "codebase scan" of a repository — a map of how the codebase works and how it uses AI. Investigate through the repo tools, then deliver the scan as ONE submit_scan tool call. You produce only the data; a fixed renderer draws the map. Write no HTML, CSS, or pasted JSON.
---

# Codebase Scan

Analyze the repository and produce a map of how the codebase works and how it
uses AI. You produce only the data — the `submit_scan` tool input; the app's
renderer draws the scan. Write no HTML or CSS, and never paste the scan JSON
into chat.

## How to investigate

- Start with `ingest_repo` — it returns the repo's metadata, file counts, key
  files (manifests, README, CI, framework configs), and manifest highlights.
- Use `repo_tree` to see structure, `read_repo_file` for targeted reads of
  entrypoints and configs, and `search_repo` to trace names across the files
  you've read. Prefer a few targeted reads over guessing.
- Find where AI runs: agent loops and directives ('use agent', generateText /
  streamText / generateObject, @ai-sdk/* providers), tool definitions
  (defineTool, tool({...})), skills, model identifiers.
- Identify the models and their provider (OpenAI, Anthropic, Google, …).
- Identify tools models can call (search APIs, scrapers, DB queries, internal
  functions) and external integrations/services.
- Map the business logic too: the internal services/pipelines the product is
  built from (billing, ingestion, background workers, domain services) — these
  become "service" nodes, and the interesting sentence goes on the edge
  (e.g. "charges Stripe on trial end").
- Map the main flows: entry points (routes, webhooks, pages, CLIs), scheduled
  jobs (crons/queues/workers), the agents, the models/tools they use, and the
  datastores/services they read and write.

## Output

Deliver the scan by calling `submit_scan` exactly once. The tool's input
schema is the contract — project info, nodes, edges, optional stats and
top-lists. After it succeeds, reply with at most one short closing sentence.
Answer follow-up questions in chat from what you already investigated; never
call submit_scan a second time unless explicitly asked to rescan.

## Rules (these keep every scan consistent — do not break them)

- Caps: topModels <= 3, topTools <= 10, topIntegrations <= 10, nodes <= 60,
  edges <= 120. One map holds everything — AI flows AND business logic.
  Big maps are welcome (the viewer pans); aim for 20-40 nodes on a substantial
  codebase. Rich, not sparse — but every node must earn its place.
- Give every distinct agent its OWN node when there are <= 10 agents; only
  merge agents into one node when they are numerous and near-identical (then
  say so in sub, e.g. "12 near-identical scrapers"). Chain agents with
  agent->agent edges when one feeds the next.
- group (optional, <=24 chars): tag related nodes with a shared group name —
  those nodes render as one labeled vertical stack. Group by feature/domain
  the way a team would say it ("Billing", "Ingestion", "Setup pipeline"),
  not by file layout. Use 2-3 groups of 3-6 nodes; leave hub-and-spoke nodes
  ungrouped.
- Node labels <= 28 chars, sub <= 40, edge labels <= 24.
- kind is one of: entry (trigger/route/page/CLI), cron (scheduled job), agent,
  model, tool, service (internal business-logic module/pipeline the project
  owns), store (DB/cache/index), external (3rd-party API).
- Edge kind (optional): "calls" | "reads" | "writes" | "triggers" — what the
  connection does. Prefer setting it; it's shown quietly (revealed when a flow
  is traced). Add a label only when a specific phrase says more (e.g. "charges
  on trial end" — put the business logic on edges); labels are always visible.
- domain is a favicon domain with no scheme (openai.com, anthropic.com,
  exa.ai). Add it to anything a recognizable company/product owns; omit it for
  purely internal nodes (entries, crons, services, internal tools). Use the
  product domain for models (gemini.google.com for Gemini, claude.ai for
  Claude).
- detail (optional, <=200) is shown when a node is clicked — one sentence of
  what it does. sourceRef (optional, <=120) is the repo path (plus :line)
  where the node lives, e.g. "src/agents/support.ts:42" — add it to internal
  nodes so teammates can jump to code.
- Every edge's from/to must reference an existing node id; ids unique. The
  tool rejects violations — fix and resubmit.
- Use today's date for project.date, and the repository name for
  project.name/slug.
