# Eleansphere core

The shared foundation used across Eleansphere projects (Klotilda, Kniho-hlod), published to GitHub
Packages under the `@eleansphere` scope.

| Package | What it is |
|---|---|
| [`@eleansphere/be-core`](packages/be-core) | Express + Sequelize backend framework: `createApp`, declarative `ModelConfig`, auth router, detached file service, email |
| [`@eleansphere/entity-core`](packages/entity-core) | Client toolkit: `defineEntity` (model config + DTOs + typed HTTP service from one definition), `ApiClient`, `AuthService`, `createServiceContainer`, `toModelConfigs` |

Both packages used to live in their own repositories (`Eleansphere/be-core`,
`Eleansphere/entity-core`); their full history was imported here. Package names are unchanged.

## Quick start

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the release flow and for developing against a consumer
project without publishing.
