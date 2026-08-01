// Offline-first disk cache for built dependency graphs. Building one costs a
// handful of GitHub requests plus an OSV batch, so a cached graph is served
// however old it is; it is only rebuilt when the user explicitly asks
// (?refresh=1). Surviving a dev-server restart matters for demos.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DepGraphResponse } from "./dep-graph";

const CACHE_DIR = ".cache/deps";

function cacheFile(key: string): string {
  return path.join(CACHE_DIR, `${key.replace(/[^\w.-]/g, "_")}.json`);
}

export async function readDepCache(key: string): Promise<DepGraphResponse | null> {
  try {
    return JSON.parse(await readFile(cacheFile(key), "utf8")) as DepGraphResponse;
  } catch {
    return null;
  }
}

export async function writeDepCache(
  key: string,
  data: DepGraphResponse,
): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile(key), JSON.stringify(data));
  } catch {
    // A read-only filesystem shouldn't break the response.
  }
}
