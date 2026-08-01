import { NewRepoForm } from "@/components/repo/new-repo-form";
import { AppShell } from "@/components/review/app-shell";
import { SiteHeader } from "@/components/site-header";
import { PRODUCT_NAME } from "@/lib/brand";

export default function HomePage() {
  return (
    <AppShell>
      <SiteHeader title={PRODUCT_NAME} />
      <NewRepoForm />
    </AppShell>
  );
}
