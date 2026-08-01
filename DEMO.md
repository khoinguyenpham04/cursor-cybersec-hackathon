# Demo runbook — boiling-frog campaign

One walkthrough: **scan the repo → review four “green” PRs → investigate the campaign**.

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

1. Home → **Scan this app’s own repo** (or paste `khoinguyenpham04/cursor-cybersec-hackathon`).
2. Overview → **Run scan** → show Map.
3. **Build graph** → Dependencies (mention `demo/payments-api` when visible).

**Say:** “We ingest the repo once, then keep Map/Deps as durable context.”

### Beat 2 — Review the sequence

Open each PR as a **live review** in the product (`owner/repo#N`):

1. **#8** — Approve-ish / low signal. “Looks like a helper.”
2. **#9** — Still no CVE on the direct dep. Point at transitive **postinstall**.
3. **#10** — Workflow blast radius: write + OIDC + billing secret.
4. **#11** — Helper now sits on the billing / token path.

**Say:** “Each PR alone is plausible. The risk is the trail.”

Backup if models/GitHub flake: Home → **Demo review** (offline mock).

### Beat 3 — Campaign

1. Same repo → Overview or Cases → **Investigate sequence**.
2. Wait for `submit_campaign`.
3. Walk **score**, **trail**, **recommended actions**, and specialist tools in the transcript.

**Say (important):** Campaign facts today come from the ledger fixture (`fixture-boiling-frog`), which matches this PR story. Live ingest of GitHub PR history is the next product step — these four PRs are the substrate we scan/review now and will bind later.

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
- Claim the campaign page is mining these live PRs yet (fixture caveat)
- Merge the demo PRs into `main` mid-pitch if it confuses the product tree
- Run `quiet-utils` postinstall against anything sensitive (it only `console.log`s)

---

## After the pitch (optional)

- [ ] Wire case ingest so Investigate sequence uses PR #8–#11 numbers
- [ ] Campaign timeline UI (PR sequence viz next to the score)
- [ ] Tiny root CI: `eval:fixture` + web typecheck (not required for the demo)
- [ ] Brand cleanup / remove `/dashboard` sample
