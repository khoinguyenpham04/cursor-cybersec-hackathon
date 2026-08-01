import { SiteHeader } from "@/components/site-header";
import { AppShell } from "@/components/review/app-shell";
import { NewReviewForm } from "@/components/review/new-review-form";

export default function HomePage() {
  return (
    <AppShell>
      <SiteHeader title="New review" />
      <NewReviewForm />
    </AppShell>
  );
}
