# Tasks: the Walnut stitches

Provenance: this spec, including its `[x]` marks, was hand-written, outside Kiro, with an AI coding assistant. No Kiro feature has generated or executed it yet. See KIRO_USAGE.md Part A.

Status note: tasks marked `[x]` were implemented on 5 Nov 2026 outside Kiro and verified by `npm test` and `python -m pytest tests_py`. Unchecked tasks are open and are meant to be run in Kiro.

- [x] 1. Vendor the Walnut engine unchanged: `vendor/walnut/` with LICENSE, NOTICE, README and `MANIFEST.sha256`; mark it `-text` in `.gitattributes`
  - _Requirements: 5.1, 5.2_
- [x] 2. Write `stitch_walnut/walnut.py`: load `databridge_core` and the grounding-wall file under a private name; `ground` per sentence against its own citations; `pointer_for`; `WalnutCrypt` with seal, verify, entries and tamper demo
  - _Requirements: 1.2, 1.6, 2.1, 2.5, 5.3_
- [x] 3. Write `stitch_walnut/server.py`: loopback JSON routes, key rules, 400/503/500 mapping
  - _Requirements: 3.2, 3.3_
- [x] 4. Write `tests_py/` for the wall, pointers, durable Crypt, tamper demo, service and vendored bytes
  - _Requirements: 1.2, 1.6, 2.5, 3.2, 3.3, 5.2, 5.3_
- [x] 5. Add `WalnutStitches`, `HttpWalnut` and `probeWalnut` in `src/walnut/stitches.ts`
  - _Requirements: 3.1, 3.4_
- [x] 6. Wire the engine: `record()` dual write, the wall after compose, `applyWall`, `forgeNext`, the stitches message, the trail step
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 2.1, 2.2, 2.3, 2.6, 3.1, 4.3, 6.3_
- [x] 7. Wire the API: `walnutUrl` and injected `walnut` in `server/handler.ts`; `STITCH_WALNUT_URL` in `api/*.js`; health flag
  - _Requirements: 4.1, 4.2_
- [x] 8. UI: header badge, Walnut report, pointer lines, durable Crypt verify and tamper demo, forge control; Vite proxy for `/walnut`
  - _Requirements: 1.3, 1.7, 2.4, 2.5, 3.4, 4.3_
- [x] 9. Tests: `tests/walnut/engine-walnut.test.ts`, `handler-walnut.test.ts`, `sidecar.integration.test.ts` (real engine)
  - _Requirements: all_
- [ ] 10. Run Analyze Requirements on this spec in Kiro and record the questions and the edits accepted
- [ ] 11. Add a property-based test that random forged sentences (a random number or capitalised name not in the cited passage, appended to a real answer) are always dropped by the real wall
  - _Requirements: 1.2, 1.7_
- [ ] 12. Package the API and the stitches together for a host that keeps a process alive (for example one container), since a Vercel function alone cannot run the Python service; until then the durable Crypt exists only where `python -m stitch_walnut` runs
  - _Requirements: 2.1, 4.1_
- [x] 13. Add the service boundary (Host, Origin, JSON only, caller key, no records route) and test it over real HTTP in `tests_py/test_service_boundary.py`
  - _Requirements: 7.1 to 7.4_
