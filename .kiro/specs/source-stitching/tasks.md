# Tasks: source stitching

Provenance: this spec, including its `[x]` marks, was hand-written, outside Kiro, with an AI coding assistant. No Kiro feature has generated or executed it yet. See KIRO_USAGE.md Part A.

Status note: tasks marked `[x]` were implemented in the first build session (4 Nov 2026) and verified by `npm test`. Re-run "Sync Files" in Kiro to confirm status against the code.

- [x] 1. Define shared types in `src/engine/types.ts` (SourceKind, Acl, SourceDocument, Passage, AdapterResult)
  - _Requirements: 1.1, 2.1, 3.1, 4.1_
- [x] 2. Implement `maskSensitive` with Luhn check and NRIC/FIN pattern in `src/engine/mask.ts`
  - _Requirements: 5.1, 5.2, 5.3_
- [x] 2.1 Write mask unit tests and the fast-check property "no Luhn-valid run survives masking"
  - _Requirements: 5.1, 5.3_
- [x] 3. Implement `parseWiki` with front matter, heading sections and 1,200 character splitting
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
- [x] 4. Implement `parseTickets` with security-array override and skipped-issue warnings
  - _Requirements: 2.1, 2.2, 2.3_
- [x] 5. Implement `parseChat` with private-channel member lists
  - _Requirements: 3.1, 3.2, 3.3_
- [x] 6. Implement `parseSheet` with RFC 4180 quoting and the 2,000 row cap
  - _Requirements: 4.1, 4.2, 4.3_
- [x] 7. Implement `buildCorpus` and the live `AclRegistry` snapshot in `src/engine/corpus.ts`
  - _Requirements: 1.1, 2.2, 3.2_
- [x] 8. Implement `detectAndParse` for uploads with size, count and extension limits
  - _Requirements: 6.1, 6.2, 6.3_
- [x] 9. Write adapter tests covering every acceptance criterion above
  - _Requirements: 1.1 to 6.3_
- [x] 10. Append `source.stitched` to the Crypt when an upload succeeds (UI wiring in `src/ui/App.tsx`)
  - _Requirements: 6.4_
- [x] 11. Read documented Jira and Slack formats and YAML block lists; refuse uploads that would widen access (`src/engine/adapters/documented.ts`, `detect.ts`, `wiki.ts`); test with hand-written payloads only (`tests/engine/documented-payloads.test.ts`)
  - _Requirements: 7.1 to 7.6_
