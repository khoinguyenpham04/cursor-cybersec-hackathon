import { readDepCache, writeDepCache } from "@/lib/dep-cache";
import { buildDepGraph } from "@/lib/dep-graph";
import { parseRepoRef } from "@/lib/github";

// Offline-first: a cached graph is served however old it is. Rebuilding costs
// GitHub requests plus an OSV batch, so it happens only when the caller asks
// for it with ?refresh=1 — never on a timer.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const repo = params.get("repo");
  const lockfile = params.get("lockfile") ?? undefined;
  const refresh = params.get("refresh") === "1";
  const cachedOnly = params.get("cachedOnly") === "1";
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

  const key = `${ref.owner}--${ref.repo}--${lockfile ?? "all"}`;
  if (!refresh) {
    const cached = await readDepCache(key);
    if (cached) return Response.json({ ...cached, cached: true });
    // The UI asks cachedOnly first so opening a tab never silently kicks off
    // a big job — it renders a "not built yet" state with a Run button.
    if (cachedOnly) {
      return Response.json({ error: "not-built" }, { status: 404 });
    }
  }

  try {
    const data = await buildDepGraph(ref, { lockfile });
    await writeDepCache(key, data);
    return Response.json({ ...data, cached: false });
  } catch (error) {
    const message = (error as Error).message;
    // "no lockfile" is a property of the repo, not a server failure.
    const status = /No supported lockfile/.test(message) ? 404 : 502;
    return Response.json({ error: message }, { status });
  }
}
