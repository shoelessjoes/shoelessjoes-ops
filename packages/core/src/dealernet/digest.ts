import type { DealernetMessageRow } from "./messages.js";
import { classifyMessage, type ClassifiedMessage } from "./classify.js";
import { parseTrackingFromText } from "./tracking.js";
const BASE = "https://www.dealernetx.com/";

export type DigestMeta = ClassifiedMessage & {
  messageId: string;
  sender: string | null;
  sentAt: string | null;
  messageUrl: string | null;
  offerLink: string | null;
  tracking: string | null;
  eta: string | null;
};

export type FormattedMessageEmail = {
  subject: string;
  text: string;
  smsText: string;
  meta: DigestMeta;
};

function offerLinkFor(offerId: string | null): string | null {
  if (!offerId) return null;
  return `${BASE}offer.php?offerid=${offerId}`;
}

export function formatMessageDigest(row: DealernetMessageRow): FormattedMessageEmail {
  const classified = classifyMessage(row);
  const offerLink = offerLinkFor(classified.offerId);
  const body = row.message_body || "";

  let subject: string;
  if (classified.type === "price_alert_triggered") {
    subject = `🚨 DEALERNET PRICE ALERT - ${classified.prettyType}`;
  } else if (classified.type === "offer_accepted") {
    subject = `Dealernet Message - ACTION: Offer Accepted (#${classified.offerId ?? "?"})`;
  } else if (classified.type === "offer_declined") {
    subject = `Dealernet Message - Offer Declined (#${classified.offerId ?? "?"})`;
  } else if (classified.isChat) {
    subject = `Dealernet Chat - Offer #${classified.offerId ?? "?"}`;
  } else if (classified.type === "direct_message") {
    const code = classified.dealerCode ?? row.subject ?? "Dealer";
    subject = `Dealernet Message - Direct from ${code}`;
  } else {
    subject = `Dealernet Message - ${classified.prettyType}`;
  }

  const tracking = parseTrackingFromText(body);
  const etaMatch =
    /(?:estimated|expected|eta|arriv\w+|delivery)\s*(?:by|on|date)?\s*[:#]?\s*([A-Za-z0-9 ,/.-]{4,40})/i.exec(body);
  const eta = etaMatch ? etaMatch[1].trim() : null;

  const lines: string[] = [];
  lines.push(`Type: ${classified.prettyType}`);
  if (classified.dealerCode) lines.push(`Dealer code: ${classified.dealerCode}`);
  if (row.sender) lines.push(`From: ${row.sender}`);
  if (row.sent_at) lines.push(`Sent: ${row.sent_at}`);
  if (classified.offerId) lines.push(`Offer ID: ${classified.offerId}`);
  if (tracking) lines.push(`Tracking #: ${tracking}`);
  if (eta) lines.push(`Estimated: ${eta}`);
  if (offerLink) lines.push(`Offer link: ${offerLink}`);
  if (row.message_url) lines.push(`Message URL: ${row.message_url}`);
  lines.push("");
  lines.push(body || "[No body captured]");
  lines.push("");
  lines.push("--- meta (json) ---");

  const meta: DigestMeta = {
    ...classified,
    messageId: row.message_id,
    sender: row.sender || null,
    sentAt: row.sent_at || null,
    messageUrl: row.message_url || null,
    offerLink,
    tracking,
    eta,
  };
  lines.push(JSON.stringify(meta, null, 2));

  const smsBase = body
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const smsPrefix =
    classified.type === "price_alert_triggered" ? "PRICE ALERT: " : "";
  const smsText = `${smsPrefix}${classified.prettyType}${classified.offerId ? ` #${classified.offerId}` : ""}${
    smsBase ? `: ${smsBase}` : ""
  }`;

  return {
    subject,
    text: lines.join("\n"),
    smsText,
    meta,
  };
}
