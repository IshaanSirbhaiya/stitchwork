---
inclusion: always
---

# Working standards

## Verification before completion

- A task is complete only when its acceptance criteria were checked by running something: `npm test`, `npm run build`, or a named script. Report the exact command and its actual output.
- When a check fails, report the failure and the fix. Never mark a task done and mention the failure afterwards.

## No fabrication

- Never invent metrics, test counts, benchmark figures, citations or file paths. TEST_REPORT.md contains pasted command output only.
- Distinguish designed from built. Do not describe planned behaviour as existing in design.md, README.md or comments.
- When a requirement is ambiguous, write the assumption down in the spec instead of choosing silently.

## Writing

- Zero em dashes and zero en dashes in Markdown and UI copy. Use commas, colons or full stops. The `dash-check` hook enforces this.
- Plain English. Short sentences.

## Working style

- Prefer existing modules over new ones. A new runtime dependency needs a reason in design.md.
- Keep secrets out of the repository. `.env` is gitignored; `.env.example` documents variables with empty values.
