/** A failed email delivery, naming the transport that failed. */
export class EmailError extends Error {
  readonly transport: string;
  /** The underlying error, when there was one. */
  readonly cause: unknown;

  constructor(transport: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'EmailError';
    this.transport = transport;
    this.cause = cause;
  }
}
