# Requirements: contradiction seance

Status: requirements drafted, design drafted, tasks NOT started. This spec is reserved for Ishaan to execute inside Kiro (see KIRO_USAGE.md). Do not mark tasks complete outside a Kiro run.

## Introduction

Ghost versions catch an old document that a newer version of the same document replaces. They do not catch echoes: a living chat message or ticket that still repeats a value the living policy changed (for example "refunds are 30 days" posted after the handbook moved to 14). The seance summons these contradictions between living sources and shows them side by side, so a steward can correct the echo.

## Requirement 1: detecting contradictions

**User story:** As a data steward, I want to see living sources that disagree on a number, so that I can correct the source that is wrong.

#### Acceptance criteria

1. WHEN two living passages visible to the asker both contain a quantity (a number followed by one of: days, hours, percent, %, SGD, USD) and share at least 2 non-stop-word terms within 6 tokens of that quantity THE SYSTEM SHALL report a contradiction if the numbers differ.
2. WHEN one side of a contradiction is a wiki page with a later `updatedAt` than the other side THE SYSTEM SHALL label the wiki side "likely current" and the other side "likely echo".
3. WHILE computing contradictions THE SYSTEM SHALL consider only passages that passed both permission gates and are not ghosts.
4. THE SYSTEM SHALL report at most 20 contradictions per run, ordered by the number of shared terms, highest first.

## Requirement 2: showing contradictions

#### Acceptance criteria

1. WHEN the Seance tab opens THE SYSTEM SHALL list contradictions with both quoted sentences, their sources and dates.
2. WHEN an answer cites a passage that is part of a contradiction THE SYSTEM SHALL show a "Disputed" badge on that citation.
3. IF no contradictions exist THEN THE SYSTEM SHALL show "The spirits are quiet. No living sources disagree."

## Requirement 3: privacy

#### Acceptance criteria

1. THE SYSTEM SHALL NOT report a contradiction where either side is a passage the asker cannot open.
2. THE SYSTEM SHALL keep the uniform-response property: the seance output for an asker is identical whether or not documents the asker cannot open exist.

## Done means

- New tests in `tests/engine/contradictions.test.ts` cover each criterion above, including a property test for 3.2 modelled on `tests/engine/uniform.property.test.ts`.
- `npm test` and `npm run build` pass.
- The bundled dataset produces at least one contradiction (the 30-day echo in `#claims-floor`).
