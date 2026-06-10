import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load worker .env whether npm cwd is repo root or apps/worker. */
function loadWorkerEnv(): void {
  const candidates = [
    join(__dirname, "..", ".env"),
    join(__dirname, "..", "..", "..", "apps", "worker", ".env"),
    join(process.cwd(), "apps", "worker", ".env"),
    join(process.cwd(), ".env"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      // Worker .env should win over stale shell/session vars (e.g. BOOTSTRAP=1 left exported).
      config({ path, override: true });
      return;
    }
  }
}

loadWorkerEnv();

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(
      `Missing required env: ${name}. Add it to apps/worker/.env (copy from apps/worker/.env.example).`,
    );
  }
  return v.trim();
}

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v?.trim() || undefined;
}
