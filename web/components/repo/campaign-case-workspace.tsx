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
import { CaseOrchestration } from "@/components/case/case-orchestration";
import { CaseOverview } from "@/components/case/case-overview";
import {
  CASE_COLUMN,
  CASE_CONTENT_WIDTH,
  CASE_PAD_X,
} from "@/components/case/case-panel";
import { CaseReport, resolveReportPhase } from "@/components/case/case-report";
import { CaseShell } from "@/components/case/case-shell";
import { Transcript } from "@/components/review/transcript";
import { Button } from "@/components/ui/button";
import { extractCampaign } from "@/lib/campaign";
import {
  campaignDemoKickoffMessage,
  resolveLedgerCaseId,
  safeLedgerCaseId,
} from "@/lib/campaign-demo";
import { abortConversation } from "@/lib/flue-abort";
import { softToolError } from "@/lib/orchestration";
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
  const ledgerCaseId = resolveLedgerCaseId(
    owner,
    repo,
    session?.ledgerCaseId,
  );
  const repoRef = `${owner}/${repo}`;
  const agentUrl = `/api/agents/campaign-orchestrator/${sessionId}`;
  const agent = useFlueAgent({ url: agentUrl });

  const [awaitingRun, setAwaitingRun] = useState(false);
  const working =
    awaitingRun ||
    agent.status === "submitted" ||
    agent.status === "streaming";
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [kickoffReady, setKickoffReady] = useState(false);
  const [resetDefaultSignal, setResetDefaultSignal] = useState(0);

  useEffect(() => {
    if (!awaitingRun) return;
    if (
      agent.status === "submitted" ||
      agent.status === "streaming" ||
      agent.status === "error"
    ) {
      setAwaitingRun(false);
      return;
    }
    // If send never flips status, don't leave the UI stuck "working".
    const timeout = window.setTimeout(() => setAwaitingRun(false), 8_000);
    return () => window.clearTimeout(timeout);
  }, [awaitingRun, agent.status]);
  const campaign = useMemo(
    () => extractCampaign(agent.messages),
    [agent.messages],
  );

  const { investigateDone, submitFailed } = useMemo(() => {
    let investigateDone = false;
    let submitFailed = false;
    for (const message of agent.messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (part.type !== "dynamic-tool") continue;
        if (
          part.toolName === "investigate_case" &&
          part.state === "output-available"
        ) {
          investigateDone = true;
        }
        if (part.toolName === "submit_campaign") {
          if (part.state === "output-error" || softToolError(part)) {
            submitFailed = true;
          }
        }
      }
      if (message.settlement?.outcome === "aborted" || message.settlement?.outcome === "failed") {
        submitFailed = true;
      }
    }
    return { investigateDone, submitFailed };
  }, [agent.messages]);

  const reportPhase = resolveReportPhase({
    working,
    campaign,
    hasError: agent.status === "error",
    investigateDone,
    submitFailed,
  });

  useEffect(() => {
    updateSession(sessionId, {
      kind: "campaign",
      ...(session?.repo ? {} : { repo: repoRef }),
      ledgerCaseId,
      pr: session?.pr ?? "",
      title: session?.title ?? `Campaign · ${ledgerCaseId}`,
    });
  }, [sessionId, repoRef, ledgerCaseId, session?.repo, session?.pr, session?.title]);

  useEffect(() => {
    if (working) return;
    if (stopping) setStopping(false);
    if (stopError) setStopError(null);
  }, [working, stopping, stopError]);

  useEffect(() => {
    if (!stopping) return;
    const timeout = window.setTimeout(() => {
      setStopping(false);
      setStopError((prev) => prev ?? "Stop timed out; try again or refresh.");
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [stopping]);

  useEffect(() => {
    if (!campaign) return;
    const caseId = safeLedgerCaseId(campaign.caseId || ledgerCaseId);
    updateSession(sessionId, {
      kind: "campaign",
      ...(session?.repo ? {} : { repo: repoRef }),
      ledgerCaseId: caseId,
      campaignScore: campaign.campaignScore,
      headline: campaign.headline,
      title: campaign.headline ?? `Campaign · ${caseId}`,
    });
  }, [campaign, sessionId, repoRef, ledgerCaseId, session?.repo]);

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
          return;
        }
        agent.refresh();
      })
      .catch((error: unknown) => {
        setStopError(error instanceof Error ? error.message : String(error));
        setStopping(false);
      });
  }, [agent, agentUrl, stopping]);

  const canRerun = agent.historyReady && kickoffReady && !working;

  const rerun = useCallback(() => {
    if (!canRerun) return;
    // Mark working immediately so CaseShell prefers Orchestration before
    // Flue status flips (stale hasResult would otherwise snap back to Report).
    setAwaitingRun(true);
    setResetDefaultSignal((n) => n + 1);
    void agent.sendMessage(
      `Re-investigate ${ledgerCaseId}: load_fixture_case if needed, investigate_case, then submit_campaign.`,
    );
  }, [agent, canRerun, ledgerCaseId]);

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim();
    if (!text || working || !agent.historyReady) return;
    void agent.sendMessage(text);
  }

  const toolbar = (
    <div className={cn("border-b py-3", CASE_PAD_X)}>
      <div className={cn(CASE_COLUMN, "flex flex-wrap items-center gap-2")}>
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
    </div>
  );

  const banner =
    agent.error || stopError ? (
      <div className={cn("border-b bg-destructive/10 py-2", CASE_PAD_X)}>
        <p className={cn(CASE_COLUMN, "text-destructive text-sm")}>
          {agent.error?.message ?? stopError}
        </p>
      </div>
    ) : null;

  return (
    <CaseShell
      banner={banner}
      hasError={agent.status === "error"}
      hasResult={Boolean(campaign)}
      orchestration={
        <CaseOrchestration messages={agent.messages} status={agent.status} />
      }
      overview={
        <CaseOverview
          ledgerCaseId={ledgerCaseId}
          owner={owner}
          repo={repo}
        />
      }
      report={
        <CaseReport
          campaign={campaign}
          message={
            reportPhase === "failed" && !campaign
              ? "Investigation finished without a parseable submit_campaign result. Open Transcript or Re-run."
              : undefined
          }
          phase={reportPhase}
          sessionId={sessionId}
        />
      }
      resetDefaultSignal={resetDefaultSignal}
      toolbar={toolbar}
      transcript={
        <Transcript
          contentClassName={CASE_CONTENT_WIDTH}
          messages={agent.messages}
          status={agent.status}
          waitingLabel="Investigating the campaign…"
        />
      }
      transcriptFooter={
        <div className={cn("border-t py-3", CASE_PAD_X)}>
          <PromptInput className={CASE_COLUMN} onSubmit={handleSubmit}>
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
      }
      working={working}
    />
  );
}
