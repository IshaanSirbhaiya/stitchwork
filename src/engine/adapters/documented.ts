// Readers for what real tools actually export, written from their public docs. They normalise into
// the adapters' own shapes, so permissions and masking stay in one place.
//   Jira Cloud REST v3 issue search: { issues: [{ key, fields: { summary, status: { name },
//     description (ADF document, or a plain string in v2), updated, security, project } }] }
//   Slack data export file: a JSON array of { type, user, text, ts }.
//   Slack conversations.history: { ok, messages: [...], has_more }.
// These are file readers. Stitchwork does not call any Jira or Slack API, and has not been run
// against a real Jira or Slack workspace: the tests use payloads hand-written from the docs.
import type { ChatExport } from "./chat";
import type { TicketExport } from "./tickets";

export const JIRA_WARNING = "Jira exports carry issue security levels but not project permissions: issues with no security level are visible to everyone in this session.";
export const SLACK_WARNING = "A Slack export file does not say whether its channel was private: its messages are visible to everyone in this session, so do not upload a private channel.";

interface JiraIssue {
  key?: string;
  fields?: {
    summary?: unknown;
    status?: { name?: unknown };
    description?: unknown;
    updated?: unknown;
    security?: { id?: unknown; name?: unknown } | null;
    project?: { key?: unknown };
  };
}

export interface JiraSearch {
  issues: JiraIssue[];
}

interface SlackMessage {
  type?: unknown;
  subtype?: unknown;
  user?: unknown;
  username?: unknown;
  bot_id?: unknown;
  text?: unknown;
  ts?: unknown;
}

const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function isJiraSearch(v: unknown): v is JiraSearch {
  return obj(v) && Array.isArray(v.issues) && v.issues.some((i) => obj(i) && obj(i.fields));
}

/** Atlassian Document Format to plain text: every text node, with blocks separated by a space. */
function adfText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!obj(node)) return "";
  if (typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(adfText).filter(Boolean).join(" ") : "";
}

/** Jira writes +0000; Date.parse and sorting want +00:00. Anything that is not a date is dropped. */
function jiraDate(v: unknown): string | undefined {
  const s = str(v)?.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  return s && !Number.isNaN(Date.parse(s)) ? s : undefined;
}

export function jiraToExport(data: JiraSearch, fileName: string): TicketExport {
  const project = data.issues.map((i) => str(i.fields?.project?.key)).find(Boolean) ?? fileName;
  return {
    project,
    issues: data.issues.map((i) => {
      const f = i.fields ?? {};
      // Any security level is a restriction. A level with no name still restricts (fail closed).
      const security = f.security ? [str(f.security.name) ?? `jira-security-${String(f.security.id ?? "unknown")}`] : undefined;
      return { key: i.key, summary: str(f.summary), status: str(f.status?.name), description: adfText(f.description), updated: jiraDate(f.updated), security };
    }),
  };
}

function looksLikeMessage(m: unknown): boolean {
  return obj(m) && typeof m.ts === "string" && (m.type === "message" || typeof m.text === "string");
}

/** A Slack export file (an array) or a successful conversations.history response. */
export function isSlackMessages(v: unknown): v is SlackMessage[] | { ok: true; messages: SlackMessage[] } {
  if (Array.isArray(v)) return v.length > 0 && v.every(looksLikeMessage);
  return obj(v) && v.ok === true && Array.isArray(v.messages);
}

/** Slack `ts` is Unix seconds with a fractional part, as a string. */
function slackDate(ts: unknown): string | undefined {
  const n = Number.parseFloat(String(ts));
  return Number.isFinite(n) ? new Date(n * 1000).toISOString() : undefined;
}

// Join and leave notices and the like are not things anyone said.
const SPEECH_SUBTYPES = new Set(["bot_message", "thread_broadcast", "file_share", "me_message"]);

export function slackToExport(data: SlackMessage[] | { messages: SlackMessage[] }, fileName: string): ChatExport {
  const list = Array.isArray(data) ? data : data.messages;
  return {
    channel: fileName.replace(/\.json$/i, ""),
    private: false,
    messages: list
      .filter((m) => m.subtype === undefined || SPEECH_SUBTYPES.has(String(m.subtype)))
      .map((m) => ({ ts: slackDate(m.ts), user: str(m.user) ?? str(m.username) ?? str(m.bot_id), text: str(m.text) })),
  };
}
