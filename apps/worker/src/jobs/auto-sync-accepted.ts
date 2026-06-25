import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BIN = process.platform === "win32" ? "npm.cmd" : "npm";

async function runMode(mode: "purchase" | "sale"): Promise<void> {
  const args = ["run", "job:sync-offers", "-w", "@dealernet-ops/worker", "--", mode];
  const env = { ...process.env, SYNC_AUTO_EXECUTE: "1" };

  const repoRoot = join(__dirname, "..", "..", "..", "..", "..");
  console.log(`[auto-sync] starting mode=${mode}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(BIN, args, { cwd: repoRoot, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`auto-sync mode=${mode} exited with code ${code}`));
    });
  });
  console.log(`[auto-sync] completed mode=${mode}`);
}

async function main() {
  await runMode("sale");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
