# Tasks: contradiction seance

Provenance: this spec, including its `[x]` marks, was hand-written, outside Kiro, with an AI coding assistant. No Kiro feature has generated or executed it yet. See KIRO_USAGE.md Part A.

Reserved for execution in Kiro. Run task 1 alone first and read the diff before "Run all Tasks".

- [ ] 1. Implement quantity mention extraction with unit normalisation in `src/engine/contradictions.ts`
  - _Requirements: 1.1_
- [ ] 2. Implement pairing by shared context terms, likely-current labelling, sorting and the cap of 20
  - _Requirements: 1.1, 1.2, 1.4_
- [ ] 3. Add `Engine.seance(identity)` that reuses the gate and ghost steps
  - _Requirements: 1.3, 3.1_
- [ ] 4. Write unit tests in `tests/engine/contradictions.test.ts`
  - _Requirements: 1.1, 1.2, 1.4, 2.3_
- [ ] 5. Write the uniform-response property test for the seance
  - _Requirements: 3.2_
- [ ] 6. Add the Seance tab and the Disputed badge in the UI
  - _Requirements: 2.1, 2.2, 2.3_
- [ ] 7. Run `npm test` and `npm run build`; paste real output into TEST_REPORT.md
  - _Requirements: all_
