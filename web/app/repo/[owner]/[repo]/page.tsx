import { AppShell } from "@/components/review/app-shell";
import { RepoWorkspace } from "@/components/repo/repo-workspace";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return (
    <AppShell>
      <RepoWorkspace owner={owner} repo={repo} />
    </AppShell>
  );
}
