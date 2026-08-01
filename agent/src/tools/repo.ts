import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { filterTree, ingestRepo, parseRepoRef, readRepoFile } from '../lib/repo.ts';

const repoInput = v.pipe(
	v.string(),
	v.description('Repository reference: "owner/repo" or a github.com repository URL'),
);

function manifestHighlights(keyFiles: Record<string, string>) {
	const manifests: Array<{
		path: string;
		name?: string;
		dependencies?: number;
		devDependencies?: number;
		scripts?: string[];
	}> = [];
	for (const [path, content] of Object.entries(keyFiles)) {
		if (!path.endsWith('package.json')) continue;
		try {
			const parsed = JSON.parse(content) as Record<string, any>;
			manifests.push({
				path,
				name: parsed.name,
				dependencies: Object.keys(parsed.dependencies ?? {}).length,
				devDependencies: Object.keys(parsed.devDependencies ?? {}).length,
				scripts: Object.keys(parsed.scripts ?? {}),
			});
		} catch {
			manifests.push({ path });
		}
	}
	return manifests;
}

export const ingestRepoTool = defineTool({
	name: 'ingest_repo',
	description:
		'Ingest a GitHub repository: metadata, the full file tree, and key files (manifests, README, CI, framework configs). Call this FIRST for any repository work — every other repo tool reads from this ingest. Returns a summary; use repo_tree / read_repo_file / search_repo to go deeper.',
	input: v.object({
		repo: repoInput,
		force: v.optional(
			v.pipe(v.boolean(), v.description('Re-ingest even if a fresh cache exists.')),
		),
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		const ref = parseRepoRef(data.repo);
		if (!ref) return { output: { error: `Could not parse repository reference: "${data.repo}"` } };
		log.info(`Ingesting ${ref.owner}/${ref.repo}`);
		try {
			const ingest = await ingestRepo(ref, { force: data.force });
			const topLevel = new Map<string, number>();
			for (const entry of ingest.tree) {
				if (entry.type !== 'blob') continue;
				const root = entry.path.includes('/') ? `${entry.path.split('/')[0]}/` : entry.path;
				topLevel.set(root, (topLevel.get(root) ?? 0) + 1);
			}
			return {
				output: {
					repo: `${ref.owner}/${ref.repo}`,
					defaultBranch: ingest.defaultBranch,
					headSha: ingest.headSha.slice(0, 12),
					...ingest.meta,
					files: ingest.tree.filter((entry) => entry.type === 'blob').length,
					treeTruncated: ingest.treeTruncated,
					topLevel: Object.fromEntries(
						[...topLevel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
					),
					keyFiles: Object.keys(ingest.keyFiles),
					manifests: manifestHighlights(ingest.keyFiles),
				},
			};
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

export const repoTree = defineTool({
	name: 'repo_tree',
	description:
		'List file paths from the ingested repository tree, filtered by directory and/or glob (e.g. "src/**/*.ts"). Cheap — reads the cached ingest.',
	input: v.object({
		repo: repoInput,
		dir: v.optional(v.pipe(v.string(), v.description('Directory prefix, e.g. "src/agents"'))),
		glob: v.optional(v.pipe(v.string(), v.description('Glob over full paths, e.g. "**/*.config.*"'))),
		maxEntries: v.optional(v.pipe(v.number(), v.description('Cap on returned paths (default 200)'))),
	}),
	async run({ data }): Promise<{ output: JsonValue }> {
		const ref = parseRepoRef(data.repo);
		if (!ref) return { output: { error: `Could not parse repository reference: "${data.repo}"` } };
		try {
			const ingest = await ingestRepo(ref);
			const { paths, total } = filterTree(ingest, {
				dir: data.dir,
				glob: data.glob,
				max: data.maxEntries ?? 200,
			});
			return { output: { paths, total, truncatedTree: ingest.treeTruncated } };
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

export const readRepoFileTool = defineTool({
	name: 'read_repo_file',
	description:
		'Read one file from the ingested repository at its head commit (50k char cap). Prefer a few targeted reads of entrypoints/configs over guessing.',
	input: v.object({
		repo: repoInput,
		path: v.pipe(v.string(), v.description('Repo-relative file path, e.g. "src/index.ts"')),
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		const ref = parseRepoRef(data.repo);
		if (!ref) return { output: { error: `Could not parse repository reference: "${data.repo}"` } };
		log.info(`Reading ${data.path}`);
		try {
			return { output: { path: data.path, content: await readRepoFile(ref, data.path) } };
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

const SEARCH_MATCH_CAP = 100;

export const searchRepo = defineTool({
	name: 'search_repo',
	description:
		'Search for a string (case-insensitive) across the files already ingested or read in this repository — key files plus anything read_repo_file has fetched. It does NOT search un-fetched files; use repo_tree + read_repo_file to widen the searched set first.',
	input: v.object({
		repo: repoInput,
		query: v.pipe(v.string(), v.minLength(2), v.description('Literal text to find')),
		glob: v.optional(v.pipe(v.string(), v.description('Limit to paths matching this glob'))),
	}),
	async run({ data }): Promise<{ output: JsonValue }> {
		const ref = parseRepoRef(data.repo);
		if (!ref) return { output: { error: `Could not parse repository reference: "${data.repo}"` } };
		try {
			const ingest = await ingestRepo(ref);
			const needle = data.query.toLowerCase();
			const globPattern = data.glob
				? new RegExp(
						`^${data.glob
							.replace(/[.+^${}()|[\]\\]/g, '\\$&')
							.replace(/\*\*/g, '\u0000')
							.replace(/\*/g, '[^/]*')
							.replace(/\u0000/g, '.*')
							.replace(/\?/g, '.')}$`,
					)
				: null;
			const matches: string[] = [];
			const searched: string[] = [];
			for (const [path, content] of Object.entries(ingest.keyFiles)) {
				if (globPattern && !globPattern.test(path)) continue;
				searched.push(path);
				const lines = content.split('\n');
				for (let i = 0; i < lines.length && matches.length < SEARCH_MATCH_CAP; i++) {
					if (lines[i].toLowerCase().includes(needle)) {
						matches.push(`${path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
					}
				}
				if (matches.length >= SEARCH_MATCH_CAP) break;
			}
			return {
				output: {
					matches,
					searchedFiles: searched.length,
					note: 'Search covers ingested/read files only, not the whole repository.',
				},
			};
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});
