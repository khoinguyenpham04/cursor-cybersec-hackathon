"use client";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  extractCampaign,
  trailLabel,
  type CampaignResult,
} from "@/lib/campaign";
import {
  campaignDemoKickoffMessage,
  DEMO_LEDGER_CASE,
} from "@/lib/campaign-demo";
import { getSession, updateSession, useReviewSessions } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { useFlueAgent } from "@flue/react";
import { createFlueClient } from "@flue/sdk";
import {
  PlayIcon,
  ShieldAlertIcon,
  SquareIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function CampaignCaseWorkspace({
  sessionId,
  owner,
  repo,
}: {
  sessionId: string;
  owner: string;
  repo: string;
}) {
  const sessions = useReviewSessions();
  const session = useMemo(
    () => sessions.find((entry) => entry.id === sessionId) ?? getSession(sessionId),
    [sessions, sessionId],
  );
  const ledgerCaseId = session?.ledgerCaseId ?? DEMO_LEDGER_CASE;
  const agentUrl = `/api/agents/campaign-orchestrator/${sessionId}`;
  const client = useMemo(() => createFlueClient({ url: agentUrl }), [agentUrl]);
  const agent = useFlueAgent({ client });

  const working =
    agent.status === "submitted" || agent.status === "streaming";
  const [stopping, setStopping] = useState(false);
  const campaign = useMemo(
    () => extractCampaign(agent.messages),
    [agent.messages],
  );

  const toolSteps = useMemo(() => {
    const steps: Array<{ label: string; done: boolean }> = [];
    for (const message of agent.messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool") continue;
        steps.push({
          label: part.toolName,
          done: part.state === "output-available",
        });
      }
    }
    return steps.slice(-12);
  }, [agent.messages]);

  useEffect(() => {
    if (!campaign) return;
    updateSession(sessionId, {
      campaignScore: campaign.campaignScore,
      headline: campaign.headline,
      title: campaign.headline ?? `Campaign · ${campaign.caseId}`,
    });
  }, [campaign, sessionId]);

  const kickoffSent = useRef(false);
  useEffect(() => {
    if (kickoffSent.current || !agent.historyReady) return;
    if (agent.messages.length === 0 && agent.status === "idle") {
      kickoffSent.current = true;
      void agent.sendMessage(campaignDemoKickoffMessage(ledgerCaseId));
    }
  }, [agent, ledgerCaseId]);

  const stop = useCallback(() => {
    if (stopping) return;
    setStopping(true);
    void client
      .abort()
      .then(() => agent.refresh())
      .catch(() => {})
      .finally(() => setStopping(false));
  }, [agent, client, stopping]);

  const rerun = useCallback(() => {
    void agent.sendMessage(
      `Re-investigate ${ledgerCaseId}: load_fixture_case if needed, investigate_case, then submit_campaign.`,
    );
  }, [agent, ledgerCaseId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-6">
        <ShieldAlertIcon className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">
            {session?.headline ?? session?.title ?? `Campaign · ${ledgerCaseId}`}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            Ledger case {ledgerCaseId} · {owner}/{repo}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "size-2 rounded-full",
              working && "animate-pulse bg-amber-500",
              !working && agent.status !== "error" && "bg-emerald-500",
              agent.status === "error" && "bg-red-500",
            )}
          />
          <span className="text-muted-foreground">
            {working
              ? "Investigating"
              : agent.status === "error"
                ? "Error"
                : "Ready"}
          </span>
        </span>
        {working ? (
          <Button
            className="gap-1.5"
            disabled={stopping}
            onClick={stop}
            size="sm"
            variant="outline"
          >
            <SquareIcon className="size-3.5" />
            {stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : (
          <Button className="gap-1.5" onClick={rerun} size="sm" variant="outline">
            <PlayIcon className="size-3.5" />
            Re-run
          </Button>
        )}
      </div>

      {agent.error && (
        <div className="border-b bg-destructive/10 px-6 py-2 text-destructive text-sm">
          {agent.error.message}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            <p className="font-medium">Supply-chain campaign demo</p>
            <p className="mt-1 text-muted-foreground text-pretty">
              Three green-looking PRs compose into one campaign. The orchestrator
              runs <code className="text-xs">investigate_case</code> then{" "}
              <code className="text-xs">submit_campaign</code> on{" "}
              <code className="text-xs">{ledgerCaseId}</code>.
            </p>
          </div>

          {campaign ? (
            <CampaignResultView campaign={campaign} />
          ) : (
            <div className="space-y-4 text-sm">
              <div className="space-y-1">
                <p className="font-medium">
                  {working
                    ? "Investigating the PR sequence…"
                    : "Waiting for campaign result"}
                </p>
                <p className="text-muted-foreground text-pretty">
                  Specialists fan out over the fixture (graph, provenance, CI),
                  then compose one scored campaign with policy actions.
                </p>
              </div>
              {(working || toolSteps.length > 0) && (
                <ChainOfThought defaultOpen>
                  <ChainOfThoughtHeader>
                    {working ? "Control plane" : "Last run"}
                  </ChainOfThoughtHeader>
                  <ChainOfThoughtContent>
                    {toolSteps.length === 0 && working && (
                      <ChainOfThoughtStep label="Starting" status="active" />
                    )}
                    {toolSteps.map((step, index) => (
                      <ChainOfThoughtStep
                        key={`${step.label}-${index}`}
                        label={step.label}
                        status={step.done ? "complete" : "active"}
                      />
                    ))}
                  </ChainOfThoughtContent>
                </ChainOfThought>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignResultView({ campaign }: { campaign: CampaignResult }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
        <p className="font-medium text-sm">Campaign detected</p>
        <p className="mt-1 text-muted-foreground text-sm text-pretty">
          Sequence {trailLabel(campaign.trail)} scores {campaign.campaignScore}
          /100 — not a single-PR CVE dump.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{campaign.verdict.replace("_", " ")}</Badge>
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
      {campaign.headline && (
        <h2 className="font-semibold text-lg text-pretty">{campaign.headline}</h2>
      )}
      <p className="text-muted-foreground text-sm">
        Trail {trailLabel(campaign.trail)}
      </p>
      <p className="text-sm text-pretty whitespace-pre-wrap">{campaign.narrative}</p>
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
    </div>
  );
}
