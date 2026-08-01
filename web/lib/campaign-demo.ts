import {
  caseKind,
  filterRepoSessions,
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

/** Kickoff text the CampaignOrchestrator skill recognizes for the fixture. */
export function campaignDemoKickoffMessage(
  ledgerCaseId = DEMO_LEDGER_CASE,
): string {
  const safe = isValidLedgerCaseId(ledgerCaseId)
    ? ledgerCaseId
    : DEMO_LEDGER_CASE;
  return `Review ${safe}`;
}

/** Create a campaign case session for a repo and return it (caller navigates). */
export function createCampaignDemoSession(
  owner: string,
  repo: string,
  ledgerCaseId = DEMO_LEDGER_CASE,
): ReviewSession {
  const safe = isValidLedgerCaseId(ledgerCaseId)
    ? ledgerCaseId
    : DEMO_LEDGER_CASE;
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
  const safe = isValidLedgerCaseId(ledgerCaseId)
    ? ledgerCaseId
    : DEMO_LEDGER_CASE;
  return filterRepoSessions(sessions, owner, repo).find(
    (session) =>
      caseKind(session) === "campaign" &&
      (session.ledgerCaseId ?? DEMO_LEDGER_CASE) === safe,
  );
}

/** Reuse an open campaign case for this repo+fixture, or create one. */
export function ensureCampaignDemoSession(
  sessions: ReviewSession[],
  owner: string,
  repo: string,
  ledgerCaseId = DEMO_LEDGER_CASE,
): ReviewSession {
  return (
    findOpenCampaignDemo(sessions, owner, repo, ledgerCaseId) ??
    createCampaignDemoSession(owner, repo, ledgerCaseId)
  );
}

export function campaignCasePath(
  owner: string,
  repo: string,
  caseId: string,
): string {
  return `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/case/${encodeURIComponent(caseId)}`;
}
