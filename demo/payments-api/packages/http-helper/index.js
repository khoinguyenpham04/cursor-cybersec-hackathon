/** Minimal retry wrapper — intentionally boring for PR1. */
export async function withRetry(fn, { retries = 2 } = {}) {
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
