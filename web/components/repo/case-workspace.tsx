"use client";

import { CampaignCaseWorkspace } from "@/components/repo/campaign-case-workspace";
import { ReviewWorkspace } from "@/components/review/review-workspace";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  caseKind,
  getSession,
  kindFromCaseId,
  useReviewSessions,
} from "@/lib/sessions";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

export function CaseWorkspace({
  owner,
  repo,
  caseId,
}: {
  owner: string;
  repo: string;
  caseId: string;
}) {
  const sessions = useReviewSessions();
  const live = useMemo(
    () => sessions.find((session) => session.id === caseId) ?? getSession(caseId),
    [sessions, caseId],
  );
  // Prefer id prefix when the localStorage row is missing (shared links / SSR).
  const kind = live ? caseKind(live) : kindFromCaseId(caseId);
  const title = live?.headline ?? live?.prTitle ?? live?.title ?? "Case";
  const casesHref = `/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?tab=cases`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          className="h-4 data-vertical:self-auto"
          orientation="vertical"
        />
        <Button
          aria-label="Back to cases"
          className="gap-1.5"
          nativeButton={false}
          render={<Link href={casesHref} />}
          size="sm"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-3.5" />
          Cases
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-sm">{title}</h1>
          <p className="truncate text-muted-foreground text-xs">
            {owner}/{repo} · {kind === "campaign" ? "Campaign" : "Review"}
          </p>
        </div>
      </header>

      {kind === "campaign" ? (
        <CampaignCaseWorkspace
          owner={owner}
          repo={repo}
          sessionId={caseId}
        />
      ) : (
        <ReviewWorkspace sessionId={caseId} variant="embedded" />
      )}
    </div>
  );
}
