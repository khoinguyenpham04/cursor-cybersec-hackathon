# PR Reviewer

AI code review for GitHub pull requests — a [Flue](https://flueframework.com) agent with a
Codex-style Next.js UI.

Paste a PR link, and the agent fetches the diff, reviews every change with
Claude, and streams back findings with severities and `path:line` references.
Ask follow-up questions in the same conversation; switch to the Diff tab to
read the change yourself.

## Structure

```
agent/   Flue agent server (Hono + Vite, Node target)
  src/agents/pr-reviewer.ts   the PrReviewer agent (model + system prompt)
  src/tools/github.ts         fetch_pr / fetch_pr_diff / fetch_file tools
  src/app.ts                  route map — mounts /agents/pr-reviewer

web/     Next.js app (App Router, shadcn/ui, Vercel AI Elements)
  components/review/          session sidebar, transcript, diff viewer
  app/api/github/pr/          server route backing the Diff tab
  next.config.ts              proxies /api/agents/* → the Flue server
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
# cursor-cybersec-hackathon
