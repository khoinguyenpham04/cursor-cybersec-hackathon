import { CaseWorkspace } from "@/components/repo/case-workspace";
import { AppShell } from "@/components/review/app-shell";
import { Suspense } from "react";

export default async function RepoCasePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; caseId: string }>;
}) {
  const { owner, repo, caseId } = await params;
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Loading case…
          </div>
        }
      >
        <CaseWorkspace caseId={caseId} owner={owner} repo={repo} />
      </Suspense>
    </AppShell>
  );
}
