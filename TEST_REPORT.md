# Test report

## 6 Nov 2026: after the audit

Real results, captured on 6 Nov 2026 on Windows 11, Node v24.14.1, Python 3.13 with the pinned dependencies. They come from a clean `git clone` plus `npm ci` in a temporary folder and from the working repository.

| Check | Command | Result |
|---|---|---|
| All TypeScript suites, with the real-engine suite | `STITCH_PYTHON=... npx vitest run` | `Test Files  15 passed (15)`, `Tests  145 passed (145)` |
| Python | `npm run test:py` | `36 passed` |
| Type-check, UI build, API bundle | `npm run build` | exit 0; the rebuilt bundle matched the committed one |
| Shipped `api/*.js` in plain Node | `npm run smoke:api` | all 8 checks true |
| Real browser (Chromium through Playwright, app via Vite proxy, real stitches) | one-off script, not in the repo | Walnut badge, refund answer, forged sentence dropped, Theo has no FIN-13, Iris has it, Walnut verify and tamper demo, Jira upload warning, private chat refused, API notice: all as expected, no console errors. A page on another origin tried to seal an event with a no-cors text/plain POST and a JSON POST: neither was sealed |

What these do not show: **nothing here ran in Kiro.** `tests/kiro/kiro-config.test.ts` compares `.kiro/` with Kiro's published docs, not with Kiro. The Jira and Slack readers were tested only with payloads hand-written from public docs, not against a real workspace. Vercel is still not deployed, and CI has not run because nothing is pushed.

The audit found that the API returned `gate1Denied` to every asker while all 102 tests passed, because they called the engine directly and the smoke test required those entries. `tests/server/boundary.test.ts` now goes through the shipped functions.

---

## 5 Nov 2026: with the Walnut stitches

Real command output, captured on 5 Nov 2026 on Windows 11, Node v24.14.1, Python 3.13.15 (pydantic 2.14.1, PyYAML 6.0.3), in the repository root. `STITCH_PYTHON` pointed at that Python, so the real-engine suite ran (it starts `python -m stitch_walnut` on 127.0.0.1:4790).

| Check | Command | Result |
|---|---|---|
| All TypeScript suites (75 from 4 Nov plus 27 new in `tests/walnut/`) | `STITCH_PYTHON=... npx vitest run` | `Test Files  12 passed (12)`, `Tests  102 passed (102)` |
| Leak suites only | `npm run test:leaks` | `Tests  13 passed (13)` |
| Python: the wall, pointers, durable Crypt, service, vendored bytes | `python -m pytest tests_py -q -p no:cacheprovider` | `28 passed` |
| Type-check, UI build, API bundle | `npm run build` | exit 0 |
| Shipped `api/*.js` in plain Node | `npm run smoke:api` | all 6 checks true |
| No em or en dashes in Markdown | `npm run check:dashes` | `0 dash characters in 31 Markdown file(s)` |
| Visual check | the app served by the Vite dev server on 127.0.0.1:4700 with the stitches on 4711, driven by Playwright at 1372x772 (scale 1.4) for the demo video | header badge, Walnut report, pointer lines, forged sentence struck out with reasons, durable Crypt verify and tamper demo all rendered |

What the real-engine suite (`tests/walnut/sidecar.integration.test.ts`) showed, as asserted:

- For all 5 personas and all 7 sample questions, Walnut's grounding wall kept every extractive sentence (more than 20 sentences; zero dropped).
- The forged sentence was dropped for `value not in its sources: 99` and the name `Ozymandias`.
- Pointers re-resolve to the quoted text; chat and ticket pointers are `untrusted`.
- Sam's restricted question and invented question gave the same response through the real wall.
- The tamper demo detected an edit, a deletion and a reorder on copies, and the real Crypt verified identically before and after.

A finding while writing the pytest suite: a quote clipped through a number ("within 1..." from "within 14 days") states a false value, and the wall drops it (`test_a_quote_clipped_through_a_number_is_dropped_because_the_stub_is_a_false_value`). Stitchwork clips quotes at 400 characters, so this can happen on long passages; the wall is what catches it.

Not verified on 5 Nov: anything inside Kiro; any deployment with the stitches (DEPLOY_STEPS.md Option 3); the CI workflow on GitHub (it has not run, because nothing is pushed).

---

## 4 Nov 2026: first build

Real command output only, captured on 4 Nov 2026 (about 15:43 UTC) on Windows 11, Node v24.14.1, in the project folder. Timing lines are omitted from the per-test list; everything else is pasted as printed (ANSI colour codes stripped).

## What was verified

| Check | Command | Result |
|---|---|---|
| Unit, property and UI tests | `npx vitest run --reporter=verbose` | Tests  75 passed (75) |
| Leak suites only | `npm run test:leaks` | Tests  13 passed (13) |
| Type-check, UI build, API bundle | `npm run build` | exit 0 |
| Shipped `api/*.js` in plain Node | `npm run smoke:api` | all 6 checks true, exit 0 |
| No em or en dashes in Markdown | `npm run check:dashes` | 0 found |
| Visual check | built app served by `vite preview`, viewed in the Claude desktop browser pane at 1280 px and 375 px | answer, stitch map, citations, Crypt verify and tamper demo rendered; no horizontal scroll at 375 px (scrollWidth 375). Server stopped afterwards |

## Not verified

- Anything running inside Kiro (hooks firing, task execution, Analyze Requirements). See KIRO_USAGE.md.
- A real deployment. The Vercel functions are tested as files in plain Node (`smoke:api`), not on Vercel. See DEPLOY_STEPS.md step 4.
- Screen reader behaviour and colour contrast with an automated checker (laboratory-ui task 10).

## 1. Full test suite

```text
$ npx vitest run --reporter=verbose
✓ tests/engine/retrieve.test.ts > tokenizer > drops stop words and stems consistently
✓ tests/engine/retrieve.test.ts > tokenizer > splits sentences on terminal punctuation
✓ tests/engine/retrieve.test.ts > rank (permission-gates requirement 4) > 4.1 higher term frequency ranks higher, ties broken by id
✓ tests/engine/retrieve.test.ts > rank (permission-gates requirement 4) > 4.2 a passage matching only a common word is not relevant
✓ tests/engine/retrieve.test.ts > rank (permission-gates requirement 4) > 4.2 a passage with under half the query terms is not relevant
✓ tests/engine/mask.test.ts > maskSensitive (source-stitching requirement 5) > 5.1 masks a Luhn-valid card number with spaces
✓ tests/engine/mask.test.ts > maskSensitive (source-stitching requirement 5) > 5.1 masks a Luhn-valid card number with hyphens
✓ tests/engine/mask.test.ts > maskSensitive (source-stitching requirement 5) > 5.2 masks NRIC and FIN patterns
✓ tests/engine/mask.test.ts > maskSensitive (source-stitching requirement 5) > 5.3 leaves a Luhn-invalid digit run unchanged
✓ tests/engine/mask.test.ts > maskSensitive (source-stitching requirement 5) > dates, amounts and phone numbers are untouched
✓ tests/engine/mask.test.ts > maskSensitive (source-stitching requirement 5) > property: no generated Luhn-valid card survives masking
✓ tests/engine/adapters.test.ts > wiki adapter (requirement 1) > 1.1 reads front matter fields
✓ tests/engine/adapters.test.ts > wiki adapter (requirement 1) > 1.2 one passage per heading section
✓ tests/engine/adapters.test.ts > wiki adapter (requirement 1) > 1.3 splits long sections at paragraph boundaries within the limit
✓ tests/engine/adapters.test.ts > wiki adapter (requirement 1) > 1.4 no front matter falls back to file name, version 1, everyone
✓ tests/engine/adapters.test.ts > ticket adapter (requirement 2) > 2.1 one passage per issue with key, summary, status and description
✓ tests/engine/adapters.test.ts > ticket adapter (requirement 2) > 2.2 security array overrides project groups
✓ tests/engine/adapters.test.ts > ticket adapter (requirement 2) > 2.3 issue without key is skipped with a warning
✓ tests/engine/adapters.test.ts > chat adapter (requirement 3) > 3.1 one passage per message located by channel and timestamp
✓ tests/engine/adapters.test.ts > chat adapter (requirement 3) > 3.2 private channel restricts to members and no groups
✓ tests/engine/adapters.test.ts > chat adapter (requirement 3) > 3.3 public channel uses channel groups
✓ tests/engine/adapters.test.ts > spreadsheet adapter (requirement 4) > 4.1 one passage per data row as column: value pairs
✓ tests/engine/adapters.test.ts > spreadsheet adapter (requirement 4) > 4.2 commas inside quotes stay in the value, doubled quotes unescape
✓ tests/engine/adapters.test.ts > spreadsheet adapter (requirement 4) > 4.3 more than 2,000 rows are capped with a warning
✓ tests/engine/adapters.test.ts > uploads (requirement 6) > 6.1 detects markdown, csv, ticket json and chat json
✓ tests/engine/adapters.test.ts > uploads (requirement 6) > 6.1 uploads are visible to everyone even if front matter says otherwise
✓ tests/engine/adapters.test.ts > uploads (requirement 6) > 6.2 rejects oversize, wrong extension and too many files
✓ tests/engine/adapters.test.ts > uploads (requirement 6) > 6.3 unrecognised JSON shape is rejected with that reason
✓ tests/engine/adapters.test.ts > bundled dataset > parses with one expected warning and masks the test card and ID
✓ tests/engine/ledger.test.ts > append and chain (crypt-ledger requirement 1) > 1.1 and 1.2 entries are chained from the genesis hash and sealed
✓ tests/engine/ledger.test.ts > append and chain (crypt-ledger requirement 1) > 1.3 an answered question writes accepted, decided, released in order with one request id
✓ tests/engine/ledger.test.ts > append and chain (crypt-ledger requirement 1) > 1.4 a failed append releases nothing
✓ tests/engine/ledger.test.ts > append and chain (crypt-ledger requirement 1) > concurrent appends still form one valid chain
✓ tests/engine/gates.test.ts > Gate 1 (permission-gates requirement 2) > 2.1 a fincrime ticket is never cited for an account manager
✓ tests/engine/gates.test.ts > Gate 1 (permission-gates requirement 2) > 2.1 the compliance officer does get the fincrime ticket
✓ tests/engine/gates.test.ts > Gate 1 (permission-gates requirement 2) > 3.2 (source-stitching) the private fincrime channel is visible only to its member
✓ tests/engine/gates.test.ts > Gate 1 (permission-gates requirement 2) > 2.2 archived documents are excluded for everyone
✓ tests/engine/gates.test.ts > Gate 2 (permission-gates requirement 3) > 3.1 a revoke at the source takes effect before re-indexing
✓ tests/engine/gates.test.ts > Gate 2 (permission-gates requirement 3) > 3.2 a throwing live check fails closed
✓ tests/engine/gates.test.ts > Gate 2 (permission-gates requirement 3) > 3.2 a live check that returns a non-boolean is treated as deny
✓ tests/engine/ghosts.test.ts > detecting ghosts (ghost-versions requirement 1) > 1.1 older version in the same lineage is a ghost; v2 is cited
✓ tests/engine/ghosts.test.ts > detecting ghosts (ghost-versions requirement 1) > 1.2 status superseded with no successor is a ghost
✓ tests/engine/ghosts.test.ts > detecting ghosts (ghost-versions requirement 1) > 1.3 ghosts are judged only within what the asker can see
✓ tests/engine/ghosts.test.ts > detecting ghosts (ghost-versions requirement 1) > 1.4 equal versions: later updatedAt wins, then smaller id
✓ tests/engine/ghosts.test.ts > ghost notes (requirement 2) > 2.2 an unrelated question has no ghost notes
✓ tests/engine/ghosts.test.ts > dusty sources (requirement 3) > 3.1 dusty after 540 days, not before
✓ tests/engine/ghosts.test.ts > dusty sources (requirement 3) > 3.1 an old unreplaced page is cited but flagged dusty
✓ tests/engine/ghosts.test.ts > exorcism (requirement 4) > 4.2 a non-steward cannot exorcise and nothing changes
✓ tests/engine/ghosts.test.ts > exorcism (requirement 4) > 4.1 and 4.3 a steward exorcises; Crypt records it; the ghost is gone for everyone
✓ tests/engine/ghosts.test.ts > exorcism (requirement 4) > a steward cannot exorcise a living document
✓ tests/engine/gates.test.ts > responses never carry denial counts (requirement 5.2) > no gate counts or denied ids appear in any persona's response
✓ tests/engine/gates.test.ts > input limits (requirement 6.1) > empty and over-long questions are refused without a Crypt entry
✓ tests/server/handler.test.ts > token (permission-gates requirement 1) > round trip, forged signature, and expiry
✓ tests/server/handler.test.ts > API handlers > health reports configuration without needing the secret
✓ tests/engine/ledger.test.ts > verify (requirement 2) > 2.2 property: changing any one entry's data is caught at that entry
✓ tests/engine/ledger.test.ts > verify (requirement 2) > 2.2 swapping two entries is a chain break
✓ tests/engine/ledger.test.ts > verify (requirement 2) > 2.2 recomputing a hash without the key is caught by the seal
✓ tests/engine/ledger.test.ts > tamper demo (requirement 3) > 3.1 the copy fails verification and the real log still verifies
✓ tests/engine/ledger.test.ts > tamper demo (requirement 3) > 3.2 empty log returns null
✓ tests/engine/ledger.test.ts > masking in the Crypt (requirement 5) > 5.1 a card number typed into a question is masked in the Crypt
✓ tests/server/handler.test.ts > API handlers > 1.5 unset or short secret gives 503 not_configured
✓ tests/server/handler.test.ts > API handlers > 1.3 missing, malformed and forged tokens give 401
✓ tests/server/handler.test.ts > API handlers > 1.3 an expired token gives 401
✓ tests/server/handler.test.ts > API handlers > 1.4 body fields cannot change identity
✓ tests/server/handler.test.ts > API handlers > the steward's token does reach FIN-13, and the receipt verifies
✓ tests/server/handler.test.ts > API handlers > 6.2 bad JSON and oversized bodies give 400
✓ tests/server/handler.test.ts > API handlers > unknown persona is refused at session issue
✓ tests/server/handler.test.ts > API handlers > router dispatches by path and 404s otherwise
✓ tests/engine/uniform.property.test.ts > restricted looks exactly like nonexistent (permission-gates P1, requirement 5.1) > for every persona, removing documents they cannot open changes nothing in their responses
✓ tests/engine/uniform.property.test.ts > restricted looks exactly like nonexistent (permission-gates P1, requirement 5.1) > a restricted question and a nonsense question both get the fixed no_answer shape for a contractor
✓ tests/engine/uniform.property.test.ts > every citation is doubly permitted (P2, requirements 2.1 and 3.2) > cited documents are always openable by the asker
✓ tests/engine/uniform.property.test.ts > every sentence is stitched (P3, requirement 4.4) > each answered sentence has at least one valid citation with full provenance
✓ tests/ui/app.test.tsx > laboratory UI smoke test (laboratory-ui requirements 2.1 and 5.2) > asking a sample question shows a stitched answer with a citation and a ghost note
✓ tests/ui/app.test.tsx > laboratory UI smoke test (laboratory-ui requirements 2.1 and 5.2) > the Crypt is sealed for a non-steward and open for the steward
✓ tests/ui/app.test.tsx > laboratory UI smoke test (laboratory-ui requirements 2.1 and 5.2) > a contractor gets the fixed no-answer message for a restricted topic

Test Files  9 passed (9)
Tests  75 passed (75)
EXIT=0
```

## 2. Leak suites

```text
$ npm run test:leaks
> stitchwork@0.1.0 test:leaks
> vitest run tests/engine/uniform.property.test.ts tests/engine/gates.test.ts
Test Files  2 passed (2)
Tests  13 passed (13)
EXIT=0
```

## 3. Build

```text
$ npm run build
> stitchwork@0.1.0 build
> tsc -p tsconfig.json --noEmit && vite build && npm run build:api
vite v8.3.5 building client environment for production...
✓ 46 modules transformed.
dist/index.html                   0.66 kB │ gzip:  0.38 kB
dist/assets/index-jcaE88VX.css   11.42 kB │ gzip:  3.32 kB
dist/assets/index-BvwlC9vQ.js   266.71 kB │ gzip: 84.88 kB
✓ built in 367ms
> stitchwork@0.1.0 build:api
> vite build --config vite.api.config.ts
vite v8.3.5 building ssr environment for production...
✓ 24 modules transformed.
api/_lib/stitchwork-api.mjs  43.18 kB │ gzip: 14.52 kB
✓ built in 100ms
EXIT=0
```

## 4. API smoke test in plain Node

```text

> stitchwork@0.1.0 smoke:api
> node scripts/smoke-api.mjs

{
  "checks": {
    "healthConfigured": true,
    "tokenIssued": true,
    "askerIsTheo": true,
    "noFin13ForTheo": true,
    "receiptHasThreeEntries": true,
    "anonymousIs401": true
  },
  "theoAnswer": [
    "theo: Gravewell Logistics renewal is on track."
  ]
}
EXIT=0
```

## 5. Dash check

```text

> stitchwork@0.1.0 check:dashes
> node scripts/check-dashes.mjs

dash-check: 0 dash characters in 28 Markdown file(s).
EXIT=0
```

## Defect found during the session (not fixed, reserved for a Kiro Bugfix Spec)

Uploading two different files both named `notes.md` keeps only the second: both map to document id `upload:notes-md:notes`. Observed with a throwaway test that printed `DUP 1 [ 'upload:notes-md:notes=beta lantern' ]`. Details in KIRO_USAGE.md B5.
