export type PriceAction =
  | "lower_price"
  | "raise_price"
  | "hold"
  | "restock_opportunity"
  | "margin_risk"
  | "review";

export type PriceInputs = {
  shopifyPrice: number | null;
  shopifyCost: number | null;
  inventoryQty: number | null;
  highBuy: number | null;
  lowSell: number | null;
  sold30d: number | null;
};

export type PriceRecommendation = {
  action: PriceAction;
  suggestedPrice: number | null;
  rationale: string;
};

export function recommendPriceAction(input: PriceInputs): PriceRecommendation {
  const { shopifyPrice, shopifyCost, inventoryQty, highBuy, lowSell, sold30d } = input;
  const sold30 = sold30d ?? 0;

  if (shopifyPrice == null || Number.isNaN(shopifyPrice)) {
    return { action: "review", suggestedPrice: null, rationale: "Missing Shopify price" };
  }

  if (highBuy == null && lowSell == null) {
    return { action: "review", suggestedPrice: shopifyPrice, rationale: "No market bid/ask data" };
  }

  if (
    lowSell != null &&
    shopifyPrice > 0 &&
    sold30 >= 3 &&
    lowSell <= shopifyPrice * 0.85
  ) {
    const upsidePct = ((shopifyPrice - lowSell) / shopifyPrice) * 100;
    return {
      action: "restock_opportunity",
      suggestedPrice: round2(shopifyPrice),
      rationale: `Selling well (${sold30} sold/30d) and low ask is ${upsidePct.toFixed(1)}% under current price.`,
    };
  }

  if (highBuy == null) {
    return {
      action: "review",
      suggestedPrice: round2(shopifyPrice),
      rationale: "Missing Dealernet high bid; unable to price against bid.",
    };
  }

  const gapPct = shopifyPrice > 0 ? (highBuy - shopifyPrice) / shopifyPrice : 0;
  const suggested = round2(Math.max(highBuy, 0));

  let action: PriceAction = "hold";
  let rationale = "Dealernet high bid is near current price; hold.";

  if (gapPct <= -0.03) {
    action = "lower_price";
    rationale = `Dealernet high bid ($${highBuy.toFixed(2)}) is below current price ($${shopifyPrice.toFixed(2)}).`;
    if (sold30 <= 1 && (inventoryQty ?? 0) > 0) {
      rationale = `Slow mover (${sold30} sold/30d). ${rationale}`;
    }
  } else if (gapPct >= 0.03) {
    action = "raise_price";
    rationale = `Dealernet high bid ($${highBuy.toFixed(2)}) is above current price ($${shopifyPrice.toFixed(2)}).`;
  } else {
    if (sold30 <= 1 && (inventoryQty ?? 0) > 0) {
      rationale = `Slow mover (${sold30} sold/30d), but bid is near current price; hold.`;
    }
  }

  if (shopifyCost != null && shopifyPrice <= shopifyCost) {
    action = "margin_risk";
    rationale = "Shopify price is at/below cost.";
  }

  return { action, suggestedPrice: suggested, rationale };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
