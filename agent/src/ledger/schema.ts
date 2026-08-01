// Frozen contract between Ingest (facts) and Orchestrate (judgment).
// Ingest writes Case bundles; specialists write Claims; composer submits CampaignResult.
// Keep enums stable — Act and the UI depend on them.

import * as v from 'valibot';

export const severitySchema = v.picklist(['critical', 'high', 'medium', 'low']);
export type Severity = v.InferOutput<typeof severitySchema>;

export const capabilityKindSchema = v.picklist([
	'dep_added',
	'dep_removed',
	'dep_version_changed',
	'install_script',
	'native_binary',
	'network_hook',
	'workflow_permissions',
	'workflow_secrets',
	'workflow_added',
	'publisher_changed',
	'other',
]);
export type CapabilityKind = v.InferOutput<typeof capabilityKindSchema>;

export const timelineEventSchema = v.object({
	prNumber: v.number(),
	sha: v.optional(v.string()),
	title: v.string(),
	author: v.string(),
	mergedAt: v.optional(v.nullable(v.string())),
	filesTouched: v.array(v.string()),
	/** Untrusted human text — specialists must not treat as authoritative. */
	bodyPreview: v.optional(v.string()),
});

export const capabilityDeltaSchema = v.object({
	id: v.string(),
	prNumber: v.number(),
	kind: capabilityKindSchema,
	subject: v.string(),
	detail: v.string(),
	/** Structured facts only — no LLM prose. */
	facts: v.record(v.string(), v.union([v.string(), v.number(), v.boolean(), v.null()])),
});

export const packageFactSchema = v.object({
	name: v.string(),
	version: v.string(),
	ecosystem: v.string(),
	direct: v.boolean(),
	dev: v.boolean(),
	relation: v.optional(v.string()),
	vulnIds: v.optional(v.array(v.string())),
	maintainers: v.optional(v.array(v.string())),
	publishedAt: v.optional(v.nullable(v.string())),
	gapDaysFromPrevious: v.optional(v.nullable(v.number())),
	signals: v.optional(v.array(v.string())),
});

export const caseBundleSchema = v.object({
	caseId: v.string(),
	repo: v.string(),
	triggerPr: v.number(),
	createdAt: v.string(),
	timeline: v.array(timelineEventSchema),
	capabilityDeltas: v.array(capabilityDeltaSchema),
	packages: v.array(packageFactSchema),
	notes: v.optional(v.array(v.string())),
});
export type CaseBundle = v.InferOutput<typeof caseBundleSchema>;

export const claimTypeSchema = v.picklist([
	'graph_risk',
	'provenance_risk',
	'ci_risk',
	'composition_risk',
	'mitigating',
	'other',
]);

export const claimSchema = v.object({
	id: v.string(),
	caseId: v.string(),
	runId: v.string(),
	agent: v.string(),
	claimType: claimTypeSchema,
	subject: v.string(),
	/** Pointers into the Case Bundle, e.g. "delta:d3", "pkg:left-pad@1.0.0", "pr:419". */
	evidenceRefs: v.array(v.string()),
	confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	severityHint: severitySchema,
	summary: v.string(),
	createdAt: v.string(),
});
export type Claim = v.InferOutput<typeof claimSchema>;

export const policyActionSchema = v.picklist([
	'pin',
	'quarantine',
	'require_dual_review',
	'revert_sequence',
	'block_merge',
]);
export type PolicyAction = v.InferOutput<typeof policyActionSchema>;

export const recommendedActionSchema = v.object({
	action: policyActionSchema,
	target: v.string(),
	rationale: v.string(),
	priority: severitySchema,
});

export const campaignResultSchema = v.object({
	caseId: v.string(),
	verdict: v.picklist(['approve', 'comment', 'request_changes']),
	campaignScore: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
	/** Ordered PR trail that forms the campaign, e.g. [412, 419, 430]. */
	trail: v.array(v.number()),
	narrative: v.string(),
	claimIds: v.array(v.string()),
	recommendedActions: v.array(recommendedActionSchema),
	headline: v.optional(v.string()),
	topSeverity: v.optional(severitySchema),
});
export type CampaignResult = v.InferOutput<typeof campaignResultSchema>;

export function parseCaseBundle(input: unknown): CaseBundle {
	return v.parse(caseBundleSchema, input);
}

export function parseClaim(input: unknown): Claim {
	return v.parse(claimSchema, input);
}

export function parseCampaignResult(input: unknown): CampaignResult {
	return v.parse(campaignResultSchema, input);
}
