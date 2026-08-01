/** Client copy of agent/src/ledger/fixtures/demo-self-repo-8-11.json */

export const SELF_REPO_CASE_ID = "demo-self-repo-8-11";

const DEMO_REPO = "khoinguyenpham04/cursor-cybersec-hackathon";

export type SelfRepoTimelinePr = {
  prNumber: number;
  title: string;
  author: string;
  bodyPreview: string;
  filesTouched: string[];
};

export type SelfRepoCapabilityDelta = {
  id: string;
  prNumber: number;
  kind: string;
  subject: string;
  detail: string;
};

export const SELF_REPO_NOTES = [
  "Bound to the live demo substrate: GitHub PRs #8 → #9 → #10 → #11 on this repo (demo/payments-api story).",
  "Each PR alone looks Socket-green: no known CVE, no typosquat string match, no single-PR install script on a direct dep.",
  "Composition across the sequence introduces install-time execution + Actions write + first contact with billing secrets.",
] as const;

export const SELF_REPO_TIMELINE: SelfRepoTimelinePr[] = [
  {
    prNumber: 8,
    title: "chore(deps): add http-helper for shared retry utilities",
    author: "contrib-a",
    bodyPreview: "Small helper. No behavior change.",
    filesTouched: [
      "demo/payments-api/package.json",
      "demo/payments-api/package-lock.json",
      "demo/payments-api/src/lib/http.ts",
    ],
  },
  {
    prNumber: 9,
    title: "chore(deps): bump http-helper and transitive utils",
    author: "contrib-a",
    bodyPreview: "Routine bump for security hygiene.",
    filesTouched: ["demo/payments-api/package-lock.json"],
  },
  {
    prNumber: 10,
    title: "ci: speed up release workflow",
    author: "contrib-a",
    bodyPreview: "Unrelated CI cleanup.",
    filesTouched: ["demo/payments-api/.github/workflows/release.yml"],
  },
  {
    prNumber: 11,
    title: "feat(billing): wire http-helper into billing sync",
    author: "contrib-a",
    bodyPreview:
      "Product feature — uses http-helper on the billing/token path.",
    filesTouched: ["demo/payments-api/src/billing/sync.ts"],
  },
];

export const SELF_REPO_DELTAS: SelfRepoCapabilityDelta[] = [
  {
    id: "d1",
    prNumber: 8,
    kind: "dep_added",
    subject: "http-helper@1.0.0",
    detail: "Direct dependency added; no install scripts on this version.",
  },
  {
    id: "d2",
    prNumber: 9,
    kind: "dep_version_changed",
    subject: "http-helper@1.0.0→1.2.0",
    detail: "Version bump of direct dep; still no CVE.",
  },
  {
    id: "d3",
    prNumber: 9,
    kind: "dep_added",
    subject: "quiet-utils@0.4.1",
    detail: "New transitive dependency pulled in by http-helper@1.2.0.",
  },
  {
    id: "d4",
    prNumber: 9,
    kind: "install_script",
    subject: "quiet-utils@0.4.1",
    detail:
      "Transitive package declares a postinstall script (not visible if only scanning direct deps).",
  },
  {
    id: "d5",
    prNumber: 10,
    kind: "workflow_permissions",
    subject: "demo/payments-api/.github/workflows/release.yml",
    detail:
      "Workflow permissions expanded from contents:read to contents:write and id-token:write.",
  },
  {
    id: "d6",
    prNumber: 10,
    kind: "workflow_secrets",
    subject: "demo/payments-api/.github/workflows/release.yml",
    detail: "Workflow now passes BILLING_API_KEY into a step that shells out.",
  },
  {
    id: "d7",
    prNumber: 11,
    kind: "network_hook",
    subject: "demo/payments-api/src/billing/sync.ts",
    detail:
      "First application use of http-helper inside the billing sync path that handles customer tokens.",
  },
];

export function demoPrUrl(prNumber: number): string {
  return `https://github.com/${DEMO_REPO}/pull/${prNumber}`;
}

export function selfRepoDeltasForPr(prNumber: number): SelfRepoCapabilityDelta[] {
  return SELF_REPO_DELTAS.filter((delta) => delta.prNumber === prNumber);
}
