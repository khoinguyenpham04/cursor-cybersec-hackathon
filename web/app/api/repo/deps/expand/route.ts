import {
  type Ecosystem,
  fetchDependencyGraph,
  hydrateVulns,
  pkgKey,
  queryVulnerabilities,
} from "@/lib/deps";
import { packageId } from "@/lib/dep-graph";

// Lazy transitive expansion: one package's resolved subgraph from deps.dev,
// vulnerability-checked, ready for the client to merge into the canvas.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const name = params.get("name");
  const version = params.get("version");
  const ecosystem = (params.get("ecosystem") ?? "npm") as Ecosystem;
  if (!name || !version) {
    return Response.json(
      { error: "Missing ?name= and ?version= parameters" },
      { status: 400 },
    );
  }

  try {
    const graph = await fetchDependencyGraph({ name, version, ecosystem });
    const packages = graph.nodes
      .filter((node) => node.relation !== "SELF")
      .map((node) => ({
        name: node.name,
        version: node.version,
        relation: node.relation,
      }));

    const vulnMap = await queryVulnerabilities(
      packages.map((pkg) => ({ ...pkg, ecosystem })),
    ).catch(() => new Map());
    await hydrateVulns(vulnMap, { limit: 10 }).catch(() => {});

    return Response.json({
      root: packageId({ name, version }),
      packages: packages.map((pkg) => ({
        ...pkg,
        vulns: vulnMap.get(pkgKey({ ...pkg, ecosystem })) ?? [],
      })),
      // deps.dev edges are index-based; map them to package ids.
      edges: graph.edges
        .map((edge) => ({
          from: graph.nodes[edge.from]
            ? packageId(graph.nodes[edge.from])
            : null,
          to: graph.nodes[edge.to] ? packageId(graph.nodes[edge.to]) : null,
          requirement: edge.requirement,
        }))
        .filter(
          (edge): edge is { from: string; to: string; requirement: string } =>
            edge.from !== null && edge.to !== null,
        ),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
