import type { RecommendedAction } from "@/lib/campaign";

export type EscalateDecision = {
  action: string;
  target: string;
  approved: boolean;
  decidedAt: number;
};

export type EscalateRecord = {
  caseId: string;
  decisions: EscalateDecision[];
  updatedAt: number;
};

const STORAGE_KEY = "campaign-escalations";

function readAll(): Record<string, EscalateRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, EscalateRecord>;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeAll(records: Record<string, EscalateRecord>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function actionKey(action: { action: string; target: string }): string {
  return `${action.action}::${action.target}`;
}

export function getEscalateRecord(caseId: string): EscalateRecord | undefined {
  return readAll()[caseId];
}

export function getDecision(
  caseId: string,
  action: Pick<RecommendedAction, "action" | "target">,
): EscalateDecision | undefined {
  const record = getEscalateRecord(caseId);
  const key = actionKey(action);
  return record?.decisions.find(
    (decision) => actionKey(decision) === key,
  );
}

export function saveDecision(
  caseId: string,
  action: RecommendedAction,
  approved: boolean,
): EscalateRecord {
  const all = readAll();
  const existing = all[caseId] ?? {
    caseId,
    decisions: [],
    updatedAt: Date.now(),
  };
  const key = actionKey(action);
  const nextDecision: EscalateDecision = {
    action: action.action,
    target: action.target,
    approved,
    decidedAt: Date.now(),
  };
  const decisions = [
    nextDecision,
    ...existing.decisions.filter((decision) => actionKey(decision) !== key),
  ];
  const record: EscalateRecord = {
    caseId,
    decisions,
    updatedAt: Date.now(),
  };
  all[caseId] = record;
  writeAll(all);
  return record;
}

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const ACTION_RANK: Record<string, number> = {
  block_merge: 0,
  quarantine: 1,
  revert_sequence: 2,
  require_dual_review: 3,
  pin: 4,
};

/** Prefer block/quarantine and higher severity for the primary escalate prompt. */
export function pickPrimaryAction(
  actions: RecommendedAction[],
): RecommendedAction | undefined {
  if (!actions.length) return undefined;
  return [...actions].sort((a, b) => {
    const actionDelta =
      (ACTION_RANK[a.action] ?? 9) - (ACTION_RANK[b.action] ?? 9);
    if (actionDelta !== 0) return actionDelta;
    return SEVERITY_RANK[a.priority] - SEVERITY_RANK[b.priority];
  })[0];
}
