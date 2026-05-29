import type { Page } from "playwright";
import type { DealernetLoginConfig } from "./types.js";

export async function dealernetLogin(page: Page, cfg: DealernetLoginConfig): Promise<void> {
  page.setDefaultNavigationTimeout(cfg.navigationTimeoutMs ?? 60000);
  page.setDefaultTimeout(cfg.selectorTimeoutMs ?? 30000);
  await page.goto(cfg.loginUrl);
  await page.waitForTimeout(200);
  await page.fill(cfg.usernameSelector, cfg.username);
  await page.waitForTimeout(150);
  await page.fill(cfg.passwordSelector, cfg.password);
  await page.waitForTimeout(150);
  await page.click(cfg.submitSelector);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(500);
}
