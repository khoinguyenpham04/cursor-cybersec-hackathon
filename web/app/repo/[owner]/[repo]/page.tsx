import { RepoWorkspace } from "@/components/repo/repo-workspace";
import { AppShell } from "@/components/review/app-shell";
import { Suspense } from "react";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Loading workspace…
          </div>
        }
      >
        <RepoWorkspace owner={owner} repo={repo} />
      </Suspense>
    </AppShell>
  );
}
