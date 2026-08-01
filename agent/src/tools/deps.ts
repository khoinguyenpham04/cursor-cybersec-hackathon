import { defineTool, type JsonValue } from '@flue/runtime';
import * as v from 'valibot';
import {
	type Ecosystem,
	fetchDependencyGraph,
	fetchNpmProvenance,
	hydrateVulns,
	pkgKey,
	queryVulnerabilities,
} from '../lib/deps.ts';

const ecosystemInput = v.pipe(
	v.picklist(['npm', 'PyPI', 'crates.io', 'Go', 'Maven', 'NuGet']),
	v.description('Package ecosystem (npm, PyPI, crates.io, Go, Maven, NuGet).'),
);

export const depGraph = defineTool({
	name: 'dep_graph',
	description:
		'Resolve the transitive dependency graph of one package version via deps.dev. Returns counts plus the direct dependencies and a sample of indirect ones — use it to judge how heavy or risky a dependency is.',
	input: v.object({
		name: v.pipe(v.string(), v.description('Package name, e.g. "express" or "@scope/pkg"')),
		version: v.pipe(v.string(), v.description('Exact version, e.g. "4.18.2"')),
		ecosystem: ecosystemInput,
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		try {
			log.info(`deps.dev graph for ${data.ecosystem}:${data.name}@${data.version}`);
			const graph = await fetchDependencyGraph({
				name: data.name,
				version: data.version,
				ecosystem: data.ecosystem as Ecosystem,
			});
			const direct = graph.nodes.filter((node) => node.relation === 'DIRECT');
			const indirect = graph.nodes.filter((node) => node.relation === 'INDIRECT');
			return {
				output: {
					package: `${data.name}@${data.version}`,
					totalPackages: graph.nodes.length,
					direct: direct.map((node) => `${node.name}@${node.version}`),
					indirectCount: indirect.length,
					indirectSample: indirect.slice(0, 25).map((node) => `${node.name}@${node.version}`),
				},
			};
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

const packageRefInput = v.object({
	name: v.string(),
	version: v.string(),
	ecosystem: ecosystemInput,
});

export const checkVulns = defineTool({
	name: 'check_vulns',
	description:
		'Check a list of package versions against the OSV.dev vulnerability database. Returns known vulnerabilities per package, with summary and severity for the most significant ones.',
	input: v.object({
		packages: v.pipe(v.array(packageRefInput), v.minLength(1), v.maxLength(200)),
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		try {
			log.info(`OSV check for ${data.packages.length} package(s)`);
			const vulns = await queryVulnerabilities(
				data.packages.map((pkg) => ({ ...pkg, ecosystem: pkg.ecosystem as Ecosystem })),
			);
			await hydrateVulns(vulns, { limit: 20 });
			const clean = data.packages.length - vulns.size;
			return {
				output: {
					checked: data.packages.length,
					clean,
					vulnerable: Object.fromEntries(
						[...vulns.entries()].map(([key, list]) => [
							key,
							list.map((vuln) => ({
								id: vuln.id,
								severity: vuln.severity,
								summary: vuln.summary.slice(0, 200),
							})),
						]),
					),
				},
			};
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

export const packageProvenance = defineTool({
	name: 'package_provenance',
	description:
		'Fetch npm registry provenance signals for one package version: maintainers, publish timeline, dormancy gaps, and heuristic risk flags (e.g. "published after 400 days of dormancy", "single maintainer"). npm only.',
	input: v.object({
		name: v.pipe(v.string(), v.description('npm package name')),
		version: v.pipe(v.string(), v.description('Exact version')),
	}),
	async run({ data, log }): Promise<{ output: JsonValue }> {
		try {
			log.info(`npm provenance for ${data.name}@${data.version}`);
			return { output: { ...(await fetchNpmProvenance(data.name, data.version)) } };
		} catch (error) {
			return { output: { error: (error as Error).message } };
		}
	},
});

export { pkgKey };
