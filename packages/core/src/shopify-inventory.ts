import type { ShopifySession } from "./shopify-session.js";

async function shopifyGet<T>(session: ShopifySession, path: string): Promise<T> {
  const url = `https://${session.shopDomain}/admin/api/${session.apiVersion}${path}`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": session.accessToken },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GET ${path} failed ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

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

async function shopifyPost<T>(session: ShopifySession, path: string, body: unknown): Promise<T> {
  const url = `https://${session.shopDomain}/admin/api/${session.apiVersion}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify POST ${path} failed ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchVariantInventoryItemId(
  session: ShopifySession,
  variantId: string,
): Promise<string | null> {
  const data = await shopifyGet<{ variant?: { inventory_item_id?: number } }>(
    session,
    `/variants/${variantId}.json`,
  );
  const id = data.variant?.inventory_item_id;
  return id != null ? String(id) : null;
}

export async function updateInventoryItemCost(
  session: ShopifySession,
  inventoryItemId: string,
  cost: number,
): Promise<void> {
  await shopifyPut(session, `/inventory_items/${inventoryItemId}.json`, {
    inventory_item: { id: Number(inventoryItemId), cost: cost.toFixed(2) },
  });
}

export async function adjustInventoryAtLocation(
  session: ShopifySession,
  opts: { inventoryItemId: string; locationId: string; delta: number },
): Promise<void> {
  await shopifyPost(session, "/inventory_levels/adjust.json", {
    location_id: Number(opts.locationId),
    inventory_item_id: Number(opts.inventoryItemId),
    available_adjustment: opts.delta,
  });
}

export async function receiveVariantInventory(
  session: ShopifySession,
  opts: { variantId: string; locationId: string; qty: number; unitCost?: number | null },
): Promise<{ inventoryItemId: string }> {
  const inventoryItemId = await fetchVariantInventoryItemId(session, opts.variantId);
  if (!inventoryItemId) {
    throw new Error(`No inventory item for variant ${opts.variantId}`);
  }
  if (opts.unitCost != null && opts.unitCost > 0) {
    await updateInventoryItemCost(session, inventoryItemId, opts.unitCost);
  }
  if (opts.qty !== 0) {
    await adjustInventoryAtLocation(session, {
      inventoryItemId,
      locationId: opts.locationId,
      delta: opts.qty,
    });
  }
  return { inventoryItemId };
}
