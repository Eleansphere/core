---
"@eleansphere/be-core": patch
---

Update dependencies to fix npm audit findings: `bcrypt` 5→6 (drops the vulnerable
`@mapbox/node-pre-gyp`/`tar` chain in favor of `node-gyp-build`), `sequelize` patched to
6.37.8 (fixes vulnerable `dottie`/`validator` transitive versions). No public API change —
be-core only uses `bcrypt.hash`/`bcrypt.compare`, stable across both majors.
