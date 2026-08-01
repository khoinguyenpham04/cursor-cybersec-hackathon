// Structured exit contract for CampaignOrchestrator — mirrors review-schema.ts
// but for supply-chain campaigns (trail + policy actions), not line bugs.

import * as v from 'valibot';
import { campaignResultSchema, recommendedActionSchema, severitySchema } from '../ledger/schema.ts';

export const submitCampaignInputSchema = v.object({
	caseId: v.pipe(v.string(), v.description('Ledger case id under review.')),
	verdict: v.pipe(
		v.picklist(['approve', 'comment', 'request_changes']),
		v.description(
			'approve: no campaign risk. comment: notable but non-blocking. request_changes: block or dual-review required.',
		),
	),
	campaignScore: v.pipe(
		v.number(),
		v.minValue(0),
		v.maxValue(100),
		v.description('0 = clean, 100 = active supply-chain campaign.'),
	),
	trail: v.pipe(
		v.array(v.number()),
		v.minLength(1),
		v.description('Ordered PR numbers that compose the campaign, e.g. [412, 419, 430].'),
	),
	narrative: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(8000),
		v.description(
			'Markdown narrative: what each PR contributed, why composition matters, and why single-PR scanners miss it.',
		),
	),
	claimIds: v.pipe(
		v.array(v.string()),
		v.description('Claim ids from the ledger that support this campaign.'),
	),
	recommendedActions: v.pipe(
		v.array(recommendedActionSchema),
		v.minLength(1),
		v.description(
			'Policy actions for the Act layer: pin, quarantine, require_dual_review, revert_sequence, block_merge.',
		),
	),
	headline: v.optional(
		v.pipe(
			v.string(),
			v.maxLength(160),
			v.description('One-line PR comment title, e.g. "Campaign risk across PR #412 → #430".'),
		),
	),
	topSeverity: v.optional(severitySchema),
});

export type SubmitCampaignInput = v.InferOutput<typeof submitCampaignInputSchema>;

// Re-export for consumers that want the persisted shape.
export { campaignResultSchema };
