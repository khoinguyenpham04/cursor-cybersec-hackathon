"use client";

import { useSyncExternalStore } from "react";

export interface ReviewSession {
  id: string;
  /** The PR reference as the user entered it (URL or owner/repo#N). */
  pr: string;
  /** Display title, e.g. "vercel/next.js#1234". */
  title: string;
  createdAt: number;
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

export function removeSession(id: string) {
  write(read().filter((s) => s.id !== id));
}

export function newSessionId(): string {
  return `review-${crypto.randomUUID().slice(0, 13)}`;
}
