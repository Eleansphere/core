/**
 * A minimal in-memory stand-in for a Sequelize `ModelStatic`, covering just what
 * `createCrudRouter`/`createAuthRouter` call: `findOne`, `findByPk`, `findAll`,
 * `findAndCountAll`, `create`. No real DB — routes are tested at the HTTP layer via `supertest`
 * without needing Postgres.
 */

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function attachInstanceMethods(row: Row, rows: Row[]): Row {
  row.toJSON = () => {
    const { toJSON, update, destroy, get, ...plain } = row;
    return plain;
  };
  // Like Sequelize: `get('name')` reads one value, `get({ plain: true })` copies them all.
  row.get = (key: string | { plain: true }) => (typeof key === 'string' ? row[key] : row.toJSON());
  row.update = async (data: Row) => {
    Object.assign(row, data);
    return row;
  };
  row.destroy = async () => {
    const index = rows.indexOf(row);
    if (index !== -1) rows.splice(index, 1);
  };
  return row;
}

export function createFakeModel(name: string, initialRows: Row[] = []) {
  const rows: Row[] = initialRows.map((row) => ({ ...row }));
  rows.forEach((row) => attachInstanceMethods(row, rows));

  return {
    name,
    async findOne({ where }: { where?: Row } = {}) {
      return rows.find((row) => matchesWhere(row, where)) ?? null;
    },
    async findByPk(id: string) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findAll({ where, order }: { where?: Row; order?: [string, 'ASC' | 'DESC'][] } = {}) {
      let result = rows.filter((row) => matchesWhere(row, where));
      if (order) {
        for (const [field, dir] of [...order].reverse()) {
          result = [...result].sort((a, b) => {
            const cmp = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
            return dir === 'DESC' ? -cmp : cmp;
          });
        }
      }
      return result;
    },
    async findAndCountAll({
      where,
      limit,
      offset = 0,
    }: { where?: Row; limit?: number; offset?: number } = {}) {
      const filtered = rows.filter((row) => matchesWhere(row, where));
      return {
        count: filtered.length,
        rows: limit !== undefined ? filtered.slice(offset, offset + limit) : filtered,
      };
    },
    async create(data: Row) {
      const row = attachInstanceMethods({ ...data }, rows);
      rows.push(row);
      return row;
    },
    // test-only escape hatch to inspect current state
    __rows: rows,
  };
}
