import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineEntity } from '../entity-factory';
import { withFiles } from './files.service';
import { withImages } from './images.service';

const BASE_URL = 'http://api.test';

const bookEntity = defineEntity({
  name: 'book',
  prefix: 'bk_',
  fields: { title: { type: 'STRING', required: true } },
  extend: (Base) => class extends withFiles(Base, 'book', ['cover', 'gallery']) {},
});

function stubFetch() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? new Response(JSON.stringify({ id: 'file_1' }), { status: 201 })
      : new Response(JSON.stringify({ data: [], total: 0 }))
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('withFiles', () => {
  it('scopes uploads and listings to the entity, the row and the role', async () => {
    const fetchMock = stubFetch();
    const books = new bookEntity.Service(BASE_URL, () => 'token-1');

    await books.files('cover').upload('bk_1', new Blob(['png']), { visibility: 'private' });
    await books.files('gallery').list('bk_1');

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(uploadUrl).toBe(`${BASE_URL}/api/files`);
    const form = uploadInit?.body as FormData;
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(Object.fromEntries([...form.entries()].filter(([name]) => name !== 'file'))).toEqual({
      refType: 'book',
      refId: 'bk_1',
      role: 'cover',
      visibility: 'private',
    });

    const listUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      refType: 'book',
      refId: 'bk_1',
      role: 'gallery',
    });
  });

  it('accepts only the declared roles', () => {
    const books = new bookEntity.Service(BASE_URL, () => null);
    const typeChecksOnly = () => {
      // @ts-expect-error — `avatar` is not a role of books
      books.files('avatar');
    };

    expect(typeChecksOnly).toThrow(/not a file role of book/);
  });
});

describe('withImages', () => {
  it('uploads with role image', async () => {
    const fetchMock = stubFetch();
    const productEntity = defineEntity({
      name: 'Product',
      prefix: 'prod',
      fields: { name: { type: 'STRING', required: true } },
      extend: (Base) => class extends withImages(Base, 'Product') {},
    });

    await new productEntity.Service(BASE_URL, () => null).uploadImage('prod_1', new Blob(['x']), 2);

    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect([form.get('refType'), form.get('role'), form.get('sortOrder')]).toEqual([
      'Product',
      'image',
      '2',
    ]);
  });
});
