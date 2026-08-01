/**
 * Shared HTTP retry utilities for the payments API demo.
 * PR1: add http-helper — no behavior change to billing paths yet.
 */
import { withRetry } from "http-helper";

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return withRetry(() => fetch(input, init), { retries: 2 });
}
