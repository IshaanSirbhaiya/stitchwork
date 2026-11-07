import { parseChat } from "../engine/adapters/chat";
import { parseSheet } from "../engine/adapters/sheet";
import { parseTickets } from "../engine/adapters/tickets";
import { parseWiki } from "../engine/adapters/wiki";
import type { AdapterResult, SourceDocument } from "../engine/types";
import { CHAT_EXPORTS } from "./chat";
import { SHEETS } from "./sheets";
import { TICKET_EXPORTS } from "./tickets";
import { WIKI_PAGES } from "./wiki";

export interface Dataset {
  documents: SourceDocument[];
  warnings: string[];
}

/** Parse the bundled synthetic dataset through the same adapters an upload uses. */
export function loadDataset(): Dataset {
  const results: AdapterResult[] = [
    ...WIKI_PAGES.map(([name, md]) => parseWiki(md, name)),
    ...TICKET_EXPORTS.map((t) => parseTickets(t)),
    ...CHAT_EXPORTS.map((c) => parseChat(c)),
    ...SHEETS.map(([meta, csv]) => parseSheet(csv, meta)),
  ];
  return {
    documents: results.flatMap((r) => r.documents),
    warnings: results.flatMap((r) => r.warnings),
  };
}
