// packages/core/src/shopify/catalog-export.ts
//
// P0 — Shared sealed-product catalog export.
// READ-ONLY: runs a Shopify GraphQL bulk operation, downloads the JSONL
// result, stitches variants to their parent products, and returns a flat
// list of variant-level catalog rows. Also writes a CSV snapshot.
//
// No Prisma dependency here on purpose — the worker job owns persistence,
// so this module stays usable from anywhere (scripts, tests, supplier-py
// handoff, etc.). Nothing here writes back to Shopify.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const SHOP = process.env.SHOPIFY_SHOP_DOMAIN; // qebynk-b0.myshopify.com
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN; // never logged
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-04";

// Comma-separated EXACT Shopify product-type value(s) for sealed wax.
// e.g. CATALOG_PRODUCT_TYPES="Sealed Wax"
// or   CATALOG_PRODUCT_TYPES="Sealed Wax - Baseball,Sealed Wax - Basketball"
const PRODUCT_TYPES = (process.env.CATALOG_PRODUCT_TYPES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export interface CatalogRow {
  barcode: string | null; // UPC — primary match key for offer/price sync
  variantId: string; // gid://shopify/ProductVariant/...
  productId: string; // gid://shopify/Product/...
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string | null; // comma-joined
  price: string | null;
  unitCost: string | null; // requires read_inventory scope
  inventoryQuantity: number | null;
  status: string | null;
}

function endpoint(): string {
  return `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
}

async function gql<T>(query: string): Promise<T> {
  if (!SHOP || !TOKEN) {
    throw new Error(
      "Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN in env",
    );
  }
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: T; errors?: unknown };
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function buildInnerQuery(): string {
  if (PRODUCT_TYPES.length === 0) {
    throw new Error(
      'CATALOG_PRODUCT_TYPES is empty — set it to your sealed-wax product type(s), e.g. "Sealed Wax"',
    );
  }
  const filter = PRODUCT_TYPES.map(
    (t) => `product_type:'${t.replace(/'/g, "\\'")}'`,
  ).join(" OR ");
  // Variants come back as separate JSONL lines linked by __parentId.
  return `
    {
      products(query: "${filter}") {
        edges {
          node {
            id
            title
            productType
            vendor
            tags
            status
            variants {
              edges {
                node {
                  id
                  title
                  sku
                  barcode
                  price
                  inventoryQuantity
                  inventoryItem { unitCost { amount } }
                }
              }
            }
          }
        }
      }
    }
  `;
}

async function startBulk(): Promise<void> {
  const inner = buildInnerQuery();
  // GraphQL block string ("""...""") lets the inner double-quotes pass
  // through untouched; JSON.stringify in gql() handles HTTP-body escaping.
  const mutation = `
    mutation {
      bulkOperationRunQuery(query: """
      ${inner}
      """) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }
  `;
  const data = await gql<{
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: string } | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(mutation);
  const errs = data.bulkOperationRunQuery.userErrors;
  if (errs.length) {
    // A common one: another bulk op is already RUNNING for this shop.
    throw new Error(`bulkOperationRunQuery failed: ${JSON.stringify(errs)}`);
  }
}

async function pollBulk(): Promise<string> {
  const q = `{
    currentBulkOperation(type: QUERY) {
      id status errorCode objectCount url
    }
  }`;
  for (;;) {
    const data = await gql<{
      currentBulkOperation: {
        id: string;
        status: string;
        errorCode: string | null;
        objectCount: string;
        url: string | null;
      } | null;
    }>(q);
    const op = data.currentBulkOperation;
    if (!op) throw new Error("No current bulk operation found");
    if (op.status === "COMPLETED") {
      return op.url ?? ""; // empty string = zero matching products
    }
    if (["FAILED", "CANCELED", "EXPIRED"].includes(op.status)) {
      throw new Error(
        `Bulk operation ${op.status} (errorCode=${op.errorCode ?? "none"})`,
      );
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function downloadAndParse(url: string): Promise<CatalogRow[]> {
  if (!url) return [];
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download bulk result: HTTP ${res.status}`);
  }
  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  type ProductLine = {
    id: string;
    title: string;
    productType: string | null;
    vendor: string | null;
    tags: string[];
    status: string | null;
  };
  const products = new Map<string, ProductLine>();
  const variantLines: any[] = [];

  for (const line of lines) {
    const obj = JSON.parse(line);
    if (typeof obj.id === "string" && obj.id.includes("/Product/")) {
      products.set(obj.id, {
        id: obj.id,
        title: obj.title ?? "",
        productType: obj.productType ?? null,
        vendor: obj.vendor ?? null,
        tags: Array.isArray(obj.tags) ? obj.tags : [],
        status: obj.status ?? null,
      });
    } else if (
      typeof obj.id === "string" &&
      obj.id.includes("/ProductVariant/")
    ) {
      variantLines.push(obj);
    }
  }

  const rows: CatalogRow[] = [];
  for (const v of variantLines) {
    const parent = products.get(v.__parentId);
    rows.push({
      barcode: v.barcode ?? null,
      variantId: v.id,
      productId: parent?.id ?? v.__parentId,
      productTitle: parent?.title ?? "",
      variantTitle: v.title ?? null,
      sku: v.sku ?? null,
      productType: parent?.productType ?? null,
      vendor: parent?.vendor ?? null,
      tags: parent && parent.tags.length ? parent.tags.join(", ") : null,
      price: v.price ?? null,
      unitCost: v.inventoryItem?.unitCost?.amount ?? null,
      inventoryQuantity:
        typeof v.inventoryQuantity === "number" ? v.inventoryQuantity : null,
      status: parent?.status ?? null,
    });
  }
  return rows;
}

function toCsv(rows: CatalogRow[]): string {
  const headers = [
    "barcode",
    "variant_id",
    "product_id",
    "product_title",
    "variant_title",
    "sku",
    "product_type",
    "vendor",
    "tags",
    "price",
    "unit_cost",
    "inventory_quantity",
    "status",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [headers.join(",")];
  for (const r of rows) {
    out.push(
      [
        r.barcode,
        r.variantId,
        r.productId,
        r.productTitle,
        r.variantTitle,
        r.sku,
        r.productType,
        r.vendor,
        r.tags,
        r.price,
        r.unitCost,
        r.inventoryQuantity,
        r.status,
      ]
        .map(esc)
        .join(","),
    );
  }
  return out.join("\n");
}

/**
 * Runs the full export: start bulk op -> poll -> download -> parse -> write CSV.
 * Returns the rows so the caller (worker job) can also persist to Postgres.
 */
export async function exportSealedCatalog(opts?: {
  csvPath?: string;
}): Promise<CatalogRow[]> {
  await startBulk();
  const url = await pollBulk();
  const rows = await downloadAndParse(url);
  const csvPath =
    opts?.csvPath ?? process.env.CATALOG_CSV_PATH ?? "data/sealed-catalog.csv";
  await mkdir(dirname(csvPath), { recursive: true });
  await writeFile(csvPath, toCsv(rows), "utf8");
  return rows;
}
