"use client";

import {
  Agent,
  AgentContent,
  AgentHeader,
} from "@/components/ai-elements/agent";
import {
  Plan,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { CasePanel } from "@/components/case/case-panel";
import { Badge } from "@/components/ui/badge";
import {
  extractOrchestration,
  statusLabel,
  type OrchestrationStep,
  type StepStatus,
} from "@/lib/orchestration";
import { cn } from "@/lib/utils";
import type { AgentStatus, FlueConversationMessage } from "@flue/react";
import { useMemo } from "react";

const STATUS_CLASS: Record<StepStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  completed:
    "border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "border border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400",
};

export function CaseOrchestration({
  messages,
  status,
}: {
  messages: FlueConversationMessage[];
  status: AgentStatus;
}) {
  const working = status === "submitted" || status === "streaming";
  const model = useMemo(
    () => extractOrchestration(messages, { working }),
    [messages, working],
  );

  const roots = model.steps.filter((step) => !step.parentId);
  const childrenOf = (id: string) =>
    model.steps.filter((step) => step.parentId === id);

  return (
    <CasePanel className="gap-4">
      <Plan defaultOpen isStreaming={model.streaming}>
        <PlanHeader>
          <div className="min-w-0 flex-1 space-y-1">
            <PlanTitle>
              {model.streaming
                ? "Control plane running"
                : "Control plane"}
            </PlanTitle>
            <PlanDescription>
              {model.steps.length === 0
                ? "Starting investigation — waiting for the first tool call."
                : "Steps mirror live Flue tools. Specialists appear from investigate_case coverage."}
            </PlanDescription>
          </div>
          <PlanTrigger />
        </PlanHeader>
        <PlanContent className="space-y-3">
          {model.steps.length === 0 && working && (
            <p className="text-sm">
              <Shimmer duration={1.5}>Starting control plane…</Shimmer>
            </p>
          )}
          {roots.map((step, index) => (
            <StepBlock
              children={childrenOf(step.id)}
              index={index}
              key={step.id}
              step={step}
            />
          ))}
        </PlanContent>
      </Plan>
    </CasePanel>
  );
}

function StepBlock({
  step,
  children,
  index,
}: {
  step: OrchestrationStep;
  children: OrchestrationStep[];
  index: number;
}) {
  const open = step.status === "running" || step.status === "failed";
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 fill-mode-both",
        step.status === "pending" && "opacity-70",
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Task defaultOpen={open || children.length > 0}>
        <TaskTrigger title={step.label}>
          <div className="flex w-full cursor-pointer items-center gap-2 text-sm">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                step.status === "running" && "animate-pulse bg-amber-500",
                step.status === "completed" && "bg-emerald-500",
                step.status === "failed" && "bg-red-500",
                step.status === "pending" && "bg-muted-foreground/40",
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {step.status === "running" ? (
                <Shimmer duration={1.5}>{step.label}</Shimmer>
              ) : (
                step.label
              )}
            </span>
            <Badge className={cn("text-[10px]", STATUS_CLASS[step.status])}>
              {statusLabel(step.status)}
            </Badge>
          </div>
        </TaskTrigger>
        <TaskContent className="space-y-3 pt-2">
          {step.detail && <TaskItem>{step.detail}</TaskItem>}
          {step.toolPart && (
            <Tool defaultOpen={step.status === "running" || step.status === "failed"}>
              <ToolHeader
                state={step.toolPart.state}
                toolName={step.toolPart.toolName}
                type="dynamic-tool"
              />
              <ToolContent>
                <ToolInput input={step.toolPart.input} />
                {step.toolPart.state === "output-available" && (
                  <ToolOutput
                    errorText={undefined}
                    output={step.toolPart.output}
                  />
                )}
                {step.toolPart.state === "output-error" && (
                  <ToolOutput
                    errorText={step.toolPart.errorText}
                    output={undefined}
                  />
                )}
              </ToolContent>
            </Tool>
          )}
          {children.map((child, childIndex) =>
            child.kind === "agent" ? (
              <Agent
                className="animate-in fade-in slide-in-from-bottom-1"
                key={child.id}
                style={{ animationDelay: `${(index + childIndex + 1) * 60}ms` }}
              >
                <AgentHeader name={child.label} />
                <AgentContent>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", STATUS_CLASS[child.status])}>
                      {statusLabel(child.status)}
                    </Badge>
                    {child.detail && (
                      <span className="text-muted-foreground text-xs">
                        {child.detail}
                      </span>
                    )}
                  </div>
                </AgentContent>
              </Agent>
            ) : (
              <TaskItem key={child.id}>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      child.status === "running" && "animate-pulse bg-amber-500",
                      child.status === "completed" && "bg-emerald-500",
                      child.status === "failed" && "bg-red-500",
                      child.status === "pending" && "bg-muted-foreground/40",
                    )}
                  />
                  {child.status === "running" ? (
                    <Shimmer duration={1.5}>{child.label}</Shimmer>
                  ) : (
                    child.label
                  )}
                  {child.detail ? ` — ${child.detail}` : null}
                </span>
              </TaskItem>
            ),
          )}
        </TaskContent>
      </Task>
    </div>
  );
}
