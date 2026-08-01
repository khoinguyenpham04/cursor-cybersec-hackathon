import { buildDepGraph, type DepGraphResponse } from "@/lib/dep-graph";
import { parseRepoRef } from "@/lib/github";

// Building a graph costs a handful of GitHub requests plus an OSV batch, so
// results are cached in module memory for a few minutes. Deterministic and
// keyless: no model tokens are spent here.
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; data: DepGraphResponse }>();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const repo = params.get("repo");
  const lockfile = params.get("lockfile") ?? undefined;
  if (!repo) {
    return Response.json({ error: "Missing ?repo= parameter" }, { status: 400 });
  }

  const ref = parseRepoRef(repo);
  if (!ref) {
    return Response.json(
      { error: `Could not parse repository reference: "${repo}"` },
      { status: 400 },
    );
  }

  const key = `${ref.owner}/${ref.repo}::${lockfile ?? "*"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return Response.json(hit.data);
  }

  try {
    const data = await buildDepGraph(ref, { lockfile });
    cache.set(key, { at: Date.now(), data });
    return Response.json(data);
  } catch (error) {
    const message = (error as Error).message;
    // "no lockfile" is a property of the repo, not a server failure.
    const status = /No supported lockfile/.test(message) ? 404 : 502;
    return Response.json({ error: message }, { status });
  }
}
