# Design: the laboratory UI

## Components (`src/ui/`)

| Component | Role |
|---|---|
| `App.tsx` | owns the `Engine`, persona, tab and answer state |
| `PersonaPicker.tsx` | persona select with role and groups |
| `AskPanel.tsx` | question form, sample chips, answer, ghost cards, pipeline trail |
| `StitchMap.tsx` | SVG: sentences on the left, source cards on the right, dashed seams between |
| `SourcesPanel.tsx` | visible documents by kind, upload control |
| `GhostsPanel.tsx` | ghost list and exorcise |
| `CryptPanel.tsx` | steward-only log, search, verify, tamper demo |
| `OperatorPanel.tsx` | revoke or restore at source, seal shut, reset |
| `ApiPanel.tsx` | curl examples for the serverless API |

The stitch map is laid out from data, not measured from the DOM: row height is fixed, so the SVG is deterministic and testable.

## Visual language

- Palette tokens in `:root`: `--ink` night background, `--slab` panel, `--thread` brass seam colour, `--volt` galvanic green for live checks, `--ghost` pale blue for ghosts, `--blood` muted red reserved for failures only.
- Seams are `stroke-dasharray` paths, echoing surgical stitches. Source kinds have a glyph: wiki page, ticket tag, chat bubble, sheet grid (inline SVG, no icon font).
- Headings use a serif stack (`"Iowan Old Style", Georgia, serif`) for the gothic register; body uses the system sans stack for legibility.
- No external fonts or scripts, so the static build works offline and on any host.

## State

Engine state lives in memory for the session. Reload resets to the bundled dataset. No local storage is used, so nothing a judge uploads persists.

## Testing strategy

`tests/ui/app.test.tsx` renders `App` in jsdom, asks a sample question, and asserts that an answer with at least one citation appears, then switches to a non-steward persona and asserts the Crypt is sealed.
