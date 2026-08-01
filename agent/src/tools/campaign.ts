import { defineTool, type JsonValue } from '@flue/runtime';
import { submitCampaignInputSchema } from '../lib/campaign-schema.ts';
import { getCase, putCampaignResult } from '../ledger/store.ts';

export const submitCampaign = defineTool({
	name: 'submit_campaign',
	description:
		'Submit the final campaign assessment: score, PR trail, narrative, claim ids, and policy actions. Call exactly once after specialists have written claims. This replaces chat-text reviews.',
	input: submitCampaignInputSchema,
	async run({ data, log }): Promise<{ output: JsonValue }> {
		if (!getCase(data.caseId)) {
			return { output: { error: `Unknown caseId: ${data.caseId}` } };
		}
		const stored = putCampaignResult({
			caseId: data.caseId,
			verdict: data.verdict,
			campaignScore: data.campaignScore,
			trail: data.trail,
			narrative: data.narrative,
			claimIds: data.claimIds,
			recommendedActions: data.recommendedActions,
		});
		log.info(
			`Campaign submitted: ${stored.caseId} score=${stored.campaignScore} trail=${stored.trail.join('→')}`,
		);
		return {
			output: {
				recorded: true,
				caseId: stored.caseId,
				verdict: stored.verdict,
				campaignScore: stored.campaignScore,
				trail: stored.trail,
				actions: stored.recommendedActions.length,
				headline: data.headline ?? null,
				topSeverity: data.topSeverity ?? null,
			},
		};
	},
});
