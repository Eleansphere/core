import { describe, it, expect } from 'vitest';
import { Op } from 'sequelize';
import type { FieldConfig, QueryConfig } from '@eleansphere/schema';
import { parseListQuery } from './list-query';

const fields: Record<string, FieldConfig> = {
  title: { type: 'STRING' },
  rating: { type: 'INTEGER' },
  price: { type: 'FLOAT' },
  isFavorite: { type: 'BOOLEAN' },
  readingStatus: { type: 'ENUM', values: ['want', 'reading', 'read'] },
  finishedAt: { type: 'DATEONLY' },
};

const config: QueryConfig = {
  filter: {
    rating: 'range',
    price: 'range',
    isFavorite: 'eq',
    readingStatus: 'in',
    finishedAt: 'isNull',
    createdAt: 'range',
  },
  customFilters: { lent: 'BOOLEAN', shelfId: 'STRING' },
  sort: ['title', 'rating'],
  defaultSort: '-createdAt',
  search: ['title'],
  maxLimit: 100,
};

const parse = (query: Record<string, unknown>) => parseListQuery(query as never, config, fields);

describe('parseListQuery — filters', () => {
  it('coerces an equality filter to the field type', () => {
    expect(parse({ isFavorite: 'true' }).where).toEqual({ isFavorite: true });
  });

  it('builds an IN list, coercing each value', () => {
    expect(parse({ readingStatus: 'read,reading' }).where).toEqual({
      readingStatus: { [Op.in]: ['read', 'reading'] },
    });
  });

  it('builds range bounds, and accepts a plain value for a range field', () => {
    expect(parse({ rating: { gte: '3', lt: '5' } }).where).toEqual({
      rating: { [Op.gte]: 3, [Op.lt]: 5 },
    });
    expect(parse({ rating: '4' }).where).toEqual({ rating: 4 });
  });

  it('builds IS NULL / IS NOT NULL', () => {
    expect(parse({ finishedAt: { isNull: 'true' } }).where).toEqual({
      finishedAt: { [Op.is]: null },
    });
    expect(parse({ finishedAt: { isNull: 'false' } }).where).toEqual({
      finishedAt: { [Op.not]: null },
    });
  });

  it('lets system columns be filtered once the config lists them', () => {
    expect(parse({ createdAt: { gte: '2026-01-01T00:00:00Z' } }).where).toEqual({
      createdAt: { [Op.gte]: '2026-01-01T00:00:00Z' },
    });
  });

  it.each([
    [{ author: 'Herbert' }, /Unknown query parameter "author"/],
    [{ rating: 'five' }, /"rating" must be an integer/],
    [{ price: 'cheap' }, /"price" must be a number/],
    [{ isFavorite: 'yes' }, /must be true or false/],
    [{ readingStatus: 'burned' }, /must be one of: want, reading, read/],
    [{ rating: { between: '1' } }, /is not a range bound/],
    [{ finishedAt: 'null' }, /finishedAt\[isNull\]=true or false/],
    [{ isFavorite: ['true', 'false'] }, /must be a single value/],
  ])('rejects %j', (query, message) => {
    expect(() => parse(query)).toThrow(message);
  });
});

describe('parseListQuery — custom filters', () => {
  it('hands them over converted, outside the where-clause', () => {
    const list = parse({ lent: 'false', shelfId: 'sh_1', rating: '4' });
    expect(list.customFilters).toEqual({ lent: false, shelfId: 'sh_1' });
    expect(list.where).toEqual({ rating: 4 });
  });

  it('leaves out the ones not sent', () => {
    expect(parse({}).customFilters).toEqual({});
  });

  it.each([
    [{ lent: 'maybe' }, /"lent" must be true or false/],
    [{ lent: ['true', 'false'] }, /"lent" must be a single value/],
  ])('rejects %j', (query, message) => {
    expect(() => parse(query)).toThrow(message);
  });
});

describe('parseListQuery — search', () => {
  it('matches the search columns case-insensitively, escaping LIKE wildcards', () => {
    expect(parse({ q: ' 100%_\\ ' }).where).toEqual({
      [Op.or]: [{ title: { [Op.iLike]: '%100\\%\\_\\\\%' } }],
    });
  });

  it('ignores a blank q', () => {
    expect(parse({ q: '   ' }).where).toEqual({});
  });

  it('rejects q when the config declares no search columns', () => {
    expect(() => parseListQuery({ q: 'dune' } as never, {}, fields)).toThrow(/does not support/);
  });
});

describe('parseListQuery — sort and pagination', () => {
  it('uses the default sort, always ending with id as a tie-breaker', () => {
    expect(parse({}).order).toEqual([
      ['createdAt', 'DESC'],
      ['id', 'ASC'],
    ]);
  });

  it('parses several sort terms', () => {
    expect(parse({ sort: '-rating,title' }).order).toEqual([
      ['rating', 'DESC'],
      ['title', 'ASC'],
      ['id', 'ASC'],
    ]);
  });

  it('rejects a column the config does not allow', () => {
    expect(() => parse({ sort: 'ownerId' })).toThrow(/Cannot sort by "ownerId"/);
  });

  it('defaults to page 1 with the default limit, and computes the offset', () => {
    expect(parse({})).toMatchObject({ page: 1, limit: 50, offset: 0 });
    expect(parse({ page: '3', limit: '20' })).toMatchObject({ page: 3, limit: 20, offset: 40 });
  });

  it('clamps limit to maxLimit', () => {
    expect(parse({ limit: '5000' }).limit).toBe(100);
  });

  it.each([{ page: '0' }, { page: '-1' }, { limit: 'all' }, { limit: '2.5' }])(
    'rejects %j',
    (query) => {
      expect(() => parse(query)).toThrow(/must be a positive integer/);
    }
  );
});
