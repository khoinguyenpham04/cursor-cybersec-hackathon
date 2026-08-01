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
}) {
  const building = depsState === "running";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 lg:p-8">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <LayoutDashboardIcon className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-lg">Overview</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Status for this repository. Open Map, Dependencies, or Reviews for
            the full views.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
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
                <Badge className="border border-red-500/30 bg-red-500/15 text-[10px] text-red-600 dark:text-red-400">
                  {deps.totals.vulnerable} vulnerable
                </Badge>
              ) : null
            }
          />
          <StatusCard
            detail={
              caseCount > 0
                ? `${caseCount} review${caseCount === 1 ? "" : "s"}`
                : "No cases yet"
            }
            icon={<GitPullRequestIcon className="size-4" />}
            label="Cases"
            ready={caseCount > 0}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {scanning ? (
            <Button
              className="gap-1.5"
              disabled={stopping}
              onClick={onStopScan}
              variant="outline"
            >
              <SquareIcon className="size-4" />
              {stopping ? "Stopping…" : "Stop scan"}
            </Button>
          ) : (
            <Button
              className="gap-1.5"
              disabled={!scanReady}
              onClick={onScan}
              variant={scan ? "outline" : "default"}
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
            className="gap-1.5"
            disabled={building || !depsChecked}
            onClick={onBuildDeps}
            variant={deps ? "outline" : "default"}
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
          <Button className="gap-1.5" onClick={onNewCase} variant="outline">
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
}: {
  label: string;
  detail: string;
  icon: ReactNode;
  ready: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="font-medium text-foreground text-sm">{label}</span>
        {trailing}
      </div>
      <p
        className={cn(
          "text-sm",
          ready ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {detail}
      </p>
    </div>
  );
}
