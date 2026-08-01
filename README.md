# Supply-chain campaign orchestrator (+ PR reviewer)

Multi-agent [Flue](https://flueframework.com) system that detects **open-source
supply-chain campaigns across PR sequences**, plus the original single-PR
adversarial reviewer.

## Agents

| Route | Role |
|---|---|
| `/agents/campaign-orchestrator` | Thin parent + specialists over a shared Risk Ledger; fan-out enforced by `investigate_case` (durable + harness) |
| `/agents/pr-reviewer` | Original single-PR adversarial code review |

Orchestrate reads **Case Bundles** from `agent/src/ledger` (facts). Ingest owns
writing real cases; this branch ships a fixture (`fixture-boiling-frog`) so the
orchestrator can be developed in parallel. Specialist parallelism is
**control-plane enforced** via `investigate_case`, not prompt-hoped `task` calls.

```bash
# terminal 1
cd agent && npm install && npm run dev

# demo campaign (CLI)
cd agent
npx flue run src/agents/campaign-orchestrator.ts --message "Review fixture-boiling-frog"

# deterministic contract check (no LLM)
npm run eval:fixture
```

## Structure

```
agent/   Flue agent server (Hono + Vite, Node target)
  src/agents/campaign-orchestrator.ts   thin campaign parent
  src/tools/investigate.ts              durable+harness fan-out control plane
  src/subagents/                        graph / provenance / ci / composer
  src/ledger/                           Case Bundle + Claim contract + fixtures
  src/agents/pr-reviewer.ts             single-PR adversarial reviewer
  src/app.ts                            mounts both agent routes

web/     Next.js app (App Router, shadcn/ui, Vercel AI Elements)
  lib/campaign.ts             extract submit_campaign from the stream
  components/review/          session sidebar, transcript, diff viewer
```

The browser talks only to Next.js. `useFlueAgent` (from `@flue/react`) opens the
conversation at `/api/agents/pr-reviewer/<session-id>`, which Next.js rewrites
to the Flue server — same origin, no CORS. Conversations are durable: reloading
the page replays history from the Flue event stream.

## Setup

1. **Agent** — add keys to `agent/.env`:

   ```
   ANTHROPIC_API_KEY="sk-ant-..."   # required (or any Pi-supported provider)
   GITHUB_TOKEN="github_pat_..."    # optional: private repos + higher rate limits
   ```

   The agent uses `anthropic/claude-opus-5` (see `src/agents/pr-reviewer.ts` to change it).

2. **Web** — optionally add `GITHUB_TOKEN` to `web/.env.local` too (it powers the
   Diff tab). `FLUE_SERVER_URL` defaults to `http://localhost:5173`.

## Run

```bash
# terminal 1 — Flue agent server on :5173
cd agent && npm install && npm run dev

# terminal 2 — Next.js app on :3000
cd web && npm install && npm run dev
```

Open http://localhost:3000 and paste a PR link.

You can also talk to the agent without the UI:

```bash
cd agent
npx flue run src/agents/pr-reviewer.ts --message "Review vercel/next.js#96436"
```

## Production

```bash
cd agent && npm run build && npm start        # dist/server.mjs on :3000 (PORT to change)
cd web && npm run build && npm start          # set FLUE_SERVER_URL to the agent's URL
```

The agent stores conversations in SQLite at `agent/data/flue.db` (see
`agent/src/db.ts` to swap in Postgres). The agent router has no built-in auth —
add middleware in `agent/src/app.ts` before exposing it beyond localhost.
