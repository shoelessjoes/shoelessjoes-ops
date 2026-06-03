import { probeZhongdaLogin } from "@dealernet-ops/core";
import { loadZhongdaConfig } from "../zhongda-config.js";

function parseArgs() {
  const headed =
    process.argv.includes("--headed") ||
    process.env.ZHONGDA_HEADED === "1" ||
    process.env.ZHONGDA_HEADED === "true";
  return {
    headed,
    pauseMs: process.argv.includes("--pause")
      ? Number(process.argv[process.argv.indexOf("--pause") + 1] ?? "30000")
      : 0,
  };
}

async function main() {
  const { headed, pauseMs } = parseArgs();
  const config = loadZhongdaConfig();

  console.log("[vending-probe-login] Testing Zhongda Cloud login…");
  if (headed) console.log("[vending-probe-login] Headed mode — browser visible.");

  const result = await probeZhongdaLogin({
    config,
    headed,
    pauseMs: headed ? pauseMs : 0,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error(
      "[vending-probe-login] FAILED. If submit selectors are wrong, run with --headed, " +
        "inspect the login button, and add its selector to configs/zhongda.vending.json submitSelectors.",
    );
    process.exit(1);
  }

  console.log("[vending-probe-login] OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
