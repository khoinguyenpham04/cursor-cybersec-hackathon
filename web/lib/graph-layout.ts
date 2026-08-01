// Deterministic left-to-right layered layout. React Flow ships no layout
// engine and dagre/elk would be a new dependency for what is ~100 lines here:
// columns come from longest-path depth, and nodes sharing a `group` are pulled
// into one contiguous labeled stack.

import type { ScanEdge, ScanNode } from "./scan";

export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 64;
const COLUMN_GAP = 96;
const ROW_GAP = 20;
const GROUP_PADDING_TOP = 26;
const GROUP_GAP = 34;

export interface Positioned {
  id: string;
  x: number;
  y: number;
}

export interface GroupBox {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScanLayout {
  positions: Map<string, Positioned>;
  groups: GroupBox[];
  width: number;
  height: number;
}

/**
 * Column per node = longest path from a root, where roots are entries, crons,
 * and anything with no incoming edge. Cycles are broken by a visited set, so a
 * mutually-referencing pair still lands somewhere sensible.
 */
function assignColumns(nodes: ScanNode[], edges: ScanEdge[]): Map<string, number> {
  const outgoing = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const columns = new Map<string, number>();
  const roots = nodes.filter(
    (node) =>
      node.kind === "entry" || node.kind === "cron" || inDegree.get(node.id) === 0,
  );
  // A fully cyclic graph has no root: start somewhere so nothing is dropped.
  const queue: Array<{ id: string; column: number }> = (
    roots.length > 0 ? roots : nodes.slice(0, 1)
  ).map((node) => ({ id: node.id, column: 0 }));

  const guard = nodes.length * 8;
  let steps = 0;
  while (queue.length > 0 && steps++ < guard) {
    const { id, column } = queue.shift()!;
    const current = columns.get(id);
    if (current !== undefined && current >= column) continue;
    columns.set(id, column);
    for (const next of outgoing.get(id) ?? []) {
      queue.push({ id: next, column: column + 1 });
    }
  }
  // Unreachable nodes (cycles, or targets of dropped edges) go in column 0.
  for (const node of nodes) {
    if (!columns.has(node.id)) columns.set(node.id, 0);
  }
  return columns;
}

const KIND_ORDER = [
  "entry",
  "cron",
  "agent",
  "service",
  "tool",
  "model",
  "store",
  "external",
];

export function layoutScan(nodes: ScanNode[], edges: ScanEdge[]): ScanLayout {
  if (nodes.length === 0) {
    return { positions: new Map(), groups: [], width: 0, height: 0 };
  }

  const columns = assignColumns(nodes, edges);

  // A group is one unit: every member sits in the group's deepest column so
  // the stack reads as a single labeled block.
  const groupColumn = new Map<string, number>();
  for (const node of nodes) {
    if (!node.group) continue;
    const column = columns.get(node.id) ?? 0;
    groupColumn.set(node.group, Math.max(groupColumn.get(node.group) ?? 0, column));
  }
  for (const node of nodes) {
    if (node.group) columns.set(node.id, groupColumn.get(node.group)!);
  }

  // Bucket by column, then order: groups first (alphabetical), then loose
  // nodes by kind and label. Deterministic output for a given scan.
  const byColumn = new Map<string, ScanNode[]>();
  for (const node of nodes) {
    const key = String(columns.get(node.id) ?? 0);
    byColumn.set(key, [...(byColumn.get(key) ?? []), node]);
  }

  const positions = new Map<string, Positioned>();
  const groups: GroupBox[] = [];
  const columnKeys = [...byColumn.keys()]
    .map(Number)
    .sort((a, b) => a - b);

  // First pass: stack each column, recording its height.
  const columnHeights = new Map<number, number>();
  const columnPlans = new Map<
    number,
    Array<{ group?: string; members: ScanNode[]; height: number }>
  >();
  for (const column of columnKeys) {
    const members = byColumn.get(String(column))!;
    const grouped = new Map<string, ScanNode[]>();
    const loose: ScanNode[] = [];
    for (const node of members) {
      if (node.group) grouped.set(node.group, [...(grouped.get(node.group) ?? []), node]);
      else loose.push(node);
    }

    const plan: Array<{ group?: string; members: ScanNode[]; height: number }> = [];
    for (const name of [...grouped.keys()].sort()) {
      const groupMembers = grouped
        .get(name)!
        .sort(
          (a, b) =>
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
            a.label.localeCompare(b.label),
        );
      plan.push({
        group: name,
        members: groupMembers,
        height:
          GROUP_PADDING_TOP +
          groupMembers.length * NODE_HEIGHT +
          (groupMembers.length - 1) * ROW_GAP +
          12,
      });
    }
    for (const node of loose.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.label.localeCompare(b.label),
    )) {
      plan.push({ members: [node], height: NODE_HEIGHT });
    }

    const height =
      plan.reduce((sum, block) => sum + block.height, 0) +
      Math.max(0, plan.length - 1) * GROUP_GAP;
    columnPlans.set(column, plan);
    columnHeights.set(column, height);
  }

  // Second pass: center every column against the tallest one.
  const tallest = Math.max(...columnHeights.values());
  for (const column of columnKeys) {
    const plan = columnPlans.get(column)!;
    const x = column * (NODE_WIDTH + COLUMN_GAP);
    let y = (tallest - columnHeights.get(column)!) / 2;

    for (const block of plan) {
      if (block.group) {
        groups.push({
          name: block.group,
          x: x - 14,
          y,
          width: NODE_WIDTH + 28,
          height: block.height,
        });
        let memberY = y + GROUP_PADDING_TOP;
        for (const node of block.members) {
          positions.set(node.id, { id: node.id, x, y: memberY });
          memberY += NODE_HEIGHT + ROW_GAP;
        }
      } else {
        positions.set(block.members[0].id, { id: block.members[0].id, x, y });
      }
      y += block.height + GROUP_GAP;
    }
  }

  return {
    positions,
    groups,
    width: (Math.max(...columnKeys) + 1) * (NODE_WIDTH + COLUMN_GAP),
    height: tallest,
  };
}

// ---------------------------------------------------------------------------
// Dependency graph: roots -> direct -> transitive, vulnerable rows first.
// ---------------------------------------------------------------------------

export interface DepLayoutInput {
  roots: Array<{ id: string }>;
  packages: Array<{
    name: string;
    version: string;
    direct: boolean;
    vulns: unknown[];
  }>;
}

export function layoutDeps(input: DepLayoutInput): Map<string, Positioned> {
  const positions = new Map<string, Positioned>();
  const column = (index: number) => index * (NODE_WIDTH + COLUMN_GAP);
  const rowStep = NODE_HEIGHT + ROW_GAP;

  input.roots.forEach((root, index) => {
    positions.set(root.id, { id: root.id, x: column(0), y: index * rowStep * 2 });
  });

  const rank = (pkg: DepLayoutInput["packages"][number]) =>
    (pkg.vulns.length > 0 ? 0 : 1);
  const direct = input.packages
    .filter((pkg) => pkg.direct)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const transitive = input.packages
    .filter((pkg) => !pkg.direct)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  direct.forEach((pkg, index) => {
    const id = `${pkg.name}@${pkg.version}`;
    positions.set(id, { id, x: column(1), y: index * rowStep });
  });
  transitive.forEach((pkg, index) => {
    const id = `${pkg.name}@${pkg.version}`;
    positions.set(id, { id, x: column(2), y: index * rowStep });
  });

  return positions;
}
