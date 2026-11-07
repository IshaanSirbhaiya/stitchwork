# Requirements: permission gates and the stitched answer

## Introduction

A question passes through two permission gates before any passage is ranked. The answer is extractive: each sentence is quoted from a permitted, living passage and stitched to a citation. A person who cannot open a document gets exactly the response they would get if the document did not exist. The same pipeline is served by a serverless API where identity comes only from a signed token.

## Requirement 1: identity

**User story:** As a compliance officer, I want identity to come from one trusted place, so that nobody can ask as someone else.

#### Acceptance criteria

1. WHEN the UI sends a question THE SYSTEM SHALL use the persona selected in the session as the asker.
2. WHEN the API receives a question THE SYSTEM SHALL take the asker only from the `sub` claim of a bearer token signed with HMAC-SHA-256 using `STITCH_SECRET`.
3. IF the token is missing, malformed, has a bad signature, or is older than 15 minutes THEN THE SYSTEM SHALL respond with HTTP 401 and the error `unauthenticated`.
4. WHEN a request body contains a `persona`, `user` or `as` field THE SYSTEM SHALL ignore it.
5. IF `STITCH_SECRET` is unset or shorter than 32 characters THEN THE SYSTEM SHALL respond to every API call except health with HTTP 503 and the error `not_configured`.

## Requirement 2: Gate 1 (index-time ACL)

**User story:** As a knowledge worker, I want search to cover only what I may open, so that nothing restricted can influence my answer.

#### Acceptance criteria

1. WHEN a question is asked THE SYSTEM SHALL keep only passages whose index-time ACL lists one of the asker's groups or the asker's user id.
2. WHEN a document's status is `archived` THE SYSTEM SHALL exclude its passages.

## Requirement 3: Gate 2 (live re-check)

**User story:** As a data steward, I want permissions re-checked at answer time, so that a permission removed at the source takes effect before the index is rebuilt.

#### Acceptance criteria

1. WHEN a passage passes Gate 1 THE SYSTEM SHALL re-check its document against the live ACL registry before ranking.
2. IF the live check throws, returns no entry, or denies THEN THE SYSTEM SHALL exclude the passage.
3. WHEN Gate 2 excludes a passage THE SYSTEM SHALL record the document id in the Crypt and SHALL NOT mention it in the asker's response.

## Requirement 4: ranking and answer composition

**User story:** As a knowledge worker, I want a short answer quoted from the best sources, so that I can trust it and check it.

#### Acceptance criteria

1. WHEN ranking THE SYSTEM SHALL score passages with BM25 (k1 = 1.2, b = 0.75) using statistics computed only over passages that passed both gates and are not ghosts.
2. WHEN a passage contains fewer than half of the distinct query terms, or less than 40 percent of the query's total IDF weight, THE SYSTEM SHALL treat it as not relevant. (Revised on 4 Nov 2026 after probing: the unweighted rule let "Can I work remotely?" match "working days".)
3. WHEN relevant passages exist THE SYSTEM SHALL cite at most 3 passages, each scoring at least 35 percent of the top score, and quote the best matching sentence of each.
4. WHEN an answer is released THE SYSTEM SHALL give every sentence at least one citation with source kind, title, location, version, updated date and the Gate 2 check time.
5. IF no passage is relevant THEN THE SYSTEM SHALL respond with status `no_answer` and the fixed message "No source you can open answers this yet."

## Requirement 5: restricted looks like nonexistent

**User story:** As a compliance officer, I want restricted records to be undetectable, so that an assistant cannot tip anyone off about a confidential case.

#### Acceptance criteria

1. WHEN the same asker asks the same question THE SYSTEM SHALL return an identical response (excluding request id and timestamps) whether or not documents the asker cannot open are present in the corpus.
2. THE SYSTEM SHALL NOT include counts of denied passages, denied document ids or denied titles in the asker's response.

Added 6 Nov 2026 after an audit found the API returning `gate1Denied` to every asker:

- 5.A WHEN the API answers a person outside the `steward` group THE SYSTEM SHALL return no Crypt entry and no count or id of anything denied, only the number of events sealed. The response bytes SHALL NOT change when a document that person cannot open is added or removed.
- 5.B WHEN `STITCH_SESSION_KEY` is unset THE SYSTEM SHALL label `/api/session` as demo identity (`demoIdentity: true`). WHEN it is set THE SYSTEM SHALL refuse a token to a caller who does not present it.

## Requirement 6: input limits

#### Acceptance criteria

1. IF the trimmed question is empty or longer than 300 characters THEN THE SYSTEM SHALL return the error `invalid_query` without writing to the Crypt.
2. IF an API request body is not valid JSON or larger than 4 KB THEN THE SYSTEM SHALL respond with HTTP 400 and the error `bad_request`.
