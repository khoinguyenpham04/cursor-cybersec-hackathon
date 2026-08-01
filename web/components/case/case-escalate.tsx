"use client";

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import type { RecommendedAction } from "@/lib/campaign";
import {
  getDecision,
  pickPrimaryAction,
  saveDecision,
  type EscalateDecision,
} from "@/lib/escalate";
import { useEffect, useMemo, useState } from "react";

export function CaseEscalate({
  caseId,
  actions,
}: {
  caseId: string;
  actions: RecommendedAction[];
}) {
  const primary = useMemo(() => pickPrimaryAction(actions), [actions]);
  const [decision, setDecision] = useState<EscalateDecision | null>(null);

  useEffect(() => {
    if (!primary) {
      setDecision(null);
      return;
    }
    setDecision(getDecision(caseId, primary) ?? null);
  }, [caseId, primary]);

  if (!primary) return null;

  const approval =
    decision == null
      ? { id: `${caseId}:${primary.action}:${primary.target}` }
      : {
          id: `${caseId}:${primary.action}:${primary.target}`,
          approved: decision.approved,
        };

  const state =
    decision == null
      ? ("approval-requested" as const)
      : ("output-available" as const);

  function decide(approved: boolean) {
    const saved = saveDecision(caseId, primary!, approved);
    setDecision(
      saved.decisions.find(
        (entry) =>
          entry.action === primary!.action && entry.target === primary!.target,
      ) ?? null,
    );
  }

  return (
    <Confirmation approval={approval} state={state}>
      <ConfirmationRequest>
        <ConfirmationTitle>
          Escalate <strong>{primary.action}</strong> on{" "}
          <strong>{primary.target}</strong>? Demo-safe — not sent to GitHub.
        </ConfirmationTitle>
        <p className="text-muted-foreground text-xs text-pretty">
          {primary.rationale}
        </p>
        <ConfirmationActions>
          <ConfirmationAction onClick={() => decide(false)} variant="outline">
            Dismiss
          </ConfirmationAction>
          <ConfirmationAction onClick={() => decide(true)} variant="default">
            Escalate
          </ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
      <ConfirmationAccepted>
        <ConfirmationTitle>
          Escalated in demo — {primary.action} on {primary.target} (not sent to
          GitHub).
        </ConfirmationTitle>
      </ConfirmationAccepted>
      <ConfirmationRejected>
        <ConfirmationTitle>
          Escalation dismissed for {primary.action} on {primary.target}.
        </ConfirmationTitle>
      </ConfirmationRejected>
    </Confirmation>
  );
}
