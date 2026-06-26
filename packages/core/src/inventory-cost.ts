/** Blend incoming unit cost with existing on-hand cost (Shopify stores one cost per variant). */
export function computeWeightedAverageUnitCost(opts: {
  onHand: number;
  currentCost: number | null | undefined;
  receiveQty: number;
  receiveCost: number;
}): number {
  const { onHand, receiveQty, receiveCost } = opts;
  const currentCost = opts.currentCost ?? null;

  if (receiveQty <= 0) {
    return currentCost != null && currentCost > 0 ? currentCost : receiveCost;
  }
  if (onHand <= 0 || currentCost == null || currentCost <= 0) {
    return receiveCost;
  }
  const blended = (onHand * currentCost + receiveQty * receiveCost) / (onHand + receiveQty);
  return Math.round(blended * 100) / 100;
}
