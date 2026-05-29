export type AlertSmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  startTls: boolean;
  fromEmail: string;
  toEmails: string[];
  smsEmails: string[];
};

export async function sendSmtpAlert(
  cfg: AlertSmtpConfig,
  opts: { subject: string; textBody: string; smsText?: string },
): Promise<{ email: number; sms: number }> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    requireTLS: cfg.startTls,
  });

  let emailCount = 0;
  if (cfg.toEmails.length) {
    await transporter.sendMail({
      from: cfg.fromEmail,
      to: cfg.toEmails.join(", "),
      subject: opts.subject,
      text: opts.textBody,
    });
    emailCount = cfg.toEmails.length;
  }

  let smsCount = 0;
  if (cfg.smsEmails.length) {
    const smsBody = (opts.smsText ?? opts.textBody).slice(0, 320);
    await transporter.sendMail({
      from: cfg.fromEmail,
      to: cfg.smsEmails.join(", "),
      subject: "",
      text: smsBody,
    });
    smsCount = cfg.smsEmails.length;
  }

  return { email: emailCount, sms: smsCount };
}
