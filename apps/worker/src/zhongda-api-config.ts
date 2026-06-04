import type { ZhongdaApiConfig } from "@dealernet-ops/core";
import { requireEnv } from "./env.js";

export function loadZhongdaApiConfig(): ZhongdaApiConfig {
  return {
    apiBaseUrl: process.env.ZHONGDA_API_BASE ?? "https://us.zhongdacloud.com",
    username: requireEnv("ZHONGDA_USERNAME"),
    password: requireEnv("ZHONGDA_PASSWORD"),
  };
}
