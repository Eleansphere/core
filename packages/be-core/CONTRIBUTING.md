# Contributing to be-core

## Normal workflow

```bash
npm install
npm run dev      # tsc --watch
npm run build     # one-off compile to dist/
npm run format
```

Before committing a change that should ship, add a changeset describing it:

```bash
npx changeset add
```

Pick the bump size honestly (patch for fixes/internal changes, minor for new backward-compatible
API, major for anything that breaks a consumer) and write a summary a consumer would understand.
Commit the generated `.changeset/*.md` file along with your change. CI opens/updates a
"Version Packages" PR from whatever changesets are pending on `main`; merging that PR is what
actually publishes to GitHub Packages.

## Developing against a consumer project without publishing

Publishing (even via the changeset PR) is too slow a loop for iterating on a change while you can
see it break/fix something in `klotilda-api`, `kniho-hlod-backend`, etc. Use `npm link` instead:

```bash
# 1. In this repo — build once, then register it as a linkable package
npm run build
npm link

# 2. In the consuming repo — point its @eleansphere/be-core at your local checkout
cd ../../klotilda/klotilda-api   # or wherever
npm link @eleansphere/be-core

# 3. While iterating, rebuild be-core after each change (or leave `npm run dev` running —
#    it recompiles dist/ on save, and the consumer sees it immediately, no relink needed)

# 4. When done, point the consumer back at the published version
npm unlink @eleansphere/be-core
npm install
```

`npm link` in step 2 rewrites the consumer's local `node_modules/@eleansphere/be-core` to a
symlink into this repo's `dist/` — it doesn't touch the consumer's `package.json` or lockfile, so
there's nothing to accidentally commit. `npm install` in step 4 restores the real published
version from the registry.
