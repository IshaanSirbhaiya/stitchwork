---
inclusion: fileMatch
fileMatchPattern: ["src/engine/**/*.ts", "src/walnut/**/*.ts", "server/**/*.ts", "api/**/*.js", "stitch_walnut/**/*.py"]
---

# Governance invariants (loaded when touching the engine, the stitches or the API)

These invariants are tested. Breaking one is a release blocker, not a refactor.

1. Identity comes only from the signed token (API) or the persona selected in the session (UI). No request body field, query text or document content can change who the asker is. The open `/api/session` is a labelled demo control (`demoIdentity: true`); `STITCH_SESSION_KEY` closes it.
2. Gate 1 filters by the ACL captured at indexing time. Gate 2 re-checks every surviving passage against the live ACL registry. An error, a missing entry or a thrown exception in Gate 2 means deny.
3. Ranking statistics (document frequency, average length) are computed only over passages that passed both gates. A denied passage must not shift any score.
4. Ghost detection runs only over passages the asker can see. Never reveal that a newer version exists if the asker cannot open it.
5. The asker's response never contains counts of denied passages. Denial counts go to the Crypt, which only the `steward` group can read; through the API that means only a steward receives `crypt` entries, because they record denials and their hashes depend on them. No stitches route returns Crypt records. The Walnut report in a response carries seal sequence numbers, never durable record hashes.
6. `request.accepted` is appended before retrieval and `retrieval.decided` before composing the response. If an append fails, return `ledger_unavailable` and release nothing. With the Walnut stitches attached, each event is sealed into Walnut first, and a failed seal or wall call also releases nothing.
7. Card numbers that pass the Luhn check and Singapore NRIC/FIN patterns are masked before indexing and before they enter the Crypt.
8. The Walnut grounding wall sees only passages that passed both gates and are not ghosts, and each sentence is checked only against the passages it cites.
9. `vendor/walnut/` is never modified. Behaviour changes go in `stitch_walnut/`.
10. The stitches refuse a foreign Host or Origin and any POST that is not `application/json`. A durable Crypt also requires `STITCH_WALNUT_CALLER_KEY`.
11. An upload never widens access. A file that declares a narrower audience is refused, a Jira issue security level stays a restriction, and a present but empty ACL key means nobody.

Tests that guard these: `tests/engine/uniform.property.test.ts`, `tests/engine/gates.test.ts`, `tests/engine/ledger.test.ts`, `tests/engine/mask.test.ts`, `tests/server/handler.test.ts`, `tests/server/boundary.test.ts`, `tests/engine/documented-payloads.test.ts`, `tests/walnut/engine-walnut.test.ts`, `tests/walnut/sidecar.integration.test.ts`, `tests_py/test_service_boundary.py`, `tests_py/test_vendor_unchanged.py`.
