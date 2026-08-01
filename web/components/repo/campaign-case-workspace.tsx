"use client";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Transcript } from "@/components/review/transcript";
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
import { abortConversation } from "@/lib/flue-abort";
import { getSession, updateSession, useReviewSessions } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { useFlueAgent } from "@flue/react";
import { PlayIcon, ShieldAlertIcon, SquareIcon } from "lucide-react";
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
    () =>
      sessions.find((entry) => entry.id === sessionId) ?? getSession(sessionId),
    [sessions, sessionId],
  );
  const ledgerCaseId = session?.ledgerCaseId ?? DEMO_LEDGER_CASE;
  const agentUrl = `/api/agents/campaign-orchestrator/${sessionId}`;
  const agent = useFlueAgent({ url: agentUrl });

  const working =
    agent.status === "submitted" || agent.status === "streaming";
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [kickoffReady, setKickoffReady] = useState(false);
  const campaign = useMemo(
    () => extractCampaign(agent.messages),
    [agent.messages],
  );

  useEffect(() => {
    if (!working && stopping) setStopping(false);
  }, [working, stopping]);

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
    if (!agent.historyReady) return;
    if (agent.messages.length > 0) {
      kickoffSent.current = true;
      setKickoffReady(true);
      return;
    }
    if (kickoffSent.current || agent.status !== "idle") return;
    kickoffSent.current = true;
    setKickoffReady(true);
    void agent.sendMessage(campaignDemoKickoffMessage(ledgerCaseId));
  }, [agent, ledgerCaseId]);

  const stop = useCallback(() => {
    if (stopping) return;
    setStopping(true);
    setStopError(null);
    void abortConversation(agentUrl)
      .then(({ aborted }) => {
        if (!aborted) {
          setStopError("Nothing was in flight to abort.");
          setStopping(false);
        }
      })
      .catch((error: Error) => {
        setStopError(error.message);
        setStopping(false);
      });
  }, [agentUrl, stopping]);

  const canRerun = agent.historyReady && kickoffReady && !working;

  const rerun = useCallback(() => {
    if (!canRerun) return;
    void agent.sendMessage(
      `Re-investigate ${ledgerCaseId}: load_fixture_case if needed, investigate_case, then submit_campaign.`,
    );
  }, [agent, canRerun, ledgerCaseId]);

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim();
    if (!text || working || !agent.historyReady) return;
    void agent.sendMessage(text);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-6">
        <ShieldAlertIcon className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">
            {session?.headline ??
              session?.title ??
              `Campaign · ${ledgerCaseId}`}
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
          <Button
            className="gap-1.5"
            disabled={!canRerun}
            onClick={rerun}
            size="sm"
            variant="outline"
          >
            <PlayIcon className="size-3.5" />
            Re-run
          </Button>
        )}
      </div>

      {(agent.error || stopError) && (
        <div className="border-b bg-destructive/10 px-6 py-2 text-destructive text-sm">
          {agent.error?.message ?? stopError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:px-6">
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
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {working
                  ? "Investigating the PR sequence…"
                  : kickoffReady
                    ? "Waiting for campaign result"
                    : "Preparing investigation…"}
              </p>
              <p className="text-muted-foreground text-pretty">
                Specialists fan out over the fixture (graph, provenance, CI),
                then compose one scored campaign with policy actions. Follow the
                transcript below if the structured result is delayed.
              </p>
            </div>
          )}
        </div>

        <div className="border-t">
          <Transcript messages={agent.messages} status={agent.status} />
        </div>
      </div>

      <div className="border-t px-4 py-3 lg:px-6">
        <PromptInput className="mx-auto max-w-3xl" onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              disabled={!agent.historyReady || working}
              placeholder="Ask about the campaign, or nudge submit_campaign…"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit
              disabled={stopping || !agent.historyReady}
              onStop={stop}
              status={working ? "streaming" : "ready"}
            />
          </PromptInputFooter>
        </PromptInput>
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
