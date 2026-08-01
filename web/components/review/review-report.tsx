"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import {
  findingAnchorLabel,
  type ReviewFinding,
  type ReviewResult,
  SEVERITY_META,
  VERDICT_META,
} from "@/lib/review";
import { cn } from "@/lib/utils";
import { CheckCircle2Icon, CrosshairIcon, ShieldAlertIcon } from "lucide-react";

const SEVERITY_BORDER: Record<ReviewFinding["severity"], string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-amber-500",
  low: "border-l-sky-500",
};

export function FindingCard({
  finding,
  onJump,
}: {
  finding: ReviewFinding;
  /** Renders the path:line anchor as a jump-to-diff button when provided. */
  onJump?: (finding: ReviewFinding) => void;
}) {
  const severity = SEVERITY_META[finding.severity];
  return (
    <div
      className={cn(
        "rounded-lg border border-l-2 bg-card px-4 py-3",
        SEVERITY_BORDER[finding.severity],
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("border text-[10px]", severity.badgeClass)}>
          {severity.label}
        </Badge>
        <Badge className="text-[10px]" variant="outline">
          {finding.category}
        </Badge>
        {onJump ? (
          <button
            className="ml-auto flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => onJump(finding)}
            title="Show in diff"
            type="button"
          >
            <CrosshairIcon className="size-3" />
            {findingAnchorLabel(finding)}
          </button>
        ) : (
          <code className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
            {findingAnchorLabel(finding)}
          </code>
        )}
      </div>
      <h4 className="mt-2 font-medium text-sm">{finding.title}</h4>
      {finding.body && (
        <MessageResponse className="mt-1 text-muted-foreground text-sm">
          {finding.body}
        </MessageResponse>
      )}
      {finding.trigger && (
        <div className="mt-2 text-sm">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Trigger
          </span>
          <MessageResponse className="mt-0.5 text-sm">
            {finding.trigger}
          </MessageResponse>
        </div>
      )}
      {finding.fix && (
        <div className="mt-2 text-sm">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Fix
          </span>
          <MessageResponse className="mt-0.5 text-sm">
            {finding.fix}
          </MessageResponse>
        </div>
      )}
    </div>
  );
}

export function ReviewVerdictBadge({
  verdict,
  className,
}: {
  verdict: ReviewResult["verdict"];
  className?: string;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <Badge className={cn("border", meta.badgeClass, className)}>
      {meta.label}
    </Badge>
  );
}

export function ReviewReport({
  review,
  onJumpToFinding,
}: {
  review: ReviewResult;
  onJumpToFinding?: (finding: ReviewFinding) => void;
}) {
  const counts = review.findings.reduce<Record<string, number>>(
    (acc, finding) => {
      acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="fade-in slide-in-from-bottom-2 animate-in rounded-xl border bg-background duration-300">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <ShieldAlertIcon className="size-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Review</span>
        <ReviewVerdictBadge verdict={review.verdict} />
        <span className="ml-auto flex items-center gap-2.5 text-muted-foreground text-xs">
          {review.findings.length === 0
            ? "No findings"
            : Object.entries(SEVERITY_META).map(([key, meta]) =>
                counts[key] ? (
                  <span className="flex items-center gap-1" key={key}>
                    <span className={cn("size-1.5 rounded-full", meta.dotClass)} />
                    {counts[key]} {meta.label.toLowerCase()}
                  </span>
                ) : null,
              )}
        </span>
      </div>
      <div className="px-4 py-3">
        <MessageResponse className="text-sm">{review.summary}</MessageResponse>
      </div>
      {review.findings.length > 0 ? (
        <div className="flex flex-col gap-2.5 border-t px-4 py-3">
          {review.findings.map((finding, index) => (
            <FindingCard
              finding={finding}
              key={`${finding.path}-${index}`}
              onJump={onJumpToFinding}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t px-4 py-3 text-emerald-600 text-sm dark:text-emerald-400">
          <CheckCircle2Icon className="size-4" />
          No bugs found.
        </div>
      )}
    </div>
  );
}
