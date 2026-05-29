import { chromium } from "playwright";
import type { DealernetLoginConfig } from "./types.js";
import { dealernetLogin } from "./login.js";

const BASE = "https://www.dealernetx.com/";
const OFFER_ID_RE = /offerid=(\d+)/i;
const OFFER_ID_TEXT_RE = /\boffer(?:\s*id)?\s*[:#]?\s*(\d{4,})\b/i;

export type DealernetMessageRow = {
  captured_at: string;
  message_id: string;
  is_unread: string;
  sender: string;
  subject: string;
  sent_at: string;
  message_url: string;
  offer_id: string;
  message_body: string;
};

async function extractOfferIdFromMessagePage(page: import("playwright").Page): Promise<string | null> {
  const anchors = page.locator("a[href*='offerid=']");
  const n = await anchors.count();
  for (let i = 0; i < n; i++) {
    const href = (await anchors.nth(i).getAttribute("href")) || "";
    const m = OFFER_ID_RE.exec(href);
    if (m) return m[1];
  }
  const m2 = OFFER_ID_RE.exec(page.url());
  if (m2) return m2[1];
  const bodyText = ((await page.locator("body").innerText().catch(() => "")) || "").trim();
  const m3 = OFFER_ID_RE.exec(bodyText);
  if (m3) return m3[1];
  const m4 = OFFER_ID_TEXT_RE.exec(bodyText);
  if (m4) return m4[1];
  return null;
}

async function extractMessageBody(page: import("playwright").Page): Promise<string> {
  const selectors = [
    "#messagebody",
    "#messageBody",
    ".message-body",
    "td[data-label='Message']",
    "div.card-body",
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    const text = ((await loc.innerText().catch(() => "")) || "").trim();
    if (text.length > 10) return text;
  }
  return ((await page.locator("body").first().innerText().catch(() => "")) || "").trim();
}

type MessageDetail = { offerId: string | null; body: string };

export async function collectDealernetMessages(opts: {
  login: DealernetLoginConfig;
  inboxUrl?: string;
  fetchOfferIds?: boolean;
  fetchMessageBody?: boolean;
}): Promise<DealernetMessageRow[]> {
  const inboxUrl = opts.inboxUrl ?? `${BASE}inbox.php`;
  const fetchOfferIds = opts.fetchOfferIds ?? true;
  const fetchMessageBody = opts.fetchMessageBody ?? true;
  const now = new Date().toISOString();
  const rows: DealernetMessageRow[] = [];

  const browser = await chromium.launch({ headless: true, slowMo: opts.login.slowMoMs ?? 150 });
  const page = await browser.newPage();
  const detailCache = new Map<string, MessageDetail>();

  try {
    await dealernetLogin(page, opts.login);
    await page.goto(inboxUrl);
    await page.waitForSelector("#mymessages", { timeout: 15000 }).catch(() => null);

    const msgRows = page.locator("#mymessages table tbody tr, #mymessages div.table-responsive table tbody tr");
    const msgCount = await msgRows.count();
    for (let i = 0; i < msgCount; i++) {
      const row = msgRows.nth(i);
      const subjectLink = row
        .locator("td[data-label='Subject'] a[href*='readmessage.php'], a[href*='readmessage.php']")
        .first();
      if ((await subjectLink.count()) === 0) continue;

      const rowClass = ((await row.getAttribute("class")) || "").trim();
      const isUnread = rowClass.toLowerCase().split(/\s+/).includes("unread");

      const messageId =
        (await safeCell(row, ["td[data-label='Message ID']", "td.number", "td:first-child"])) || "";
      const sender = (await safeCell(row, ["td[data-label='From']", "td:nth-child(3)"])) || "";
      const subject = ((await subjectLink.innerText()) || "").trim();
      const subjectHref = (await subjectLink.getAttribute("href")) || "";
      const messageUrl = subjectHref ? new URL(subjectHref, BASE).toString() : "";
      const sentAt =
        (await safeCell(row, ["td[data-label='Date Sent']", "td.date", "td:last-child"])) || "";

      let offerId = "";
      let body = "";
      if ((fetchOfferIds || fetchMessageBody) && messageUrl) {
        if (!detailCache.has(messageUrl)) {
          const detail = await browser.newPage();
          let d: MessageDetail = { offerId: null, body: "" };
          try {
            await detail.goto(messageUrl);
            const oid = fetchOfferIds ? await extractOfferIdFromMessagePage(detail) : null;
            const b = fetchMessageBody ? await extractMessageBody(detail) : "";
            d = { offerId: oid, body: b };
          } catch {
            d = { offerId: null, body: "" };
          } finally {
            await detail.close();
          }
          detailCache.set(messageUrl, d);
        }
        const cached = detailCache.get(messageUrl)!;
        offerId = cached.offerId || "";
        body = cached.body || "";
      }

      rows.push({
        captured_at: now,
        message_id: messageId,
        is_unread: isUnread ? "1" : "0",
        sender,
        subject,
        sent_at: sentAt,
        message_url: messageUrl,
        offer_id: offerId,
        message_body: body,
      });
    }
  } finally {
    await browser.close();
  }
  return rows;
}

async function safeCell(row: import("playwright").Locator, selectors: string[]): Promise<string> {
  for (const sel of selectors) {
    const loc = row.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    const t = ((await loc.innerText().catch(() => "")) || "").trim();
    if (t) return t;
  }
  return "";
}
