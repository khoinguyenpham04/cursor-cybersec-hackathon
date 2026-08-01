/**
 * Billing sync path — boiling-frog PR4.
 * First application use of http-helper on a path that handles customer tokens.
 */
import { fetchWithRetry } from "../lib/http.ts";

export type BillingCustomer = {
  id: string;
  token: string;
};

export async function syncBillingCustomer(
  customer: BillingCustomer,
  endpoint = "https://billing.example.invalid/v1/sync",
): Promise<void> {
  // Demo: customer token rides alongside the helper that now has transitive postinstall ancestry.
  const response = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${customer.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ customerId: customer.id }),
  });

  if (!response.ok) {
    throw new Error(`billing sync failed: ${response.status}`);
  }
}
