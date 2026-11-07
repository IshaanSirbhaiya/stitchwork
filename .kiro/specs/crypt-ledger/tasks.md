# Tasks: the Crypt

Provenance: this spec, including its `[x]` marks, was hand-written, outside Kiro, with an AI coding assistant. No Kiro feature has generated or executed it yet. See KIRO_USAGE.md Part A.

Status note: tasks marked `[x]` were implemented in the first build session (4 Nov 2026) and verified by `npm test`.

- [x] 1. Implement `sha256Hex`, `hmacHex` and `canonical` with Web Crypto in `src/engine/hash.ts`
  - _Requirements: 1.1_
- [x] 2. Implement `Ledger.append`, `Ledger.entries` and `failNext` in `src/engine/ledger.ts`
  - _Requirements: 1.1, 1.2, 1.4_
- [x] 3. Implement `verifyChain` with the three failure reasons
  - _Requirements: 2.1, 2.2_
- [x] 4. Implement `tamperDemo` on a deep copy
  - _Requirements: 3.1, 3.2_
- [x] 5. Write ledger tests including the single-mutation property
  - _Requirements: 1.1 to 3.1_
- [x] 6. Build the Crypt tab with steward-only access and word search
  - _Requirements: 4.1, 4.2_
- [x] 7. Persist the API Crypt to durable storage and write ahead before release. Done on 5 Nov 2026 through the `walnut-stitches` spec: with `STITCH_WALNUT_URL` set, every event is sealed into Walnut's `DecisionLedger` file before the next step. Not available on a plain Vercel deployment (see walnut-stitches task 12)
  - _Requirements: 1.3, 1.4_
