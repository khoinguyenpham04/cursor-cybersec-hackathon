"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ReviewReport } from "@/components/review/review-report";
import {
  parseReview,
  type ReviewFinding,
  SUBMIT_REVIEW_TOOL,
} from "@/lib/review";
import type {
  AgentStatus,
  FlueConversationMessage,
  FlueConversationPart,
} from "@flue/react";
import { GitPullRequestIcon } from "lucide-react";
import { Fragment } from "react";

function TextPart({ part }: { part: Extract<FlueConversationPart, { type: "text" }> }) {
  return (
    <MessageResponse
      className="text-sm leading-relaxed [&>p]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:my-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:my-2 [&>ol]:list-decimal [&>ol]:pl-5 [&>pre]:my-2 [&>pre]:overflow-x-auto"
      isAnimating={part.state === "streaming"}
    >
      {part.text}
    </MessageResponse>
  );
}

function ReasoningPart({
  part,
}: {
  part: Extract<FlueConversationPart, { type: "reasoning" }>;
}) {
  return (
    <Reasoning defaultOpen={false} isStreaming={part.state === "streaming"}>
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  );
}

function ToolPart({
  part,
  onJumpToFinding,
}: {
  part: Extract<FlueConversationPart, { type: "dynamic-tool" }>;
  onJumpToFinding?: (finding: ReviewFinding) => void;
}) {
  // The structured review renders as a report, not a raw tool block.
  if (part.toolName === SUBMIT_REVIEW_TOOL) {
    const review = parseReview(part.input);
    if (review)
      return <ReviewReport onJumpToFinding={onJumpToFinding} review={review} />;
  }
  return (
    <Tool>
      <ToolHeader state={part.state} toolName={part.toolName} type="dynamic-tool" />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput
          errorText={part.state === "output-error" ? part.errorText : undefined}
          output={part.state === "output-available" ? part.output : undefined}
        />
      </ToolContent>
    </Tool>
  );
}

function Parts({
  message,
  onJumpToFinding,
}: {
  message: FlueConversationMessage;
  onJumpToFinding?: (finding: ReviewFinding) => void;
}) {
  return (
    <>
      {message.parts.map((part, index) => {
        const key = `${message.id}-${index}`;
        switch (part.type) {
          case "text":
            return <TextPart key={key} part={part} />;
          case "reasoning":
            return <ReasoningPart key={key} part={part} />;
          case "dynamic-tool":
            return (
              <ToolPart key={key} onJumpToFinding={onJumpToFinding} part={part} />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

export function Transcript({
  messages,
  status,
  onJumpToFinding,
  waitingLabel = "Reviewing the pull request...",
  contentClassName,
}: {
  messages: FlueConversationMessage[];
  status: AgentStatus;
  onJumpToFinding?: (finding: ReviewFinding) => void;
  waitingLabel?: string;
  /** Override the conversation column width/padding (case tabs share CasePanel width). */
  contentClassName?: string;
}) {
  const visible = messages.filter(
    (message) => message.display === "visible" && message.parts.length > 0,
  );
  const working = status === "submitted" || status === "streaming";
  const last = visible.at(-1);
  // Show the waiting shimmer until the assistant starts producing output.
  const waiting = working && (!last || last.role !== "assistant");

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent
        className={
          contentClassName ?? "mx-auto w-full max-w-3xl px-4 py-6 lg:px-6"
        }
      >
        {visible.length === 0 && !working && (
          <ConversationEmptyState
            description="The review will appear here once the agent starts."
            icon={<GitPullRequestIcon className="size-8" />}
            title="Waiting for the review"
          />
        )}
        {visible.map((message) => (
          <Fragment key={message.id}>
            {message.role === "user" ? (
              <Message from="user">
                <MessageContent>
                  {message.parts
                    .filter((part) => part.type === "text")
                    .map((part, index) => (
                      <MessageResponse
                        className="text-sm leading-relaxed [&>p]:my-0"
                        key={index}
                      >
                        {part.text}
                      </MessageResponse>
                    ))}
                </MessageContent>
              </Message>
            ) : (
              <Message from="assistant">
                <MessageContent className="w-full gap-3">
                  <Parts message={message} onJumpToFinding={onJumpToFinding} />
                  {message.settlement && (
                    <p className="text-destructive text-sm">
                      This turn {message.settlement.outcome}. Send a message to retry.
                    </p>
                  )}
                </MessageContent>
              </Message>
            )}
          </Fragment>
        ))}
        {waiting && (
          <div className="py-2 text-sm">
            <Shimmer duration={1.5}>{waitingLabel}</Shimmer>
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
