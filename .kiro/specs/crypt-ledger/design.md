# Design: the Crypt

## Data model

```ts
interface CryptEntry { seq: number; at: string; type: CryptType; data: Record<string, unknown>; prevHash: string; hash: string; seal: string }
type CryptType = "request.accepted" | "retrieval.decided" | "answer.released" | "ghost.exorcised" | "source.stitched" | "acl.changed";
```

`canonical(value)` serialises JSON with object keys sorted at every depth, so the same data always hashes the same way in the browser and in Node.

## Key handling

- Browser session: a random 32-byte key is generated per page load with `crypto.getRandomValues`. The seal proves the entries were written by this session's ledger, nothing more. This is honest for a demo and stated in the UI tooltip.
- API: each request builds a ledger keyed by a key derived from `STITCH_SECRET` (HMAC of the label `crypt-key`). The three entries for that request are returned as a receipt to a steward only, because they record denials; everyone else gets the count. Durable server-side storage is designed, not built: serverless instances are stateless and the free tiers used here provide no database.

## Failure injection

`Ledger` accepts a `failNext` flag used by the demo control "Seal the Crypt shut". The next append throws, and `Engine.ask` returns `ledger_unavailable`. This demonstrates Requirement 1.4 live.

## Verify algorithm

For i from 0: expect `seq == i`, expect `prevHash == previous.hash` (or zeros), recompute hash (else `hash-mismatch`), recompute seal (else `seal-mismatch`). A reorder shows up as `chain-break` or a `seq` mismatch, reported as `chain-break`.

## Testing strategy

`tests/engine/ledger.test.ts`:
- chain of 5 verifies.
- fast-check property: for any non-empty log and any single entry index, changing that entry's data makes verify fail at that index.
- swapping two entries fails with `chain-break`.
- forging a hash without the key fails with `seal-mismatch`.
- `failNext` makes `Engine.ask` return `ledger_unavailable` with no sentences.
