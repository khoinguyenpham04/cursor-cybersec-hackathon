"use client";

import { ReviewWorkspace } from "@/components/review/review-workspace";
import { isMockSessionId } from "@/lib/mock-review";
import { casePath, getSession, resolveSessionRepo } from "@/lib/sessions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Compat shim: send repo-scoped sessions to the nested case route. */
export function ReviewRedirect({ id }: { id: string }) {
  const router = useRouter();
  // Demo reviews stay on /review — never redirect (casePath is a self-replace).
  const [orphan, setOrphan] = useState(() => isMockSessionId(id));

  useEffect(() => {
    if (isMockSessionId(id)) {
      setOrphan(true);
      return;
    }
    const session = getSession(id);
    if (session && resolveSessionRepo(session)) {
      const next = casePath(session);
      const here = `/review/${encodeURIComponent(id)}`;
      if (next !== here) {
        router.replace(next);
        return;
      }
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
