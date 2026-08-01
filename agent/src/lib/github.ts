// Thin GitHub REST client used by the PR review tools. Works unauthenticated
// for public repos (60 req/h); set GITHUB_TOKEN in .env for private repos and
// higher rate limits.

const GITHUB_API = 'https://api.github.com';

export interface PrRef {
	owner: string;
	repo: string;
	number: number;
}

// Accepts "https://github.com/owner/repo/pull/123", "owner/repo#123",
// or "owner/repo/pull/123".
export function parsePrRef(input: string): PrRef | null {
	const trimmed = input.trim();
	const patterns = [
		/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/,
		/^([\w.-]+)\/([\w.-]+)#(\d+)$/,
		/^([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/,
	];
	for (const pattern of patterns) {
		const match = trimmed.match(pattern);
		if (match) return { owner: match[1], repo: match[2], number: Number(match[3]) };
	}
	return null;
}

export async function ghFetch(path: string, accept = 'application/vnd.github+json'): Promise<Response> {
	const headers: Record<string, string> = {
		Accept: accept,
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'flue-pr-reviewer',
	};
	const token = process.env.GITHUB_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;

	const response = await fetch(`${GITHUB_API}${path}`, { headers });
	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`GitHub API ${response.status} for ${path}: ${body.slice(0, 300)}`);
	}
	return response;
}

export async function getPr(ref: PrRef) {
	const response = await ghFetch(`/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
	const pr = (await response.json()) as Record<string, any>;
	return {
		title: pr.title as string,
		body: ((pr.body as string | null) ?? '').slice(0, 8000),
		author: pr.user?.login as string,
		state: pr.state as string,
		draft: pr.draft as boolean,
		baseBranch: pr.base?.ref as string,
		headBranch: pr.head?.ref as string,
		headSha: pr.head?.sha as string,
		additions: pr.additions as number,
		deletions: pr.deletions as number,
		changedFiles: pr.changed_files as number,
		commits: pr.commits as number,
		url: pr.html_url as string,
	};
}

const PATCH_CHAR_LIMIT = 12_000;
const TOTAL_PATCH_CHAR_LIMIT = 160_000;

export async function getPrFiles(ref: PrRef) {
	const files: Array<{
		path: string;
		status: string;
		additions: number;
		deletions: number;
		patch: string | null;
	}> = [];
	let totalPatchChars = 0;

	for (let page = 1; page <= 3; page++) {
		const response = await ghFetch(
			`/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100&page=${page}`,
		);
		const batch = (await response.json()) as Array<Record<string, any>>;
		for (const file of batch) {
			let patch = (file.patch as string | undefined) ?? null;
			if (patch) {
				if (patch.length > PATCH_CHAR_LIMIT) {
					patch = `${patch.slice(0, PATCH_CHAR_LIMIT)}\n... [patch truncated; fetch_file for full content]`;
				}
				if (totalPatchChars + patch.length > TOTAL_PATCH_CHAR_LIMIT) {
					patch = '[patch omitted: total diff budget exceeded; fetch_file if this file matters]';
				}
				totalPatchChars += patch.length;
			}
			files.push({
				path: file.filename as string,
				status: file.status as string,
				additions: file.additions as number,
				deletions: file.deletions as number,
				patch,
			});
		}
		if (batch.length < 100) break;
	}
	return files;
}

const FILE_CHAR_LIMIT = 50_000;

export async function getFileContent(
	ref: { owner: string; repo: string },
	path: string,
	gitRef: string,
) {
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	const response = await ghFetch(
		`/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}?ref=${encodeURIComponent(gitRef)}`,
		'application/vnd.github.raw+json',
	);
	const text = await response.text();
	return text.length > FILE_CHAR_LIMIT
		? `${text.slice(0, FILE_CHAR_LIMIT)}\n... [file truncated at ${FILE_CHAR_LIMIT} chars]`
		: text;
}
