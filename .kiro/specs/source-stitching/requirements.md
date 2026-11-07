# Requirements: source stitching

## Introduction

Stitchwork sews four disconnected source kinds into one corpus of passages: Markdown wiki pages, ticket exports (JSON), chat channel exports (JSON) and spreadsheets (CSV). Each source keeps its own permission fields and version metadata. Sensitive values are masked before anything is indexed. Users can stitch in their own files in the browser.

Assumption recorded: uploaded files are visible to the `everyone` group, because the upload happens inside one browser session and never leaves it.

## Requirement 1: wiki adapter

**User story:** As a knowledge worker, I want wiki pages split into sections, so that a citation points at the exact section that answers me.

#### Acceptance criteria

1. WHEN a Markdown page with a front matter block is parsed THE SYSTEM SHALL read `id`, `title`, `space`, `groups`, `version`, `updated`, and the optional `docKey` and `status` fields.
2. WHEN a page body contains `##` headings THE SYSTEM SHALL create one passage per heading section, with the heading text as the passage location.
3. WHEN a section is longer than 1,200 characters THE SYSTEM SHALL split it at paragraph boundaries into passages of at most 1,200 characters.
4. IF a page has no front matter THEN THE SYSTEM SHALL use the file name as `id` and title, version 1, and the `everyone` group.

## Requirement 2: ticket adapter

**User story:** As a knowledge worker, I want tickets treated as sources, so that blockers and decisions in the tracker reach the answer.

#### Acceptance criteria

1. WHEN a ticket export (a JSON object with an `issues` array) is parsed THE SYSTEM SHALL create one passage per issue containing its key, summary, status and description.
2. WHEN an issue has a `security` array THE SYSTEM SHALL use it as the passage groups; otherwise THE SYSTEM SHALL use the project's `groups` array.
3. IF an issue has no `key` THEN THE SYSTEM SHALL skip it and report it in the adapter warnings.

## Requirement 3: chat adapter

**User story:** As a knowledge worker, I want chat decisions to count, so that the reasons behind changes are findable.

#### Acceptance criteria

1. WHEN a chat export (a JSON object with `channel` and `messages`) is parsed THE SYSTEM SHALL create one passage per message, located as `#channel @ timestamp`.
2. WHEN the channel is marked `private: true` THE SYSTEM SHALL restrict the passages to the channel `members` user list and no groups.
3. WHEN the channel is public THE SYSTEM SHALL use the channel `groups` array.

## Requirement 4: spreadsheet adapter

**User story:** As an analyst, I want spreadsheet rows to be quotable, so that numeric answers cite the exact row.

#### Acceptance criteria

1. WHEN a CSV file with a header row is parsed THE SYSTEM SHALL create one passage per data row rendered as `column: value` pairs, located as `row N`.
2. WHEN a CSV value is wrapped in double quotes THE SYSTEM SHALL keep commas inside the quotes as part of the value.
3. IF a CSV file has more than 2,000 data rows THEN THE SYSTEM SHALL read the first 2,000 and add a warning.

## Requirement 5: masking before indexing

**User story:** As a compliance officer, I want card numbers and national IDs masked before indexing, so that they never appear in answers or in the Crypt.

#### Acceptance criteria

1. WHEN text contains a 13 to 19 digit sequence (spaces or hyphens allowed between digits) that passes the Luhn check THE SYSTEM SHALL replace it with `[card ending NNNN]`.
2. WHEN text contains a Singapore NRIC or FIN pattern (`S`, `T`, `F`, `G` or `M`, seven digits, one letter) THE SYSTEM SHALL replace it with `[ID masked]`.
3. WHEN a digit sequence fails the Luhn check THE SYSTEM SHALL leave it unchanged.

## Requirement 6: stitch in your own files

**User story:** As a judge or evaluator, I want to drop in my own files, so that I can test the answer layer on data I recognise.

#### Acceptance criteria

1. WHEN a user selects up to 5 files of at most 512 KB each with extension `.md`, `.markdown`, `.txt`, `.csv` or `.json` THE SYSTEM SHALL detect the kind, parse it with the matching adapter and add the passages to the session corpus.
2. IF a file is larger than 512 KB, has another extension, or more than 5 files are selected THEN THE SYSTEM SHALL reject the file with a visible reason and add nothing from it.
3. IF a `.json` file matches none of the ticket, chat, Jira search or Slack shapes THEN THE SYSTEM SHALL reject it with the reason "unrecognised JSON shape".
4. WHEN a file is stitched in THE SYSTEM SHALL append a `source.stitched` entry to the Crypt with the file name, kind and passage count.

## Requirement 7: the formats real tools document

**User story:** As a judge or evaluator, I want to drop in a real export from my own tools, so that a real file is read correctly or refused, and never read wrongly in silence.

Added 6 Nov 2026 after an audit: an issue from a real Jira search result was accepted with blank text and with its security level ignored.

#### Acceptance criteria

1. WHEN a `.json` file is a Jira Cloud search result (`issues[].fields`) THE SYSTEM SHALL read the summary, status name, description (Atlassian Document Format or plain string), updated date and project key.
2. WHEN a Jira issue has a `fields.security` level THE SYSTEM SHALL use the level name as the only group, or a group nobody holds if it has no name.
3. WHEN a `.json` file is a Slack export array or a successful `conversations.history` response THE SYSTEM SHALL create one chat passage per message, take the channel from the file name, convert `ts` to a date and skip join and leave notices.
4. WHEN a Jira or Slack file is stitched in THE SYSTEM SHALL show a warning about the permissions that file does not carry.
5. IF an uploaded file declares a narrower audience (`private: true`, or wiki `groups` or `users` other than `everyone`) THEN THE SYSTEM SHALL refuse it with a visible reason.
6. WHEN wiki front matter uses a YAML block list THE SYSTEM SHALL read it as a list. IF `groups` or `users` is present but empty THEN THE SYSTEM SHALL allow nobody.
