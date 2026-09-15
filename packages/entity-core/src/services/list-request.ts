import type { PaginationParams } from '../entity-types';

export type { PaginationParams } from '../entity-types';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page?: number;
  limit?: number;
}

type ScalarFilterValue = string | number | boolean;
type NestedFilterValue = Record<string, ScalarFilterValue | undefined>;
type FilterParamValue = ScalarFilterValue | readonly ScalarFilterValue[] | NestedFilterValue;

/**
 * The untyped shape of a list request — what `ListParams` narrows per entity. Filter values:
 * a scalar (`eq`), a list (`in`), `{ gte, lte, gt, lt }` (`range`) or `{ isNull }`.
 */
export type ListRequest = PaginationParams & {
  filter?: Record<string, FilterParamValue | undefined>;
  sort?: string | readonly string[];
  q?: string;
};

const LIST_SEPARATOR = ',';

function isList(value: FilterParamValue): value is readonly ScalarFilterValue[] {
  return Array.isArray(value);
}

function isNested(value: FilterParamValue): value is NestedFilterValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appendFilter(query: Record<string, string>, column: string, value: FilterParamValue) {
  if (isList(value)) {
    query[column] = value.map(String).join(LIST_SEPARATOR);
    return;
  }
  if (isNested(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue !== undefined) query[`${column}[${key}]`] = String(nestedValue);
    }
    return;
  }
  query[column] = String(value);
}

/**
 * Flattens a list request into be-core's query-string format, e.g.
 * `{ filter: { rating: { gte: 4 }, readingStatus: ['read', 'reading'] }, sort: ['-rating'] }` →
 * `rating[gte]=4&readingStatus=read,reading&sort=-rating`.
 */
export function toListQueryParams(request: ListRequest = {}): Record<string, string> {
  const query: Record<string, string> = {};
  if (request.page !== undefined) query.page = String(request.page);
  if (request.limit !== undefined) query.limit = String(request.limit);
  if (request.q) query.q = request.q;
  if (request.sort !== undefined) {
    query.sort =
      typeof request.sort === 'string' ? request.sort : request.sort.join(LIST_SEPARATOR);
  }
  for (const [column, value] of Object.entries(request.filter ?? {})) {
    if (value !== undefined) appendFilter(query, column, value);
  }
  return query;
}
