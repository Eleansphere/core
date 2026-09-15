import nodemailer from 'nodemailer';
import { EmailConfig, EmailService, SendEmailOptions } from './email-types';

export function createEmailService(config: EmailConfig): EmailService {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? false,
    auth: config.auth,
  });

  return {
    async send({ to, subject, html, text }: SendEmailOptions): Promise<void> {
      await transporter.sendMail({ from: config.from, to, subject, html, text });
    },
  };
}
