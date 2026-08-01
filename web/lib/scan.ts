// Client-side mirror of the agent's scan contract
// (agent/src/lib/scan-schema.ts). The scanner delivers its map as a
// submit_scan tool call; this module extracts and defensively validates that
// payload straight off the conversation stream. Template: lib/review.ts.

import type { FlueConversationMessage } from "@flue/react";
import {
  BotIcon,
  ClockIcon,
  DatabaseIcon,
  GlobeIcon,
  type LucideIcon,
  PlayIcon,
  ServerIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";

export type ScanNodeKind =
  | "entry"
  | "cron"
  | "agent"
  | "model"
  | "tool"
  | "service"
  | "store"
  | "external";

export type ScanEdgeKind = "calls" | "reads" | "writes" | "triggers";

export interface ScanNode {
  id: string;
  label: string;
  kind: ScanNodeKind;
  sub?: string;
  domain?: string;
  group?: string;
  detail?: string;
  sourceRef?: string;
}

export interface ScanEdge {
  from: string;
  to: string;
  kind?: ScanEdgeKind;
  label?: string;
}

export interface ScanResult {
  project: { name: string; slug: string; tagline?: string; date: string };
  nodes: ScanNode[];
  edges: ScanEdge[];
  stats?: {
    agents?: number;
    models?: number;
    tools?: number;
    integrations?: number;
  };
  topModels?: string[];
  topTools?: string[];
  topIntegrations?: string[];
}

export const SUBMIT_SCAN_TOOL = "submit_scan";

const KINDS: ScanNodeKind[] = [
  "entry",
  "cron",
  "agent",
  "model",
  "tool",
  "service",
  "store",
  "external",
];
const EDGE_KINDS: ScanEdgeKind[] = ["calls", "reads", "writes", "triggers"];

export const KIND_META: Record<
  ScanNodeKind,
  { label: string; icon: LucideIcon; accent: string; dot: string; badge: string }
> = {
  entry: {
    label: "Entry",
    icon: PlayIcon,
    accent: "border-l-emerald-500",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  cron: {
    label: "Scheduled",
    icon: ClockIcon,
    accent: "border-l-amber-500",
    dot: "bg-amber-500",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  agent: {
    label: "Agent",
    icon: BotIcon,
    accent: "border-l-violet-500",
    dot: "bg-violet-500",
    badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  },
  model: {
    label: "Model",
    icon: SparklesIcon,
    accent: "border-l-fuchsia-500",
    dot: "bg-fuchsia-500",
    badge: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30",
  },
  tool: {
    label: "Tool",
    icon: WrenchIcon,
    accent: "border-l-sky-500",
    dot: "bg-sky-500",
    badge: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  },
  service: {
    label: "Service",
    icon: ServerIcon,
    accent: "border-l-blue-500",
    dot: "bg-blue-500",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  store: {
    label: "Store",
    icon: DatabaseIcon,
    accent: "border-l-orange-500",
    dot: "bg-orange-500",
    badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  },
  external: {
    label: "External",
    icon: GlobeIcon,
    accent: "border-l-zinc-400",
    dot: "bg-zinc-400",
    badge: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** Parse an unknown submit_scan input into a ScanResult, or null. */
export function parseScan(input: unknown): ScanResult | null {
  if (!isRecord(input)) return null;
  const project = isRecord(input.project) ? input.project : {};
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];

  const nodes: ScanNode[] = [];
  const ids = new Set<string>();
  for (const raw of rawNodes) {
    if (!isRecord(raw)) continue;
    const id = str(raw.id, 48);
    const label = str(raw.label, 28);
    if (!id || !label || ids.has(id)) continue;
    ids.add(id);
    nodes.push({
      id,
      label,
      kind: KINDS.includes(raw.kind as ScanNodeKind)
        ? (raw.kind as ScanNodeKind)
        : "service",
      sub: str(raw.sub, 40),
      domain: str(raw.domain, 80),
      group: str(raw.group, 24),
      detail: str(raw.detail, 200),
      sourceRef: str(raw.sourceRef, 120),
    });
  }
  if (nodes.length === 0) return null;

  const rawEdges = Array.isArray(input.edges) ? input.edges : [];
  const edges: ScanEdge[] = [];
  const seenEdges = new Set<string>();
  for (const raw of rawEdges) {
    if (!isRecord(raw)) continue;
    const from = str(raw.from, 48);
    const to = str(raw.to, 48);
    // Drop dangling or duplicate edges rather than breaking the canvas.
    if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) continue;
    const key = `${from}->${to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    edges.push({
      from,
      to,
      kind: EDGE_KINDS.includes(raw.kind as ScanEdgeKind)
        ? (raw.kind as ScanEdgeKind)
        : undefined,
      label: str(raw.label, 24),
    });
  }

  return {
    project: {
      name: str(project.name, 48) ?? "Repository",
      slug: str(project.slug, 48) ?? "repository",
      tagline: str(project.tagline, 80),
      date: str(project.date, 10) ?? "",
    },
    nodes,
    edges,
    stats: isRecord(input.stats) ? (input.stats as ScanResult["stats"]) : undefined,
    topModels: Array.isArray(input.topModels)
      ? input.topModels.filter((x): x is string => typeof x === "string").slice(0, 3)
      : undefined,
    topTools: Array.isArray(input.topTools)
      ? input.topTools.filter((x): x is string => typeof x === "string").slice(0, 10)
      : undefined,
    topIntegrations: Array.isArray(input.topIntegrations)
      ? input.topIntegrations
          .filter((x): x is string => typeof x === "string")
          .slice(0, 10)
      : undefined,
  };
}

/**
 * The latest scan in the conversation, scanning from the end so a rescan
 * supersedes earlier maps.
 */
export function extractScan(
  messages: FlueConversationMessage[],
): ScanResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j];
      if (part.type !== "dynamic-tool") continue;
      if (part.toolName !== SUBMIT_SCAN_TOOL) continue;
      const scan = parseScan(part.input);
      if (scan) return scan;
    }
  }
  return null;
}

/** Favicon URL for a node's domain (Google's free endpoint). */
export function faviconUrl(domain: string, size = 32): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** GitHub blob link for a "path/to/file.ts:42" source reference. */
export function sourceRefUrl(
  owner: string,
  repo: string,
  branch: string,
  sourceRef: string,
): string {
  const [path, line] = sourceRef.split(":");
  const base = `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;
  return line && /^\d+$/.test(line) ? `${base}#L${line}` : base;
}
