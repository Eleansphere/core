import { describe, it, expect, expectTypeOf } from 'vitest';
import { toStandardSchema } from './standard-schema';
import type { StandardSchemaV1 } from './standard-schema';
import type { Fields } from '../entity-types';

const loanFields = {
  bookId: { type: 'STRING', required: true },
  lentAt: { type: 'DATEONLY', required: true },
  dueAt: { type: 'DATEONLY' },
  note: { type: 'TEXT', maxLength: 10 },
} as const satisfies Fields;

async function validate<Output>(schema: StandardSchemaV1<Output>, value: unknown) {
  return schema['~standard'].validate(value);
}

describe('toStandardSchema', () => {
  it('reports field issues with a path, the code and params', async () => {
    const schema = toStandardSchema(loanFields, 'create');

    const result = await validate(schema, { lentAt: '2026-02-30', note: 'far too long here' });

    expect(result.issues).toEqual([
      { message: 'required', path: ['bookId'], code: 'required', params: undefined },
      { message: 'type', path: ['lentAt'], code: 'type', params: { type: 'DATEONLY' } },
      { message: 'maxLength', path: ['note'], code: 'maxLength', params: { maxLength: 10 } },
    ]);
  });

  it('formats messages with the given function', async () => {
    const schema = toStandardSchema(loanFields, 'create', {
      formatMessage: (issue) => `validation.${issue.code}`,
    });

    const result = await validate(schema, { lentAt: '2026-09-15' });

    expect(result.issues?.[0].message).toBe('validation.required');
  });

  it('checks only present fields in patch mode', async () => {
    const schema = toStandardSchema(loanFields, 'patch');

    expect(await validate(schema, { dueAt: '2026-10-01' })).toEqual({
      value: { dueAt: '2026-10-01' },
    });
  });

  it('runs refine only once the fields themselves are valid', async () => {
    const schema = toStandardSchema(loanFields, 'create', {
      refine: (loan) =>
        loan.dueAt && loan.dueAt < loan.lentAt ? [{ path: 'dueAt', code: 'min' }] : [],
    });

    const invalidFields = await validate(schema, { lentAt: '2026-09-15', dueAt: '2026-09-01' });
    expect(invalidFields.issues?.map((issue) => issue.path)).toEqual([['bookId']]);

    const invalidRange = await validate(schema, {
      bookId: 'bk_1',
      lentAt: '2026-09-15',
      dueAt: '2026-09-01',
    });
    expect(invalidRange.issues?.map((issue) => issue.path)).toEqual([['dueAt']]);
  });

  it('rejects a value that is not an object, without a field path', async () => {
    const result = await validate(toStandardSchema(loanFields, 'create'), 'nope');

    expect(result.issues).toEqual([
      { message: 'type', path: undefined, code: 'type', params: { type: 'object' } },
    ]);
  });

  it('types the output as the create DTO', () => {
    type Output = NonNullable<
      typeof toStandardSchema<typeof loanFields, 'create'> extends (
        ...args: never[]
      ) => StandardSchemaV1<infer Result>
        ? Result
        : never
    >;
    expectTypeOf<Output>().toEqualTypeOf<{
      bookId: string;
      lentAt: string;
      dueAt?: string | null;
      note?: string | null;
    }>();
  });
});
