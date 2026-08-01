"use client";

import { NewReviewForm } from "@/components/review/new-review-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  campaignCasePath,
  ensureCampaignDemoSession,
} from "@/lib/campaign-demo";
import {
  DEMO_DEFAULT_PR,
  DEMO_SEQUENCE_PRS,
  demoPrUrl,
  isDemoRepo,
} from "@/lib/fixtures/boiling-frog";
import { formatPrRef, parsePrRef } from "@/lib/pr";
import {
  caseKind,
  casePath,
  filterRepoSessions,
  newSessionId,
  saveSession,
  useReviewSessions,
} from "@/lib/sessions";
import {
  ExternalLinkIcon,
  GitPullRequestIcon,
  PlusIcon,
  ShieldAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RepoCases({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter();
  const sessions = useReviewSessions();
  const repoSessions = useMemo(
    () => filterRepoSessions(sessions, owner, repo),
    [sessions, owner, repo],
  );
  const [showReviewForm, setShowReviewForm] = useState(false);
  const showDemoSequence = isDemoRepo(owner, repo);

  function startCampaign() {
    const session = ensureCampaignDemoSession(owner, repo);
    router.push(campaignCasePath(owner, repo, session.id));
  }

  function openDemoPr(prNumber: number) {
    const pr = `${owner}/${repo}#${prNumber}`;
    const ref = parsePrRef(pr);
    if (!ref) return;
    const session = {
      id: newSessionId(),
      kind: "review" as const,
      pr,
      title: formatPrRef(ref),
      createdAt: Date.now(),
      repo: `${owner}/${repo}`,
    };
    saveSession(session);
    router.push(casePath(session));
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="font-semibold text-lg">Cases</h2>
            <p className="text-muted-foreground text-sm text-pretty">
              {showDemoSequence
                ? "Demo spine: open PR #9 (default), then Investigate sequence."
                : "PR reviews and campaign investigations for this repository."}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              className="w-full gap-1.5 sm:w-auto"
              onClick={() => setShowReviewForm((open) => !open)}
              size="sm"
              variant={showReviewForm ? "secondary" : "outline"}
            >
              <PlusIcon className="size-3.5" />
              New review
            </Button>
            <Button
              className="w-full gap-1.5 sm:w-auto"
              onClick={startCampaign}
              size="sm"
            >
              <ShieldAlertIcon className="size-3.5" />
              Investigate sequence
            </Button>
          </div>
        </div>

        {showDemoSequence && (
          <section className="space-y-3 rounded-lg border px-4 py-3">
            <div className="space-y-1">
              <h3 className="font-medium text-sm">Boiling-frog sequence</h3>
              <p className="text-muted-foreground text-xs text-pretty">
                Live substrate PRs #8–#11. For a short pitch, open{" "}
                <span className="font-medium text-foreground">#9</span> only,
                then run Investigate sequence.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {DEMO_SEQUENCE_PRS.map((entry) => {
                const recommended = entry.number === DEMO_DEFAULT_PR;
                return (
                  <li
                    className="flex flex-wrap items-center gap-2"
                    key={entry.number}
                  >
                    <Button
                      className="gap-1.5"
                      onClick={() => openDemoPr(entry.number)}
                      size="sm"
                      variant={recommended ? "default" : "outline"}
                    >
                      <GitPullRequestIcon className="size-3.5" />
                      #{entry.number}
                      {recommended ? " · start here" : ""}
                    </Button>
                    <span className="min-w-0 flex-1 text-sm text-pretty">
                      <span className="font-medium">{entry.title}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {entry.blurb}
                      </span>
                    </span>
                    <a
                      className="inline-flex items-center gap-1 text-muted-foreground text-xs underline-offset-4 hover:underline"
                      href={demoPrUrl(entry.number)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      GitHub
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {showReviewForm && (
          <div className="rounded-lg border p-4">
            <NewReviewForm
              compact
              onStarted={() => setShowReviewForm(false)}
              owner={owner}
              repo={repo}
            />
          </div>
        )}

        {repoSessions.length > 0 ? (
          <div className="flex flex-col gap-2">
            {repoSessions.map((session) => {
              const kind = caseKind(session);
              return (
                <Link
                  className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-accent"
                  href={casePath(session)}
                  key={session.id}
                >
                  {kind === "campaign" ? (
                    <ShieldAlertIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <GitPullRequestIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {session.headline ?? session.prTitle ?? session.title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {kind === "campaign" ? "Campaign" : "Review"} ·{" "}
                      {timeAgo(session.createdAt)}
                    </p>
                  </div>
                  {kind === "campaign" && session.campaignScore !== undefined && (
                    <Badge className="text-[10px]" variant="outline">
                      score {session.campaignScore}
                    </Badge>
                  )}
                  {kind === "review" && session.verdict && (
                    <Badge className="text-[10px]" variant="outline">
                      {session.verdict.replace("_", " ")}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          !showReviewForm &&
          !showDemoSequence && (
            <p className="text-muted-foreground text-sm">
              No cases yet. Start a PR review or investigate the boiling-frog
              fixture sequence.
            </p>
          )
        )}
      </div>
    </div>
  );
}
