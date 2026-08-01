"use client";

import { Canvas } from "@/components/ai-elements/canvas";
import { Controls } from "@/components/ai-elements/controls";
import { Node } from "@/components/ai-elements/node";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { layoutDeps, NODE_WIDTH } from "@/lib/graph-layout";
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
import { ExternalLinkIcon, PackageIcon, ShieldAlertIcon, XIcon } from "lucide-react";
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
      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
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
      <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
        {pkg.version}
        {pkg.dev && <span className="text-[10px]">dev</span>}
      </p>
    </Node>
  );
}

const nodeTypes = { root: RootNodeCard, pkg: DepNodeCard };

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
  const [detail, setDetail] = useState<PkgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    const positions = layoutDeps(data);
    const rootNodes: FlowNode[] = data.roots.map((root) => ({
      id: root.id,
      type: "root",
      position: positions.get(root.id) ?? { x: 0, y: 0 },
      data: root,
      width: NODE_WIDTH,
      draggable: false,
    }));
    const pkgNodes: FlowNode[] = data.packages.map((pkg) => {
      const id = `${pkg.name}@${pkg.version}`;
      return {
        id,
        type: "pkg",
        position: positions.get(id) ?? { x: 0, y: 0 },
        data: {
          pkg,
          selected:
            selected?.name === pkg.name && selected?.version === pkg.version,
        },
        width: NODE_WIDTH,
        draggable: false,
      };
    });
    const flowEdges: Edge[] = data.edges.map((edge, index) => ({
      id: `d${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.requirement || undefined,
      labelShowBg: true,
      labelStyle: { fontSize: 9, fill: "var(--muted-foreground)" },
      labelBgStyle: { fill: "var(--background)", fillOpacity: 0.85 },
      style: { stroke: "var(--border)", strokeWidth: 1.25 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    }));
    return { nodes: [...rootNodes, ...pkgNodes], edges: flowEdges };
  }, [data, selected]);

  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
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
        fitViewOptions={{ padding: 0.15 }}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_, node) => {
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
        <aside className="absolute inset-y-0 right-0 z-20 w-80 overflow-y-auto border-l bg-background/95 p-4 shadow-lg backdrop-blur">
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
