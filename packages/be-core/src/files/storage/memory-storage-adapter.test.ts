import { describe, expect, it } from 'vitest';
import { toFileDto } from '../file-entity';
import { MemoryStorageAdapter } from './memory-storage-adapter';

const KEY = 'book/file_123.webp';

function publicFile() {
  const record = { id: 'file_123', storageKey: KEY, visibility: 'public' };
  return { toJSON: () => record };
}

describe('MemoryStorageAdapter', () => {
  it('has no public address unless given one, so files load through the file service', () => {
    const storage = new MemoryStorageAdapter();

    expect(storage.getPublicUrl(KEY)).toBeUndefined();
    expect(toFileDto(publicFile(), storage).url).toBe('/api/files/file_123');
  });

  it('builds public URLs from the base it is given', () => {
    const storage = new MemoryStorageAdapter('https://cdn.test');

    expect(storage.getPublicUrl(KEY)).toBe(`https://cdn.test/${KEY}`);
    expect(toFileDto(publicFile(), storage).url).toBe(`https://cdn.test/${KEY}`);
  });

  it('keeps what was stored until it is deleted', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.put(KEY, Buffer.from('cover'), { contentType: 'image/webp' });

    const chunks: Buffer[] = [];
    for await (const chunk of await storage.getStream(KEY)) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('cover');

    await storage.delete(KEY);
    await expect(storage.getStream(KEY)).rejects.toThrow();
  });
});
