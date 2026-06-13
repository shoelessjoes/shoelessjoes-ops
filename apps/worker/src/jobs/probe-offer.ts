import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  parseOfferProbeArgs,
  probeDealernetOfferList,
  probeDealernetOfferPages,
} from "@dealernet-ops/core";
import { loadDealernetLogin } from "../dealernet-login.js";

function defaultOfferIds(): string[] {
  return ["364263", "364363", "361004"];
}

async function main() {
  const args = parseOfferProbeArgs(process.argv.slice(2));
  const login = loadDealernetLogin();
  const outDir = resolve(process.cwd(), "data", "offer-probes");
  mkdirSync(outDir, { recursive: true });

  if (args.headed) console.log("[probe-offer] Headed mode — browser visible.");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bundle: Record<string, unknown> = {};

  if (args.offerFilters.length) {
    for (const filter of args.offerFilters) {
      console.log(`[probe-offer] Probing offer list: ${filter} (max detail=${args.maxDetailProbes})…`);
      const result = await probeDealernetOfferList({
        login,
        offerFilter: filter,
        headed: args.headed,
        pauseMs: args.pauseMs,
        probeHome: args.probeHome,
        maxDetailProbes: args.maxDetailProbes,
      });

      const listPath = join(outDir, `list-${filter}.json`);
      writeFileSync(listPath, JSON.stringify(result.list, null, 2), "utf8");
      bundle[`list_${filter}`] = result.list;

      console.log(`\n--- List ${filter} ---`);
      console.log(`  url: ${result.list.url}`);
      console.log(`  rows: ${result.list.rowCount}`);
      for (const row of result.list.rows.slice(0, 15)) {
        console.log(`    #${row.offerId} ${row.status} | ${row.dealer} | $${row.total}`);
      }
      if (result.list.rowCount > 15) console.log(`    … +${result.list.rowCount - 15} more`);
      console.log(`  saved: ${listPath}`);

      for (const o of result.offers) {
        const path = join(outDir, `offer-${o.offerId}.json`);
        writeFileSync(path, JSON.stringify(o, null, 2), "utf8");
        console.log(`  detail probe: #${o.offerId} status=${o.statusBadge} tracking=${o.tracking ?? "—"}`);
      }

      if (result.home) bundle.home = result.home;
    }
  }

  const offerIds = args.offerIds.length ? args.offerIds : args.offerFilters.length ? [] : defaultOfferIds();

  if (offerIds.length) {
    console.log(`[probe-offer] Probing ${offerIds.length} offer page(s)${args.probeHome ? " + home" : ""}…`);
    const { offers, home } = await probeDealernetOfferPages({
      login,
      offerIds,
      headed: args.headed,
      pauseMs: args.pauseMs,
      probeHome: args.probeHome && !args.offerFilters.length,
    });
    bundle.offers = offers;
    if (home) bundle.home = home;

    for (const o of offers) {
      const path = join(outDir, `offer-${o.offerId}.json`);
      writeFileSync(path, JSON.stringify(o, null, 2), "utf8");
      console.log(`\n--- Offer #${o.offerId} ---`);
      console.log(`  status: ${o.statusBadge ?? "(none)"} | tracking: ${o.tracking ?? "(none)"}`);
      console.log(`  tabs: ${o.tabs.map((t) => t.label).join(" | ") || "(none)"}`);
      console.log(`  saved: ${path}`);
    }

    if (home) {
      console.log("\n--- Home queue hints ---");
      for (const l of home.purchaseLinks.filter((x) => /unrated|pending/i.test(x.text)).slice(0, 6)) {
        console.log(`  ${l.text} → ${l.href}`);
      }
    }
  }

  const bundlePath = join(outDir, `probe-${stamp}.json`);
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
  console.log(`\n[probe-offer] Bundle: ${bundlePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
