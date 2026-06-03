import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ZhongdaVendingConfig } from "@dealernet-ops/core";
import { optionalEnv, requireEnv } from "./env.js";

type ZhongdaJsonConfig = {
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelectors: string[];
  successUrlExcludes?: string[];
  successSelectors?: string[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "..", "..", "configs", "zhongda.vending.json");

export function loadZhongdaConfig(): ZhongdaVendingConfig {
  const raw = readFileSync(CONFIG_PATH, "utf8");
  const file = JSON.parse(raw) as ZhongdaJsonConfig;

  return {
    loginUrl: file.loginUrl,
    usernameSelector: file.usernameSelector,
    passwordSelector: file.passwordSelector,
    submitSelectors: file.submitSelectors,
    successUrlExcludes: file.successUrlExcludes,
    successSelectors: file.successSelectors,
    username: requireEnv("ZHONGDA_USERNAME"),
    password: requireEnv("ZHONGDA_PASSWORD"),
    slowMoMs: Number(optionalEnv("ZHONGDA_SLOW_MO_MS") ?? "150"),
    navigationTimeoutMs: Number(optionalEnv("ZHONGDA_NAV_TIMEOUT_MS") ?? "60000"),
    selectorTimeoutMs: Number(optionalEnv("ZHONGDA_SELECTOR_TIMEOUT_MS") ?? "30000"),
  };
}
