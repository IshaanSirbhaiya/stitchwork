// Adapters against the formats the real tools document. Every payload here is hand-written from the
// public docs (Jira Cloud REST v3 issue search, Slack data exports and conversations.history,
// RFC 4180, YAML front matter). Nothing is imported from src/data, tests/helpers or tests/walnut, so
// a misreading shared with the bundled synthetic exports cannot pass here.
import { detectAndParse } from "../../src/engine/adapters/detect";
import { parseCsv, parseSheet } from "../../src/engine/adapters/sheet";
import { parseWiki } from "../../src/engine/adapters/wiki";
import { toPassages } from "../../src/engine/corpus";
import { gate1 } from "../../src/engine/gates";
import type { Identity, SourceDocument } from "../../src/engine/types";

const TODAY = "2026-11-06";
const upload = (name: string, payload: unknown) => {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return detectAndParse({ name, size: text.length, text }, TODAY);
};
const docs = (r: ReturnType<typeof upload>): SourceDocument[] => {
  if (!r.ok) throw new Error(r.reason);
  return r.result.documents;
};

// GET /rest/api/3/search/jql, shape from the Atlassian reference. A v3 description is ADF.
const JIRA_SEARCH = {
  isLast: true,
  issues: [
    {
      expand: "",
      id: "10002",
      key: "ED-1",
      self: "https://your-domain.atlassian.net/rest/api/3/issue/10002",
      fields: {
        summary: "Main order flow broken",
        status: { iconUrl: "https://your-domain.atlassian.net/images/icons/statuses/open.png", name: "Open" },
        project: { id: "10000", key: "ED", name: "Example" },
        updated: "2021-01-18T23:45:00.000+0000",
        description: {
          type: "doc",
          version: 1,
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Orders fail at payment." }] },
            { type: "paragraph", content: [{ type: "text", text: "Rollback is in progress." }] },
          ],
        },
      },
    },
    {
      id: "10003",
      key: "ED-2",
      self: "https://your-domain.atlassian.net/rest/api/3/issue/10003",
      fields: {
        summary: "Quiet investigation",
        status: { name: "In Progress" },
        project: { id: "10000", key: "ED", name: "Example" },
        description: "Plain text description, as API v2 returns it.",
        security: { self: "https://your-domain.atlassian.net/rest/api/3/securitylevel/10001", id: "10001", name: "fincrime", description: "Financial crime team only" },
      },
    },
  ],
};

describe("Jira Cloud search results", () => {
  test("summary, status and an ADF description reach the passage text", () => {
    const [d] = docs(upload("jira.json", JIRA_SEARCH));
    expect(d.kind).toBe("ticket");
    expect(d.passages[0].text).toContain("ED-1: Main order flow broken.");
    expect(d.passages[0].text).toContain("Status: Open.");
    expect(d.passages[0].text).toContain("Orders fail at payment.");
    expect(d.passages[0].text).toContain("Rollback is in progress.");
    expect(d.passages[0].location).toContain("ED / ED-1");
    expect(Number.isNaN(Date.parse(d.updatedAt))).toBe(false);
    expect(d.updatedAt.startsWith("2021-01-18")).toBe(true);
  });

  test("an issue security level stays a restriction: the level name becomes the only group", () => {
    const [, secured] = docs(upload("jira.json", JIRA_SEARCH));
    expect(secured.passages[0].text).toContain("Plain text description");
    expect(secured.acl).toEqual({ groups: ["fincrime"], users: [] });
    const outsider = { userId: "x", groups: ["everyone", "staff"] } as Identity;
    expect(gate1(toPassages(secured), outsider).allowed).toEqual([]);
  });

  test("a security level with no name fails closed, never open", () => {
    const [d] = docs(upload("jira.json", { issues: [{ key: "ED-3", fields: { summary: "s", security: { id: "10009" } } }] }));
    expect(d.acl.groups).not.toContain("everyone");
    expect(d.acl.groups).toHaveLength(1);
  });

  test("a non-string updated value, as in Atlassian's own sample, does not break the date", () => {
    const [d] = docs(upload("jira.json", { issues: [{ key: "ED-4", fields: { summary: "s", updated: 1 } }] }));
    expect(d.updatedAt).toBe(TODAY);
  });

  test("the upload warns that a Jira export does not carry project permissions", () => {
    const r = upload("jira.json", JIRA_SEARCH);
    expect(r.ok && r.result.warnings.join(" ")).toMatch(/project permissions/);
  });
});

describe("Slack exports", () => {
  // One file from a Slack data export: a JSON array of messages.
  const DAY = [
    { type: "message", user: "U2147483697", text: "Hello world", ts: "1355517523.000005" },
    { type: "message", subtype: "channel_join", user: "U1", text: "<@U1> has joined the channel", ts: "1355517524.000000" },
    { type: "message", user: "U2", text: "", ts: "1355517525.000000" },
  ];

  test("an export file becomes one passage per real message, with a real date", () => {
    const documents = docs(upload("claims-floor.json", DAY));
    expect(documents).toHaveLength(1);
    const [d] = documents;
    expect(d.kind).toBe("chat");
    expect(d.passages[0].text).toBe("U2147483697: Hello world");
    expect(d.passages[0].location).toContain("#claims-floor");
    expect(d.updatedAt.startsWith("2012-12-14")).toBe(true);
  });

  test("the upload warns that a Slack file does not say whether its channel was private", () => {
    const r = upload("claims-floor.json", DAY);
    expect(r.ok && r.result.warnings.join(" ")).toMatch(/private/);
  });

  test("a conversations.history response is read the same way", () => {
    const [d] = docs(upload("general.json", { ok: true, messages: [{ type: "message", user: "U123ABC456", text: "The rollout starts on Monday.", ts: "1512085950.000216" }], has_more: true, pin_count: 0 }));
    expect(d.passages[0].text).toBe("U123ABC456: The rollout starts on Monday.");
    expect(d.updatedAt.startsWith("2017-11-30")).toBe(true);
  });

  test("an error response from the Slack API is refused, not stored", () => {
    expect(upload("general.json", { ok: false, error: "channel_not_found" })).toMatchObject({ ok: false });
  });

  test("an array that is not messages is refused", () => {
    expect(upload("x.json", [{ name: "not a message" }])).toMatchObject({ ok: false });
  });
});

describe("uploads never silently widen access", () => {
  test("a chat export marked private is refused", () => {
    expect(upload("room.json", { channel: "room", private: true, members: ["iris"], messages: [{ ts: "t", text: "secret" }] })).toMatchObject({ ok: false, reason: expect.stringMatching(/restricted/) });
  });

  test("a wiki page that declares restricted groups or users is refused", () => {
    for (const fm of ["groups: [fincrime]", "groups:\n  - fincrime", "users: [iris]"]) {
      expect(upload("x.md", `---\n${fm}\n---\nhello`)).toMatchObject({ ok: false, reason: expect.stringMatching(/restricted/) });
    }
  });

  test("a wiki page open to everyone is still accepted", () => {
    expect(upload("x.md", "---\ngroups: [everyone]\n---\nhello")).toMatchObject({ ok: true });
    expect(upload("x.md", "hello")).toMatchObject({ ok: true });
  });
});

describe("wiki front matter as YAML writes it", () => {
  test("block lists are read as lists", () => {
    const [d] = parseWiki("---\nid: p\ntitle: P\ngroups:\n  - fincrime\n  - 'compliance'\nusers:\n- iris\n---\n# P\n\nSecret.\n", "p.md").documents;
    expect(d.acl).toEqual({ groups: ["fincrime", "compliance"], users: ["iris"] });
  });

  test("a key that is present but empty means nobody, not everyone", () => {
    for (const fm of ["groups: []", "groups:"]) {
      expect(parseWiki(`---\nid: p\n${fm}\n---\nSecret.\n`, "p.md").documents[0].acl).toEqual({ groups: [], users: [] });
    }
  });

  test("CRLF line endings, as a Windows editor saves them", () => {
    const [d] = parseWiki("---\r\nid: p\r\ngroups:\r\n  - hr\r\n---\r\nSecret.\r\n", "p.md").documents;
    expect(d.acl.groups).toEqual(["hr"]);
  });
});

describe("spreadsheets as RFC 4180 says", () => {
  test("quoted commas, doubled quotes, CRLF, embedded newlines and a byte order mark", () => {
    const csv = '﻿name,note\r\n"Doe, Jane","said ""hello"""\r\n"multi\nline",plain\r\n';
    expect(parseCsv(csv)).toEqual([["name", "note"], ["Doe, Jane", 'said "hello"'], ["multi\nline", "plain"]]);
  });

  test("a final record with no line break is kept", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("each record becomes a located passage", () => {
    const { documents } = parseSheet("product,rate\nHome,1.8%\n", { id: "s", title: "S" });
    expect(documents[0].passages[0]).toEqual({ location: "row 2", text: "product: Home; rate: 1.8%." });
  });
});
