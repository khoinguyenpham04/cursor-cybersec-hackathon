"use client";

import { Badge } from "@/components/ui/badge";
import {
  BOILING_FROG_NOTES,
  BOILING_FROG_TIMELINE,
  deltasForPr,
  demoPrUrl,
} from "@/lib/fixtures/boiling-frog";
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
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div
        className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        role="note"
      >
        <p className="font-medium text-amber-950 dark:text-amber-100">
          Fixture caveat — campaign facts are not mined from {owner}/{repo}
        </p>
        <p className="mt-1 text-pretty text-amber-950/80 dark:text-amber-100/80">
          Investigate sequence loads ledger case{" "}
          <code className="text-xs">{ledgerCaseId}</code> (
          <code className="text-xs">fixture-boiling-frog</code>). The story
          matches demo PRs #8–#11 under{" "}
          <code className="text-xs">demo/payments-api/</code>, but live GitHub
          ingest of those PRs is not wired yet.
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold text-lg">Boiling-frog sequence</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
          {BOILING_FROG_NOTES.map((note) => (
            <li className="text-pretty" key={note}>
              {note}
            </li>
          ))}
        </ul>
      </div>

      <ol className="flex flex-col gap-4">
        {BOILING_FROG_TIMELINE.map((pr, index) => {
          const deltas = deltasForPr(pr.prNumber);
          return (
            <li
              className="rounded-lg border px-4 py-3"
              key={pr.prNumber}
            >
              <div className="flex flex-wrap items-start gap-2">
                <Badge variant="outline">Step {index + 1}</Badge>
                <Badge variant="secondary">fixture #{pr.prNumber}</Badge>
                {pr.demoPrs.map((demoPr) => (
                  <a
                    className="inline-flex items-center gap-1 text-xs text-foreground underline-offset-4 hover:underline"
                    href={demoPrUrl(demoPr)}
                    key={demoPr}
                    rel="noreferrer"
                    target="_blank"
                  >
                    demo #{demoPr}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                ))}
              </div>
              <p className="mt-2 font-medium text-sm text-pretty">{pr.title}</p>
              <p className="mt-1 text-muted-foreground text-xs text-pretty">
                {pr.bodyPreview} · alone looks green
              </p>
              {deltas.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {deltas.map((delta) => (
                    <li
                      className="rounded-md bg-muted/50 px-3 py-2 text-xs"
                      key={delta.id}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className="text-[10px]" variant="outline">
                          {delta.kind}
                        </Badge>
                        <span className="font-medium">{delta.subject}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground text-pretty">
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
    </div>
  );
}
