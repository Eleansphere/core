# Contributing

## Tooling

- Node from `.nvmrc`, pnpm pinned by `packageManager` in `package.json`. Without a global pnpm, run
  everything through corepack: `corepack pnpm <command>`.
- One lockfile, one ESLint/Prettier config at the root. Internal dependencies use `workspace:^`.

```bash
pnpm install
pnpm build       # every package, in dependency order
pnpm dev         # tsc --watch in every package
pnpm lint
pnpm typecheck   # needs a prior build: entity-core type-checks against be-core's dist types
pnpm test
```

## Releasing

Every change that should ship needs a changeset:

```bash
pnpm changeset
```

Pick the bump honestly (patch = fix or internal, minor = new backward-compatible API, major =
anything that breaks a consumer) and write the summary for a consumer. Commit the generated
`.changeset/*.md` with the change. On `main`, the Release workflow opens or updates a
"chore: version packages" PR; merging it publishes to GitHub Packages.

### Pre-releases

Large breaking rounds are released as pre-releases first (`pnpm changeset pre enter next` →
versions like `3.0.0-next.0`). Consumers opt in by pinning an exact `-next` version; everyone else
stays on the current major. `pnpm changeset pre exit` ends the round and the next version PR
publishes the stable versions.

## Developing against a consumer project without publishing

Use a local, **uncommitted** pnpm workspace one directory above the repositories instead of
`npm link` or `ln -s` (Git Bash on Windows silently copies instead of symlinking). For example
`C:\Users\<you>\Documents\projekty\pnpm-workspace.yaml`:

```yaml
packages:
  - eleansphere/core/packages/*
  - kniho-hlod/packages/*
  - kniho-hlod/apps/*
linkWorkspacePackages: true
```

Running `pnpm install` in that parent directory links the packages through directory junctions
(no admin rights needed) into one dependency tree, so there are no duplicate `sequelize` or
`@types/express` copies. Running `pnpm install` inside a single repository gives you the published
versions again. Keep `pnpm dev` running here so consumers see changes immediately.

The linked install writes its own `pnpm-lock.yaml` into that parent directory and leaves each
repository's lockfile untouched, so nothing linked can be committed by accident. (A
`link:../be-core` entry inside this repository's own lockfile is normal: that is how pnpm records a
`workspace:^` dependency.)
