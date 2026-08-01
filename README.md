# Supply-chain campaign detector

Multi-agent [Flue](https://flueframework.com) product that maps a repository,
reviews individual PRs, and detects **open-source supply-chain campaigns across
PR sequences** — composition that single-PR scanners miss.

**Ingest → Orchestrate → Act:** scan a repo, investigate a fixture campaign
(`fixture-boiling-frog`), and surface scored policy actions in the UI.

Walkthrough status and remaining work: see [`PROGRESS.md`](./PROGRESS.md).

## Demo walkthrough (one pass)

With both servers running (below):

1. **PR review** — Open http://localhost:3000 → **Demo review** (offline mock,
   no API keys). Or paste a live `owner/repo#N` for a real Flue review.
2. **Repo scan** — Home → **Scan this app’s own repo** (or paste `owner/repo`)
   → Overview → **Run scan** (Map) → **Build graph** (Dependencies).
3. **Campaign** — Overview or Cases → **Investigate sequence** → wait for
   `submit_campaign` → score, trail, recommended actions + transcript.

Safety net (no LLM): `cd agent && npm run eval:fixture`.

## Agents

| Route | Role |
|---|---|
| `/agents/repo-scanner` | Ingest + architecture map (`submit_scan`) |
| `/agents/pr-reviewer` | Single-PR adversarial review (`submit_review`) |
| `/agents/campaign-orchestrator` | Thin parent + specialists over a Risk Ledger; fan-out via `investigate_case` → `submit_campaign` |

Orchestrate reads **Case Bundles** from `agent/src/ledger`. Ingest owns writing
real cases later; today the shipped fixture is `fixture-boiling-frog`
(PRs 412 → 419 → 430 on `acme/payments-api`).

`investigate_case` is the control plane: it dispatches specialists (via harness
`task`), **verifies ledger-backed coverage for that run**, persists an
`InvestigationPacket`, and `submit_campaign` only accepts `{ caseId, runId }`
(draft fields are loaded server-side).

## Structure

```
agent/   Flue agent server (Hono + Vite, Node target) — :5173
  src/agents/repo-scanner.ts
  src/agents/pr-reviewer.ts
  src/agents/campaign-orchestrator.ts
  src/tools/investigate.ts          durable + harness fan-out control plane
  src/subagents/                    graph / provenance / ci / composer
  src/ledger/                       Case Bundle + Claim contract + fixtures
  src/app.ts                        mounts all three agent routes

web/     Next.js app (App Router, shadcn/ui, AI Elements) — :3000
  app/page.tsx                      home: new scan / PR / demo review
  app/repo/[owner]/[repo]/          Overview · Map · Dependencies · Cases
  app/repo/.../case/[caseId]/       nested PR review or campaign case
  components/repo/                  workspace, map, deps, campaign UI
  components/review/                transcript, diff, report
  lib/campaign.ts                   extract submit_campaign for the UI
  lib/campaign-demo.ts              Investigate sequence helper (fixture)
```

The browser talks only to Next.js. `useFlueAgent` opens conversations at
`/api/agents/<agent>/<session-id>`, rewritten to the Flue server — same origin,
no CORS. Conversations are durable: reloading replays history from Flue.

## Setup

1. **Agent** — add keys to `agent/.env`:

   ```
   ANTHROPIC_API_KEY="sk-ant-..."   # required for live agents
   GITHUB_TOKEN="github_pat_..."    # optional: private repos + higher rate limits
   ```

   Optional model overrides: `PR_REVIEWER_MODEL`, `REPO_SCANNER_MODEL`,
   `CAMPAIGN_ORCHESTRATOR_MODEL`, `CAMPAIGN_DISPATCH_MODEL`.

2. **Web** — `web/.env.local`:

   ```
   FLUE_SERVER_URL=http://localhost:5173
   GITHUB_TOKEN=github_pat_...      # optional: Diff tab + dependency graph
   ```

| Beat | Needs model key | Needs GitHub token |
|---|---|---|
| Demo PR review (mock) | no | no |
| Live PR review | yes | optional |
| Repo scan (Map) | yes | recommended |
| Dependencies graph | no | recommended |
| Campaign Investigate sequence | yes | no (fixture) |

## Run

```bash
# terminal 1 — Flue agent server on :5173
cd agent && npm install && npm run dev

# terminal 2 — Next.js app on :3000
cd web && npm install && npm run dev
```

Open http://localhost:3000.

CLI without the UI:

```bash
cd agent
npx flue run src/agents/campaign-orchestrator.ts --message "Review fixture-boiling-frog"
npx flue run src/agents/pr-reviewer.ts --message "Review vercel/next.js#96436"
npm run eval:fixture   # deterministic ledger contract, no LLM
```

Health check: `curl -s http://localhost:5173/api/health`.

## Production

```bash
cd agent && npm run build && PORT=5173 npm start   # dist/server.mjs
cd web && npm run build && FLUE_SERVER_URL=… npm start
```

Conversations live in SQLite at `agent/data/flue.db` (see `agent/src/db.ts` to
swap Postgres). The agent router has no built-in auth — add middleware in
`agent/src/app.ts` before exposing it beyond localhost.
