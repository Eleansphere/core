import { Op, WhereOptions } from 'sequelize';

function isEmptyWhere(where: WhereOptions | undefined): boolean {
  if (where === undefined) return true;
  const clause = where as object;
  return Object.keys(clause).length === 0 && Object.getOwnPropertySymbols(clause).length === 0;
}

/**
 * ANDs where-clauses together, skipping empty ones. A single clause comes back as-is, so plain
 * `{ column: value }` objects stay plain.
 */
export function combineWhere(...clauses: (WhereOptions | undefined)[]): WhereOptions {
  const present = clauses.filter((clause): clause is WhereOptions => !isEmptyWhere(clause));
  if (present.length === 0) return {};
  if (present.length === 1) return present[0];
  return { [Op.and]: present };
}
