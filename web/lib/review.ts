// Client-side mirror of the agent's structured review contract
// (agent/src/lib/review-schema.ts). The agent delivers its review as a
// `submit_review` tool call; this module extracts and defensively validates
// that payload straight off the conversation stream.

import type { FlueConversationMessage } from "@flue/react";

export type ReviewVerdict = "approve" | "comment" | "request_changes";
export type ReviewSeverity = "critical" | "high" | "medium" | "low";

export interface ReviewFinding {
  title: string;
  path: string;
  line: number;
  startLine?: number;
  side: "LEFT" | "RIGHT";
  category: string;
  severity: ReviewSeverity;
  body: string;
  trigger: string;
  fix: string;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  summary: string;
  findings: ReviewFinding[];
}

export const SUBMIT_REVIEW_TOOL = "submit_review";

const VERDICTS: ReviewVerdict[] = ["approve", "comment", "request_changes"];
const SEVERITIES: ReviewSeverity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const SEVERITY_META: Record<
  ReviewSeverity,
  { label: string; badgeClass: string; dotClass: string }
> = {
  critical: {
    label: "Critical",
    badgeClass:
      "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    dotClass: "bg-red-500",
  },
  high: {
    label: "High",
    badgeClass:
      "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
    dotClass: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    badgeClass:
      "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  low: {
    label: "Low",
    badgeClass:
      "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
    dotClass: "bg-sky-500",
  },
};

export const VERDICT_META: Record<
  ReviewVerdict,
  { label: string; badgeClass: string }
> = {
  approve: {
    label: "Approve",
    badgeClass:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  comment: {
    label: "Commented",
    badgeClass:
      "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  },
  request_changes: {
    label: "Changes requested",
    badgeClass:
      "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  },
};

/** Stable identity for a finding within one review (anchor + title index). */
export function findingKey(finding: ReviewFinding, index: number): string {
  return `${finding.path}:${finding.line}:${index}`;
}

/** Human-readable anchor, e.g. "src/retry.ts:21-25". */
export function findingAnchorLabel(finding: ReviewFinding): string {
  const range =
    finding.startLine && finding.startLine !== finding.line
      ? `${finding.startLine}-${finding.line}`
      : `${finding.line}`;
  return `${finding.path}:${range}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFinding(value: unknown): ReviewFinding | null {
  if (!isRecord(value)) return null;
  const severity = SEVERITIES.includes(value.severity as ReviewSeverity)
    ? (value.severity as ReviewSeverity)
    : "medium";
  const line =
    typeof value.line === "number" && Number.isFinite(value.line)
      ? Math.max(1, Math.floor(value.line))
      : 1;
  if (typeof value.path !== "string" || !value.path) return null;
  return {
    title: typeof value.title === "string" ? value.title : "Untitled finding",
    path: value.path,
    line,
    startLine:
      typeof value.startLine === "number" && Number.isFinite(value.startLine)
        ? Math.max(1, Math.floor(value.startLine))
        : undefined,
    side: value.side === "LEFT" ? "LEFT" : "RIGHT",
    category: typeof value.category === "string" ? value.category : "General",
    severity,
    body: typeof value.body === "string" ? value.body : "",
    trigger: typeof value.trigger === "string" ? value.trigger : "",
    fix: typeof value.fix === "string" ? value.fix : "",
  };
}

/** Parse an unknown `submit_review` tool input into a ReviewResult, or null. */
export function parseReview(input: unknown): ReviewResult | null {
  if (!isRecord(input)) return null;
  if (!VERDICTS.includes(input.verdict as ReviewVerdict)) return null;
  if (typeof input.summary !== "string") return null;
  const rawFindings = Array.isArray(input.findings) ? input.findings : [];
  const findings = rawFindings
    .map(parseFinding)
    .filter((finding): finding is ReviewFinding => finding !== null)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return {
    verdict: input.verdict as ReviewVerdict,
    summary: input.summary,
    findings,
  };
}

/**
 * The latest structured review in the conversation, scanning from the end so
 * a re-review supersedes earlier ones.
 */
export function extractReview(
  messages: FlueConversationMessage[],
): ReviewResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j];
      if (part.type !== "dynamic-tool") continue;
      if (part.toolName !== SUBMIT_REVIEW_TOOL) continue;
      const review = parseReview(part.input);
      if (review) return review;
    }
  }
  return null;
}
