import { defineSubagent, useSkill, useTool } from '@flue/runtime';
import ciAuditorSkill from '../skills/ci-auditor/SKILL.md';
import { listCaseDeltas, readCase, writeCaseClaim } from '../tools/ledger.ts';

function CiAuditor() {
	useTool(readCase);
	useTool(listCaseDeltas);
	useTool(writeCaseClaim);
	useSkill(ciAuditorSkill);
	return `You are ci_auditor. Follow the ci-auditor skill.
The task prompt includes caseId and runId — use that runId on every write_claim.
agent field on claims must be "ci_auditor".`;
}

export const ciAuditor = defineSubagent({
	name: 'ci_auditor',
	description:
		'Audits GitHub Actions / workflow permission and secret-surface capability deltas across the PR timeline.',
	agent: CiAuditor,
	model: 'anthropic/claude-sonnet-4-6',
});
