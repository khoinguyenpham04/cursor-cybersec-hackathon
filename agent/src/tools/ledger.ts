import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import { claimTypeSchema, severitySchema } from '../ledger/schema.ts';
import {
	getCase,
	listCases,
	listClaims,
	listDeltas,
	loadFixture,
	writeClaim,
} from '../ledger/store.ts';

export const readCase = defineTool({
	name: 'read_case',
	description:
		'Load a Case Bundle from the risk ledger by caseId (facts only: timeline, capability deltas, packages). Call this before any specialist work.',
	input: v.object({
		caseId: v.pipe(v.string(), v.description('Ledger case id, e.g. fixture-boiling-frog')),
	}),
	async run({ data }): Promise<{ output: JsonValue }> {
		const bundle = getCase(data.caseId);
		if (!bundle) {
			return {
				output: {
					error: `Case not found: ${data.caseId}`,
					available: listCases(),
				},
			};
		}
		return { output: bundle as unknown as JsonValue };
	},
});

export const listCaseDeltas = defineTool({
	name: 'list_deltas',
	description:
		'List capability deltas (and optional timeline) for a case. Optionally filter by PR number.',
	input: v.object({
		caseId: v.string(),
		prNumber: v.optional(v.number()),
	}),
	async run({ data }): Promise<{ output: JsonValue }> {
		const result = listDeltas(data.caseId, data.prNumber);
		if (!result) return { output: { error: `Case not found: ${data.caseId}` } };
		return { output: result as unknown as JsonValue };
	},
});

export const writeCaseClaim = defineTool({
	name: 'write_claim',
	description:
		'Persist one evidence-backed Claim to the ledger. Every claim MUST include evidenceRefs pointing at case facts (delta:, pkg:, pr:). Never invent registry or GitHub facts.',
	input: v.object({
		caseId: v.string(),
		runId: v.pipe(v.string(), v.description('Orchestration run id shared by all claims in this review')),
		agent: v.pipe(v.string(), v.description('Specialist name, e.g. graph_analyst')),
		claimType: claimTypeSchema,
		subject: v.string(),
		evidenceRefs: v.pipe(v.array(v.string()), v.minLength(1)),
		confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
		severityHint: severitySchema,
		summary: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		try {
			const claim = writeClaim(data);
			log.info(`Claim ${claim.id} written by ${claim.agent}`);
			return { output: claim as unknown as JsonValue };
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

export const listCaseClaims = defineTool({
	name: 'list_claims',
	description: 'List Claims written for a case, optionally filtered by runId.',
	input: v.object({
		caseId: v.string(),
		runId: v.optional(v.string()),
	}),
	async run({ data }): Promise<{ output: JsonValue }> {
		return {
			output: {
				caseId: data.caseId,
				claims: listClaims(data.caseId, data.runId) as unknown as JsonValue,
			},
		};
	},
});

export const loadFixtureCase = defineTool({
	name: 'load_fixture_case',
	description:
		'Seed the ledger from a built-in fixture (demo / offline). Prefer this when the user asks to review fixture-boiling-frog or a multi-PR campaign demo.',
	input: v.object({
		caseId: v.pipe(
			v.string(),
			v.description('Fixture case id. Currently: fixture-boiling-frog'),
		),
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		try {
			const bundle = loadFixture(data.caseId);
			log.info(`Fixture loaded: ${bundle.caseId}`);
			return { output: { loaded: true, caseId: bundle.caseId, triggerPr: bundle.triggerPr } };
		} catch (error) {
			return { output: { error: (error as Error).message, available: ['fixture-boiling-frog'] } };
		}
	},
});
