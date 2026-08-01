# Demo runbook — Orca / boiling-frog campaign

Product: **Orca** — orchestrate scan → review → campaign investigation.

One walkthrough: **scan the repo → review PR #9 (default) → investigate the campaign**.

User story: [#7](https://github.com/khoinguyenpham04/cursor-cybersec-hackathon/issues/7)  
Product tracker: [`PROGRESS.md`](./PROGRESS.md) · Setup: [`README.md`](./README.md)

---

## What we’re proving

Single-PR scanners say each change looks fine. Across the sequence, composition introduces:

1. A transitive **postinstall** (install-time execution)
2. **CI write + billing secret** in Actions
3. First use of the helper on a path that **touches customer tokens**

That’s the boiling-frog story — not a CVE dump.

---

## Demo substrate (4 stacked draft PRs)

All code lives under `demo/payments-api/` (local `file:` packages only — nothing published to npm).

| Step | PR | Title | Alone looks like | What actually lands |
|---|---|---|---|---|
| 1 | [#8](https://github.com/khoinguyenpham04/cursor-cybersec-hackathon/pull/8) | `chore(deps): add http-helper…` | Harmless helper | Direct `http-helper@1.0.0`, no install scripts |
| 2 | [#9](https://github.com/khoinguyenpham04/cursor-cybersec-hackathon/pull/9) | `chore(deps): bump http-helper…` | Routine bump | Bump to `1.2.0` + transitive `quiet-utils@0.4.1` **with postinstall** |
| 3 | [#10](https://github.com/khoinguyenpham04/cursor-cybersec-hackathon/pull/10) | `ci: speed up release workflow` | CI cleanup | `contents:write` + `id-token:write` + `BILLING_API_KEY` in a shell step |
| 4 | [#11](https://github.com/khoinguyenpham04/cursor-cybersec-hackathon/pull/11) | `feat(billing): wire http-helper…` | Product feature | Helper used on billing sync with customer tokens |

**Stack:** #9 → #8 → `main`, #10 → #9, #11 → #10.

Mirrors ledger fixture: `agent/src/ledger/fixtures/boiling-frog.json` (`fixture-boiling-frog`).

---

## Before you start

```bash
# terminal 1 — Flue :5173
cd agent && npm run dev

# terminal 2 — Next :3000
cd web && npm run dev
```

Open http://localhost:3000

| Check | Command / action |
|---|---|
| Agent up | `curl -s http://localhost:5173/api/health` → `{"ok":true}` |
| Ledger contract (no LLM) | `cd agent && npm run eval:fixture` |
| Keys | `ANTHROPIC_API_KEY` in `agent/.env` for live scan/review/campaign; mock review needs none |
| Optional | `GITHUB_TOKEN` in `web/.env.local` for Diff + deps rate limits |

| Beat | Needs model | Needs GitHub token |
|---|---|---|
| Demo PR review (mock) | no | no |
| Live review of #8–#11 | yes | recommended |
| Repo scan (Map) | yes | recommended |
| Dependencies graph | no | recommended |
| Investigate sequence | yes | no (uses fixture) |

---

## Script (≈ 8–12 minutes)

### Beat 1 — Repo scan

1. Home → **Start demo spine** (or paste `khoinguyenpham04/cursor-cybersec-hackathon`).
2. Overview → **1 · Run scan** → show Map.
3. **Build graph** → Dependencies.

**Say:** “We ingest the repo once, then keep Map/Deps as durable context.”

### Beat 2 — Review one green PR

1. Cases → boiling-frog sequence → open **#9 · start here** (transitive postinstall).
2. Optional deep dive: #8 / #10 / #11 from the same list (or GitHub tabs).

**Say:** “Alone it looks fine. The risk is the trail.”

Backup if models/GitHub flake: Home → **Offline review backup** (mock; not the campaign story).

### Beat 3 — Campaign (case surface)

1. Same repo → **3 · Investigate sequence** (Overview) or Cases → **Investigate sequence**.
2. Case opens on **Orchestration** — watch `load_fixture_case` → `investigate_case` → specialists (from coverage) → `submit_campaign`.
3. Auto-lands on **Report** — walk score, trail, narrative, recommended actions; click **Escalate** (demo-safe, not sent to GitHub).
4. **Overview** tab — seeded-case caveat + native timeline **#8→#9→#10→#11**.
5. **Transcript** remains the escape hatch if you need to nudge the agent.

**Say (important):** Campaign facts come from the seeded ledger case `demo-self-repo-8-11` (trail matches these PRs). Not runtime GitHub mining yet — that is the next product step.

Optional safety net beforehand: `cd agent && npm run eval:fixture`.

---

## One-liner for judges

> We don’t stop at “is this PR bad?” — we detect when a sequence of green PRs composes into install-time execution, privileged CI, and secret contact.

---

## File map

```
demo/payments-api/
  package.json / package-lock.json
  packages/http-helper/     # PR1 → PR2 bump
  packages/quiet-utils/     # PR2 postinstall
  .github/workflows/release.yml   # PR3 (demo path; not root CI)
  src/lib/http.ts           # PR1 wrapper
  src/billing/sync.ts       # PR4
```

---

## Do / don’t

**Do**
- Keep all four PRs as **drafts** until you’re ready to merge a demo branch
- Rehearse cold once; note wall-clock in `PROGRESS.md`
- Use #8–#11 as the canonical live review targets

**Don’t**
- Claim the campaign page is mining these live PRs at runtime (seeded bundle)
- Merge the demo PRs into `main` mid-pitch if it confuses the product tree
- Run `quiet-utils` postinstall against anything sensitive (it only `console.log`s)

---

## After the pitch (optional)

- [x] Seeded case `demo-self-repo-8-11` bound to Investigate on this product repo
- [ ] Runtime GitHub PR mining into Case Bundles
- [x] Campaign case tabs (Overview · Orchestration · Report · Transcript) + escalate
- [ ] Tiny root CI: `eval:fixture` + web typecheck (not required for the demo)
- [x] Brand as Orca / hide `/dashboard` / Cases #8–#11 quick-links
