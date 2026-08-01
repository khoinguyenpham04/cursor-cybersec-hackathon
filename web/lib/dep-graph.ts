// Assembles the dependency graph the canvas renders: lockfile-accurate
// packages, OSV vulnerabilities, and edges from each lockfile's manifest.
//
// Legibility over completeness. A lockfile can hold thousands of packages, so
// the initial graph is roots + direct dependencies + every vulnerable package
// (at any depth). Transitive expansion happens on demand via deps.dev
// (/api/repo/deps/expand), one package at a time.

import {
  hydrateVulns,
  type LockEntry,
  parseNpmLock,
  pkgKey,
  queryVulnerabilities,
  type Vuln,
} from "./deps";
import {
  getRawFile,
  getRepo,
  getRepoTree,
  type RepoRef,
} from "./github";

export interface DepPackage {
  name: string;
  version: string;
  dev: boolean;
  direct: boolean;
  /** Which lockfile this package came from, e.g. "web/package-lock.json". */
  lockfile: string;
  vulns: Vuln[];
}

export interface DepGraphResponse {
  repo: string;
  defaultBranch: string;
  generatedAt: number;
  /** One root per lockfile found in the repo. */
  roots: Array<{ id: string; name: string; lockfile: string; packages: number }>;
  packages: DepPackage[];
  /** Keys are root ids or `${name}@${version}`. */
  edges: Array<{ from: string; to: string; requirement: string }>;
  totals: {
    packages: number;
    direct: number;
    vulnerable: number;
    shown: number;
    lockfiles: number;
  };
  notes: string[];
}

export function packageId(pkg: { name: string; version: string }): string {
  return `${pkg.name}@${pkg.version}`;
}

const MAX_LOCKFILES = 6;
const MAX_DIRECT_PER_ROOT = 60;
const VULN_HYDRATE_LIMIT = 20;

function findLockfiles(paths: string[]): string[] {
  return paths
    .filter(
      (path) =>
        path.endsWith("package-lock.json") && !path.includes("node_modules/"),
    )
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, MAX_LOCKFILES);
}

/** Requirement strings from the manifest sitting beside a lockfile. */
async function readManifestRequirements(
  ref: RepoRef,
  lockfilePath: string,
  gitRef: string,
): Promise<{ name: string; requirements: Record<string, string> }> {
  const manifestPath = lockfilePath.replace(/package-lock\.json$/, "package.json");
  try {
    const manifest = JSON.parse(await getRawFile(ref, manifestPath, gitRef)) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      name: manifest.name ?? manifestPath.replace(/\/?package\.json$/, "") ?? "root",
      requirements: { ...manifest.dependencies, ...manifest.devDependencies },
    };
  } catch {
    return { name: lockfilePath.replace(/\/?package-lock\.json$/, "") || "root", requirements: {} };
  }
}

export async function buildDepGraph(
  ref: RepoRef,
  options: { lockfile?: string } = {},
): Promise<DepGraphResponse> {
  const repo = await getRepo(ref);
  const tree = await getRepoTree(ref, repo.defaultBranch);
  const notes: string[] = [];
  if (tree.truncated) notes.push("Repository tree was truncated by the GitHub API.");

  let lockfiles = findLockfiles(tree.paths);
  if (options.lockfile) {
    lockfiles = lockfiles.filter((path) => path === options.lockfile);
  }
  if (lockfiles.length === 0) {
    throw new Error(
      "No supported lockfile found. This view needs a package-lock.json (npm v2/v3).",
    );
  }

  const roots: DepGraphResponse["roots"] = [];
  const edges: DepGraphResponse["edges"] = [];
  const allEntries: Array<LockEntry & { lockfile: string }> = [];
  const directKeys = new Set<string>();

  for (const lockfile of lockfiles) {
    let entries: LockEntry[];
    try {
      entries = parseNpmLock(await getRawFile(ref, lockfile, repo.defaultBranch));
    } catch (error) {
      notes.push(`${lockfile}: ${(error as Error).message}`);
      continue;
    }
    const manifest = await readManifestRequirements(ref, lockfile, repo.defaultBranch);
    const rootId = `root:${lockfile}`;
    roots.push({
      id: rootId,
      name: manifest.name,
      lockfile,
      packages: entries.length,
    });

    for (const entry of entries) {
      allEntries.push({ ...entry, lockfile });
    }

    // True direct dependencies are the ones the MANIFEST declares. The
    // lockfile's `direct` flag only means "hoisted to top-level
    // node_modules", which npm does for most transitive packages too (in
    // this repo: 937 of 1033 entries).
    const directs = entries
      .filter((entry) => entry.direct && manifest.requirements[entry.name] !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
    let shown = 0;
    for (const entry of directs) {
      if (shown >= MAX_DIRECT_PER_ROOT) {
        notes.push(
          `${lockfile}: showing ${MAX_DIRECT_PER_ROOT} of ${directs.length} direct dependencies.`,
        );
        break;
      }
      directKeys.add(`${lockfile}:${packageId(entry)}`);
      edges.push({
        from: rootId,
        to: packageId(entry),
        requirement: manifest.requirements[entry.name] ?? "",
      });
      shown++;
    }
  }

  // One OSV batch over every lockfile package (deduped), then hydrate the
  // most significant hits.
  const unique = new Map<string, LockEntry & { lockfile: string }>();
  for (const entry of allEntries) {
    const key = pkgKey(entry);
    if (!unique.has(key)) unique.set(key, entry);
  }
  let vulnMap = new Map<string, Vuln[]>();
  try {
    vulnMap = await queryVulnerabilities([...unique.values()]);
    await hydrateVulns(vulnMap, { limit: VULN_HYDRATE_LIMIT });
  } catch (error) {
    notes.push(`Vulnerability lookup failed: ${(error as Error).message}`);
  }

  // Render set: direct deps (up to the cap) plus every vulnerable package at
  // any depth — the ones worth seeing without expanding anything.
  const packages: DepPackage[] = [];
  const seen = new Set<string>();
  for (const entry of unique.values()) {
    const vulns = vulnMap.get(pkgKey(entry)) ?? [];
    const isDirect = directKeys.has(`${entry.lockfile}:${packageId(entry)}`);
    if (!isDirect && vulns.length === 0) continue;
    const id = packageId(entry);
    if (seen.has(id)) continue;
    seen.add(id);
    packages.push({
      name: entry.name,
      version: entry.version,
      dev: entry.dev,
      direct: isDirect,
      lockfile: entry.lockfile,
      vulns,
    });
  }

  return {
    repo: `${ref.owner}/${ref.repo}`,
    defaultBranch: repo.defaultBranch,
    generatedAt: Date.now(),
    roots,
    packages,
    // Drop edges whose target isn't rendered.
    edges: edges.filter((edge) => seen.has(edge.to)),
    totals: {
      packages: unique.size,
      direct: directKeys.size,
      vulnerable: vulnMap.size,
      shown: packages.length,
      lockfiles: roots.length,
    },
    notes,
  };
}
