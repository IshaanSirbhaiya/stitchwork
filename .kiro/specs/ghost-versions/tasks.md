# Tasks: ghost versions

Provenance: this spec, including its `[x]` marks, was hand-written, outside Kiro, with an AI coding assistant. No Kiro feature has generated or executed it yet. See KIRO_USAGE.md Part A.

Status note: tasks marked `[x]` were implemented in the first build session (4 Nov 2026) and verified by `npm test`.

- [x] 1. Implement `findGhosts` with docKey grouping and tie-breaks in `src/engine/ghosts.ts`
  - _Requirements: 1.1, 1.2, 1.4_
- [x] 2. Wire ghost detection after Gate 2 in `Engine.ask`, restricted to the visible set
  - _Requirements: 1.3_
- [x] 3. Produce relevance-filtered ghost notes in the response
  - _Requirements: 2.1, 2.2_
- [x] 4. Mark dusty citations older than 540 days using the injected clock
  - _Requirements: 3.1_
- [x] 5. Implement `Engine.exorcise` with steward check and Crypt entry
  - _Requirements: 4.1, 4.2, 4.3_
- [x] 6. Write ghost tests listed in design.md
  - _Requirements: 1.1 to 4.3_
- [ ] 7. Add the Ghosts tab "haunting score" (how many questions a ghost would have answered this session) (optional; candidate for a Kiro task run)
  - _Requirements: 2.1_
