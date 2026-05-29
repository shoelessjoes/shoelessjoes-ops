/**
 * Offline smoke test: mocks Shopify REST calls and verifies
 * purchase mode → POST /draft_orders.json
 * sale mode → POST /orders.json with expected tagging and line items.
 */
import { strict as assert } from "node:assert";
import { matchOfferLineToVariant, type VariantIndexEntry } from "../src/mapping.js";
import { syncAcceptedOffersToShopify } from "../src/shopify-sync.js";
import type { SyncOfferLineInput } from "../src/shopify-sync.js";

type RecordedBody = Record<string, unknown>;

const session = {
  shopDomain: "test-store.myshopify.com",
  accessToken: "test-token",
  apiVersion: "2024-10",
};

const base =
  () => `https://${session.shopDomain}/admin/api/${session.apiVersion}`;

const matchedLine = {
  variantId: 900001,
  barcode: "0851268000123",
  title: "Pokemon Booster Box",
};

function sampleAcceptedLine(): SyncOfferLineInput {
  return {
    offerId: "smoke-offer-po",
    offerFilter: "PURCHASESUNRATED",
    status: "ACCEPTED",
    dealer: "D001",
    createdAt: "2026-05-07",
    title: matchedLine.title,
    upc: "851268000123",
    qty: 1,
    unitPrice: 89.99,
    perBoxUnitPrice: null,
    unitOfMeasure: null,
    caseQtyBoxes: null,
    trackingNumber: null,
  };
}

function mockFetch(recorder: RecordedBody[], impl: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

    if (url.includes(`${base()}/products.json`)) {
      assert.equal(init?.method ?? "GET", "GET");
      const paginatedBody = JSON.stringify({
        products: [
          {
            title: matchedLine.title,
            variants: [{ id: matchedLine.variantId, barcode: matchedLine.barcode }],
          },
        ],
      });
      return new Response(paginatedBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (init?.method === "POST") {
      const raw = init.body ? String(init.body) : "{}";
      const body = JSON.parse(raw) as RecordedBody;
      recorder.push(body);

      if (url.includes("/draft_orders.json")) {
        return new Response(JSON.stringify({ draft_order: { id: 12345 } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/orders.json")) {
        return new Response(JSON.stringify({ order: { id: 67890 } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return impl(input, init);
  };
}

async function runPurchaseSmoke() {
  const posted: RecordedBody[] = [];
  const prev = globalThis.fetch;

  globalThis.fetch = mockFetch(posted, prev);

  try {
    const result = await syncAcceptedOffersToShopify({
      session,
      lines: [sampleAcceptedLine()],
      mode: "purchase",
      dryRun: false,
      createMissingProducts: false,
      acceptedOnly: true,
      matchVariant: (line, index: VariantIndexEntry[]) =>
        matchOfferLineToVariant({ title: line.title, upc: line.upc }, index, new Map()),
    });

    assert.equal(result.events.filter((e) => e.status === "created").length, 1);
    assert.deepEqual(posted.length, 1);
    const body = posted[0]!;
    assert.ok(body.draft_order);
    const dr = body.draft_order as Record<string, unknown>;
    assert.ok(String(dr.tags).includes("dealernet"));
    assert.ok(String(dr.tags).includes("purchase"));
    assert.ok(Array.isArray(dr.line_items));
    const lines = dr.line_items as Array<{ variant_id?: number }>;
    assert.equal(lines[0]?.variant_id, matchedLine.variantId);

    console.log("[smoke] purchase / draft_orders: OK");
  } finally {
    globalThis.fetch = prev;
  }
}

async function runSaleSmoke() {
  const posted: RecordedBody[] = [];
  const prev = globalThis.fetch;

  globalThis.fetch = mockFetch(posted, prev);

  try {
    const line = sampleAcceptedLine();
    line.offerId = "smoke-offer-sale";
    line.offerFilter = "SALESUNRATED";

    const result = await syncAcceptedOffersToShopify({
      session,
      lines: [line],
      mode: "sale",
      dryRun: false,
      createMissingProducts: false,
      acceptedOnly: true,
      matchVariant: (line2, index: VariantIndexEntry[]) =>
        matchOfferLineToVariant({ title: line2.title, upc: line2.upc }, index, new Map()),
    });

    assert.equal(result.events.filter((e) => e.status === "created").length, 1);
    assert.deepEqual(posted.length, 1);
    const body = posted[0]!;
    assert.ok(body.order);
    const ord = body.order as Record<string, unknown>;
    assert.equal(ord.financial_status, "paid");
    assert.equal(ord.inventory_behaviour, "decrement_ignoring_policy");
    assert.ok(String(ord.tags).includes("sale"));
    assert.ok(Array.isArray(ord.line_items));

    console.log("[smoke] sale / orders: OK");
  } finally {
    globalThis.fetch = prev;
  }
}

await runPurchaseSmoke();
await runSaleSmoke();

console.log("All order-creation smoke checks passed.");
