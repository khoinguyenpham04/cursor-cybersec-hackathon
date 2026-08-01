import { randomUUID } from 'node:crypto';
import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import {
	SPECIALIST_AGENTS,
	campaignDraftSchema,
	coverageComplete,
	coverageFromAgents,
	fanOutResultSchema,
	parseInvestigationPacket,
	type CampaignDraft,
	type FanOutResult,
} from '../lib/investigation-schema.ts';
import { MODAL_KIMI_MODEL } from '../lib/modal-provider.ts';
import {
	getCase,
	listClaims,
	putInvestigation,
} from '../ledger/store.ts';

function buildFanOutPrompt(caseId: string, runId: string): string {
	return `You are the control-plane dispatcher for a supply-chain campaign investigation.

caseId: ${caseId}
runId: ${runId}

CRITICAL — issue these three task calls in ONE tool-call batch (parallel), not sequentially:
1. task agent=graph_analyst — self-contained prompt with caseId + runId; it must write_claim and return claim ids.
2. task agent=provenance_scout — same.
3. task agent=ci_auditor — same.

After all three complete, call finish with claimIdsByAgent listing the claim ids each
specialist actually returned. Do not invent claim ids. Do not review the case yourself.`;
}

function buildComposePrompt(caseId: string, runId: string, claimIds: string[]): string {
	return `You are the control-plane composer step.

caseId: ${caseId}
runId: ${runId}
claimIds on the ledger for this run: ${claimIds.join(', ')}

Delegate ONCE via task to campaign_composer with caseId, runId, and these claimIds.
Then call finish with: verdict, campaignScore, trail, narrative, claimIds,
recommendedActions, optional headline.

Policy actions only (pin | quarantine | require_dual_review | revert_sequence | block_merge).
trail MUST be an exact ordered subset of the case timeline PR numbers (no extras).
claimIds MUST be from the list above.`;
}

export const investigateCase = defineTool({
	name: 'investigate_case',
	description:
		'Control-plane investigation: mints runId, dispatches specialists, enforces ledger-backed coverage, runs composer, persists InvestigationPacket. Then call submit_campaign({ caseId, runId }) using the returned runId.',
	input: v.object({
		caseId: v.pipe(v.string(), v.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/)),
	}),
	durable: true,
	harness: true,
	async run({ data, step, harness, log }) {
		const bundle = getCase(data.caseId);
		if (!bundle) {
			throw new Error(`Case not found: ${data.caseId}`);
		}

		const runId = await step.do('mint_run', () => `run_${randomUUID()}`);

		// JSON-serializable array — Sets do not survive durable step replay.
		const priorIdList = await step.do('prior_claims', () =>
			listClaims(data.caseId, runId).map((c) => c.id),
		);

		const fanOut = await step.do('fan_out', async (): Promise<FanOutResult> => {
			const response = await harness.prompt(buildFanOutPrompt(data.caseId, runId), {
				result: fanOutResultSchema,
				model: process.env.CAMPAIGN_DISPATCH_MODEL || MODAL_KIMI_MODEL,
			});
			return response.data;
		});

		const coverage = await step.do('coverage_gate', () => {
			const priorIds = new Set(priorIdList);
			const claims = listClaims(data.caseId, runId);
			const byId = new Map(claims.map((c) => [c.id, c]));
			const fresh = claims.filter((c) => !priorIds.has(c.id));

			for (const agent of SPECIALIST_AGENTS) {
				const reported = fanOut.claimIdsByAgent[agent];
				if (!reported.length) {
					throw new Error(`Fan-out reported zero claim ids for ${agent}`);
				}
				for (const id of reported) {
					const claim = byId.get(id);
					if (!claim) {
						throw new Error(`Fan-out reported unknown claim id ${id} for ${agent}`);
					}
					if (claim.agent !== agent) {
						throw new Error(
							`Claim ${id} agent is ${claim.agent}, fan-out attributed it to ${agent}`,
						);
					}
					if (priorIds.has(id)) {
						throw new Error(
							`Claim ${id} pre-existed this fan-out; reuse of prior-run claims is not coverage`,
						);
					}
				}
			}

			const fromFresh = coverageFromAgents(fresh.map((c) => c.agent));
			if (!coverageComplete(fromFresh)) {
				throw new Error(
					`Incomplete specialist coverage for run ${runId}: ${JSON.stringify(fromFresh)}`,
				);
			}

			return {
				coverage: fromFresh,
				claimIds: fresh.map((c) => c.id),
			};
		});

		log.info(`Coverage OK for ${data.caseId}/${runId}: ${coverage.claimIds.length} fresh claims`);

		const draft = await step.do('compose', async (): Promise<CampaignDraft> => {
			const response = await harness.prompt(
				buildComposePrompt(data.caseId, runId, coverage.claimIds),
				{
					result: campaignDraftSchema,
					model: process.env.CAMPAIGN_DISPATCH_MODEL || MODAL_KIMI_MODEL,
				},
			);
			return response.data;
		});

		const allowedPrs = bundle.timeline.map((t) => t.prNumber);
		const allowedSet = new Set(allowedPrs);
		if (draft.trail.some((n) => !allowedSet.has(n))) {
			throw new Error(
				`Composer trail ${JSON.stringify(draft.trail)} contains PRs outside case timeline ${JSON.stringify(allowedPrs)}`,
			);
		}
		if (!draft.trail.length) {
			throw new Error('Composer returned empty trail');
		}

		const ledgerSet = new Set(coverage.claimIds);
		const draftClaimIds = draft.claimIds.filter((id) => ledgerSet.has(id));

		const packet = parseInvestigationPacket({
			caseId: data.caseId,
			runId,
			coverage: coverage.coverage,
			claimIds: coverage.claimIds,
			draft: {
				...draft,
				trail: draft.trail,
				claimIds: draftClaimIds.length ? draftClaimIds : coverage.claimIds,
			},
		});

		await step.do('persist_packet', () => {
			putInvestigation(packet);
			return { ok: true as const, runId: packet.runId };
		});

		log.info(
			`InvestigationPacket stored: ${packet.caseId}/${packet.runId} score=${packet.draft.campaignScore}`,
		);

		// Return a lean summary — full narrative stays on the ledger for submit_campaign.
		return {
			output: {
				caseId: packet.caseId,
				runId: packet.runId,
				coverage: packet.coverage,
				claimIds: packet.claimIds,
				verdict: packet.draft.verdict,
				campaignScore: packet.draft.campaignScore,
				trail: packet.draft.trail,
				headline: packet.draft.headline ?? null,
				next: 'Call submit_campaign({ caseId, runId }) with these ids only.',
			} as unknown as JsonValue,
		};
	},
});
