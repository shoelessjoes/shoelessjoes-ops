import {
  collectDealernetMessages,
  formatMessageDigest,
  resolveTrackingOfferId,
  sendSmtpAlert,
  type AlertSmtpConfig,
  type DealernetMessageRow,
} from "@dealernet-ops/core";
import type { DealernetMessage } from "@dealernet-ops/db";
import { prisma } from "@dealernet-ops/db";
import { optionalEnv, requireEnv } from "../env.js";
import { loadDealernetLogin } from "../dealernet-login.js";
import { getOrCreateShopFromEnv } from "../shop.js";
import { syncDealernetInboundLines } from "../inbound/sync-dealernet.js";

function loadSmtp(): AlertSmtpConfig {
  return {
    host: requireEnv("ALERT_SMTP_HOST"),
    port: Number(optionalEnv("ALERT_SMTP_PORT") ?? "587"),
    username: optionalEnv("ALERT_SMTP_USERNAME") ?? "",
    password: optionalEnv("ALERT_SMTP_PASSWORD") ?? "",
    startTls: (optionalEnv("ALERT_SMTP_STARTTLS") ?? "true").toLowerCase() !== "false",
    fromEmail: requireEnv("ALERT_FROM_EMAIL"),
    toEmails: (optionalEnv("ALERT_TO_EMAILS") ?? "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
    smsEmails: (optionalEnv("ALERT_SMS_EMAILS") ?? "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
    smsEnabled: (optionalEnv("ALERT_SMS_ENABLED") ?? "1") !== "0",
  };
}

function storedMessageToRow(msg: DealernetMessage): DealernetMessageRow {
  return {
    captured_at: msg.capturedAt.toISOString(),
    message_id: msg.messageId,
    is_unread: msg.isUnread ? "1" : "0",
    sender: msg.sender ?? "",
    subject: msg.subject ?? "",
    sent_at: msg.sentAt ?? "",
    message_url: msg.messageUrl ?? "",
    offer_id: msg.offerId ?? "",
    message_body: msg.body ?? "",
  };
}

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const login = loadDealernetLogin();
  const smtp = loadSmtp();
  const bootstrapRaw = optionalEnv("DEALERNET_POLL_BOOTSTRAP") ?? "(unset)";
  const isBootstrap = bootstrapRaw === "1";
  const backfillPending =
    !isBootstrap && (optionalEnv("DEALERNET_POLL_BACKFILL_PENDING") ?? "1") !== "0";
  // Default: only unread rows (bold / envelope count). Bootstrap imports full inbox once.
  const unreadOnly = optionalEnv("DEALERNET_POLL_UNREAD_ONLY") !== "0" && !isBootstrap;

  console.log(
    `[poll-messages] DEALERNET_POLL_BOOTSTRAP=${bootstrapRaw} → notifications ${
      isBootstrap ? "OFF (bootstrap)" : "ON"
    }; unread-only=${unreadOnly}; backfill-pending=${backfillPending}; email recipients=${
      smtp.toEmails.length
    }; sms gateways=${smtp.smsEmails.length}`,
  );

  const rows = await collectDealernetMessages({
    login,
    inboxUrl: optionalEnv("DEALERNET_INBOX_URL"),
    fetchOfferIds: true,
    fetchMessageBody: true,
    unreadOnly,
  });

  let newCount = 0;
  let notifiedCount = 0;
  let backfillCount = 0;
  const notifiedIds = new Set<string>();

  async function notifyMessage(mid: string, row: DealernetMessageRow): Promise<void> {
    if (isBootstrap || notifiedIds.has(mid)) return;

    if (!smtp.toEmails.length && !smtp.smsEmails.length) {
      console.warn("Skipping notifications: set ALERT_TO_EMAILS and/or ALERT_SMS_EMAILS");
      return;
    }

    const digest = formatMessageDigest(row);
    const sent = await sendSmtpAlert(smtp, {
      subject: digest.subject,
      textBody: digest.text,
      smsText: digest.smsText,
    });

    const delivered = sent.email > 0 || sent.sms > 0;
    if (!delivered) {
      console.warn(`[poll-messages] notify failed for message ${mid}: no channel delivered`);
      return;
    }
    if (sent.smsError) {
      console.warn(`[poll-messages] SMS skipped/failed for ${mid}: ${sent.smsError}`);
    }

    await prisma.dealernetMessage.update({
      where: { shopId_messageId: { shopId: shop.id, messageId: mid } },
      data: { notifiedAt: new Date() },
    });

    const channel =
      sent.email > 0 && sent.sms > 0
        ? sent.smsError
          ? "email"
          : "email+sms"
        : sent.email > 0
          ? "email"
          : "sms";

    await prisma.notificationEvent.create({
      data: {
        shopId: shop.id,
        channel,
        subject: digest.subject,
        bodyPreview: digest.text.slice(0, 500),
      },
    });

    notifiedIds.add(mid);
    notifiedCount += 1;
  }

  for (const r of rows) {
    const mid = (r.message_id || "").trim();
    if (!mid) continue;

    const exists = await prisma.dealernetMessage.findUnique({
      where: { shopId_messageId: { shopId: shop.id, messageId: mid } },
    });

    const digest = formatMessageDigest(r);

    if (!exists) {
      await prisma.dealernetMessage.create({
        data: {
          shopId: shop.id,
          messageId: mid,
          subject: r.subject || null,
          sender: r.sender || null,
          sentAt: r.sent_at || null,
          messageUrl: r.message_url || null,
          offerId: digest.meta.offerId || null,
          referenceOfferId: digest.meta.referenceOfferId || null,
          dealerCode: digest.meta.dealerCode || null,
          messageType: digest.meta.type,
          body: r.message_body || null,
          isUnread: r.is_unread === "1",
        },
      });
      newCount += 1;
    } else if (exists.notifiedAt) {
      continue;
    }

    const trackingOfferId = resolveTrackingOfferId(digest.meta);
    if (digest.meta.tracking && trackingOfferId) {
      const applied = await prisma.dealernetOfferLine.updateMany({
        where: { shopId: shop.id, offerId: trackingOfferId },
        data: { trackingNumber: digest.meta.tracking },
      });
      if (applied.count > 0) {
        console.log(
          `Applied tracking ${digest.meta.tracking} to offer #${trackingOfferId} (${applied.count} lines)`,
        );
      }
    }

    await notifyMessage(mid, r);
  }

  if (backfillPending) {
    const pending = await prisma.dealernetMessage.findMany({
      where: {
        shopId: shop.id,
        notifiedAt: null,
        ...(unreadOnly ? { isUnread: true } : {}),
      },
    });
    for (const msg of pending) {
      if (notifiedIds.has(msg.messageId)) continue;
      await notifyMessage(msg.messageId, storedMessageToRow(msg));
      backfillCount += 1;
    }
  }

  console.log(
    `Processed ${rows.length} inbox rows: ${newCount} new, ${notifiedCount} notified` +
      (backfillCount ? ` (${backfillCount} backfilled from DB)` : "") +
      (isBootstrap ? " (bootstrap mode: notifications suppressed)" : "") +
      (unreadOnly ? " (unread-only scrape)" : ""),
  );

  const inbound = await syncDealernetInboundLines(shop.id);
  console.log(
    `Inbound queue refreshed: ${inbound.upserted} line(s), ${inbound.cancelled} cancelled`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
