export function normalizeUpc(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length ? digits : null;
}

export function normalizeDealernetTitle(title: string): string {
  let v = String(title || "")
    .trim()
    .toLowerCase();
  const tilde = v.indexOf("~");
  if (tilde >= 0) {
    v = v.slice(0, tilde).trim();
  }
  return v.replace(/\s+/g, " ");
}
