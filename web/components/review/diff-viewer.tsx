"use client";

import { FindingCard } from "@/components/review/review-report";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { parsePatch } from "@/lib/diff";
import type { PrFile } from "@/lib/github";
import {
  findingKey,
  type ReviewFinding,
  SEVERITY_META,
  SEVERITY_ORDER,
} from "@/lib/review";
import { cn } from "@/lib/utils";
import {
  FileIcon,
  FileMinusIcon,
  FilePlusIcon,
  FilePenIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** A jump request from a finding card in the Review tab. */
export interface FindingAnchor {
  finding: ReviewFinding;
  /** Bumped on every jump so repeat clicks re-trigger the scroll. */
  nonce: number;
}

const statusIcon: Record<string, typeof FileIcon> = {
  added: FilePlusIcon,
  removed: FileMinusIcon,
  modified: FilePenIcon,
  renamed: FilePenIcon,
};

const SEVERITY_RANGE_TINT: Record<ReviewFinding["severity"], string> = {
  critical: "bg-red-500/[0.06]",
  high: "bg-orange-500/[0.06]",
  medium: "bg-amber-500/[0.06]",
  low: "bg-sky-500/[0.06]",
};

interface AnchoredFinding {
  finding: ReviewFinding;
  key: string;
}

/** Findings attached to rows of one file's parsed patch. */
function useFileAnchors(file: PrFile, findings: AnchoredFinding[]) {
  return useMemo(() => {
    const lines = file.patch ? parsePatch(file.patch) : [];
    // Findings anchor to the row whose new (RIGHT) or old (LEFT) line number
    // equals the finding's end line; range rows get a severity tint.
    const cardsByRow = new Map<number, AnchoredFinding[]>();
    const tintByRow = new Map<number, ReviewFinding["severity"]>();
    const unmatched: AnchoredFinding[] = [];

    for (const anchored of findings) {
      const { finding } = anchored;
      const start = finding.startLine ?? finding.line;
      let endRow = -1;
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (line.kind === "hunk") continue;
        const number = finding.side === "LEFT" ? line.oldNo : line.newNo;
        if (number === null) continue;
        if (number >= start && number <= finding.line) {
          const existing = tintByRow.get(index);
          if (
            !existing ||
            SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[existing]
          ) {
            tintByRow.set(index, finding.severity);
          }
          if (number === finding.line) endRow = index;
        }
      }
      if (endRow === -1) {
        unmatched.push(anchored);
      } else {
        cardsByRow.set(endRow, [...(cardsByRow.get(endRow) ?? []), anchored]);
      }
    }
    return { lines, cardsByRow, tintByRow, unmatched };
  }, [file.patch, findings]);
}

function FileDiff({
  file,
  findings,
  anchor,
}: {
  file: PrFile;
  findings: AnchoredFinding[];
  anchor: FindingAnchor | null;
}) {
  const { lines, cardsByRow, tintByRow, unmatched } = useFileAnchors(
    file,
    findings,
  );
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  // The key of the finding a jump targets (if it lives in this file). Matched
  // by value: the transcript and the workspace parse the review independently,
  // so the jumped finding is a different object than this file's entries.
  const anchoredKey =
    anchor && anchor.finding.path === file.path
      ? (findings.find(
          (entry) =>
            entry.finding.line === anchor.finding.line &&
            entry.finding.title === anchor.finding.title,
        )?.key ?? null)
      : null;

  useEffect(() => {
    if (!anchoredKey) return;
    setOpenKeys((previous) => new Set(previous).add(anchoredKey));
    // Wait for the tab panel + card row to lay out, then jump. Instant
    // scrolling: a smooth scroll gets cancelled by the re-renders that
    // follow the tab switch.
    const timer = setTimeout(() => {
      rowRefs.current
        .get(anchoredKey)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
    }, 120);
    return () => clearTimeout(timer);
  }, [anchoredKey, anchor?.nonce]);

  function toggle(key: string) {
    setOpenKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (!file.patch) {
    return (
      <p className="px-4 py-6 text-muted-foreground text-sm">
        No text diff available for this file (binary or too large).
      </p>
    );
  }

  return (
    <>
      <table className="w-full border-collapse font-mono text-xs leading-relaxed">
        <tbody>
          {lines.map((line, index) => {
            if (line.kind === "hunk") {
              return (
                <tr className="bg-muted/60 text-muted-foreground" key={index}>
                  <td className="w-5 select-none border-r" />
                  <td className="w-10 select-none border-r px-2" />
                  <td className="w-10 select-none border-r px-2" />
                  <td className="whitespace-pre px-3 py-1">{line.text}</td>
                </tr>
              );
            }
            const cards = cardsByRow.get(index);
            const tint = tintByRow.get(index);
            const isAnchorRow =
              anchoredKey !== null &&
              cards?.some((entry) => entry.key === anchoredKey);
            return (
              <FragmentRow
                anchoredKey={anchoredKey}
                cards={cards}
                isAnchorRow={Boolean(isAnchorRow)}
                key={index}
                line={line}
                onToggle={toggle}
                openKeys={openKeys}
                rowRefs={rowRefs}
                tint={tint}
              />
            );
          })}
        </tbody>
      </table>
      {unmatched.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t px-4 py-3">
          <p className="text-muted-foreground text-xs">
            Findings outside the visible diff context:
          </p>
          {unmatched.map((entry) => (
            <FindingCard finding={entry.finding} key={entry.key} />
          ))}
        </div>
      )}
    </>
  );
}

function FragmentRow({
  line,
  cards,
  tint,
  openKeys,
  onToggle,
  rowRefs,
  anchoredKey,
  isAnchorRow,
}: {
  line: Extract<ReturnType<typeof parsePatch>[number], { kind: "add" | "del" | "ctx" }>;
  cards: AnchoredFinding[] | undefined;
  tint: ReviewFinding["severity"] | undefined;
  openKeys: Set<string>;
  onToggle: (key: string) => void;
  rowRefs: React.RefObject<Map<string, HTMLTableRowElement>>;
  anchoredKey: string | null;
  isAnchorRow: boolean;
}) {
  const marker = cards?.[0];
  return (
    <>
      <tr
        className={cn(
          line.kind === "add" && "bg-emerald-500/10",
          line.kind === "del" && "bg-red-500/10",
          tint && line.kind === "ctx" && SEVERITY_RANGE_TINT[tint],
          isAnchorRow && "outline-2 -outline-offset-2 outline-primary/60",
        )}
        ref={(element) => {
          if (!element || !cards) return;
          for (const entry of cards) rowRefs.current.set(entry.key, element);
        }}
      >
        <td className="w-5 select-none border-r text-center align-middle">
          {marker && (
            <button
              aria-label={`Toggle finding: ${marker.finding.title}`}
              className="inline-flex size-4 items-center justify-center"
              onClick={() => {
                for (const entry of cards ?? []) onToggle(entry.key);
              }}
              title={marker.finding.title}
              type="button"
            >
              <span
                className={cn(
                  "size-2 rounded-full transition-transform hover:scale-125",
                  SEVERITY_META[marker.finding.severity].dotClass,
                )}
              />
            </button>
          )}
        </td>
        <td className="w-10 select-none border-r px-2 text-right text-muted-foreground">
          {line.oldNo ?? ""}
        </td>
        <td className="w-10 select-none border-r px-2 text-right text-muted-foreground">
          {line.newNo ?? ""}
        </td>
        <td className="whitespace-pre-wrap break-all px-3">
          <span
            className={cn(
              "select-none pr-2",
              line.kind === "add" && "text-emerald-600",
              line.kind === "del" && "text-red-600",
            )}
          >
            {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
          </span>
          {line.text}
        </td>
      </tr>
      {cards?.map(
        (entry) =>
          openKeys.has(entry.key) && (
            <tr key={`card-${entry.key}`}>
              <td className="border-y bg-muted/30 px-4 py-2.5" colSpan={4}>
                <div
                  className={cn(
                    "max-w-2xl whitespace-normal font-sans",
                    entry.key === anchoredKey &&
                      "fade-in slide-in-from-top-1 animate-in duration-300",
                  )}
                >
                  <FindingCard finding={entry.finding} />
                </div>
              </td>
            </tr>
          ),
      )}
    </>
  );
}

export function DiffViewer({
  files,
  loading,
  error,
  findings = [],
  anchor = null,
}: {
  files: PrFile[] | null;
  loading: boolean;
  error: string | null;
  findings?: ReviewFinding[];
  anchor?: FindingAnchor | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const anchoredByPath = useMemo(() => {
    const map = new Map<string, AnchoredFinding[]>();
    findings.forEach((finding, index) => {
      const entry = { finding, key: findingKey(finding, index) };
      map.set(finding.path, [...(map.get(finding.path) ?? []), entry]);
    });
    return map;
  }, [findings]);

  // A jump selects the finding's file.
  useEffect(() => {
    if (anchor) setSelected(anchor.finding.path);
  }, [anchor]);

  const activePath = selected ?? files?.[0]?.path ?? null;
  const activeFile = files?.find((file) => file.path === activePath) ?? null;

  if (loading) {
    return (
      <div className="flex flex-1 gap-4 p-6">
        <div className="w-72 space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton className="h-8 w-full" key={i} />
          ))}
        </div>
        <Skeleton className="h-full flex-1" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="max-w-md text-center text-destructive text-sm">{error}</p>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">No changed files.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <ScrollArea className="w-72 shrink-0 border-r">
        <nav className="flex flex-col p-2">
          {files.map((file) => {
            const Icon = statusIcon[file.status] ?? FileIcon;
            const fileFindings = anchoredByPath.get(file.path) ?? [];
            const worst = fileFindings.reduce<ReviewFinding | null>(
              (top, entry) =>
                !top ||
                SEVERITY_ORDER[entry.finding.severity] <
                  SEVERITY_ORDER[top.severity]
                  ? entry.finding
                  : top,
              null,
            );
            return (
              <button
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent",
                  file.path === activePath && "bg-accent",
                )}
                key={file.path}
                onClick={() => setSelected(file.path)}
                type="button"
              >
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    file.status === "added" && "text-emerald-600",
                    file.status === "removed" && "text-red-600",
                    file.status === "modified" && "text-amber-600",
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-mono" title={file.path}>
                  {file.path}
                </span>
                {worst && (
                  <span
                    className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
                    title={`${fileFindings.length} finding(s), worst: ${worst.severity}`}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        SEVERITY_META[worst.severity].dotClass,
                      )}
                    />
                    {fileFindings.length}
                  </span>
                )}
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  <span className="text-emerald-600">+{file.additions}</span>{" "}
                  <span className="text-red-600">-{file.deletions}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </ScrollArea>
      <ScrollArea className="min-w-0 flex-1">
        {activeFile && (
          <div>
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
              <span className="truncate font-mono text-xs">{activeFile.path}</span>
              <Badge className="text-[10px]" variant="secondary">
                {activeFile.status}
              </Badge>
              {(anchoredByPath.get(activeFile.path)?.length ?? 0) > 0 && (
                <Badge className="text-[10px]" variant="outline">
                  {anchoredByPath.get(activeFile.path)?.length} finding(s)
                </Badge>
              )}
            </div>
            <FileDiff
              anchor={anchor}
              file={activeFile}
              findings={anchoredByPath.get(activeFile.path) ?? []}
            />
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
