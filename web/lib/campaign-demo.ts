import { SELF_REPO } from "@/lib/repos";
import {
  caseKind,
  filterRepoSessions,
  listSessions,
  newCampaignSessionId,
  saveSession,
  type ReviewSession,
} from "@/lib/sessions";

/** Classic offline acme fixture (3 synthetic PRs). */
export const DEMO_LEDGER_CASE = "fixture-boiling-frog";

/** Product-repo sequence bound to live demo PRs #8–#11. */
export const SELF_REPO_LEDGER_CASE = "demo-self-repo-8-11";

const LEDGER_CASE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function isValidLedgerCaseId(value: string): boolean {
  return LEDGER_CASE_RE.test(value);
}

export function safeLedgerCaseId(value?: string | null): string {
  return value && isValidLedgerCaseId(value) ? value : DEMO_LEDGER_CASE;
}

/**
 * Pick the ledger case for Investigate sequence.
 * SELF_REPO → demo-self-repo-8-11 (PRs #8–#11). Other repos fall back to the
 * classic fixture until arbitrary-repo ingest exists.
 */
export function ledgerCaseIdForRepo(owner: string, repo: string): string {
  if (
    owner.toLowerCase() === SELF_REPO.owner.toLowerCase() &&
    repo.toLowerCase() === SELF_REPO.repo.toLowerCase()
  ) {
    return SELF_REPO_LEDGER_CASE;
  }
  return DEMO_LEDGER_CASE;
}

/** Kickoff text the CampaignOrchestrator skill recognizes. */
export function campaignDemoKickoffMessage(ledgerCaseId?: string | null): string {
  return `Review ${safeLedgerCaseId(ledgerCaseId)}`;
}

/** Create a campaign case session for a repo and return it (caller navigates). */
export function createCampaignDemoSession(
  owner: string,
  repo: string,
  ledgerCaseId?: string,
): ReviewSession {
  const safe = safeLedgerCaseId(
    ledgerCaseId ?? ledgerCaseIdForRepo(owner, repo),
  );
  const session: ReviewSession = {
    id: newCampaignSessionId(),
    kind: "campaign",
    pr: "",
    title:
      safe === SELF_REPO_LEDGER_CASE
        ? "Campaign · PRs #8–#11"
        : `Campaign · ${safe}`,
    createdAt: Date.now(),
    repo: `${owner}/${repo}`,
    ledgerCaseId: safe,
  };
  saveSession(session);
  return session;
}

export function findOpenCampaignDemo(
  sessions: ReviewSession[],
  owner: string,
  repo: string,
  ledgerCaseId?: string,
): ReviewSession | undefined {
  const safe = safeLedgerCaseId(
    ledgerCaseId ?? ledgerCaseIdForRepo(owner, repo),
  );
  return filterRepoSessions(sessions, owner, repo).find(
    (session) =>
      caseKind(session) === "campaign" &&
      safeLedgerCaseId(session.ledgerCaseId) === safe,
  );
}

/**
 * Reuse an open campaign case for this repo+case, or create one.
 * Uses a fresh sessions snapshot (in-memory cache after save) so same-tab
 * double-clicks don't duplicate fan-out.
 */
export function ensureCampaignDemoSession(
  owner: string,
  repo: string,
  ledgerCaseId?: string,
): ReviewSession {
  const safe = safeLedgerCaseId(
    ledgerCaseId ?? ledgerCaseIdForRepo(owner, repo),
  );
  return (
    findOpenCampaignDemo(listSessions(), owner, repo, safe) ??
    createCampaignDemoSession(owner, repo, safe)
  );
}

export function campaignCasePath(
  owner: string,
  repo: string,
  caseId: string,
): string {
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/case/${encodeURIComponent(caseId)}`;
}
