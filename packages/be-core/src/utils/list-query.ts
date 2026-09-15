import type { Request } from 'express';
import { Op, OrderItem, WhereOptions } from 'sequelize';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  RANGE_BOUNDS,
  RESERVED_QUERY_PARAMS,
  isDateOnly,
} from '@eleansphere/schema';
import type { FieldConfig, FilterOperator, QueryConfig, RangeBound } from '@eleansphere/schema';
import { HttpError } from '../app/error-handler';
import { combineWhere } from './combine-where';

type QueryParams = Request['query'];
type QueryValue = QueryParams[string];
type FilterParser = (name: string, field: FieldConfig | undefined, raw: QueryValue) => unknown;

export interface ListQuery {
  where: WhereOptions;
  order: OrderItem[];
  page: number;
  limit: number;
  offset: number;
}

const FIRST_PAGE = 1;
const DESCENDING_PREFIX = '-';
const LIST_SEPARATOR = ',';
const IS_NULL_KEY = 'isNull';
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const INTEGER_PATTERN = /^-?\d+$/;
/** Appended to every sort, so rows with equal sort keys never repeat or vanish between pages. */
const STABLE_SORT_COLUMN = 'id';
/** Backslash is Postgres' default escape character for LIKE patterns. */
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

const RANGE_OPERATORS: Record<RangeBound, symbol> = {
  gte: Op.gte,
  lte: Op.lte,
  gt: Op.gt,
  lt: Op.lt,
};

/** Columns every model has, filterable and sortable once listed in the query config. */
const SYSTEM_FIELD_CONFIGS: Record<string, FieldConfig> = {
  id: { type: 'STRING' },
  ownerId: { type: 'STRING' },
  createdAt: { type: 'DATE' },
  updatedAt: { type: 'DATE' },
};

function badQuery(message: string): HttpError {
  return new HttpError(400, message);
}

function isReservedParam(name: string): boolean {
  return (RESERVED_QUERY_PARAMS as readonly string[]).includes(name);
}

function isRangeBound(key: string): key is RangeBound {
  return (RANGE_BOUNDS as readonly string[]).includes(key);
}

function isNestedParams(raw: QueryValue): raw is QueryParams {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function requireSingleValue(name: string, raw: QueryValue): string {
  if (typeof raw !== 'string') throw badQuery(`"${name}" must be a single value`);
  return raw;
}

function parsePositiveInteger(name: string, raw: QueryValue, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = requireSingleValue(name, raw);
  if (!POSITIVE_INTEGER_PATTERN.test(value)) throw badQuery(`"${name}" must be a positive integer`);
  return Number(value);
}

/** Converts a query-string value to the field's type, rejecting what the column could never hold. */
function coerceValue(name: string, field: FieldConfig | undefined, raw: string): unknown {
  switch (field?.type) {
    case 'INTEGER':
      if (!INTEGER_PATTERN.test(raw)) throw badQuery(`"${name}" must be an integer`);
      return Number(raw);
    case 'FLOAT':
      if (raw.trim() === '' || !Number.isFinite(Number(raw))) {
        throw badQuery(`"${name}" must be a number`);
      }
      return Number(raw);
    case 'BOOLEAN':
      if (raw !== 'true' && raw !== 'false') throw badQuery(`"${name}" must be true or false`);
      return raw === 'true';
    case 'DATEONLY':
      if (!isDateOnly(raw)) throw badQuery(`"${name}" must be a date (YYYY-MM-DD)`);
      return raw;
    case 'DATE':
      if (Number.isNaN(Date.parse(raw))) throw badQuery(`"${name}" must be a timestamp`);
      return raw;
    case 'ENUM':
      if (!(field.values ?? []).includes(raw)) {
        throw badQuery(`"${name}" must be one of: ${(field.values ?? []).join(', ')}`);
      }
      return raw;
    default:
      return raw;
  }
}

function parseEquals(name: string, field: FieldConfig | undefined, raw: QueryValue): unknown {
  return coerceValue(name, field, requireSingleValue(name, raw));
}

function parseIn(name: string, field: FieldConfig | undefined, raw: QueryValue): unknown {
  const values = requireSingleValue(name, raw).split(LIST_SEPARATOR);
  return { [Op.in]: values.map((value) => coerceValue(name, field, value)) };
}

function parseRange(name: string, field: FieldConfig | undefined, raw: QueryValue): unknown {
  if (!isNestedParams(raw)) return parseEquals(name, field, raw);
  const condition: Record<symbol, unknown> = {};
  for (const [bound, boundRaw] of Object.entries(raw)) {
    const boundName = `${name}[${bound}]`;
    if (!isRangeBound(bound)) {
      throw badQuery(`"${boundName}" is not a range bound (use ${RANGE_BOUNDS.join(', ')})`);
    }
    condition[RANGE_OPERATORS[bound]] = parseEquals(boundName, field, boundRaw);
  }
  return condition;
}

function parseIsNull(name: string, _field: FieldConfig | undefined, raw: QueryValue): unknown {
  const flag = isNestedParams(raw) ? raw[IS_NULL_KEY] : undefined;
  if (flag !== 'true' && flag !== 'false') {
    throw badQuery(`"${name}" must be sent as ${name}[${IS_NULL_KEY}]=true or false`);
  }
  return flag === 'true' ? { [Op.is]: null } : { [Op.not]: null };
}

const FILTER_PARSERS: Record<FilterOperator, FilterParser> = {
  eq: parseEquals,
  in: parseIn,
  range: parseRange,
  isNull: parseIsNull,
};

function parseFilters(
  query: QueryParams,
  config: QueryConfig,
  fields: Record<string, FieldConfig>
): WhereOptions {
  const allowedFilters = config.filter ?? {};
  const where: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(query)) {
    if (isReservedParam(name)) continue;
    const operator = allowedFilters[name];
    if (!operator) throw badQuery(`Unknown query parameter "${name}"`);
    where[name] = FILTER_PARSERS[operator](name, fields[name], raw);
  }
  return where as WhereOptions;
}

function escapeLikePattern(text: string): string {
  return text.replace(LIKE_SPECIAL_CHARACTERS, '\\$&');
}

function parseSearch(raw: QueryValue, config: QueryConfig): WhereOptions | undefined {
  if (raw === undefined) return undefined;
  const searchableColumns = config.search ?? [];
  if (searchableColumns.length === 0) throw badQuery('This list does not support "q"');
  const text = requireSingleValue('q', raw).trim();
  if (text === '') return undefined;
  const pattern = `%${escapeLikePattern(text)}%`;
  return { [Op.or]: searchableColumns.map((column) => ({ [column]: { [Op.iLike]: pattern } })) };
}

function sortTerms(expression: string): string[] {
  return expression.split(LIST_SEPARATOR).filter((term) => term !== '');
}

function columnOfSortTerm(term: string): string {
  return term.startsWith(DESCENDING_PREFIX) ? term.slice(DESCENDING_PREFIX.length) : term;
}

function parseSort(raw: QueryValue, config: QueryConfig): OrderItem[] {
  const expression = raw === undefined ? config.defaultSort : requireSingleValue('sort', raw);
  const defaultSortColumns = sortTerms(config.defaultSort ?? '').map(columnOfSortTerm);
  const sortableColumns = new Set([...(config.sort ?? []), ...defaultSortColumns]);

  const order = sortTerms(expression ?? '').map((term): OrderItem => {
    const column = columnOfSortTerm(term);
    if (!sortableColumns.has(column)) throw badQuery(`Cannot sort by "${column}"`);
    return [column, term.startsWith(DESCENDING_PREFIX) ? 'DESC' : 'ASC'];
  });
  return [...order, [STABLE_SORT_COLUMN, 'ASC']];
}

/**
 * Turns a list request's query string into a where-clause, order and page, allowing only what
 * `config` declares: unknown parameters, unsortable columns and values of the wrong type are 400s.
 * `?limit` above the maximum is clamped rather than rejected; the response reports the real limit.
 */
export function parseListQuery(
  query: QueryParams,
  config: QueryConfig,
  fields: Record<string, FieldConfig>
): ListQuery {
  const knownFields = { ...SYSTEM_FIELD_CONFIGS, ...fields };
  const page = parsePositiveInteger('page', query.page, FIRST_PAGE);
  const requestedLimit = parsePositiveInteger(
    'limit',
    query.limit,
    config.defaultLimit ?? DEFAULT_PAGE_LIMIT
  );
  const limit = Math.min(requestedLimit, config.maxLimit ?? MAX_PAGE_LIMIT);

  return {
    where: combineWhere(parseFilters(query, config, knownFields), parseSearch(query.q, config)),
    order: parseSort(query.sort, config),
    page,
    limit,
    offset: (page - FIRST_PAGE) * limit,
  };
}
