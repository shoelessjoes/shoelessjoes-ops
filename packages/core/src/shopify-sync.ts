import { normalizeUpc } from "./normalize.js";
import type { VariantIndexEntry } from "./mapping.js";
import type { ShopifySession } from "./shopify-session.js";

export type { ShopifySession };
export type SyncMode = "purchase" | "sale";

export type SyncOfferLineInput = {
  offerId: string;
  offerFilter: string;
  status: string;
  dealer: string;
  createdAt: string;
  title: string;
  upc: string | null;
  qty: number;
  unitPrice: number | null;
  perBoxUnitPrice: number | null;
  unitOfMeasure: string | null;
  caseQtyBoxes: number | null;
  trackingNumber: string | null;
};

export type SyncResult = {
  offersSeen: number;
  offersCreated: number;
  linesSeen: number;
  linesMapped: number;
  productsCreated: number;
  linesSkippedMissingProduct: number;
  linesSkippedUncertainCaseQty: number;
  offersSkippedNoLines: number;
  events: Array<{
    offerId: string;
    mode: SyncMode;
    idempotencyKey: string;
    status: string;
    shopifyDraftOrderId?: string;
    shopifyOrderId?: string;
    error?: string;
  }>;
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

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const m = part.match(/<([^>]+)>;\s*rel="?next"?/i);
    if (m) return m[1];
  }
  return null;
}

export async function fetchVariantIndex(session: ShopifySession): Promise<VariantIndexEntry[]> {
  const out: VariantIndexEntry[] = [];
  let url: string | null =
    `https://${session.shopDomain}/admin/api/${session.apiVersion}/products.json?limit=250&fields=id,title,variants`;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": session.accessToken },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify products fetch failed ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as { products?: Array<{ title?: string; variants?: Array<{ id: number; barcode?: string | null }> }> };
    for (const p of data.products ?? []) {
      const title = String(p.title ?? "").trim();
      for (const v of p.variants ?? []) {
        out.push({
          variantId: String(v.id),
          productTitle: title,
          barcode: v.barcode ? String(v.barcode) : null,
        });
      }
    }
    const next = parseLinkNext(res.headers.get("Link"));
    url = next;
  }
  return out;
}

export async function syncAcceptedOffersToShopify(opts: {
  session: ShopifySession;
  lines: SyncOfferLineInput[];
  mode: SyncMode;
  dryRun: boolean;
  createMissingProducts: boolean;
  acceptedOnly: boolean;
  matchVariant: (line: SyncOfferLineInput, index: VariantIndexEntry[]) => { variantId: string | null };
}): Promise<SyncResult> {
  const { session, lines, mode, dryRun, createMissingProducts, acceptedOnly, matchVariant } = opts;
  const index = await fetchVariantIndex(session);

  const byOffer = new Map<string, SyncOfferLineInput[]>();
  for (const ln of lines) {
    if (acceptedOnly && ln.status.toUpperCase() !== "ACCEPTED") continue;
    if (!ln.qty || ln.qty <= 0) continue;
    const list = byOffer.get(ln.offerId) ?? [];
    list.push(ln);
    byOffer.set(ln.offerId, list);
  }

  const events: SyncResult["events"] = [];
  let offersCreated = 0;
  let linesMapped = 0;
  let linesSkippedMissingProduct = 0;
  let linesSkippedUncertainCaseQty = 0;
  let offersSkippedNoLines = 0;
  let productsCreated = 0;

  for (const [offerId, offerLines] of byOffer) {
    const idempotencyKey = `${mode}:${offerId}`;
    const orderLines: Array<{ variant_id: number; quantity: number; price?: string }> = [];
    const caseExpansionNotes: string[] = [];
    let tracking: string | null = null;
    let dealer = "";
    let createdAt = "";

    for (const ln of offerLines) {
      dealer = ln.dealer || dealer;
      createdAt = ln.createdAt || createdAt;
      tracking = tracking || ln.trackingNumber;

      const isCase = (ln.unitOfMeasure ?? "").toLowerCase() === "case";
      let effectiveQty = ln.qty;
      let effectiveUnitPrice = ln.unitPrice;

      if (isCase) {
        if (ln.caseQtyBoxes && ln.caseQtyBoxes > 0) {
          effectiveQty = ln.qty * ln.caseQtyBoxes;
          effectiveUnitPrice = ln.perBoxUnitPrice ?? ln.unitPrice;
          caseExpansionNotes.push(
            `${ln.qty} case = ${effectiveQty} boxes${
              effectiveUnitPrice != null ? ` @ $${effectiveUnitPrice}/box` : ""
            } (${ln.title})`,
          );
        } else {
          linesSkippedUncertainCaseQty += 1;
          continue;
        }
      }

      const { variantId } = matchVariant(ln, index);
      let vid = variantId;
      if (!vid && createMissingProducts && ln.title && !dryRun) {
        const price = effectiveUnitPrice ?? ln.perBoxUnitPrice ?? ln.unitPrice ?? 0;
        const upc = normalizeUpc(ln.upc);
        const payload = {
          product: {
            title: ln.title,
            product_type: "Sports Cards",
            status: "draft",
            variants: [
              {
                title: "Default Title",
                barcode: upc ?? "",
                sku: upc ? `DNX-${upc}` : "",
                price: String(price),
              },
            ],
            tags: "dealernet,auto-created,draft-pending-review",
          },
        };
        const created = await shopifyPost<{ product?: { variants?: Array<{ id: number }> } }>(
          session,
          "/products.json",
          payload,
        );
        const v0 = created.product?.variants?.[0];
        if (v0?.id) {
          vid = String(v0.id);
          index.push({ variantId: vid, productTitle: ln.title, barcode: upc });
          productsCreated += 1;
        }
      }

      if (!vid) {
        linesSkippedMissingProduct += 1;
        continue;
      }

      const price = effectiveUnitPrice ?? ln.perBoxUnitPrice ?? ln.unitPrice;
      const linePayload: { variant_id: number; quantity: number; price?: string } = {
        variant_id: Number(vid),
        quantity: effectiveQty,
      };
      if (price != null) linePayload.price = String(price);
      orderLines.push(linePayload);
      linesMapped += 1;
    }

    if (!orderLines.length) {
      offersSkippedNoLines += 1;
      events.push({ offerId, mode, idempotencyKey, status: "skipped_no_lines" });
      continue;
    }

    const noteParts = [`Dealernet offer ${offerId} (${mode})`];
    if (dealer) noteParts.push(`Dealer: ${dealer}`);
    if (createdAt) noteParts.push(`Created: ${createdAt}`);
    if (tracking) noteParts.push(`Tracking: ${tracking}`);
    if (caseExpansionNotes.length) noteParts.push(`Case expansion: ${caseExpansionNotes.join("; ")}`);
    const note = noteParts.join(" | ");

    if (dryRun) {
      events.push({ offerId, mode, idempotencyKey, status: "dry_run" });
      offersCreated += 1;
      continue;
    }

    try {
      const body = {
        draft_order: {
          line_items: orderLines,
          note,
          tags: `dealernet,sale,offer-${offerId}`,
        },
      };
      const resp = await shopifyPost<{ draft_order?: { id: number } }>(session, "/draft_orders.json", body);
      const id = resp.draft_order?.id;
      events.push({
        offerId,
        mode,
        idempotencyKey,
        status: "created",
        shopifyDraftOrderId: id ? String(id) : undefined,
      });
      offersCreated += 1;
    } catch (e) {
      events.push({
        offerId,
        mode,
        idempotencyKey,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    offersSeen: byOffer.size,
    offersCreated,
    linesSeen: lines.filter((l) => !acceptedOnly || l.status.toUpperCase() === "ACCEPTED").length,
    linesMapped,
    productsCreated,
    linesSkippedMissingProduct,
    linesSkippedUncertainCaseQty,
    offersSkippedNoLines,
    events,
  };
}
