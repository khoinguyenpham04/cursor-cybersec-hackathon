"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type CaseTab,
  defaultCaseTab,
  isCaseTab,
} from "@/lib/case-tabs";
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
  const userPicked = useRef(false);
  const autoSwitchedToReport = useRef(false);

  const [tab, setTab] = useState<CaseTab>(() =>
    isCaseTab(urlTab)
      ? urlTab
      : defaultCaseTab({ working, hasResult, hasError }),
  );

  const writeTab = useCallback(
    (next: CaseTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Sync from URL (back/forward or external ?tab=).
  useEffect(() => {
    if (isCaseTab(urlTab) && urlTab !== tab) {
      userPicked.current = true;
      setTab(urlTab);
    }
  }, [urlTab, tab]);

  // Auto defaults until the user picks a tab (or after resetDefaultSignal).
  useEffect(() => {
    if (userPicked.current) return;
    const next = defaultCaseTab({ working, hasResult, hasError });
    setTab((current) => (current === next ? current : next));
  }, [working, hasResult, hasError]);

  // One-shot auto-switch to Report when a result first appears.
  useEffect(() => {
    if (!hasResult || autoSwitchedToReport.current) return;
    autoSwitchedToReport.current = true;
    userPicked.current = false;
    setTab("report");
    writeTab("report");
  }, [hasResult, writeTab]);

  // Re-run / explicit reset → Orchestration.
  useEffect(() => {
    if (resetDefaultSignal == null || resetDefaultSignal <= 0) return;
    userPicked.current = false;
    autoSwitchedToReport.current = false;
    setTab("orchestration");
    writeTab("orchestration");
  }, [resetDefaultSignal, writeTab]);

  useEffect(() => {
    if (isCaseTab(urlTab) && urlTab === tab) return;
    writeTab(tab);
  }, [tab, urlTab, writeTab]);

  function onTabChange(value: string | number | null) {
    const next = String(value);
    if (!isCaseTab(next)) return;
    userPicked.current = true;
    setTab(next);
    writeTab(next);
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
        <div className="border-b px-4 py-2 lg:px-6">
          <div className="min-w-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
