# Contributing to entity-core

## Normal workflow

```bash
npm install
npm run dev      # tsc --watch
npm run build     # one-off compile to dist/
```

Before committing a change that should ship, add a changeset describing it (`npx changeset add`),
same as [be-core](https://github.com/Eleansphere/be-core/blob/main/CONTRIBUTING.md) and
[service-core](https://github.com/Eleansphere/service-core/blob/master/CONTRIBUTING.md).

## Developing against a consumer project without publishing

```bash
npm run build
npm link

cd ../../kniho-hlod/kniho-hlod-service   # or wherever
npm link @eleansphere/entity-core

# ...iterate, rebuild after each change (or leave `npm run dev` running)...

npm unlink @eleansphere/entity-core
npm install
```
