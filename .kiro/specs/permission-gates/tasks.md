# Tasks: permission gates and the stitched answer

Provenance: this spec, including its `[x]` marks, was hand-written, outside Kiro, with an AI coding assistant. No Kiro feature has generated or executed it yet. See KIRO_USAGE.md Part A.

Status note: tasks marked `[x]` were implemented in the first build session (4 Nov 2026) and verified by `npm test`.

- [x] 1. Implement tokenizer with stop words and light suffix stemming in `src/engine/tokenize.ts`
  - _Requirements: 4.1, 4.2_
- [x] 2. Implement BM25 scoring over an arbitrary passage list in `src/engine/retrieve.ts`
  - _Requirements: 4.1, 4.2_
- [x] 3. Implement Gate 1 and Gate 2 filters with fail-closed live checks in `src/engine/gates.ts`
  - _Requirements: 2.1, 2.2, 3.1, 3.2_
- [x] 4. Implement sentence selection and citation building in `src/engine/answer.ts`
  - _Requirements: 4.3, 4.4, 4.5_
- [x] 5. Implement `Engine.ask` pipeline with injected clock and id generator in `src/engine/engine.ts`
  - _Requirements: 3.3, 5.2, 6.1_
- [x] 6. Write gate unit tests: Gate 1 deny, archived exclusion, revoke at source, registry throws
  - _Requirements: 2.1, 2.2, 3.1, 3.2_
- [x] 7. Write property tests P1, P2, P3 with fast-check in `tests/engine/uniform.property.test.ts`
  - _Requirements: 2.1, 3.2, 4.4, 5.1_
- [x] 8. Implement HMAC token sign and verify in `server/token.ts`
  - _Requirements: 1.2, 1.3_
- [x] 9. Implement `/api/health`, `/api/session`, `/api/ask` handlers in `server/handler.ts`, bundle them (`vite.api.config.ts`) and add plain JS Vercel wrappers in `api/` with `scripts/smoke-api.mjs`
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 6.2_
- [x] 10. Write API handler tests: unconfigured 503, missing token 401, forged token 401, expired token 401, body persona ignored, oversized body 400
  - _Requirements: 1.3, 1.4, 1.5, 6.2_
- [ ] 11. Deploy to Vercel with `STITCH_SECRET` set and run the curl checks in DEPLOY_STEPS.md against the live URL (manual, Ishaan)
  - _Requirements: 1.2, 1.5_
