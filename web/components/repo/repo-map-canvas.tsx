"use client";

import { Canvas } from "@/components/ai-elements/canvas";
import { Controls } from "@/components/ai-elements/controls";
import { Panel } from "@/components/ai-elements/panel";
import {
  ScanNodeCard,
  type ScanNodeData,
} from "@/components/repo/scan-node-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { layoutScan, NODE_WIDTH } from "@/lib/graph-layout";
import {
  KIND_META,
  type ScanNode,
  type ScanResult,
  sourceRefUrl,
} from "@/lib/scan";
import { cn } from "@/lib/utils";
import {
  type Edge,
  MarkerType,
  type Node as FlowNode,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const nodeTypes = { scan: ScanNodeCard };

function GroupFrame({ data }: { data: { name: string; width: number; height: number } }) {
  return (
    <div
      className="pointer-events-none rounded-lg border border-dashed bg-muted/20"
      style={{ width: data.width, height: data.height }}
    >
      <span className="block px-2.5 pt-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
        {data.name}
      </span>
    </div>
  );
}

const allNodeTypes = { ...nodeTypes, group: GroupFrame };

function MapInner({
  scan,
  owner,
  repo,
  branch,
}: {
  scan: ScanResult;
  owner: string;
  repo: string;
  branch: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  const { nodes, edges } = useMemo(() => {
    const layout = layoutScan(scan.nodes, scan.edges);
    const incoming = new Set(scan.edges.map((edge) => edge.to));
    const outgoing = new Set(scan.edges.map((edge) => edge.from));

    // Group frames render behind the cards as unselectable nodes.
    const frames: FlowNode[] = layout.groups.map((group) => ({
      id: `group:${group.name}`,
      type: "group",
      position: { x: group.x, y: group.y },
      data: { name: group.name, width: group.width, height: group.height },
      draggable: false,
      selectable: false,
      zIndex: 0,
    }));

    const cards: FlowNode[] = scan.nodes.map((node) => {
      const position = layout.positions.get(node.id) ?? { x: 0, y: 0 };
      return {
        id: node.id,
        type: "scan",
        position: { x: position.x, y: position.y },
        data: {
          node,
          hasIncoming: incoming.has(node.id),
          hasOutgoing: outgoing.has(node.id),
          selected: selectedId === node.id,
        } satisfies ScanNodeData,
        width: NODE_WIDTH,
        zIndex: 1,
      };
    });

    const flowEdges: Edge[] = scan.edges.map((edge, index) => ({
      id: `e${index}`,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      labelShowBg: true,
      labelBgPadding: [4, 2] as [number, number],
      labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
      labelBgStyle: { fill: "var(--background)", fillOpacity: 0.85 },
      style: { stroke: "var(--border)", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      animated: edge.kind === "triggers",
    }));

    return { nodes: [...frames, ...cards], edges: flowEdges };
  }, [scan, selectedId]);

  // Re-frame when a different scan arrives.
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
    return () => clearTimeout(timer);
  }, [scan, fitView]);

  const selected: ScanNode | undefined = scan.nodes.find(
    (node) => node.id === selectedId,
  );

  return (
    <div className="relative min-h-0 flex-1">
      <Canvas
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodeTypes={allNodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        onNodeClick={(_, node) =>
          setSelectedId((current) => (current === node.id ? null : node.id))
        }
        onPaneClick={() => setSelectedId(null)}
        panOnDrag
        proOptions={{ hideAttribution: true }}
        selectionOnDrag={false}
      >
        <Controls className="text-foreground" showInteractive={false} />
        <Panel className="m-2 flex flex-wrap gap-1.5" position="top-left">
          {(Object.keys(KIND_META) as Array<keyof typeof KIND_META>)
            .filter((kind) => scan.nodes.some((node) => node.kind === kind))
            .map((kind) => (
              <span
                className="flex items-center gap-1 rounded-md border bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur"
                key={kind}
              >
                <span className={cn("size-1.5 rounded-full", KIND_META[kind].dot)} />
                {KIND_META[kind].label}
              </span>
            ))}
        </Panel>
      </Canvas>

      {selected && (
        <aside className="absolute inset-y-0 right-0 z-20 w-80 overflow-y-auto border-l bg-background/95 p-4 shadow-lg backdrop-blur">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm">{selected.label}</h3>
              {selected.sub && (
                <p className="truncate font-mono text-muted-foreground text-xs">
                  {selected.sub}
                </p>
              )}
            </div>
            <Button
              aria-label="Close"
              onClick={() => setSelectedId(null)}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge className={cn("border text-[10px]", KIND_META[selected.kind].badge)}>
              {KIND_META[selected.kind].label}
            </Badge>
            {selected.group && (
              <Badge className="text-[10px]" variant="outline">
                {selected.group}
              </Badge>
            )}
            {selected.domain && (
              <Badge className="text-[10px]" variant="secondary">
                {selected.domain}
              </Badge>
            )}
          </div>
          {selected.detail && (
            <p className="mt-3 text-muted-foreground text-sm">{selected.detail}</p>
          )}
          {selected.sourceRef && (
            <Button
              className="mt-3 w-full justify-start gap-1.5 font-mono text-xs"
              nativeButton={false}
              render={
                <a
                  href={sourceRefUrl(owner, repo, branch, selected.sourceRef)}
                  rel="noreferrer"
                  target="_blank"
                />
              }
              size="sm"
              variant="outline"
            >
              <ExternalLinkIcon className="size-3.5" />
              {selected.sourceRef}
            </Button>
          )}
          <div className="mt-4 border-t pt-3">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Connections
            </p>
            <ul className="mt-1.5 space-y-1 text-xs">
              {scan.edges
                .filter(
                  (edge) => edge.from === selected.id || edge.to === selected.id,
                )
                .map((edge, index) => {
                  const outbound = edge.from === selected.id;
                  const otherId = outbound ? edge.to : edge.from;
                  const other = scan.nodes.find((node) => node.id === otherId);
                  return (
                    <li className="flex items-center gap-1.5" key={index}>
                      <span className="text-muted-foreground">
                        {outbound ? "→" : "←"}
                      </span>
                      <button
                        className="truncate underline-offset-2 hover:underline"
                        onClick={() => setSelectedId(otherId)}
                        type="button"
                      >
                        {other?.label ?? otherId}
                      </button>
                      {edge.kind && (
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {edge.kind}
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}

export function RepoMapCanvas(props: {
  scan: ScanResult;
  owner: string;
  repo: string;
  branch: string;
}) {
  return (
    <ReactFlowProvider>
      <MapInner {...props} />
    </ReactFlowProvider>
  );
}
