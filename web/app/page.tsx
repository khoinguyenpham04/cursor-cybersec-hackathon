import { NewRepoForm } from "@/components/repo/new-repo-form";
import { AppShell } from "@/components/review/app-shell";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <AppShell>
      <SiteHeader title="New scan" />
      <NewRepoForm />
    </AppShell>
  );
}
