import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseOfferProbeArgs, probeDealernetOfferPages } from "@dealernet-ops/core";
import { loadDealernetLogin } from "../dealernet-login.js";

function defaultOfferIds(): string[] {
  // Reference matrix from docs/DEALERNET_OFFER_PAGE.md
  return ["364263", "364363", "361004"];
}

async function main() {
  const args = parseOfferProbeArgs(process.argv.slice(2));
  const offerIds = args.offerIds.length ? args.offerIds : defaultOfferIds();
  const login = loadDealernetLogin();

  const outDir = resolve(process.cwd(), "data", "offer-probes");
  mkdirSync(outDir, { recursive: true });

  console.log(`[probe-offer] Probing ${offerIds.length} offer page(s)${args.probeHome ? " + home queues" : ""}…`);
  if (args.headed) console.log("[probe-offer] Headed mode — browser visible.");

  const { offers, home } = await probeDealernetOfferPages({
    login,
    offerIds,
    headed: args.headed,
    pauseMs: args.pauseMs,
    probeHome: args.probeHome,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bundlePath = join(outDir, `probe-${stamp}.json`);
  writeFileSync(bundlePath, JSON.stringify({ offers, home }, null, 2), "utf8");

  for (const o of offers) {
    const path = join(outDir, `offer-${o.offerId}.json`);
    writeFileSync(path, JSON.stringify(o, null, 2), "utf8");
    console.log(`\n--- Offer #${o.offerId} ---`);
    console.log(`  url: ${o.url}`);
    console.log(`  status: ${o.statusBadge ?? o.statusText ?? "(none)"}`);
    console.log(`  tracking: ${o.tracking ?? "(none)"}`);
    console.log(`  tabs: ${o.tabs.map((t) => t.label).join(" | ") || "(none)"}`);
    console.log(
      `  buttons: ${o.buttons.filter((b) => b.visible).map((b) => b.text).slice(0, 12).join(", ") || "(none)"}`,
    );
    console.log(`  line items: ${o.lineItems.length}`);
    console.log(`  saved: ${path}`);
  }

  if (home) {
    console.log("\n--- Home purchase/sales queue hints ---");
    console.log(`  purchase links: ${home.purchaseLinks.length}`);
    for (const l of home.purchaseLinks.slice(0, 8)) console.log(`    ${l.text} → ${l.href}`);
    console.log(`  sales links: ${home.salesLinks.length}`);
    for (const l of home.salesLinks.slice(0, 8)) console.log(`    ${l.text} → ${l.href}`);
    if (home.pendingSnippets.length) {
      console.log("  pending snippets:");
      for (const s of home.pendingSnippets) console.log(`    ${s}`);
    }
  }

  console.log(`\n[probe-offer] Bundle: ${bundlePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
