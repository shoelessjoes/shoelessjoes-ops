import "dotenv/config";

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v?.trim() || undefined;
}
