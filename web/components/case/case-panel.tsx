import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

/** Shared width/padding for case Overview · Orchestration · Report panels. */
export function CasePanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:px-6",
        className,
      )}
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
