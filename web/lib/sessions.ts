"use client";

import { isMockSessionId } from "@/lib/mock-review";
import { parsePrRef } from "@/lib/pr";
import type { ReviewVerdict } from "@/lib/review";
import { useSyncExternalStore } from "react";

export type CaseKind = "review" | "campaign";

export interface ReviewSession {
  id: string;
  /** Case kind. Missing on legacy rows → inferred from id prefix, else "review". */
  kind?: CaseKind;
  /** The PR reference as the user entered it (URL or owner/repo#N). Empty for campaigns. */
  pr: string;
  /** Display title, e.g. "vercel/next.js#1234" or "Campaign · fixture-boiling-frog". */
  title: string;
  createdAt: number;
  /** The PR's real title, filled in once fetched from GitHub. */
  prTitle?: string;
  /** Verdict of the latest completed review in this session. */
  verdict?: ReviewVerdict;
  /** "owner/repo" this case belongs to, linking it to the repo workspace. */
  repo?: string;
  /** Ledger / fixture case id for campaign investigations. */
  ledgerCaseId?: string;
  /** Latest campaign score from submit_campaign, when available. */
  campaignScore?: number;
  /** Latest campaign headline from submit_campaign, when available. */
  headline?: string;
}

const STORAGE_KEY = "pr-review-sessions";
const listeners = new Set<() => void>();
let cache: ReviewSession[] | null = null;

function read(): ReviewSession[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as ReviewSession[];
    cache = Array.isArray(raw) ? raw : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(sessions: ReviewSession[]) {
  cache = sessions;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: ReviewSession[] = [];

export function useReviewSessions(): ReviewSession[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Synchronous storage snapshot (avoids stale React props on double-click). */
export function listSessions(): ReviewSession[] {
  return read();
}

export function getSession(id: string): ReviewSession | undefined {
  return read().find((session) => session.id === id);
}

export function saveSession(session: ReviewSession) {
  const normalized: ReviewSession = {
    ...session,
    kind: session.kind ?? kindFromCaseId(session.id),
    pr: session.pr ?? "",
  };
  write([normalized, ...read().filter((s) => s.id !== session.id)]);
}

/** Merge fields into a stored session; creates a stub row when missing. */
export function updateSession(
  id: string,
  patch: Partial<Omit<ReviewSession, "id">>,
) {
  const sessions = read();
  const existing = sessions.find((session) => session.id === id);
  if (!existing) {
    saveSession({
      id,
      kind: kindFromCaseId(id),
      pr: "",
      title: patch.title ?? id,
      createdAt: Date.now(),
      ...patch,
    });
    return;
  }
  const dirty = Object.entries(patch).some(
    ([key, value]) => existing[key as keyof ReviewSession] !== value,
  );
  if (!dirty) return;
  write(
    sessions.map((session) =>
      session.id === id ? { ...session, ...patch } : session,
    ),
  );
}

export function removeSession(id: string) {
  write(read().filter((session) => session.id !== id));
}

export function newSessionId(): string {
  return `review-${crypto.randomUUID().slice(0, 13)}`;
}

export function newCampaignSessionId(): string {
  return `campaign-${crypto.randomUUID().slice(0, 13)}`;
}

/** Infer kind from id prefix when localStorage row is missing (shared links). */
export function kindFromCaseId(id: string): CaseKind {
  if (id.startsWith("campaign-")) return "campaign";
  return "review";
}

export function caseKind(session: Pick<ReviewSession, "id" | "kind">): CaseKind {
  return session.kind ?? kindFromCaseId(session.id);
}

/** Resolve owner/repo for a session from explicit repo or PR ref. */
export function resolveSessionRepo(
  session: ReviewSession,
): { owner: string; repo: string } | null {
  if (session.repo) {
    const [owner, repo] = session.repo.split("/");
    if (owner && repo) return { owner, repo };
  }
  const ref = session.pr ? parsePrRef(session.pr) : null;
  if (ref) return { owner: ref.owner, repo: ref.repo };
  return null;
}

export function casePath(session: ReviewSession): string {
  // Demo reviews stay on the standalone review surface (no phantom repo shell).
  if (isMockSessionId(session.id)) {
    return `/review/${encodeURIComponent(session.id)}`;
  }
  const resolved = resolveSessionRepo(session);
  if (resolved) {
    return `/repo/${encodeURIComponent(resolved.owner)}/${encodeURIComponent(resolved.repo)}/case/${encodeURIComponent(session.id)}`;
  }
  return `/review/${encodeURIComponent(session.id)}`;
}

export function sessionBelongsToRepo(
  session: ReviewSession,
  owner: string,
  repo: string,
): boolean {
  const repoRef = `${owner}/${repo}`.toLowerCase();
  if (session.repo?.toLowerCase() === repoRef) return true;
  if (session.pr && session.pr.toLowerCase().includes(repoRef)) return true;
  const resolved = resolveSessionRepo(session);
  return (
    resolved?.owner.toLowerCase() === owner.toLowerCase() &&
    resolved?.repo.toLowerCase() === repo.toLowerCase()
  );
}

export function filterRepoSessions(
  sessions: ReviewSession[],
  owner: string,
  repo: string,
): ReviewSession[] {
  return sessions.filter((session) => sessionBelongsToRepo(session, owner, repo));
}
