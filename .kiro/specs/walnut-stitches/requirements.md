# Requirements: the Walnut stitches

## Introduction

Stitchwork sews incompatible body parts together: four source formats with four permission models, a TypeScript engine written for Kiroween, and a pre-existing Python engine called Walnut. The Walnut stitches are the seams. Stitchwork calls three parts of the vendored, unchanged Walnut engine over a loopback service: its grounding wall, its source pointers and its sealed decision ledger. When the stitches are attached, no sentence is released unless Walnut's wall binds it to the passages it cites, and every Crypt event is sealed into Walnut's durable ledger before the next step runs. When the stitches are not attached, Stitchwork behaves exactly as before.

Glossary: "the stitches" is the service `python -m stitch_walnut`; "the wall" is Walnut's grounding wall; "the durable Crypt" is Walnut's `DecisionLedger` file.

Assumption, written down: the stitches do not know who a person is. They bind to 127.0.0.1 and are called by the Stitchwork engine (API or local browser). Identity is decided by the Stitchwork token, never by the stitches. Their own boundary is in requirement 7.

## Requirement 1: the grounding wall decides what is released

**User story:** As a compliance officer, I want every released sentence to be bound to the passages it cites by an independent checker, so that a stitched sentence can never carry a value or name its sources do not hold.

#### Acceptance criteria

1. WHEN the stitches are attached and the engine has composed an answer THE SYSTEM SHALL send each sentence with only the citations it references to the wall, after both permission gates and the ghost check.
2. WHEN the wall checks a sentence THE SYSTEM SHALL drop it if it states a value not bound to a cited passage, a capitalised name not in its cited passages, an identity asserted as verified, or no fact shared with its cited passages.
3. WHEN a sentence is dropped THE SYSTEM SHALL show the dropped text and the wall's reasons in the answer's Walnut report, and SHALL NOT include it in the answer sentences.
4. WHEN sentences are dropped THE SYSTEM SHALL keep only citations still used by a kept sentence and renumber them from 1 in their original order.
5. IF every sentence is dropped THEN THE SYSTEM SHALL return the `no_answer` shape.
6. WHEN a sentence is kept THE SYSTEM SHALL attach one Walnut `doc_span` SourcePointer per citation, whose span re-resolves to the quoted text (or to the whole passage when the quote was joined), with trust `untrusted` for chat and ticket sources and `trusted` otherwise.
7. WHEN the operator arms "Forge a stitch" THE SYSTEM SHALL append one forged sentence citing passage 1 to the next answer before the wall, and the wall SHALL drop it.

## Requirement 2: write ahead into the durable Crypt

**User story:** As an auditor, I want the Crypt to survive a restart and to be checkable by an engine that did not write the answer, so that the audit trail does not depend on one browser tab.

#### Acceptance criteria

1. WHEN the stitches are attached THE SYSTEM SHALL seal each Crypt event into Walnut's `DecisionLedger` before appending it to the in-page Crypt.
2. WHEN a question is answered THE SYSTEM SHALL seal `request.accepted` before retrieval, `retrieval.decided` after the wall and before the response is built, and `answer.released` before the response is returned.
3. WHEN the same event is sealed in both Crypts THE SYSTEM SHALL record identical data in both.
4. WHEN a steward selects "Verify Walnut Crypt" THE SYSTEM SHALL report the count of sealed entries and the head hash, or Walnut's reason for refusing the log.
5. WHEN a steward runs the Walnut tamper demo THE SYSTEM SHALL edit one entry, delete the last entry and reorder two entries in copies of the log and its anchor ledger, report whether Walnut detected each, and leave the real log byte for byte unchanged.
6. WHEN ghost exorcism, a source upload or an operator permission change is recorded THE SYSTEM SHALL seal it into the durable Crypt the same way.

## Requirement 3: fail closed

**User story:** As a compliance officer, I want a broken stitch to stop the answer, so that an unchecked answer is never released because a service was down.

#### Acceptance criteria

1. IF the stitches are attached and a seal or a wall call fails, times out (5 seconds) or answers with any status other than 200 THEN THE SYSTEM SHALL return `ledger_unavailable` with the message "The Walnut stitches could not check or seal this answer, so nothing was released."
2. IF the durable Crypt does not verify, or the stitches have no key of at least 32 characters, THEN THE SYSTEM SHALL refuse to seal (HTTP 503) and release nothing.
3. IF the stitches service is started without `STITCH_WALNUT_KEY` and without `--ephemeral-key` THEN THE SYSTEM SHALL refuse to start.
4. IF the browser's probe of `/walnut/health` does not return Walnut's own health document within 2 tries THEN THE SYSTEM SHALL run the in-page engine only and say so in the header.

## Requirement 4: the API and the browser

#### Acceptance criteria

1. WHEN `STITCH_WALNUT_URL` is set THE SYSTEM SHALL attach the stitches to every `/api/ask` request and report `walnut: true` in `/api/health`.
2. WHEN the stitches are attached THE SYSTEM SHALL include the Walnut report (kept count, dropped sentences with reasons, pointers, and the sequence numbers of the three seals) in the response, and SHALL NOT include durable Crypt hashes in it.
3. WHILE the stitches are attached THE SYSTEM SHALL show "Walnut grounding wall" in the pipeline trail.

## Requirement 5: the vendored engine stays unchanged

#### Acceptance criteria

1. THE SYSTEM SHALL keep the Walnut engine under `vendor/walnut/` with its Apache-2.0 LICENSE and a NOTICE that names it as pre-existing work.
2. WHEN tests run THE SYSTEM SHALL fail if any vendored file's SHA-256 differs from `vendor/walnut/MANIFEST.sha256` or if any file was added.
3. THE SYSTEM SHALL load only `databridge_core` and the grounding-wall file of the Walnut gateway, and SHALL NOT import the rest of the gateway.

## Requirement 6: the promises still hold

#### Acceptance criteria

1. WHILE the stitches are attached THE SYSTEM SHALL return the same response for a persona whether or not documents that persona cannot open exist, ignoring request ids and seal sequence numbers (permission-gates P1).
2. WHILE the stitches are attached THE SYSTEM SHALL send the wall only passages that passed both gates and are not ghosts.
3. IF the stitches are not attached THEN THE SYSTEM SHALL return responses with no `walnut` field and the original trail.

## Requirement 7: who may call the stitches

**User story:** As an auditor, I want the Crypt written only by Stitchwork, so that a web page open in the same browser cannot forge a sealed event or read what people asked.

Added 6 Nov 2026 after an audit sealed a forged `answer.released` with a text/plain POST from a foreign Origin.

#### Acceptance criteria

1. IF the Host or a present Origin is not loopback or named in `STITCH_WALNUT_ALLOW_HOSTS` THEN THE SYSTEM SHALL answer 403 and write nothing.
2. IF a POST is not `application/json` THEN THE SYSTEM SHALL answer 415 and write nothing.
3. THE SYSTEM SHALL have no route that returns Crypt records.
4. WHEN `STITCH_WALNUT_CALLER_KEY` is set THE SYSTEM SHALL answer 401 on every route except health unless the caller presents it. IF a durable Crypt is started without it THEN THE SYSTEM SHALL refuse to start.
