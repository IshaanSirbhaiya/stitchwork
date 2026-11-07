import { stem, tokenize, splitSentences } from "../../src/engine/tokenize";
import { rank } from "../../src/engine/retrieve";
import { toPassages } from "../../src/engine/corpus";
import { parseWiki } from "../../src/engine/adapters/wiki";

function passages(...bodies: string[]) {
  return bodies.flatMap((b, i) => toPassages(parseWiki(b, `d${i}.md`).documents[0]));
}

describe("tokenizer", () => {
  test("drops stop words and stems consistently", () => {
    expect(tokenize("How fast must we acknowledge the claims?")).toEqual(["acknowledge", "claim"]);
    expect(stem("cancelled")).toBe(stem("cancel"));
    expect(stem("policies")).toBe(stem("policy"));
  });

  test("splits sentences on terminal punctuation", () => {
    expect(splitSentences("One. Two! Three? four")).toEqual(["One.", "Two!", "Three? four"]);
  });
});

describe("rank (permission-gates requirement 4)", () => {
  test("4.1 higher term frequency ranks higher, ties broken by id", () => {
    const ps = passages("refund refund window", "refund window", "unrelated text here");
    const r = rank("refund window", ps);
    expect(r.map((s) => s.passage.docId)).toEqual(["d0", "d1"]);
  });

  test("4.2 a passage matching only a common word is not relevant", () => {
    const ps = passages("We work long hours on site.", "Working days are Monday to Friday.", "Staff may work remotely on Fridays.");
    const r = rank("Can I work remotely?", ps);
    expect(r.map((s) => s.passage.docId)).toEqual(["d2"]);
  });

  test("4.2 a passage with under half the query terms is not relevant", () => {
    const ps = passages("alpha only", "alpha beta gamma");
    expect(rank("alpha beta gamma delta", ps).map((s) => s.passage.docId)).toEqual(["d1"]);
  });
});
