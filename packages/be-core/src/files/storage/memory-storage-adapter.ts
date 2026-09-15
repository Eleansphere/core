import { Readable } from 'stream';
import { StorageAdapter, StorageByteRange, StoragePutOptions } from './storage-adapter';

interface StoredObject {
  body: Buffer;
  contentType: string;
}

const DEFAULT_PUBLIC_BASE_URL = 'https://storage.invalid';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Keeps objects in a `Map` — for tests and local development without a bucket
 * (`storage: { adapter: new MemoryStorageAdapter() }`). Everything is lost on restart.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly objects = new Map<string, StoredObject>();

  constructor(private readonly publicBaseUrl: string = DEFAULT_PUBLIC_BASE_URL) {}

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

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl}/${key}?signed`;
  }
}
