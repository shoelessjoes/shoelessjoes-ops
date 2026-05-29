import { chromium } from "playwright";
import type { DealernetLoginConfig } from "./types.js";
import { dealernetLogin } from "./login.js";

const BASE = "https://www.dealernetx.com/";

export type DealernetOfferLineRow = {
  captured_at: string;
  offerfilter: string;
  offer_id: string;
  dealer: string;
  created_at: string;
  status: string;
  offer_total: string;
  offer_detail_url: string;
  tracking_number: string;
  title: string;
  upc: string;
  qty: string;
  unit_of_measure: string;
  unit_price: string;
  subtotal: string;
  per_box_unit_price: string;
  case_qty_boxes: string;
  listing_url: string;
};

function parseMoney(s: string): number | null {
  const t = String(s || "")
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const CASE_QTY_RE = /\((\d+)\s+boxes?\s+per\s+case\)/i;

export async function collectDealernetOffers(opts: {
  login: DealernetLoginConfig;
  offerFilter: "PURCHASESUNRATED" | "SALESUNRATED";
  fetchCaseQty?: boolean;
  fetchOfferTracking?: boolean;
}): Promise<DealernetOfferLineRow[]> {
  const { login, offerFilter } = opts;
  const fetchCaseQty = opts.fetchCaseQty ?? true;
  const fetchOfferTracking = opts.fetchOfferTracking ?? true;
  const now = new Date().toISOString();
  const rows: DealernetOfferLineRow[] = [];

  const browser = await chromium.launch({
    headless: true,
    slowMo: login.slowMoMs ?? 150,
  });
  const page = await browser.newPage();
  const listingCaseQtyCache = new Map<string, number | null>();
  const offerTrackingCache = new Map<string, string | null>();

  try {
    await dealernetLogin(page, login);
    const offersUrl = `${BASE}offers.php?offerfilter=${offerFilter}`;
    await page.goto(offersUrl);
    await page.waitForSelector("tr.offer-row");

    const offerRows = page.locator("tr.offer-row");
    const offerCount = await offerRows.count();
    for (let i = 0; i < offerCount; i++) {
      const offer = offerRows.nth(i);
      const offerId = ((await offer.locator("span.oid-number").first().innerText()) || "").trim();
      const dealer = ((await offer.locator("td[data-label='Dealer']").first().innerText()) || "").trim();
      const created = ((await offer.locator("td[data-label='Created']").first().innerText()) || "").trim();
      const offerTotalText = ((await offer.locator("td[data-label='Total'] .amount").first().innerText()) || "").trim();
      const offerTotal = parseMoney(offerTotalText);
      const status = (
        (await offer.locator("td[data-label='Status'] .status-badge").first().innerText()) || ""
      ).trim();
      const offerHref =
        (await offer.locator("td[data-label='Dealer'] a.dealer-link").first().getAttribute("href")) || "";
      const offerDetailUrl = offerHref ? new URL(offerHref, BASE).toString() : "";

      let trackingNumber = "";
      if (fetchOfferTracking && offerDetailUrl) {
        if (!offerTrackingCache.has(offerDetailUrl)) {
          const detail = await browser.newPage();
          try {
            await detail.goto(offerDetailUrl);
            const tr = await extractTracking(detail);
            offerTrackingCache.set(offerDetailUrl, tr);
          } catch {
            offerTrackingCache.set(offerDetailUrl, null);
          } finally {
            await detail.close();
          }
        }
        trackingNumber = offerTrackingCache.get(offerDetailUrl) || "";
      }

      const toggle = offer.locator(`button.oishow${offerId}`);
      if ((await toggle.count()) > 0) {
        try {
          await toggle.first().click();
        } catch {
          /* ignore */
        }
      }

      const itemRows = page.locator(`tr.offer-items-row.oidata${offerId} tr.item-row`);
      const itemCount = await itemRows.count();
      for (let j = 0; j < itemCount; j++) {
        const item = itemRows.nth(j);
        const title = (
          (await item.locator("td[data-label='Product'] .product-link").first().innerText()) || ""
        ).trim();
        const listingHref =
          (await item.locator("td[data-label='Product'] .product-link").first().getAttribute("href")) || "";
        const listingUrl = listingHref ? new URL(listingHref, BASE).toString() : "";
        const upc = ((await item.locator("td[data-label='UPC']").first().innerText()) || "").trim();
        const qtyText = ((await item.locator("td[data-label='Qty']").first().innerText()) || "").trim();
        const unitPriceText = ((await item.locator("td[data-label='Unit Price']").first().innerText()) || "").trim();
        const subtotalText = ((await item.locator("td[data-label='Subtotal']").first().innerText()) || "").trim();

        let qty = 0;
        try {
          qty = Math.floor(Number.parseFloat(qtyText));
        } catch {
          qty = 0;
        }
        const unitPrice = parseMoney(unitPriceText);
        const subtotal = parseMoney(subtotalText);

        let unitOfMeasure = "";
        const parts = title.split("~").map((x) => x.trim()).filter(Boolean);
        if (parts.length) {
          const tail = parts[parts.length - 1].toLowerCase();
          if (tail === "box" || tail === "case") unitOfMeasure = tail;
        }

        let perBox: number | null = null;
        let caseQty: number | null = null;
        if (fetchCaseQty && unitOfMeasure === "case" && listingUrl) {
          if (!listingCaseQtyCache.has(listingUrl)) {
            const detail = await browser.newPage();
            try {
              await detail.goto(listingUrl);
              const legend = await detail.locator("div.legend-note").first().innerText().catch(() => "");
              const m = CASE_QTY_RE.exec(legend || "");
              listingCaseQtyCache.set(listingUrl, m ? Number.parseInt(m[1], 10) : null);
            } catch {
              listingCaseQtyCache.set(listingUrl, null);
            } finally {
              await detail.close();
            }
          }
          caseQty = listingCaseQtyCache.get(listingUrl) ?? null;
          if (caseQty && unitPrice != null && caseQty > 0) {
            perBox = Math.round((unitPrice / caseQty) * 100) / 100;
          }
        }

        rows.push({
          captured_at: now,
          offerfilter: offerFilter,
          offer_id: offerId,
          dealer,
          created_at: created,
          status,
          offer_total: offerTotal != null ? String(offerTotal) : "",
          offer_detail_url: offerDetailUrl,
          tracking_number: trackingNumber,
          title,
          upc,
          qty: String(qty),
          unit_of_measure: unitOfMeasure,
          unit_price: unitPrice != null ? String(unitPrice) : "",
          subtotal: subtotal != null ? String(subtotal) : "",
          per_box_unit_price: perBox != null ? String(perBox) : "",
          case_qty_boxes: caseQty != null ? String(caseQty) : "",
          listing_url: listingUrl,
        });
      }
    }
  } finally {
    await browser.close();
  }
  return rows;
}

async function extractTracking(page: import("playwright").Page): Promise<string | null> {
  const exact = page.locator("#offerdata table tbody tr td:has-text('Tracking') a").first();
  if ((await exact.count()) > 0) {
    const txt = ((await exact.innerText()) || "").trim();
    if (txt) return txt;
  }
  const generic = page.locator("td:has-text('Tracking') a").first();
  if ((await generic.count()) > 0) {
    const txt = ((await generic.innerText()) || "").trim();
    if (txt) return txt;
  }
  return null;
}
