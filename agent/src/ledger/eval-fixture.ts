// Deterministic fixture eval — no LLM. Ensures the parallelization contract
// holds: fixture parses, store round-trips, and a golden campaign shape is valid.

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

const claim = writeClaim({
	caseId,
	runId,
	agent: 'eval',
	claimType: 'composition_risk',
	subject: 'PR 412→419→430',
	evidenceRefs: ['delta:d4', 'delta:d5', 'delta:d7', 'pr:412', 'pr:419', 'pr:430'],
	confidence: 0.9,
	severityHint: 'critical',
	summary: 'Transitive postinstall + Actions write + billing path contact across three PRs.',
});
assert(listClaims(caseId, runId).some((c) => c.id === claim.id), 'claim not listed');

const campaign = putCampaignResult(
	parseCampaignResult({
		caseId,
		verdict: 'request_changes',
		campaignScore: 88,
		trail: [412, 419, 430],
		narrative:
			'PR #412 adds http-helper (benign alone). PR #419 pulls quiet-utils with postinstall. PR #430 expands Actions write and wires http-helper into billing secrets. Composition is the attack.',
		claimIds: [claim.id],
		recommendedActions: [
			{
				action: 'quarantine',
				target: 'quiet-utils@0.4.1',
				rationale: 'Transitive postinstall from first-release publisher.',
				priority: 'critical',
			},
			{
				action: 'revert_sequence',
				target: 'PR #419 + #430 capability deltas',
				rationale: 'Restore prior lockfile and workflow permissions until dual-reviewed.',
				priority: 'high',
			},
			{
				action: 'require_dual_review',
				target: 'acme/payments-api dependency+workflow changes',
				rationale: 'Campaign-shaped change set across multiple PRs.',
				priority: 'high',
			},
		],
	}),
);

assert(campaign.trail.join(',') === '412,419,430', 'trail mismatch');
assert(campaign.recommendedActions.length >= 1, 'expected policy actions');

console.log(
	JSON.stringify(
		{
			ok: true,
			caseId,
			prs: loaded.timeline.map((t) => t.prNumber),
			deltas: loaded.capabilityDeltas.length,
			campaignScore: campaign.campaignScore,
			actions: campaign.recommendedActions.map((a) => a.action),
		},
		null,
		2,
	),
);
