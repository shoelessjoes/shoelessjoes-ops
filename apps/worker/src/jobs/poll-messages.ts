import {
  collectDealernetMessages,
  formatMessageDigest,
  resolveTrackingOfferId,
  sendSmtpAlert,
  type AlertSmtpConfig,
} from "@dealernet-ops/core";
import { prisma } from "@dealernet-ops/db";
import { optionalEnv, requireEnv } from "../env.js";
import { loadDealernetLogin } from "../dealernet-login.js";
import { getOrCreateShopFromEnv } from "../shop.js";

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
  };
}

async function main() {
  const shop = await getOrCreateShopFromEnv();
  const login = loadDealernetLogin();
  const smtp = loadSmtp();
  const isBootstrap = optionalEnv("DEALERNET_POLL_BOOTSTRAP") === "1";

  const rows = await collectDealernetMessages({
    login,
    inboxUrl: optionalEnv("DEALERNET_INBOX_URL"),
    fetchOfferIds: true,
    fetchMessageBody: true,
  });

  let newCount = 0;
  let notifiedCount = 0;

  for (const r of rows) {
    const mid = (r.message_id || "").trim();
    if (!mid) continue;

    const exists = await prisma.dealernetMessage.findUnique({
      where: { shopId_messageId: { shopId: shop.id, messageId: mid } },
    });
    if (exists) continue;

    const digest = formatMessageDigest(r);

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

    if (isBootstrap) continue;

    if (!smtp.toEmails.length && !smtp.smsEmails.length) {
      console.warn("Skipping notifications: set ALERT_TO_EMAILS and/or ALERT_SMS_EMAILS");
      continue;
    }

    await sendSmtpAlert(smtp, {
      subject: digest.subject,
      textBody: digest.text,
      smsText: digest.smsText,
    });

    await prisma.dealernetMessage.update({
      where: { shopId_messageId: { shopId: shop.id, messageId: mid } },
      data: { notifiedAt: new Date() },
    });

    await prisma.notificationEvent.create({
      data: {
        shopId: shop.id,
        channel: "email+sms",
        subject: digest.subject,
        bodyPreview: digest.text.slice(0, 500),
      },
    });
    notifiedCount += 1;
  }

  console.log(
    `Processed ${rows.length} inbox rows: ${newCount} new, ${notifiedCount} notified${
      isBootstrap ? " (bootstrap mode: notifications suppressed)" : ""
    }`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
