export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

// Accepts "https://github.com/owner/repo/pull/123", "owner/repo#123",
// or "owner/repo/pull/123". Mirrors the parser in agent/src/lib/github.ts.
export function parsePrRef(input: string): PrRef | null {
  const trimmed = input.trim();
  const patterns = [
    /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/,
    /^([\w.-]+)\/([\w.-]+)#(\d+)$/,
    /^([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2], number: Number(match[3]) };
    }
  }
  return null;
}

export function formatPrRef(ref: PrRef): string {
  return `${ref.owner}/${ref.repo}#${ref.number}`;
}

// Finds a PR reference anywhere inside free text (used to recover the PR for
// a conversation whose local session record is missing).
export function findPrRef(text: string): PrRef | null {
  const url = text.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/);
  if (url) return parsePrRef(url[0]);
  const short = text.match(/[\w.-]+\/[\w.-]+#\d+/);
  if (short) return parsePrRef(short[0]);
  return null;
}
