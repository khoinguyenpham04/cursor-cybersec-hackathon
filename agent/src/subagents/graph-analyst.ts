import { defineSubagent, useSkill, useTool } from '@flue/runtime';
import graphAnalystSkill from '../skills/graph-analyst/SKILL.md';
import { listCaseDeltas, readCase, writeCaseClaim } from '../tools/ledger.ts';

function GraphAnalyst() {
	useTool(readCase);
	useTool(listCaseDeltas);
	useTool(writeCaseClaim);
	useSkill(graphAnalystSkill);
	return `You are graph_analyst. Follow the graph-analyst skill.
The task prompt includes caseId and runId — use that runId on every write_claim.
agent field on claims must be "graph_analyst".`;
}

export const graphAnalyst = defineSubagent({
	name: 'graph_analyst',
	description:
		'Analyzes dependency graph deltas and blast radius from the ledger (transitive edges, install scripts, sensitive path contact).',
	agent: GraphAnalyst,
	model: 'anthropic/claude-sonnet-4-6',
});
