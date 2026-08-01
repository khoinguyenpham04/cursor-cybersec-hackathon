// Structured exit for submit_campaign — loads a stored InvestigationPacket.
// The model cannot invent trail/score/actions; it only names caseId + runId.

import * as v from 'valibot';

export const submitCampaignInputSchema = v.object({
	caseId: v.pipe(
		v.string(),
		v.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
		v.description('Ledger case id under review.'),
	),
	runId: v.pipe(
		v.string(),
		v.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
		v.description('Run id whose InvestigationPacket must already exist from investigate_case.'),
	),
});

export type SubmitCampaignInput = v.InferOutput<typeof submitCampaignInputSchema>;
