# @eleansphere/schema

The field vocabulary shared by [`@eleansphere/be-core`](../be-core) and
[`@eleansphere/entity-core`](../entity-core). No runtime dependencies, ships ESM and CJS, runs in
Node and in the browser.

Server and client both use this package, so the API and a form can't disagree about what a valid
value is.

## Field and model config

```ts
import type { ModelConfig } from '@eleansphere/schema';

const loan: ModelConfig = {
  name: 'loan',
  prefix: 'ln_',
  userScoped: true,
  fields: {
    bookId: { type: 'STRING', required: true },
    lentAt: { type: 'DATEONLY', required: true },
    returnedAt: { type: 'DATEONLY' },
    status: { type: 'ENUM', values: ['active', 'returned'], default: 'active' },
    lastReminderSentAt: { type: 'DATE', readOnly: true },
  },
  query: { filter: { bookId: 'eq', returnedAt: 'isNull' }, sort: ['lentAt'], defaultSort: '-lentAt' },
  indexes: [{ fields: ['bookId'], unique: true, where: { returnedAt: null } }],
};
```

| Field type | Value | Notes |
|---|---|---|
| `STRING`, `TEXT` | `string` | `minLength`, `maxLength`, `format: 'email' \| 'url'` |
| `INTEGER`, `FLOAT` | `number` | `min`, `max` |
| `BOOLEAN` | `boolean` | |
| `DATE` | ISO timestamp string | |
| `DATEONLY` | `YYYY-MM-DD` | calendar date, no time zone |
| `ENUM` | one of `values` | stored as VARCHAR |
| `BLOB` | binary | not validated |

Field flags: `required`, `unique`, `default`, `sensitive` (stripped from responses), `hash: 'bcrypt'`,
`readOnly` (server-managed, never accepted from a request body).

Model options: `access` (`public` / `auth` / `owner` / `admin` / `{ roles }` per `read` and
`write`, default `auth`), `userScoped` (= `owner` for both), `query` (whitelisted list filters,
sorting, search, page limits), `indexes` (including partial ones).

## validateFields

```ts
import { validateFields } from '@eleansphere/schema';

validateFields(loan.fields, body, { mode: 'create' });
// → [{ path: 'lentAt', code: 'required' }, { path: 'status', code: 'enum', params: { values: [...] } }]
```

`mode: 'patch'` checks only the fields present, for partial updates. Issues carry a `code` and
`params` rather than a message, so clients translate them.

## Calendar dates

`isDateOnly`, `todayIn(timeZone, now?)`, `toDateOnlyIn(instant, timeZone)`, `addDays`,
`daysBetween`, `compareDateOnly`. Arithmetic runs on UTC midnight, so daylight-saving changes never
shift a date.
