# Design: ghost versions

## Overview

`src/engine/ghosts.ts` exports `findGhosts(passages) -> Map<docId, GhostInfo>`. It groups the asker's visible passages by `docKey`, picks the living document per group (highest version, then later `updatedAt`, then smaller id) and marks the rest. Documents with `status: superseded` are always ghosts.

```ts
interface GhostInfo { docId: string; title: string; version: number; livingDocId?: string; livingTitle?: string; livingVersion?: number }
interface GhostNote extends GhostInfo { reason: "newer-version" | "marked-superseded" }
```

## Pipeline position

Ghost detection runs after Gate 2 and before ranking (see `permission-gates/design.md`). Living passages are ranked for the answer. Ghost passages are ranked separately against the same question using the living set's statistics plus the ghost passage, and any ghost passing the same coverage rule produces a ghost note. This keeps the ghost note relevant to the question instead of listing every ghost.

## Why only visible documents

If a restricted v3 superseded a visible v2, telling the asker "v2 is outdated" would reveal that v3 exists, which breaks the restricted-looks-like-nonexistent promise. The trade-off: in that case the asker sees v2 as living. This is recorded as an accepted limitation in README.md.

## Exorcism

`Engine.exorcise(identity, docId)` checks the `steward` group, sets the live registry status to `archived`, and appends `ghost.exorcised`. Archived documents fail Gate 1 for everyone (see `permission-gates` requirement 2.2). Exorcism is reversible only through the demo reset control; there is no un-archive in the product.

## Testing strategy

`tests/engine/ghosts.test.ts`:
- v1 and v2 of the claims handbook: v2 cited, ghost note names v1.
- tie on version resolved by `updatedAt`, then id.
- `status: superseded` with no successor is a ghost.
- ghost judged within visible set only: a persona who cannot see v2 gets v1 as living and no ghost note.
- dusty flag at 541 days, not at 539 days.
- exorcise refused for non-steward, accepted for steward, archived doc never cited afterwards.
