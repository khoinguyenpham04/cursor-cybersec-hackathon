// Ledger store: Case Bundles (ingest) + Claims (orchestrate) + Investigations.
// DATA_DIR is cwd-relative (or LEDGER_DATA_DIR) so vite builds keep working.
// Fixtures are imported as JSON so the bundler always includes them.

import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import boilingFrog from './fixtures/boiling-frog.json' with { type: 'json' };
import demoSelfRepo811 from './fixtures/demo-self-repo-8-11.json' with { type: 'json' };
import { assertSafeId } from './ids.ts';
import {
	parseCampaignResult,
	parseCaseBundle,
	parseClaim,
	type CampaignResult,
	type CaseBundle,
	type Claim,
} from './schema.ts';
import { fenceStringRecord, fenceUntrusted } from './fence.ts';
import {
	parseInvestigationPacket,
	type InvestigationPacket,
	type SpecialistAgent,
} from '../lib/investigation-schema.ts';

const DATA_DIR = resolve(process.env.LEDGER_DATA_DIR ?? join(process.cwd(), 'data/ledger'));

const FIXTURES: Record<string, CaseBundle> = {
	'fixture-boiling-frog': parseCaseBundle(boilingFrog),
	/** Live demo substrate: GitHub PRs #8–#11 on the product repo. */
	'demo-self-repo-8-11': parseCaseBundle(demoSelfRepo811),
};

export function listFixtureIds(): string[] {
	return Object.keys(FIXTURES);
}

function casesDir() {
	return join(DATA_DIR, 'cases');
}
function claimsDir(caseId: string) {
	return join(DATA_DIR, 'claims', assertSafeId(caseId, 'caseId'));
}
function resultsDir(caseId: string) {
	return join(DATA_DIR, 'results', assertSafeId(caseId, 'caseId'));
}
function investigationsDir(caseId: string) {
	return join(DATA_DIR, 'investigations', assertSafeId(caseId, 'caseId'));
}

function ensureDir(path: string) {
	mkdirSync(path, { recursive: true });
}

function assertUnderDataDir(path: string) {
	const resolved = resolve(path);
	if (resolved !== DATA_DIR && !resolved.startsWith(`${DATA_DIR}/`)) {
		throw new Error(`Refusing path outside ledger data dir: ${resolved}`);
	}
}

function atomicWriteJson(path: string, value: unknown) {
	assertUnderDataDir(path);
	ensureDir(dirname(path));
	const tmp = `${path}.${randomUUID()}.tmp`;
	writeFileSync(tmp, JSON.stringify(value, null, 2));
	renameSync(tmp, path);
}

function seedFixtures() {
	ensureDir(casesDir());
	for (const bundle of Object.values(FIXTURES)) {
		const dest = join(casesDir(), `${assertSafeId(bundle.caseId, 'caseId')}.json`);
		assertUnderDataDir(dest);
		if (!existsSync(dest)) atomicWriteJson(dest, bundle);
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
	assertSafeId(parsed.caseId, 'caseId');
	const dest = join(casesDir(), `${parsed.caseId}.json`);
	atomicWriteJson(dest, parsed);
	return parsed;
}

export function getCase(caseId: string): CaseBundle | null {
	ready();
	assertSafeId(caseId, 'caseId');
	const path = join(casesDir(), `${caseId}.json`);
	assertUnderDataDir(path);
	if (!existsSync(path)) return null;
	return parseCaseBundle(JSON.parse(readFileSync(path, 'utf8')));
}

export function listCases(): string[] {
	ready();
	ensureDir(casesDir());
	return readdirSync(casesDir())
		.filter((f) => f.endsWith('.json'))
		.map((f) => f.replace(/\.json$/, ''));
}

export function listDeltas(caseId: string, prNumber?: number) {
	const bundle = getCase(caseId);
	if (!bundle) return null;
	const projected = projectCaseForModel(bundle);
	const deltas = (projected.capabilityDeltas as Array<{ prNumber: number }>).filter((d) =>
		prNumber === undefined ? true : d.prNumber === prNumber,
	);
	return {
		caseId,
		deltas,
		timeline: projected.timeline,
	};
}

export function writeClaim(
	input: Omit<Claim, 'id' | 'createdAt' | 'agent'> & {
		agent: SpecialistAgent | string;
		id?: string;
	},
): Claim {
	ready();
	assertSafeId(input.caseId, 'caseId');
	assertSafeId(input.runId, 'runId');
	if (!getCase(input.caseId)) {
		throw new Error(`Unknown caseId: ${input.caseId}`);
	}
	const claim = parseClaim({
		...input,
		id: input.id ?? `clm_${randomUUID()}`,
		createdAt: new Date().toISOString(),
	});
	const path = join(claimsDir(claim.caseId), `${claim.id}.json`);
	atomicWriteJson(path, claim);
	return claim;
}

export function listClaims(caseId: string, runId?: string): Claim[] {
	ready();
	assertSafeId(caseId, 'caseId');
	if (runId) assertSafeId(runId, 'runId');
	const dir = claimsDir(caseId);
	if (!existsSync(dir)) return [];
	const claims: Claim[] = [];
	for (const file of readdirSync(dir)) {
		if (!file.endsWith('.json')) continue;
		try {
			claims.push(parseClaim(JSON.parse(readFileSync(join(dir, file), 'utf8'))));
		} catch {
			// Skip corrupt / legacy files so one bad entry cannot brick the case.
		}
	}
	claims.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return runId ? claims.filter((c) => c.runId === runId) : claims;
}

export function putInvestigation(packet: InvestigationPacket): InvestigationPacket {
	ready();
	const parsed = parseInvestigationPacket(packet);
	assertSafeId(parsed.caseId, 'caseId');
	assertSafeId(parsed.runId, 'runId');
	const path = join(investigationsDir(parsed.caseId), `${parsed.runId}.json`);
	assertUnderDataDir(path);
	if (existsSync(path)) {
		// Durable step replay may re-enter after the file landed — idempotent if equal.
		const existing = parseInvestigationPacket(JSON.parse(readFileSync(path, 'utf8')));
		if (JSON.stringify(existing) === JSON.stringify(parsed)) {
			return existing;
		}
		throw new Error(
			`InvestigationPacket already exists for ${parsed.caseId}/${parsed.runId} with different content; refuse overwrite`,
		);
	}
	atomicWriteJson(path, parsed);
	return parsed;
}

export function getInvestigation(caseId: string, runId: string): InvestigationPacket | null {
	ready();
	assertSafeId(caseId, 'caseId');
	assertSafeId(runId, 'runId');
	const path = join(investigationsDir(caseId), `${runId}.json`);
	assertUnderDataDir(path);
	if (!existsSync(path)) return null;
	return parseInvestigationPacket(JSON.parse(readFileSync(path, 'utf8')));
}

export function putCampaignResult(result: CampaignResult, runId?: string): CampaignResult {
	ready();
	const parsed = parseCampaignResult(result);
	assertSafeId(parsed.caseId, 'caseId');
	const key = runId ? assertSafeId(runId, 'runId') : 'latest';
	const path = join(resultsDir(parsed.caseId), `${key}.json`);
	atomicWriteJson(path, parsed);
	// Keep a latest pointer for convenience.
	atomicWriteJson(join(resultsDir(parsed.caseId), 'latest.json'), parsed);
	return parsed;
}

export function getCampaignResult(caseId: string, runId?: string): CampaignResult | null {
	ready();
	assertSafeId(caseId, 'caseId');
	const key = runId ? assertSafeId(runId, 'runId') : 'latest';
	const path = join(resultsDir(caseId), `${key}.json`);
	assertUnderDataDir(path);
	if (!existsSync(path)) return null;
	return parseCampaignResult(JSON.parse(readFileSync(path, 'utf8')));
}

/** Reload a fixture onto the ledger (overwrites case; keeps prior claims). */
export function loadFixture(caseId: string): CaseBundle {
	assertSafeId(caseId, 'caseId');
	const fixture = FIXTURES[caseId];
	if (!fixture) {
		throw new Error(`No fixture for caseId=${caseId}. Available: ${Object.keys(FIXTURES).join(', ')}`);
	}
	return putCase(fixture);
}

/** Resolve and validate evidenceRefs against a case bundle. */
export function validateEvidenceRefs(bundle: CaseBundle, refs: string[]): void {
	const deltaIds = new Set(bundle.capabilityDeltas.map((d) => d.id));
	const prs = new Set(bundle.timeline.map((t) => t.prNumber));
	const pkgs = new Set(bundle.packages.map((p) => `${p.name}@${p.version}`));
	const pkgsByName = new Set(bundle.packages.map((p) => p.name));

	for (const ref of refs) {
		if (/^delta:[a-zA-Z0-9._-]+$/.test(ref)) {
			const id = ref.slice('delta:'.length);
			if (!deltaIds.has(id)) throw new Error(`Unknown evidenceRef ${ref}`);
			continue;
		}
		if (/^pr:\d+$/.test(ref)) {
			const n = Number(ref.slice('pr:'.length));
			if (!prs.has(n)) throw new Error(`Unknown evidenceRef ${ref}`);
			continue;
		}
		if (ref.startsWith('pkg:')) {
			const rest = ref.slice('pkg:'.length);
			if (!pkgs.has(rest) && !pkgsByName.has(rest)) {
				throw new Error(`Unknown evidenceRef ${ref}`);
			}
			continue;
		}
		throw new Error(`Invalid evidenceRef ${ref}: use delta:, pr:<digits>, or pkg:`);
	}
}

/**
 * Project a case for model consumption: fence untrusted string fields so they
 * cannot be mistaken for instructions. Structural ids/enums/numbers stay bare.
 */
export function projectCaseForModel(bundle: CaseBundle): Record<string, unknown> {
	return {
		caseId: bundle.caseId,
		repo: bundle.repo,
		triggerPr: bundle.triggerPr,
		createdAt: bundle.createdAt,
		notes: bundle.notes?.map((n, i) => fenceUntrusted(`notes[${i}]`, n)),
		timeline: bundle.timeline.map((t) => ({
			prNumber: t.prNumber,
			sha: t.sha,
			mergedAt: t.mergedAt,
			filesTouched: t.filesTouched,
			author: fenceUntrusted(`pr:${t.prNumber}:author`, t.author),
			title: fenceUntrusted(`pr:${t.prNumber}:title`, t.title),
			bodyPreview: fenceUntrusted(`pr:${t.prNumber}:body`, t.bodyPreview),
		})),
		capabilityDeltas: bundle.capabilityDeltas.map((d) => ({
			id: d.id,
			prNumber: d.prNumber,
			kind: d.kind,
			subject: fenceUntrusted(`delta:${d.id}:subject`, d.subject),
			detail: fenceUntrusted(`delta:${d.id}:detail`, d.detail),
			facts: fenceStringRecord(`delta:${d.id}:facts`, d.facts),
		})),
		packages: bundle.packages.map((p) => ({
			name: p.name,
			version: p.version,
			ecosystem: p.ecosystem,
			direct: p.direct,
			dev: p.dev,
			relation: p.relation,
			vulnIds: p.vulnIds,
			publishedAt: p.publishedAt,
			gapDaysFromPrevious: p.gapDaysFromPrevious,
			maintainers: p.maintainers?.map((m, i) =>
				fenceUntrusted(`pkg:${p.name}:maintainer[${i}]`, m),
			),
			signals: p.signals?.map((s, i) => fenceUntrusted(`pkg:${p.name}:signal[${i}]`, s)),
		})),
	};
}
