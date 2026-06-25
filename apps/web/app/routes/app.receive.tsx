import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { normalizeUpc, receiveVariantInventory } from "@dealernet-ops/core";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

function locationIdFromEnv(): string | null {
  const raw = process.env.SHOPIFY_LOCATION_ID?.trim();
  return raw || null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const ready = await prisma.inboundLine.count({
    where: {
      direction: "inbound",
      stage: { in: ["ordered", "in_transit", "delivered"] },
    },
  });

  return json({
    locationId: locationIdFromEnv(),
    readyCount: ready,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopifyDomain: session.shop } });
  if (!shop) return json({ error: "Shop not found" }, { status: 400 });

  const form = await request.formData();
  const upcRaw = String(form.get("upc") ?? "").trim();
  const qtyRaw = Number.parseInt(String(form.get("qty") ?? "1"), 10);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  const execute = form.get("execute") === "1";

  const upc = normalizeUpc(upcRaw);
  if (!upc) {
    return json({ error: "Invalid or missing UPC" }, { status: 400 });
  }

  const candidates = await prisma.inboundLine.findMany({
    where: {
      shopId: shop.id,
      direction: "inbound",
      stage: { notIn: ["cancelled", "received"] },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: 50,
  });

  const line = candidates.find(
    (l) => normalizeUpc(l.upc) === upc && l.qtyReceived < l.qtyOrdered,
  );

  if (!line) {
    return json({
      error: `No open inbound line for UPC ${upc}`,
      upc,
    });
  }

  const remaining = line.qtyOrdered - line.qtyReceived;
  if (remaining <= 0) {
    return json({ error: "Line already fully received", line });
  }

  const receiveQty = Math.min(qty, remaining);
  const preview = {
    lineId: line.id,
    title: line.title,
    upc,
    receiveQty,
    remainingAfter: remaining - receiveQty,
    shopifyVariantId: line.shopifyVariantId,
    unitCost: line.unitCost?.toString() ?? null,
  };

  if (!execute) {
    return json({ preview, dryRun: true });
  }

  if (!line.shopifyVariantId) {
    return json({
      error: "No Shopify variant linked — run sync-offers purchase first",
      preview,
    });
  }

  const locationId = locationIdFromEnv();
  if (!locationId) {
    return json({
      error: "Set SHOPIFY_LOCATION_ID in web app env for inventory adjust",
      preview,
    });
  }

  const accessToken = session.accessToken;
  if (!accessToken) {
    return json({ error: "Missing Shopify session token" }, { status: 401 });
  }

  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2024-10";
  try {
    await receiveVariantInventory(
      {
        shopDomain: session.shop,
        accessToken,
        apiVersion,
      },
      {
        variantId: line.shopifyVariantId,
        locationId,
        qty: receiveQty,
        unitCost: line.unitCost ? Number(line.unitCost) : null,
      },
    );
  } catch (e) {
    return json({
      error: e instanceof Error ? e.message : String(e),
      preview,
    });
  }

  const newReceived = line.qtyReceived + receiveQty;
  const fullyReceived = newReceived >= line.qtyOrdered;
  await prisma.inboundLine.update({
    where: { id: line.id },
    data: {
      qtyReceived: newReceived,
      stage: fullyReceived ? "received" : line.stage,
      receivedAt: fullyReceived ? new Date() : line.receivedAt,
    },
  });

  return json({
    ok: true,
    preview,
    received: newReceived,
    stage: fullyReceived ? "received" : line.stage,
  });
};

export default function ReceiveScanPage() {
  const actionData = useActionData<typeof action>();

  return (
    <div>
      <h1>Receive scan</h1>
      <p style={{ color: "#666", maxWidth: "40rem" }}>
        Scan or type a UPC to receive against the oldest open inbound line. Dry-run previews the match;
        check Execute to adjust Shopify inventory. Requires <code>SHOPIFY_LOCATION_ID</code> and a linked
        variant (<code>sync-offers purchase --execute</code>).
      </p>
      <Form method="post" style={{ marginTop: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.5rem" }}>
          UPC
          <input
            name="upc"
            type="text"
            autoFocus
            style={{ display: "block", width: "20rem", fontFamily: "monospace", marginTop: "0.25rem" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: "0.5rem" }}>
          Qty
          <input
            name="qty"
            type="number"
            min={1}
            defaultValue={1}
            style={{ display: "block", width: "6rem", marginTop: "0.25rem" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: "1rem" }}>
          <input name="execute" type="checkbox" value="1" /> Execute (adjust Shopify inventory)
        </label>
        <button type="submit">Receive</button>
      </Form>
      {actionData && "error" in actionData && actionData.error ? (
        <p style={{ color: "#b00020", marginTop: "1rem" }}>{actionData.error}</p>
      ) : null}
      {actionData && "preview" in actionData && actionData.preview ? (
        <pre style={{ marginTop: "1rem", background: "#f5f5f5", padding: "1rem" }}>
          {JSON.stringify(actionData, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
