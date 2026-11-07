# Stitchwork

**A Frankenstein answer layer for company knowledge.** Stitchwork sews four tools that were never meant to talk to each other (a Markdown wiki, a ticket tracker export, chat channel exports and spreadsheets) into one body you can question. Every answer is permission-checked twice, stitched sentence by sentence to its sources, cleared of ghost versions, and sealed into a tamper-evident audit log called the Crypt.

The stitches that hold the creature together come from a second body: **Walnut**, a pre-existing Python engine by the same team, vendored unchanged under Apache-2.0. When the Walnut stitches run, every sentence must also pass Walnut's grounding wall, every citation gets a Walnut source pointer, and every Crypt event is sealed into Walnut's durable, hash-chained ledger before the next step. If a stitch fails, nothing is released.

Built for Kiroween 2026, category **Frankenstein**. Stitchwork's own code is MIT licensed; the vendored Walnut engine is Apache-2.0 (see [Pre-existing work](#pre-existing-work-disclosure)). All bundled data is synthetic: Hollowmere Assurance and its people are fictional.

- Live demo: `<add your deployment URL>` (the hosted demo runs without the Walnut stitches; see [Honest limits](#honest-limits))
- Video (under 3 minutes): `<add your YouTube URL>`

**Kiro status, plainly.** The `.kiro/` folder (7 specs, 5 steering files, 6 hooks) and the code so far were written by hand with an AI coding assistant outside Kiro, on 4 to 6 Nov 2026. Kiro has not yet generated, loaded or run any of it. [KIRO_USAGE.md](KIRO_USAGE.md) records what Kiro has and has not done, and this paragraph changes when that does.

## The problem

A company's knowledge is scattered: the rule lives in the wiki, the reason it changed lives in chat, the blocker lives in a ticket and the number lives in a spreadsheet. AI assistants can stitch these together, but in regulated teams an assistant that can read everything can also leak everything. Telling an account manager that a fraud investigation exists can itself be a breach ("tipping off"). Old versions of policies keep answering questions long after they were replaced. And a sentence that sounds cited but states a number no source holds is worse than no answer.

## What Stitchwork does

| Promise | How it works | Where |
|---|---|---|
| Permissions before answers | Gate 1 filters by the ACL captured at index time. Gate 2 re-asks the live permission registry for every surviving document; an error means deny. | `src/engine/gates.ts` |
| Restricted looks exactly like nonexistent | Ranking statistics are computed only over passages that passed both gates, so a hidden document cannot move a single score. Property-tested in the engine (with Walnut attached, the property run uses an in-process stand-in for the wall). Through the API and the real Walnut wall, every person and sample question is compared with and without what they cannot open (byte for byte in the API; through the real wall, ignoring seal sequence numbers, which only count ledger traffic). | `tests/engine/uniform.property.test.ts`, `tests/server/boundary.test.ts`, `tests/walnut/sidecar.integration.test.ts` |
| Every sentence is stitched | Extractive answers: each sentence is quoted from a permitted passage and cites source kind, title, location, version, updated date and the time access was re-checked. | `src/engine/answer.ts` |
| Every stitch is checked by Walnut | Walnut's grounding wall checks each sentence against only the passages it cites. A value, a name or an identity claim those passages do not hold is dropped, and the reasons are shown. Kept sentences carry a Walnut `doc_span` pointer, labelled untrusted for chat and tickets. | `stitch_walnut/walnut.py`, `vendor/walnut/` |
| Ghost versions are exorcised | Older versions in a lineage (and pages marked superseded) are kept out of answers; the asker is told which ghost was skipped. A data steward can archive it. | `src/engine/ghosts.ts` |
| Every step goes in the Crypt | In the page: SHA-256 hash chain plus HMAC seal. With Walnut: each event is first sealed into Walnut's `DecisionLedger` on disk (hash chain, HMAC seal, separate anchor ledger). Request before retrieval, decision before the response, release before return. If either cannot be written, nothing is released. | `src/engine/ledger.ts`, `vendor/walnut/packages/core/databridge_core/decision_ledger.py` |
| Sensitive values never indexed | Luhn-valid card numbers and Singapore NRIC/FIN patterns are masked on ingest and in the Crypt. | `src/engine/mask.ts` |

There is no language model in the answer path. Answers are deterministic and reproducible, which is what an auditor wants, and the app runs free with no API keys.

## Why Frankenstein

The Frankenstein category asks for "a chimera of technologies" that brings "seemingly incompatible elements" together into something "unexpectedly powerful" (Kiroween 2026 official rules). Stitchwork is that, twice over:

1. **Four incompatible body parts.** Wiki groups, ticket security levels, private chat member lists and spreadsheet sharing are four permission models in four formats, sewn into one governed answer.
2. **Two incompatible bodies.** A TypeScript engine that runs in a browser tab and a Python engine that seals a ledger on disk, joined by a narrow loopback seam. Neither was written for the other: the Walnut grounding wall was built to police model narration over a knowledge graph; Stitchwork feeds it extractive quotes, one sentence and its own citations at a time.

The theme is functional, not decoration: stitches are citations, the stitch map shows which body part each sentence came from, ghosts are stale versions, the Crypt is the audit log, and a "forged stitch" is a sentence no source supports.

## Try it in 90 seconds

Start the stitches and the app (see [Run locally](#run-locally)). The header says "Walnut stitches attached".

1. As **Mara Quill** (Claims Analyst), click "What is the refund window for cancelled policies?". The answer quotes the 2026 handbook (14 days), a ticket and a chat message, and shows **Ghost caught: Claims Handbook v1**. Under the citations, each source has a Walnut pointer; the Walnut box says 3 of 3 sentences kept and names the three durable seals.
2. Open **Demo operator controls**, click **Forge a stitch in the next answer**, and ask again. A sentence claiming "99 days, approved by Ozymandias Crane" reaches the Walnut wall and is struck out with its reasons.
3. Switch to **Theo Marsh** (Account Manager) and ask "Is Gravewell Logistics under investigation?". He sees his own renewal chat and nothing else. Switch to **Iris Vane** (Compliance) and the same question cites ticket FIN-13 and the private fincrime channel.
4. As Theo, ask "What discount can an account manager approve?". Then revoke `sales` on Pricing Guidelines at the source and ask again: Gate 2 drops the page even though the index still lists it.
5. As Iris, open the **Crypt**: **Verify chain**, then **Verify Walnut Crypt**, then **Walnut tamper demo**: an edit, a deletion and a reorder on copies are all caught, and the real ledger is unchanged.
6. Open **Body parts** and stitch in your own `.md` or `.csv`, a Jira search result, a Slack export file, or a `.json` file in Stitchwork's own ticket or chat format. A file that declares a narrower audience is refused, because uploads are visible to everyone in the session.

Without the stitches running, steps 1, 3, 4 and 6 work the same in the in-page engine, and the header says so.

## Architecture

```
wiki .md ─┐
tickets ──┤  adapters + masking   ┌─ Gate 1 (index ACL) ─ Gate 2 (live, fail closed) ─┐
chat ─────┼─────────────────────► corpus                                              ├─ ghost check ─ BM25 ─ stitched answer ─┐
sheets ───┘                                                                                                                      │
                                                                 Walnut grounding wall (per sentence, own citations only) ◄─────┘
  Crypt: accepted ─► decided ─► released   (each sealed first in Walnut's DecisionLedger, then in the in-page chain)
```

- `src/engine/`: framework-free TypeScript, Web Crypto only. Runs in the browser and in Node.
- `src/walnut/`: the `WalnutStitches` interface and its fetch client. Any non-200, timeout or network error means release nothing.
- `stitch_walnut/`: a standard-library Python HTTP service on 127.0.0.1 that binds to the vendored engine. New code.
- `vendor/walnut/`: 13 files of the Walnut engine, unchanged: `databridge_core` (source pointers, value forms, the sealed decision ledger) and the grounding-wall module. Byte-checked against `MANIFEST.sha256`.
- `src/ui/`: React 19 + Vite 8, plain CSS, no external fonts or scripts.
- `server/` and `api/`: the same engine as Vercel Node.js functions. Identity comes only from an HMAC-signed 15 minute token; body fields such as `"persona":"iris"` are ignored. Only a steward receives Crypt entries; anyone else gets the count, because the entries record how much was denied. With `STITCH_WALNUT_URL` set, each request goes through the stitches and the response carries the Walnut report.

## Run locally

```bash
npm install
python -m pip install -r requirements-walnut.txt   # Python 3.11+: pydantic, PyYAML, pytest

npm run walnut       # the Walnut stitches on http://127.0.0.1:4711 with a throwaway key
npm run dev          # http://localhost:5173 (proxies /walnut to the stitches)
```

For a durable Crypt that survives restarts, set `STITCH_WALNUT_KEY` and `STITCH_WALNUT_CALLER_KEY` (each at least 32 characters) and run `python -m stitch_walnut --port 4711` instead. Use `STITCH_WALNUT_URL` to point the app or the API somewhere else.

Tests:

```bash
STITCH_PYTHON=python npm test   # every TypeScript suite, including the real-engine Walnut suite
                                # PowerShell: $env:STITCH_PYTHON="python"; npm test
npm run test:py                 # pytest: the wall, pointers, durable Crypt, service boundary, vendored bytes
npm run build                   # type-check, build dist/, bundle the API
npm run smoke:api               # load api/*.js in plain Node and check gating
```

Without `STITCH_PYTHON` (or with a Python that lacks pydantic), the real-engine suite is skipped with a warning. Deploy: see [DEPLOY_STEPS.md](DEPLOY_STEPS.md). Test evidence: [TEST_REPORT.md](TEST_REPORT.md).

## How Kiro is used

**So far, it has not been.** Everything below was written by hand with an AI coding assistant outside Kiro, on 4 to 6 Nov 2026. Nothing has been generated by Kiro, and no hook has fired. [KIRO_USAGE.md](KIRO_USAGE.md) keeps the record, and work done in Kiro is committed with a `kiro:` prefix.

- **Specs** (`.kiro/specs/`): one per capability, each with EARS `requirements.md`, `design.md` and `tasks.md`: `source-stitching`, `permission-gates`, `ghost-versions`, `crypt-ledger`, `laboratory-ui`, `walnut-stitches`, and `contradiction-seance` (specified, not built, and kept for Kiro). Each `tasks.md` states that it was hand-written, so its ticks are not Kiro task runs.
- **Steering** (`.kiro/steering/`): `product.md`, `tech.md`, `structure.md`, `00-standards.md` and `10-governance-invariants.md`, a `fileMatch` file for engine, stitches and API code.
- **Hooks** (`.kiro/hooks/`): written to fire on agent edits and after spec tasks. Engine tests plus API rebuild and smoke; Walnut stitches tests with the vendored-bytes check; a leak guard on `PostTaskExec`; a dash check; a spec drift review (agent prompt); a governance review on `Stop` (off by default because agent hooks cost credits).
- **Checked against the docs, not by Kiro.** `tests/kiro/kiro-config.test.ts` compares these files with Kiro's published hook and steering schema. That shows they match the documents. It does not show that Kiro accepts them.
- **Property-based testing**: the "restricted looks like nonexistent" requirement is a fast-check property (P1 in `permission-gates/design.md`). It is run by Vitest, not generated by Kiro.

## Honest limits

- Synthetic data only. The connectors are file readers, not live integrations. The Jira, Slack, CSV and YAML readers are tested with payloads hand-written from each tool's public docs, and have not been run against a real Jira or Slack workspace. Those exports do not carry every permission (Jira project permissions, whether a Slack channel was private), so the upload warns about it.
- **The demo identity is not authentication.** Without `STITCH_SESSION_KEY`, `/api/session` gives a token for any persona to anyone, Iris included, and says so (`demoIdentity: true`). The API shows that the gates hold for a given identity; it does not check that you are that person. The UI's persona picker and demo operator controls are the same: they run in the page with no login.
- The browser demo holds the whole synthetic dataset in the page bundle, so its permission checks demonstrate the logic rather than protect secrets. In the API, restricted text and denial counts do not reach a token whose persona may not see them.
- **The hosted demo is not the whole video.** The Walnut stitches are a separate Python process that a plain Vercel deployment cannot run, so the Walnut report, forge control and durable Crypt shown in the video need a local run (see [Run locally](#run-locally)) or a host that keeps a process alive (walnut-stitches task 12). Without `STITCH_WALNUT_URL` the API's Crypt is per request.
- The stitches do not know who a person is. They bind to 127.0.0.1, refuse other sites (Host, Origin, JSON only) and have no route that returns Crypt records, and a durable Crypt needs a caller key. With `--ephemeral-key`, another process on the same machine can still append demo events.
- The Walnut report shows seal sequence numbers, so a caller can infer how many events the shared ledger holds, though not what they are.
- Stitchwork's answers are quotes, so on the bundled data Walnut's wall keeps every real sentence (tested for every persona and sample question). It earns its place on anything that is not a verbatim quote: the forge control, a quote clipped through a number, or a future model narration. The wall checks values and names, not the relation a sentence draws between them.
- Ghosts are judged only among documents the asker can open. If a newer version is restricted, the asker sees the older one as current. This is deliberate: the alternative would reveal that the restricted version exists.
- Retrieval is lexical BM25. Paraphrases with no shared words will not match.

## Pre-existing work disclosure

Stitchwork is a new project, created on 4 Nov 2026, after the submission period opened on 30 Oct 2026. Its first commit is in this repository's history.

It contains one piece of pre-existing code, used as a library and disclosed here. It is more than a utility: the Walnut wall, pointers and ledger are central to what Stitchwork demonstrates, so it should be judged knowing that.

| What | Where | Status |
|---|---|---|
| The Walnut engine (13 files: `databridge_core` and the grounding-wall module), written earlier by the Walnut team | `vendor/walnut/` | Vendored **unchanged** under Apache-2.0, with its LICENSE and NOTICE. `MANIFEST.sha256` holds the digest of every file and `tests_py/test_vendor_unchanged.py` fails on any change |

The manifest shows that nothing has changed since vendoring. Everything else (the TypeScript engine, adapters, gates, ghosts, Crypt, UI, API, the `stitch_walnut` binding and service, the specs, steering, hooks and tests) was written for Kiroween 2026. The code is new, but several ideas are not: two permission gates, restricted looking like nonexistent, a hash-chained audit log and sensitive-value masking all come from the team's earlier work on Walnut and were written again in TypeScript here. That first version was built outside Kiro, as stated above. Standard open source dependencies: React, Vite, TypeScript, Vitest, fast-check, Testing Library, jsdom; on the Python side pydantic and PyYAML (imported by the vendored engine) and pytest.

## Licence

Stitchwork: MIT, see [LICENSE](LICENSE). The vendored Walnut engine in `vendor/walnut/`: Apache-2.0, see [vendor/walnut/LICENSE](vendor/walnut/LICENSE) and [vendor/walnut/NOTICE](vendor/walnut/NOTICE).
