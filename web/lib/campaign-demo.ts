import {
  newCampaignSessionId,
  saveSession,
  type ReviewSession,
} from "@/lib/sessions";

/** Built-in ledger fixture for the hackathon campaign demo. */
export const DEMO_LEDGER_CASE = "fixture-boiling-frog";

/** Kickoff text the CampaignOrchestrator skill recognizes for the fixture. */
export function campaignDemoKickoffMessage(ledgerCaseId = DEMO_LEDGER_CASE): string {
  return `Review ${ledgerCaseId}`;
}

/** Create a campaign case session for a repo and return it (caller navigates). */
export function createCampaignDemoSession(
  owner: string,
  repo: string,
  ledgerCaseId = DEMO_LEDGER_CASE,
): ReviewSession {
  const session: ReviewSession = {
    id: newCampaignSessionId(),
    kind: "campaign",
    pr: "",
    title: `Campaign · ${ledgerCaseId}`,
    createdAt: Date.now(),
    repo: `${owner}/${repo}`,
    ledgerCaseId,
  };
  saveSession(session);
  return session;
}

export function campaignCasePath(
  owner: string,
  repo: string,
  caseId: string,
): string {
  return `/repo/${owner}/${repo}/case/${caseId}`;
}
