"use client";

import { CASE_COLUMN, CASE_PAD_X } from "@/components/case/case-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type CaseTab,
  defaultCaseTab,
  isCaseTab,
} from "@/lib/case-tabs";
import { cn } from "@/lib/utils";
import {
  FileTextIcon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  WorkflowIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export function CaseShell({
  working,
  hasResult,
  hasError,
  toolbar,
  banner,
  overview,
  orchestration,
  report,
  transcript,
  transcriptFooter,
  resetDefaultSignal,
}: {
  working: boolean;
  hasResult: boolean;
  hasError?: boolean;
  toolbar?: ReactNode;
  banner?: ReactNode;
  overview: ReactNode;
  orchestration: ReactNode;
  report: ReactNode;
  transcript: ReactNode;
  transcriptFooter?: ReactNode;
  /** Increment (e.g. on Re-run) to clear sticky tab and return to Orchestration. */
  resetDefaultSignal?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");

  const userPicked = useRef(isCaseTab(urlTab));
  /** Ignore stale ?tab= until our router.replace lands. */
  const pendingUrlTab = useRef<CaseTab | null>(
    isCaseTab(urlTab) ? urlTab : null,
  );
  /** After Re-run, stay on Orchestration until work actually starts. */
  const holdOrchestration = useRef(false);
  const wasWorking = useRef(working);

  const [tab, setTab] = useState<CaseTab>(() =>
    isCaseTab(urlTab)
      ? urlTab
      : defaultCaseTab({ working, hasResult, hasError }),
  );

  const replaceUrlTab = useCallback(
    (next: CaseTab) => {
      const current = searchParams.get("tab");
      if (current === next) {
        pendingUrlTab.current = next;
        return;
      }
      pendingUrlTab.current = next;
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const goToTab = useCallback(
    (next: CaseTab, source: "user" | "auto") => {
      if (source === "user") {
        userPicked.current = true;
        holdOrchestration.current = false;
      }
      setTab(next);
      replaceUrlTab(next);
    },
    [replaceUrlTab],
  );

  // Stable callers so URL-driven callback identity changes don't re-fire effects.
  const goToTabRef = useRef(goToTab);
  const replaceUrlTabRef = useRef(replaceUrlTab);
  goToTabRef.current = goToTab;
  replaceUrlTabRef.current = replaceUrlTab;

  // Apply external URL changes (back/forward) once the address bar catches up.
  useEffect(() => {
    if (!isCaseTab(urlTab)) return;
    if (urlTab === tab) {
      pendingUrlTab.current = urlTab;
      return;
    }
    if (pendingUrlTab.current != null && pendingUrlTab.current !== urlTab) {
      // Stale URL during navigation — wait for our write to land.
      return;
    }
    userPicked.current = true;
    holdOrchestration.current = false;
    pendingUrlTab.current = urlTab;
    setTab(urlTab);
  }, [urlTab, tab]);

  // Re-run / explicit reset → Orchestration (signal-only; never re-run on goToTab churn).
  useEffect(() => {
    if (resetDefaultSignal == null || resetDefaultSignal <= 0) return;
    userPicked.current = false;
    holdOrchestration.current = true;
    goToTabRef.current("orchestration", "auto");
  }, [resetDefaultSignal]);

  // Release the re-run hold once work is in flight.
  useEffect(() => {
    if (working && holdOrchestration.current) {
      holdOrchestration.current = false;
    }
  }, [working]);

  // Auto defaults until the user picks a tab (or during re-run hold).
  useEffect(() => {
    if (userPicked.current) return;

    if (holdOrchestration.current) {
      if (tab !== "orchestration") {
        goToTabRef.current("orchestration", "auto");
      } else {
        replaceUrlTabRef.current("orchestration");
      }
      return;
    }

    const next = defaultCaseTab({ working, hasResult, hasError });
    if (next === tab) {
      replaceUrlTabRef.current(next);
      return;
    }
    goToTabRef.current(next, "auto");
  }, [working, hasResult, hasError, tab]);

  // When a run finishes with a result, switch to Report once (unless user picked).
  useEffect(() => {
    const finished = wasWorking.current && !working;
    wasWorking.current = working;
    if (!finished || !hasResult || userPicked.current) return;
    holdOrchestration.current = false;
    goToTabRef.current("report", "auto");
  }, [working, hasResult]);

  function onTabChange(value: string | number | null) {
    const next = String(value);
    if (!isCaseTab(next) || next === tab) return;
    goToTab(next, "user");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      {banner}
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        onValueChange={onTabChange}
        value={tab}
      >
        <div className={cn("border-b py-2", CASE_PAD_X)}>
          <div
            className={cn(
              CASE_COLUMN,
              "min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            )}
          >
            <TabsList aria-label="Case views">
              <TabsTrigger value="overview">
                <LayoutDashboardIcon />
                <span className="sr-only sm:not-sr-only">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="orchestration">
                <WorkflowIcon />
                <span className="sr-only sm:not-sr-only">Orchestration</span>
              </TabsTrigger>
              <TabsTrigger value="report">
                <FileTextIcon />
                <span className="sr-only sm:not-sr-only">Report</span>
              </TabsTrigger>
              <TabsTrigger value="transcript">
                <MessagesSquareIcon />
                <span className="sr-only sm:not-sr-only">Transcript</span>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          value="overview"
        >
          {overview}
        </TabsContent>
        <TabsContent
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          value="orchestration"
        >
          {orchestration}
        </TabsContent>
        <TabsContent
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          value="report"
        >
          {report}
        </TabsContent>
        <TabsContent
          className="flex min-h-0 flex-1 flex-col"
          value="transcript"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {transcript}
            {transcriptFooter}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
