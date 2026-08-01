// Whole-repo ingestion over the GitHub REST API, with a simple on-disk JSON
// cache. This is what lets every agent work "ingest-first": one ingestRepo()
// call captures the repo's metadata, full file tree, and a curated set of key
// files (manifests, README, CI, framework configs); further files are read on
// demand and appended to the same cache so later calls — and other processes
// reading the cache — share them.
//
// Works unauthenticated for public repos (60 req/h; an ingest costs roughly
// 3 + keyFiles requests). Set GITHUB_TOKEN in .env for private repos and
// higher limits.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { getFileContent, ghFetch } from './github.ts';

export interface RepoRef {
	owner: string;
	repo: string;
}

// Accepts "owner/repo", "https://github.com/owner/repo" (optionally with
// .git or a trailing path), but NOT PR references (those are parsePrRef's).
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

export function formatRepoRef(ref: RepoRef): string {
	return `${ref.owner}/${ref.repo}`;
}

export interface RepoIngest {
	fetchedAt: number;
	ref: RepoRef;
	defaultBranch: string;
	headSha: string;
	meta: {
		description: string | null;
		language: string | null;
		topics: string[];
		stars: number;
		pushedAt: string;
	};
	tree: Array<{ path: string; type: 'blob' | 'tree'; size?: number }>;
	treeTruncated: boolean;
	/** path -> content (50k/file cap). Grows as read_repo_file pulls more. */
	keyFiles: Record<string, string>;
}

const CACHE_DIR = './data/repos';
const CACHE_TTL_MS = 15 * 60_000;
const MAX_KEY_FILES = 40;
const KEY_FILE_CONCURRENCY = 4;

// Files worth ingesting up front: manifests, docs, CI, and framework configs.
// Lockfiles are deliberately excluded — they are huge, and the dependency
// layer fetches them raw when it needs them; their presence still shows in
// the tree.
const KEY_FILE_PATTERNS: RegExp[] = [
	/(^|\/)package\.json$/,
	/(^|\/)pyproject\.toml$/,
	/(^|\/)requirements\.txt$/,
	/(^|\/)Cargo\.toml$/,
	/(^|\/)go\.mod$/,
	/^README(\.(md|rst|txt))?$/i,
	/(^|\/)Dockerfile$/,
	/(^|\/)docker-compose[^/]*\.ya?ml$/,
	/^\.github\/workflows\/[^/]+\.ya?ml$/,
	/(^|\/)(next|vite|nuxt|astro|remix|svelte|tailwind|flue)\.config\.[cm]?[jt]s$/,
	/(^|\/)wrangler\.(toml|jsonc?)$/,
];

function cachePath(ref: RepoRef): string {
	return nodePath.join(CACHE_DIR, `${ref.owner}__${ref.repo}.json`);
}

async function loadCache(ref: RepoRef): Promise<RepoIngest | null> {
	try {
		return JSON.parse(await readFile(cachePath(ref), 'utf8')) as RepoIngest;
	} catch {
		return null;
	}
}

async function saveCache(ingest: RepoIngest): Promise<void> {
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(cachePath(ingest.ref), JSON.stringify(ingest));
}

function pickKeyFiles(tree: RepoIngest['tree']): string[] {
	const matches = tree
		.filter(
			(entry) =>
				entry.type === 'blob' &&
				KEY_FILE_PATTERNS.some((pattern) => pattern.test(entry.path)) &&
				!entry.path.includes('node_modules/'),
		)
		.map((entry) => entry.path)
		// Shallow files first: the root manifest beats a fixture's.
		.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
	return matches.slice(0, MAX_KEY_FILES);
}

export async function ingestRepo(
	ref: RepoRef,
	options: { force?: boolean } = {},
): Promise<RepoIngest> {
	const cached = await loadCache(ref);
	if (!options.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
		return cached;
	}

	const repoResponse = await ghFetch(`/repos/${ref.owner}/${ref.repo}`);
	const repo = (await repoResponse.json()) as Record<string, any>;
	const defaultBranch = repo.default_branch as string;

	const branchResponse = await ghFetch(
		`/repos/${ref.owner}/${ref.repo}/branches/${encodeURIComponent(defaultBranch)}`,
	);
	const branch = (await branchResponse.json()) as Record<string, any>;
	const headSha = branch.commit?.sha as string;

	// Same head as the cache: refresh the timestamp instead of refetching.
	if (!options.force && cached && cached.headSha === headSha) {
		const refreshed = { ...cached, fetchedAt: Date.now() };
		await saveCache(refreshed);
		return refreshed;
	}

	const treeResponse = await ghFetch(
		`/repos/${ref.owner}/${ref.repo}/git/trees/${headSha}?recursive=1`,
	);
	const treeBody = (await treeResponse.json()) as Record<string, any>;
	const tree: RepoIngest['tree'] = ((treeBody.tree as Array<Record<string, any>>) ?? []).map(
		(entry) => ({
			path: entry.path as string,
			type: entry.type === 'blob' ? 'blob' : 'tree',
			...(typeof entry.size === 'number' ? { size: entry.size } : {}),
		}),
	);

	const keyFilePaths = pickKeyFiles(tree);
	const keyFiles: Record<string, string> = {};
	// Small worker pool over the contents API.
	let cursor = 0;
	await Promise.all(
		Array.from({ length: KEY_FILE_CONCURRENCY }, async () => {
			while (cursor < keyFilePaths.length) {
				const path = keyFilePaths[cursor++];
				try {
					keyFiles[path] = await getFileContent(ref, path, headSha);
				} catch {
					// A missing/unreadable key file is not fatal to the ingest.
				}
			}
		}),
	);

	const ingest: RepoIngest = {
		fetchedAt: Date.now(),
		ref,
		defaultBranch,
		headSha,
		meta: {
			description: (repo.description as string | null) ?? null,
			language: (repo.language as string | null) ?? null,
			topics: (repo.topics as string[]) ?? [],
			stars: (repo.stargazers_count as number) ?? 0,
			pushedAt: (repo.pushed_at as string) ?? '',
		},
		tree,
		treeTruncated: Boolean(treeBody.truncated),
		keyFiles,
	};
	await saveCache(ingest);
	return ingest;
}

/** Cache-first single-file read at the ingested head SHA. */
export async function readRepoFile(ref: RepoRef, path: string): Promise<string> {
	const ingest = await ingestRepo(ref);
	const cached = ingest.keyFiles[path];
	if (cached !== undefined) return cached;
	const content = await getFileContent(ref, path, ingest.headSha);
	ingest.keyFiles[path] = content;
	await saveCache(ingest);
	return content;
}

function globToRegExp(glob: string): RegExp {
	const escaped = glob
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*\*/g, '\u0000')
		.replace(/\*/g, '[^/]*')
		.replace(/\u0000/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`);
}

/** Filter the ingested tree's file paths by directory prefix and/or glob. */
export function filterTree(
	ingest: RepoIngest,
	options: { glob?: string; dir?: string; max?: number } = {},
): { paths: string[]; total: number } {
	const { glob, dir, max = 200 } = options;
	const pattern = glob ? globToRegExp(glob) : null;
	const prefix = dir ? `${dir.replace(/\/$/, '')}/` : null;
	const all = ingest.tree
		.filter((entry) => entry.type === 'blob')
		.map((entry) => entry.path)
		.filter((path) => (prefix ? path.startsWith(prefix) : true))
		.filter((path) => (pattern ? pattern.test(path) : true));
	return { paths: all.slice(0, max), total: all.length };
}
