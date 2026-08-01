// Turns a flat package list into a browsable hierarchy: root → cluster →
// package. A lockfile has dozens of direct dependencies, which as one column
// per depth is an unreadable vertical run; clustering by npm scope collapses
// that to a screenful while keeping every risky package visible.
//
// Rules:
//   - a package with vulnerabilities is NEVER hidden inside a cluster
//   - a scope with 2+ clean packages becomes one cluster node
//   - a lone scoped package is shown directly (a cluster of 1 hides nothing)
//   - unscoped clean packages collapse into one cluster (there are usually
//     far too many to show individually by default)

export interface HierarchyPackage {
  name: string;
  version: string;
  dev: boolean;
  direct: boolean;
  lockfile: string;
  vulns: unknown[];
}

export interface DepCluster {
  id: string;
  /** Display label, e.g. "@flue" or "unscoped". */
  label: string;
  packages: HierarchyPackage[];
  /** Lockfiles the members came from, for root → cluster edges. */
  lockfiles: string[];
  devOnly: boolean;
}

export interface DepHierarchy {
  clusters: DepCluster[];
  /** Clean packages shown directly (lone scoped packages). */
  standalone: HierarchyPackage[];
  /** Packages with vulnerabilities — always their own node. */
  risky: HierarchyPackage[];
}

export function packageId(pkg: { name: string; version: string }): string {
  return `${pkg.name}@${pkg.version}`;
}

export function clusterId(label: string): string {
  return `cluster:${label}`;
}

function scopeOf(name: string): string {
  return name.startsWith("@") ? name.split("/")[0] : "unscoped";
}

export function buildHierarchy(packages: HierarchyPackage[]): DepHierarchy {
  const risky = packages
    .filter((pkg) => pkg.vulns.length > 0)
    .sort((a, b) => b.vulns.length - a.vulns.length || a.name.localeCompare(b.name));

  const clean = packages.filter((pkg) => pkg.vulns.length === 0);
  const byScope = new Map<string, HierarchyPackage[]>();
  for (const pkg of clean) {
    const scope = scopeOf(pkg.name);
    byScope.set(scope, [...(byScope.get(scope) ?? []), pkg]);
  }

  const clusters: DepCluster[] = [];
  const standalone: HierarchyPackage[] = [];
  for (const [scope, members] of byScope) {
    // A cluster of one hides nothing, so show the package itself — except for
    // "unscoped", which is a bucket rather than a real namespace.
    if (members.length < 2 && scope !== "unscoped") {
      standalone.push(...members);
      continue;
    }
    clusters.push({
      id: clusterId(scope),
      label: scope,
      packages: members.sort((a, b) => a.name.localeCompare(b.name)),
      lockfiles: [...new Set(members.map((pkg) => pkg.lockfile))],
      devOnly: members.every((pkg) => pkg.dev),
    });
  }

  clusters.sort(
    (a, b) => b.packages.length - a.packages.length || a.label.localeCompare(b.label),
  );
  standalone.sort((a, b) => a.name.localeCompare(b.name));
  return { clusters, standalone, risky };
}
