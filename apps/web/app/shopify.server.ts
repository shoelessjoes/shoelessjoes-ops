import "@shopify/shopify-app-remix/adapters/node";
import { ApiVersion, shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import { prisma } from "./db.server.js";

const sessionStorage = new PrismaSessionStorage(prisma);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.October24,
  scopes: (process.env.SCOPES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  appUrl: process.env.SHOPIFY_APP_URL!,
  sessionStorage,
});

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
