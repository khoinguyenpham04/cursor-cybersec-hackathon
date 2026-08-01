import { defineTool, type JsonValue } from '@flue/runtime';
import { submitCampaignInputSchema } from '../lib/campaign-schema.ts';
import {
	getCase,
	getInvestigation,
	listClaims,
	putCampaignResult,
} from '../ledger/store.ts';

export const submitCampaign = defineTool({
	name: 'submit_campaign',
	description:
		'Finalize a campaign from a stored InvestigationPacket produced by investigate_case. Input is only caseId + runId — trail/score/actions are loaded server-side and cannot be invented.',
	input: submitCampaignInputSchema,
	async run({ data, log }): Promise<{ output: JsonValue }> {
		try {
			const bundle = getCase(data.caseId);
			if (!bundle) {
				return { output: { error: `Unknown caseId: ${data.caseId}` } };
			}

			const packet = getInvestigation(data.caseId, data.runId);
			if (!packet) {
				return {
					output: {
						error: `No InvestigationPacket for ${data.caseId}/${data.runId}. Call investigate_case first.`,
					},
				};
			}

			const ledgerIds = new Set(listClaims(data.caseId, data.runId).map((c) => c.id));
			const claimIds = packet.claimIds.filter((id) => ledgerIds.has(id));
			if (!claimIds.length) {
				return { output: { error: 'InvestigationPacket has no ledger-backed claimIds.' } };
			}

			const allowedPrs = new Set(bundle.timeline.map((t) => t.prNumber));
			if (packet.draft.trail.some((n) => !allowedPrs.has(n)) || !packet.draft.trail.length) {
				return {
					output: {
						error: `Investigation trail ${JSON.stringify(packet.draft.trail)} is not a subset of case timeline.`,
					},
				};
			}

			const stored = putCampaignResult(
				{
					caseId: data.caseId,
					verdict: packet.draft.verdict,
					campaignScore: packet.draft.campaignScore,
					trail: packet.draft.trail,
					narrative: packet.draft.narrative,
					claimIds,
					recommendedActions: packet.draft.recommendedActions,
					headline: packet.draft.headline,
				},
				data.runId,
			);

			log.info(
				`Campaign submitted from packet: ${stored.caseId}/${data.runId} score=${stored.campaignScore} trail=${stored.trail.join('→')}`,
			);
			return {
				output: {
					recorded: true,
					caseId: stored.caseId,
					runId: data.runId,
					verdict: stored.verdict,
					campaignScore: stored.campaignScore,
					trail: stored.trail,
					actions: stored.recommendedActions.length,
					headline: stored.headline ?? null,
					campaign: stored,
				},
			};
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});
