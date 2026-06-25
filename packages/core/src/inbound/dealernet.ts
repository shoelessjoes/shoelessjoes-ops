import { normalizeUpc, normalizeDealernetTitle } from "../normalize.js";

export type InboundDirection = "inbound" | "outbound";

export function dealernetOfferFilterDirection(
  offerFilter: string,
): InboundDirection | null {
  if (offerFilter === "PURCHASESUNRATED") return "inbound";
  if (offerFilter === "SALESUNRATED") return "outbound";
  return null;
}

export function dealernetLineCanonicalKey(input: {
  offerId: string;
  offerFilter: string;
  upc: string | null | undefined;
  title: string;
  qty: number;
}): string {
  const upcPart = normalizeUpc(input.upc) ?? normalizeDealernetTitle(input.title).replace(/\s+/g, "-");
  return `dealernet:${input.offerId}:${input.offerFilter}:${upcPart}:${input.qty}`;
}

export function inboundStageFromTracking(tracking: string | null | undefined): string {
  const t = String(tracking || "").trim();
  return t ? "in_transit" : "ordered";
}

/** Preserve receive progress when re-syncing from Dealernet. */
export function mergeInboundStage(
  currentStage: string,
  qtyReceived: number,
  qtyOrdered: number,
  nextStage: string,
): string {
  if (currentStage === "cancelled") return "cancelled";
  if (qtyReceived >= qtyOrdered && qtyOrdered > 0) return "received";
  if (currentStage === "received") return "received";
  if (currentStage === "in_transit" && nextStage === "ordered") return "in_transit";
  return nextStage;
}
