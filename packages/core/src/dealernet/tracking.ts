const TRACKING_RE = /tracking\s*(?:number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{6,})/i;

/** Extract a carrier tracking number from DealerNet message body text. */
export function parseTrackingFromText(text: string): string | null {
  const m = TRACKING_RE.exec(String(text || ""));
  return m ? m[1].trim() : null;
}

/** Resolve the offer id to attach tracking to (reference id wins for chat threads). */
export function resolveTrackingOfferId(meta: {
  referenceOfferId?: string | null;
  offerId?: string | null;
}): string | null {
  const ref = (meta.referenceOfferId || "").trim();
  if (ref) return ref;
  const oid = (meta.offerId || "").trim();
  return oid || null;
}
