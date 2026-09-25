import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import { defineEntity } from './entity-factory';
import type { InferCreateDto, InferUpdateDto } from './entity-types';

const bookEntity = defineEntity({
  name: 'book',
  prefix: 'bk_',
  basePath: '/api/library/books',
  userScoped: true,
  fields: {
    title: { type: 'STRING', required: true, minLength: 2 },
    rating: { type: 'INTEGER', min: 1, max: 5 },
    readingStatus: {
      type: 'ENUM',
      values: ['want', 'reading', 'read'],
      required: true,
      default: 'want',
    },
    finishedAt: { type: 'DATEONLY' },
    secretNote: { type: 'TEXT', writeOnly: true },
    lastReminderSentAt: { type: 'DATE', readOnly: true },
  },
  query: {
    filter: { readingStatus: 'in', rating: 'range', finishedAt: 'isNull' },
    customFilters: { lent: 'BOOLEAN' },
    sort: ['title', 'rating'],
    search: ['title'],
  },
  indexes: [{ fields: ['ownerId', 'title'] }],
});

type BookFields = typeof bookEntity.fields;
type ReadingStatus = 'want' | 'reading' | 'read';

describe('defineEntity — inferred types', () => {
  it('infers the read DTO: ENUM unions, null for optional columns, ownerId when scoped', () => {
    expectTypeOf<InstanceType<typeof bookEntity.Dto>>().toEqualTypeOf<{
      id: string;
      createdAt: string;
      updatedAt: string;
      ownerId: string;
      title: string;
      rating: number | null;
      readingStatus: ReadingStatus;
      finishedAt: string | null;
      lastReminderSentAt: string | null;
    }>();
  });

  it('infers the create DTO: required-without-default keys required, readOnly excluded', () => {
    expectTypeOf<InferCreateDto<BookFields>>().toEqualTypeOf<{
      title: string;
      rating?: number | null;
      readingStatus?: ReadingStatus;
      finishedAt?: string | null;
      secretNote?: string | null;
    }>();
  });

  it('infers the update DTO: everything optional, only non-required fields clearable', () => {
    expectTypeOf<InferUpdateDto<BookFields>>().toEqualTypeOf<{
      title?: string;
      rating?: number | null;
      readingStatus?: ReadingStatus;
      finishedAt?: string | null;
      secretNote?: string | null;
    }>();
  });

  it('types list params from the query config', () => {
    const books = new bookEntity.Service('http://api', () => null);
    const typeChecksOnly = () => {
      books.getAll({
        filter: {
          readingStatus: ['read', 'reading'],
          rating: { gte: 3 },
          finishedAt: { isNull: true },
          lent: false,
        },
        sort: ['-rating', 'title'],
        q: 'dune',
        page: 2,
      });
      // @ts-expect-error — `title` is not a declared filter
      books.getAll({ filter: { title: 'Dune' } });
      // @ts-expect-error — not a readingStatus value
      books.getAll({ filter: { readingStatus: 'burned' } });
      // @ts-expect-error — a custom filter takes the value type it declares
      books.getAll({ filter: { lent: 'no' } });
      // @ts-expect-error — `finishedAt` is not sortable
      books.getAll({ sort: 'finishedAt' });
    };
    expect(typeChecksOnly).toBeTypeOf('function');
  });

  it('rejects an ENUM without values and a non-literal required flag', () => {
    const typeChecksOnly = () => {
      defineEntity({
        name: 'broken',
        prefix: 'br_',
        // @ts-expect-error — ENUM needs `values`
        fields: { status: { type: 'ENUM' } },
      });
      // A computed boolean: a literal `true` would be narrowed back to `true` and pass.
      const widenedRequired = Math.random() > 0.5;
      defineEntity({
        name: 'broken',
        prefix: 'br_',
        // @ts-expect-error — `required` must be the literal `true`
        fields: { title: { type: 'STRING', required: widenedRequired } },
      });
    };
    expect(typeChecksOnly).toBeTypeOf('function');
  });
});

describe('defineEntity — model config', () => {
  it('passes access, query and indexes through, and routes the server at basePath', () => {
    expect(bookEntity.config).toMatchObject({
      name: 'book',
      prefix: 'bk_',
      routePath: '/api/library/books',
      userScoped: true,
      query: { filter: { readingStatus: 'in' }, sort: ['title', 'rating'] },
      indexes: [{ fields: ['ownerId', 'title'] }],
    });
  });

  it('turns writeOnly into sensitive and drops the writeOnly key', () => {
    expect(bookEntity.config.fields.secretNote).toEqual({ type: 'TEXT', sensitive: true });
  });

  it('strips writeOnly fields from a read Dto instance', () => {
    const dto = new bookEntity.Dto({ title: 'Dune', secretNote: 'x' } as never);
    expect(dto).toEqual({ title: 'Dune' });
  });
});

describe('defineEntity — service', () => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 })
  );

  afterEach(() => {
    fetchMock.mockClear();
    vi.unstubAllGlobals();
  });

  it('serializes list params into be-core query syntax', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const books = new bookEntity.Service('http://api', () => 'token-1');

    await books.getAll({
      filter: { readingStatus: ['read', 'reading'], rating: { gte: 3 }, lent: false },
      sort: ['-rating', 'title'],
      page: 2,
    });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/library/books');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      sort: '-rating,title',
      readingStatus: 'read,reading',
      'rating[gte]': '3',
      lent: 'false',
    });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer token-1' });
  });

  it('updates with PATCH', async () => {
    vi.stubGlobal('fetch', fetchMock);
    const books = new bookEntity.Service('http://api', () => null);

    await books.update('bk_1', { rating: 4 });

    expect(fetchMock.mock.calls[0][0]).toBe('http://api/api/library/books/bk_1');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: '{"rating":4}' });
  });
});
