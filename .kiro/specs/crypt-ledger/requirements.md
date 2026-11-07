# Requirements: the Crypt (tamper-evident audit ledger)

## Introduction

The Crypt is an append-only, hash-chained, sealed audit log. Each question writes three entries in order. Compliance can search it in plain words, verify the chain, and run a tamper demonstration on a copy. If the Crypt cannot be written, the answer is not released.

## Requirement 1: append and chain

**User story:** As a compliance officer, I want every request recorded before anything is retrieved, so that the log cannot miss a question that was answered.

#### Acceptance criteria

1. WHEN an entry is appended THE SYSTEM SHALL store `seq`, `at`, `type`, `data`, `prevHash`, `hash` and `seal`, where `hash` is SHA-256 over `prevHash` and the canonical JSON of `seq`, `at`, `type` and `data`, and `seal` is HMAC-SHA-256 of `hash` under the ledger key.
2. WHEN the first entry is appended THE SYSTEM SHALL use 64 zero characters as `prevHash`.
3. WHEN a question is answered THE SYSTEM SHALL append `request.accepted`, `retrieval.decided` and `answer.released` in that order, all sharing the request id.
4. IF an append fails THEN THE SYSTEM SHALL return `ledger_unavailable` and release no answer text.

## Requirement 2: verify

**User story:** As a compliance officer, I want to verify the whole log, so that I can show an auditor it was not edited.

#### Acceptance criteria

1. WHEN verify runs THE SYSTEM SHALL recompute every hash and seal and report `ok: true` with the entry count if all match.
2. IF any entry's data, order, hash or seal was changed THEN THE SYSTEM SHALL report `ok: false` with the first broken `seq` and the reason `hash-mismatch`, `seal-mismatch` or `chain-break`.

## Requirement 3: tamper demonstration

#### Acceptance criteria

1. WHEN the tamper demo runs THE SYSTEM SHALL copy the log, change the data of one entry in the copy, verify the copy, and show the result without changing the real log.
2. IF the log has no entries THEN THE SYSTEM SHALL show "The Crypt is empty. Ask a question first."

## Requirement 4: who can read the Crypt

#### Acceptance criteria

1. WHILE the selected persona is not in the `steward` group THE SYSTEM SHALL hide Crypt entries and show "The Crypt is sealed. Only a data steward can read it."
2. WHEN a steward types words into the Crypt search THE SYSTEM SHALL show entries whose type, persona or data contains every word, case-insensitive.

## Requirement 5: masking in the Crypt

#### Acceptance criteria

1. WHEN a question is recorded THE SYSTEM SHALL store the masked question text only.
