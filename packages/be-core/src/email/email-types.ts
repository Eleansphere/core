export interface EmailConfig {
  host: string;
  port: number;
  secure?: boolean;
  auth: { user: string; pass: string };
  from: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailService {
  send(options: SendEmailOptions): Promise<void>;
}

export type EmailTemplateFunction<T> = (data: T) => {
  subject: string;
  html: string;
  text?: string;
};
