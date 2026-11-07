import { maskSensitive } from "../mask";
import type { AdapterResult, SourceDocument } from "../types";

export interface TicketExport {
  project: string;
  groups?: string[];
  issues: {
    key?: string;
    summary?: string;
    status?: string;
    description?: string;
    updated?: string;
    security?: string[];
    users?: string[];
    docKey?: string;
    version?: number;
  }[];
}

export function isTicketExport(v: unknown): v is TicketExport {
  return typeof v === "object" && v !== null && Array.isArray((v as { issues?: unknown }).issues);
}

export function parseTickets(data: TicketExport, sourceName = "Hollowmere Tracker"): AdapterResult {
  const warnings: string[] = [];
  const documents: SourceDocument[] = [];
  const projectGroups = data.groups?.length ? data.groups : ["everyone"];
  data.issues.forEach((issue, i) => {
    if (!issue.key) {
      warnings.push(`${data.project}: issue at index ${i} has no key and was skipped`);
      return;
    }
    const text = maskSensitive(
      [`${issue.key}: ${issue.summary ?? "(no summary)"}.`, `Status: ${issue.status ?? "unknown"}.`, issue.description ?? ""]
        .join(" ")
        .trim(),
    );
    const securityGroups = issue.security?.length ? issue.security : undefined;
    documents.push({
      id: issue.key,
      kind: "ticket",
      title: `${issue.key} ${issue.summary ?? ""}`.trim(),
      sourceName,
      docKey: issue.docKey ?? issue.key,
      version: issue.version ?? 1,
      updatedAt: issue.updated ?? "1970-01-01",
      status: "active",
      acl: { groups: securityGroups ?? projectGroups, users: issue.users ?? [] },
      passages: [{ location: `${data.project} / ${issue.key}`, text }],
    });
  });
  return { documents, warnings };
}
