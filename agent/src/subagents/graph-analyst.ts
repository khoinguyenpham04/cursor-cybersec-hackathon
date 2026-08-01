import { defineSubagent, useSkill, useTool } from '@flue/runtime';
import { MODAL_KIMI_MODEL } from '../lib/modal-provider.ts';
import graphAnalystSkill from '../skills/graph-analyst/SKILL.md';
import { listCaseDeltas, readCase, writeClaimGraphAnalyst } from '../tools/ledger.ts';

function GraphAnalyst() {
	useTool(readCase);
	useTool(listCaseDeltas);
	useTool(writeClaimGraphAnalyst);
	useSkill(graphAnalystSkill);
	return `You are graph_analyst. Follow the graph-analyst skill.
The task prompt includes caseId and runId — use that runId on every write_claim.
Your agent identity is bound by the tool; do not try to claim another specialist's identity.`;
}

export const graphAnalyst = defineSubagent({
	name: 'graph_analyst',
	description:
		'Analyzes dependency graph deltas and blast radius from the ledger (transitive edges, install scripts, sensitive path contact).',
	agent: GraphAnalyst,
	model: MODAL_KIMI_MODEL,
});
