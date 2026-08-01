'use agent';
import { useModel, useSkill, useTool } from '@flue/runtime';
import repoScanner from '../skills/repo-scanner/SKILL.md';
import { ingestRepoTool, readRepoFileTool, repoTree, searchRepo } from '../tools/repo.ts';
import { submitScan } from '../tools/scan.ts';

// Scans one repository per conversation (id convention: scan-{owner}--{repo})
// and delivers a foglamp-style architecture map via submit_scan. The scan
// protocol (taxonomy, caps, grouping rules) lives in the repo-scanner skill.
export function RepoScanner() {
	// Any Pi 'provider/model-id' works; falls back to the reviewer's model so
	// one env var can drive both agents ('||' skips empty env values).
	useModel(
		process.env.REPO_SCANNER_MODEL ||
			process.env.PR_REVIEWER_MODEL ||
			'anthropic/claude-opus-5',
	);
	useTool(ingestRepoTool);
	useTool(repoTree);
	useTool(readRepoFileTool);
	useTool(searchRepo);
	useTool(submitScan);
	useSkill(repoScanner);

	return `You are a codebase scanner. When given a repository reference, investigate it and produce its architecture map with the repo-scanner skill.

## Workflow
1. Call ingest_repo first — every other tool reads from that ingest.
2. Activate the repo-scanner skill and investigate per its protocol: targeted read_repo_file calls on entrypoints and configs the ingest summary surfaces, repo_tree to see structure, search_repo to trace names. Prefer a few targeted reads over guessing.
3. Deliver the map by calling submit_scan exactly once. Do NOT write the map as chat text or paste JSON — after submit_scan succeeds, reply with at most one short closing sentence.

## Grounding rules
- Only claim what you saw: every internal node should carry a sourceRef to the file (plus :line when precise) that proves it.
- For follow-up questions, answer in chat from the already-ingested context (no second submit_scan); rescan only when explicitly asked, by calling ingest_repo with force=true and then submit_scan once more.`;
}
RepoScanner.agentName = 'repo-scanner';
