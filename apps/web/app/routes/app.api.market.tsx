import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

function cleanMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUpc(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

function lookupKeyForInput(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const upc = normalizeUpc(s);
  if (upc) return `upc:${upc}`;
  return `q:${cleanMatch(s)}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const upc = url.searchParams.get("upc");
  const q = url.searchParams.get("q");
  const lines = url.searchParams.get("lines");

  if (lines) {
    const inputs = lines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const results = [];
    for (const input of inputs) {
      const key = lookupKeyForInput(input);
      const row =
        (await prisma.dealernetMarketProduct.findUnique({ where: { canonicalKey: key } })) ??
        (normalizeUpc(input)
          ? await prisma.dealernetMarketProduct.findFirst({ where: { upc: normalizeUpc(input)! } })
          : null) ??
        (await prisma.dealernetMarketProduct.findFirst({
          where: { title: { contains: input, mode: "insensitive" } },
          orderBy: { scrapedAt: "desc" },
        }));
      results.push({ input, lookupKey: key, found: row });
    }
    return json({ results });
  }

  if (upc) {
    const normalized = normalizeUpc(upc);
    const row =
      (normalized
        ? await prisma.dealernetMarketProduct.findFirst({ where: { upc: normalized } })
        : null) ??
      (normalized
        ? await prisma.dealernetMarketProduct.findUnique({ where: { canonicalKey: `upc:${normalized}` } })
        : null);
    return json({ row });
  }

  if (q) {
    const key = lookupKeyForInput(q);
    const row =
      (await prisma.dealernetMarketProduct.findUnique({ where: { canonicalKey: key } })) ??
      (await prisma.dealernetMarketProduct.findFirst({
        where: {
          OR: [
            { searchQuery: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { scrapedAt: "desc" },
      }));
    return json({ row, lookupKey: key });
  }

  return json({ error: "Provide ?upc=, ?q=, or ?lines= (newline-separated)" }, { status: 400 });
};
