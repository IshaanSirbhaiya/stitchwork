import { parseChat } from "../../src/engine/adapters/chat";
import { checkBatch, detectAndParse, MAX_UPLOAD_BYTES } from "../../src/engine/adapters/detect";
import { MAX_SHEET_ROWS, parseCsv, parseSheet } from "../../src/engine/adapters/sheet";
import { parseTickets } from "../../src/engine/adapters/tickets";
import { MAX_PASSAGE_CHARS, parseWiki } from "../../src/engine/adapters/wiki";
import { loadDataset } from "../../src/data";

describe("wiki adapter (requirement 1)", () => {
  const md = `---
id: p1
title: Page One
space: OPS
groups: [staff, sales]
version: 3
updated: 2026-01-02
docKey: lineage-a
status: superseded
---
# Page One

Intro text.

## First
Alpha section.

## Second
Beta section.
`;

  test("1.1 reads front matter fields", () => {
    const [d] = parseWiki(md, "p1.md").documents;
    expect(d).toMatchObject({ id: "p1", title: "Page One", version: 3, updatedAt: "2026-01-02", docKey: "lineage-a", status: "superseded" });
    expect(d.acl).toEqual({ groups: ["staff", "sales"], users: [] });
  });

  test("1.2 one passage per heading section", () => {
    const [d] = parseWiki(md, "p1.md").documents;
    expect(d.passages.map((p) => p.location)).toEqual(["Overview", "First", "Second"]);
    expect(d.passages[1].text).toBe("Alpha section.");
  });

  test("1.3 splits long sections at paragraph boundaries within the limit", () => {
    const para = "word ".repeat(150).trim();
    const long = `## Long\n${[para, para, para, para].join("\n\n")}\n`;
    const [d] = parseWiki(long, "long.md").documents;
    expect(d.passages.length).toBeGreaterThan(1);
    d.passages.forEach((p) => expect(p.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS));
    expect(d.passages[0].location).toBe("Long (part 1)");
  });

  test("1.4 no front matter falls back to file name, version 1, everyone", () => {
    const [d] = parseWiki("Just text.", "notes.md").documents;
    expect(d).toMatchObject({ id: "notes", title: "notes", version: 1, acl: { groups: ["everyone"], users: [] } });
  });
});

describe("ticket adapter (requirement 2)", () => {
  const exp = {
    project: "X",
    groups: ["staff"],
    issues: [
      { key: "X-1", summary: "Open", status: "To Do", description: "Body." },
      { key: "X-2", summary: "Secret", status: "To Do", security: ["fincrime"] },
      { summary: "no key" },
    ],
  };

  test("2.1 one passage per issue with key, summary, status and description", () => {
    const { documents } = parseTickets(exp);
    expect(documents[0].passages[0].text).toBe("X-1: Open. Status: To Do. Body.");
  });

  test("2.2 security array overrides project groups", () => {
    const { documents } = parseTickets(exp);
    expect(documents[0].acl.groups).toEqual(["staff"]);
    expect(documents[1].acl.groups).toEqual(["fincrime"]);
  });

  test("2.3 issue without key is skipped with a warning", () => {
    const { documents, warnings } = parseTickets(exp);
    expect(documents).toHaveLength(2);
    expect(warnings[0]).toMatch(/no key/);
  });
});

describe("chat adapter (requirement 3)", () => {
  test("3.1 one passage per message located by channel and timestamp", () => {
    const { documents } = parseChat({ channel: "c", groups: ["staff"], messages: [{ ts: "t1", user: "u", text: "hello" }] });
    expect(documents[0].passages[0]).toEqual({ location: "#c @ t1", text: "u: hello" });
  });

  test("3.2 private channel restricts to members and no groups", () => {
    const { documents } = parseChat({ channel: "p", private: true, members: ["iris"], groups: ["staff"], messages: [{ ts: "t", text: "x" }] });
    expect(documents[0].acl).toEqual({ groups: [], users: ["iris"] });
  });

  test("3.3 public channel uses channel groups", () => {
    const { documents } = parseChat({ channel: "c", groups: ["sales"], messages: [{ ts: "t", text: "x" }] });
    expect(documents[0].acl).toEqual({ groups: ["sales"], users: [] });
  });
});

describe("spreadsheet adapter (requirement 4)", () => {
  test("4.1 one passage per data row as column: value pairs", () => {
    const [d] = parseSheet("a,b\n1,2\n", { id: "s", title: "S" }).documents;
    expect(d.passages).toEqual([{ location: "row 2", text: "a: 1; b: 2." }]);
  });

  test("4.2 commas inside quotes stay in the value, doubled quotes unescape", () => {
    expect(parseCsv('x,y\n"SGD 1,900","say ""hi"""\n')).toEqual([["x", "y"], ["SGD 1,900", 'say "hi"']]);
  });

  test("4.3 more than 2,000 rows are capped with a warning", () => {
    const csv = "n\n" + Array.from({ length: MAX_SHEET_ROWS + 5 }, (_, i) => String(i)).join("\n");
    const { documents, warnings } = parseSheet(csv, { id: "big", title: "Big" });
    expect(documents[0].passages).toHaveLength(MAX_SHEET_ROWS);
    expect(warnings[0]).toMatch(/only the first 2000/);
  });
});

describe("uploads (requirement 6)", () => {
  const today = "2026-11-04";

  test("6.1 detects markdown, csv, ticket json and chat json", () => {
    expect(detectAndParse({ name: "a.md", size: 10, text: "## H\nhello" }, today)).toMatchObject({ ok: true, kind: "wiki" });
    expect(detectAndParse({ name: "a.csv", size: 10, text: "a\n1\n" }, today)).toMatchObject({ ok: true, kind: "sheet" });
    expect(detectAndParse({ name: "t.json", size: 10, text: JSON.stringify({ project: "P", issues: [{ key: "P-1", summary: "s" }] }) }, today)).toMatchObject({ ok: true, kind: "ticket" });
    expect(detectAndParse({ name: "c.json", size: 10, text: JSON.stringify({ channel: "c", messages: [{ ts: "1", text: "hi" }] }) }, today)).toMatchObject({ ok: true, kind: "chat" });
  });

  test("6.1 uploads are visible to everyone, and a page that says otherwise is refused rather than widened", () => {
    const open = detectAndParse({ name: "x.md", size: 10, text: "---\ntitle: T\n---\nhello" }, today);
    expect(open.ok && open.result.documents[0].acl).toEqual({ groups: ["everyone"], users: [] });
    expect(detectAndParse({ name: "x.md", size: 10, text: "---\ngroups: [fincrime]\n---\nhello" }, today)).toMatchObject({ ok: false });
  });

  test("6.2 rejects oversize, wrong extension and too many files", () => {
    expect(detectAndParse({ name: "a.md", size: MAX_UPLOAD_BYTES + 1, text: "x" }, today)).toMatchObject({ ok: false, reason: "larger than 512 KB" });
    expect(detectAndParse({ name: "a.pdf", size: 10, text: "x" }, today)).toMatchObject({ ok: false });
    expect(checkBatch(6)).toMatch(/at most 5/);
    expect(checkBatch(5)).toBeNull();
  });

  test("6.3 unrecognised JSON shape is rejected with that reason", () => {
    expect(detectAndParse({ name: "a.json", size: 10, text: '{"foo":1}' }, today)).toEqual({ ok: false, name: "a.json", reason: "unrecognised JSON shape" });
  });
});

describe("bundled dataset", () => {
  test("parses with one expected warning and masks the test card and ID", () => {
    const { documents, warnings } = loadDataset();
    expect(warnings).toEqual(["CLM: issue at index 2 has no key and was skipped"]);
    const all = documents.flatMap((d) => d.passages.map((p) => p.text)).join("\n");
    expect(all).not.toContain("4111 1111 1111 1111");
    expect(all).not.toContain("S1234567D");
    expect(all).toContain("[card ending 1111]");
    expect(new Set(documents.map((d) => d.kind))).toEqual(new Set(["wiki", "ticket", "chat", "sheet"]));
  });
});
