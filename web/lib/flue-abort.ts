/** Abort in-flight Flue work via POST …/abort (same-origin relative URL). */
export async function abortConversation(
  conversationUrl: string,
): Promise<{ aborted: boolean }> {
  const url = `${conversationUrl.replace(/\/$/, "")}/abort`;
  const response = await fetch(url, { method: "POST" });
  const body = (await response.json().catch(() => ({}))) as {
    aborted?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? `Abort failed (${response.status})`);
  }
  return { aborted: Boolean(body.aborted) };
}
