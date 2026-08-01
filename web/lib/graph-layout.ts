// Deterministic left-to-right layered layout. React Flow ships no layout
// engine and dagre/elk would be a new dependency for what is ~150 lines here:
// columns come from BFS depth, nodes sharing a `group` are pulled into one
// contiguous labeled stack, and over-tall columns wrap into side-by-side
// stacks so a map stays roughly viewport-shaped.

import type { ScanEdge, ScanNode } from "./scan";

export const NODE_WIDTH = 232;
// Must match the card's fixed height (h-14) in scan-node-card.tsx / the dep
// node card: the layout positions rows by this number, so any drift shows up
// as group frames that do not line up with the cards inside them.
export const NODE_HEIGHT = 56;
// Gaps are a readability trade-off: too tight and the edge fan becomes a
// hairball, too wide and fitView zooms out until the labels are unreadable.
const COLUMN_GAP = 140;
const ROW_GAP = 28;
const GROUP_PADDING_TOP = 26;
const GROUP_GAP = 34;
// Target column height before a column wraps into a second stack. Roughly a
// laptop viewport, so a tall tier grows sideways instead of off-screen.
const MAX_COLUMN_HEIGHT = 620;

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
 * Column per node = shortest path from a root, where roots are entries, crons,
 * and anything with no incoming edge. Cycles are broken by the visited set, so
 * a mutually-referencing pair still lands somewhere sensible.
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
  const seeds = roots.length > 0 ? roots : nodes.slice(0, 1);

  // Shortest-path (plain BFS, first visit wins) rather than longest-path
  // layering. Longest-path maximises depth: on a real codebase graph it
  // stretched 33 nodes across 35 columns — a 13,000px ribbon. Distance from
  // the nearest entry point keeps the map as shallow as the graph allows.
  const queue: Array<{ id: string; column: number }> = seeds.map((node) => ({
    id: node.id,
    column: 0,
  }));
  for (const seed of seeds) columns.set(seed.id, 0);

  while (queue.length > 0) {
    const { id, column } = queue.shift()!;
    for (const next of outgoing.get(id) ?? []) {
      if (columns.has(next)) continue; // already reached at an equal/shorter depth
      columns.set(next, column + 1);
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
  type Block = { group?: string; members: ScanNode[]; height: number };
  const columnPlans = new Map<number, Array<{ blocks: Block[]; height: number }>>();
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

    // A wide column is better than an endlessly tall one: split the blocks
    // into side-by-side stacks once they exceed the target height. Groups are
    // never split — a stack is the unit that has to stay together.
    const stacks: Array<{ blocks: typeof plan; height: number }> = [];
    let current: typeof plan = [];
    let currentHeight = 0;
    for (const block of plan) {
      const added = current.length === 0 ? block.height : block.height + GROUP_GAP;
      if (current.length > 0 && currentHeight + added > MAX_COLUMN_HEIGHT) {
        stacks.push({ blocks: current, height: currentHeight });
        current = [block];
        currentHeight = block.height;
      } else {
        current.push(block);
        currentHeight += added;
      }
    }
    if (current.length > 0) stacks.push({ blocks: current, height: currentHeight });

    columnPlans.set(column, stacks);
    columnHeights.set(column, Math.max(0, ...stacks.map((stack) => stack.height)));
  }

  // Second pass: place each column's stacks side by side, centred vertically
  // against the tallest column.
  const tallest = Math.max(...columnHeights.values());
  let x = 0;
  for (const column of columnKeys) {
    const stacks = columnPlans.get(column)!;
    for (const stack of stacks) {
      let y = (tallest - stack.height) / 2;
      for (const block of stack.blocks) {
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
      x += NODE_WIDTH + SUB_COLUMN_GAP;
    }
    // Trade the last sub-column gap for the wider gap between depths.
    x += COLUMN_GAP - SUB_COLUMN_GAP;
  }

  return {
    positions,
    groups,
    width: Math.max(0, x - COLUMN_GAP),
    height: tallest,
  };
}

// ---------------------------------------------------------------------------
// Tiered layout: each tier is one logical depth (roots -> clusters -> packages)
// laid out as a wrapped grid. Wrapping is what keeps a 60-package tier on one
// screen instead of running off the bottom as a single column.
// ---------------------------------------------------------------------------

const SUB_COLUMN_GAP = 48;

export function layoutTiers(
  tiers: string[][],
  options: { maxRows?: number } = {},
): { positions: Map<string, Positioned>; width: number; height: number } {
  const maxRows = options.maxRows ?? 9;
  const rowStep = NODE_HEIGHT + ROW_GAP;
  const subColumnStep = NODE_WIDTH + SUB_COLUMN_GAP;

  const plans = tiers
    .filter((tier) => tier.length > 0)
    .map((tier) => {
      const subColumns = Math.max(1, Math.ceil(tier.length / maxRows));
      const rows = Math.max(1, Math.ceil(tier.length / subColumns));
      return {
        tier,
        rows,
        width: subColumns * subColumnStep - SUB_COLUMN_GAP,
        height: rows * NODE_HEIGHT + (rows - 1) * ROW_GAP,
      };
    });

  const tallest = Math.max(0, ...plans.map((plan) => plan.height));
  const positions = new Map<string, Positioned>();
  let x = 0;
  for (const plan of plans) {
    // Centre each tier against the tallest so the graph reads horizontally.
    const yOffset = (tallest - plan.height) / 2;
    plan.tier.forEach((id, index) => {
      const column = Math.floor(index / plan.rows);
      const row = index % plan.rows;
      positions.set(id, {
        id,
        x: x + column * subColumnStep,
        y: yOffset + row * rowStep,
      });
    });
    x += plan.width + COLUMN_GAP;
  }

  return { positions, width: Math.max(0, x - COLUMN_GAP), height: tallest };
}
