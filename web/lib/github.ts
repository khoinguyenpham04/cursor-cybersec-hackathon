// Server-side GitHub client backing /api/github/pr — powers the diff pane.
// The agent has its own copy of this logic (agent/src/lib/github.ts); the two
// processes don't share code so each app stays independently deployable.

import type { PrRef } from "./pr";

const GITHUB_API = "https://api.github.com";

async function ghFetch(path: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "flue-pr-reviewer-web",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${GITHUB_API}${path}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API ${response.status} for ${path}: ${body.slice(0, 200)}`,
    );
  }
  return response;
}

export interface PrMeta {
  title: string;
  body: string;
  author: string;
  state: string;
  draft: boolean;
  merged: boolean;
  baseBranch: string;
  headBranch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  url: string;
}

export interface PrFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export async function getPrMeta(ref: PrRef): Promise<PrMeta> {
  const response = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
  );
  const pr = (await response.json()) as Record<string, any>;
  return {
    title: pr.title,
    body: pr.body ?? "",
    author: pr.user?.login ?? "",
    state: pr.state,
    draft: Boolean(pr.draft),
    merged: Boolean(pr.merged),
    baseBranch: pr.base?.ref ?? "",
    headBranch: pr.head?.ref ?? "",
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    url: pr.html_url,
  };
}

export async function getPrFiles(ref: PrRef): Promise<PrFile[]> {
  const files: PrFile[] = [];
  for (let page = 1; page <= 3; page++) {
    const response = await ghFetch(
      `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100&page=${page}`,
    );
    const batch = (await response.json()) as Array<Record<string, any>>;
    for (const file of batch) {
      files.push({
        path: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch ?? null,
      });
    }
    if (batch.length < 100) break;
  }
  return files;
}
