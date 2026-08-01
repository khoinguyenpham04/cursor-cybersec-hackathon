import { AppShell } from "@/components/review/app-shell";
import { ReviewWorkspace } from "@/components/review/review-workspace";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ReviewWorkspace sessionId={id} />
    </AppShell>
  );
}
