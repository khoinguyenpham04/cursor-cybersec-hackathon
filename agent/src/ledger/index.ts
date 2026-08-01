// Public contract surface for Ingest ↔ Orchestrate.
export {
	caseBundleSchema,
	campaignResultSchema,
	claimSchema,
	parseCampaignResult,
	parseCaseBundle,
	parseClaim,
	type CampaignResult,
	type CaseBundle,
	type Claim,
	type PolicyAction,
	type Severity,
} from './schema.ts';
export {
	getCampaignResult,
	getCase,
	listCases,
	listClaims,
	listDeltas,
	loadFixture,
	putCampaignResult,
	putCase,
	writeClaim,
} from './store.ts';
