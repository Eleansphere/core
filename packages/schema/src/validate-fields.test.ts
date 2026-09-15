import { describe, it, expect } from 'vitest';
import { validateFields } from './validate-fields';
import type { FieldConfig } from './field-config';

const bookFields: Record<string, FieldConfig> = {
  title: { type: 'STRING', required: true, minLength: 2, maxLength: 20 },
  rating: { type: 'INTEGER', min: 1, max: 5 },
  price: { type: 'FLOAT', min: 0 },
  isFavorite: { type: 'BOOLEAN' },
  readingStatus: {
    type: 'ENUM',
    values: ['want', 'reading', 'read'],
    required: true,
    default: 'want',
  },
  finishedAt: { type: 'DATEONLY' },
  importedAt: { type: 'DATE' },
  contactEmail: { type: 'STRING', format: 'email' },
  website: { type: 'STRING', format: 'url' },
  role: { type: 'STRING', required: true, readOnly: true },
};

describe('validateFields — create', () => {
  it('accepts a valid record', () => {
    const issues = validateFields(
      bookFields,
      {
        title: 'Dune',
        rating: 5,
        price: 9.5,
        isFavorite: false,
        readingStatus: 'read',
        finishedAt: '2026-09-15',
        importedAt: '2026-09-15T10:00:00.000Z',
        contactEmail: 'a@b.cz',
        website: 'https://example.com',
      },
      { mode: 'create' }
    );

    expect(issues).toEqual([]);
  });

  it('reports a missing required field', () => {
    expect(validateFields(bookFields, {}, { mode: 'create' })).toEqual([
      { path: 'title', code: 'required' },
    ]);
  });

  it('lets a required field with a default be left out, but not be sent empty', () => {
    expect(validateFields(bookFields, { title: 'Dune' }, { mode: 'create' })).toEqual([]);
    expect(
      validateFields(bookFields, { title: 'Dune', readingStatus: null }, { mode: 'create' })
    ).toEqual([{ path: 'readingStatus', code: 'required' }]);
  });

  it('treats an empty string as no value', () => {
    expect(validateFields(bookFields, { title: '' }, { mode: 'create' })).toEqual([
      { path: 'title', code: 'required' },
    ]);
  });

  it('skips readOnly fields entirely', () => {
    expect(validateFields(bookFields, { title: 'Dune', role: 42 }, { mode: 'create' })).toEqual([]);
  });
});

describe('validateFields — patch', () => {
  it('ignores fields that are not present', () => {
    expect(validateFields(bookFields, { rating: 3 }, { mode: 'patch' })).toEqual([]);
  });

  it('still rejects clearing a required field', () => {
    expect(validateFields(bookFields, { title: null }, { mode: 'patch' })).toEqual([
      { path: 'title', code: 'required' },
    ]);
  });
});

describe('validateFields — types and constraints', () => {
  const check = (data: Record<string, unknown>) =>
    validateFields(bookFields, { title: 'Dune', ...data }, { mode: 'create' });

  it.each([
    [{ rating: '5' }, 'rating', 'type'],
    [{ rating: 2.5 }, 'rating', 'type'],
    [{ price: Number.NaN }, 'price', 'type'],
    [{ isFavorite: 'true' }, 'isFavorite', 'type'],
    [{ finishedAt: '2026-02-30' }, 'finishedAt', 'type'],
    [{ finishedAt: '15.9.2026' }, 'finishedAt', 'type'],
    [{ importedAt: 'yesterday' }, 'importedAt', 'type'],
    [{ readingStatus: 'burned' }, 'readingStatus', 'enum'],
    [{ title: 'D' }, 'title', 'minLength'],
    [{ title: 'D'.repeat(21) }, 'title', 'maxLength'],
    [{ rating: 0 }, 'rating', 'min'],
    [{ rating: 6 }, 'rating', 'max'],
    [{ contactEmail: 'not-an-email' }, 'contactEmail', 'format'],
    [{ website: 'mailto:a@b.cz' }, 'website', 'format'],
    [{ website: 'example.com' }, 'website', 'format'],
  ])('rejects %j as %s: %s', (data, path, code) => {
    expect(check(data)).toEqual([expect.objectContaining({ path, code })]);
  });

  it('passes the constraint to the issue params', () => {
    expect(check({ title: 'D' })).toEqual([
      { path: 'title', code: 'minLength', params: { minLength: 2 } },
    ]);
    expect(check({ readingStatus: 'burned' })).toEqual([
      { path: 'readingStatus', code: 'enum', params: { values: ['want', 'reading', 'read'] } },
    ]);
  });

  it('reports every invalid field, not just the first', () => {
    expect(check({ rating: 9, contactEmail: 'nope' })).toHaveLength(2);
  });
});
