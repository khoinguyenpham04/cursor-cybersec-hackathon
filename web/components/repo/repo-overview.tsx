"use client";

import { type DepGraphData } from "@/components/repo/dep-graph-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ScanResult } from "@/lib/scan";
import { cn } from "@/lib/utils";
import {
  GitPullRequestIcon,
  LayoutDashboardIcon,
  MapIcon,
  PackageIcon,
  PlayIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  SquareIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export function RepoOverview({
  scan,
  scanning,
  scanReady,
  stopping,
  deps,
  depsState,
  depsChecked,
  caseCount,
  onScan,
  onStopScan,
  onBuildDeps,
  onNewCase,
  onInvestigateSequence,
}: {
  scan: ScanResult | null;
  scanning: boolean;
  scanReady: boolean;
  stopping: boolean;
  deps: DepGraphData | null;
  depsState: "idle" | "running" | "error";
  depsChecked: boolean;
  caseCount: number;
  onScan: () => void;
  onStopScan: () => void;
  onBuildDeps: () => void;
  onNewCase: () => void;
  onInvestigateSequence: () => void;
}) {
  const building = depsState === "running";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <LayoutDashboardIcon className="size-4 shrink-0 text-muted-foreground" />
            <h2 className="font-semibold text-lg">Overview</h2>
          </div>
          <p className="text-muted-foreground text-sm text-pretty">
            Detect campaign-shaped supply-chain risk across a PR sequence — or
            open Map, Dependencies, and Cases for the supporting views.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3">
          <StatusCard
            detail={
              scan
                ? `${scan.nodes.length} nodes · ${scan.edges.length} edges`
                : "Not scanned yet"
            }
            icon={<MapIcon className="size-4" />}
            label="Scan"
            ready={Boolean(scan)}
          />
          <StatusCard
            detail={
              deps
                ? `${deps.totals.packages} packages · ${deps.totals.direct} direct`
                : depsChecked
                  ? "No graph yet"
                  : "Checking cache…"
            }
            icon={<PackageIcon className="size-4" />}
            label="Dependencies"
            ready={Boolean(deps)}
            trailing={
              deps && deps.totals.vulnerable > 0 ? (
                <Badge
                  aria-label={`${deps.totals.vulnerable} vulnerable`}
                  className="max-w-full shrink border border-red-500/30 bg-red-500/15 text-[10px] text-red-600 dark:text-red-400"
                >
                  <span className="truncate">
                    {deps.totals.vulnerable} vulnerable
                  </span>
                </Badge>
              ) : null
            }
          />
          <StatusCard
            className="min-[480px]:col-span-2 md:col-span-1"
            detail={
              caseCount > 0
                ? `${caseCount} case${caseCount === 1 ? "" : "s"}`
                : "No cases yet"
            }
            icon={<GitPullRequestIcon className="size-4" />}
            label="Cases"
            ready={caseCount > 0}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            className="w-full gap-1.5 sm:w-auto"
            onClick={onInvestigateSequence}
          >
            <ShieldAlertIcon className="size-4" />
            Investigate sequence
          </Button>
          {scanning ? (
            <Button
              className="w-full gap-1.5 sm:w-auto"
              disabled={stopping}
              onClick={onStopScan}
              variant="outline"
            >
              <SquareIcon className="size-4" />
              {stopping ? "Stopping…" : "Stop scan"}
            </Button>
          ) : (
            <Button
              className="w-full gap-1.5 sm:w-auto"
              disabled={!scanReady}
              onClick={onScan}
              variant="outline"
            >
              {scan ? (
                <RefreshCwIcon className="size-4" />
              ) : (
                <PlayIcon className="size-4" />
              )}
              {scan ? "Rescan" : "Run scan"}
            </Button>
          )}
          <Button
            className="w-full gap-1.5 sm:w-auto"
            disabled={building || !depsChecked}
            onClick={onBuildDeps}
            variant="outline"
          >
            {deps ? (
              <RefreshCwIcon className={cn("size-4", building && "animate-spin")} />
            ) : building ? (
              <RefreshCwIcon className="size-4 animate-spin" />
            ) : (
              <PlayIcon className="size-4" />
            )}
            {building ? "Building…" : deps ? "Rebuild graph" : "Build graph"}
          </Button>
          <Button
            className="w-full gap-1.5 sm:w-auto"
            onClick={onNewCase}
            variant="outline"
          >
            <GitPullRequestIcon className="size-4" />
            New case
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  detail,
  icon,
  ready,
  trailing,
  className,
}: {
  label: string;
  detail: string;
  icon: ReactNode;
  ready: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 overflow-hidden rounded-lg border px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 truncate font-medium text-foreground text-sm">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "min-w-0 text-sm text-pretty break-words",
          ready ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {detail}
      </p>
      {trailing ? <div className="min-w-0">{trailing}</div> : null}
    </div>
  );
}
