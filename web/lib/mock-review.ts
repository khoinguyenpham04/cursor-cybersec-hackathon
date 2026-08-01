"use client";

// Zero-cost demo driver: replays a scripted review session through the exact
// same interface as `useFlueAgent`, so every transcript/report/diff component
// renders demo and live sessions identically. Nothing here touches the
// network or the Flue server — iterate on the UI without spending tokens.
//
// A session is a demo when its id starts with "demo-" (see isMockSessionId);
// the workspace then keeps the real hook dormant and drives this one instead.

import type { PrFile, PrMeta } from "@/lib/github";
import type { ReviewResult } from "@/lib/review";
import type {
  AgentStatus,
  FlueConversationMessage,
  UseFlueAgentResult,
} from "@flue/react";
import { useCallback, useEffect, useRef, useState } from "react";

export const MOCK_PR_REF = "acme/webhook-relay#87";

export function isMockSessionId(id: string): boolean {
  return id.startsWith("demo-");
}

export function newMockSessionId(): string {
  return `demo-${crypto.randomUUID().slice(0, 13)}`;
}

// ---------------------------------------------------------------------------
// Demo PR: metadata + diff (line numbers below are what the findings anchor to)
// ---------------------------------------------------------------------------

export const MOCK_PR_META: PrMeta = {
  title: "feat(relay): retry webhook deliveries with exponential backoff",
  body: "Failed deliveries are currently dropped on the first error. This adds `deliverWithRetry` with exponential backoff and wires it into the delivery queue.",
  author: "demo-author",
  state: "open",
  draft: false,
  merged: false,
  baseBranch: "main",
  headBranch: "retry-backoff",
  additions: 53,
  deletions: 5,
  changedFiles: 3,
  url: "https://github.com/acme/webhook-relay/pull/87",
};

export const MOCK_PR_FILES: PrFile[] = [
  {
    path: "src/retry.ts",
    status: "added",
    additions: 40,
    deletions: 0,
    patch: `@@ -0,0 +1,40 @@
+import { createHmac } from "node:crypto";
+
+export interface RetryOptions {
+  maxRetries: number;
+  baseDelayMs: number;
+}
+
+const DEFAULT_OPTIONS: RetryOptions = {
+  maxRetries: 5,
+  baseDelayMs: 250,
+};
+
+export async function deliverWithRetry(
+  url: string,
+  payload: unknown,
+  options: RetryOptions = DEFAULT_OPTIONS,
+): Promise<Response> {
+  let lastError: unknown;
+  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
+    try {
+      const response = await fetch(url, {
+        method: "POST",
+        headers: { "content-type": "application/json" },
+        body: JSON.stringify(payload),
+      });
+      if (response.ok) return response;
+      lastError = new Error(\`delivery failed: \${response.status}\`);
+    } catch (error) {
+      lastError = error;
+    }
+    const delay = options.baseDelayMs * 2 ** attempt;
+    await new Promise((resolve) => setTimeout(resolve, delay));
+  }
+  throw lastError;
+}
+
+export function signPayload(payload: string, secret: string): string {
+  console.log(\`signing payload with secret \${secret}\`);
+  return createHmac("sha256", secret).update(payload).digest("hex");
+}`,
  },
  {
    path: "src/queue.ts",
    status: "modified",
    additions: 10,
    deletions: 4,
    patch: `@@ -1,4 +1,4 @@
-import { deliver } from "./deliver";
+import { deliverWithRetry } from "./retry";
 import type { WebhookEvent } from "./types";

 const MAX_PENDING = 1000;
@@ -15,6 +15,12 @@ export class DeliveryQueue {
   async flush(): Promise<void> {
-    for (const event of this.pending) {
-      await deliver(event);
-    }
+    const events = this.pending;
+    this.pending = [];
+    for (const event of events) {
+      try {
+        await deliverWithRetry(event.url, event.payload);
+      } catch {
+        // retries exhausted; move on
+      }
+    }
   }
 }`,
  },
  {
    path: "README.md",
    status: "modified",
    additions: 3,
    deletions: 1,
    patch: `@@ -6,3 +6,5 @@
 ## Delivery

-Events are delivered once; failures are dropped.
+Events are delivered with exponential-backoff retry (5 attempts by default).
+Failed deliveries are retried before being dropped; payloads are signed with
+the relay secret.`,
  },
];

// ---------------------------------------------------------------------------
// The structured review the demo agent "finds"
// ---------------------------------------------------------------------------

export const MOCK_REVIEW: ReviewResult = {
  verdict: "request_changes",
  summary:
    "Reviewed all 3 changed files against the adversarial checklist. The retry mechanism itself is sound, but it ships a **plaintext secret in the logs** and the queue integration **silently drops events** once retries are exhausted — the second of which defeats the PR's own stated goal of not losing deliveries.",
  findings: [
    {
      title: "Webhook signing secret is logged in plaintext",
      path: "src/retry.ts",
      line: 38,
      side: "RIGHT",
      category: "Security",
      severity: "critical",
      body: "`signPayload` logs the raw signing secret on every call. Anyone with log access can forge webhook signatures for every tenant.",
      trigger:
        "Any delivery: each `signPayload` call writes `signing payload with secret <secret>` to stdout, which ships to the log aggregator.",
      fix: "Delete the log line, or log a fingerprint only:\n```ts\nconsole.log(`signing payload with key ${secret.slice(0, 4)}…`);\n```",
    },
    {
      title: "flush() swallows failures and loses events",
      path: "src/queue.ts",
      line: 22,
      startLine: 21,
      side: "RIGHT",
      category: "Error Handling",
      severity: "high",
      body: "The bare `catch {}` drops the event after retries are exhausted, with no log, metric, or dead-letter path. The PR description says failures should no longer be dropped — this still drops them, just more slowly.",
      trigger:
        "A receiver is down for longer than the ~8s retry window during a flush: every pending event for it is silently discarded.",
      fix: "Re-queue or dead-letter the event and record the failure:\n```ts\n} catch (error) {\n  this.deadLetter.push({ event, error });\n}\n```",
    },
    {
      title: "Retry loop makes maxRetries + 1 attempts",
      path: "src/retry.ts",
      line: 19,
      side: "RIGHT",
      category: "Logic Errors",
      severity: "medium",
      body: "`attempt <= options.maxRetries` with a 0-based counter yields 6 total attempts for `maxRetries: 5`, and sleeps once more after the final failure before throwing.",
      trigger:
        "Receiver returns 500 consistently: 6 requests are sent (not 5) and the caller waits an extra 8s backoff after the last one.",
      fix: "Use `attempt < options.maxRetries`, and skip the sleep on the final iteration.",
    },
    {
      title: "fetch has no timeout",
      path: "src/retry.ts",
      line: 25,
      startLine: 21,
      side: "RIGHT",
      category: "Resource Management",
      severity: "low",
      body: "Each attempt can hang indefinitely on a receiver that accepts the connection but never responds, stalling the whole queue flush.",
      trigger:
        "A receiver blackholes the request: `flush()` never completes and pending events for healthy receivers are never delivered.",
      fix: "Pass `signal: AbortSignal.timeout(10_000)` to `fetch` and treat the abort as a failed attempt.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Scripted streaming engine
// ---------------------------------------------------------------------------

function userMessage(id: string, text: string): FlueConversationMessage {
  return {
    id,
    role: "user",
    purpose: "user",
    display: "visible",
    parts: [{ type: "text", text, state: "done" }],
  };
}

function assistantShell(id: string): FlueConversationMessage {
  return {
    id,
    role: "assistant",
    purpose: "assistant",
    display: "visible",
    parts: [],
  };
}

const REASONING_1 = [
  "Fetching the PR to see what changed. ",
  "Three files: a new retry module, the queue wiring, and a README update. ",
  "I'll read the full diff, then work the adversarial checklist over every hunk.",
];

const REASONING_2 = [
  "Enumerating candidates per changed hunk: the retry loop bounds, ",
  "the fetch call's failure modes, the new catch block in flush(), ",
  "and what signPayload does with the secret. ",
  "Verifying each against the code before reporting.",
];

export function useMockReviewAgent(enabled: boolean): UseFlueAgentResult {
  const [messages, setMessages] = useState<FlueConversationMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const startedRef = useRef(false);
  const cancelledRef = useRef(false);
  const counterRef = useRef(0);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!enabled) return;
      const nextId = () => `mock-${++counterRef.current}`;
      setMessages((prev) => [...prev, userMessage(nextId(), text)]);

      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const gone = () => cancelledRef.current;

      // Follow-ups after the scripted review get a canned demo answer.
      if (startedRef.current) {
        setStatus("submitted");
        await sleep(500);
        if (gone()) return;
        const replyId = nextId();
        setMessages((prev) => [
          ...prev,
          {
            ...assistantShell(replyId),
            parts: [
              {
                type: "text",
                text: "This is a scripted demo session, so I can't investigate further — but in a live run I'd answer from the already-fetched PR context. Start a real review to try it.",
                state: "done",
              },
            ],
          },
        ]);
        setStatus("idle");
        return;
      }
      startedRef.current = true;

      const assistantId = nextId();
      let parts: FlueConversationMessage["parts"] = [];
      const commit = () => {
        const snapshot = [...parts];
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, parts: snapshot }
              : message,
          ),
        );
      };

      setStatus("submitted");
      await sleep(600);
      if (gone()) return;
      setStatus("streaming");
      setMessages((prev) => [...prev, assistantShell(assistantId)]);

      // Reasoning 1 (streams in chunks)
      parts = [...parts, { type: "reasoning", text: "", state: "streaming" }];
      for (const chunk of REASONING_1) {
        await sleep(450);
        if (gone()) return;
        const last = parts.at(-1) as { type: "reasoning"; text: string };
        parts = [
          ...parts.slice(0, -1),
          { type: "reasoning", text: last.text + chunk, state: "streaming" },
        ];
        commit();
      }
      parts = [
        ...parts.slice(0, -1),
        { ...(parts.at(-1) as object), state: "done" },
      ] as typeof parts;
      commit();

      // Tool calls: fetch_pr, fetch_pr_diff, activate_skill
      const tools: Array<{ name: string; input: unknown; output: unknown }> = [
        {
          name: "fetch_pr",
          input: { pr: MOCK_PR_REF },
          output: {
            title: MOCK_PR_META.title,
            author: MOCK_PR_META.author,
            baseBranch: MOCK_PR_META.baseBranch,
            headBranch: MOCK_PR_META.headBranch,
            additions: MOCK_PR_META.additions,
            deletions: MOCK_PR_META.deletions,
            changedFiles: MOCK_PR_META.changedFiles,
          },
        },
        {
          name: "fetch_pr_diff",
          input: { pr: MOCK_PR_REF },
          output: {
            files: MOCK_PR_FILES.map((file) => ({
              path: file.path,
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
            })),
          },
        },
        {
          name: "activate_skill",
          input: { skill: "adversarial-reviewer" },
          output: { activated: true },
        },
      ];
      for (const tool of tools) {
        await sleep(500);
        if (gone()) return;
        const toolCallId = nextId();
        parts = [
          ...parts,
          {
            type: "dynamic-tool",
            toolName: tool.name,
            toolCallId,
            state: "input-available",
            input: tool.input,
          },
        ];
        commit();
        await sleep(700);
        if (gone()) return;
        parts = [
          ...parts.slice(0, -1),
          {
            type: "dynamic-tool",
            toolName: tool.name,
            toolCallId,
            state: "output-available",
            input: tool.input,
            output: tool.output,
          },
        ];
        commit();
      }

      // Reasoning 2
      parts = [...parts, { type: "reasoning", text: "", state: "streaming" }];
      for (const chunk of REASONING_2) {
        await sleep(450);
        if (gone()) return;
        const last = parts.at(-1) as { type: "reasoning"; text: string };
        parts = [
          ...parts.slice(0, -1),
          { type: "reasoning", text: last.text + chunk, state: "streaming" },
        ];
        commit();
      }
      parts = [
        ...parts.slice(0, -1),
        { ...(parts.at(-1) as object), state: "done" },
      ] as typeof parts;
      commit();

      // The structured review lands as a submit_review tool call.
      await sleep(800);
      if (gone()) return;
      const reviewCallId = nextId();
      parts = [
        ...parts,
        {
          type: "dynamic-tool",
          toolName: "submit_review",
          toolCallId: reviewCallId,
          state: "input-available",
          input: MOCK_REVIEW as unknown,
        },
      ];
      commit();
      await sleep(500);
      if (gone()) return;
      parts = [
        ...parts.slice(0, -1),
        {
          type: "dynamic-tool",
          toolName: "submit_review",
          toolCallId: reviewCallId,
          state: "output-available",
          input: MOCK_REVIEW as unknown,
          output: { recorded: true, verdict: MOCK_REVIEW.verdict, findings: 4 },
        },
      ];
      commit();

      await sleep(400);
      if (gone()) return;
      parts = [
        ...parts,
        {
          type: "text",
          text: "Review complete: 4 findings. The plaintext secret logging must be fixed before merge.",
          state: "done",
        },
      ];
      commit();
      setStatus("idle");
    },
    [enabled],
  );

  const refresh = useCallback(() => {}, []);

  return {
    messages,
    status,
    historyReady: enabled,
    error: undefined,
    failedSends: [],
    settlements: [],
    sendMessage,
    refresh,
  };
}
