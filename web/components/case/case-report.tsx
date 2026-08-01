"use client";

import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { CaseEscalate } from "@/components/case/case-escalate";
import { CasePanel, CasePanelState } from "@/components/case/case-panel";
import { Badge } from "@/components/ui/badge";
import { trailLabel, type CampaignResult } from "@/lib/campaign";

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
      <CasePanelState
        description={
          message ??
          "Investigation in progress — Orchestration shows live tools until submit_campaign settles."
        }
        title={<Shimmer duration={1.5}>Report pending</Shimmer>}
      />
    );
  }

  if (phase === "failed" || !campaign) {
    return (
      <CasePanelState
        description={
          message ??
          "No parseable submit_campaign output. Check Transcript for errors, or Re-run."
        }
        title="Campaign not finalized"
        tone="danger"
      />
    );
  }

  return (
    <CasePanel>
      <Artifact>
        <ArtifactHeader>
          <div className="min-w-0 flex-1 space-y-1">
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
              {campaign.verdict.replaceAll("_", " ")}
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

          <section className="space-y-2">
            <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Narrative
            </h3>
            <MessageResponse className="text-sm leading-relaxed [&>ul]:my-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:my-2 [&>ol]:list-decimal [&>ol]:pl-5 [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>pre]:my-2 [&>pre]:overflow-x-auto">
              {campaign.narrative}
            </MessageResponse>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Recommended actions
            </h3>
            <ul className="flex flex-col gap-2">
              {campaign.recommendedActions.map((action, index) => (
                <li
                  className="rounded-lg border px-3 py-2.5"
                  key={`${action.action}-${action.target}-${index}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="text-[10px]" variant="outline">
                      {action.action.replaceAll("_", " ")}
                    </Badge>
                    <Badge className="text-[10px]" variant="secondary">
                      {action.priority}
                    </Badge>
                    <span className="min-w-0 flex-1 font-medium text-sm">
                      {action.target}
                    </span>
                  </div>
                  <MessageResponse className="mt-1.5 text-muted-foreground text-sm leading-relaxed [&>p]:my-0">
                    {action.rationale}
                  </MessageResponse>
                </li>
              ))}
            </ul>
          </section>
        </ArtifactContent>
      </Artifact>

      <CaseEscalate
        actions={campaign.recommendedActions}
        caseId={sessionId}
      />
    </CasePanel>
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
