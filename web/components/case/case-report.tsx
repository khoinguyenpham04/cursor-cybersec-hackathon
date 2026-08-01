"use client";

import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { CaseEscalate } from "@/components/case/case-escalate";
import { Badge } from "@/components/ui/badge";
import {
  trailLabel,
  type CampaignResult,
} from "@/lib/campaign";
import { Shimmer } from "@/components/ai-elements/shimmer";

export type ReportPhase = "pending" | "ready" | "failed";

export function CaseReport({
  phase,
  campaign,
  sessionId,
  message,
}: {
  phase: ReportPhase;
  campaign: CampaignResult | null;
  sessionId: string;
  message?: string;
}) {
  if (phase === "pending") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6 lg:px-6">
        <p className="font-medium text-sm">
          <Shimmer duration={1.5}>Report pending</Shimmer>
        </p>
        <p className="text-muted-foreground text-sm text-pretty">
          {message ??
            "Investigation in progress — Orchestration shows live tools until submit_campaign settles."}
        </p>
      </div>
    );
  }

  if (phase === "failed" || !campaign) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6 lg:px-6">
        <p className="font-medium text-sm text-destructive">
          Campaign not finalized
        </p>
        <p className="text-muted-foreground text-sm text-pretty">
          {message ??
            "No parseable submit_campaign output. Check Transcript for errors, or Re-run."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 lg:px-6">
      <Artifact>
        <ArtifactHeader>
          <div className="min-w-0 space-y-1">
            <ArtifactTitle>
              {campaign.headline ?? "Campaign report"}
            </ArtifactTitle>
            <ArtifactDescription>
              Trail {trailLabel(campaign.trail)} · score {campaign.campaignScore}
              /100
            </ArtifactDescription>
          </div>
        </ArtifactHeader>
        <ArtifactContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {campaign.verdict.replace("_", " ")}
            </Badge>
            <Badge variant="secondary">score {campaign.campaignScore}</Badge>
            {campaign.topSeverity && (
              <Badge
                className="border border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400"
                variant="outline"
              >
                {campaign.topSeverity}
              </Badge>
            )}
          </div>
          <p className="text-sm text-pretty whitespace-pre-wrap">
            {campaign.narrative}
          </p>
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Recommended actions</h3>
            <ul className="flex flex-col gap-2">
              {campaign.recommendedActions.map((action, index) => (
                <li
                  className="rounded-lg border px-3 py-2 text-sm"
                  key={`${action.action}-${action.target}-${index}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="text-[10px]" variant="outline">
                      {action.action}
                    </Badge>
                    <Badge className="text-[10px]" variant="secondary">
                      {action.priority}
                    </Badge>
                    <span className="font-medium">{action.target}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground text-pretty">
                    {action.rationale}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </ArtifactContent>
      </Artifact>

      <CaseEscalate
        actions={campaign.recommendedActions}
        caseId={sessionId}
      />
    </div>
  );
}

export function resolveReportPhase(options: {
  working: boolean;
  campaign: CampaignResult | null;
  hasError: boolean;
  investigateDone: boolean;
  submitFailed: boolean;
}): ReportPhase {
  if (options.campaign) return "ready";
  if (options.working) return "pending";
  if (options.hasError || options.submitFailed || options.investigateDone) {
    return "failed";
  }
  return "pending";
}
