// Server-side GitHub client backing /api/github/pr — powers the diff pane.
// The agent has its own copy of this logic (agent/src/lib/github.ts); the two
// processes don't share code so each app stays independently deployable.

import type { PrRef } from "./pr";

const GITHUB_API = "https://api.github.com";

async function ghFetch(
  path: string,
  accept = "application/vnd.github+json",
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: accept,
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

export interface RepoRef {
  owner: string;
  repo: string;
}

// Accepts "owner/repo" or a github.com repository URL. Mirrors
// parseRepoRef in agent/src/lib/repo.ts.
export function parseRepoRef(input: string): RepoRef | null {
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

export interface RepoInfo {
  defaultBranch: string;
  description: string | null;
  language: string | null;
  stars: number;
  url: string;
}

export async function getRepo(ref: RepoRef): Promise<RepoInfo> {
  const response = await ghFetch(`/repos/${ref.owner}/${ref.repo}`);
  const repo = (await response.json()) as Record<string, any>;
  return {
    defaultBranch: repo.default_branch,
    description: repo.description ?? null,
    language: repo.language ?? null,
    stars: repo.stargazers_count ?? 0,
    url: repo.html_url,
  };
}

/** File paths in the repo tree at a ref (one recursive request). */
export async function getRepoTree(
  ref: RepoRef,
  gitRef: string,
): Promise<{ paths: string[]; truncated: boolean }> {
  const response = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(gitRef)}?recursive=1`,
  );
  const body = (await response.json()) as Record<string, any>;
  const paths = ((body.tree as Array<Record<string, any>>) ?? [])
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path as string);
  return { paths, truncated: Boolean(body.truncated) };
}

/** Raw file content at a ref. Lockfiles are large, so no char cap here. */
export async function getRawFile(
  ref: RepoRef,
  path: string,
  gitRef: string,
): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}?ref=${encodeURIComponent(gitRef)}`,
    "application/vnd.github.raw+json",
  );
  return response.text();
}
