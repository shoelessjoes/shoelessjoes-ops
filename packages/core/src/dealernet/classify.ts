import type { DealernetMessageRow } from "./messages.js";

export type DealernetMessageType =
  | "new_offer"
  | "offer_accepted"
  | "offer_declined"
  | "offer_updated"
  | "offer_shipping_updated"
  | "payment_completed"
  | "price_alert_triggered"
  | "withdraw_requested"
  | "offer_chat"
  | "assistance_chat"
  | "direct_message"
  | "unknown";

export type ClassifiedMessage = {
  type: DealernetMessageType;
  prettyType: string;
  isChat: boolean;
  isSystemEvent: boolean;
  referenceOfferId: string | null;
  offerId: string | null;
  dealerCode: string | null;
};

const SYSTEM_TYPES: Array<{ re: RegExp; type: DealernetMessageType; pretty: string }> = [
  { re: /^new\s+offer\s+received\b/i, type: "new_offer", pretty: "New Offer Received" },
  { re: /^offer\s+accepted\b/i, type: "offer_accepted", pretty: "Offer Accepted" },
  { re: /^offer\s+declined\b/i, type: "offer_declined", pretty: "Offer Declined" },
  { re: /^offer\s+shipping\s+updated\b/i, type: "offer_shipping_updated", pretty: "Offer Shipping Updated" },
  { re: /^offer\s+updated\b/i, type: "offer_updated", pretty: "Offer Updated" },
  { re: /^payment\s+completed\b/i, type: "payment_completed", pretty: "Payment Completed" },
  { re: /^price\s+alert\s+triggered\b/i, type: "price_alert_triggered", pretty: "Price Alert Triggered" },
  { re: /^withdraw\s+requested\b/i, type: "withdraw_requested", pretty: "Withdraw Requested" },
];

const CHAT_RE =
  /(offer|assistance)\s+chat\s+on\s+(?:for\s+sale|wanted|[^()]+?)\s+by\s+([A-Z]{2,4}-[A-Z0-9]+)\s*\(\s*reference\s*#?\s*:?\s*(\d+)\s*\)/i;
const REFERENCE_RE = /reference\s*#?\s*:?\s*(\d+)/i;
const OFFER_ID_RE = /(?:offer|reference)\s*#?\s*:?\s*(\d{5,})/i;
const DEALER_CODE_RE = /^[A-Z]{2,4}-[A-Z0-9]+$/;

function extractOfferId(row: DealernetMessageRow, body: string): string | null {
  if (row.offer_id) return row.offer_id;
  const ref = REFERENCE_RE.exec(body);
  if (ref) return ref[1];
  const offer = OFFER_ID_RE.exec(body);
  return offer ? offer[1] : null;
}

export function classifyMessage(row: DealernetMessageRow): ClassifiedMessage {
  const subj = String(row.subject || "").trim();
  const body = String(row.message_body || "");
  const haystack = `${subj}\n${body}`;

  const chatMatch = CHAT_RE.exec(haystack);
  if (chatMatch) {
    const isAssist = /assistance\s+chat/i.test(haystack);
    return {
      type: isAssist ? "assistance_chat" : "offer_chat",
      prettyType: isAssist ? "Assistance Chat" : "Offer Chat",
      isChat: true,
      isSystemEvent: false,
      referenceOfferId: chatMatch[3],
      offerId: chatMatch[3],
      dealerCode: chatMatch[2],
    };
  }

  for (const s of SYSTEM_TYPES) {
    if (s.re.test(subj)) {
      const offerId = extractOfferId(row, body);
      return {
        type: s.type,
        prettyType: s.pretty,
        isChat: false,
        isSystemEvent: true,
        referenceOfferId: offerId,
        offerId,
        dealerCode: null,
      };
    }
  }

  if (DEALER_CODE_RE.test(subj)) {
    const m = REFERENCE_RE.exec(body);
    return {
      type: "direct_message",
      prettyType: "Direct Message",
      isChat: false,
      isSystemEvent: false,
      referenceOfferId: m ? m[1] : null,
      offerId: row.offer_id || (m ? m[1] : null),
      dealerCode: subj,
    };
  }

  return {
    type: "unknown",
    prettyType: subj || "Dealernet Message",
    isChat: false,
    isSystemEvent: false,
    referenceOfferId: null,
    offerId: row.offer_id || null,
    dealerCode: null,
  };
}
