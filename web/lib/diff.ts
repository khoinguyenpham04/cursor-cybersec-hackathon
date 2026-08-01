export type DiffLine =
  | { kind: "hunk"; text: string }
  | {
      kind: "add" | "del" | "ctx";
      oldNo: number | null;
      newNo: number | null;
      text: string;
    };

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Parses a unified diff patch (GitHub's `patch` field) into renderable rows
// with old/new line numbers.
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const raw of patch.split("\n")) {
    const hunk = raw.match(HUNK_HEADER);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      lines.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ kind: "add", oldNo: null, newNo: newNo++, text: raw.slice(1) });
    } else if (raw.startsWith("-")) {
      lines.push({ kind: "del", oldNo: oldNo++, newNo: null, text: raw.slice(1) });
    } else if (raw.startsWith("\\")) {
      lines.push({ kind: "ctx", oldNo: null, newNo: null, text: raw });
    } else {
      lines.push({ kind: "ctx", oldNo: oldNo++, newNo: newNo++, text: raw.slice(1) });
    }
  }
  return lines;
}
