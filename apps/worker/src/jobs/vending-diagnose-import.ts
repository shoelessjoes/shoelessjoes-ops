import { diagnoseZhongdaSession } from "@dealernet-ops/core";
import { loadZhongdaConfig } from "../zhongda-config.js";

function parseArgs() {
  const headed = process.argv.includes("--headed");
  const observeIdx = process.argv.indexOf("--observe-ms");
  const observeMs = observeIdx >= 0 ? Number(process.argv[observeIdx + 1] ?? "120000") : headed ? 120_000 : 0;
  return { headed, observeMs };
}

async function main() {
  const { headed, observeMs } = parseArgs();
  const config = loadZhongdaConfig();

  if (!headed) {
    console.warn(
      "[vending-diagnose-import] Tip: use --headed --observe-ms 180000 to log in, open Product Import, and upload CSV while API traffic is captured.",
    );
  }

  const { login, networkLogPath } = await diagnoseZhongdaSession({
    config,
    headed,
    observeMs,
  });

  console.log("[vending-diagnose-import] Login result:");
  console.log(JSON.stringify(login, null, 2));
  console.log(`[vending-diagnose-import] Network log: ${networkLogPath}`);
  console.log(
    "Look for failed responses (4xx/5xx), empty bodies, or import/upload URLs when CSV fails.",
  );

  if (!login.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
