import { AppShell } from "@/components/review/app-shell";
import { ReviewRedirect } from "@/components/review/review-redirect";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ReviewRedirect id={id} />
    </AppShell>
  );
}
