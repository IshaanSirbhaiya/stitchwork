---
inclusion: always
---

# Tech stack

- Language: TypeScript (strict). No `any` in `src/engine` or `server`.
- Front end: React 19 with Vite 8. Plain CSS in `src/ui/styles.css` using custom properties. No UI framework.
- Engine: framework-free TypeScript in `src/engine`. It must run unchanged in the browser and in Node 20+ (serverless). Only Web-standard APIs: `crypto.subtle`, `TextEncoder`. No Node built-ins inside `src/engine`.
- Retrieval: hand-written BM25 (k1 = 1.2, b = 0.75). No vector database, no embeddings, no model calls. Answers are extractive and deterministic.
- API: Web-standard `Request -> Response` handlers in `server/`, bundled by Vite into one ES module (`api/_lib/stitchwork-api.mjs`) and exposed as Vercel Node.js functions by plain JS wrappers in `api/`. Bundling avoids extensionless ESM imports at runtime. Node.js runtime, not Edge. The signing secret comes from the `STITCH_SECRET` environment variable only.
- The Walnut stitches: `stitch_walnut/` is a Python 3.11+ standard-library HTTP service on 127.0.0.1 (default port 4711) that calls the vendored Walnut engine in `vendor/walnut/` (Apache-2.0, unchanged). It needs `pydantic` and `PyYAML` (`requirements-walnut.txt`). The TypeScript side talks to it only through `WalnutStitches` in `src/walnut/stitches.ts`. Optional: with no service, the app runs the in-page engine.
- Tests: Vitest 5 and fast-check 4 for property-based tests; Testing Library with jsdom for one UI smoke test; pytest for `stitch_walnut/`.
- Deploy targets: any static host for the UI (Vercel, Netlify, Cloudflare Pages). The API runs on Vercel only.

## Commands

- `npm test` runs every test once.
- `npm run test:leaks` runs the permission and uniform-response suites.
- `npm run build` type-checks, builds `dist/`, then rebuilds the API bundle.
- `npm run smoke:api` loads the `api/` wrappers in plain Node and checks identity, gating and that only a steward gets Crypt entries.
- `npm run check:dashes` fails on em or en dashes in Markdown.
- `npm run walnut` starts the stitches with a throwaway key; `npm run test:py` runs the pytest suite.
- Set `STITCH_PYTHON` to a Python with pydantic and PyYAML so `npm test` includes the real-engine suite (it is skipped, with a warning, otherwise).

## Dependency policy

Add a runtime dependency only with a written reason in the relevant spec's design.md. The current npm runtime dependencies are `react` and `react-dom` only. The Python service depends on `pydantic` and `PyYAML` because the vendored Walnut code imports them (walnut-stitches/design.md).
