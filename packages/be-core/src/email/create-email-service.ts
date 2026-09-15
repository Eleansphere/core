import { EmailError } from './email-error';
import { createEmailTransport } from './transports';
import type {
  EmailConfig,
  EmailService,
  EmailTransport,
  EmailTransportConfig,
} from './email-types';

function isTransportInstance(
  transport: EmailTransportConfig | EmailTransport
): transport is EmailTransport {
  return 'send' in transport;
}

function toEmailError(transport: EmailTransport, err: unknown): EmailError {
  if (err instanceof EmailError) return err;
  const reason = err instanceof Error ? err.message : String(err);
  return new EmailError(
    transport.name,
    `Sending email via ${transport.name} failed: ${reason}`,
    err
  );
}

/**
 * Sends email from `config.from` through the configured transport. Every failure is logged and
 * rethrown as an `EmailError`, so callers decide whether a failed email should fail the request.
 */
export function createEmailService(config: EmailConfig): EmailService {
  const transport = isTransportInstance(config.transport)
    ? config.transport
    : createEmailTransport(config.transport);

  return {
    async send(message) {
      try {
        await transport.send({ ...message, from: config.from });
      } catch (err) {
        const error = toEmailError(transport, err);
        console.error(`[be-core] Email to ${message.to} failed:`, error.message);
        throw error;
      }
    },
  };
}
