import { Readable } from 'stream';
import { StorageAdapter, StorageByteRange, StoragePutOptions } from './storage-adapter';

interface StoredObject {
  body: Buffer;
  contentType: string;
}

/** Signed URLs are never served from memory; this only marks them as such. */
const SIGNED_URL_BASE_WITHOUT_PUBLIC_URL = 'memory://objects';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Keeps objects in a `Map` — for tests and local development without a bucket
 * (`storage: { adapter: new MemoryStorageAdapter() }`). Everything is lost on restart.
 *
 * Without a `publicBaseUrl` there is no public address, so file URLs point at the file service's
 * own `/api/files/:id`, which streams the bytes. Pass one (e.g. `https://cdn.test`) to exercise
 * the redirect to a CDN in tests.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly objects = new Map<string, StoredObject>();

  constructor(private readonly publicBaseUrl?: string) {}

  async put(key: string, body: Buffer | Readable, options: StoragePutOptions): Promise<void> {
    const bytes = Buffer.isBuffer(body) ? body : await readAll(body);
    this.objects.set(key, { body: bytes, contentType: options.contentType });
  }

  async getStream(key: string, range?: StorageByteRange): Promise<Readable> {
    const stored = this.objects.get(key);
    if (!stored) throw new Error(`No stored object at "${key}"`);
    const bytes = range ? stored.body.subarray(range.start, range.end + 1) : stored.body;
    return Readable.from(bytes);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  getPublicUrl(key: string): string | undefined {
    return this.publicBaseUrl === undefined ? undefined : `${this.publicBaseUrl}/${key}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl ?? SIGNED_URL_BASE_WITHOUT_PUBLIC_URL}/${key}?signed`;
  }
}
