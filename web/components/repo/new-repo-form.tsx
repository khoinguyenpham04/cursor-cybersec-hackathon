"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_SPINE, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { MOCK_PR_REF, newMockSessionId } from "@/lib/mock-review";
import { formatPrRef, parsePrRef } from "@/lib/pr";
import { saveRepo, SELF_REPO } from "@/lib/repos";
import { casePath, newSessionId, saveSession } from "@/lib/sessions";
import {
  ArrowRightIcon,
  BinaryIcon,
  PlayIcon,
  ScanSearchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Accepts "owner/repo" or a github.com repository URL (client-side twin of
// parseRepoRef in lib/github.ts, which is server-only).
function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const patterns = [
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/,
    /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return { owner: match[1], repo: match[2] };
  }
  return null;
}

/**
 * One input for both entry points: a PR reference opens a review session, a
 * repository reference opens the repo workspace. Nothing heavy runs here —
 * the repo page waits for an explicit job.
 */
export function NewRepoForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();

    const pr = parsePrRef(trimmed);
    if (pr) {
      const session = {
        id: newSessionId(),
        kind: "review" as const,
        pr: trimmed,
        title: formatPrRef(pr),
        createdAt: Date.now(),
        repo: `${pr.owner}/${pr.repo}`,
      };
      saveSession(session);
      saveRepo(pr.owner, pr.repo);
      router.push(casePath(session));
      return;
    }

    const repo = parseRepo(trimmed);
    if (repo) {
      saveRepo(repo.owner, repo.repo);
      router.push(`/repo/${repo.owner}/${repo.repo}`);
      return;
    }

    setError(
      'Enter a repository ("owner/repo") or a pull request ("owner/repo#123").',
    );
  }

  function openSelf() {
    saveRepo(SELF_REPO.owner, SELF_REPO.repo);
    router.push(`/repo/${SELF_REPO.owner}/${SELF_REPO.repo}`);
  }

  function startDemoReview() {
    const session = {
      id: newMockSessionId(),
      kind: "review" as const,
      pr: MOCK_PR_REF,
      title: `Demo · ${MOCK_PR_REF}`,
      createdAt: Date.now(),
    };
    saveSession(session);
    router.push(casePath(session));
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted">
          <ScanSearchIcon className="size-6 text-primary" />
        </div>
        <h1 className="font-semibold text-2xl tracking-tight">{PRODUCT_NAME}</h1>
        <p className="max-w-md text-muted-foreground text-sm text-pretty">
          {PRODUCT_TAGLINE}
        </p>
        <p className="max-w-md text-foreground text-sm text-pretty">
          {DEMO_SPINE}
        </p>
      </div>
      <form className="flex w-full max-w-xl items-center gap-2" onSubmit={submit}>
        <Input
          autoFocus
          className="h-11"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder="owner/repo  ·  or  owner/repo#123"
          value={value}
        />
        <Button className="h-11 gap-1.5 px-4" disabled={!value.trim()} type="submit">
          Open
          <ArrowRightIcon className="size-4" />
        </Button>
      </form>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button className="gap-1.5" onClick={openSelf} size="sm" variant="default">
          <BinaryIcon className="size-3.5" />
          Start demo spine
        </Button>
        <Button
          className="gap-1.5 text-muted-foreground"
          onClick={startDemoReview}
          size="sm"
          variant="ghost"
        >
          <PlayIcon className="size-3.5" />
          Offline review backup
        </Button>
      </div>
    </div>
  );
}
