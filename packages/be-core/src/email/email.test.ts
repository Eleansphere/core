import { describe, it, expect, vi, afterEach } from 'vitest';
import { createEmailService } from './create-email-service';
import { createLogTransport, createResendTransport, MemoryEmailTransport } from './transports';
import { EmailError } from './email-error';
import type { EmailTransport } from './email-types';

const message = { to: 'reader@test.cz', subject: 'Hello', html: '<p>Hello</p>', text: 'Hello' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createEmailService', () => {
  it('sends from the configured sender through a transport instance', async () => {
    const outbox = new MemoryEmailTransport();
    await createEmailService({ from: 'noreply@test.cz', transport: outbox }).send(message);

    expect(outbox.sent).toEqual([{ ...message, from: 'noreply@test.cz' }]);
  });

  it('turns a transport failure into an EmailError naming the transport', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const flaky: EmailTransport = {
      name: 'flaky',
      send: async () => {
        throw new Error('connection reset');
      },
    };

    const sending = createEmailService({ from: 'noreply@test.cz', transport: flaky }).send(message);

    await expect(sending).rejects.toBeInstanceOf(EmailError);
    await expect(sending).rejects.toMatchObject({
      transport: 'flaky',
      message: expect.stringContaining('connection reset'),
    });
  });
});

describe('createResendTransport', () => {
  it('posts the email to the Resend API', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) => new Response('{"id":"email_1"}')
    );
    vi.stubGlobal('fetch', fetchMock);

    await createResendTransport({ kind: 'resend', apiKey: 're_test' }).send({
      ...message,
      from: 'noreply@test.cz',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer re_test' }),
    });
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'noreply@test.cz',
      to: ['reader@test.cz'],
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });

  it('rejects with an EmailError carrying the API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('domain not verified', { status: 403 }))
    );

    const sending = createResendTransport({ kind: 'resend', apiKey: 're_test' }).send({
      ...message,
      from: 'noreply@test.cz',
    });

    await expect(sending).rejects.toMatchObject({
      name: 'EmailError',
      transport: 'resend',
      message: expect.stringMatching(/403.*domain not verified/),
    });
  });
});

describe('createLogTransport', () => {
  it('writes the text version, so links can be followed during development', async () => {
    const lines: string[] = [];
    await createLogTransport((line) => lines.push(line)).send({
      ...message,
      from: 'noreply@test.cz',
    });

    expect(lines).toEqual(['[email] noreply@test.cz → reader@test.cz: Hello\nHello']);
  });
});
