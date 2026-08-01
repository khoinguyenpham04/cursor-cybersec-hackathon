import { defineSubagent, useSkill, useTool } from '@flue/runtime';
import provenanceScoutSkill from '../skills/provenance-scout/SKILL.md';
import { listCaseDeltas, readCase, writeCaseClaim } from '../tools/ledger.ts';

function ProvenanceScout() {
	useTool(readCase);
	useTool(listCaseDeltas);
	useTool(writeCaseClaim);
	useSkill(provenanceScoutSkill);
	return `You are provenance_scout. Follow the provenance-scout skill.
The task prompt includes caseId and runId — use that runId on every write_claim.
agent field on claims must be "provenance_scout".`;
}

export const provenanceScout = defineSubagent({
	name: 'provenance_scout',
	description:
		'Weighs package provenance signals already on the ledger (maintainers, first release, dormancy, publish gaps).',
	agent: ProvenanceScout,
	model: 'anthropic/claude-sonnet-4-6',
});
