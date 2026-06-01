import type { ShopifySession } from "./shopify-session.js";

async function shopifyPut<T>(session: ShopifySession, path: string, body: unknown): Promise<T> {
  const url = `https://${session.shopDomain}/admin/api/${session.apiVersion}${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify PUT ${path} failed ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="?next"?/i);
    if (m) return m[1];
  }
  return null;
}

function hasOfferTag(tags: string, offerId: string): boolean {
  const needle = `offer-${offerId}`.toLowerCase();
  return tags
    .split(",")
    .some((t) => t.trim().toLowerCase() === needle);
}

export async function findDraftOrderIdByOfferTag(
  session: ShopifySession,
  offerId: string,
): Promise<string | null> {
  let url: string | null =
    `https://${session.shopDomain}/admin/api/${session.apiVersion}/draft_orders.json?limit=250&fields=id,tags`;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": session.accessToken },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify draft_orders list failed ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as { draft_orders?: Array<{ id?: number; tags?: string }> };
    for (const draft of data.draft_orders ?? []) {
      const id = draft.id ? String(draft.id) : "";
      if (id && hasOfferTag(String(draft.tags || ""), offerId)) return id;
    }
    url = parseLinkNext(res.headers.get("Link"));
  }
  return null;
}

export async function updateDraftOrderMetadata(
  session: ShopifySession,
  draftOrderId: string,
  note: string,
  tags: string,
): Promise<void> {
  await shopifyPut(session, `/draft_orders/${draftOrderId}.json`, {
    draft_order: { id: Number(draftOrderId), note, tags },
  });
}

export function buildPurchaseDraftTags(offerId: string, tracking: string | null): string {
  const parts = ["dealernet", "purchase", `offer-${offerId}`, "dealernet-awaiting-receipt"];
  if (tracking) {
    parts.push("dealernet-in-transit", "dealernet-has-tracking");
  }
  return parts.join(",");
}

export type { ShopifySession };
