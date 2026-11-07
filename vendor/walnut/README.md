# vendor/walnut: the Walnut engine, vendored and unchanged

Stitchwork is a new project (Kiroween 2026). This folder is the one piece of pre-existing work in
it: a small, unmodified slice of the Walnut engine, used as a library under its Apache-2.0
licence.

| What | Path | Used by Stitchwork for |
|---|---|---|
| Source pointers | `packages/core/databridge_core/provenance.py` | A sealed `doc_span` `SourcePointer` per kept sentence and citation, with a trust label |
| Value forms | `packages/core/databridge_core/value_forms.py` | Reading numbers and identifiers whole, inside the grounding wall |
| Sealed decision ledger | `packages/core/databridge_core/decision_ledger.py` | The durable Crypt: append-only, SHA-256 hash chain, HMAC seal, anchor ledger |
| Grounding wall | `apps/gateway/databridge_gateway/llm.py` | `ground_narration`, `unsupported_named_terms`, `identity_assertion_violations`, `bind_sentences` |
| The rest of `databridge_core` | `packages/core/databridge_core/*.py` | Imported by the files above; not called directly |

How it is used: `stitch_walnut/walnut.py` (Stitchwork code) puts `packages/core` on the import
path and loads `llm.py` from its file under a private module name, so nothing else of the Walnut
gateway is imported. Runtime dependencies: `pydantic` and `PyYAML` (see `requirements-walnut.txt`).

**Unchanged, and checkable.** `MANIFEST.sha256` lists the SHA-256 of every file here, taken from
the Walnut source. `python -m pytest tests_py/test_vendor_unchanged.py` fails if any byte
differs or any file is added. `.gitattributes` marks this folder `-text` so Git never rewrites
line endings.

Licence: [LICENSE](LICENSE) (Apache-2.0) and [NOTICE](NOTICE).
