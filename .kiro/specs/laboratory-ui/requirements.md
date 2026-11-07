# Requirements: the laboratory UI

## Introduction

The UI is a night laboratory. The answer is the creature; its stitches are citations drawn as seams to the body parts (source cards) they came from. Styling must make governance visible, not hide it. Everything runs in the browser over the synthetic Hollowmere Assurance dataset, so a static deploy is enough for judges.

## Requirement 1: persona switcher

#### Acceptance criteria

1. WHEN the page loads THE SYSTEM SHALL select the persona Mara Quill (Claims Analyst) and list five personas with their role and groups.
2. WHEN the persona changes THE SYSTEM SHALL clear the current answer and re-render every tab for the new persona.

## Requirement 2: Laboratory tab (ask)

#### Acceptance criteria

1. WHEN the user submits a question THE SYSTEM SHALL show the answer sentences with numbered stitch markers, a citation card per cited passage, and the stitch map.
2. WHEN the user clicks a stitch marker or citation THE SYSTEM SHALL expand the cited passage text in place.
3. WHEN a response is `no_answer` THE SYSTEM SHALL show the fixed message and no source cards.
4. WHEN a response contains ghost notes THE SYSTEM SHALL show a "Ghost caught" card per note.
5. WHEN an answer is shown THE SYSTEM SHALL show the pipeline trail (identity, Crypt write, Gate 1, Gate 2, ghost check, stitch, Crypt seal, with `Walnut grounding wall` before the seal when the stitches are attached; see walnut-stitches 4.3) without any denial counts.
6. THE SYSTEM SHALL offer at least 5 sample questions as one-click chips.

## Requirement 3: Body Parts tab (sources)

#### Acceptance criteria

1. WHEN the tab opens THE SYSTEM SHALL list only documents the persona can open, grouped by source kind, with version, updated date and groups.
2. WHEN the user stitches in files THE SYSTEM SHALL show each file's result: passages added or the rejection reason.

## Requirement 4: Ghosts tab

#### Acceptance criteria

1. WHEN the tab opens THE SYSTEM SHALL list ghosts visible to the persona, each with its living version if visible.
2. WHILE the persona is a steward THE SYSTEM SHALL show an "Exorcise" button per ghost.

## Requirement 5: Crypt tab

#### Acceptance criteria

1. WHILE the persona is a steward THE SYSTEM SHALL show entries newest first, a search box, a Verify button and a Tamper demo button.
2. WHILE the persona is not a steward THE SYSTEM SHALL show the sealed message only.

## Requirement 6: demo operator controls

#### Acceptance criteria

1. THE SYSTEM SHALL provide a collapsed panel labelled "Demo operator controls" that can revoke or restore a group on any document at the source (live registry only), seal the Crypt shut for the next append, and reset the session.
2. WHEN access is revoked at the source THE SYSTEM SHALL record an `acl.changed` entry in the Crypt.

## Requirement 7: accessibility and motion

#### Acceptance criteria

1. THE SYSTEM SHALL label every input and button, keep a visible focus outline, and announce new answers through an `aria-live="polite"` region.
2. WHILE `prefers-reduced-motion: reduce` is set THE SYSTEM SHALL disable the reanimation flash and seam drawing animation.
3. THE SYSTEM SHALL keep body text contrast at or above 4.5:1 against its background.
