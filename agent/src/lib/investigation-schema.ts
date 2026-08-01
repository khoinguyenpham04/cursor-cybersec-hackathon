// Control-plane contract for investigate_case: fan-out coverage + composer draft
// before the parent calls submit_campaign.

import * as v from 'valibot';
import { recommendedActionSchema } from '../ledger/schema.ts';

export const SPECIALIST_AGENTS = [
	'graph_analyst',
	'provenance_scout',
	'ci_auditor',
] as const;
export type SpecialistAgent = (typeof SPECIALIST_AGENTS)[number];

export const coverageSchema = v.object({
	graph_analyst: v.boolean(),
	provenance_scout: v.boolean(),
	ci_auditor: v.boolean(),
});
export type Coverage = v.InferOutput<typeof coverageSchema>;

/** Structured finish payload from the fan-out harness prompt. */
export const fanOutResultSchema = v.object({
	claimIdsByAgent: v.object({
		graph_analyst: v.array(v.string()),
		provenance_scout: v.array(v.string()),
		ci_auditor: v.array(v.string()),
	}),
	notes: v.optional(v.string()),
});
export type FanOutResult = v.InferOutput<typeof fanOutResultSchema>;

/** Composer draft — maps 1:1 onto submit_campaign fields (minus caseId). */
export const campaignDraftSchema = v.object({
	verdict: v.picklist(['approve', 'comment', 'request_changes']),
	campaignScore: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
	trail: v.pipe(v.array(v.number()), v.minLength(1)),
	narrative: v.pipe(v.string(), v.minLength(1), v.maxLength(8000)),
	claimIds: v.array(v.string()),
	recommendedActions: v.pipe(v.array(recommendedActionSchema), v.minLength(1)),
	headline: v.optional(v.pipe(v.string(), v.maxLength(160))),
});
export type CampaignDraft = v.InferOutput<typeof campaignDraftSchema>;

export const investigationPacketSchema = v.object({
	caseId: v.string(),
	runId: v.string(),
	coverage: coverageSchema,
	claimIds: v.array(v.string()),
	draft: campaignDraftSchema,
});
export type InvestigationPacket = v.InferOutput<typeof investigationPacketSchema>;

export function parseInvestigationPacket(input: unknown): InvestigationPacket {
	return v.parse(investigationPacketSchema, input);
}

/** Pure coverage check used by investigate_case and eval-fixture. */
export function coverageFromAgents(agentsPresent: Iterable<string>): Coverage {
	const set = new Set(agentsPresent);
	return {
		graph_analyst: set.has('graph_analyst'),
		provenance_scout: set.has('provenance_scout'),
		ci_auditor: set.has('ci_auditor'),
	};
}

export function coverageComplete(coverage: Coverage): boolean {
	return coverage.graph_analyst && coverage.provenance_scout && coverage.ci_auditor;
}
