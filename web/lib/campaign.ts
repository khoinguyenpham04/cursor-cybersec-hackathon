// Client-side mirror of agent/src/lib/campaign-schema.ts.
// CampaignOrchestrator delivers results as a `submit_campaign` tool call.

import type { FlueConversationMessage } from "@flue/react";

export type CampaignVerdict = "approve" | "comment" | "request_changes";
export type CampaignSeverity = "critical" | "high" | "medium" | "low";
export type PolicyAction =
  | "pin"
  | "quarantine"
  | "require_dual_review"
  | "revert_sequence"
  | "block_merge";

export interface RecommendedAction {
  action: PolicyAction;
  target: string;
  rationale: string;
  priority: CampaignSeverity;
}

export interface CampaignResult {
  caseId: string;
  verdict: CampaignVerdict;
  campaignScore: number;
  trail: number[];
  narrative: string;
  claimIds: string[];
  recommendedActions: RecommendedAction[];
  headline?: string;
  topSeverity?: CampaignSeverity;
}

export const SUBMIT_CAMPAIGN_TOOL = "submit_campaign";

const VERDICTS: CampaignVerdict[] = ["approve", "comment", "request_changes"];
const SEVERITIES: CampaignSeverity[] = ["critical", "high", "medium", "low"];
const ACTIONS: PolicyAction[] = [
  "pin",
  "quarantine",
  "require_dual_review",
  "revert_sequence",
  "block_merge",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAction(value: unknown): RecommendedAction | null {
  if (!isRecord(value)) return null;
  if (!ACTIONS.includes(value.action as PolicyAction)) return null;
  if (typeof value.target !== "string" || typeof value.rationale !== "string") {
    return null;
  }
  const priority = SEVERITIES.includes(value.priority as CampaignSeverity)
    ? (value.priority as CampaignSeverity)
    : "medium";
  return {
    action: value.action as PolicyAction,
    target: value.target,
    rationale: value.rationale,
    priority,
  };
}

export function parseCampaign(input: unknown): CampaignResult | null {
  if (!isRecord(input)) return null;
  if (!VERDICTS.includes(input.verdict as CampaignVerdict)) return null;
  if (typeof input.caseId !== "string") return null;
  if (typeof input.narrative !== "string") return null;
  if (typeof input.campaignScore !== "number") return null;
  if (!Array.isArray(input.trail)) return null;
  const trail = input.trail.filter((n): n is number => typeof n === "number");
  if (!trail.length) return null;
  const claimIds = Array.isArray(input.claimIds)
    ? input.claimIds.filter((id): id is string => typeof id === "string")
    : [];
  const recommendedActions = (
    Array.isArray(input.recommendedActions) ? input.recommendedActions : []
  )
    .map(parseAction)
    .filter((a): a is RecommendedAction => a !== null);
  if (!recommendedActions.length) return null;
  return {
    caseId: input.caseId,
    verdict: input.verdict as CampaignVerdict,
    campaignScore: Math.max(0, Math.min(100, input.campaignScore)),
    trail,
    narrative: input.narrative,
    claimIds,
    recommendedActions,
    headline: typeof input.headline === "string" ? input.headline : undefined,
    topSeverity: SEVERITIES.includes(input.topSeverity as CampaignSeverity)
      ? (input.topSeverity as CampaignSeverity)
      : undefined,
  };
}

export function extractCampaign(
  messages: FlueConversationMessage[],
): CampaignResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j];
      if (part.type !== "dynamic-tool") continue;
      if (part.toolName !== SUBMIT_CAMPAIGN_TOOL) continue;
      const campaign = parseCampaign(part.input);
      if (campaign) return campaign;
    }
  }
  return null;
}

export function trailLabel(trail: number[]): string {
  return trail.map((n) => `#${n}`).join(" → ");
}
