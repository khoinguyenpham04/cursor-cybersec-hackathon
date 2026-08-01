"use client";

import { Node } from "@/components/ai-elements/node";
import { faviconUrl, KIND_META, type ScanNode } from "@/lib/scan";
import { cn } from "@/lib/utils";
import { Handle, Position } from "@xyflow/react";
import { useState } from "react";

export interface ScanNodeData {
  node: ScanNode;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  selected?: boolean;
}

/** Favicon for external products, falling back to the kind icon on error. */
function NodeGlyph({ node }: { node: ScanNode }) {
  const meta = KIND_META[node.kind];
  const [failed, setFailed] = useState(false);
  if (node.domain && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="size-4 shrink-0 rounded-sm"
        height={16}
        onError={() => setFailed(true)}
        src={faviconUrl(node.domain)}
        width={16}
      />
    );
  }
  const Icon = meta.icon;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}

export function ScanNodeCard({ data }: { data: ScanNodeData }) {
  const { node, hasIncoming, hasOutgoing } = data;
  const meta = KIND_META[node.kind];
  return (
    <Node
      className={cn(
        "w-58 cursor-pointer gap-0 border-l-2 py-2.5 pr-3 pl-3 transition-shadow hover:shadow-md",
        meta.accent,
        data.selected && "ring-2 ring-primary/60",
      )}
      // Base UI's Node renders its own handles; we place them ourselves so an
      // isolated node shows none.
      handles={{ target: false, source: false }}
    >
      {hasIncoming && <Handle position={Position.Left} type="target" />}
      {hasOutgoing && <Handle position={Position.Right} type="source" />}
      <div className="flex items-center gap-2">
        <NodeGlyph node={node} />
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {node.label}
        </span>
        <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      </div>
      {node.sub && (
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {node.sub}
        </p>
      )}
    </Node>
  );
}
