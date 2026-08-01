import {
  type Ecosystem,
  fetchNpmProvenance,
  fetchVulnDetail,
} from "@/lib/deps";

// Per-package detail for the node click panel: npm provenance signals plus
// fully hydrated vulnerability records. Kept out of the graph route because
// one packument per package is too slow to fetch up front.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = params.get("name");
  const version = params.get("version");
  const ecosystem = (params.get("ecosystem") ?? "npm") as Ecosystem;
  const vulnIds = (params.get("vulns") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!name || !version) {
    return Response.json(
      { error: "Missing ?name= and ?version= parameters" },
      { status: 400 },
    );
  }

  const [provenance, vulns] = await Promise.all([
    ecosystem === "npm"
      ? fetchNpmProvenance(name, version).catch((error: Error) => ({
          error: error.message,
        }))
      : Promise.resolve(null),
    Promise.all(
      vulnIds.map((id) =>
        fetchVulnDetail(id).catch(() => ({
          id,
          summary: "",
          severity: null,
          aliases: [],
        })),
      ),
    ),
  ]);

  return Response.json({ name, version, ecosystem, provenance, vulns });
}
