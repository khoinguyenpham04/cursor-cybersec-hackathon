import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { getFileContent, getPr, getPrFiles, parsePrRef } from '../lib/github.ts';

const prInput = v.pipe(
	v.string(),
	v.description('PR reference: a github.com URL, "owner/repo#123", or "owner/repo/pull/123"'),
);

export const fetchPr = defineTool({
	name: 'fetch_pr',
	description:
		'Fetch pull request metadata (title, description, author, branches, head SHA, change stats). Call this first for any PR review.',
	input: v.object({ pr: prInput }),
	async run({ data, log }) {
		const ref = parsePrRef(data.pr);
		if (!ref) return { output: { error: `Could not parse PR reference: "${data.pr}"` } };
		log.info(`Fetching PR ${ref.owner}/${ref.repo}#${ref.number}`);
		try {
			return { output: await getPr(ref) };
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

export const fetchPrDiff = defineTool({
	name: 'fetch_pr_diff',
	description:
		'Fetch the list of changed files in a pull request, each with its unified diff patch. Large patches are truncated — use fetch_file to read full file content when you need surrounding context.',
	input: v.object({ pr: prInput }),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		const ref = parsePrRef(data.pr);
		if (!ref) return { output: { error: `Could not parse PR reference: "${data.pr}"` } };
		log.info(`Fetching diff for ${ref.owner}/${ref.repo}#${ref.number}`);
		try {
			return { output: { files: await getPrFiles(ref) } };
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

export const fetchFile = defineTool({
	name: 'fetch_file',
	description:
		'Fetch the full content of one file from the repository at a given ref (defaults to the PR head SHA from fetch_pr). Use when a diff hunk needs surrounding context to judge correctness.',
	input: v.object({
		pr: prInput,
		path: v.pipe(v.string(), v.description('Repo-relative file path, e.g. "src/index.ts"')),
		ref: v.optional(
			v.pipe(v.string(), v.description('Git ref (branch or SHA). Defaults to the PR head branch.')),
		),
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		const ref = parsePrRef(data.pr);
		if (!ref) return { output: { error: `Could not parse PR reference: "${data.pr}"` } };
		try {
			const gitRef = data.ref ?? (await getPr(ref)).headSha;
			log.info(`Fetching ${data.path} @ ${gitRef.slice(0, 12)}`);
			return { output: { path: data.path, ref: gitRef, content: await getFileContent(ref, data.path, gitRef) } };
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});
