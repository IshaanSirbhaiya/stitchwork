import { loadDataset } from "../src/data";
import { personaById } from "../src/data/personas";
import { Engine } from "../src/engine/engine";
import { Ledger } from "../src/engine/ledger";
import type { LiveAcl } from "../src/engine/corpus";
import type { Persona, SourceDocument } from "../src/engine/types";

export const FIXED_NOW = new Date("2026-11-04T10:00:00Z");

export function makeEngine(documents: SourceDocument[] = loadDataset().documents, live?: LiveAcl) {
  let n = 0;
  const clock = () => FIXED_NOW;
  const ledger = new Ledger("test-ledger-key", clock);
  const engine = new Engine({ documents, ledger, clock, newId: () => `req-${++n}`, live });
  return { engine, ledger };
}

export function persona(id: string): Persona {
  const p = personaById(id);
  if (!p) throw new Error(`no persona ${id}`);
  return p;
}
