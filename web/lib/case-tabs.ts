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

/** Prefer Orchestration while work is in flight or no result yet; Report when ready. */
export function defaultCaseTab(options: {
  working: boolean;
  hasResult: boolean;
  hasError?: boolean;
}): CaseTab {
  if (options.hasResult) return "report";
  if (options.working || !options.hasResult) return "orchestration";
  return "overview";
}
