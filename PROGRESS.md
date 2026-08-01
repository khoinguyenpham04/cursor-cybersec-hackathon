# Progress — one-walkthrough demo

Goal: a single, judge-ready path that shows **PR review → repo scan → campaign
page** without dead ends. Update checkboxes as we close items. Keep this file
on `main`.

Last reviewed: 2026-08-01 (cases-surface PR — case tabs + escalate).

---

## Target walkthrough

| # | Beat | Happy path today | Ready? |
|---|---|---|---|
| 1 | **PR review** | `/` → Demo review (mock) **or** paste live `owner/repo#N` → nested case | Mostly |
| 2 | **Repo scan** | `/` → Scan this app’s own repo → Overview → Run scan → Map → Build graph → Deps | Mostly |
| 3 | **Campaign** | Overview/Cases → **Investigate sequence** → case tabs (Orchestration → Report + Escalate) | Ready |

Script for rehearsals (copy into a runbook slide if needed):

1. Open http://localhost:3000 — start **Demo review**, show findings + Diff.
2. Back home → **Scan this app’s own repo** → Overview status cards.
3. **Run scan** → Map canvas → **Build graph** → Dependencies.
4. **Investigate sequence** → Orchestration → Report + Escalate; Overview shows
   fixture caveat and demo PR #8–#11 mapping.
5. Optional: `cd agent && npm run eval:fixture` beforehand (no LLM burn).

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
- [x] Ledger fixture `fixture-boiling-frog` + `npm run eval:fixture`
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
- [ ] **Pick one canonical live PR** for the non-mock review beat; document it
      in this file under “Rehearsal notes”.

### P1 — Narrative (makes the product click)

- [x] **Campaign sequence visualization** — Overview timeline + capability deltas
      with demo PR #8–#11 mapping (fixture numbers 412/419/430).
- [ ] **Unify branding** — sidebar still says “PR Reviewer”; home says “New
      scan”. One product name across shell + README.
- [ ] **Remove or hide `/dashboard`** shadcn sample from the sidebar (“Dashboard
      demo”) so the walkthrough has no dead turns.
- [ ] **Overview copy** that names the three beats in order (Review → Scan →
      Campaign) as the intended demo spine.

### P2 — Reliability / depth

- [ ] **Cache or warm** a SELF_REPO scan conversation so Map isn’t a cold LLM
      call mid-pitch (or document “rescan only if empty”).
- [ ] **Offline mock for Map/Deps** (mirror mock-review) so beat 2 survives
      GitHub/model outages.
- [ ] **Case ingest path** (even a second fixture or JSON upload) so “Ingest”
      isn’t only a README word.
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
| Campaign facts = fixture only | URL repo is a bookmark shell; don’t claim live PR mining yet |
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

**Canonical live PR (optional beat 1):** `_tbd_`

**Owners:** `_tbd_`

---

## Suggested next PR slices

1. `docs/walkthrough` — this file + README (done when committed).
2. `ui/campaign-timeline` — PR sequence viz from boiling-frog fixture.
3. `ui/brand-cleanup` — rename shell, remove dashboard demo link.
4. `demo/offline-scan` — mock Map/Deps path for zero-network pitch.
5. `ingest/fixture-loader` — second case or upload tool for “real ingest” story.
