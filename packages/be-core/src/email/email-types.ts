export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Older name of {@link EmailMessage}. */
export type SendEmailOptions = EmailMessage;

/** A message with its sender, as a transport receives it. */
export interface OutgoingEmail extends EmailMessage {
  from: string;
}

/** Delivers email. Built-in: SMTP, Resend, log (dry run) and memory (tests); or bring your own. */
export interface EmailTransport {
  /** Shown in logs and `EmailError`s, e.g. `'resend'`. */
  readonly name: string;
  send(email: OutgoingEmail): Promise<void>;
}

export interface SmtpTransportConfig {
  kind: 'smtp';
  host: string;
  port: number;
  secure?: boolean;
  auth: { user: string; pass: string };
}

export interface ResendTransportConfig {
  kind: 'resend';
  apiKey: string;
  /** Defaults to Resend's `https://api.resend.com/emails`. */
  endpoint?: string;
}

/** Writes emails to the console instead of sending them — for local development. */
export interface LogTransportConfig {
  kind: 'log';
}

export type EmailTransportConfig = SmtpTransportConfig | ResendTransportConfig | LogTransportConfig;

export interface EmailConfig {
  /** Sender, e.g. `'Kniho-hlod <noreply@example.com>'`. */
  from: string;
  /** A built-in transport's config, or a transport instance (e.g. `new MemoryEmailTransport()`). */
  transport: EmailTransportConfig | EmailTransport;
}

export interface EmailService {
  /** Rejects with an `EmailError` when the transport fails. */
  send(message: EmailMessage): Promise<void>;
}

export type EmailTemplateFunction<T> = (data: T) => {
  subject: string;
  html: string;
  text?: string;
};
