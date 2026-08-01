export const CASE_TABS = [
  "overview",
  "orchestration",
  "report",
  "transcript",
] as const;

export type CaseTab = (typeof CASE_TABS)[number];

export function isCaseTab(value: string | null | undefined): value is CaseTab {
  return (
    value === "overview" ||
    value === "orchestration" ||
    value === "report" ||
    value === "transcript"
  );
}

/** Prefer Orchestration while work is in flight; Report when settled with a result. */
export function defaultCaseTab(options: {
  working: boolean;
  hasResult: boolean;
  hasError?: boolean;
}): CaseTab {
  if (options.working) return "orchestration";
  if (options.hasResult) return "report";
  return "orchestration";
}
