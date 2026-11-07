import { maskSensitive } from "../mask";
import type { AdapterResult, SourceDocument } from "../types";

export interface ChatExport {
  channel: string;
  private?: boolean;
  members?: string[];
  groups?: string[];
  messages: { ts?: string; user?: string; text?: string }[];
}

export function isChatExport(v: unknown): v is ChatExport {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { channel?: unknown }).channel === "string" &&
    Array.isArray((v as { messages?: unknown }).messages)
  );
}

/** One document per message, so each message carries its own timestamp as its version date. */
export function parseChat(data: ChatExport, sourceName = "Hollowmere Chat"): AdapterResult {
  const warnings: string[] = [];
  const documents: SourceDocument[] = [];
  const acl = data.private
    ? { groups: [] as string[], users: data.members ?? [] }
    : { groups: data.groups?.length ? data.groups : ["everyone"], users: [] as string[] };
  if (data.private && !(data.members ?? []).length) warnings.push(`#${data.channel}: private channel with no members; nobody can read it`);
  data.messages.forEach((m, i) => {
    if (!m.text?.trim()) {
      warnings.push(`#${data.channel}: message ${i} is empty and was skipped`);
      return;
    }
    const ts = m.ts ?? `message-${i}`;
    const id = `chat:${data.channel}:${ts}`;
    documents.push({
      id,
      kind: "chat",
      title: `#${data.channel}, ${m.user ?? "unknown"}`,
      sourceName,
      docKey: id,
      version: 1,
      updatedAt: m.ts ?? "1970-01-01",
      status: "active",
      acl: { groups: [...acl.groups], users: [...acl.users] },
      passages: [{ location: `#${data.channel} @ ${ts}`, text: maskSensitive(`${m.user ?? "unknown"}: ${m.text.trim()}`) }],
    });
  });
  return { documents, warnings };
}
