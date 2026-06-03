import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import type { ZhongdaVendingConfig, ZhongdaProbeResult } from "./types.js";
import { zhongdaLogin, zhongdaLoginLooksSuccessful } from "./login.js";

export async function probeZhongdaLogin(opts: {
  config: ZhongdaVendingConfig;
  headed?: boolean;
  outDir?: string;
  pauseMs?: number;
}): Promise<ZhongdaProbeResult> {
  const outDir = opts.outDir ?? "data/vending-probes";
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = join(outDir, `login-${stamp}.png`);

  const browser = await chromium.launch({
    headless: !opts.headed,
    slowMo: opts.config.slowMoMs ?? 150,
  });

  try {
    const page = await browser.newPage();
    const { submitSelectorUsed } = await zhongdaLogin(page, opts.config);
    const finalUrl = page.url();
    const ok = zhongdaLoginLooksSuccessful(finalUrl, opts.config);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    if (opts.pauseMs && opts.pauseMs > 0) {
      await page.waitForTimeout(opts.pauseMs);
    }

    return {
      ok,
      finalUrl,
      submitSelectorUsed,
      screenshotPath,
      error: ok ? null : "Still on login route or login page after submit",
    };
  } catch (e) {
    return {
      ok: false,
      finalUrl: "",
      submitSelectorUsed: null,
      screenshotPath: null,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await browser.close();
  }
}

export async function diagnoseZhongdaSession(opts: {
  config: ZhongdaVendingConfig;
  headed?: boolean;
  outDir?: string;
  /** How long to keep browser open for manual CSV import attempt (headed only). */
  observeMs?: number;
}): Promise<{ login: ZhongdaProbeResult; networkLogPath: string }> {
  const outDir = opts.outDir ?? "data/vending-probes";
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const networkLogPath = join(outDir, `network-${stamp}.jsonl`);

  const entries: string[] = [];
  const logLine = (obj: object) => entries.push(JSON.stringify(obj));

  const browser = await chromium.launch({
    headless: !opts.headed,
    slowMo: opts.config.slowMoMs ?? 150,
  });

  let loginResult: ZhongdaProbeResult = {
    ok: false,
    finalUrl: "",
    submitSelectorUsed: null,
    screenshotPath: null,
    error: null,
  };

  try {
    const page = await browser.newPage();

    page.on("console", (msg) => {
      logLine({
        ts: new Date().toISOString(),
        kind: "console",
        type: msg.type(),
        text: msg.text(),
      });
    });

    page.on("request", (req) => {
      const url = req.url();
      if (!url.includes("zhongdacloud.com")) return;
      let post = req.postData();
      if (post && /auth\/login|password=/i.test(url + post)) {
        post = "[REDACTED credentials]";
      }
      logLine({
        ts: new Date().toISOString(),
        kind: "request",
        method: req.method(),
        url,
        resourceType: req.resourceType(),
        postDataPreview: post ? post.slice(0, 2000) : null,
      });
    });

    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("zhongdacloud.com")) return;
      let bodyPreview: string | null = null;
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("json") || ct.includes("text")) {
        try {
          bodyPreview = (await res.text()).slice(0, 1500);
        } catch {
          bodyPreview = null;
        }
      }
      logLine({
        ts: new Date().toISOString(),
        kind: "response",
        status: res.status(),
        url,
        bodyPreview,
      });
    });

    const { submitSelectorUsed } = await zhongdaLogin(page, opts.config);
    const finalUrl = page.url();
    const ok = zhongdaLoginLooksSuccessful(finalUrl, opts.config);
    const screenshotPath = join(outDir, `diagnose-${stamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    loginResult = {
      ok,
      finalUrl,
      submitSelectorUsed,
      screenshotPath,
      error: ok ? null : "Login may have failed",
    };

    if (opts.headed && (opts.observeMs ?? 0) > 0) {
      console.log(
        `[vending-diagnose] Logged in (ok=${ok}). Browser open ${opts.observeMs}ms — navigate to Product Import, try CSV, watch network log.`,
      );
      await page.waitForTimeout(opts.observeMs ?? 120_000);
      await page.screenshot({ path: join(outDir, `diagnose-after-${stamp}.png`), fullPage: true });
    }
  } catch (e) {
    loginResult.error = e instanceof Error ? e.message : String(e);
  } finally {
    await writeFile(networkLogPath, entries.join("\n") + (entries.length ? "\n" : ""));
    await browser.close();
  }

  return { login: loginResult, networkLogPath };
}
