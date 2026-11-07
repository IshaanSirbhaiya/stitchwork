# Design: the Walnut stitches

## Overview

Two bodies, one creature. The Stitchwork engine (TypeScript, written for Kiroween 2026) keeps the pipeline order and both permission gates. The Walnut engine (Python, pre-existing, Apache-2.0) is vendored unchanged under `vendor/walnut/` and reached through a small loopback service, `stitch_walnut/`, which is new Stitchwork code. The engine calls the service through one interface, `WalnutStitches`, in `src/walnut/stitches.ts`.

```
browser or /api/ask
   |
   v
Engine.ask (src/engine/engine.ts)
   1 seal request.accepted ----------------------> POST /walnut/seal   -> DecisionLedger.append
   2 Gate 1, Gate 2, ghost check, BM25, compose    (TypeScript, unchanged)
   3 wall over composed sentences ---------------> POST /walnut/ground -> ground_narration,
                                                                         unsupported_named_terms,
                                                                         identity_assertion_violations,
                                                                         bind_sentences, SourcePointer
   4 seal retrieval.decided ---------------------> POST /walnut/seal
   5 build response (kept sentences, renumbered citations, Walnut report)
   6 seal answer.released -----------------------> POST /walnut/seal
   7 return
```

Each `record()` call seals into Walnut first and then appends to the in-page Crypt (`src/engine/ledger.ts`, unchanged). Either failing throws, and `ask` returns `ledger_unavailable`. A `WalnutUnavailableError` selects the stitches message; any other error keeps the original Crypt message.

## Components

| Component | File | Role |
|---|---|---|
| `WalnutStitches`, `HttpWalnut`, `probeWalnut` | `src/walnut/stitches.ts` | Interface and fetch client. 5 second timeout. Any non-200, network error or non-JSON body is `WalnutUnavailableError`. The probe accepts only `{ok: true, engine: "walnut"}`, so a static host's HTML fallback never attaches |
| `applyWall` | `src/engine/engine.ts` | Keeps sentences with `kept: true`, keeps citations still used, renumbers them, maps pointers to the new numbers. A sentence with no verdict is dropped |
| `Engine.record`, `Engine.attachWalnut`, `Engine.forgeNext` | `src/engine/engine.ts` | Dual write, late attachment from the browser probe, demo fault injection |
| Walnut binding | `stitch_walnut/walnut.py` | Puts `vendor/walnut/packages/core` on `sys.path`, loads `vendor/walnut/apps/gateway/databridge_gateway/llm.py` under a private module name, exposes `ground` and `WalnutCrypt` |
| Service | `stitch_walnut/server.py` | `ThreadingHTTPServer` on 127.0.0.1, 64 KB body limit. `DecisionRefused` is 503, `BadRequest` is 400, anything else 500 |
| UI | `src/ui/App.tsx`, `AskPanel.tsx`, `CryptPanel.tsx`, `OperatorPanel.tsx` | Header badge, Walnut report and pointer lines, durable Crypt verify and tamper demo, "Forge a stitch" control |
| API | `server/handler.ts`, `api/*.js` | `walnutUrl` from `STITCH_WALNUT_URL`; tests inject `walnut` directly |

## How the wall is applied

Walnut's wall was written for model narration over a tagged context. Stitchwork builds that context per sentence: `- [C<n>] <passage text>` for only the citations that sentence references. So a value found in passage 2 cannot rescue a sentence that cites only passage 1. The four Walnut checks are run as they are; Stitchwork only collects their findings into reasons. Stitchwork answers are extractive, so on real data the wall is expected to keep every sentence; the integration test asserts this for every persona and sample question. The wall earns its place on anything that is not a verbatim quote: the forged-stitch control, a clipped quote that cuts a number in half, and any future model narration.

## Durable Crypt

`WalnutCrypt` wraps `DecisionLedger(path, key=...)` as is: each record is `{type, at, data}` plus Walnut's `seq`, `prev`, `hash` and `seal`, and every append is anchored in `decision.anchors.jsonl` beside the log. The key comes from `STITCH_WALNUT_KEY` (at least 32 characters) or, for demos only, `--ephemeral-key`, which also starts a fresh log under `var/walnut/` so a new key never meets an old log. The tamper demo copies the log and the anchor ledger into a temporary directory, attacks the copies, verifies them with a new `DecisionLedger`, and hashes the real files before and after.

## Data models

`WalnutReport` (in `src/engine/types.ts`): `kept`, `dropped: {text, reasons}[]`, `pointers: {sentence, n, pointer}[]`, `seals: {type, seq}[]`. Hashes of durable records are deliberately not in the response: `retrieval.decided` counts denied passages, so its hash differs between a world with and without restricted documents.

## Error handling

| Failure | Result |
|---|---|
| Service down, timeout, non-200 | `ledger_unavailable` with the stitches message; nothing after the failed step runs |
| Durable Crypt broken, wrong key, no key | Service returns 503 (`walnut_refused`); same result |
| Malformed request to the service | 400; same result |
| Browser cannot find the service | In-page engine only; header says so |

## Dependencies

No new npm dependency. The service needs Python 3.11+, `pydantic` and `PyYAML` (`requirements-walnut.txt`), which the vendored Walnut code imports.

## Correctness properties

- P-W1 (requirement 6.1): with the stitches attached, a persona's response is unchanged when documents they cannot open are removed. `tests/walnut/engine-walnut.test.ts` (fast-check over personas and sample questions) and the real-engine check in `tests/walnut/sidecar.integration.test.ts`.
- P-W2 (requirement 1.1 and 6.2): the wall receives only doubly permitted, living citations.
- P-W3 (requirement 2.2): the seal order is accepted, wall, decided, released, and each Walnut seal precedes its in-page entry.
- P-W4 (requirement 5.2): vendored bytes equal the manifest.

## Testing strategy

- `tests/walnut/engine-walnut.test.ts`: wiring with an in-process fake (order, fail closed at each step, renumbering, forge, back-compatibility, P-W1).
- `tests/walnut/handler-walnut.test.ts`: API health flag, report, 503 on refusal and on an unreachable URL.
- `tests/walnut/sidecar.integration.test.ts`: the real Walnut engine on port 4790 (`STITCH_PYTHON`, `STITCH_WALNUT_TEST_PORT`); skipped with a warning when Python lacks pydantic or PyYAML.
- `tests_py/`: the wall's rules, pointers, the durable Crypt, the tamper demo, the HTTP service, and the vendored-bytes check.
