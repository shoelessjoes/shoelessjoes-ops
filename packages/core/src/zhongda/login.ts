import type { Page } from "playwright";
import type { ZhongdaVendingConfig } from "./types.js";

export async function zhongdaLogin(
  page: Page,
  cfg: ZhongdaVendingConfig,
): Promise<{ submitSelectorUsed: string }> {
  page.setDefaultNavigationTimeout(cfg.navigationTimeoutMs ?? 60000);
  page.setDefaultTimeout(cfg.selectorTimeoutMs ?? 30000);

  await page.goto(cfg.loginUrl);
  await page.waitForTimeout(300);

  await page.waitForSelector(cfg.usernameSelector, { timeout: 15000 });
  await page.fill(cfg.usernameSelector, cfg.username);
  await page.waitForTimeout(150);
  await page.fill(cfg.passwordSelector, cfg.password);
  await page.waitForTimeout(150);

  let submitSelectorUsed: string | null = null;
  for (const sel of cfg.submitSelectors) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) === 0) continue;
    try {
      await btn.click({ timeout: 5000 });
      submitSelectorUsed = sel;
      break;
    } catch {
      continue;
    }
  }

  if (!submitSelectorUsed) {
    throw new Error(
      `Could not click any login submit selector. Tried: ${cfg.submitSelectors.join(", ")}. ` +
        `Run probe with --headed and update configs/zhongda.vending.json submitSelectors.`,
    );
  }

  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(800);

  return { submitSelectorUsed };
}

export function zhongdaLoginLooksSuccessful(
  pageUrl: string,
  cfg: ZhongdaVendingConfig,
): boolean {
  const excludes = cfg.successUrlExcludes ?? ["#/login"];
  return !excludes.some((frag) => pageUrl.includes(frag));
}
