import { AppShell } from "@/components/review/app-shell";
import { ReviewRedirect } from "@/components/review/review-redirect";
import { Suspense } from "react";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Opening case…
          </div>
        }
      >
        <ReviewRedirect id={id} />
      </Suspense>
    </AppShell>
  );
}
