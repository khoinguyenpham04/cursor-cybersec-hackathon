import { defineTool, type JsonValue } from '@flue/runtime';
import { reviewSchema } from '../lib/review-schema.ts';

// The reviewer's final act: deliver the review as validated structured data.
// The tool does no work — the value is in the schema-checked input, which the
// web UI reads straight off the conversation stream and renders as a report
// (and a future orchestrator could post to GitHub). Validation failures
// surface to the model as tool errors, so a malformed review gets retried
// rather than silently rendered.
export const submitReview = defineTool({
	name: 'submit_review',
	description:
		'Submit the final structured review: a verdict, a markdown summary, and line-anchored findings. Call this exactly once, after investigating the PR per the review skill. This replaces writing the review as chat text — put the full review here.',
	input: reviewSchema,
	async run({ data, log }): Promise<{ output: JsonValue }> {
		log.info(`Review submitted: ${data.verdict}, ${data.findings.length} finding(s)`);
		return {
			output: {
				recorded: true,
				verdict: data.verdict,
				findings: data.findings.length,
			},
		};
	},
});
