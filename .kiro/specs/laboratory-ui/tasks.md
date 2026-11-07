# Tasks: the laboratory UI

Provenance: this spec, including its `[x]` marks, was hand-written, outside Kiro, with an AI coding assistant. No Kiro feature has generated or executed it yet. See KIRO_USAGE.md Part A.

Status note: tasks marked `[x]` were implemented in the first build session (4 Nov 2026) and verified by `npm test` and `npm run build`.

- [x] 1. Create palette tokens, layout and reduced-motion rules in `src/ui/styles.css`
  - _Requirements: 7.2, 7.3_
- [x] 2. Build `App.tsx` with persona state, tabs and engine wiring
  - _Requirements: 1.1, 1.2_
- [x] 3. Build `AskPanel.tsx` with chips, answer, citations, ghost cards and pipeline trail
  - _Requirements: 2.1 to 2.6_
- [x] 4. Build `StitchMap.tsx` SVG seams
  - _Requirements: 2.1_
- [x] 5. Build `SourcesPanel.tsx` with upload results
  - _Requirements: 3.1, 3.2_
- [x] 6. Build `GhostsPanel.tsx` with steward-only exorcise
  - _Requirements: 4.1, 4.2_
- [x] 7. Build `CryptPanel.tsx` with search, verify and tamper demo
  - _Requirements: 5.1, 5.2_
- [x] 8. Build `OperatorPanel.tsx` with revoke, restore, seal shut and reset
  - _Requirements: 6.1, 6.2_
- [x] 9. Write the UI smoke test in `tests/ui/app.test.tsx`
  - _Requirements: 2.1, 5.2_
- [ ] 10. Run an accessibility pass in Kiro (agent hook or chat) and record findings; fix any contrast or label issue it finds
  - _Requirements: 7.1, 7.3_
