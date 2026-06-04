import { extract, token_set_ratio } from "fuzzball";
import type { ZhongdaGoodsRow } from "./api-types.js";
import { normalizeDealernetTitle } from "../normalize.js";

export type ZhongdaMatchResult = {
  goods: ZhongdaGoodsRow;
  matchType: "exact_title" | "fuzzy_title";
  score: number;
};

function displayShopifyTitle(productTitle: string, variantTitle: string | null | undefined): string {
  const v = (variantTitle ?? "").trim();
  if (v && v.toLowerCase() !== "default title") {
    return `${productTitle} - ${v}`.trim();
  }
  return productTitle.trim();
}

/** Match a Shopify catalog row to a Zhongda goods row by normalized title. */
export function matchShopifyToZhongdaGoods(
  productTitle: string,
  variantTitle: string | null | undefined,
  goods: ZhongdaGoodsRow[],
  fuzzyThreshold = 88,
): ZhongdaMatchResult | null {
  const target = normalizeDealernetTitle(displayShopifyTitle(productTitle, variantTitle));
  if (!target) return null;

  const byNorm = new Map<string, ZhongdaGoodsRow>();
  for (const g of goods) {
    const norm = normalizeDealernetTitle(g.goods_name);
    if (norm && !byNorm.has(norm)) byNorm.set(norm, g);
  }

  const exact = byNorm.get(target);
  if (exact) {
    return { goods: exact, matchType: "exact_title", score: 100 };
  }

  const candidates = [...byNorm.keys()];
  if (!candidates.length) return null;

  const best = extract(target, candidates, { scorer: token_set_ratio, returnObjects: true })[0];
  if (!best || best.score < fuzzyThreshold) return null;
  const matched = byNorm.get(best.choice);
  if (!matched) return null;

  return { goods: matched, matchType: "fuzzy_title", score: best.score };
}

export function parseMoney(s: string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
