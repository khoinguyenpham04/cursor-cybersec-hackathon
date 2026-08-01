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
  load_fixture_case: "Load fixture case",
  read_case: "Read case bundle",
  set_review_context: "Set review context",
  investigate_case: "Investigate case",
  submit_campaign: "Submit campaign",
};

type DynamicToolPart = Extract<FlueConversationPart, { type: "dynamic-tool" }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toolStatus(part: DynamicToolPart): StepStatus {
  if (part.state === "output-error") return "failed";
  if (part.state === "output-available") return "completed";
  // Flue dynamic-tool: input-available means the call is in flight.
  return "running";
}

function collectTools(
  messages: FlueConversationMessage[],
): Map<string, DynamicToolPart> {
  const latest = new Map<string, DynamicToolPart>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool") continue;
      latest.set(part.toolName, part);
    }
  }
  return latest;
}

function coverageFromInvestigate(
  part: DynamicToolPart | undefined,
): Record<string, boolean> | null {
  if (!part || part.state !== "output-available") return null;
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
  const runId = part.output.runId;
  const score = part.output.campaignScore;
  const bits: string[] = [];
  if (typeof runId === "string") bits.push(`runId ${runId}`);
  if (typeof score === "number") bits.push(`draft score ${score}`);
  return bits.length ? bits.join(" · ") : undefined;
}

/** Map Flue messages → orchestration steps. State advances only from tool evidence. */
export function extractOrchestration(
  messages: FlueConversationMessage[],
  options?: { working?: boolean },
): OrchestrationModel {
  const tools = collectTools(messages);
  const steps: OrchestrationStep[] = [];
  const working = Boolean(options?.working);

  let sawAnyPipeline = false;
  for (const name of PIPELINE_TOOLS) {
    const part = tools.get(name);
    if (!part) continue;
    sawAnyPipeline = true;
    steps.push({
      id: name,
      label: LABELS[name] ?? name,
      kind: "tool",
      status: toolStatus(part),
      toolPart: part,
      detail: name === "investigate_case" ? investigateDetail(part) : undefined,
    });

    if (name === "investigate_case") {
      const coverage = coverageFromInvestigate(part);
      if (coverage) {
        for (const specialist of SPECIALISTS) {
          steps.push({
            id: specialist.id,
            label: specialist.label,
            kind: "agent",
            parentId: "investigate_case",
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
          parentId: "investigate_case",
          status: "running",
          detail: "Specialists run in the control-plane harness",
        });
      }
    }
  }

  // Pending future stages only after we've seen at least one pipeline tool,
  // or while working with an empty tool list (starting shimmer state).
  if (sawAnyPipeline || working) {
    for (const name of PIPELINE_TOOLS) {
      if (tools.has(name)) continue;
      // Don't show pending load/read/set if we've already passed them.
      if (
        (name === "load_fixture_case" ||
          name === "read_case" ||
          name === "set_review_context") &&
        (tools.has("investigate_case") || tools.has("submit_campaign"))
      ) {
        continue;
      }
      if (
        name === "investigate_case" &&
        tools.has("submit_campaign")
      ) {
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

  // Prefer latest chronological order: evidenced tools already in pipeline
  // order; pending appended. Keep specialist children after investigate.
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
