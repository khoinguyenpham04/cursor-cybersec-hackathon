/** Abort in-flight Flue work via POST …/abort (same-origin relative URL). */
export async function abortConversation(
  conversationUrl: string,
): Promise<{ aborted: boolean }> {
  const url = `${conversationUrl.replace(/\/$/, "")}/abort`;
  const response = await fetch(url, { method: "POST" });
  const body = (await response.json().catch(() => ({}))) as {
    aborted?: boolean;
    error?: unknown;
  };
  if (!response.ok) {
    throw new Error(abortErrorMessage(body.error, response.status));
  }
  return { aborted: Boolean(body.aborted) };
}

function abortErrorMessage(error: unknown, status: number): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `Abort failed (${status})`;
}
