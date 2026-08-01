"use client";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  DepGraphCanvas,
  type DepGraphData,
} from "@/components/repo/dep-graph-canvas";
import { RepoMapCanvas } from "@/components/repo/repo-map-canvas";
import { RepoOverview } from "@/components/repo/repo-overview";
import { NewReviewForm } from "@/components/review/new-review-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractScan } from "@/lib/scan";
import { updateRepo } from "@/lib/repos";
import { useReviewSessions } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { useFlueAgent } from "@flue/react";
import { createFlueClient } from "@flue/sdk";
import {
  ExternalLinkIcon,
  GitPullRequestIcon,
  LayoutDashboardIcon,
  MapIcon,
  PackageIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Big jobs run only when the user presses a button — never on mount. */
type JobState = "idle" | "running" | "error";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RepoWorkspace({ owner, repo }: { owner: string; repo: string }) {
  const repoRef = `${owner}/${repo}`;
  // One durable conversation per repo: the map replays for free on revisit.
  const conversationId = `scan-${owner}--${repo}`;
  const agentUrl = `/api/agents/repo-scanner/${conversationId}`;
  const client = useMemo(() => createFlueClient({ url: agentUrl }), [agentUrl]);
  const agent = useFlueAgent({ client });

  const scan = useMemo(() => extractScan(agent.messages), [agent.messages]);
  const scanning = agent.status === "submitted" || agent.status === "streaming";
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (scan) {
      updateRepo(repoRef, {
        lastScanAt: Date.now(),
        lastScanNodes: scan.nodes.length,
      });
    }
  }, [scan, repoRef]);

  // --- Scan job (explicit) -------------------------------------------------
  const startScan = useCallback(
    (rescan: boolean) => {
      void agent.sendMessage(
        rescan
          ? `Rescan the repository ${repoRef}: call ingest_repo with force=true, then submit_scan once more.`
          : `Scan the repository ${repoRef}`,
      );
    },
    [agent, repoRef],
  );

  // Abort is recorded immediately; settlement can lag (or stick if the agent
  // is wedged in recovery). Clear the Stopping label when the request returns.
  const stopScan = useCallback(() => {
    if (stopping) return;
    setStopping(true);
    void client
      .abort()
      .then(() => {
        agent.refresh();
      })
      .catch(() => {
        /* keep scanning controls available */
      })
      .finally(() => {
        setStopping(false);
      });
  }, [agent, client, stopping]);

  // --- Dependency job (explicit) ------------------------------------------
  const [deps, setDeps] = useState<DepGraphData | null>(null);
  const [depsState, setDepsState] = useState<JobState>("idle");
  const [depsError, setDepsError] = useState<string | null>(null);
  const [depsChecked, setDepsChecked] = useState(false);

  const loadDeps = useCallback(
    async (refresh: boolean) => {
      setDepsState("running");
      setDepsError(null);
      try {
        const params = new URLSearchParams({ repo: repoRef });
        if (refresh) params.set("refresh", "1");
        const response = await fetch(`/api/repo/deps?${params}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Failed to build graph");
        setDeps(body as DepGraphData);
        setDepsState("idle");
      } catch (error) {
        setDepsError((error as Error).message);
        setDepsState("error");
      }
    },
    [repoRef],
  );

  // Cache-only probe: shows an existing graph without starting a build.
  const probed = useRef(false);
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    fetch(`/api/repo/deps?repo=${encodeURIComponent(repoRef)}&cachedOnly=1`)
      .then(async (response) => {
        if (response.ok) setDeps((await response.json()) as DepGraphData);
      })
      .catch(() => {})
      .finally(() => setDepsChecked(true));
  }, [repoRef]);

  // --- Reviews -------------------------------------------------------------
  const sessions = useReviewSessions();
  const repoSessions = sessions.filter((session) =>
    session.pr.includes(`${owner}/${repo}`),
  );

  const [tab, setTab] = useState("overview");

  const runScanFromOverview = useCallback(() => {
    startScan(Boolean(scan));
    setTab("map");
  }, [scan, startScan]);

  const buildDepsFromOverview = useCallback(() => {
    void loadDeps(Boolean(deps));
    setTab("deps");
  }, [deps, loadDeps]);

  // Tool calls from the live scan, for the progress strip.
  const scanSteps = useMemo(() => {
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
    return steps.slice(-8);
  }, [agent.messages]);

  function askFollowUp(message: PromptInputMessage) {
    const text = message.text?.trim();
    if (!text || scanning) return;
    void agent.sendMessage(text);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator className="h-4 data-vertical:self-auto" orientation="vertical" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className="size-6 shrink-0 rounded-full"
          height={24}
          src={`https://github.com/${owner}.png?size=48`}
          width={24}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-sm">{repoRef}</h1>
          {tab === "overview" ? (
            <p className="truncate text-muted-foreground text-xs">
              {scan
                ? `${scan.nodes.length} nodes`
                : "Not scanned"}
              {" · "}
              {deps
                ? deps.totals.vulnerable > 0
                  ? `${deps.totals.vulnerable} vulnerable`
                  : `${deps.totals.packages} packages`
                : "No deps graph"}
              {" · "}
              {repoSessions.length > 0
                ? `${repoSessions.length} case${repoSessions.length === 1 ? "" : "s"}`
                : "No cases"}
            </p>
          ) : (
            scan?.project.tagline && (
              <p className="truncate text-muted-foreground text-xs">
                {scan.project.tagline}
              </p>
            )
          )}
        </div>
        {scan && (
          <span className="hidden text-muted-foreground text-xs md:inline">
            {scan.nodes.length} nodes · {scan.edges.length} edges
          </span>
        )}
        <Button
          aria-label="Open on GitHub"
          nativeButton={false}
          render={
            <a
              href={`https://github.com/${owner}/${repo}`}
              rel="noreferrer"
              target="_blank"
            />
          }
          size="icon-sm"
          variant="ghost"
        >
          <ExternalLinkIcon className="size-4" />
        </Button>
      </header>

      {agent.error && (
        <div className="border-b bg-destructive/10 px-6 py-2 text-destructive text-sm">
          {agent.error.message}
        </div>
      )}

      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={(value) => setTab(String(value))}
        value={tab}
      >
        <div className="flex min-w-0 flex-col gap-2 border-b px-4 py-2 sm:flex-row sm:items-center sm:gap-3 lg:px-6">
          <div className="min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList aria-label="Repository views">
              <TabsTrigger value="overview">
                <LayoutDashboardIcon />
                <span className="sr-only sm:not-sr-only">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="map">
                <MapIcon />
                <span className="sr-only sm:not-sr-only">Map</span>
              </TabsTrigger>
              <TabsTrigger value="deps">
                <PackageIcon />
                <span className="sr-only sm:not-sr-only">Dependencies</span>
                {deps && deps.totals.vulnerable > 0 && (
                  <Badge className="border border-red-500/30 bg-red-500/15 text-[10px] text-red-600 dark:text-red-400">
                    {deps.totals.vulnerable}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="reviews">
                <GitPullRequestIcon />
                <span className="sr-only sm:not-sr-only">Reviews</span>
                {repoSessions.length > 0 && (
                  <Badge className="text-[10px]" variant="secondary">
                    {repoSessions.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Job controls: nothing runs unless clicked. */}
          <div className="flex shrink-0 items-center gap-1.5 sm:ms-auto">
            {tab === "map" &&
              (scanning ? (
                <Button
                  className="gap-1.5"
                  disabled={stopping}
                  onClick={stopScan}
                  size="sm"
                  variant="outline"
                >
                  <SquareIcon className="size-3.5" />
                  {stopping ? "Stopping…" : "Stop"}
                </Button>
              ) : (
                <Button
                  className="gap-1.5"
                  disabled={!agent.historyReady}
                  onClick={() => startScan(Boolean(scan))}
                  size="sm"
                  variant={scan ? "outline" : "default"}
                >
                  {scan ? (
                    <RefreshCwIcon className="size-3.5" />
                  ) : (
                    <PlayIcon className="size-3.5" />
                  )}
                  {scan ? "Rescan" : "Run scan"}
                </Button>
              ))}
            {tab === "deps" && (
              <Button
                className="gap-1.5"
                disabled={depsState === "running"}
                onClick={() => loadDeps(Boolean(deps))}
                size="sm"
                variant={deps ? "outline" : "default"}
              >
                {deps ? (
                  <RefreshCwIcon
                    className={cn("size-3.5", depsState === "running" && "animate-spin")}
                  />
                ) : (
                  <PlayIcon className="size-3.5" />
                )}
                {depsState === "running"
                  ? "Building…"
                  : deps
                    ? "Rebuild"
                    : "Build graph"}
              </Button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------ Overview */}
        <TabsContent className="flex min-h-0 flex-1 flex-col" value="overview">
          <RepoOverview
            caseCount={repoSessions.length}
            deps={deps}
            depsChecked={depsChecked}
            depsState={depsState}
            onBuildDeps={buildDepsFromOverview}
            onNewCase={() => setTab("reviews")}
            onScan={runScanFromOverview}
            onStopScan={stopScan}
            scan={scan}
            scanning={scanning}
            scanReady={agent.historyReady}
            stopping={stopping}
          />
        </TabsContent>

        {/* ---------------------------------------------------------------- Map */}
        <TabsContent className="flex min-h-0 flex-1 flex-col" value="map">
          {scan ? (
            <>
              <RepoMapCanvas
                branch={deps?.defaultBranch ?? "main"}
                owner={owner}
                repo={repo}
                scan={scan}
              />
              {scanning && (
                <div className="border-t px-4 py-2 lg:px-6">
                  <ChainOfThought defaultOpen>
                    <ChainOfThoughtHeader>Rescanning…</ChainOfThoughtHeader>
                    <ChainOfThoughtContent>
                      {scanSteps.map((step, index) => (
                        <ChainOfThoughtStep
                          key={index}
                          label={step.label}
                          status={step.done ? "complete" : "active"}
                        />
                      ))}
                    </ChainOfThoughtContent>
                  </ChainOfThought>
                </div>
              )}
              <div className="border-t px-4 py-3 lg:px-6">
                <PromptInput className="mx-auto max-w-3xl" onSubmit={askFollowUp}>
                  <PromptInputBody>
                    <PromptInputTextarea
                      disabled={!agent.historyReady || scanning}
                      placeholder="Ask about this codebase…"
                    />
                  </PromptInputBody>
                  <PromptInputFooter>
                    <PromptInputTools />
                    <PromptInputSubmit
                      disabled={stopping}
                      onStop={stopScan}
                      status={scanning ? "streaming" : "ready"}
                    />
                  </PromptInputFooter>
                </PromptInput>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border bg-muted">
                <MapIcon className="size-6 text-muted-foreground" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h2 className="font-semibold text-lg">No scan yet</h2>
                <p className="text-muted-foreground text-sm">
                  Scanning ingests the repository and asks the scanner agent to map
                  its architecture. It costs one model run; the result is stored and
                  replays for free afterwards.
                </p>
              </div>
              {scanning ? (
                <div className="flex w-full max-w-md flex-col items-stretch gap-3 text-left">
                  <ChainOfThought defaultOpen>
                    <ChainOfThoughtHeader>Scanning…</ChainOfThoughtHeader>
                    <ChainOfThoughtContent>
                      {scanSteps.length === 0 && (
                        <ChainOfThoughtStep label="Starting" status="active" />
                      )}
                      {scanSteps.map((step, index) => (
                        <ChainOfThoughtStep
                          key={index}
                          label={step.label}
                          status={step.done ? "complete" : "active"}
                        />
                      ))}
                    </ChainOfThoughtContent>
                  </ChainOfThought>
                  <Button
                    className="gap-1.5 self-center"
                    disabled={stopping}
                    onClick={stopScan}
                    variant="outline"
                  >
                    <SquareIcon className="size-4" />
                    {stopping ? "Stopping…" : "Stop scan"}
                  </Button>
                </div>
              ) : (
                <Button
                  className="gap-1.5"
                  disabled={!agent.historyReady}
                  onClick={() => startScan(false)}
                >
                  <PlayIcon className="size-4" />
                  Run scan
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* -------------------------------------------------------- Dependencies */}
        <TabsContent className="flex min-h-0 flex-1 flex-col" value="deps">
          {deps ? (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-muted-foreground text-xs lg:px-6">
                <span>
                  {deps.totals.packages} packages · {deps.totals.direct} direct ·{" "}
                  {deps.totals.lockfiles} lockfile
                  {deps.totals.lockfiles === 1 ? "" : "s"}
                </span>
                <span
                  className={cn(
                    deps.totals.vulnerable > 0 && "text-red-600 dark:text-red-400",
                  )}
                >
                  {deps.totals.vulnerable} vulnerable
                </span>
                <span className="ml-auto">
                  {deps.cached ? "cached" : "fresh"} · built {timeAgo(deps.generatedAt)}
                </span>
              </div>
              <DepGraphCanvas data={deps} />
              {deps.notes.length > 0 && (
                <div className="border-t px-4 py-2 text-muted-foreground text-xs lg:px-6">
                  {deps.notes.join(" · ")}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border bg-muted">
                <PackageIcon className="size-6 text-muted-foreground" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h2 className="font-semibold text-lg">
                  {depsState === "error" ? "Could not build the graph" : "No dependency graph yet"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {depsError ??
                    "Reads every lockfile in the repository, resolves it against deps.dev, and checks each package against OSV.dev. No model tokens; the result is cached on disk."}
                </p>
              </div>
              <Button
                className="gap-1.5"
                disabled={depsState === "running" || !depsChecked}
                onClick={() => loadDeps(false)}
              >
                {depsState === "running" ? (
                  <RefreshCwIcon className="size-4 animate-spin" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
                {depsState === "running" ? "Building…" : "Build graph"}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* -------------------------------------------------------------- Reviews */}
        <TabsContent className="min-h-0 flex-1 overflow-y-auto" value="reviews">
          {repoSessions.length > 0 ? (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-6">
              {repoSessions.map((session) => (
                <Link
                  className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent"
                  href={`/review/${session.id}`}
                  key={session.id}
                >
                  <GitPullRequestIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {session.prTitle ?? session.title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {session.title} · {timeAgo(session.createdAt)}
                    </p>
                  </div>
                  {session.verdict && (
                    <Badge className="text-[10px]" variant="outline">
                      {session.verdict.replace("_", " ")}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <NewReviewForm />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
