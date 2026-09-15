import { validateFields } from '@eleansphere/schema';
import type { ValidationIssue, ValidationIssueCode, ValidationMode } from '@eleansphere/schema';
import type { Fields, InferCreateDto, InferUpdateDto } from '../entity-types';
import { toFieldConfigs } from '../field-configs';

/**
 * The Standard Schema v1 interface (https://standardschema.dev), copied here as the spec
 * recommends, so accepting it costs no dependency. Form libraries such as Nuxt UI's `UForm`,
 * VeeValidate or TanStack Form take any object of this shape as a schema.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult;
  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  export interface PathSegment {
    readonly key: PropertyKey;
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
}

/** A Standard Schema issue that still carries the machine-readable `code` and `params`. */
export interface FormIssue extends StandardSchemaV1.Issue {
  readonly code: ValidationIssueCode;
  readonly params?: Record<string, unknown>;
}

export type FormOutput<F extends Fields, Mode extends ValidationMode> = Mode extends 'create'
  ? InferCreateDto<F>
  : InferUpdateDto<F>;

export interface ToStandardSchemaOptions<Output> {
  /** Text a form shows for an issue, e.g. an i18n lookup. Default: the issue code. */
  formatMessage?: (issue: ValidationIssue) => string;
  /**
   * Cross-field rules, e.g. "due date can't be before the lent date". Runs only once every field
   * is valid on its own, so it can trust the types.
   */
  refine?: (data: Output) => ValidationIssue[];
}

const VENDOR = 'eleansphere';
/** `path` of an issue about the whole value rather than one field. */
const WHOLE_VALUE_PATH = '';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A Standard Schema that validates form data with the same rules be-core applies to the request
 * (`validateFields` from `@eleansphere/schema`): `create` checks every field, `patch` only the ones
 * present.
 *
 * ```vue
 * <UForm :schema="toStandardSchema(bookEntity.fields, 'create', { formatMessage })" :state="state">
 * ```
 */
export function toStandardSchema<F extends Fields, Mode extends ValidationMode>(
  fields: F,
  mode: Mode,
  options: ToStandardSchemaOptions<FormOutput<F, Mode>> = {}
): StandardSchemaV1<FormOutput<F, Mode>> {
  const fieldConfigs = toFieldConfigs(fields);
  const formatMessage = options.formatMessage ?? ((issue: ValidationIssue) => issue.code);

  const toFormIssue = (issue: ValidationIssue): FormIssue => ({
    message: formatMessage(issue),
    path: issue.path === WHOLE_VALUE_PATH ? undefined : [issue.path],
    code: issue.code,
    params: issue.params,
  });

  const findIssues = (value: Record<string, unknown>): ValidationIssue[] => {
    const fieldIssues = validateFields(fieldConfigs, value, { mode });
    if (fieldIssues.length > 0) return fieldIssues;
    return options.refine?.(value as FormOutput<F, Mode>) ?? [];
  };

  return {
    '~standard': {
      version: 1,
      vendor: VENDOR,
      validate(value) {
        if (!isRecord(value)) {
          const notAnObject: ValidationIssue = {
            path: WHOLE_VALUE_PATH,
            code: 'type',
            params: { type: 'object' },
          };
          return { issues: [toFormIssue(notAnObject)] };
        }
        const issues = findIssues(value);
        return issues.length > 0
          ? { issues: issues.map(toFormIssue) }
          : { value: value as FormOutput<F, Mode> };
      },
    },
  };
}
