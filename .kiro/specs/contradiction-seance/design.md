# Design: contradiction seance (draft, not built)

## Overview

A new pure module `src/engine/contradictions.ts` exporting `findContradictions(passages, tokenize) -> Contradiction[]`. It runs on the same living, doubly permitted passage set that `Engine.ask` already computes, so the privacy requirements hold by construction. `Engine` gains a `seance(identity)` method that reuses the gate and ghost steps.

```ts
interface QuantityMention { passageId: string; value: number; unit: string; context: string[]; sentence: string }
interface Contradiction { a: QuantityMention; b: QuantityMention; sharedTerms: string[]; current?: "a" | "b" }
```

## Algorithm

1. For each living passage, split into sentences and find quantity mentions with the regex `(\d+(?:\.\d+)?)\s*(days?|hours?|percent|%|SGD|USD)`.
2. For each mention, take the stemmed non-stop-word tokens within 6 tokens either side as its context.
3. For each pair of mentions from different documents with the same normalised unit and different values, compute shared context terms; keep pairs with 2 or more.
4. Label the likely current side using requirement 1.2. Sort and cap at 20.

Complexity is quadratic in mentions; the bundled corpus has fewer than 100 mentions, so this is acceptable. Record the cap in the UI if it triggers.

## UI

A fifth tab "Seance" between Ghosts and Crypt, plus a "Disputed" badge on citations in `AskPanel`.

## Testing strategy

- Unit tests for mention extraction, unit normalisation (`day`/`days`), and the pairing threshold.
- A property test reusing the uniform-response harness from `tests/engine/uniform.property.test.ts`.
