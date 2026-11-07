import { maskSensitive } from "../mask";
import type { AdapterResult, SourceDocument } from "../types";

export const MAX_SHEET_ROWS = 2000;

/** RFC 4180 style CSV parser: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export interface SheetMeta {
  id: string;
  title: string;
  groups?: string[];
  users?: string[];
  docKey?: string;
  version?: number;
  updatedAt?: string;
  status?: SourceDocument["status"];
}

export function parseSheet(csv: string, meta: SheetMeta, sourceName = "Hollowmere Sheets"): AdapterResult {
  const warnings: string[] = [];
  const rows = parseCsv(csv);
  const [header, ...data] = rows;
  if (!header) return { documents: [], warnings: [`${meta.title}: empty sheet`] };
  if (data.length > MAX_SHEET_ROWS) warnings.push(`${meta.title}: ${data.length} rows found, only the first ${MAX_SHEET_ROWS} were read`);
  const passages = data.slice(0, MAX_SHEET_ROWS).map((r, i) => ({
    location: `row ${i + 2}`,
    text: maskSensitive(header.map((h, j) => `${h.trim()}: ${(r[j] ?? "").trim()}`).join("; ") + "."),
  }));
  const doc: SourceDocument = {
    id: meta.id,
    kind: "sheet",
    title: meta.title,
    sourceName,
    docKey: meta.docKey ?? meta.id,
    version: meta.version ?? 1,
    updatedAt: meta.updatedAt ?? "1970-01-01",
    status: meta.status ?? "active",
    acl: { groups: meta.groups?.length || meta.users?.length ? (meta.groups ?? []) : ["everyone"], users: meta.users ?? [] },
    passages,
  };
  return { documents: [doc], warnings };
}
