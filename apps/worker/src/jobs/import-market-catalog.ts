/**
 * Upsert Dealernet market reference rows from supplier-py CSV caches.
 *
 * Reads (by default, sibling repo):
 *   ../shoelessjoes-supplier-py/out/market_resolve_cache.csv
 *   ../shoelessjoes-supplier-py/out/parsed_boxes_search_cache.csv
 *   ../shoelessjoes-supplier-py/out/supplier_daily.csv
 *
 * Run: npm run job:import-market-catalog
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@dealernet-ops/db";

type CsvRow = Record<string, string>;

function cleanMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUpc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function lookupKeyForInput(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (/^\d{8,14}$/.test(digits)) return `upc:${digits}`;
  return `q:${cleanMatch(s)}`;
}

function canonicalKeyFromParts(parts: {
  upc?: string | null;
  productUrl?: string | null;
  lookupKey?: string | null;
  searchQuery?: string | null;
}): string {
  const upc = normalizeUpc(parts.upc);
  if (upc) return `upc:${upc}`;
  const url = (parts.productUrl ?? "").trim();
  if (url) return `url:${url}`;
  const lk = (parts.lookupKey ?? "").trim();
  if (lk) return lk.startsWith("upc:") || lk.startsWith("q:") || lk.startsWith("url:") ? lk : `q:${cleanMatch(lk)}`;
  const q = (parts.searchQuery ?? "").trim();
  if (q) return lookupKeyForInput(q);
  return "";
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

function parseMoney(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? String(n) : null;
}

function parseDate(v: string | undefined): Date {
  const s = (v ?? "").trim();
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

type MarketRecord = {
  canonicalKey: string;
  upc: string | null;
  title: string;
  searchQuery: string | null;
  supplierYear: string | null;
  highBuy: string | null;
  lowSell: string | null;
  productUrl: string | null;
  listingUrl: string | null;
  source: string;
  matchScore: number | null;
  scrapedAt: Date;
};

function rowFromSearchCache(r: CsvRow, source: string): MarketRecord | null {
  const status = (r.search_status ?? "").trim();
  if (status !== "ok" && status !== "no_prices") return null;

  const title = (r.supplier_title ?? "").trim();
  if (!title) return null;

  const canonicalKey =
    (r.canonical_key ?? "").trim() ||
    canonicalKeyFromParts({
      upc: r.supplier_upc,
      productUrl: r.product_url,
      lookupKey: r.lookup_key,
      searchQuery: r.search_query,
    });
  if (!canonicalKey) return null;

  const scoreRaw = (r.search_match_score ?? "").trim();
  const matchScore = scoreRaw ? Number(scoreRaw) : null;

  return {
    canonicalKey,
    upc: normalizeUpc(r.supplier_upc),
    title,
    searchQuery: (r.search_query ?? r.input_raw ?? "").trim() || null,
    supplierYear: (r.supplier_year ?? "").trim() || null,
    highBuy: parseMoney(r.supplier_high_buy),
    lowSell: parseMoney(r.supplier_low_sell),
    productUrl: (r.product_url ?? "").trim() || null,
    listingUrl: (r.listing_url ?? "").trim() || null,
    source,
    matchScore: matchScore != null && Number.isFinite(matchScore) ? matchScore : null,
    scrapedAt: parseDate(r.scraped_at),
  };
}

function rowFromSupplierDaily(r: CsvRow): MarketRecord | null {
  const title = (r.title ?? "").trim();
  if (!title) return null;
  const upc = normalizeUpc(r.upc);
  const productUrl = (r.product_url ?? "").trim() || null;
  const canonicalKey = canonicalKeyFromParts({ upc, productUrl, searchQuery: title });
  if (!canonicalKey) return null;

  return {
    canonicalKey,
    upc,
    title,
    searchQuery: title,
    supplierYear: null,
    highBuy: parseMoney(r.supplier_high_buy),
    lowSell: parseMoney(r.supplier_low_sell),
    productUrl,
    listingUrl: productUrl?.replace("priceguide.php", "listing.php") ?? null,
    source: "daily_scrape",
    matchScore: null,
    scrapedAt: parseDate(r.scraped_at),
  };
}

async function loadCsv(filePath: string): Promise<CsvRow[]> {
  if (!existsSync(filePath)) {
    console.warn(`[import-market-catalog] skip missing ${filePath}`);
    return [];
  }
  const text = await readFile(filePath, "utf8");
  const rows = parseCsv(text);
  console.log(`[import-market-catalog] ${path.basename(filePath)}: ${rows.length} row(s)`);
  return rows;
}

async function main() {
  const importDir =
    process.env.MARKET_IMPORT_DIR ??
    path.resolve(process.cwd(), "../shoelessjoes-supplier-py/out");

  const files: Array<{ path: string; source: string; kind: "search" | "daily" }> = [
    { path: path.join(importDir, "market_resolve_cache.csv"), source: "search", kind: "search" },
    { path: path.join(importDir, "parsed_boxes_search_cache.csv"), source: "search", kind: "search" },
    { path: path.join(importDir, "supplier_daily.csv"), source: "daily_scrape", kind: "daily" },
  ];

  const byKey = new Map<string, MarketRecord>();

  for (const f of files) {
    const rows = await loadCsv(f.path);
    for (const r of rows) {
      const rec =
        f.kind === "daily" ? rowFromSupplierDaily(r) : rowFromSearchCache(r, f.source);
      if (!rec) continue;
      const prev = byKey.get(rec.canonicalKey);
      if (!prev || rec.scrapedAt >= prev.scrapedAt) {
        byKey.set(rec.canonicalKey, rec);
      }
    }
  }

  if (!byKey.size) {
    console.warn("[import-market-catalog] no records to import");
    await prisma.$disconnect();
    return;
  }

  let upserts = 0;
  for (const rec of byKey.values()) {
    await prisma.dealernetMarketProduct.upsert({
      where: { canonicalKey: rec.canonicalKey },
      create: {
        canonicalKey: rec.canonicalKey,
        upc: rec.upc,
        title: rec.title,
        searchQuery: rec.searchQuery,
        supplierYear: rec.supplierYear,
        highBuy: rec.highBuy,
        lowSell: rec.lowSell,
        productUrl: rec.productUrl,
        listingUrl: rec.listingUrl,
        source: rec.source,
        matchScore: rec.matchScore,
        scrapedAt: rec.scrapedAt,
      },
      update: {
        upc: rec.upc,
        title: rec.title,
        searchQuery: rec.searchQuery,
        supplierYear: rec.supplierYear,
        highBuy: rec.highBuy,
        lowSell: rec.lowSell,
        productUrl: rec.productUrl,
        listingUrl: rec.listingUrl,
        source: rec.source,
        matchScore: rec.matchScore,
        scrapedAt: rec.scrapedAt,
      },
    });
    upserts++;
  }

  console.log(`[import-market-catalog] upserted ${upserts} DealernetMarketProduct row(s)`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[import-market-catalog] failed:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
