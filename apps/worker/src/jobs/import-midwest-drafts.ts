import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildShopifyBarcodeSet,
  createRetailerDraftProduct,
  normalizeUpc,
} from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { optionalEnv, requireEnv } from "../env.js";
import { getOrCreateShopFromEnv } from "../shop.js";

type MidwestRow = {
  title?: string;
  upc?: string;
  release_date?: string;
  manufacturer?: string;
  sport?: string;
  image_url?: string;
  mwc_sku?: string;
  mwc_price?: string;
  source_url?: string;
  import_action?: string;
};

function parseArgs() {
  const execute = process.argv.includes("--execute");
  const jsonArg = process.argv.find((a) => a.startsWith("--json="));
  const jsonPath =
    jsonArg?.slice("--json=".length) ||
    optionalEnv("MIDWEST_PRESELLS_JSON") ||
    resolve("..", "shoelessjoes-supplier-py", "out", "midwest_presells.json");
  return { dryRun: !execute, jsonPath };
}

async function main() {
  const { dryRun, jsonPath } = parseArgs();
  const shop = await getOrCreateShopFromEnv();
  const accessToken = (shop.accessToken && shop.accessToken.trim()) || requireEnv("SHOPIFY_ACCESS_TOKEN");
  const apiVersion = optionalEnv("SHOPIFY_API_VERSION") ?? "2024-10";
  const session = { shopDomain: shop.shopifyDomain, accessToken, apiVersion };

  const absJson = resolve(jsonPath);
  const payload = JSON.parse(await readFile(absJson, "utf-8")) as {
    rows?: MidwestRow[];
  };
  const rows = payload.rows ?? [];

  console.log(
    `[import-midwest-drafts] ${absJson} (${rows.length} rows) ${dryRun ? "DRY-RUN" : "EXECUTE"}`,
  );

  const catalogRows = await prisma.productCatalog.findMany({
    where: { barcode: { not: null } },
    select: { barcode: true },
  });
  const existingBarcodes = await buildShopifyBarcodeSet(
    session,
    catalogRows.map((r) => r.barcode!).filter(Boolean),
  );
  console.log(`Shopify barcode index: ${existingBarcodes.size} UPC(s) (all statuses/types)`);

  const stats = {
    eligible: 0,
    skipped_not_marked: 0,
    skipped_missing_fields: 0,
    skipped_exists: 0,
    created: 0,
    failed: 0,
    dry_run: 0,
  };

  const results: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const upc = normalizeUpc(row.upc);
    const releaseDate = (row.release_date || "").trim();
    const importAction = (row.import_action || "").trim();

    if (importAction !== "create_draft") {
      stats.skipped_not_marked++;
      continue;
    }
    if (!upc || !releaseDate) {
      stats.skipped_missing_fields++;
      continue;
    }
    stats.eligible++;

    if (existingBarcodes.has(upc)) {
      stats.skipped_exists++;
      results.push({ upc, title: row.title, status: "skipped_exists" });
      continue;
    }

    const outcome = await createRetailerDraftProduct(
      session,
      {
        title: row.title || "",
        upc,
        releaseDate,
        manufacturer: row.manufacturer || null,
        sport: row.sport || null,
        imageUrl: row.image_url || null,
        mwcSku: row.mwc_sku || null,
        listPrice: row.mwc_price || null,
        sourceUrl: row.source_url || null,
      },
      dryRun,
    );

    if (outcome.status === "created") {
      stats.created++;
      existingBarcodes.add(upc);
    } else if (outcome.status === "dry_run") {
      stats.dry_run++;
    } else if (outcome.status === "failed") {
      stats.failed++;
    }

    results.push({ ...outcome, title: row.title });
  }

  await prisma.jobRun.create({
    data: {
      shopId: shop.id,
      jobName: "import-midwest-drafts",
      status: "completed",
      finishedAt: new Date(),
      metaJson: { dryRun, stats, results } as object,
    },
  });

  console.log(JSON.stringify({ dryRun, stats, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
