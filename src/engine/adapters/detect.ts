import type { AdapterResult, SourceKind } from "../types";
import { isChatExport, parseChat } from "./chat";
import { isJiraSearch, isSlackMessages, JIRA_WARNING, jiraToExport, SLACK_WARNING, slackToExport } from "./documented";
import { parseSheet } from "./sheet";
import { isTicketExport, parseTickets } from "./tickets";
import { parseFrontMatter, parseWiki } from "./wiki";

export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_BYTES = 512 * 1024;
export const UPLOAD_EXTENSIONS = [".md", ".markdown", ".txt", ".csv", ".json"];

export interface UploadInput {
  name: string;
  size: number;
  text: string;
}

export type UploadResult =
  | { ok: true; name: string; kind: SourceKind; result: AdapterResult; passageCount: number }
  | { ok: false; name: string; reason: string };

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "upload";
}

const RESTRICTED_UPLOAD = "it declares restricted access, and uploads are visible to everyone in this session, so it was refused";

function declaresRestriction(raw: string): boolean {
  const { meta } = parseFrontMatter(raw);
  const names = [meta.groups, meta.users].flatMap((v) => (v === undefined ? [] : Array.isArray(v) ? v : v.split(",")));
  return names.some((n) => n.trim() !== "everyone") || (meta.groups !== undefined && names.length === 0);
}

/**
 * Uploaded files are visible to the `everyone` group (recorded assumption in
 * source-stitching/requirements.md), so a file that declares a narrower audience is refused rather
 * than silently widened. Jira issue security levels stay in force as groups.
 */
export function detectAndParse(file: UploadInput, today: string): UploadResult {
  const lower = file.name.toLowerCase();
  const ext = UPLOAD_EXTENSIONS.find((e) => lower.endsWith(e));
  if (!ext) return { ok: false, name: file.name, reason: `unsupported type; use ${UPLOAD_EXTENSIONS.join(", ")}` };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, name: file.name, reason: "larger than 512 KB" };
  const id = `upload:${slug(file.name)}`;
  let kind: SourceKind;
  let result: AdapterResult;
  if (ext === ".csv") {
    kind = "sheet";
    result = parseSheet(file.text, { id, title: file.name, updatedAt: today }, "Your upload");
  } else if (ext === ".json") {
    let data: unknown;
    try {
      data = JSON.parse(file.text);
    } catch {
      return { ok: false, name: file.name, reason: "not valid JSON" };
    }
    if (isJiraSearch(data)) {
      kind = "ticket";
      result = parseTickets({ ...jiraToExport(data, file.name), groups: ["everyone"] }, "Your upload");
      result.warnings.push(JIRA_WARNING);
    } else if (isTicketExport(data)) {
      kind = "ticket";
      result = parseTickets({ ...data, project: data.project ?? file.name, groups: ["everyone"] }, "Your upload");
    } else if (isChatExport(data)) {
      if (data.private) return { ok: false, name: file.name, reason: RESTRICTED_UPLOAD };
      kind = "chat";
      result = parseChat({ ...data, private: false, groups: ["everyone"] }, "Your upload");
    } else if (isSlackMessages(data)) {
      kind = "chat";
      result = parseChat({ ...slackToExport(data, file.name), groups: ["everyone"] }, "Your upload");
      result.warnings.push(SLACK_WARNING);
    } else return { ok: false, name: file.name, reason: "unrecognised JSON shape" };
  } else {
    if (declaresRestriction(file.text)) return { ok: false, name: file.name, reason: RESTRICTED_UPLOAD };
    kind = "wiki";
    result = parseWiki(file.text, file.name, "Your upload");
    // Uploaded pages are always everyone-visible, whatever their front matter says.
    result.documents.forEach((d) => {
      d.id = `${id}:${d.id}`;
      d.docKey = `${id}:${d.docKey}`;
      d.acl = { groups: ["everyone"], users: [] };
      if (d.updatedAt === "1970-01-01") d.updatedAt = today;
    });
  }
  if (kind === "ticket" || kind === "chat") {
    result.documents.forEach((d) => {
      d.id = `${id}:${d.id}`;
      d.docKey = `${id}:${d.docKey}`;
      if (d.updatedAt === "1970-01-01") d.updatedAt = today;
    });
  }
  const passageCount = result.documents.reduce((n, d) => n + d.passages.length, 0);
  if (!passageCount) return { ok: false, name: file.name, reason: "no readable content" };
  return { ok: true, name: file.name, kind, result, passageCount };
}

export function checkBatch(count: number): string | null {
  return count > MAX_UPLOAD_FILES ? `select at most ${MAX_UPLOAD_FILES} files at a time` : null;
}
