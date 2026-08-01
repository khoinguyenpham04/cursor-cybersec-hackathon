# Orca

Multi-agent [Flue](https://flueframework.com) product that **orchestrates**
repo scan, PR review, and **supply-chain campaign detection across PR
sequences** — composition that single-PR scanners miss.

**Scan → Review → Investigate:** map a repo, open one green PR, then run the
campaign case (`fixture-boiling-frog`) for scored policy actions.

Walkthrough status: [`PROGRESS.md`](./PROGRESS.md) · Runbook: [`DEMO.md`](./DEMO.md).

## Demo walkthrough (one pass)

With both servers running (below):

1. **Scan** — http://localhost:3000 → **Start demo spine** → Overview →
   **1 · Run scan** → Map → **Build graph**.
2. **Review** — Cases → open live PR **#9** (demo default; #8–#11 listed).
3. **Investigate** — **Investigate sequence** → Orchestration → Report +
   Escalate. Overview tab explains the fixture ↔ #8–#11 mapping.

Offline backup (wrong story for the pitch): home → **Offline review backup**.

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
