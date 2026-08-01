"use client";

import { Canvas } from "@/components/ai-elements/canvas";
import { Controls } from "@/components/ai-elements/controls";
import { Node } from "@/components/ai-elements/node";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildHierarchy,
  clusterId,
  type DepCluster,
  packageId,
} from "@/lib/dep-hierarchy";
import { layoutTiers, NODE_WIDTH } from "@/lib/graph-layout";
import { cn } from "@/lib/utils";
import {
  type Edge,
  Handle,
  MarkerType,
  type Node as FlowNode,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PackageIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface DepVuln {
  id: string;
  summary: string;
  severity: string | null;
  aliases: string[];
}

export interface DepPackage {
  name: string;
  version: string;
  dev: boolean;
  direct: boolean;
  lockfile: string;
  vulns: DepVuln[];
}

export interface DepGraphData {
  repo: string;
  defaultBranch: string;
  generatedAt: number;
  cached?: boolean;
  roots: Array<{ id: string; name: string; lockfile: string; packages: number }>;
  packages: DepPackage[];
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

function severityRank(severity: string | null): number {
  const value = (severity ?? "").toUpperCase();
  if (value.startsWith("CRIT")) return 0;
  if (value.startsWith("HIGH")) return 1;
  if (value.startsWith("MOD") || value.startsWith("MED")) return 2;
  if (value.startsWith("LOW")) return 3;
  return 2;
}

const SEVERITY_STYLE = [
  { label: "Critical", badge: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", accent: "border-l-red-500" },
  { label: "High", badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30", accent: "border-l-orange-500" },
  { label: "Moderate", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30", accent: "border-l-amber-500" },
  { label: "Low", badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30", accent: "border-l-sky-500" },
];

function worstSeverity(vulns: DepVuln[]): number | null {
  if (vulns.length === 0) return null;
  return Math.min(...vulns.map((vuln) => severityRank(vuln.severity)));
}

function RootNodeCard({ data }: { data: { name: string; lockfile: string; packages: number } }) {
  return (
    <Node
      className="h-14 w-58 justify-center gap-0 overflow-hidden border-l-2 border-l-primary px-3 py-0"
      handles={{ target: false, source: false }}
    >
      <Handle position={Position.Right} type="source" />
      <div className="flex items-center gap-2">
        <PackageIcon className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{data.name}</span>
      </div>
      <p className="mt-0.5 truncate font-mono text-muted-foreground text-xs">
        {data.lockfile} · {data.packages} pkgs
      </p>
    </Node>
  );
}

function DepNodeCard({
  data,
}: {
  data: { pkg: DepPackage; selected: boolean };
}) {
  const { pkg } = data;
  const worst = worstSeverity(pkg.vulns);
  const style = worst === null ? null : SEVERITY_STYLE[worst];
  return (
    <Node
      className={cn(
        "h-14 w-58 cursor-pointer justify-center gap-0 overflow-hidden border-l-2 px-3 py-0 transition-shadow hover:shadow-md",
        style?.accent ?? "border-l-border",
        pkg.dev && !style && "opacity-70",
        data.selected && "ring-2 ring-primary/60",
      )}
      handles={{ target: false, source: false }}
    >
      <Handle position={Position.Left} type="target" />
      <Handle position={Position.Right} type="source" />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{pkg.name}</span>
        {style && (
          <Badge className={cn("border text-[10px]", style.badge)}>
            {pkg.vulns.length} {style.label}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-muted-foreground text-xs">
        {pkg.version}
        {pkg.dev && <span className="text-[10px]">dev</span>}
      </p>
    </Node>
  );
}

function ClusterNodeCard({
  data,
}: {
  data: { cluster: DepCluster; expanded: boolean };
}) {
  const { cluster, expanded } = data;
  return (
    <Node
      className={cn(
        "h-14 w-58 cursor-pointer justify-center gap-0 overflow-hidden border-l-2 border-l-muted-foreground/40 border-dashed px-3 py-0 transition-shadow hover:shadow-md",
        expanded && "border-l-primary bg-muted/40",
      )}
      handles={{ target: false, source: false }}
    >
      <Handle position={Position.Left} type="target" />
      <Handle position={Position.Right} type="source" />
      <div className="flex items-center gap-2">
        {expanded ? (
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {cluster.label}
        </span>
        <Badge className="text-[10px]" variant="secondary">
          {cluster.packages.length}
        </Badge>
      </div>
      <p className="mt-0.5 truncate pl-5 text-muted-foreground text-xs">
        {cluster.packages.length} packages{cluster.devOnly && " · dev"}
      </p>
    </Node>
  );
}

const nodeTypes = {
  root: RootNodeCard,
  pkg: DepNodeCard,
  cluster: ClusterNodeCard,
};

interface PkgDetail {
  provenance?: {
    maintainers?: string[];
    publishedAt?: string | null;
    gapDaysFromPrevious?: number | null;
    totalVersions?: number;
    signals?: string[];
    error?: string;
  } | null;
  vulns?: DepVuln[];
}

function DepsInner({ data }: { data: DepGraphData }) {
  const [selected, setSelected] = useState<DepPackage | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState<PkgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { fitView } = useReactFlow();

  const hierarchy = useMemo(() => buildHierarchy(data.packages), [data]);

  const { nodes, edges } = useMemo(() => {
    // Tier 1 holds the collapsed view: clusters, lone scoped packages, and
    // every risky package. Tier 2 only exists for expanded cluster members.
    const tier1 = [
      ...hierarchy.risky.map(packageId),
      ...hierarchy.clusters.map((cluster) => cluster.id),
      ...hierarchy.standalone.map(packageId),
    ];
    const expandedMembers = hierarchy.clusters
      .filter((cluster) => expanded.has(cluster.id))
      .flatMap((cluster) => cluster.packages);
    const tier2 = expandedMembers.map(packageId);

    const { positions } = layoutTiers([
      data.roots.map((root) => root.id),
      tier1,
      tier2,
    ]);

    const at = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
    const isSelected = (pkg: DepPackage) =>
      selected?.name === pkg.name && selected?.version === pkg.version;

    const rootNodes: FlowNode[] = data.roots.map((root) => ({
      id: root.id,
      type: "root",
      position: at(root.id),
      data: root,
      width: NODE_WIDTH,
      draggable: false,
    }));

    const clusterNodes: FlowNode[] = hierarchy.clusters.map((cluster) => ({
      id: cluster.id,
      type: "cluster",
      position: at(cluster.id),
      data: { cluster, expanded: expanded.has(cluster.id) },
      width: NODE_WIDTH,
      draggable: false,
    }));

    const shown = [...hierarchy.risky, ...hierarchy.standalone, ...expandedMembers];
    const pkgNodes: FlowNode[] = shown.map((pkg) => ({
      id: packageId(pkg),
      type: "pkg",
      position: at(packageId(pkg)),
      data: { pkg: pkg as DepPackage, selected: isSelected(pkg as DepPackage) },
      width: NODE_WIDTH,
      draggable: false,
    }));

    // Root edges re-point at whichever node actually represents the package:
    // the package itself when visible, otherwise its cluster.
    const clusterOf = new Map<string, string>();
    for (const cluster of hierarchy.clusters) {
      for (const pkg of cluster.packages) {
        clusterOf.set(packageId(pkg), cluster.id);
      }
    }
    const visible = new Set([
      ...rootNodes.map((node) => node.id),
      ...clusterNodes.map((node) => node.id),
      ...pkgNodes.map((node) => node.id),
    ]);

    const seen = new Set<string>();
    const flowEdges: Edge[] = [];
    for (const edge of data.edges) {
      const target = visible.has(edge.to)
        ? edge.to
        : (clusterOf.get(edge.to) ?? null);
      if (!target) continue;
      const key = `${edge.from}->${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Version ranges are deliberately NOT drawn on edges: with 60 of them
      // the labels swamp the cards. The requirement shows in the detail panel.
      flowEdges.push({
        id: `d-${key}`,
        source: edge.from,
        target,
        data: { requirement: edge.requirement },
        style: { stroke: "var(--border)", strokeWidth: 1.25, opacity: 0.55 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      });
    }
    // Cluster → member edges make the expansion legible as a hierarchy.
    for (const cluster of hierarchy.clusters) {
      if (!expanded.has(cluster.id)) continue;
      for (const pkg of cluster.packages) {
        flowEdges.push({
          id: `c-${cluster.id}-${packageId(pkg)}`,
          source: cluster.id,
          target: packageId(pkg),
          // Expansion edges are the ones the user just asked for: draw them
          // stronger than the ambient root → dependency fan.
          style: { stroke: "var(--primary)", strokeWidth: 1.25, opacity: 0.7 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
        });
      }
    }

    return {
      nodes: [...rootNodes, ...clusterNodes, ...pkgNodes],
      edges: flowEdges,
    };
  }, [data, hierarchy, expanded, selected]);

  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.12, duration: 300, minZoom: 0.55, maxZoom: 1.1 }), 60);
    return () => clearTimeout(timer);
  }, [data, fitView]);

  // Package detail (provenance + hydrated vulns) is fetched on click only.
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    const params = new URLSearchParams({
      name: selected.name,
      version: selected.version,
      vulns: selected.vulns.map((vuln) => vuln.id).join(","),
    });
    fetch(`/api/repo/pkg?${params}`)
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setDetail(body as PkgDetail);
      })
      .catch(() => {
        if (!cancelled) setDetail({});
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="relative min-h-0 flex-1">
      <Canvas
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.55, maxZoom: 1.1 }}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_, node) => {
          if (node.id.startsWith(clusterId(""))) {
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(node.id)) next.delete(node.id);
              else next.add(node.id);
              return next;
            });
            return;
          }
          const pkg = data.packages.find(
            (candidate) => `${candidate.name}@${candidate.version}` === node.id,
          );
          setSelected((current) =>
            current && pkg && current.name === pkg.name ? null : (pkg ?? null),
          );
        }}
        onPaneClick={() => setSelected(null)}
        panOnDrag
        proOptions={{ hideAttribution: true }}
        selectionOnDrag={false}
      >
        <Controls className="text-foreground" showInteractive={false} />
      </Canvas>

      {selected && (
        <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto border-t bg-background/95 p-4 shadow-lg backdrop-blur sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-80 sm:border-t-0 sm:border-l">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-sm">{selected.name}</h3>
              <p className="font-mono text-muted-foreground text-xs">
                {selected.version} · {selected.lockfile}
              </p>
            </div>
            <Button
              aria-label="Close"
              onClick={() => setSelected(null)}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon className="size-4" />
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge className="text-[10px]" variant={selected.direct ? "default" : "secondary"}>
              {selected.direct ? "direct" : "transitive"}
            </Badge>
            {(() => {
              // The declared range lives here rather than on the edge.
              const requirement = data.edges.find(
                (edge) => edge.to === `${selected.name}@${selected.version}`,
              )?.requirement;
              return requirement ? (
                <Badge className="font-mono text-[10px]" variant="outline">
                  {requirement}
                </Badge>
              ) : null;
            })()}
            {selected.dev && (
              <Badge className="text-[10px]" variant="outline">
                dev
              </Badge>
            )}
            <Button
              className="ml-auto h-6 gap-1 px-2 text-[10px]"
              nativeButton={false}
              render={
                <a
                  href={`https://www.npmjs.com/package/${selected.name}/v/${selected.version}`}
                  rel="noreferrer"
                  target="_blank"
                />
              }
              size="sm"
              variant="ghost"
            >
              <ExternalLinkIcon className="size-3" />
              npm
            </Button>
          </div>

          {detailLoading && (
            <p className="mt-3 text-muted-foreground text-xs">Loading detail…</p>
          )}

          {detail?.provenance && !detail.provenance.error && (
            <div className="mt-3 border-t pt-3">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                Provenance
              </p>
              <dl className="mt-1.5 space-y-1 text-xs">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Maintainers</dt>
                  <dd className="ml-auto truncate">
                    {detail.provenance.maintainers?.length ?? 0}
                  </dd>
                </div>
                {detail.provenance.publishedAt && (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Published</dt>
                    <dd className="ml-auto">
                      {detail.provenance.publishedAt.slice(0, 10)}
                    </dd>
                  </div>
                )}
                {detail.provenance.gapDaysFromPrevious !== null &&
                  detail.provenance.gapDaysFromPrevious !== undefined && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Gap before release</dt>
                      <dd className="ml-auto">
                        {detail.provenance.gapDaysFromPrevious}d
                      </dd>
                    </div>
                  )}
              </dl>
              {(detail.provenance.signals?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {detail.provenance.signals?.map((signal) => (
                    <Badge className="text-[10px]" key={signal} variant="outline">
                      {signal}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {(detail?.vulns?.length ?? selected.vulns.length) > 0 && (
            <div className="mt-3 border-t pt-3">
              <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                <ShieldAlertIcon className="size-3.5" />
                Vulnerabilities
              </p>
              <ul className="mt-2 space-y-2">
                {(detail?.vulns ?? selected.vulns).map((vuln) => {
                  const style = SEVERITY_STYLE[severityRank(vuln.severity)];
                  return (
                    <li className="rounded-md border px-2.5 py-2" key={vuln.id}>
                      <div className="flex items-center gap-1.5">
                        <Badge className={cn("border text-[10px]", style.badge)}>
                          {vuln.severity ?? style.label}
                        </Badge>
                        <a
                          className="ml-auto font-mono text-[10px] underline-offset-2 hover:underline"
                          href={`https://osv.dev/vulnerability/${vuln.id}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {vuln.id}
                        </a>
                      </div>
                      {vuln.summary && (
                        <p className="mt-1 text-muted-foreground text-xs">
                          {vuln.summary}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

export function DepGraphCanvas({ data }: { data: DepGraphData }) {
  return (
    <ReactFlowProvider>
      <DepsInner data={data} />
    </ReactFlowProvider>
  );
}
