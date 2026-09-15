import { describe, it, expect } from 'vitest';
import { toListQueryParams } from './list-request';

describe('toListQueryParams', () => {
  it('returns nothing for an empty request', () => {
    expect(toListQueryParams()).toEqual({});
  });

  it('flattens every filter shape', () => {
    expect(
      toListQueryParams({
        filter: {
          isFavorite: true,
          readingStatus: ['read', 'reading'],
          rating: { gte: 3, lte: undefined, lt: 5 },
          finishedAt: { isNull: false },
          author: undefined,
        },
      })
    ).toEqual({
      isFavorite: 'true',
      readingStatus: 'read,reading',
      'rating[gte]': '3',
      'rating[lt]': '5',
      'finishedAt[isNull]': 'false',
    });
  });

  it('joins sort terms and skips an empty search', () => {
    expect(toListQueryParams({ sort: ['-rating', 'title'], q: '', page: 1, limit: 20 })).toEqual({
      sort: '-rating,title',
      page: '1',
      limit: '20',
    });
    expect(toListQueryParams({ sort: '-createdAt', q: 'dune' })).toEqual({
      sort: '-createdAt',
      q: 'dune',
    });
  });
});
