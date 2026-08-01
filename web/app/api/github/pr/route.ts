import { getPrFiles, getPrMeta } from "@/lib/github";
import { parsePrRef } from "@/lib/pr";

export async function GET(request: Request) {
  const pr = new URL(request.url).searchParams.get("pr");
  if (!pr) {
    return Response.json({ error: "Missing ?pr= parameter" }, { status: 400 });
  }

  const ref = parsePrRef(pr);
  if (!ref) {
    return Response.json(
      { error: `Could not parse PR reference: "${pr}"` },
      { status: 400 },
    );
  }

  try {
    const [meta, files] = await Promise.all([getPrMeta(ref), getPrFiles(ref)]);
    return Response.json({ ref, meta, files });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
