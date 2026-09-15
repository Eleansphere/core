import nodemailer from 'nodemailer';
import { EmailError } from './email-error';
import type {
  EmailTransport,
  EmailTransportConfig,
  OutgoingEmail,
  ResendTransportConfig,
  SmtpTransportConfig,
} from './email-types';

const RESEND_API_URL = 'https://api.resend.com/emails';

export function createSmtpTransport(config: SmtpTransportConfig): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? false,
    auth: config.auth,
  });
  return {
    name: 'smtp',
    async send({ from, to, subject, html, text }) {
      await transporter.sendMail({ from, to, subject, html, text });
    },
  };
}

/** Resend's HTTP API over `fetch` — no SDK. Works where outbound SMTP is blocked. */
export function createResendTransport(config: ResendTransportConfig): EmailTransport {
  const endpoint = config.endpoint ?? RESEND_API_URL;
  return {
    name: 'resend',
    async send({ from, to, subject, html, text }) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new EmailError('resend', `Resend rejected the email (${response.status}): ${detail}`);
      }
    },
  };
}

/** Prints each email (with its text, so links can be clicked) instead of sending it. */
export function createLogTransport(
  writeLine: (line: string) => void = console.info
): EmailTransport {
  return {
    name: 'log',
    async send({ from, to, subject, html, text }) {
      writeLine(`[email] ${from} → ${to}: ${subject}\n${text ?? html}`);
    },
  };
}

/** Keeps every email in `sent` instead of delivering it — for tests. */
export class MemoryEmailTransport implements EmailTransport {
  readonly name = 'memory';
  readonly sent: OutgoingEmail[] = [];

  async send(email: OutgoingEmail): Promise<void> {
    this.sent.push(email);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export function createEmailTransport(config: EmailTransportConfig): EmailTransport {
  switch (config.kind) {
    case 'smtp':
      return createSmtpTransport(config);
    case 'resend':
      return createResendTransport(config);
    case 'log':
      return createLogTransport();
  }
}
