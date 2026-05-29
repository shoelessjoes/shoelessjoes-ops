import { prisma } from "@dealernet-ops/db";
import { optionalEnv, requireEnv } from "./env.js";

export async function getOrCreateShopFromEnv() {
  const domain = requireEnv("SHOPIFY_SHOP_DOMAIN");
  const token = optionalEnv("SHOPIFY_ACCESS_TOKEN");
  if (token) {
    return prisma.shop.upsert({
      where: { shopifyDomain: domain },
      create: { shopifyDomain: domain, accessToken: token },
      update: { accessToken: token },
    });
  }
  const existing = await prisma.shop.findUnique({ where: { shopifyDomain: domain } });
  if (!existing) {
    throw new Error(
      "Shop not found in database and SHOPIFY_ACCESS_TOKEN is not set. Install the embedded app once (OAuth) or set SHOPIFY_ACCESS_TOKEN for the worker.",
    );
  }
  return existing;
}
