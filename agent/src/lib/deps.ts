// Dependency graph + vulnerability clients. Mirrors lib/github.ts: plain
// functions over fetch, no SDK. Three free upstreams, none needing auth:
//
//   deps.dev   resolved transitive graph      (nodes + edges, no install)
//   OSV.dev    vulnerabilities                (aggregates GHSA/PyPA/RustSec)
//   registry   maintainer + publish timeline  (the behavioural signals)
//
// Response shapes verified against live calls on 2026-08-01:
//   deps.dev :dependencies -> { nodes: [{versionKey:{system,name,version}, relation}], edges: [{fromNode,toNode,requirement}] }
//   OSV querybatch         -> { results: [{ vulns?: [{id, modified}], next_page_token? }] }   (IDs only)
//   OSV /v1/vulns/{id}     -> { summary, details, aliases, severity: [{type,score}], database_specific: {severity} }
//   npm packument          -> { maintainers: [{name,email}], time: {created, modified, <version>: iso} }

export type Ecosystem = 'npm' | 'PyPI' | 'crates.io' | 'Go' | 'Maven' | 'NuGet';

/** fetch with a 10s timeout and one retry on 5xx/network errors. */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
			if (response.status >= 500 && attempt === 0) continue;
			if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
			return (await response.json()) as T;
		} catch (error) {
			if (attempt === 0 && !(error instanceof Error && /\b\d{3}\b/.test(error.message))) {
				continue; // network error / timeout: retry once
			}
			throw error;
		}
	}
}

// deps.dev uses lowercase system names in the path; OSV uses these casings.
const DEPS_DEV_SYSTEM: Record<Ecosystem, string> = {
	npm: 'npm',
	PyPI: 'pypi',
	'crates.io': 'cargo',
	Go: 'go',
	Maven: 'maven',
	NuGet: 'nuget',
};

export interface PackageRef {
	name: string;
	version: string;
	ecosystem: Ecosystem;
}

export function pkgKey(pkg: PackageRef): string {
	return `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
}

// ---------------------------------------------------------------------------
// Lockfile parsing — package-lock.json v2/v3 only. Deliberately not a general
// parser: the demo repo is npm, and this is 30 lines instead of a dependency.
// ---------------------------------------------------------------------------

export interface LockEntry extends PackageRef {
	/** node_modules path from the lockfile, e.g. "node_modules/foo/node_modules/bar" */
	path: string;
	/** true when the package is only reachable through devDependencies */
	dev: boolean;
	/** true when nothing else in the tree depends on it (i.e. declared directly) */
	direct: boolean;
}

export function parseNpmLock(source: string): LockEntry[] {
	const lock = JSON.parse(source) as {
		lockfileVersion?: number;
		packages?: Record<string, { version?: string; dev?: boolean; link?: boolean }>;
	};
	if (!lock.packages) {
		throw new Error(
			`Unsupported lockfile (lockfileVersion ${lock.lockfileVersion ?? '?'}). ` +
				'Only package-lock.json v2/v3 with a "packages" map is handled.',
		);
	}

	const entries: LockEntry[] = [];
	for (const [path, meta] of Object.entries(lock.packages)) {
		// "" is the root project; links are workspace symlinks, not real deps.
		if (path === '' || meta.link || !meta.version) continue;
		// The package name is everything after the LAST node_modules/ — for
		// "node_modules/foo/node_modules/bar" that's "bar" (and scoped names
		// like ".../node_modules/@scope/pkg" keep their scope).
		const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
		if (!name) continue;
		entries.push({
			name,
			version: meta.version,
			ecosystem: 'npm',
			path,
			dev: meta.dev === true,
			// Top-level node_modules/<name> with no nesting == declared directly.
			direct: /^node_modules\/(@[^/]+\/)?[^/]+$/.test(path),
		});
	}
	return entries;
}

/** Added / removed / version-changed packages between two lockfiles. */
export function diffLocks(before: LockEntry[], after: LockEntry[]) {
	const index = (list: LockEntry[]) => new Map(list.map((e) => [`${e.ecosystem}:${e.name}`, e]));
	const a = index(before);
	const b = index(after);

	const added: LockEntry[] = [];
	const removed: LockEntry[] = [];
	const changed: Array<{ from: LockEntry; to: LockEntry }> = [];

	for (const [key, entry] of b) {
		const prior = a.get(key);
		if (!prior) added.push(entry);
		else if (prior.version !== entry.version) changed.push({ from: prior, to: entry });
	}
	for (const [key, entry] of a) if (!b.has(key)) removed.push(entry);

	return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// deps.dev — resolved transitive graph
// ---------------------------------------------------------------------------

export interface DepGraph {
	nodes: Array<{ name: string; version: string; ecosystem: Ecosystem; relation: string }>;
	edges: Array<{ from: number; to: number; requirement: string }>;
}

export async function fetchDependencyGraph(pkg: PackageRef): Promise<DepGraph> {
	const system = DEPS_DEV_SYSTEM[pkg.ecosystem];
	const url =
		`https://api.deps.dev/v3/systems/${system}/packages/` +
		`${encodeURIComponent(pkg.name)}/versions/${encodeURIComponent(pkg.version)}:dependencies`;

	const body = await fetchJson<{
		nodes?: Array<{ versionKey?: { name?: string; version?: string }; relation?: string }>;
		edges?: Array<{ fromNode?: number; toNode?: number; requirement?: string }>;
	}>(url, { headers: { Accept: 'application/json' } });

	return {
		nodes: (body.nodes ?? []).map((n) => ({
			name: n.versionKey?.name ?? '',
			version: n.versionKey?.version ?? '',
			ecosystem: pkg.ecosystem,
			// SELF | DIRECT | INDIRECT — the hop distance you want in the UI.
			relation: n.relation ?? 'INDIRECT',
		})),
		edges: (body.edges ?? []).map((e) => ({
			from: e.fromNode ?? 0,
			to: e.toNode ?? 0,
			requirement: e.requirement ?? '',
		})),
	};
}

// ---------------------------------------------------------------------------
// OSV — vulnerabilities, batched
// ---------------------------------------------------------------------------

export interface Vuln {
	id: string;
	summary: string;
	severity: string | null;
	aliases: string[];
}

const OSV_BATCH_LIMIT = 1000;
const OSV_MAX_PAGES = 3;

interface OsvBatchResult {
	vulns?: Array<{ id: string; modified?: string }>;
	next_page_token?: string;
}

/** Returns a map of pkgKey() -> vulnerabilities. Batches to stay under the API cap. */
export async function queryVulnerabilities(packages: PackageRef[]): Promise<Map<string, Vuln[]>> {
	const results = new Map<string, Vuln[]>();

	for (let offset = 0; offset < packages.length; offset += OSV_BATCH_LIMIT) {
		const batch = packages.slice(offset, offset + OSV_BATCH_LIMIT);
		// Per-query pagination: a package with many vulns returns a
		// next_page_token; requery just those entries (rare — cap the loop).
		let pending = batch.map((pkg, index) => ({ pkg, index, pageToken: '' }));
		for (let page = 0; page < OSV_MAX_PAGES && pending.length > 0; page++) {
			const body = await fetchJson<{ results?: OsvBatchResult[] }>(
				'https://api.osv.dev/v1/querybatch',
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						queries: pending.map(({ pkg, pageToken }) => ({
							package: { name: pkg.name, ecosystem: pkg.ecosystem },
							version: pkg.version,
							...(pageToken ? { page_token: pageToken } : {}),
						})),
					}),
				},
			);

			const next: typeof pending = [];
			(body.results ?? []).forEach((result, i) => {
				const entry = pending[i];
				const ids = (result.vulns ?? []).map((v) => v.id);
				if (ids.length) {
					const key = pkgKey(entry.pkg);
					const existing = results.get(key) ?? [];
					// querybatch returns IDs only — hydrateVulns fills in detail.
					results.set(key, [
						...existing,
						...ids.map((id) => ({ id, summary: '', severity: null, aliases: [] })),
					]);
				}
				if (result.next_page_token) {
					next.push({ ...entry, pageToken: result.next_page_token });
				}
			});
			pending = next;
		}
	}
	return results;
}

/**
 * Fill in summary/severity/aliases for the vulnerabilities that matter most:
 * mutates up to `limit` entries in place via /v1/vulns/{id}, worker-pooled.
 * Packages with more vulns get hydrated first.
 */
export async function hydrateVulns(
	vulns: Map<string, Vuln[]>,
	options: { limit: number; concurrency?: number },
): Promise<void> {
	const { limit, concurrency = 4 } = options;
	const queue = [...vulns.values()]
		.sort((a, b) => b.length - a.length)
		.flat()
		.filter((vuln) => !vuln.summary)
		.slice(0, limit);

	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
			while (cursor < queue.length) {
				const target = queue[cursor++];
				try {
					const detail = await fetchVulnDetail(target.id);
					target.summary = detail.summary;
					target.severity = detail.severity;
					target.aliases = detail.aliases;
				} catch {
					// A failed hydration leaves the stub — the id still renders.
				}
			}
		}),
	);
}

/** Hydrate one OSV id into full detail. Call only for vulns you will surface. */
export async function fetchVulnDetail(id: string): Promise<Vuln> {
	const body = await fetchJson<{
		id: string;
		summary?: string;
		details?: string;
		aliases?: string[];
		severity?: Array<{ type?: string; score?: string }>;
		database_specific?: { severity?: string };
	}>(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`);
	return {
		id: body.id,
		summary: body.summary ?? body.details?.slice(0, 300) ?? '',
		// GHSA-style label when present; else the CVSS vector from the
		// top-level severity array (both shapes verified live).
		severity: body.database_specific?.severity ?? body.severity?.[0]?.score ?? null,
		aliases: body.aliases ?? [],
	};
}

// ---------------------------------------------------------------------------
// npm registry — provenance. This is the part the incumbents gate or skip, and
// the only place the temporal signals actually come from.
// ---------------------------------------------------------------------------

export interface Provenance {
	name: string;
	maintainers: string[];
	/** ISO timestamp this specific version was published. */
	publishedAt: string | null;
	/** Days between the previous release and this one. */
	gapDaysFromPrevious: number | null;
	totalVersions: number;
	/** Heuristic flags — evidence for an agent to weigh, NOT a verdict. */
	signals: string[];
}

const DORMANT_DAYS = 365;

export async function fetchNpmProvenance(name: string, version: string): Promise<Provenance> {
	const body = await fetchJson<{
		maintainers?: Array<{ name?: string }>;
		time?: Record<string, string>;
		versions?: Record<string, unknown>;
	}>(`https://registry.npmjs.org/${encodeURIComponent(name)}`);

	const time = body.time ?? {};
	// Drop the non-version bookkeeping keys before sorting a release timeline.
	const releases = Object.entries(time)
		.filter(([key]) => key !== 'created' && key !== 'modified')
		.map(([v, iso]) => ({ version: v, at: new Date(iso).getTime() }))
		.sort((a, b) => a.at - b.at);

	const index = releases.findIndex((r) => r.version === version);
	const publishedAt = index >= 0 ? new Date(releases[index].at).toISOString() : null;
	const gapDaysFromPrevious =
		index > 0 ? Math.round((releases[index].at - releases[index - 1].at) / 86_400_000) : null;

	const signals: string[] = [];
	if (gapDaysFromPrevious !== null && gapDaysFromPrevious > DORMANT_DAYS) {
		signals.push(`published after ${gapDaysFromPrevious} days of dormancy`);
	}
	if (releases.length && index === releases.length - 1) signals.push('latest release');
	if ((body.maintainers?.length ?? 0) === 1) signals.push('single maintainer');

	return {
		name,
		maintainers: (body.maintainers ?? []).map((m) => m.name ?? '').filter(Boolean),
		publishedAt,
		gapDaysFromPrevious,
		totalVersions: releases.length,
		signals,
	};
}
