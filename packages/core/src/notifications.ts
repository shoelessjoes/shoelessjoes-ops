export type AlertSmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  startTls: boolean;
  fromEmail: string;
  toEmails: string[];
  smsEmails: string[];
  /** When false, skip carrier SMS gateway emails (email-only). */
  smsEnabled?: boolean;
};

export type AlertSendResult = {
  email: number;
  sms: number;
  emailError: string | null;
  smsError: string | null;
};

/** Carrier gateways (vtext, tmomail, etc.) reject URLs and long bodies (AUP#POL). */
export function formatSmsForCarrier(text: string, maxLen = 160): string {
  return text
    .replace(/https?:\/\S+/gi, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export async function sendSmtpAlert(
  cfg: AlertSmtpConfig,
  opts: { subject: string; textBody: string; smsText?: string },
): Promise<AlertSendResult> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    requireTLS: cfg.startTls,
  });

  let emailCount = 0;
  let emailError: string | null = null;
  if (cfg.toEmails.length) {
    try {
      await transporter.sendMail({
        from: cfg.fromEmail,
        to: cfg.toEmails.join(", "),
        subject: opts.subject,
        text: opts.textBody,
      });
      emailCount = cfg.toEmails.length;
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }
  }

  let smsCount = 0;
  let smsError: string | null = null;
  const smsOn = cfg.smsEnabled !== false && cfg.smsEmails.length > 0;
  if (smsOn) {
    try {
      const raw = opts.smsText ?? opts.textBody;
      const smsBody = formatSmsForCarrier(raw);
      await transporter.sendMail({
        from: cfg.fromEmail,
        to: cfg.smsEmails.join(", "),
        subject: "",
        text: smsBody,
      });
      smsCount = cfg.smsEmails.length;
    } catch (e) {
      smsError = e instanceof Error ? e.message : String(e);
      console.warn(`[alert] SMS gateway send failed (email may have succeeded): ${smsError}`);
    }
  }

  if (emailError && !emailCount && smsError && !smsCount) {
    throw new Error(`Alert delivery failed: email=${emailError}; sms=${smsError}`);
  }

  return { email: emailCount, sms: smsCount, emailError, smsError };
}
