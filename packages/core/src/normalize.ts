export function normalizeUpc(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length ? digits : null;
}

/** DealerNet sometimes packs multiple UPCs in one cell (newline-separated). */
export function normalizeUpcCandidates(value: string | null | undefined): string[] {
  if (!value) return [];
  const raw = String(value).trim();
  if (!raw) return [];

  const parts = raw.split(/[\r\n,;|/]+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts.length ? parts : [raw]) {
    const n = normalizeUpc(part);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
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
