import { CaseWorkspace } from "@/components/repo/case-workspace";
import { AppShell } from "@/components/review/app-shell";

export default async function RepoCasePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; caseId: string }>;
}) {
  const { owner, repo, caseId } = await params;
  return (
    <AppShell>
      <CaseWorkspace caseId={caseId} owner={owner} repo={repo} />
    </AppShell>
  );
}
