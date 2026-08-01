import { defineSubagent, useSkill, useTool } from '@flue/runtime';
import provenanceScoutSkill from '../skills/provenance-scout/SKILL.md';
import { listCaseDeltas, readCase, writeClaimProvenanceScout } from '../tools/ledger.ts';

function ProvenanceScout() {
	useTool(readCase);
	useTool(listCaseDeltas);
	useTool(writeClaimProvenanceScout);
	useSkill(provenanceScoutSkill);
	return `You are provenance_scout. Follow the provenance-scout skill.
The task prompt includes caseId and runId — use that runId on every write_claim.
Your agent identity is bound by the tool; do not try to claim another specialist's identity.`;
}

export const provenanceScout = defineSubagent({
	name: 'provenance_scout',
	description:
		'Weighs package provenance signals already on the ledger (maintainers, first release, dormancy, publish gaps).',
	agent: ProvenanceScout,
	model: 'anthropic/claude-sonnet-4-6',
});
