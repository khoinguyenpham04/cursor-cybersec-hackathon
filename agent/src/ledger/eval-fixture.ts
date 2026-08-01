// Deterministic fixture eval — no LLM. Uses a temp ledger dir so it never
// pollutes the live demo ledger.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempLedger = mkdtempSync(join(tmpdir(), 'ledger-eval-'));
process.env.LEDGER_DATA_DIR = tempLedger;

const {
	coverageComplete,
	coverageFromAgents,
	parseInvestigationPacket,
} = await import('../lib/investigation-schema.ts');
const { parseCampaignResult, parseCaseBundle } = await import('./schema.ts');
const {
	getCase,
	listClaims,
	loadFixture,
	putCampaignResult,
	putInvestigation,
	validateEvidenceRefs,
	writeClaim,
} = await import('./store.ts');

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

try {
	const caseId = 'fixture-boiling-frog';
	const runId = 'eval_run';

	const loaded = loadFixture(caseId);
	assert(loaded.caseId === caseId, 'fixture caseId mismatch');
	assert(loaded.timeline.length === 3, 'expected 3 PRs in boiling-frog timeline');
	parseCaseBundle(loaded);
	assert(getCase(caseId)?.triggerPr === 430, 'store getCase failed');

	assert(
		!coverageComplete(coverageFromAgents(['graph_analyst', 'ci_auditor'])),
		'coverage gate should reject missing provenance_scout',
	);

	let threw = false;
	try {
		assertSafePath();
	} catch {
		threw = true;
	}
	assert(threw, 'expected path traversal caseId to throw');

	function assertSafePath() {
		loadFixture('../../etc/passwd');
	}

	const specialists = ['graph_analyst', 'provenance_scout', 'ci_auditor'] as const;
	const claimIds: string[] = [];
	for (const agent of specialists) {
		validateEvidenceRefs(loaded, ['delta:d4', 'pr:419', 'pkg:quiet-utils@0.4.1']);
		const claim = writeClaim({
			caseId,
			runId,
			agent,
			claimType:
				agent === 'ci_auditor'
					? 'ci_risk'
					: agent === 'graph_analyst'
						? 'graph_risk'
						: 'provenance_risk',
			subject: `${agent} signal`,
			evidenceRefs: ['delta:d4', 'delta:d5', 'pr:419', 'pr:430'],
			confidence: 0.85,
			severityHint: 'high',
			summary: `${agent} evidence-backed claim for eval.`,
		});
		claimIds.push(claim.id);
	}

	let badRef = false;
	try {
		validateEvidenceRefs(loaded, ['delta:nope']);
	} catch {
		badRef = true;
	}
	assert(badRef, 'expected unknown evidenceRef to throw');

	const coverage = coverageFromAgents(listClaims(caseId, runId).map((c) => c.agent));
	assert(coverageComplete(coverage), 'expected full specialist coverage');

	const draft = {
		verdict: 'request_changes' as const,
		campaignScore: 88,
		trail: [412, 419, 430],
		narrative: 'Composition across three PRs.',
		claimIds,
		recommendedActions: [
			{
				action: 'quarantine' as const,
				target: 'quiet-utils@0.4.1',
				rationale: 'Transitive postinstall from first-release publisher.',
				priority: 'critical' as const,
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
	putInvestigation(packet);

	const campaign = putCampaignResult(
		parseCampaignResult({
			caseId: packet.caseId,
			verdict: packet.draft.verdict,
			campaignScore: packet.draft.campaignScore,
			trail: packet.draft.trail,
			narrative: packet.draft.narrative,
			claimIds: packet.draft.claimIds,
			recommendedActions: packet.draft.recommendedActions,
			headline: packet.draft.headline,
		}),
		runId,
	);

	console.log(
		JSON.stringify(
			{
				ok: true,
				caseId,
				prs: loaded.timeline.map((t) => t.prNumber),
				coverage: packet.coverage,
				campaignScore: campaign.campaignScore,
				actions: campaign.recommendedActions.map((a) => a.action),
				controlPlane: 'investigate_case+packet-gated submit',
				ledgerDir: tempLedger,
			},
			null,
			2,
		),
	);
} finally {
	rmSync(tempLedger, { recursive: true, force: true });
}
