import { extract, token_set_ratio } from "fuzzball";
import { normalizeDealernetTitle, normalizeUpc, normalizeUpcCandidates } from "./normalize.js";

export type VariantIndexEntry = {
  variantId: string;
  productTitle: string;
  barcode: string | null;
};

export type MatchResult = {
  variantId: string | null;
  score: number | null;
  method: "barcode" | "title_exact" | "title_fuzzy" | "override" | "none";
};

export function matchOfferLineToVariant(
  line: { title: string; upc: string | null },
  index: VariantIndexEntry[],
  overrides: Map<string, string>,
): MatchResult {
  const upcCandidates = normalizeUpcCandidates(line.upc);
  if (!upcCandidates.length && line.upc) {
    const single = normalizeUpc(line.upc);
    if (single) upcCandidates.push(single);
  }
  for (const upc of upcCandidates) {
    const o = overrides.get(`upc:${upc}`);
    if (o) return { variantId: o, score: null, method: "override" };
    const byBarcode = index.find((e) => normalizeUpc(e.barcode) === upc);
    if (byBarcode) return { variantId: byBarcode.variantId, score: null, method: "barcode" };
  }

  const normTitle = normalizeDealernetTitle(line.title);
  if (!normTitle) return { variantId: null, score: null, method: "none" };
  const oTitle = overrides.get(`title:${normTitle}`);
  if (oTitle) return { variantId: oTitle, score: null, method: "override" };

  const titleKey = normTitle;
  const exact = index.find((e) => normalizeDealernetTitle(e.productTitle) === titleKey);
  if (exact) return { variantId: exact.variantId, score: 100, method: "title_exact" };

  const choices = index.map((e) => normalizeDealernetTitle(e.productTitle)).filter(Boolean);
  if (!choices.length) return { variantId: null, score: null, method: "none" };

  const best = extract(titleKey, choices, { scorer: token_set_ratio, returnObjects: true })[0];
  if (best && best.score >= 96) {
    const matched = index.find((e) => normalizeDealernetTitle(e.productTitle) === best.choice);
    if (matched) return { variantId: matched.variantId, score: best.score, method: "title_fuzzy" };
  }

  return { variantId: null, score: best?.score ?? null, method: "none" };
}
