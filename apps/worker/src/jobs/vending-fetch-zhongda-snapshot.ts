/**
 * Pull Zhongda catalog via REST only (no Postgres). Useful when DB env isn't set.
 * Writes data/zhongda-goods-snapshot.json
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fetchAllZhongdaGoods } from "@dealernet-ops/core";
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", "..", ".env");
if (existsSync(envPath)) config({ path: envPath });

const username = process.env.ZHONGDA_USERNAME?.trim();
const password = process.env.ZHONGDA_PASSWORD?.trim();
if (!username || !password) {
  console.error("Set ZHONGDA_USERNAME and ZHONGDA_PASSWORD in apps/worker/.env");
  process.exit(1);
}

const rows = await fetchAllZhongdaGoods({
  username,
  password,
  apiBaseUrl: process.env.ZHONGDA_API_BASE,
});

await mkdir("data", { recursive: true });
const out = "data/zhongda-goods-snapshot.json";
await writeFile(out, JSON.stringify({ fetchedAt: new Date().toISOString(), count: rows.length, rows }, null, 2));
console.log(`[vending-fetch-zhongda-snapshot] wrote ${rows.length} goods to ${out}`);
