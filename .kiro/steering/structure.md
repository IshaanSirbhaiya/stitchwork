---
inclusion: always
---

# Repository structure

```
.kiro/                 specs, steering, hooks (committed; never gitignored)
api/                   Vercel function entry points: plain JS wrappers only
api/_lib/              generated bundle of server/ (npm run build:api); never edit by hand
server/                Web-standard request handlers and token signing
src/engine/            the answer layer: adapters, masking, gates, ghosts, retrieval, ledger, pipeline
src/engine/adapters/   one file per source kind: wiki, tickets, chat, sheet, plus detect.ts for uploads
src/data/              synthetic Hollowmere Assurance dataset as TypeScript string modules
src/ui/                React components and styles
src/walnut/            the Walnut stitches client (interface, fetch client, probe)
stitch_walnut/         Python loopback service that binds to the vendored Walnut engine (new code)
vendor/walnut/         the Walnut engine: pre-existing, Apache-2.0, vendored UNCHANGED; never edit
tests/engine/          engine unit and property tests
tests/server/          API handler tests
tests/ui/              UI smoke test
tests/walnut/          Walnut stitches wiring tests and the real-engine integration suite
tests_py/              pytest suite for stitch_walnut and the vendored-bytes check
scripts/               repository checks used by hooks, plus smoke-api.mjs
```

## Conventions

- One adapter per source kind. Every adapter returns `SourceDocument[]` and copies the source's own permission fields without interpreting them.
- The pipeline order lives in `src/engine/engine.ts` and nowhere else.
- Test files mirror the module they cover: `src/engine/ghosts.ts` is covered by `tests/engine/ghosts.test.ts`.
- File names are kebab-case or single lowercase words; React components are PascalCase.
- After changing anything under `server/` or `src/engine/`, run `npm run build:api` so `api/_lib/stitchwork-api.mjs` matches, then `npm run smoke:api`.
- `vendor/walnut/` is a third-party library. Never edit, reformat or add files there. Change behaviour in `stitch_walnut/` instead. `tests_py/test_vendor_unchanged.py` fails on any byte change.
