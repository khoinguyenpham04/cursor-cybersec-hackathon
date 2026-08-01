// Ledger store: Case Bundles (ingest) + Claims (orchestrate).
// File-backed JSON under data/ledger so ingest and orchestrate can share a
// directory later; fixtures seed on first read for offline demos.

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	parseCampaignResult,
	parseCaseBundle,
	parseClaim,
	type CampaignResult,
	type CaseBundle,
	type Claim,
} from './schema.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, 'fixtures');
const DATA_DIR = join(HERE, '../../data/ledger');

function casesDir() {
	return join(DATA_DIR, 'cases');
}
function claimsDir(caseId: string) {
	return join(DATA_DIR, 'claims', caseId);
}
function resultsDir() {
	return join(DATA_DIR, 'results');
}

function ensureDir(path: string) {
	mkdirSync(path, { recursive: true });
}

function seedFixtures() {
	ensureDir(casesDir());
	for (const name of readdirSync(FIXTURES_DIR)) {
		if (!name.endsWith('.json')) continue;
		const src = join(FIXTURES_DIR, name);
		const bundle = parseCaseBundle(JSON.parse(readFileSync(src, 'utf8')));
		const dest = join(casesDir(), `${bundle.caseId}.json`);
		if (!existsSync(dest)) {
			writeFileSync(dest, JSON.stringify(bundle, null, 2));
		}
	}
}

let seeded = false;
function ready() {
	if (!seeded) {
		seedFixtures();
		seeded = true;
	}
}

export function putCase(bundle: CaseBundle): CaseBundle {
	ready();
	const parsed = parseCaseBundle(bundle);
	ensureDir(casesDir());
	writeFileSync(join(casesDir(), `${parsed.caseId}.json`), JSON.stringify(parsed, null, 2));
	return parsed;
}

export function getCase(caseId: string): CaseBundle | null {
	ready();
	const path = join(casesDir(), `${caseId}.json`);
	if (!existsSync(path)) return null;
	return parseCaseBundle(JSON.parse(readFileSync(path, 'utf8')));
}

export function listCases(): string[] {
	ready();
	return readdirSync(casesDir())
		.filter((f) => f.endsWith('.json'))
		.map((f) => f.replace(/\.json$/, ''));
}

export function listDeltas(caseId: string, prNumber?: number) {
	const bundle = getCase(caseId);
	if (!bundle) return null;
	const deltas = prNumber
		? bundle.capabilityDeltas.filter((d) => d.prNumber === prNumber)
		: bundle.capabilityDeltas;
	return { caseId, deltas, timeline: bundle.timeline };
}

export function writeClaim(
	input: Omit<Claim, 'id' | 'createdAt'> & { id?: string },
): Claim {
	ready();
	if (!getCase(input.caseId)) {
		throw new Error(`Unknown caseId: ${input.caseId}`);
	}
	const claim = parseClaim({
		...input,
		id: input.id ?? `clm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
		createdAt: new Date().toISOString(),
	});
	const dir = claimsDir(claim.caseId);
	ensureDir(dir);
	writeFileSync(join(dir, `${claim.id}.json`), JSON.stringify(claim, null, 2));
	return claim;
}

export function listClaims(caseId: string, runId?: string): Claim[] {
	ready();
	const dir = claimsDir(caseId);
	if (!existsSync(dir)) return [];
	const claims = readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => parseClaim(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
	return runId ? claims.filter((c) => c.runId === runId) : claims;
}

export function putCampaignResult(result: CampaignResult): CampaignResult {
	ready();
	const parsed = parseCampaignResult(result);
	ensureDir(resultsDir());
	writeFileSync(
		join(resultsDir(), `${parsed.caseId}.json`),
		JSON.stringify(parsed, null, 2),
	);
	return parsed;
}

export function getCampaignResult(caseId: string): CampaignResult | null {
	ready();
	const path = join(resultsDir(), `${caseId}.json`);
	if (!existsSync(path)) return null;
	return parseCampaignResult(JSON.parse(readFileSync(path, 'utf8')));
}

/** Reload a fixture onto the ledger (overwrites case; keeps prior claims). */
export function loadFixture(caseId: string): CaseBundle {
	const path = join(FIXTURES_DIR, `${caseId.replace(/^fixture-/, '')}.json`);
	const alt = join(FIXTURES_DIR, 'boiling-frog.json');
	const src = existsSync(path)
		? path
		: caseId === 'fixture-boiling-frog'
			? alt
			: null;
	if (!src) throw new Error(`No fixture for caseId=${caseId}`);
	return putCase(parseCaseBundle(JSON.parse(readFileSync(src, 'utf8'))));
}
