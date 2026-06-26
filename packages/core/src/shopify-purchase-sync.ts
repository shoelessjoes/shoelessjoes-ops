import { dealernetLineCanonicalKey } from "./inbound/dealernet.js";
import { normalizeUpc } from "./normalize.js";
import type { VariantIndexEntry } from "./mapping.js";
import { fetchVariantIndex } from "./shopify-sync.js";
import {
  fetchInventoryAvailableAtLocation,
  fetchVariantInventoryItemId,
  updateInventoryItemCost,
} from "./shopify-inventory.js";
import type { ShopifySession } from "./shopify-session.js";

export type PurchaseSyncLineInput = {
  offerId: string;
  offerFilter: string;
  title: string;
  upc: string | null;
  qty: number;
  unitPrice: number | null;
  perBoxUnitPrice: number | null;
  unitOfMeasure: string | null;
  caseQtyBoxes: number | null;
};

export type PurchaseSyncLineResult = {
  offerId: string;
  canonicalKey: string;
  idempotencyKey: string;
  status: "linked" | "dry_run" | "missing_product" | "uncertain_case_qty" | "failed";
  shopifyVariantId?: string;
  costUpdated?: boolean;
  productCreated?: boolean;
  error?: string;
};

export type PurchaseSyncResult = {
  linesSeen: number;
  linesLinked: number;
  linesSkippedMissingProduct: number;
  linesSkippedUncertainCaseQty: number;
  productsCreated: number;
  costsUpdated: number;
  lineResults: PurchaseSyncLineResult[];
};

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

function unitCostForLine(line: PurchaseSyncLineInput): number | null {
  const isCase = (line.unitOfMeasure ?? "").toLowerCase() === "case";
  if (isCase && line.perBoxUnitPrice != null) return line.perBoxUnitPrice;
  return line.unitPrice;
}

export async function syncAcceptedPurchasesToShopify(opts: {
  session: ShopifySession;
  lines: PurchaseSyncLineInput[];
  dryRun: boolean;
  createMissingProducts: boolean;
  skipCanonicalKeys?: Set<string>;
  matchVariant: (
    line: PurchaseSyncLineInput,
    index: VariantIndexEntry[],
  ) => { variantId: string | null };
}): Promise<PurchaseSyncResult> {
  const { session, lines, dryRun, createMissingProducts, skipCanonicalKeys, matchVariant } = opts;
  const index = await fetchVariantIndex(session);

  const lineResults: PurchaseSyncLineResult[] = [];
  let linesLinked = 0;
  let linesSkippedMissingProduct = 0;
  let linesSkippedUncertainCaseQty = 0;
  let productsCreated = 0;
  let costsUpdated = 0;

  for (const line of lines) {
    const canonicalKey = dealernetLineCanonicalKey({
      offerId: line.offerId,
      offerFilter: line.offerFilter,
      upc: line.upc,
      title: line.title,
      qty: line.qty,
    });
    const idempotencyKey = `purchase:link:${canonicalKey}`;

    if (skipCanonicalKeys?.has(canonicalKey)) {
      continue;
    }

    const isCase = (line.unitOfMeasure ?? "").toLowerCase() === "case";
    if (isCase && (!line.caseQtyBoxes || line.caseQtyBoxes <= 0)) {
      linesSkippedUncertainCaseQty += 1;
      lineResults.push({
        offerId: line.offerId,
        canonicalKey,
        idempotencyKey,
        status: "uncertain_case_qty",
      });
      continue;
    }

    const cost = unitCostForLine(line);
    let { variantId } = matchVariant(line, index);

    if (!variantId && createMissingProducts && line.title && !dryRun) {
      const upc = normalizeUpc(line.upc);
      const payload = {
        product: {
          title: line.title,
          product_type: "Sports Cards",
          status: "draft",
          variants: [
            {
              title: "Default Title",
              barcode: upc ?? "",
              sku: upc ? `DNX-${upc}` : "",
              price: String(cost ?? line.unitPrice ?? 0),
            },
          ],
          tags: "dealernet,auto-created,draft-pending-review",
        },
      };
      try {
        const created = await shopifyPost<{ product?: { variants?: Array<{ id: number }> } }>(
          session,
          "/products.json",
          payload,
        );
        const v0 = created.product?.variants?.[0];
        if (v0?.id) {
          variantId = String(v0.id);
          index.push({ variantId, productTitle: line.title, barcode: upc });
          productsCreated += 1;
        }
      } catch (e) {
        lineResults.push({
          offerId: line.offerId,
          canonicalKey,
          idempotencyKey,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
        continue;
      }
    }

    if (!variantId) {
      linesSkippedMissingProduct += 1;
      lineResults.push({
        offerId: line.offerId,
        canonicalKey,
        idempotencyKey,
        status: "missing_product",
      });
      continue;
    }

    if (dryRun) {
      lineResults.push({
        offerId: line.offerId,
        canonicalKey,
        idempotencyKey,
        status: "dry_run",
        shopifyVariantId: variantId,
      });
      linesLinked += 1;
      continue;
    }

    try {
      let costUpdated = false;
      if (cost != null && cost > 0) {
        const inventoryItemId = await fetchVariantInventoryItemId(session, variantId);
        if (inventoryItemId) {
          const locationId = process.env.SHOPIFY_LOCATION_ID?.trim();
          const onHand = locationId
            ? await fetchInventoryAvailableAtLocation(session, inventoryItemId, locationId)
            : 0;
          if (onHand <= 0) {
            await updateInventoryItemCost(session, inventoryItemId, cost);
            costUpdated = true;
            costsUpdated += 1;
          }
        }
      }
      lineResults.push({
        offerId: line.offerId,
        canonicalKey,
        idempotencyKey,
        status: "linked",
        shopifyVariantId: variantId,
        costUpdated,
        productCreated: productsCreated > 0,
      });
      linesLinked += 1;
    } catch (e) {
      lineResults.push({
        offerId: line.offerId,
        canonicalKey,
        idempotencyKey,
        status: "failed",
        shopifyVariantId: variantId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    linesSeen: lines.length,
    linesLinked,
    linesSkippedMissingProduct,
    linesSkippedUncertainCaseQty,
    productsCreated,
    costsUpdated,
    lineResults,
  };
}
