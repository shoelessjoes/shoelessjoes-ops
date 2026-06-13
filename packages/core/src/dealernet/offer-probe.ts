import { chromium, type Page } from "playwright";
import type { DealernetLoginConfig } from "./types.js";
import { dealernetLogin } from "./login.js";

const BASE = "https://www.dealernetx.com/";
const OFFER_ID_RE = /offerid=(\d+)/i;

export type OfferProbeTable = {
  caption: string;
  headers: string[];
  rowCount: number;
  sampleRows: string[][];
};

export type OfferProbeTab = {
  label: string;
  href: string;
  active: boolean;
};

export type OfferProbeButton = {
  text: string;
  tag: string;
  type: string;
  name: string;
  id: string;
  classes: string;
  visible: boolean;
};

export type OfferProbeField = {
  label: string;
  value: string;
};

export type OfferProbeResult = {
  offerId: string;
  url: string;
  capturedAt: string;
  pageTitle: string;
  statusBadge: string | null;
  statusText: string | null;
  tabs: OfferProbeTab[];
  buttons: OfferProbeButton[];
  tables: OfferProbeTable[];
  tracking: string | null;
  fields: OfferProbeField[];
  lineItems: Array<{
    title: string;
    upc: string;
    qty: string;
    unitPrice: string;
    subtotal: string;
    productHref: string;
  }>;
};

export type HomeQueueProbe = {
  capturedAt: string;
  url: string;
  purchaseLinks: Array<{ text: string; href: string }>;
  salesLinks: Array<{ text: string; href: string }>;
  pendingSnippets: string[];
};

/** Known Dealernet offers.php?offerfilter= values (see docs/DEALERNET_OFFER_PAGE.md). */
export const DEALERNET_OFFER_FILTERS = [
  "PURCHASESUNRATED",
  "SALESUNRATED",
  "PENDINGIN",
  "PENDINGOUT",
  "PURCHASES",
  "PURCHASESALL",
  "SALES",
  "SALESALL",
] as const;

export type DealernetOfferFilter = (typeof DEALERNET_OFFER_FILTERS)[number];

export type OfferListRow = {
  offerId: string;
  dealer: string;
  status: string;
  created: string;
  total: string;
  offerDetailUrl: string;
  offerFilter: string;
};

export type OfferListProbeResult = {
  offerFilter: string;
  url: string;
  capturedAt: string;
  rowCount: number;
  rows: OfferListRow[];
};

function parseOfferFilter(input: string): string {
  const fromUrl = /offerfilter=([A-Z0-9_]+)/i.exec(input);
  if (fromUrl) return fromUrl[1].toUpperCase();
  return input.trim().toUpperCase();
}

async function scrapeOfferListPage(page: Page, offerFilter: string): Promise<OfferListRow[]> {
  const rows: OfferListRow[] = [];
  await page.waitForSelector("tr.offer-row", { timeout: 15000 }).catch(() => null);
  const offerRows = page.locator("tr.offer-row");
  const offerCount = await offerRows.count();

  for (let i = 0; i < offerCount; i++) {
    const offer = offerRows.nth(i);
    const offerId = ((await offer.locator("span.oid-number").first().innerText()) || "").trim();
    if (!offerId) continue;
    const dealer = ((await offer.locator("td[data-label='Dealer']").first().innerText()) || "").trim();
    const created = ((await offer.locator("td[data-label='Created']").first().innerText()) || "").trim();
    const offerTotalText =
      ((await offer.locator("td[data-label='Total'] .amount").first().innerText()) || "").trim();
    const status = (
      (await offer.locator("td[data-label='Status'] .status-badge").first().innerText()) || ""
    ).trim();
    const offerHref =
      (await offer.locator("td[data-label='Dealer'] a.dealer-link").first().getAttribute("href")) || "";
    const offerDetailUrl = offerHref ? new URL(offerHref, BASE).toString() : offerUrlFor(offerId);

    rows.push({
      offerId,
      dealer,
      status,
      created,
      total: offerTotalText,
      offerDetailUrl,
      offerFilter,
    });
  }
  return rows;
}

export async function probeDealernetOfferList(opts: {
  login: DealernetLoginConfig;
  offerFilter: string;
  headed?: boolean;
  maxDetailProbes?: number;
  probeHome?: boolean;
  pauseMs?: number;
}): Promise<{
  list: OfferListProbeResult;
  offers: OfferProbeResult[];
  home: HomeQueueProbe | null;
}> {
  const offerFilter = parseOfferFilter(opts.offerFilter);
  const browser = await chromium.launch({
    headless: !opts.headed,
    slowMo: opts.login.slowMoMs ?? 150,
  });
  const page = await browser.newPage();
  const maxDetail = opts.maxDetailProbes ?? 0;

  try {
    await dealernetLogin(page, opts.login);

    let home: HomeQueueProbe | null = null;
    if (opts.probeHome) {
      await page.goto(`${BASE}home.php`);
      await page.waitForTimeout(opts.login.slowMoMs ?? 300);
      home = await scrapeHomeQueues(page);
    }

    const listUrl = `${BASE}offers.php?offerfilter=${encodeURIComponent(offerFilter)}`;
    await page.goto(listUrl);
    await page.waitForTimeout(opts.login.slowMoMs ?? 300);
    const listRows = await scrapeOfferListPage(page, offerFilter);
    const list: OfferListProbeResult = {
      offerFilter,
      url: page.url(),
      capturedAt: new Date().toISOString(),
      rowCount: listRows.length,
      rows: listRows,
    };

    const offers: OfferProbeResult[] = [];
    const detailIds = listRows.slice(0, maxDetail).map((r) => r.offerId);
    for (const offerId of detailIds) {
      const url = listRows.find((r) => r.offerId === offerId)?.offerDetailUrl ?? offerUrlFor(offerId);
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(opts.login.slowMoMs ?? 300);

      let scraped = await scrapeOfferPage(page);
      const itemsTab = page.locator("button.tablinks", { hasText: "Items" }).first();
      if ((await itemsTab.count()) > 0) {
        await itemsTab.click();
        await page.waitForTimeout(opts.login.slowMoMs ?? 300);
        const itemsScrape = await scrapeOfferPage(page);
        scraped = {
          ...scraped,
          lineItems: itemsScrape.lineItems.length ? itemsScrape.lineItems : scraped.lineItems,
          tables: itemsScrape.tables.length > scraped.tables.length ? itemsScrape.tables : scraped.tables,
        };
      }

      offers.push({
        offerId,
        url: page.url(),
        capturedAt: new Date().toISOString(),
        ...scraped,
      });
    }

    return { list, offers, home };
  } finally {
    await browser.close();
  }
}

function offerUrlFor(id: string): string {
  return `${BASE}offer.php?offerid=${encodeURIComponent(id)}`;
}

function parseOfferId(input: string): string {
  const m = OFFER_ID_RE.exec(input);
  if (m) return m[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  throw new Error(`Could not parse offer id from: ${input}`);
}

async function scrapeOfferPage(page: Page): Promise<Omit<OfferProbeResult, "offerId" | "url" | "capturedAt">> {
  const statusBadge =
    (
      (await page.locator(".status-badge").first().innerText().catch(() => "")) ||
      (await page.locator("td[data-label='Status'] .status-badge").first().innerText().catch(() => "")) ||
      ""
    ).trim() || null;

  const statusText =
    (
      (await page.locator("#offerdata .status, .offer-status").first().innerText().catch(() => "")) || ""
    ).trim() || null;

  const dom = await page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();

    const tabs: OfferProbeTab[] = [];
    for (const el of document.querySelectorAll("button.tablinks, .tablinks")) {
      const label = clean(el.textContent);
      if (!label) continue;
      const active = el.classList.contains("active");
      tabs.push({ label, href: "", active });
    }
    const tabCandidates = document.querySelectorAll(
      "main nav a, main .nav a, main ul.nav-tabs a, main .nav-link",
    );
    for (const el of tabCandidates) {
      const label = clean(el.textContent);
      const href = (el as HTMLAnchorElement).href || el.getAttribute("href") || "";
      if (!label) continue;
      const active =
        el.classList.contains("active") ||
        el.getAttribute("aria-current") === "page" ||
        el.closest(".active") != null;
      tabs.push({ label, href, active });
    }

    const buttons: OfferProbeButton[] = [];
    for (const el of document.querySelectorAll("main button, main input[type='submit'], main input[type='button']")) {
      const tag = el.tagName.toLowerCase();
      const input = el as HTMLInputElement;
      const btn = el as HTMLButtonElement;
      const text = clean(tag === "input" ? input.value : btn.innerText);
      if (!text && tag !== "input") continue;
      const style = window.getComputedStyle(el);
      buttons.push({
        text: text || `[${tag}]`,
        tag,
        type: input.type || "",
        name: input.name || btn.getAttribute("name") || "",
        id: el.id || "",
        classes: el.className || "",
        visible: style.display !== "none" && style.visibility !== "hidden",
      });
    }

    const tables: OfferProbeTable[] = [];
    for (const table of document.querySelectorAll("main table, #offerdata table")) {
      const caption = clean(table.querySelector("caption")?.textContent);
      let headers = Array.from(table.querySelectorAll("thead th")).map((th) => clean(th.textContent));
      if (!headers.length) {
        headers = Array.from(table.querySelectorAll("tr th")).map((th) => clean(th.textContent));
      }
      const bodyRows = table.querySelectorAll("tbody tr");
      const sampleRows: string[][] = [];
      for (let i = 0; i < Math.min(bodyRows.length, 5); i++) {
        const cells = Array.from(bodyRows[i].querySelectorAll("td")).map((td) => clean(td.textContent));
        if (cells.some(Boolean)) sampleRows.push(cells);
      }
      if (headers.length || sampleRows.length) {
        tables.push({
          caption,
          headers,
          rowCount: bodyRows.length,
          sampleRows,
        });
      }
    }

    const fields: OfferProbeField[] = [];
    for (const row of document.querySelectorAll("#offerdata tr, main table tr")) {
      const cells = row.querySelectorAll("th, td");
      if (cells.length === 2) {
        const label = clean(cells[0].textContent);
        const value = clean(cells[1].textContent);
        if (label && value && label.length < 80) fields.push({ label, value });
      }
    }

    const lineItems: OfferProbeResult["lineItems"] = [];
    for (const row of document.querySelectorAll("tr.item-row, #offerdata tr")) {
      const product = row.querySelector("td[data-label='Product'] .product-link, .product-link");
      if (!product) continue;
      const title = clean(product.textContent);
      const productHref = (product as HTMLAnchorElement).href || product.getAttribute("href") || "";
      const cell = (label: string) =>
        clean(row.querySelector(`td[data-label='${label}']`)?.textContent);
      lineItems.push({
        title,
        upc: cell("UPC"),
        qty: cell("Qty"),
        unitPrice: cell("Unit Price"),
        subtotal: cell("Subtotal"),
        productHref,
      });
    }

    let tracking: string | null = null;
    for (const a of document.querySelectorAll("td a, #offerdata a")) {
      const row = a.closest("tr");
      const label = clean(row?.querySelector("td:first-child, th")?.textContent);
      if (label && /tracking/i.test(label)) {
        tracking = clean(a.textContent) || clean(row?.textContent);
        break;
      }
    }
    if (!tracking) {
      for (const row of document.querySelectorAll("#offerdata tr, main table tr")) {
        const cells = row.querySelectorAll("th, td");
        if (cells.length !== 2) continue;
        const label = clean(cells[0].textContent);
        const value = clean(cells[1].textContent);
        if (label === "Shipping" && value) {
          const m = /Tracking:\s*(\S+)/i.exec(value);
          tracking = m ? m[1] : value;
          break;
        }
      }
    }

    return {
      pageTitle: document.title,
      statusBadge: null,
      statusText: null,
      tabs,
      buttons,
      tables,
      tracking,
      fields: fields.slice(0, 40),
      lineItems: lineItems.slice(0, 20),
    };
  });

  return {
    pageTitle: dom.pageTitle,
    statusBadge,
    statusText,
    tabs: dom.tabs,
    buttons: dom.buttons,
    tables: dom.tables,
    tracking: dom.tracking,
    fields: dom.fields,
    lineItems: dom.lineItems,
  };
}

async function scrapeHomeQueues(page: Page): Promise<HomeQueueProbe> {
  const url = page.url();
  const capturedAt = new Date().toISOString();

  const data = await page.evaluate(() => {
    const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();
    const purchaseLinks: Array<{ text: string; href: string }> = [];
    const salesLinks: Array<{ text: string; href: string }> = [];

    for (const a of document.querySelectorAll("a[href*='offers.php'], a[href*='offerfilter=']")) {
      const href = (a as HTMLAnchorElement).href || a.getAttribute("href") || "";
      const text = clean(a.textContent);
      if (!text) continue;
      const lower = `${text} ${href}`.toLowerCase();
      if (lower.includes("purchase")) purchaseLinks.push({ text, href });
      if (lower.includes("sale")) salesLinks.push({ text, href });
    }

    const body = clean(document.body.innerText);
    const pendingSnippets: string[] = [];
    for (const line of body.split(/\n/)) {
      const t = clean(line);
      if (/pending\s*(in|out)/i.test(t) || (/purchase/i.test(t) && /\d/.test(t)) || (/sale/i.test(t) && /\d/.test(t))) {
        if (t.length < 120) pendingSnippets.push(t);
      }
    }

    return { purchaseLinks, salesLinks, pendingSnippets: [...new Set(pendingSnippets)].slice(0, 30) };
  });

  return { capturedAt, url, ...data };
}

export async function probeDealernetOfferPages(opts: {
  login: DealernetLoginConfig;
  offerIds: string[];
  headed?: boolean;
  pauseMs?: number;
  probeHome?: boolean;
}): Promise<{ offers: OfferProbeResult[]; home: HomeQueueProbe | null }> {
  const browser = await chromium.launch({
    headless: !opts.headed,
    slowMo: opts.login.slowMoMs ?? 150,
  });
  const page = await browser.newPage();
  const offers: OfferProbeResult[] = [];

  try {
    await dealernetLogin(page, opts.login);

    if (opts.probeHome) {
      await page.goto(`${BASE}home.php`);
      await page.waitForTimeout(opts.login.slowMoMs ?? 300);
    }

    let home: HomeQueueProbe | null = null;
    if (opts.probeHome) {
      home = await scrapeHomeQueues(page);
    }

    for (const raw of opts.offerIds) {
      const offerId = parseOfferId(raw);
      const url = raw.includes("offer.php") ? raw : offerUrlFor(offerId);
      await page.goto(url);
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(opts.login.slowMoMs ?? 300);

      let scraped = await scrapeOfferPage(page);

      const itemsTab = page.locator("button.tablinks", { hasText: "Items" }).first();
      if ((await itemsTab.count()) > 0) {
        await itemsTab.click();
        await page.waitForTimeout(opts.login.slowMoMs ?? 300);
        const itemsScrape = await scrapeOfferPage(page);
        scraped = {
          ...scraped,
          lineItems: itemsScrape.lineItems.length ? itemsScrape.lineItems : scraped.lineItems,
          tables: itemsScrape.tables.length > scraped.tables.length ? itemsScrape.tables : scraped.tables,
        };
      }

      offers.push({
        offerId,
        url: page.url(),
        capturedAt: new Date().toISOString(),
        ...scraped,
      });

      if (opts.headed && opts.pauseMs && opts.pauseMs > 0) {
        await page.waitForTimeout(opts.pauseMs);
      }
    }

    return { offers, home };
  } finally {
    await browser.close();
  }
}

export function parseOfferProbeArgs(argv: string[]): {
  offerIds: string[];
  offerFilters: string[];
  headed: boolean;
  pauseMs: number;
  probeHome: boolean;
  maxDetailProbes: number;
} {
  const offerIds: string[] = [];
  const offerFilters: string[] = [];
  let headed = false;
  let pauseMs = 0;
  let probeHome = false;
  let maxDetailProbes = 0;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--headed") headed = true;
    else if (a === "--home") probeHome = true;
    else if (a === "--pause") pauseMs = Number(argv[++i] ?? "30000");
    else if (a === "--offerid") offerIds.push(argv[++i] ?? "");
    else if (a === "--filter") offerFilters.push(parseOfferFilter(argv[++i] ?? ""));
    else if (a === "--max-details") maxDetailProbes = Number(argv[++i] ?? "3");
    else if (/offerfilter=/i.test(a)) offerFilters.push(parseOfferFilter(a));
    else if (/offerid=\d+/i.test(a) || /^\d{5,}$/.test(a)) offerIds.push(a);
    else if (a.startsWith("http") && /offer\.php/i.test(a)) offerIds.push(a);
    else if (a.startsWith("http") && /offers\.php/i.test(a)) offerFilters.push(parseOfferFilter(a));
  }

  return {
    offerIds: offerIds.filter(Boolean),
    offerFilters: offerFilters.filter(Boolean),
    headed,
    pauseMs,
    probeHome,
    maxDetailProbes,
  };
}
