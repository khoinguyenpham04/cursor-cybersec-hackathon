"use client";

import { ReviewWorkspace } from "@/components/review/review-workspace";
import { getSession, resolveSessionRepo } from "@/lib/sessions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Compat shim: send repo-scoped sessions to the nested case route. */
export function ReviewRedirect({ id }: { id: string }) {
  const router = useRouter();
  const [orphan, setOrphan] = useState(false);

  useEffect(() => {
    const session = getSession(id);
    const resolved = session ? resolveSessionRepo(session) : null;
    if (resolved) {
      router.replace(
        `/repo/${resolved.owner}/${resolved.repo}/case/${id}`,
      );
      return;
    }
    setOrphan(true);
  }, [id, router]);

  if (!orphan) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground text-sm">
        Opening case…
      </div>
    );
  }

  return <ReviewWorkspace sessionId={id} />;
}
