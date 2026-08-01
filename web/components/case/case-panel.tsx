import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

/** Horizontal padding shared by case chrome (toolbar/tabs/banner) and panels. */
export const CASE_PAD_X = "px-4 sm:px-6 lg:px-8";

/** Centered content column (no vertical padding). */
export const CASE_COLUMN = "mx-auto w-full max-w-5xl";

/** Shared column for case Overview · Orchestration · Report · Transcript. */
export const CASE_CONTENT_WIDTH = cn(CASE_COLUMN, CASE_PAD_X, "py-6");

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
