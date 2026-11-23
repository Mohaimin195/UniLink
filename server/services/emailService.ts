import nodemailer from 'nodemailer';

export interface OtpDeliveryResult {
  deliveredVia: 'smtp' | 'preview';
  previewOtp?: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

export async function sendOtpEmail(
  toEmail: string,
  code: string,
  purpose: 'auth' | 'delete_account',
): Promise<OtpDeliveryResult> {
  const subject =
    purpose === 'delete_account'
      ? 'UniLink — Confirm Account Deletion Code'
      : 'UniLink — Your University Verification Code';

  const bodyText =
    purpose === 'delete_account'
      ? `Your UniLink account deletion verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request account deletion, secure your university mailbox immediately.`
      : `Your UniLink verification code is: ${code}\n\nThis code expires in 10 minutes. Do not share it with anyone.`;

  if (isSmtpConfigured()) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'UniLink <no-reply@numl.edu.pk>',
      to: toEmail,
      subject,
      text: bodyText,
    });

    return { deliveredVia: 'smtp' };
  }

  // Preview fallback when SMTP credentials are not configured yet
  return {
    deliveredVia: 'preview',
    previewOtp: code,
  };
}
