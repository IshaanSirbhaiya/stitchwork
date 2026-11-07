import { maskSensitive } from "../mask";
import type { AdapterResult, DocStatus, SourceDocument } from "../types";

export const MAX_PASSAGE_CHARS = 1200;

type FrontValue = string | string[];

export function parseFrontMatter(raw: string): { meta: Record<string, FrontValue>; body: string } {
  const text = raw.replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, FrontValue> = {};
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  let openList: string[] | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && openList) {
      // YAML block list: "groups:" followed by "  - name" lines.
      openList.push(unquote(item[1]));
      continue;
    }
    openList = null;
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const [, key, value] = kv;
    const list = /^\[(.*)\]$/.exec(value);
    if (value === "") meta[key] = openList = [];
    else meta[key] = list ? list[1].split(",").map(unquote).filter(Boolean) : unquote(value);
  }
  return { meta, body: text.slice(m[0].length) };
}

function asString(v: FrontValue | undefined, fallback: string): string {
  if (v === undefined) return fallback;
  return Array.isArray(v) ? v.join(", ") : v || fallback;
}

function asList(v: FrontValue | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : v.split(",").map((s) => s.trim()).filter(Boolean);
}

function chunk(text: string): string[] {
  const clean = text.trim();
  if (clean.length <= MAX_PASSAGE_CHARS) return clean ? [clean] : [];
  const out: string[] = [];
  let current = "";
  for (const para of clean.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length > MAX_PASSAGE_CHARS) {
      if (current) out.push(current);
      current = "";
      for (let i = 0; i < p.length; i += MAX_PASSAGE_CHARS) out.push(p.slice(i, i + MAX_PASSAGE_CHARS));
      continue;
    }
    if (current && current.length + 2 + p.length > MAX_PASSAGE_CHARS) {
      out.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) out.push(current);
  return out;
}

const STATUSES: DocStatus[] = ["active", "superseded", "archived"];

export function parseWiki(raw: string, fileName: string, sourceName = "Hollowmere Wiki"): AdapterResult {
  const warnings: string[] = [];
  const { meta, body } = parseFrontMatter(raw);
  const baseName = fileName.replace(/\.(md|markdown|txt)$/i, "");
  const id = asString(meta.id, baseName);
  const groups = asList(meta.groups);
  const users = asList(meta.users);
  const versionNum = Number.parseInt(asString(meta.version, "1"), 10);
  const statusRaw = asString(meta.status, "active") as DocStatus;
  if (meta.status !== undefined && !STATUSES.includes(statusRaw)) warnings.push(`${fileName}: unknown status "${statusRaw}", using active`);

  // Split into sections at level-2 headings. Text before the first heading is the "Overview".
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const sections: { heading: string; text: string[] }[] = [{ heading: "Overview", text: [] }];
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) sections.push({ heading: h[1], text: [] });
    else if (!/^#\s+/.test(line)) sections[sections.length - 1].text.push(line);
  }
  const passages: SourceDocument["passages"] = [];
  for (const s of sections) {
    const parts = chunk(maskSensitive(s.text.join("\n")));
    parts.forEach((text, i) => passages.push({ location: parts.length > 1 ? `${s.heading} (part ${i + 1})` : s.heading, text }));
  }

  const doc: SourceDocument = {
    id,
    kind: "wiki",
    title: asString(meta.title, baseName),
    sourceName,
    docKey: asString(meta.docKey, id),
    version: Number.isFinite(versionNum) && versionNum > 0 ? versionNum : 1,
    updatedAt: asString(meta.updated, "1970-01-01"),
    status: STATUSES.includes(statusRaw) ? statusRaw : "active",
    // No ACL keys at all means everyone. A key that is present but empty means nobody.
    acl: { groups: meta.groups === undefined && meta.users === undefined ? ["everyone"] : groups, users },
    passages,
  };
  return { documents: [doc], warnings };
}
