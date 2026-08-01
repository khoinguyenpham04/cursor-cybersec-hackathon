"use client";

// Locally tracked repositories, mirroring lib/sessions.ts (localStorage +
// useSyncExternalStore). A repo entry is just a bookmark: the expensive
// artefacts (ingest, scan, dependency graph) live in the agent's cache and the
// durable scan conversation, and are only produced when the user runs a job.

import { useSyncExternalStore } from "react";

export interface RepoEntry {
  /** "owner/repo" — also the storage key. */
  id: string;
  owner: string;
  repo: string;
  addedAt: number;
  description?: string;
  defaultBranch?: string;
  /** When a scan last completed, for the jobs panel. */
  lastScanAt?: number;
  /** Node count of the last scan, for the sidebar. */
  lastScanNodes?: number;
}

const STORAGE_KEY = "tracked-repos";
const listeners = new Set<() => void>();
let cache: RepoEntry[] | null = null;

/** The app's own repository — the default demo target. */
export const SELF_REPO = {
  owner: "khoinguyenpham04",
  repo: "cursor-cybersec-hackathon",
};

export function repoId(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function read(): RepoEntry[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    cache = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache!;
}

function write(repos: RepoEntry[]) {
  cache = repos;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: RepoEntry[] = [];

export function useRepos(): RepoEntry[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function getRepoEntry(id: string): RepoEntry | undefined {
  return read().find((entry) => entry.id === id);
}

export function saveRepo(owner: string, repo: string): RepoEntry {
  const id = repoId(owner, repo);
  const existing = getRepoEntry(id);
  if (existing) return existing;
  const entry: RepoEntry = { id, owner, repo, addedAt: Date.now() };
  write([entry, ...read()]);
  return entry;
}

export function updateRepo(id: string, patch: Partial<Omit<RepoEntry, "id">>) {
  const repos = read();
  const existing = repos.find((entry) => entry.id === id);
  if (!existing) return;
  const dirty = Object.entries(patch).some(
    ([key, value]) => existing[key as keyof RepoEntry] !== value,
  );
  if (!dirty) return;
  write(repos.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
}

export function removeRepo(id: string) {
  write(read().filter((entry) => entry.id !== id));
}
