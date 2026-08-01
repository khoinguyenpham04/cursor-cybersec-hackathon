import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

/** Shared column for case Overview · Orchestration · Report · Transcript. */
export const CASE_CONTENT_WIDTH =
  "mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8";

/** Shared width/padding for case Overview · Orchestration · Report panels. */
export function CasePanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(CASE_CONTENT_WIDTH, "flex flex-col gap-6", className)}
      {...props}
    />
  );
}

/** Compact empty / pending / failed states inside a case tab. */
export function CasePanelState({
  title,
  description,
  tone = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <CasePanel className="gap-2">
      <p
        className={cn(
          "font-medium text-sm",
          tone === "danger" && "text-destructive",
        )}
      >
        {title}
      </p>
      {description ? (
        <div className="text-muted-foreground text-sm text-pretty">
          {description}
        </div>
      ) : null}
    </CasePanel>
  );
}
