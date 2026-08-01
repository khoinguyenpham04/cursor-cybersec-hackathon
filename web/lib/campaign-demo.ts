import {
  caseKind,
  filterRepoSessions,
  listSessions,
  newCampaignSessionId,
  saveSession,
  type ReviewSession,
} from "@/lib/sessions";

/** Built-in ledger fixture for the hackathon campaign demo. */
export const DEMO_LEDGER_CASE = "fixture-boiling-frog";

const LEDGER_CASE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function isValidLedgerCaseId(value: string): boolean {
  return LEDGER_CASE_RE.test(value);
}

export function safeLedgerCaseId(value?: string | null): string {
  return value && isValidLedgerCaseId(value) ? value : DEMO_LEDGER_CASE;
}

/** Kickoff text the CampaignOrchestrator skill recognizes for the fixture. */
export function campaignDemoKickoffMessage(
  ledgerCaseId = DEMO_LEDGER_CASE,
): string {
  return `Review ${safeLedgerCaseId(ledgerCaseId)}`;
}

/** Create a campaign case session for a repo and return it (caller navigates). */
export function createCampaignDemoSession(
  owner: string,
  repo: string,
  ledgerCaseId = DEMO_LEDGER_CASE,
): ReviewSession {
  const safe = safeLedgerCaseId(ledgerCaseId);
  const session: ReviewSession = {
    id: newCampaignSessionId(),
    kind: "campaign",
    pr: "",
    title: `Campaign · ${safe}`,
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
  ledgerCaseId = DEMO_LEDGER_CASE,
): ReviewSession | undefined {
  const safe = safeLedgerCaseId(ledgerCaseId);
  return filterRepoSessions(sessions, owner, repo).find(
    (session) =>
      caseKind(session) === "campaign" &&
      safeLedgerCaseId(session.ledgerCaseId) === safe,
  );
}

/**
 * Reuse an open campaign case for this repo+fixture, or create one.
 * Always re-reads localStorage so double-clicks don't duplicate fan-out.
 */
export function ensureCampaignDemoSession(
  owner: string,
  repo: string,
  ledgerCaseId = DEMO_LEDGER_CASE,
): ReviewSession {
  const safe = safeLedgerCaseId(ledgerCaseId);
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
