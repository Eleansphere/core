# @eleansphere/be-core

A reusable backend core library for Express.js + Sequelize applications. Eliminates boilerplate by providing factory functions for CRUD operations, authentication, model management, and file uploads.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [AppConfig](#appconfig)
  - [ModelConfig](#modelconfig)
  - [Plugins](#plugins)
- [API](#api)
  - [createApp](#createapp)
  - [createSequelize](#createsequelize)
  - [createCrudRouter](#createcrudrouter)
  - [createAuthRouter](#createauthrouter)
  - [createVerifyToken](#createverifytoken)
  - [createExtractUser](#createextractuser)
  - [createFileRouter](#createfilerouter)
  - [generateId](#generateid)
- [Types](#types)
- [Development](#development)

---

## Installation

The library is published to GitHub Packages. Add an `.npmrc` file to your project:

```
@eleansphere:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Then install:

```bash
npm install @eleansphere/be-core
```

---

## Quick Start

```typescript
import { createApp } from '@eleansphere/be-core';

createApp({
  port: 3000,
  db: {
    host: 'localhost',
    port: 5432,
    database: 'mydb',
    username: 'postgres',
    password: 'secret',
  },
  jwtSecret: 'my-jwt-secret',
  modelConfigs: [
    {
      name: 'Product',
      prefix: 'prod',
      fields: [
        { name: 'name', type: 'STRING', required: true },
        { name: 'price', type: 'FLOAT', required: true },
        { name: 'description', type: 'TEXT' },
      ],
    },
  ],
});
```

This starts an Express server with auto-generated CRUD endpoints at `/api/products`.

---

## Configuration

### AppConfig

| Field          | Type              | Description                                          |
|----------------|-------------------|------------------------------------------------------|
| `port`         | `number`          | Port the server listens on                           |
| `db`           | `DbConfig`        | PostgreSQL connection configuration                  |
| `jwtSecret`    | `string`          | Secret key for signing JWT tokens                    |
| `userModel`    | `Model`           | Sequelize user model (required for auth endpoints)   |
| `modelConfigs` | `ModelConfig[]`   | Declarative database model configurations            |
| `plugins`      | `ProjectPlugin[]` | Plugins with custom models and routes                |

### ModelConfig

Models can be defined declaratively as a JSON configuration. The library automatically creates a Sequelize model and mounts CRUD routes from it.

```typescript
const productConfig: ModelConfig = {
  name: 'Product',        // Model name (PascalCase)
  prefix: 'prod',         // Prefix for ID generation (e.g. "prod_abc123...")
  routePath: '/products', // Optional custom route path (default: /api/{name}s)
  logging: true,          // Enable action logging (optional)
  userScoped: true,       // Scope all routes to the authenticated user (optional, see below)
  fields: [
    {
      name: 'title',
      type: 'STRING',      // STRING | TEXT | INTEGER | FLOAT | BOOLEAN | DATE | BLOB
      required: true,
      unique: true,
      minLength: 3,
      maxLength: 100,
    },
    {
      name: 'price',
      type: 'FLOAT',
      min: 0,
    },
    {
      name: 'email',
      type: 'STRING',
      email: true,         // Validate email format
    },
  ],
};
```

**User-scoped models:**

Setting `userScoped: true` on a `ModelConfig` does two things:

1. All routes for that model require a valid JWT (`Authorization: Bearer <token>`).
2. `GET /` filters results to only records where `ownerId` matches the authenticated user's ID.

This means each user only sees and can interact with their own data. The model must have an `ownerId` field for this to work correctly.

```typescript
const noteConfig: ModelConfig = {
  name: 'note',
  prefix: 'n',
  userScoped: true,
  fields: {
    content: { type: 'TEXT', required: true },
    ownerId: { type: 'STRING', required: true },
  },
};
```

**`skipAutoRoutes`:**

Set `skipAutoRoutes: true` when a model needs custom plugin routes instead of auto-generated CRUD. The Sequelize model is still initialized and available via `models['name']` in plugin `registerRoutes`, but no routes are mounted automatically.

```typescript
// index.ts — model is registered but routes come from plugin.ts
modelConfigs: [
  { ...userEntity.config, skipAutoRoutes: true },
]

// plugin.ts — custom routes with bcrypt hooks
registerRoutes(app, _sequelize, models) {
  const extractUser = createExtractUser(process.env.JWT_SECRET!);
  app.use('/api/users', extractUser, createCrudRouter({ model: models['user'], ... }));
}
```

**Available field validations:**

| Validation  | Type      | Description                    |
|-------------|-----------|--------------------------------|
| `required`  | `boolean` | Field is required              |
| `unique`    | `boolean` | Value must be unique           |
| `minLength` | `number`  | Minimum string length          |
| `maxLength` | `number`  | Maximum string length          |
| `min`       | `number`  | Minimum numeric value          |
| `max`       | `number`  | Maximum numeric value          |
| `email`     | `boolean` | Validate email format          |
| `url`       | `boolean` | Validate URL format            |

### Plugins

Plugins allow you to register custom Sequelize models and Express routes:

```typescript
import { ProjectPlugin } from '@eleansphere/be-core';
import { Express } from 'express';
import { Sequelize } from 'sequelize';

const myPlugin: ProjectPlugin = {
  registerModels(sequelize: Sequelize) {
    // Initialize your custom Sequelize models
    MyModel.init({ ... }, { sequelize });
    return { MyModel };
  },

  registerRoutes(app: Express, models: Record<string, any>) {
    app.get('/api/custom', (req, res) => {
      res.json({ ok: true });
    });
  },
};
```

---

## API

### createApp

Creates and starts an Express application with all configured routes and database connection.

```typescript
createApp(config: AppConfig): void
```

Automatically handles:
- PostgreSQL connection via Sequelize
- JSON body parsing and CORS
- Database model synchronization
- Mounting CRUD routes for all `modelConfigs`
- Mounting auth routes (`/api/auth/login`, `/api/auth/me`) when `userModel` is provided
- Plugin registration

---

### createSequelize

Creates a Sequelize instance for PostgreSQL.

```typescript
createSequelize(config: DbConfig): Sequelize
```

```typescript
const sequelize = createSequelize({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  username: 'postgres',
  password: 'secret',
});
```

---

### createCrudRouter

Generates an Express router with a full set of CRUD endpoints for a given Sequelize model.

```typescript
createCrudRouter(options: GenericCrudOptions): Router
```

**Generated endpoints:**

| Method   | Path   | Description          |
|----------|--------|----------------------|
| `POST`   | `/`    | Create a record      |
| `GET`    | `/`    | Get records — returns `{ data: T[], total: number }`. Supports `?page=1&limit=20` for server-side pagination. |
| `GET`    | `/:id` | Get a record by ID   |
| `PUT`    | `/:id` | Update a record      |
| `DELETE` | `/:id` | Delete a record      |

**Options (`GenericCrudOptions`):**

```typescript
createCrudRouter({
  model: MyModel,
  middleware: [verifyToken],          // Optional middleware for protected routes
  logging: true,                      // Log actions to console
  beforeCreate: async (data) => {     // Hook before creating a record
    return { ...data, slug: slugify(data.name) };
  },
  beforeUpdate: async (data) => {     // Hook before updating a record
    return data;
  },
});
```

---

### createAuthRouter

Creates a router for JWT-based authentication.

```typescript
createAuthRouter(UserModel: Model, config: AuthConfig): Router
```

**Endpoints:**

| Method | Path             | Description                                 |
|--------|------------------|---------------------------------------------|
| `POST` | `/api/auth/login`| Login with email + password, returns JWT    |
| `GET`  | `/api/auth/me`   | Get the authenticated user's info (JWT)     |

**Login example:**

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secret123"
}
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id": "user_abc123",
  "email": "user@example.com",
  "role": "admin"
}
```

---

### createVerifyToken

Factory function that returns an Express middleware for verifying JWT tokens. Attaches the decoded payload to `req.user`.

```typescript
createVerifyToken(jwtSecret: string): RequestHandler
```

```typescript
const verifyToken = createVerifyToken(process.env.JWT_SECRET);

app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ id: (req as any).user.id });
});
```

---

### createExtractUser

Alias for `createVerifyToken` — attaches the decoded JWT payload to `req.user`. Safe to use on any route including those with a request body.

Used automatically by `mountModelRoutes` when `userScoped: true`.

```typescript
createExtractUser(jwtSecret: string): RequestHandler
```

```typescript
const extractUser = createExtractUser(process.env.JWT_SECRET);

app.post('/api/my-resource', extractUser, (req, res) => {
  const userId = (req as any).user.id;
  // req.body is untouched
  res.json({ userId, data: req.body });
});
```

---

### createFileRouter

Creates a router for uploading and downloading files stored as BLOBs in the database.

```typescript
createFileRouter(Model: Model, fieldConfig: FileFieldConfig): Router
```

**Endpoints:**

| Method | Path               | Description             |
|--------|--------------------|-------------------------|
| `POST` | `/:id/{fieldName}` | Upload a file           |
| `GET`  | `/:id/{fieldName}` | Download / serve a file |

---

### generateId

Generates a unique prefixed ID.

```typescript
generateId(prefix: string): string
```

```typescript
generateId('user');    // => "user_k3j2h9x1m..."
generateId('product'); // => "product_a8f3n2p7q..."
```

---

## Types

### CoreEntity

Base class for all models. Extends Sequelize `Model` with standard fields:

| Field       | Type     | Description                                  |
|-------------|----------|----------------------------------------------|
| `id`        | `string` | Primary key (generated via `generateId`)     |
| `createdAt` | `Date`   | Record creation timestamp                    |
| `updatedAt` | `Date`   | Last update timestamp                        |

```typescript
import { CoreEntity } from '@eleansphere/be-core';
import { DataTypes } from 'sequelize';

class Product extends CoreEntity {
  declare name: string;
  declare price: number;
}

Product.initModel(
  {
    name: { type: DataTypes.STRING },
    price: { type: DataTypes.FLOAT },
  },
  sequelize,
  'Product',
  'prod'
);
```

### ProjectPlugin

```typescript
interface ProjectPlugin {
  registerModels?(sequelize: Sequelize): Record<string, ModelStatic<any>>;
  registerRoutes(app: Express, models: Record<string, ModelStatic<any>>): void;
}
```

---

## Development

### Requirements

- Node.js 22+
- PostgreSQL

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run dev
```

### Format code

```bash
npm run format
```

### Publishing

Publishing happens automatically via GitHub Actions on push to `main` or `dev`:

- `main` — bumps the minor version (e.g. `1.1.0` → `1.2.0`)
- `dev` — bumps the patch version (e.g. `1.1.0` → `1.1.1`)

---

## License

ISC — [Eleansphere](https://github.com/Eleansphere)
