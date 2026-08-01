import { touch } from "quiet-utils";

/** Minimal retry wrapper — PR2 pulls quiet-utils transitively. */
export async function withRetry(fn, { retries = 2 } = {}) {
  touch("http-helper");
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
