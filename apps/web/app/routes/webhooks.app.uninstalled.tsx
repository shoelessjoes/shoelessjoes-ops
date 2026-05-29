import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Webhook ${topic} for ${shop}`);
  await prisma.shop.deleteMany({ where: { shopifyDomain: shop } }).catch(() => undefined);
  return new Response();
};
