"use client";

import { CasePanel } from "@/components/case/case-panel";
import { Badge } from "@/components/ui/badge";
import { SELF_REPO_LEDGER_CASE } from "@/lib/campaign-demo";
import {
  BOILING_FROG_NOTES,
  BOILING_FROG_TIMELINE,
  deltasForPr,
  demoPrUrl as boilingDemoPrUrl,
} from "@/lib/fixtures/boiling-frog";
import {
  SELF_REPO_NOTES,
  SELF_REPO_TIMELINE,
  demoPrUrl,
  selfRepoDeltasForPr,
} from "@/lib/fixtures/demo-self-repo";
import { ExternalLinkIcon } from "lucide-react";

export function CaseOverview({
  ledgerCaseId,
  owner,
  repo,
}: {
  ledgerCaseId: string;
  owner: string;
  repo: string;
}) {
  const isSelfRepoCase = ledgerCaseId === SELF_REPO_LEDGER_CASE;

  return (
    <CasePanel>
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        role="note"
      >
        <p className="font-medium text-amber-950 dark:text-amber-100">
          {isSelfRepoCase
            ? `Seeded case bundle — not mined from ${owner}/${repo} at runtime`
            : `Fixture caveat — campaign facts are not mined from ${owner}/${repo}`}
        </p>
        <p className="mt-1.5 text-pretty leading-relaxed text-amber-950/80 dark:text-amber-100/80">
          Investigate sequence loads ledger case{" "}
          <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-xs">
            {ledgerCaseId}
          </code>
          {isSelfRepoCase ? (
            <>
              {" "}
              with trail <strong>#8 → #9 → #10 → #11</strong> matching the live
              demo substrate under{" "}
              <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-xs">
                demo/payments-api/
              </code>
              . Facts are still a seeded Case Bundle (not GitHub PR mining).
            </>
          ) : (
            <>
              {" "}
              (
              <code className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-xs">
                fixture-boiling-frog
              </code>
              ). The story maps to demo PRs #8–#11, but this offline bundle uses
              synthetic PR numbers 412 → 419 → 430.
            </>
          )}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">
          {isSelfRepoCase ? "Demo PR sequence" : "Boiling-frog sequence"}
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground text-sm leading-relaxed">
          {(isSelfRepoCase ? SELF_REPO_NOTES : BOILING_FROG_NOTES).map(
            (note) => (
              <li className="text-pretty" key={note}>
                {note}
              </li>
            ),
          )}
        </ul>
      </section>

      {isSelfRepoCase ? (
        <ol className="flex flex-col gap-3">
          {SELF_REPO_TIMELINE.map((pr, index) => {
            const deltas = selfRepoDeltasForPr(pr.prNumber);
            return (
              <li className="rounded-lg border px-4 py-3" key={pr.prNumber}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Step {index + 1}</Badge>
                  <a
                    className="inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-xs text-foreground underline-offset-4 hover:bg-accent hover:underline"
                    href={demoPrUrl(pr.prNumber)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    demo #{pr.prNumber}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </div>
                <p className="mt-2.5 font-medium text-sm text-pretty leading-snug">
                  {pr.title}
                </p>
                <p className="mt-1 text-muted-foreground text-xs text-pretty leading-relaxed">
                  {pr.bodyPreview} · alone looks green
                </p>
                {deltas.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {deltas.map((delta) => (
                      <li
                        className="rounded-md bg-muted/50 px-3 py-2"
                        key={delta.id}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className="text-[10px]" variant="outline">
                            {delta.kind.replaceAll("_", " ")}
                          </Badge>
                          <span className="min-w-0 font-medium text-xs">
                            {delta.subject}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs text-pretty leading-relaxed">
                          {delta.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <ol className="flex flex-col gap-3">
          {BOILING_FROG_TIMELINE.map((pr, index) => {
            const deltas = deltasForPr(pr.prNumber);
            return (
              <li className="rounded-lg border px-4 py-3" key={pr.prNumber}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Step {index + 1}</Badge>
                  <Badge variant="secondary">fixture #{pr.prNumber}</Badge>
                  {pr.demoPrs.map((demoPr) => (
                    <a
                      className="inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-xs text-foreground underline-offset-4 hover:bg-accent hover:underline"
                      href={boilingDemoPrUrl(demoPr)}
                      key={demoPr}
                      rel="noreferrer"
                      target="_blank"
                    >
                      demo #{demoPr}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  ))}
                </div>
                <p className="mt-2.5 font-medium text-sm text-pretty leading-snug">
                  {pr.title}
                </p>
                <p className="mt-1 text-muted-foreground text-xs text-pretty leading-relaxed">
                  {pr.bodyPreview} · alone looks green
                </p>
                {deltas.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {deltas.map((delta) => (
                      <li
                        className="rounded-md bg-muted/50 px-3 py-2"
                        key={delta.id}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className="text-[10px]" variant="outline">
                            {delta.kind.replaceAll("_", " ")}
                          </Badge>
                          <span className="min-w-0 font-medium text-xs">
                            {delta.subject}
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs text-pretty leading-relaxed">
                          {delta.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </CasePanel>
  );
}
