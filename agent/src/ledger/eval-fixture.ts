// Deterministic fixture eval — no LLM. Ensures the parallelization contract
// holds: fixture parses, store round-trips, coverage helpers, InvestigationPacket.

import {
	coverageComplete,
	coverageFromAgents,
	parseInvestigationPacket,
} from '../lib/investigation-schema.ts';
import { parseCampaignResult, parseCaseBundle } from './schema.ts';
import { getCase, listClaims, loadFixture, putCampaignResult, writeClaim } from './store.ts';

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

const caseId = 'fixture-boiling-frog';
const runId = 'eval_run';

const loaded = loadFixture(caseId);
assert(loaded.caseId === caseId, 'fixture caseId mismatch');
assert(loaded.timeline.length === 3, 'expected 3 PRs in boiling-frog timeline');
assert(
	loaded.capabilityDeltas.some((d) => d.kind === 'install_script'),
	'expected transitive install_script delta',
);
assert(
	loaded.capabilityDeltas.some((d) => d.kind === 'workflow_permissions'),
	'expected workflow_permissions delta',
);

const again = getCase(caseId);
assert(again && again.triggerPr === 430, 'store getCase failed');
parseCaseBundle(again);

// Incomplete coverage must fail the gate helper.
assert(
	!coverageComplete(coverageFromAgents(['graph_analyst', 'ci_auditor'])),
	'coverage gate should reject missing provenance_scout',
);

const specialists = ['graph_analyst', 'provenance_scout', 'ci_auditor'] as const;
const claimIds: string[] = [];
for (const agent of specialists) {
	const claim = writeClaim({
		caseId,
		runId,
		agent,
		claimType: agent === 'ci_auditor' ? 'ci_risk' : agent === 'graph_analyst' ? 'graph_risk' : 'provenance_risk',
		subject: `${agent} signal`,
		evidenceRefs: ['delta:d4', 'delta:d5', 'pr:419', 'pr:430'],
		confidence: 0.85,
		severityHint: 'high',
		summary: `${agent} evidence-backed claim for eval.`,
	});
	claimIds.push(claim.id);
}

const coverage = coverageFromAgents(listClaims(caseId, runId).map((c) => c.agent));
assert(coverageComplete(coverage), 'expected full specialist coverage');

const draft = {
	verdict: 'request_changes' as const,
	campaignScore: 88,
	trail: [412, 419, 430],
	narrative:
		'PR #412 adds http-helper (benign alone). PR #419 pulls quiet-utils with postinstall. PR #430 expands Actions write and wires http-helper into billing secrets. Composition is the attack.',
	claimIds,
	recommendedActions: [
		{
			action: 'quarantine' as const,
			target: 'quiet-utils@0.4.1',
			rationale: 'Transitive postinstall from first-release publisher.',
			priority: 'critical' as const,
		},
		{
			action: 'revert_sequence' as const,
			target: 'PR #419 + #430 capability deltas',
			rationale: 'Restore prior lockfile and workflow permissions until dual-reviewed.',
			priority: 'high' as const,
		},
		{
			action: 'require_dual_review' as const,
			target: 'acme/payments-api dependency+workflow changes',
			rationale: 'Campaign-shaped change set across multiple PRs.',
			priority: 'high' as const,
		},
	],
	headline: 'Campaign risk across PR #412 → #430',
};

const packet = parseInvestigationPacket({
	caseId,
	runId,
	coverage,
	claimIds,
	draft,
});
assert(packet.draft.trail.join(',') === '412,419,430', 'packet trail mismatch');

const campaign = putCampaignResult(
	parseCampaignResult({
		caseId: packet.caseId,
		verdict: packet.draft.verdict,
		campaignScore: packet.draft.campaignScore,
		trail: packet.draft.trail,
		narrative: packet.draft.narrative,
		claimIds: packet.draft.claimIds,
		recommendedActions: packet.draft.recommendedActions,
	}),
);

assert(campaign.recommendedActions.length >= 1, 'expected policy actions');

console.log(
	JSON.stringify(
		{
			ok: true,
			caseId,
			prs: loaded.timeline.map((t) => t.prNumber),
			deltas: loaded.capabilityDeltas.length,
			coverage: packet.coverage,
			campaignScore: campaign.campaignScore,
			actions: campaign.recommendedActions.map((a) => a.action),
			controlPlane: 'investigate_case',
		},
		null,
		2,
	),
);
