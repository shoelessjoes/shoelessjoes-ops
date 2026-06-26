import { computeWeightedAverageUnitCost } from "./inventory-cost.js";
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

export async function fetchInventoryItemCost(
  session: ShopifySession,
  inventoryItemId: string,
): Promise<number | null> {
  const data = await shopifyGet<{ inventory_item?: { cost?: string | number | null } }>(
    session,
    `/inventory_items/${inventoryItemId}.json`,
  );
  const raw = data.inventory_item?.cost;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function fetchInventoryAvailableAtLocation(
  session: ShopifySession,
  inventoryItemId: string,
  locationId: string,
): Promise<number> {
  const q = new URLSearchParams({
    inventory_item_ids: inventoryItemId,
    location_ids: locationId,
  });
  const data = await shopifyGet<{
    inventory_levels?: Array<{ available?: number | null }>;
  }>(session, `/inventory_levels.json?${q.toString()}`);
  const level = data.inventory_levels?.[0];
  const available = level?.available;
  return typeof available === "number" && available > 0 ? available : 0;
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

export type ReceiveVariantInventoryResult = {
  inventoryItemId: string;
  onHandBefore: number;
  previousCost: number | null;
  receiveCost: number | null;
  blendedCost: number | null;
};

export async function receiveVariantInventory(
  session: ShopifySession,
  opts: { variantId: string; locationId: string; qty: number; unitCost?: number | null },
): Promise<ReceiveVariantInventoryResult> {
  const inventoryItemId = await fetchVariantInventoryItemId(session, opts.variantId);
  if (!inventoryItemId) {
    throw new Error(`No inventory item for variant ${opts.variantId}`);
  }

  const onHandBefore = await fetchInventoryAvailableAtLocation(
    session,
    inventoryItemId,
    opts.locationId,
  );
  const previousCost = await fetchInventoryItemCost(session, inventoryItemId);
  const receiveCost =
    opts.unitCost != null && opts.unitCost > 0 ? opts.unitCost : null;

  let blendedCost: number | null = null;
  if (receiveCost != null) {
    blendedCost = computeWeightedAverageUnitCost({
      onHand: onHandBefore,
      currentCost: previousCost,
      receiveQty: opts.qty,
      receiveCost,
    });
    await updateInventoryItemCost(session, inventoryItemId, blendedCost);
  }

  if (opts.qty !== 0) {
    await adjustInventoryAtLocation(session, {
      inventoryItemId,
      locationId: opts.locationId,
      delta: opts.qty,
    });
  }

  return {
    inventoryItemId,
    onHandBefore,
    previousCost,
    receiveCost,
    blendedCost,
  };
}
