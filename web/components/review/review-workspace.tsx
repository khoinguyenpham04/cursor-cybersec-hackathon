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
import {
  CASE_CONTENT_WIDTH,
  CasePanel,
  CasePanelState,
} from "@/components/case/case-panel";
import { CaseShell } from "@/components/case/case-shell";
import { DiffViewer, type FindingAnchor } from "@/components/review/diff-viewer";
import {
  ReviewReport,
  ReviewVerdictBadge,
} from "@/components/review/review-report";
import { Transcript } from "@/components/review/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PrFile, PrMeta } from "@/lib/github";
import {
  isMockSessionId,
  MOCK_PR_FILES,
  MOCK_PR_META,
  useMockReviewAgent,
} from "@/lib/mock-review";
import { findPrRef, formatPrRef, parsePrRef } from "@/lib/pr";
import { extractReview, type ReviewFinding } from "@/lib/review";
import { getSession, saveSession, updateSession } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { useFlueAgent } from "@flue/react";
import { ExternalLinkIcon, GitBranchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

const statusToChat: Record<string, ChatStatus> = {
  connecting: "submitted",
  submitted: "submitted",
  streaming: "streaming",
  idle: "ready",
  error: "error",
};

interface PrData {
  meta: PrMeta;
  files: PrFile[];
}

export function ReviewWorkspace({
  sessionId,
  variant = "page",
}: {
  sessionId: string;
  /** Nested under a repo case route: hide the duplicate sidebar trigger. */
  variant?: "page" | "embedded";
}) {
  const embedded = variant === "embedded";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Demo sessions replay a scripted review through the mock driver; the real
  // hook stays dormant (no url) so nothing hits the Flue server.
  const isMock = isMockSessionId(sessionId);
  const liveAgent = useFlueAgent(
    isMock ? {} : { url: `/api/agents/pr-reviewer/${sessionId}` },
  );
  const mockAgent = useMockReviewAgent(isMock);
  const agent = isMock ? mockAgent : liveAgent;

  const [pr, setPr] = useState<string | null>(null);
  useEffect(() => {
    setPr(getSession(sessionId)?.pr ?? null);
  }, [sessionId]);
  useEffect(() => {
    if (pr || !agent.historyReady) return;
    for (const message of agent.messages) {
      if (message.role !== "user") continue;
      const text = message.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join(" ");
      const ref = findPrRef(text);
      if (ref) {
        const recovered = formatPrRef(ref);
        setPr(recovered);
        const existing = getSession(sessionId);
        saveSession({
          id: sessionId,
          kind: existing?.kind ?? "review",
          pr: recovered,
          title: recovered,
          createdAt: existing?.createdAt ?? Date.now(),
          repo: existing?.repo,
          prTitle: existing?.prTitle,
          verdict: existing?.verdict,
        });
        break;
      }
    }
  }, [pr, agent.historyReady, agent.messages, sessionId]);

  const kickoffSent = useRef(false);
  useEffect(() => {
    if (kickoffSent.current || !pr || !agent.historyReady) return;
    if (agent.messages.length === 0 && agent.status === "idle") {
      kickoffSent.current = true;
      void agent.sendMessage(`Review this pull request: ${pr}`);
    }
  }, [pr, agent]);

  const [prData, setPrData] = useState<PrData | null>(null);
  const [prError, setPrError] = useState<string | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  useEffect(() => {
    if (isMock) {
      setPrData({ meta: MOCK_PR_META, files: MOCK_PR_FILES });
      return;
    }
    if (!pr) return;
    let cancelled = false;
    setPrLoading(true);
    setPrError(null);
    fetch(`/api/github/pr?pr=${encodeURIComponent(pr)}`)
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) setPrError(data.error ?? "Failed to load PR");
        else setPrData(data);
      })
      .catch((error) => {
        if (!cancelled) setPrError((error as Error).message);
      })
      .finally(() => {
        if (!cancelled) setPrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pr, isMock]);

  const title = useMemo(() => {
    if (!pr) return "Review session";
    const ref = parsePrRef(pr);
    return ref ? formatPrRef(ref) : pr;
  }, [pr]);

  const chatStatus = statusToChat[agent.status] ?? "ready";
  const working = chatStatus === "submitted" || chatStatus === "streaming";
  const review = useMemo(() => extractReview(agent.messages), [agent.messages]);

  const prTitle = prData?.meta?.title;
  useEffect(() => {
    if (prTitle) updateSession(sessionId, { prTitle });
  }, [prTitle, sessionId]);
  const verdict = review?.verdict;
  useEffect(() => {
    if (verdict) updateSession(sessionId, { verdict });
  }, [verdict, sessionId]);

  const [legacyTab, setLegacyTab] = useState("review");
  const [anchor, setAnchor] = useState<FindingAnchor | null>(null);

  function jumpToFinding(finding: ReviewFinding) {
    setAnchor((previous) => ({ finding, nonce: (previous?.nonce ?? 0) + 1 }));
    if (embedded) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "report");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else {
      setLegacyTab("diff");
    }
  }

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text?.trim();
    if (!text || working) return;
    void agent.sendMessage(text);
  }

  const statusDot = (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "size-2 rounded-full",
          working && "animate-pulse bg-amber-500",
          chatStatus === "ready" && "bg-emerald-500",
          chatStatus === "error" && "bg-red-500",
        )}
      />
      <span className="text-muted-foreground">
        {working ? "Reviewing" : chatStatus === "error" ? "Error" : "Ready"}
      </span>
    </span>
  );

  const headerMeta = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-semibold text-sm">{title}</h1>
          {isMock && (
            <Badge className="text-[10px]" variant="outline">
              demo
            </Badge>
          )}
          {prData?.meta && (
            <Badge
              className="text-[10px]"
              variant={prData.meta.merged ? "default" : "secondary"}
            >
              {prData.meta.merged
                ? "merged"
                : prData.meta.draft
                  ? "draft"
                  : prData.meta.state}
            </Badge>
          )}
          {review && (
            <ReviewVerdictBadge className="text-[10px]" verdict={review.verdict} />
          )}
        </div>
        {prData?.meta && (
          <p className="truncate text-muted-foreground text-xs">
            {prData.meta.title} · by {prData.meta.author}
          </p>
        )}
      </div>
      {prData?.meta && (
        <div className="hidden items-center gap-3 text-muted-foreground text-xs md:flex">
          <span className="flex items-center gap-1">
            <GitBranchIcon className="size-3.5" />
            {prData.meta.headBranch} → {prData.meta.baseBranch}
          </span>
          <span>
            <span className="text-emerald-600">+{prData.meta.additions}</span>{" "}
            <span className="text-red-600">-{prData.meta.deletions}</span>
            {" · "}
            {prData.meta.changedFiles} files
          </span>
        </div>
      )}
      {statusDot}
      {prData?.meta?.url && (
        <Button
          aria-label="Open on GitHub"
          nativeButton={false}
          render={
            <a href={prData.meta.url} rel="noreferrer" target="_blank" />
          }
          size="icon-sm"
          variant="ghost"
        >
          <ExternalLinkIcon className="size-4" />
        </Button>
      )}
    </>
  );

  const promptFooter = (
    <div className="border-t px-4 py-3 lg:px-6">
      <PromptInput
        className={
          embedded ? "mx-auto w-full max-w-5xl" : "mx-auto max-w-3xl"
        }
        onSubmit={handleSubmit}
      >
        <PromptInputBody>
          <PromptInputTextarea
            disabled={!agent.historyReady}
            placeholder="Ask a follow-up about this PR..."
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit status={chatStatus} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );

  if (embedded) {
    return (
      <CaseShell
        banner={
          agent.error ? (
            <div className="border-b bg-destructive/10 px-6 py-2 text-destructive text-sm">
              {agent.error.message}
            </div>
          ) : null
        }
        hasError={chatStatus === "error"}
        hasResult={Boolean(review)}
        orchestration={
          <CaseOrchestration messages={agent.messages} status={agent.status} />
        }
        overview={
          <CasePanel>
            <div className="space-y-1">
              <h2 className="font-semibold text-base">PR overview</h2>
              <p className="text-muted-foreground text-sm text-pretty leading-relaxed">
                {prData?.meta?.title ??
                  "Pull request metadata loads from GitHub when available."}
              </p>
            </div>
            {prData?.meta ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    Author
                  </dt>
                  <dd>{prData.meta.author}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    Branches
                  </dt>
                  <dd>
                    {prData.meta.headBranch} → {prData.meta.baseBranch}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    Files
                  </dt>
                  <dd>{prData.meta.changedFiles}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                    Diff
                  </dt>
                  <dd>
                    <span className="text-emerald-600">
                      +{prData.meta.additions}
                    </span>{" "}
                    <span className="text-red-600">
                      -{prData.meta.deletions}
                    </span>
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">
                {prLoading ? "Loading PR…" : prError ?? "Waiting for PR ref…"}
              </p>
            )}
          </CasePanel>
        }
        report={
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto border-b">
              {review ? (
                <CasePanel>
                  <ReviewReport
                    onJumpToFinding={jumpToFinding}
                    review={review}
                  />
                </CasePanel>
              ) : (
                <CasePanelState
                  description={
                    <>
                      Structured findings appear after{" "}
                      <code className="text-xs">submit_review</code>. Use
                      Orchestration or Transcript meanwhile.
                    </>
                  }
                  title={working ? "Report pending" : "No review report yet"}
                />
              )}
            </div>
            <div className="min-h-[40%] flex-1">
              <DiffViewer
                anchor={anchor}
                error={prError}
                files={prData?.files ?? null}
                findings={review?.findings ?? []}
                loading={prLoading || (!prData && !prError)}
              />
            </div>
          </div>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-6">
            {headerMeta}
          </div>
        }
        transcript={
          <Transcript
            contentClassName={CASE_CONTENT_WIDTH}
            messages={agent.messages}
            onJumpToFinding={jumpToFinding}
            status={agent.status}
          />
        }
        transcriptFooter={promptFooter}
        working={working}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          className="h-4 data-vertical:self-auto"
          orientation="vertical"
        />
        {headerMeta}
      </header>

      {agent.error && (
        <div className="border-b bg-destructive/10 px-6 py-2 text-destructive text-sm">
          {agent.error.message}
        </div>
      )}

      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={(value) => setLegacyTab(String(value))}
        value={legacyTab}
      >
        <div className="border-b px-6">
          <TabsList className="h-10 bg-transparent p-0">
            <TabsTrigger
              className="rounded-none border-transparent border-b-2 data-active:border-primary data-active:shadow-none"
              value="review"
            >
              Review
              {review && review.findings.length > 0 && (
                <Badge className="ml-1.5 text-[10px]" variant="secondary">
                  {review.findings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              className="rounded-none border-transparent border-b-2 data-active:border-primary data-active:shadow-none"
              value="diff"
            >
              Diff
              {prData?.files && (
                <Badge className="ml-1.5 text-[10px]" variant="secondary">
                  {prData.files.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="review">
          <Transcript
            messages={agent.messages}
            onJumpToFinding={jumpToFinding}
            status={agent.status}
          />
          {promptFooter}
        </TabsContent>

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="diff">
          <DiffViewer
            anchor={anchor}
            error={prError}
            files={prData?.files ?? null}
            findings={review?.findings ?? []}
            loading={prLoading || (!prData && !prError)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
