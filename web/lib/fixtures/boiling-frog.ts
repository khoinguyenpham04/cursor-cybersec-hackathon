/** Client copy of agent/src/ledger/fixtures/boiling-frog.json (+ demo PR labels). */

export const BOILING_FROG_CASE_ID = "fixture-boiling-frog";

const DEMO_REPO = "khoinguyenpham04/cursor-cybersec-hackathon";

export type FixtureTimelinePr = {
  prNumber: number;
  title: string;
  author: string;
  bodyPreview: string;
  filesTouched: string[];
  /** Live demo substrate PR(s) that tell the same story. */
  demoPrs: number[];
};

export type FixtureCapabilityDelta = {
  id: string;
  prNumber: number;
  kind: string;
  subject: string;
  detail: string;
};

export const BOILING_FROG_NOTES = [
  "Each PR alone looks Socket-green: no known CVE, no typosquat string match, no single-PR install script on a direct dep.",
  "Composition across the sequence introduces install-time execution + Actions write + first contact with billing secrets.",
] as const;

export const BOILING_FROG_TIMELINE: FixtureTimelinePr[] = [
  {
    prNumber: 412,
    title: "chore(deps): add http-helper for shared retry utilities",
    author: "contrib-a",
    bodyPreview: "Small helper. No behavior change.",
    filesTouched: ["package.json", "package-lock.json", "src/lib/http.ts"],
    demoPrs: [8],
  },
  {
    prNumber: 419,
    title: "chore(deps): bump http-helper and transitive utils",
    author: "contrib-a",
    bodyPreview: "Routine bump for security hygiene.",
    filesTouched: ["package-lock.json"],
    demoPrs: [9],
  },
  {
    prNumber: 430,
    title:
      "ci: speed up release workflow + wire http-helper into billing sync",
    author: "contrib-a",
    bodyPreview:
      "Unrelated CI cleanup; also uses http-helper in billing path.",
    filesTouched: [
      ".github/workflows/release.yml",
      "src/billing/sync.ts",
      "package-lock.json",
    ],
    // Live demo splits CI (#10) and billing wire (#11); fixture keeps one trigger PR.
    demoPrs: [10, 11],
  },
];

export const BOILING_FROG_DELTAS: FixtureCapabilityDelta[] = [
  {
    id: "d1",
    prNumber: 412,
    kind: "dep_added",
    subject: "http-helper@1.0.0",
    detail: "Direct dependency added; no install scripts on this version.",
  },
  {
    id: "d2",
    prNumber: 419,
    kind: "dep_version_changed",
    subject: "http-helper@1.0.0→1.2.0",
    detail: "Version bump of direct dep; still no CVE.",
  },
  {
    id: "d3",
    prNumber: 419,
    kind: "dep_added",
    subject: "quiet-utils@0.4.1",
    detail: "New transitive dependency pulled in by http-helper@1.2.0.",
  },
  {
    id: "d4",
    prNumber: 419,
    kind: "install_script",
    subject: "quiet-utils@0.4.1",
    detail:
      "Transitive package declares a postinstall script (not visible if only scanning direct deps).",
  },
  {
    id: "d5",
    prNumber: 430,
    kind: "workflow_permissions",
    subject: ".github/workflows/release.yml",
    detail:
      "Workflow permissions expanded from contents:read to contents:write and id-token:write.",
  },
  {
    id: "d6",
    prNumber: 430,
    kind: "workflow_secrets",
    subject: ".github/workflows/release.yml",
    detail:
      "Workflow now passes BILLING_API_KEY into a step that shells out.",
  },
  {
    id: "d7",
    prNumber: 430,
    kind: "network_hook",
    subject: "src/billing/sync.ts",
    detail:
      "First application use of http-helper inside the billing sync path that handles customer tokens.",
  },
];

export function demoPrUrl(prNumber: number): string {
  return `https://github.com/${DEMO_REPO}/pull/${prNumber}`;
}

export function deltasForPr(prNumber: number): FixtureCapabilityDelta[] {
  return BOILING_FROG_DELTAS.filter((delta) => delta.prNumber === prNumber);
}
