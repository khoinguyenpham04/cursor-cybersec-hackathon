"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MOCK_PR_REF, newMockSessionId } from "@/lib/mock-review";
import { formatPrRef, parsePrRef } from "@/lib/pr";
import { casePath, newSessionId, saveSession } from "@/lib/sessions";
import { ArrowRightIcon, GitPullRequestIcon, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewReviewForm({
  owner,
  repo,
  onStarted,
  compact = false,
}: {
  owner?: string;
  repo?: string;
  onStarted?: () => void;
  /** Tighter layout when embedded in the Cases tab. */
  compact?: boolean;
}) {
  const router = useRouter();
  const repoRef = owner && repo ? `${owner}/${repo}` : undefined;
  const [value, setValue] = useState(repoRef ? `${repoRef}#` : "");
  const [error, setError] = useState<string | null>(null);

  function start(event: React.FormEvent) {
    event.preventDefault();
    const ref = parsePrRef(value);
    if (!ref) {
      setError(
        'Enter a PR link like "https://github.com/owner/repo/pull/123" or "owner/repo#123".',
      );
      return;
    }
    if (owner && repo && (ref.owner !== owner || ref.repo !== repo)) {
      setError(`This workspace is for ${owner}/${repo}. Paste a PR from that repo.`);
      return;
    }
    const session = {
      id: newSessionId(),
      kind: "review" as const,
      pr: value.trim(),
      title: formatPrRef(ref),
      createdAt: Date.now(),
      repo: `${ref.owner}/${ref.repo}`,
    };
    saveSession(session);
    onStarted?.();
    router.push(casePath(session));
  }

  function startDemo() {
    const session = {
      id: newMockSessionId(),
      kind: "review" as const,
      pr: MOCK_PR_REF,
      title: `Demo · ${MOCK_PR_REF}`,
      createdAt: Date.now(),
      repo: repoRef,
    };
    saveSession(session);
    onStarted?.();
    router.push(casePath(session));
  }

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-4"
          : "flex flex-1 flex-col items-center justify-center gap-6 px-6"
      }
    >
      {!compact && (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border bg-muted">
            <GitPullRequestIcon className="size-6 text-primary" />
          </div>
          <h1 className="font-semibold text-2xl tracking-tight">
            Review a pull request
          </h1>
          <p className="max-w-md text-muted-foreground text-sm">
            Paste a GitHub pull request link. The agent fetches the diff, reviews
            every change, and reports findings you can dig into.
          </p>
        </div>
      )}
      {compact && (
        <p className="text-muted-foreground text-sm">
          Paste a PR{repoRef ? ` for ${repoRef}` : ""} to start a review case.
        </p>
      )}
      <form
        className={
          compact
            ? "flex w-full flex-col gap-2 sm:flex-row sm:items-center"
            : "flex w-full max-w-xl items-center gap-2"
        }
        onSubmit={start}
      >
        <Input
          autoFocus
          className="h-11"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder={
            repoRef
              ? `https://github.com/${repoRef}/pull/123`
              : "https://github.com/owner/repo/pull/123"
          }
          value={value}
        />
        <Button
          className="h-11 gap-1.5 px-4"
          disabled={!value.trim()}
          type="submit"
        >
          Review
          <ArrowRightIcon className="size-4" />
        </Button>
      </form>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!repoRef && (
        <Button
          className="gap-1.5 text-muted-foreground"
          onClick={startDemo}
          size="sm"
          variant="ghost"
        >
          <PlayIcon className="size-3.5" />
          Watch a demo review — no API key needed
        </Button>
      )}
    </div>
  );
}
