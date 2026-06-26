import { normalizeUpc } from "../normalize.js";
import type { ShopifySession } from "../shopify-session.js";

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="?next"?/i);
    if (m) return m[1];
  }
  return null;
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

/** All variant barcodes in shop (active, draft, and archived). */
export async function buildShopifyBarcodeSet(
  session: ShopifySession,
  extraUpcs: Iterable<string> = [],
): Promise<Set<string>> {
  const set = new Set<string>();
  for (const raw of extraUpcs) {
    const upc = normalizeUpc(raw);
    if (upc) set.add(upc);
  }

  let url: string | null =
    `https://${session.shopDomain}/admin/api/${session.apiVersion}/products.json?limit=250&status=any&fields=id,title,variants`;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": session.accessToken },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify products fetch failed ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      products?: Array<{ variants?: Array<{ barcode?: string | null }> }>;
    };
    for (const p of data.products ?? []) {
      for (const v of p.variants ?? []) {
        const upc = normalizeUpc(v.barcode);
        if (upc) set.add(upc);
      }
    }
    url = parseLinkNext(res.headers.get("Link"));
  }
  return set;
}

export type RetailerDraftInput = {
  title: string;
  upc: string;
  releaseDate: string;
  manufacturer?: string | null;
  sport?: string | null;
  imageUrl?: string | null;
  mwcSku?: string | null;
  listPrice?: string | null;
  sourceUrl?: string | null;
};

export type RetailerDraftResult = {
  upc: string;
  status: "created" | "skipped_exists" | "dry_run" | "failed";
  shopifyVariantId?: string;
  shopifyProductId?: string;
  error?: string;
};

export async function createRetailerDraftProduct(
  session: ShopifySession,
  input: RetailerDraftInput,
  dryRun: boolean,
): Promise<RetailerDraftResult> {
  const upc = normalizeUpc(input.upc);
  if (!upc) {
    return { upc: input.upc, status: "failed", error: "invalid upc" };
  }
  if (!input.releaseDate) {
    return { upc, status: "failed", error: "missing release_date" };
  }

  if (dryRun) {
    return { upc, status: "dry_run" };
  }

  const tags = [
    "midwestcards",
    "presell",
    "placeholder",
    `release-date:${input.releaseDate}`,
    input.sport,
  ]
    .filter(Boolean)
    .join(",");

  const price = input.listPrice && Number.parseFloat(input.listPrice) > 0 ? input.listPrice : "0.00";
  const noteParts = [`Midwest Cards presell import`, `Release: ${input.releaseDate}`];
  if (input.sourceUrl) noteParts.push(`Source: ${input.sourceUrl}`);

  try {
    const payload = {
      product: {
        title: input.title,
        body_html: noteParts.join("<br>"),
        vendor: input.manufacturer || "Unknown",
        product_type: "Sports Cards",
        status: "draft",
        tags,
        variants: [
          {
            title: "Default Title",
            barcode: upc,
            sku: input.mwcSku ? `MWC-${input.mwcSku}` : `MWC-${upc}`,
            price,
          },
        ],
        images: input.imageUrl ? [{ src: input.imageUrl }] : undefined,
      },
    };
    const created = await shopifyPost<{
      product?: { id: number; variants?: Array<{ id: number }> };
    }>(session, "/products.json", payload);
    const productId = created.product?.id;
    const variantId = created.product?.variants?.[0]?.id;
    return {
      upc,
      status: "created",
      shopifyProductId: productId ? String(productId) : undefined,
      shopifyVariantId: variantId ? String(variantId) : undefined,
    };
  } catch (e) {
    return {
      upc,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
