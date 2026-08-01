# Progress — one-walkthrough demo

Goal: a single, judge-ready path that shows **PR review → repo scan → campaign
page** without dead ends. Update checkboxes as we close items. Keep this file
on `main`.

Last reviewed: 2026-08-01 (case-ingest: demo-self-repo-8-11 bound to Investigate).

---

## Target walkthrough

| # | Beat | Happy path today | Ready? |
|---|---|---|---|
| 1 | **Repo scan** | `/` → **Start demo spine** → Overview → Run scan → Map → Build graph | Mostly |
| 2 | **PR review** | Cases → boiling-frog **#9** (default); #8–#11 listed | Mostly |
| 3 | **Campaign** | **Investigate sequence** → `demo-self-repo-8-11` (#8–#11) → Report + Escalate | Ready |

Script for rehearsals (copy into a runbook slide if needed):

1. Open http://localhost:3000 → **Start demo spine** → **1 · Run scan** → Map → Build graph.
2. Cases → open **#9 · start here** (optional: glance #8/#10/#11).
3. **Investigate sequence** → Orchestration → Report trail **#8→#9→#10→#11** +
   Escalate; Overview shows seeded-case caveat for `demo-self-repo-8-11`.
4. Optional: `cd agent && npm run eval:fixture` beforehand (no LLM burn).

---

## Done (shipped on main)

- [x] Repo workspace: Overview / Map / Dependencies / Cases
- [x] Nested case routes: `/repo/.../case/[caseId]` for review + campaign
- [x] Offline mock PR review (`demo-*` sessions)
- [x] Live PR review via `pr-reviewer` + Diff tab
- [x] Repo scanner agent + Map canvas (`submit_scan`)
- [x] Dependency graph via Next `/api/repo/deps` + OSV
- [x] **Investigate sequence** CTA → campaign session + auto-kickoff
- [x] Campaign UI: extract `submit_campaign`, transcript, prompt, Stop / Re-run
- [x] Case chrome tabs: Overview · Orchestration · Report · Transcript
- [x] Orchestration Plan/Task/Agent from live Flue tools + investigate coverage
- [x] Campaign Overview timeline + fixture caveat + demo PR #8–#11 labels
- [x] Artifact Report + Confirmation Escalate (localStorage, demo-safe)
- [x] Embedded review cases use the same CaseShell tabs
- [x] Ledger fixtures `fixture-boiling-frog` + `demo-self-repo-8-11` + `eval:fixture`
- [x] SELF_REPO Investigate binds to `demo-self-repo-8-11` (trail #8–#11)
- [x] SSR-safe Flue abort, session kind inference, CTA dedupe (PR #6 hardening)
- [x] Root README updated to match wired UI (this pass)

---

## Remaining — walkthrough polish

### P0 — Must close before pitch

- [ ] **Rehearse full path cold** on a clean browser profile; note wall-clock for
      scan + campaign (target: each beat &lt; 2 min with warm models).
- [ ] **Preflight checklist** before demos: agent `/api/health`, keys present,
      `eval:fixture` green, Flue DB not wedged.
- [x] **Surface fixture caveat** clearly on the campaign Overview tab.
- [x] **Pick one canonical live PR** — `#9` (documented under Rehearsal notes).

### P1 — Narrative (makes the product click)

- [x] **Campaign sequence visualization** — Overview timeline + capability deltas
      with demo PR #8–#11 mapping (fixture numbers 412/419/430).
- [x] **Unify branding** — product name **Orca** across shell, home, README.
- [x] **Remove or hide `/dashboard`** shadcn sample from the sidebar.
- [x] **Overview copy** names Scan → Review (#9) → Investigate as the demo spine.
- [x] **Cases quick-links** for live PRs #8–#11 with #9 as demo default.

### P2 — Reliability / depth

- [ ] **Cache or warm** a SELF_REPO scan conversation so Map isn’t a cold LLM
      call mid-pitch (or document “rescan only if empty”).
- [ ] **Offline mock for Map/Deps** (mirror mock-review) so beat 2 survives
      GitHub/model outages.
- [x] **Case ingest path (v1)** — seeded `demo-self-repo-8-11` bound to
      Investigate on SELF_REPO (not runtime GitHub mining).
- [ ] **Runtime GitHub → Case Bundle** mining for arbitrary repos.
- [ ] **Stale agent docs** — `agent/README.md` / `AGENTS.md` still mention
      hello-agent era; align with three mounted routes.

### P3 — Nice-to-have

- [ ] Auth / prod PORT docs if deploying beyond localhost
- [ ] Postgres option exercised once for durability story
- [ ] Second campaign fixture (different composition pattern)

---

## Known constraints (don’t fight mid-demo)

| Constraint | Implication |
|---|---|
| Campaign facts = seeded bundles | SELF_REPO → `demo-self-repo-8-11`; don’t claim runtime GitHub mining |
| Scan needs model + GitHub | Prefer SELF_REPO; have mock review as beat-1 backup |
| Deps need lockfile fetch | Public repos work best; token helps rate limits |
| No agent auth | Localhost only unless middleware added |
| Prod defaults | Agent `npm start` and web both like `:3000` — set `PORT` |

---

## Rehearsal notes

_Fill in as we practice._

| Date | Path | Wall time | Failures / fixes |
|---|---|---|---|
| | Demo review → SELF_REPO scan → Investigate sequence | | |

**Canonical live PR (beat 2):** `#9` (transitive postinstall)

**Owners:** `_tbd_`

---

## Suggested next PR slices

1. ~~`ui/brand-cleanup`~~ / ~~seeded case bind~~ — done.
2. Rehearse cold + fill Rehearsal notes (P0).
3. `demo/offline-scan` — mock Map/Deps for zero-network pitch.
4. Runtime GitHub → Case Bundle mining.
