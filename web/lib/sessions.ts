"use client";

import type { ReviewVerdict } from "@/lib/review";
import { useSyncExternalStore } from "react";

export interface ReviewSession {
  id: string;
  /** The PR reference as the user entered it (URL or owner/repo#N). */
  pr: string;
  /** Display title, e.g. "vercel/next.js#1234". */
  title: string;
  createdAt: number;
  /** The PR's real title, filled in once fetched from GitHub. */
  prTitle?: string;
  /** Verdict of the latest completed review in this session. */
  verdict?: ReviewVerdict;
  /** "owner/repo" this review belongs to, linking it to the repo workspace. */
  repo?: string;
}

const STORAGE_KEY = "pr-review-sessions";
const listeners = new Set<() => void>();
let cache: ReviewSession[] | null = null;

function read(): ReviewSession[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    cache = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
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

export function getSession(id: string): ReviewSession | undefined {
  return read().find((session) => session.id === id);
}

export function saveSession(session: ReviewSession) {
  write([session, ...read().filter((s) => s.id !== session.id)]);
}

/** Merge fields into a stored session; no-ops when nothing would change. */
export function updateSession(
  id: string,
  patch: Partial<Omit<ReviewSession, "id">>,
) {
  const sessions = read();
  const existing = sessions.find((session) => session.id === id);
  if (!existing) return;
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
  write(read().filter((s) => s.id !== id));
}

export function newSessionId(): string {
  return `review-${crypto.randomUUID().slice(0, 13)}`;
}
