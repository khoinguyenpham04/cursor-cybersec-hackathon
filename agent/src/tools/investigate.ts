import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import {
	campaignDraftSchema,
	coverageComplete,
	coverageFromAgents,
	fanOutResultSchema,
	parseInvestigationPacket,
	type CampaignDraft,
	type FanOutResult,
} from '../lib/investigation-schema.ts';
import { getCase, listClaims } from '../ledger/store.ts';

function buildFanOutPrompt(caseId: string, runId: string): string {
	return `You are the control-plane dispatcher for a supply-chain campaign investigation.

caseId: ${caseId}
runId: ${runId}

CRITICAL — do this in ONE tool-call batch (parallel), not sequentially:
1. Call task agent=graph_analyst with a self-contained prompt that includes caseId + runId.
   Instruct it to read_case, write_claim (agent field "graph_analyst"), and return claim ids.
2. Call task agent=provenance_scout the same way (agent field "provenance_scout").
3. Call task agent=ci_auditor the same way (agent field "ci_auditor").

After all three tasks complete, call finish with claimIdsByAgent listing the claim ids
each specialist reported (cross-check against their final messages).

Do not invent claim ids. Do not review the case yourself — only dispatch and collect.`;
}

function buildComposePrompt(caseId: string, runId: string, claimIds: string[]): string {
	return `You are the control-plane composer step.

caseId: ${caseId}
runId: ${runId}
claimIds already on the ledger: ${claimIds.join(', ')}

Delegate ONCE via task to campaign_composer with a self-contained prompt that includes
caseId, runId, and these claimIds. The composer must list_claims + read_case and return
a full campaign draft.

Then call finish with the draft fields: verdict, campaignScore, trail, narrative,
claimIds, recommendedActions, and optional headline.

Policy actions only (pin | quarantine | require_dual_review | revert_sequence | block_merge).
Do not suggest "upgrade to latest" as the primary fix.`;
}

export const investigateCase = defineTool({
	name: 'investigate_case',
	description:
		'Control-plane investigation: fan out graph_analyst, provenance_scout, and ci_auditor in parallel, enforce claim coverage, run campaign_composer, and return an InvestigationPacket. Call this instead of manually tasking specialists.',
	input: v.object({
		caseId: v.pipe(v.string(), v.description('Ledger case id')),
		runId: v.pipe(v.string(), v.description('Shared run id for all claims in this investigation')),
	}),
	durable: true,
	harness: true,
	async run({ data, step, harness, log }) {
		const bundle = getCase(data.caseId);
		if (!bundle) {
			throw new Error(`Case not found: ${data.caseId}`);
		}

		const fanOut = await step.do('fan_out', async (): Promise<FanOutResult> => {
			const response = await harness.prompt(buildFanOutPrompt(data.caseId, data.runId), {
				result: fanOutResultSchema,
			});
			return response.data;
		});

		log.info(
			`Fan-out complete for ${data.caseId}: ` +
				`graph=${fanOut.claimIdsByAgent.graph_analyst.length} ` +
				`prov=${fanOut.claimIdsByAgent.provenance_scout.length} ` +
				`ci=${fanOut.claimIdsByAgent.ci_auditor.length}`,
		);

		const coverage = await step.do('coverage_gate', () => {
			const claims = listClaims(data.caseId, data.runId);
			const fromLedger = coverageFromAgents(claims.map((c) => c.agent));
			if (!coverageComplete(fromLedger)) {
				throw new Error(
					`Incomplete specialist coverage for run ${data.runId}: ` +
						JSON.stringify(fromLedger) +
						`. Fan-out reported ${JSON.stringify(fanOut.claimIdsByAgent)}. ` +
						`Each of graph_analyst, provenance_scout, ci_auditor must write_claim at least once.`,
				);
			}
			return {
				coverage: fromLedger,
				claimIds: claims.map((c) => c.id),
			};
		});

		const draft = await step.do('compose', async (): Promise<CampaignDraft> => {
			const response = await harness.prompt(
				buildComposePrompt(data.caseId, data.runId, coverage.claimIds),
				{ result: campaignDraftSchema },
			);
			return response.data;
		});

		const packet = parseInvestigationPacket({
			caseId: data.caseId,
			runId: data.runId,
			coverage: coverage.coverage,
			claimIds: coverage.claimIds,
			draft: {
				...draft,
				// Prefer ledger claim ids; fall back to draft if composer echoed a subset.
				claimIds: draft.claimIds.length ? draft.claimIds : coverage.claimIds,
			},
		});

		log.info(
			`Investigation packet ready: score=${packet.draft.campaignScore} trail=${packet.draft.trail.join('→')}`,
		);

		return { output: packet as unknown as JsonValue };
	},
});
