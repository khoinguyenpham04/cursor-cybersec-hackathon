import type { FlueConversationMessage, FlueConversationPart } from "@flue/react";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export type OrchestrationStep = {
  id: string;
  label: string;
  kind: "tool" | "agent" | "phase";
  status: StepStatus;
  parentId?: string;
  toolPart?: Extract<FlueConversationPart, { type: "dynamic-tool" }>;
  detail?: string;
};

export type OrchestrationModel = {
  steps: OrchestrationStep[];
  streaming: boolean;
};

const PIPELINE_TOOLS = [
  "load_fixture_case",
  "read_case",
  "set_review_context",
  "investigate_case",
  "submit_campaign",
] as const;

type PipelineToolName = (typeof PIPELINE_TOOLS)[number];

const SPECIALISTS = [
  {
    id: "graph_analyst",
    label: "Graph analyst",
  },
  {
    id: "provenance_scout",
    label: "Provenance scout",
  },
  {
    id: "ci_auditor",
    label: "CI auditor",
  },
] as const;

const LABELS: Record<string, string> = {
  load_fixture_case: "Load case bundle",
  read_case: "Read case bundle",
  set_review_context: "Set review context",
  investigate_case: "Investigate case",
  submit_campaign: "Submit campaign",
};

type DynamicToolPart = Extract<FlueConversationPart, { type: "dynamic-tool" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPipelineTool(name: string): name is PipelineToolName {
  return (PIPELINE_TOOLS as readonly string[]).includes(name);
}

/** Soft failures returned as successful tool output with `{ error: string }`. */
export function softToolError(part: DynamicToolPart): string | undefined {
  if (part.state !== "output-available") return undefined;
  if (!("output" in part) || !isRecord(part.output)) return undefined;
  return typeof part.output.error === "string" ? part.output.error : undefined;
}

function toolStatus(part: DynamicToolPart): StepStatus {
  if (part.state === "output-error") return "failed";
  if (part.state === "output-available") {
    return softToolError(part) ? "failed" : "completed";
  }
  // Flue dynamic-tool: input-available means the call is in flight.
  return "running";
}

/** Chronological pipeline tool parts (keeps repeat calls like set_review_context). */
function collectPipelineParts(
  messages: FlueConversationMessage[],
): DynamicToolPart[] {
  const parts: DynamicToolPart[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool") continue;
      if (!isPipelineTool(part.toolName)) continue;
      parts.push(part);
    }
  }
  return parts;
}

function coverageFromInvestigate(
  part: DynamicToolPart | undefined,
): Record<string, boolean> | null {
  if (!part || toolStatus(part) !== "completed") return null;
  const output = "output" in part ? part.output : null;
  if (!isRecord(output)) return null;
  const coverage = isRecord(output.coverage) ? output.coverage : null;
  if (!coverage) return null;
  return {
    graph_analyst: Boolean(coverage.graph_analyst),
    provenance_scout: Boolean(coverage.provenance_scout),
    ci_auditor: Boolean(coverage.ci_auditor),
  };
}

function investigateDetail(part: DynamicToolPart | undefined): string | undefined {
  if (!part || !("output" in part) || !isRecord(part.output)) return undefined;
  const soft = softToolError(part);
  if (soft) return soft;
  const runId = part.output.runId;
  const score = part.output.campaignScore;
  const bits: string[] = [];
  if (typeof runId === "string") bits.push(`runId ${runId}`);
  if (typeof score === "number") bits.push(`draft score ${score}`);
  return bits.length ? bits.join(" · ") : undefined;
}

function contextDetail(part: DynamicToolPart): string | undefined {
  if (!("input" in part) || !isRecord(part.input)) return undefined;
  const runId = part.input.runId;
  const phase = part.input.phase;
  const bits: string[] = [];
  if (typeof runId === "string") bits.push(`runId ${runId}`);
  else bits.push("case only");
  if (typeof phase === "string") bits.push(phase);
  const soft = softToolError(part);
  if (soft) bits.push(soft);
  return bits.join(" · ");
}

/** Map Flue messages → orchestration steps. State advances only from tool evidence. */
export function extractOrchestration(
  messages: FlueConversationMessage[],
  options?: { working?: boolean },
): OrchestrationModel {
  const parts = collectPipelineParts(messages);
  const steps: OrchestrationStep[] = [];
  const working = Boolean(options?.working);
  const seen = new Set<PipelineToolName>();
  const nameCounts = new Map<string, number>();

  for (const part of parts) {
    const name = part.toolName as PipelineToolName;
    seen.add(name);
    const count = (nameCounts.get(name) ?? 0) + 1;
    nameCounts.set(name, count);
    // Unique ids when the same tool runs more than once (set_review_context ×2).
    const id = count === 1 ? name : `${name}#${count}`;

    steps.push({
      id,
      label:
        name === "set_review_context" && count > 1
          ? `${LABELS[name]} (${count})`
          : (LABELS[name] ?? name),
      kind: "tool",
      status: toolStatus(part),
      toolPart: part,
      detail:
        name === "investigate_case"
          ? investigateDetail(part)
          : name === "set_review_context"
            ? contextDetail(part)
            : softToolError(part),
    });

    if (name === "investigate_case") {
      const coverage = coverageFromInvestigate(part);
      if (coverage) {
        for (const specialist of SPECIALISTS) {
          steps.push({
            id: specialist.id,
            label: specialist.label,
            kind: "agent",
            parentId: id,
            status: coverage[specialist.id] ? "completed" : "failed",
            detail: coverage[specialist.id]
              ? "Coverage verified on ledger"
              : "Missing coverage",
          });
        }
      } else if (toolStatus(part) === "running") {
        steps.push({
          id: "fan_out",
          label: "Fan-out (inside investigate_case)",
          kind: "phase",
          parentId: id,
          status: "running",
          detail: "Specialists run in the control-plane harness",
        });
      }
    }
  }

  // Pending future stages only after we've seen at least one pipeline tool,
  // or while working with an empty tool list (starting shimmer state).
  if (seen.size > 0 || working) {
    for (const name of PIPELINE_TOOLS) {
      if (seen.has(name)) continue;
      // Don't show pending load/read/set if we've already passed them.
      if (
        (name === "load_fixture_case" ||
          name === "read_case" ||
          name === "set_review_context") &&
        (seen.has("investigate_case") || seen.has("submit_campaign"))
      ) {
        continue;
      }
      if (name === "investigate_case" && seen.has("submit_campaign")) {
        continue;
      }
      steps.push({
        id: `pending:${name}`,
        label: LABELS[name] ?? name,
        kind: "tool",
        status: "pending",
      });
    }
  }

  return {
    steps,
    streaming: working,
  };
}

export function statusLabel(status: StepStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}
