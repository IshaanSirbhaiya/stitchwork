// The .kiro folder against Kiro's published schema. The allowed names below are typed in by hand from
// the docs, not read from any file in this repo:
//   kiro.dev/docs/ide/whats-new-v1/hooks/ (trigger table and fields, updated 21 Aug 2026)
//   kiro.dev/docs/hooks/ (timeout, enabled, description)
//   kiro.dev/docs/steering/ (front matter, inclusion modes, fileMatchPattern)
// This proves the files match the documents. It does NOT prove Kiro accepts or runs them: nothing here
// has been loaded by Kiro yet (KIRO_USAGE.md).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const KIRO = join(ROOT, ".kiro");
const TRIGGERS = ["SessionStart", "Stop", "UserPromptSubmit", "PreTaskExec", "PostTaskExec", "PreToolUse", "PostToolUse", "PostFileCreate", "PostFileSave", "PostFileDelete"];
const MATCHER_TRIGGERS = ["PostFileCreate", "PostFileSave", "PostFileDelete", "PreToolUse", "PostToolUse", "UserPromptSubmit"];
const HOOK_FIELDS = ["name", "description", "trigger", "matcher", "action", "timeout", "enabled", "confirm"];
const INCLUSION = ["always", "fileMatch", "manual", "auto"];

interface Hook {
  name: string;
  trigger: string;
  matcher?: string;
  action: { type: string; command?: string; prompt?: string };
}

const hookFiles = readdirSync(join(KIRO, "hooks")).filter((f) => f.endsWith(".json"));
const hookDocs = hookFiles.map((f) => [f, JSON.parse(readFileSync(join(KIRO, "hooks", f), "utf8"))] as [string, { version: string; hooks: Hook[] }]);
const hooks: [string, Hook][] = hookDocs.flatMap(([f, d]) => d.hooks.map((h): [string, Hook] => [f, h]));
const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".git", "dist", "var", "__pycache__"].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).replace(/\\/g, "/"));
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0001/g, "(?:.*/)?");
  return new RegExp(`^${esc}$`);
}

describe(".kiro/hooks against the v1 schema", () => {
  test("every file is version v1 with a hooks array", () => {
    expect(hookDocs.length).toBeGreaterThan(0);
    for (const [f, d] of hookDocs) {
      expect(d.version, f).toBe("v1");
      expect(Array.isArray(d.hooks), f).toBe(true);
    }
  });

  test("every hook uses a documented trigger and only documented fields", () => {
    for (const [f, h] of hooks) {
      expect(TRIGGERS, `${f}: ${h.trigger}`).toContain(h.trigger);
      expect(typeof h.name).toBe("string");
      for (const k of Object.keys(h)) expect(HOOK_FIELDS, `${f}: ${k}`).toContain(k);
      expect(["command", "agent"]).toContain(h.action.type);
      expect(h.action.type === "command" ? h.action.command : h.action.prompt, f).toBeTruthy();
    }
  });

  test("hook names are unique", () => {
    const names = hooks.map(([, h]) => h.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("a matcher is a valid regex and appears only where the docs give it a subject", () => {
    for (const [f, h] of hooks) {
      if (h.matcher === undefined) continue;
      expect(() => new RegExp(h.matcher!), f).not.toThrow();
      expect(MATCHER_TRIGGERS, f).toContain(h.trigger);
    }
  });

  test("file matchers fire on the paths they are meant for, with either slash", () => {
    const matcher = (file: string) => new RegExp(hooks.find(([f]) => f === file)![1].matcher!);
    expect(matcher("run-engine-tests.json").test("src/engine/gates.ts")).toBe(true);
    expect(matcher("run-engine-tests.json").test("server\\handler.ts")).toBe(true);
    expect(matcher("walnut-stitches-tests.json").test("stitch_walnut/server.py")).toBe(true);
    expect(matcher("walnut-stitches-tests.json").test("vendor\\walnut\\packages\\core\\databridge_core\\clock.py")).toBe(true);
    expect(matcher("spec-drift-review.json").test(".kiro/specs/ghost-versions/requirements.md")).toBe(true);
    expect(matcher("dash-check.json").test("README.md")).toBe(true);
  });

  test("command hooks avoid shell operators (Kiro may run them in PowerShell 5.1) and name real scripts", () => {
    for (const [f, h] of hooks) {
      if (h.action.type !== "command") continue;
      expect(h.action.command, f).not.toMatch(/&&|\|\|/);
      const m = /^npm run ([\w:-]+)/.exec(h.action.command!);
      if (m) expect(scripts, `${f}: ${m[1]}`).toHaveProperty(m[1]);
      const n = /^node (\S+)/.exec(h.action.command!);
      if (n) expect(existsSync(join(ROOT, n[1])), f).toBe(true);
    }
  });

  test("the agent prompts do not state a stale number of invariants", () => {
    for (const [f, h] of hooks) if (h.action.prompt) expect(h.action.prompt, f).not.toMatch(/\b(seven|eight|nine|ten)\s+invariants/i);
  });
});

describe(".kiro/steering against the docs", () => {
  const files = readdirSync(join(KIRO, "steering"));

  test("files sit directly in the folder, and front matter starts at byte zero", () => {
    for (const f of files) {
      expect(statSync(join(KIRO, "steering", f)).isFile(), f).toBe(true);
      expect(f.endsWith(".md"), f).toBe(true);
      expect(readFileSync(join(KIRO, "steering", f), "utf8"), f).toMatch(/^---\r?\n/);
    }
  });

  test("inclusion modes are documented, and each fileMatch glob matches a real file", () => {
    const tracked = walk(ROOT);
    for (const f of files) {
      const text = readFileSync(join(KIRO, "steering", f), "utf8");
      const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)![1];
      const inclusion = /^inclusion:\s*(\S+)/m.exec(front)![1];
      expect(INCLUSION, f).toContain(inclusion);
      if (inclusion !== "fileMatch") continue;
      const globs = JSON.parse(/^fileMatchPattern:\s*(\[.*\])/m.exec(front)![1]) as string[];
      for (const g of globs) {
        const re = globToRegExp(g);
        expect(tracked.filter((p) => re.test(p)).length, `${f}: ${g} matches nothing`).toBeGreaterThan(0);
      }
    }
  });
});

describe(".kiro/specs and the repository", () => {
  const specs = readdirSync(join(KIRO, "specs"));

  test("each spec has the documented files", () => {
    for (const s of specs) {
      for (const f of ["design.md", "tasks.md"]) expect(existsSync(join(KIRO, "specs", s, f)), `${s}/${f}`).toBe(true);
      expect(existsSync(join(KIRO, "specs", s, "requirements.md")) || existsSync(join(KIRO, "specs", s, "bugfix.md")), s).toBe(true);
    }
  });

  test("requirements use EARS wording", () => {
    for (const s of specs) {
      const p = join(KIRO, "specs", s, "requirements.md");
      if (existsSync(p)) expect(readFileSync(p, "utf8"), s).toMatch(/WHEN .* THE SYSTEM SHALL/);
    }
  });

  test("a hand-written spec says so, so nobody takes its ticks for Kiro task runs", () => {
    for (const s of specs) {
      const text = readFileSync(join(KIRO, "specs", s, "tasks.md"), "utf8");
      // Kiro-generated specs get a new folder; the note stays until someone really reruns the spec.
      if (!s.endsWith("-kiro")) expect(text, s).toMatch(/hand-written, outside Kiro/i);
    }
  });

  test(".kiro is at the root and not ignored, as the rules require", () => {
    expect(existsSync(KIRO)).toBe(true);
    expect(readFileSync(join(ROOT, ".gitignore"), "utf8")).not.toMatch(/\.kiro/);
  });

  test("an open source licence is at the root", () => {
    expect(readFileSync(join(ROOT, "LICENSE"), "utf8")).toMatch(/MIT License/);
  });
});
