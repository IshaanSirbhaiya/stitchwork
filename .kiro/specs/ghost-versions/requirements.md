# Requirements: ghost versions

## Introduction

Old versions of policies haunt company knowledge: a 2025 handbook still says 30 days after the 2026 handbook changed it to 14. Stitchwork detects these ghosts, keeps them out of answers, tells the asker which ghost was skipped, and lets a data steward exorcise (archive) them with a Crypt entry.

## Requirement 1: detecting ghosts

**User story:** As a knowledge worker, I want superseded versions kept out of my answer, so that I act on the current rule.

#### Acceptance criteria

1. WHEN two or more visible documents share a `docKey` THE SYSTEM SHALL treat every document except the one with the highest `version` as a ghost.
2. WHEN a visible document has `status: superseded` THE SYSTEM SHALL treat it as a ghost even if no newer version is visible.
3. WHILE computing ghosts THE SYSTEM SHALL consider only documents that passed both permission gates for the asker.
4. WHEN two visible documents share a `docKey` and a `version` THE SYSTEM SHALL keep the one with the later `updatedAt` as living, and if those are equal the one with the lexically smaller id.

## Requirement 2: telling the asker

**User story:** As a knowledge worker, I want to know a ghost was skipped, so that I can correct colleagues who quote the old rule.

#### Acceptance criteria

1. WHEN a ghost passage would have been relevant to the question THE SYSTEM SHALL add a ghost note with the ghost's title and version and, if visible, the living document's title and version.
2. WHEN no ghost is relevant THE SYSTEM SHALL return an empty ghost list.

## Requirement 3: dusty sources

**User story:** As a knowledge worker, I want old but unreplaced sources flagged, so that I can weigh them.

#### Acceptance criteria

1. WHEN a cited document's `updatedAt` is more than 540 days before the current time THE SYSTEM SHALL mark the citation `dusty: true`.

## Requirement 4: exorcism

**User story:** As a data steward, I want to archive a ghost, so that it stops haunting everyone.

#### Acceptance criteria

1. WHEN an asker in the `steward` group exorcises a ghost THE SYSTEM SHALL set its live status to `archived` and append a `ghost.exorcised` entry to the Crypt with the document id and the steward's user id.
2. IF an asker outside the `steward` group tries to exorcise THEN THE SYSTEM SHALL refuse with the message "Only a data steward can exorcise a ghost." and change nothing.
3. WHEN a document is archived THE SYSTEM SHALL exclude its passages from every later question.
